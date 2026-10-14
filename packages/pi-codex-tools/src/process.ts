import { spawn } from "node:child_process"
import { randomBytes, randomInt } from "node:crypto"
import * as pty from "node-pty"
import { OutputStore, type OutputCursor } from "./output.ts"

type Process = {
  id: number
  pid?: number
  output: OutputStore
  cursor: OutputCursor
  done: Promise<void>
  collected: Promise<unknown>
  exitCode?: number
  error?: Error
  write?: (chars: string) => void
  resume?: () => void
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
    if (this.processes.size >= 32)
      throw new Error("Process session limit reached (32 retained handles)")
    if (this.nextId > 2147483647)
      throw new Error("Process identifier range exhausted")
    const fail = (error: unknown) => {
      child.error ??= error instanceof Error ? error : new Error(String(error))
      this.stop(child)
    }
    const output = new OutputStore(fail)
    const { promise: done, resolve } = Promise.withResolvers<void>()
    const child: Process = {
      id: this.nextId++,
      output,
      cursor: output.snapshot(),
      done,
      collected: Promise.resolve(),
    }
    let pause: (() => void) | undefined
    let waiting: Promise<void> | undefined
    const append = (data: string) => {
      if (child.error) return
      try {
        const pressure = output.append(data)
        if (pressure && pressure !== waiting) {
          waiting = pressure
          pause!()
          void pressure.then(() => {
            if (waiting === pressure) {
              waiting = undefined
              child.resume!()
            }
          }, fail)
        }
      } catch (error) {
        fail(error)
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
        pause = () => terminal.pause()
        child.resume = () => terminal.resume()
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
        pause = () => {
          command.stdout.pause()
          command.stderr.pause()
        }
        child.resume = () => {
          command.stdout.resume()
          command.stderr.resume()
        }
        command.stdout.setEncoding("utf8").on("data", append)
        command.stderr.setEncoding("utf8").on("data", append)
        command.once("error", (error) => {
          child.error ??= error
        })
        command.once("close", (code) => {
          child.exitCode = code ?? 1
          resolve()
        })
      }
    } catch (error) {
      await output.close()
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
    await Promise.all(children.map((child) => child.output.close()))
    this.processes.clear()
  }

  private stop(child: Process): void {
    child.resume?.()
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
      let retire = false
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
        if (signal.aborted || child.error) await child.done
        let exitCode = child.exitCode
        let cutoff = child.output.snapshot()
        let collected = await child.output.read(child.cursor, cutoff, maxTokens)
        if (signal.aborted || child.error) {
          await child.done
          exitCode = child.exitCode
          cutoff = child.output.snapshot()
          collected = await child.output.read(child.cursor, cutoff, maxTokens)
        }
        retire = exitCode !== undefined
        if (child.error)
          throw new Error(
            child.error.message +
              (collected.output ? `\n${collected.output}` : ""),
          )
        child.cursor = cutoff
        child.output.discardThrough(cutoff)
        return {
          chunk_id: randomBytes(3).toString("hex"),
          wall_time_seconds: (performance.now() - started) / 1000,
          ...(exitCode === undefined
            ? { session_id: child.id }
            : { exit_code: exitCode }),
          ...collected,
        }
      } catch (error) {
        this.stop(child)
        await child.done
        retire = true
        throw error
      } finally {
        clearTimeout(timer)
        signal.removeEventListener("abort", stop)
        if (retire) {
          this.processes.delete(child.id)
          await child.output.close()
        }
      }
    })
    child.collected = call.catch(() => {})
    return call
  }
}
