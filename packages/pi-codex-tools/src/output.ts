/* eslint-disable no-await-in-loop -- Spill writes, partial reads, and producer pressure require ordered I/O. */
import { mkdtemp, open, rm, type FileHandle } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const memoryLimit = 64 * 1024;
const batchLimit = 256 * 1024;
const queueLimit = 1024 * 1024;
const unreadLimit = 64 * 1024 * 1024;

export type OutputCursor = Readonly<{
  bytes: number;
  lines: number;
  lastByte: number | undefined;
}>;

type Chunk = { data: Buffer; start: number; end: number };

function result(
  bytes: number,
  lines: number,
  lastByte: number | undefined,
  maxTokens: number,
  head: Buffer,
  tail: Buffer,
) {
  const original_token_count = Math.ceil(bytes / 4);
  if (original_token_count <= maxTokens)
    return { original_token_count, output: head.toString("utf8") };
  const leading = new TextDecoder().decode(head.subarray(0, maxTokens * 2), {
    stream: true,
  });
  let start = 0;
  while (start < tail.length && (tail[start]! & 0xc0) === 0x80) start++;
  return {
    original_token_count,
    output: `Warning: truncated output (original token count: ${original_token_count})\nTotal output lines: ${lines + (lastByte === 10 ? 0 : 1)}\n\n${leading}…${original_token_count - maxTokens} tokens truncated…${tail.subarray(start).toString("utf8")}`,
  };
}

export class OutputStore {
  private bytes = 0;
  private lines = 0;
  private lastByte: number | undefined;
  private floor = 0;
  private memory: Buffer | undefined;
  private memoryBytes = 0;
  private spilled = false;
  private readonly queue: Chunk[] = [];
  private current: Chunk | undefined;
  private written = 0;
  private directory: string | undefined;
  private file: FileHandle | undefined;
  private scheduled: NodeJS.Immediate | undefined;
  private writing: Promise<void> | undefined;
  private progress = Promise.withResolvers<void>();
  private pressure: PromiseWithResolvers<void> | undefined;
  private error: Error | undefined;
  private closed = false;
  private closing: Promise<void> | undefined;

  constructor(private readonly onError: (error: Error) => void) {}

  snapshot(): OutputCursor {
    return {
      bytes: this.bytes,
      lines: this.lines,
      lastByte: this.lastByte,
    };
  }

  append(value: Buffer | string): void | Promise<void> {
    if (this.closed) throw new Error("Output store is closed");
    if (this.error) throw this.error;
    const chunk = typeof value === "string" ? Buffer.from(value) : value;
    if (!chunk.length) return;
    if (!Number.isSafeInteger(this.bytes + chunk.length))
      throw new Error("Output byte counter exhausted");
    if (this.bytes - this.floor + chunk.length > unreadLimit)
      throw new Error(`Unread output exceeds ${unreadLimit} bytes`);

    if (!this.spilled && this.memoryBytes + chunk.length <= memoryLimit) {
      this.memory ??= Buffer.allocUnsafe(memoryLimit);
      chunk.copy(this.memory, this.memoryBytes);
      this.memoryBytes += chunk.length;
    } else {
      const free = this.spilled
        ? this.current
          ? memoryLimit - this.current.end
          : 0
        : memoryLimit - this.memoryBytes;
      const existing = this.spilled ? this.queue.length : 1;
      if (
        (existing + Math.ceil(Math.max(0, chunk.length - free) / memoryLimit)) * memoryLimit >
        queueLimit
      )
        throw new Error(`Output write queue exceeds ${queueLimit} bytes`);
      if (!this.spilled) {
        this.spilled = true;
        this.written = this.floor;
        this.current = {
          data: this.memory ?? Buffer.allocUnsafe(memoryLimit),
          start: 0,
          end: this.memoryBytes,
        };
        this.queue.push(this.current);
        this.memory = undefined;
        this.memoryBytes = 0;
      }
      let offset = 0;
      while (offset < chunk.length) {
        if (!this.current || this.current.end === memoryLimit) {
          this.current = {
            data: Buffer.allocUnsafe(memoryLimit),
            start: 0,
            end: 0,
          };
          this.queue.push(this.current);
        }
        const count = Math.min(chunk.length - offset, memoryLimit - this.current.end);
        chunk.copy(this.current.data, this.current.end, offset, offset + count);
        this.current.end += count;
        offset += count;
      }
      if (!this.writing && !this.scheduled)
        this.scheduled = setImmediate(() => {
          this.scheduled = undefined;
          this.pump();
        });
    }
    this.bytes += chunk.length;
    for (let at = chunk.indexOf(10); at !== -1; at = chunk.indexOf(10, at + 1)) this.lines++;
    this.lastByte = chunk.at(-1);
    if (this.queue.length * memoryLimit >= batchLimit) {
      this.pressure ??= Promise.withResolvers<void>();
      return this.pressure.promise;
    }
  }

