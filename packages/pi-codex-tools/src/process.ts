import { spawn } from "node:child_process";
import { randomBytes, randomInt } from "node:crypto";
import { getSystemErrorMessage } from "node:util";
import * as pty from "node-pty";
import { boundedPreview } from "./presentation.ts";
import { OutputStore, type OutputCursor } from "./output.ts";

export type ProcessPresentation = {
  id: number;
  output: string;
  status: "running" | "completed" | "failed";
  exitCode?: number;
  submitted?: string[];
};

type Process = {
  id: number;
  replacePresentation: (text: string) => void;
  observe: Set<(snapshot: ProcessPresentation) => void>;
  presentation: ProcessPresentation;
  inputBuffer: string;
  inputOverflow: number;
  pid?: number;
  output: OutputStore;
  cursor: OutputCursor;
  done: Promise<void>;
  collected: Promise<unknown>;
  exitCode?: number;
  error?: Error;
  write?: (chars: string) => void;
  resume?: () => void;
  release?: () => void;
  stopped?: boolean;
};

type CommandOptions = {
  shell: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  tty: boolean;
};

function launchError(error: Error): Error {
  const errno = (error as NodeJS.ErrnoException).errno;
  if (errno === undefined) return error;
  const message = getSystemErrorMessage(errno);
  const reason = `Failed to create unified exec process: ${message[0]!.toUpperCase()}${message.slice(1)} (os error ${Math.abs(errno)})`;
  return new Error(
    `exec_command failed: CreateProcess { message: ${JSON.stringify(`Rejected(${JSON.stringify(reason)})`)} }`,
    { cause: error },
  );
}

export class ProcessSessions {
  private readonly processes = new Map<number, Process>();
  private nextId = randomInt(1, 2 ** 30);

