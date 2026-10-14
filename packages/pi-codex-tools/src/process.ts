import { spawn } from "node:child_process"
import { randomBytes, randomInt } from "node:crypto"
import {
  closeSync,
  ftruncateSync,
  mkdtempSync,
  openSync,
  readSync,
  rmSync,
  writeSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as pty from "node-pty"
import { OutputBuffer } from "./output.ts"

class ProcessOutput {
  private readonly directory = mkdtempSync(join(tmpdir(), "core-tools-output-"))
  private readonly fd = openSync(join(this.directory, "output"), "w+", 0o600)
  private bytes = 0
  private closed = false

  append(value: string): void {
    const chunk = Buffer.from(value)
    let written = 0
    while (written < chunk.length) {
      written += writeSync(
        this.fd,
        chunk,
        written,
        chunk.length - written,
        this.bytes + written,
      )
    }
    this.bytes += written
  }

  take(maxTokens: number) {
    const output = new OutputBuffer(maxTokens)
    const chunk = Buffer.alloc(Math.min(this.bytes, 65536))
    let position = 0
    while (position < this.bytes) {
      const count = readSync(
        this.fd,
        chunk,
        0,
        Math.min(chunk.length, this.bytes - position),
        position,
      )
      output.append(chunk.subarray(0, count))
      position += count
    }
    ftruncateSync(this.fd, 0)
    this.bytes = 0
    return output.result()
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    closeSync(this.fd)
    rmSync(this.directory, { recursive: true, force: true })
  }
}

type Process = {
  id: number
  pid?: number
  output: ProcessOutput
  done: Promise<void>
  collected: Promise<unknown>
  exitCode?: number
  error?: Error
  write?: (chars: string) => void
}

type CommandOptions = {
  shell: string
  command: string
  login: boolean
  cwd: string
  env: NodeJS.ProcessEnv
  tty: boolean
}

export class ProcessSessions {
  private readonly processes = new Map<number, Process>()
  private nextId = randomInt(1, 2 ** 30)

  async start(
    options: CommandOptions,
    yieldTime: number,
    maxTokens: number,
    signal: AbortSignal,
  ) {
    signal.throwIfAborted()
    if (this.nextId > 2147483647)
      throw new Error("Process identifier range exhausted")
    const output = new ProcessOutput()
    const { promise: done, resolve } = Promise.withResolvers<void>()
    const child: Process = {
      id: this.nextId++,
      output,
      done,
      collected: Promise.resolve(),
    }
    const append = (data: string) => {
      try {
        output.append(data)
      } catch (error) {
        child.error = error instanceof Error ? error : new Error(String(error))
        this.stop(child)
      }
    }
    const args = [options.login ? "-lc" : "-c", options.command]
    try {
      if (options.tty) {
        const terminal = pty.spawn(options.shell, args, {
          cwd: options.cwd,
          env: options.env,
          cols: 80,
          rows: 24,
        })
        child.pid = terminal.pid
        child.write = (chars) => terminal.write(chars)
        terminal.onData(append)
        terminal.onExit(({ exitCode, signal: exitSignal }) => {
          child.exitCode = exitSignal ? 1 : exitCode
          resolve()
        })
      } else {
        const command = spawn(options.shell, args, {
          cwd: options.cwd,
          env: options.env,
          detached: true,
          stdio: ["ignore", "pipe", "pipe"],
        })
        if (command.pid) child.pid = command.pid
        command.stdout.setEncoding("utf8").on("data", append)
        command.stderr.setEncoding("utf8").on("data", append)
        command.once("error", (error) => {
          child.error = error
        })
        command.once("close", (code) => {
          child.exitCode = code ?? 1
          resolve()
        })
      }
    } catch (error) {
      output.close()
      throw error
    }
    this.processes.set(child.id, child)
    return this.collect(child, yieldTime, maxTokens, signal)
  }

  async write(
    id: number,
    chars: string,
    yieldTime: number,
    maxTokens: number,
    signal: AbortSignal,
  ) {
    signal.throwIfAborted()
    const child = this.processes.get(id)
    if (!child) throw new Error(`write_stdin failed: Unknown process id ${id}`)
    return this.collect(child, yieldTime, maxTokens, signal, chars)
  }

  async close(): Promise<void> {
    const children = [...this.processes.values()]
    for (const child of children) this.stop(child)
    await Promise.all(children.map((child) => child.done))
    await Promise.allSettled(children.map((child) => child.collected))
    for (const child of children) child.output.close()
    this.processes.clear()
  }

  private stop(child: Process): void {
    if (!child.pid) return
    try {
      process.kill(-child.pid, "SIGKILL")
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error
    }
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
        throw new Error(`write_stdin failed: Unknown process id ${child.id}`)
      if (chars && !child.write)
        throw new Error(
          "write_stdin failed: stdin is closed for this session; rerun exec_command with tty=true to keep stdin open",
        )
      const started = performance.now()
      let timer: NodeJS.Timeout | undefined
      const stop = () => this.stop(child)
      signal.addEventListener("abort", stop, { once: true })
      try {
        if (signal.aborted) stop()
        else if (chars && child.exitCode === undefined) child.write!(chars)
        await Promise.race([
          child.done,
          new Promise<void>((resolve) => {
            timer = setTimeout(resolve, yieldTime)
          }),
        ])
        if (signal.aborted) await child.done
        if (child.error) throw child.error
        return {
          chunk_id: randomBytes(3).toString("hex"),
          wall_time_seconds: (performance.now() - started) / 1000,
          ...(child.exitCode === undefined
            ? { session_id: child.id }
            : { exit_code: child.exitCode }),
          ...child.output.take(maxTokens),
        }
      } finally {
        clearTimeout(timer)
        signal.removeEventListener("abort", stop)
        if (child.exitCode !== undefined) {
          this.processes.delete(child.id)
          child.output.close()
        }
      }
    })
    child.collected = call.catch(() => {})
    return call
  }
}