  async read(from: OutputCursor, through: OutputCursor, maxTokens: number) {
    await this.ready(through.bytes);
    const bytes = through.bytes - from.bytes;
    const truncated = bytes > maxTokens * 4;
    const [head, tail] = await Promise.all([
      this.readRange(from.bytes, truncated ? from.bytes + maxTokens * 2 : through.bytes),
      truncated
        ? this.readRange(through.bytes - maxTokens * 2, through.bytes)
        : Promise.resolve(Buffer.alloc(0)),
    ]);
    return result(bytes, through.lines - from.lines, through.lastByte, maxTokens, head, tail);
  }

  async readRange(fromByte: number, throughByte: number): Promise<Buffer> {
    if (fromByte < this.floor || throughByte > this.bytes || throughByte < fromByte)
      throw new Error("Output range is no longer available");
    await this.ready(throughByte);
    if (!this.spilled)
      return this.memory
        ? Buffer.from(this.memory.subarray(fromByte - this.floor, throughByte - this.floor))
        : Buffer.alloc(0);
    const data = Buffer.allocUnsafe(throughByte - fromByte);
    let position = fromByte;
    while (position < Math.min(throughByte, this.written)) {
      const count = Math.min(
        throughByte - position,
        this.written - position,
        unreadLimit - (position % unreadLimit),
      );
      const { bytesRead } = await this.file!.read(
        data,
        position - fromByte,
        count,
        position % unreadLimit,
      );
      if (!bytesRead) throw new Error("Output spill read made no progress");
      position += bytesRead;
    }
    // A failed spill retains accepted queued bytes for the terminal error result.
    let queuedAt = this.written;
    for (const chunk of this.queue) {
      const end = queuedAt + chunk.end - chunk.start;
      if (position < throughByte && end > position) {
        const count = Math.min(throughByte, end) - position;
        chunk.data.copy(
          data,
          position - fromByte,
          chunk.start + position - queuedAt,
          chunk.start + position - queuedAt + count,
        );
        position += count;
      }
      queuedAt = end;
    }
    if (position !== throughByte) throw new Error("Output range could not be collected");
    return data;
  }

  discardThrough(cursor: OutputCursor): void {
    if (cursor.bytes < this.floor || cursor.bytes > this.bytes)
      throw new Error("Output cutoff is no longer available");
    if (!this.spilled && this.memory) {
      const count = cursor.bytes - this.floor;
      this.memory.copyWithin(0, count, this.memoryBytes);
      this.memoryBytes -= count;
    }
    this.floor = cursor.bytes;
  }

  close(): Promise<void> {
    this.closing ??= (async () => {
      this.closed = true;
      clearImmediate(this.scheduled);
      await this.writing;
      try {
        await this.file?.close();
      } finally {
        try {
          if (this.directory) await rm(this.directory, { recursive: true, force: true });
        } finally {
          this.queue.length = 0;
          this.current = undefined;
          this.memory = undefined;
          this.pressure?.resolve();
          this.progress.resolve();
        }
      }
    })();
    return this.closing;
  }

  private async ready(through: number): Promise<void> {
    while (this.spilled && this.written < through && !this.error) {
      if (this.closed) throw new Error("Output store is closed");
      const progress = this.progress.promise;
      this.pump();
      await progress;
    }
  }

  private pump(): void {
    if (this.writing || this.closed || this.error || !this.queue.length) return;
    clearImmediate(this.scheduled);
    this.scheduled = undefined;
    this.writing = this.flush()
      .catch((error: unknown) => {
        this.error = error instanceof Error ? error : new Error(String(error));
        this.onError(this.error);
      })
      .finally(() => {
        this.writing = undefined;
        this.pressure?.resolve();
        this.pressure = undefined;
        this.progress.resolve();
        this.progress = Promise.withResolvers<void>();
        this.pump();
      });
  }

  private async flush(): Promise<void> {
    if (!this.file) {
      this.directory = await mkdtemp(join(tmpdir(), "core-tools-output-"));
      this.file = await open(join(this.directory, "output"), "w+", 0o600);
    }
    while (this.queue.length && !this.closed) {
      const buffers: Buffer[] = [];
      let remaining = Math.min(batchLimit, unreadLimit - (this.written % unreadLimit));
      for (const chunk of this.queue) {
        const count = Math.min(remaining, chunk.end - chunk.start);
        buffers.push(chunk.data.subarray(chunk.start, chunk.start + count));
        if (chunk === this.current) this.current = undefined;
        remaining -= count;
        if (!remaining) break;
      }
      const { bytesWritten } = await this.file.writev(buffers, this.written % unreadLimit);
      if (!bytesWritten) throw new Error("Output spill write made no progress");
      let consumed = bytesWritten;
      while (consumed) {
        const chunk = this.queue[0]!;
        const count = Math.min(consumed, chunk.end - chunk.start);
        chunk.start += count;
        consumed -= count;
        if (chunk.start === chunk.end) this.queue.shift();
      }
      this.written += bytesWritten;
      if (this.queue.length <= 1) {
        this.pressure?.resolve();
        this.pressure = undefined;
      }
      this.progress.resolve();
      this.progress = Promise.withResolvers<void>();
    }
  }
}