  async start(
    options: CommandOptions,
    yieldTime: number,
    maxTokens: number,
    signal: AbortSignal,
    onUpdate?: (snapshot: ProcessPresentation) => void,
  ) {
    signal.throwIfAborted();
    if (this.processes.size >= 32)
      throw new Error("Process session limit reached (32 retained handles)");
    if (this.nextId > 2147483647) throw new Error("Process identifier range exhausted");
    const fail = (error: unknown) => {
      child.error ??= error instanceof Error ? error : new Error(String(error));
      this.sendSignal(child);
    };
    const output = new OutputStore(fail);
    const { promise: done, resolve } = Promise.withResolvers<void>();
    const child: Process = {
      id: this.nextId++,
      replacePresentation(text) {
        head = "";
        headBytes = 0;
        headFull = false;
        tail = "";
        omitted = false;
        const continuation = control;
        control = "";
        remember(text);
        control = continuation;
      },
      observe: new Set(),
      presentation: { id: this.nextId - 1, output: "", status: "running" },
      inputBuffer: "",
      inputOverflow: 0,
      output,
      cursor: output.snapshot(),
      done,
      collected: Promise.resolve(),
    };
    let head = "";
    let headBytes = 0;
    let headFull = false;
    const segmenter = new Intl.Segmenter();
    let tail = "";
    let omitted = false;
    let control: "" | "escape" | "csi" | "string" | "string-escape" = "";
    const plainOutput = (data: string) => {
      // eslint-disable-next-line no-control-regex -- Terminal controls may span output events.
      if (!control && !/[\x1b\x90\x98\x9b\x9d-\x9f]/.test(data)) return data;
      let plain = "";
      let from = 0;
      // Keep only parser state between events; an unfinished control string can be arbitrarily long.
      for (let index = 0; index < data.length; index++) {
        const code = data.charCodeAt(index);
        if (!control) {
          if (code === 0x1b) control = "escape";
          else if (code === 0x9b) control = "csi";
          else if ([0x90, 0x98, 0x9d, 0x9e, 0x9f].includes(code)) control = "string";
          else continue;
          plain += data.slice(from, index);
        } else if (control === "escape") {
          if (code === 0x5b) control = "csi";
          else if ([0x5d, 0x50, 0x58, 0x5e, 0x5f].includes(code)) control = "string";
          else if (code !== 0x1b && (code < 0x20 || code > 0x2f)) control = "";
        } else if (control === "csi") {
          if (code >= 0x40 && code <= 0x7e) control = "";
          else if (code === 0x1b) control = "escape";
        } else if (code === 0x07 || code === 0x9c || (control === "string-escape" && code === 0x5c))
          control = "";
        else control = code === 0x1b ? "string-escape" : "string";
        from = index + 1;
      }
      return plain + data.slice(from);
    };
    const publish = () => {
      child.presentation = {
        id: child.id,
        output:
          boundedPreview(head) + (omitted ? "\n… [output omitted]\n" : "") + boundedPreview(tail),
        status:
          child.error || (child.exitCode !== undefined && child.exitCode !== 0)
            ? "failed"
            : child.exitCode === undefined
              ? "running"
              : "completed",
        ...(child.exitCode === undefined ? {} : { exitCode: child.exitCode }),
        ...(child.presentation.submitted ? { submitted: child.presentation.submitted } : {}),
      };
      for (const observer of child.observe) observer(child.presentation);
    };
    const remember = (data: string) => {
      data = plainOutput(data);
      if (data && head && !tail && !omitted) {
        // The next event may extend the last displayed grapheme before the head cutoff.
        const last = segmenter.segment(head).containing(head.length - 1)!;
        head = head.slice(0, last.index);
        headBytes -= Buffer.byteLength(last.segment);
        headFull = false;
        data = last.segment + data;
      }
      if (/^\p{ASCII}*$/u.test(tail + data)) {
        const incoming = tail + data;
        let through = headFull ? 0 : Math.min(incoming.length, 8192 - headBytes);
        if (incoming[through - 1] === "\r" && incoming[through] === "\n") through--;
        head += incoming.slice(0, through);
        headBytes += through;
        headFull ||= headBytes === 8192 || through < incoming.length;
        if (incoming.length - through > 8192) omitted = true;
        let start = Math.max(through, incoming.length - 8192);
        if (incoming[start - 1] === "\r" && incoming[start] === "\n") start++;
        tail = incoming.slice(start);
        publish();
        return;
      }
      const ending: string[] = [];
      const lengths: number[] = [];
      let start = 0;
      let tailBytes = 0;
      for (const { segment } of segmenter.segment(tail + data)) {
        const bytes = Buffer.byteLength(segment);
        if (!headFull && headBytes + bytes <= 8192) {
          head += segment;
          headBytes += bytes;
          continue;
        }
        headFull = true;
        ending.push(segment);
        lengths.push(bytes);
        tailBytes += bytes;
        while (tailBytes > 8192) {
          tailBytes -= lengths[start++]!;
          omitted = true;
        }
        if (start >= 8192) {
          ending.splice(0, start);
          lengths.splice(0, start);
          start = 0;
        }
      }
      tail = ending.slice(start).join("");
      publish();
    };
    void done.then(() => {
      if (child.error) {
        control = "";
        remember(`\n${child.error.message}`);
      } else publish();
      child.observe.clear();
    });
    let pause: (() => void) | undefined;
    let waiting: Promise<void> | undefined;
    const append = (data: string) => {
      if (child.error) return;
      try {
        const pressure = output.append(data);
        remember(data);
        if (pressure && pressure !== waiting) {
          waiting = pressure;
          pause!();
          void pressure.then(() => {
            if (waiting === pressure) {
              waiting = undefined;
              child.resume!();
            }
          }, fail);
        }
      } catch (error) {
        fail(error);
      }
    };
    try {
      if (options.tty) {
        const terminal = pty.spawn(options.shell, options.args, {
          cwd: options.cwd,
          env: options.env,
          cols: 80,
          rows: 24,
        });
        child.pid = terminal.pid;
        child.write = (chars) => terminal.write(chars);
        pause = () => terminal.pause();
        child.resume = () => terminal.resume();
        terminal.onData(append);
        terminal.onExit(({ exitCode, signal: exitSignal }) => {
          child.exitCode = exitSignal ? 1 : exitCode;
          resolve();
        });
      } else {
        const command = spawn(options.shell, options.args, {
          cwd: options.cwd,
          env: options.env,
          detached: true,
          stdio: ["ignore", "pipe", "pipe"],
        });
        if (command.pid) child.pid = command.pid;
        pause = () => {
          command.stdout.pause();
          command.stderr.pause();
        };
        child.resume = () => {
          command.stdout.resume();
          command.stderr.resume();
        };
        child.release = () => {
          command.stdout.destroy();
          command.stderr.destroy();
        };
        command.stdout.setEncoding("utf8").on("data", append);
        command.stderr.setEncoding("utf8").on("data", append);
        command.once("error", (error) => {
          child.error ??= launchError(error);
        });
        command.once("close", (code) => {
          child.exitCode = code ?? 1;
          resolve();
        });
      }
    } catch (error) {
      await output.close();
      throw error instanceof Error ? launchError(error) : error;
    }
    this.processes.set(child.id, child);
    onUpdate?.(child.presentation);
    return this.collect(child, yieldTime, maxTokens, signal);
  }

  observe(id: number, observer: (snapshot: ProcessPresentation) => void): void {
    const child = this.processes.get(id);
    if (child) {
      child.observe.add(observer);
      observer(child.presentation);
    }
  }

  replacePresentation(id: number, text: string): void {
    const child = this.processes.get(id);
    if (child?.exitCode === undefined) child?.replacePresentation(text);
  }

  async write(
    id: number,
    chars: string,
    yieldTime: number,
    maxTokens: number,
    signal: AbortSignal,
  ) {
    signal.throwIfAborted();
    const child = this.processes.get(id);
    if (!child) throw new Error(`write_stdin failed: Unknown process id ${id}`);
    return this.collect(child, yieldTime, maxTokens, signal, chars);
  }

  async close(): Promise<void> {
    const children = [...this.processes.values()];
    for (const child of children) this.sendSignal(child);
    const done = Promise.all(children.map((child) => child.done));
    let timer: NodeJS.Timeout | undefined;
    const complete = await Promise.race([
      done.then(() => true),
      new Promise<false>((resolve) => {
        // Leave time for public result processing and collection before the cell's 2000 ms deadline.
        timer = setTimeout(() => resolve(false), 1500);
      }),
    ]);
    clearTimeout(timer);
    const error = complete
      ? undefined
      : new Error(
          "Process cleanup incomplete after 1500 ms; output readers released; detached descendants may remain",
        );
    if (error) {
      for (const child of children) {
        if (child.exitCode !== undefined) continue;
        child.error ??= error;
        child.release?.();
      }
      await done;
    }
    await Promise.allSettled(children.map((child) => child.collected));
    await Promise.all(children.map((child) => child.output.close()));
    this.processes.clear();
    if (error) throw error;
  }

  private sendSignal(child: Process, name: "SIGINT" | "SIGKILL" = "SIGKILL"): void {
    child.resume?.();
    if (child.stopped) return;
    if (!child.pid) return;
    if (name === "SIGKILL") child.stopped = true;
    try {
      process.kill(-child.pid, name);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
    }
  }

  private recordInput(child: Process, chars: string): void {
    const submitted: string[] = [];
    for (let index = 0; index < chars.length; index++) {
      const character = chars[index]!;
      if (character === "\r" || character === "\n") {
        const command = child.inputBuffer.trim();
        if (command || child.inputOverflow)
          submitted.push(
            boundedPreview(command) + (child.inputOverflow ? " … [input omitted]" : ""),
          );
        child.inputBuffer = "";
        child.inputOverflow = 0;
      } else if (character === "\x03") {
        child.inputBuffer = "";
        child.inputOverflow = 0;
      } else if (character === "\b" || character === "\x7f") {
        if (child.inputOverflow) child.inputOverflow--;
        else child.inputBuffer = child.inputBuffer.slice(0, -1);
      } else if (child.inputBuffer.length < 16384) child.inputBuffer += character;
      else child.inputOverflow++;
    }
    if (!submitted.length) return;
    child.presentation = {
      ...child.presentation,
      submitted: [...(child.presentation.submitted ?? []), ...submitted],
    };
    for (const observer of child.observe) observer(child.presentation);
  }

  private collect(
    child: Process,
    yieldTime: number,
    maxTokens: number,
    signal: AbortSignal,
    chars = "",
  ) {
    const call = child.collected.then(async () => {
      if (this.processes.get(child.id) !== child)
        throw new Error(`write_stdin failed: Unknown process id ${child.id}`);
      if (chars && !child.write && chars !== "\u0003")
        throw new Error(
          "write_stdin failed: stdin is closed for this session; rerun exec_command with tty=true to keep stdin open",
        );
      const started = performance.now();
      let timer: NodeJS.Timeout | undefined;
      let retire = false;
      const stop = () => this.sendSignal(child);
      signal.addEventListener("abort", stop, { once: true });
      try {
        if (signal.aborted) stop();
        else if (chars && child.exitCode === undefined) {
          if (child.write) child.write(chars);
          else this.sendSignal(child, "SIGINT");
          this.recordInput(child, chars);
        }
        await Promise.race([
          child.done,
          new Promise<void>((resolve) => {
            timer = setTimeout(resolve, yieldTime);
          }),
        ]);
        if (signal.aborted || child.error) await child.done;
        let exitCode = child.exitCode;
        let cutoff = child.output.snapshot();
        let collected = await child.output.read(child.cursor, cutoff, maxTokens);
        if (signal.aborted || child.error) {
          await child.done;
          exitCode = child.exitCode;
          cutoff = child.output.snapshot();
          collected = await child.output.read(child.cursor, cutoff, maxTokens);
        }
        retire = exitCode !== undefined;
        if (child.error)
          throw new Error(child.error.message + (collected.output ? `\n${collected.output}` : ""));
        child.cursor = cutoff;
        child.output.discardThrough(cutoff);
        return {
          chunk_id: randomBytes(3).toString("hex"),
          wall_time_seconds: (performance.now() - started) / 1000,
          ...(exitCode === undefined ? { session_id: child.id } : { exit_code: exitCode }),
          ...collected,
        };
      } catch (error) {
        this.sendSignal(child);
        await child.done;
        retire = true;
        throw error;
      } finally {
        clearTimeout(timer);
        signal.removeEventListener("abort", stop);
        if (retire) {
          this.processes.delete(child.id);
          await child.output.close();
        }
      }
    });
    child.collected = call.catch(() => {});
    return call;
  }
}
