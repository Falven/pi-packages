import { Worker } from "node:worker_threads"
import { OutputBuffer } from "./output.ts"
import type {
  AgentToolResult,
  ExtensionToolContext,
} from "@earendil-works/pi-coding-agent"

export async function execute(
  source: string,
  ctx: ExtensionToolContext,
  signal: AbortSignal | undefined,
): Promise<AgentToolResult<undefined>> {
  const started = performance.now()
  const pragma = source.match(/^[ \t]*\/\/ @exec:([^\r\n]*)/)
  const options = pragma
    ? (JSON.parse(pragma[1]!) as {
        max_output_tokens?: number
        yield_time_ms?: number
      })
    : {}
  const maxTokens = options.max_output_tokens ?? 10000
  if (!Number.isSafeInteger(maxTokens) || maxTokens < 0)
    throw new Error("max_output_tokens must be a nonnegative integer")
  const yieldTime = options.yield_time_ms ?? 30000
  if (!Number.isSafeInteger(yieldTime) || yieldTime < 0)
    throw new Error("yield_time_ms must be a nonnegative integer")
  const deadline = new AbortController()
  const callSignal = signal
    ? AbortSignal.any([signal, deadline.signal])
    : deadline.signal
  const calls = new Set<Promise<unknown>>()
  let timer: NodeJS.Timeout | undefined
  const bounded = new OutputBuffer(maxTokens)
  const tools = ctx.tools.filter((tool) =>
    ["exec_command", "apply_patch"].includes(tool.name),
  )
  const worker = new Worker(new URL("./worker.mjs", import.meta.url), {
    workerData: {
      source,
      tools: tools.map(({ name, description }) => ({ name, description })),
    },
    execArgv: [
      "--experimental-vm-modules",
      "--disable-warning=ExperimentalWarning",
    ],
  })
  const output: AgentToolResult<undefined>["content"] = []
  let emitted = false
  let finished = false
  let failure: unknown
  const append = (text: string) => {
    if (emitted) bounded.append("\n")
    emitted = true
    bounded.append(text)
    if (bounded.truncated) output.length = 0
    else output.push({ type: "text", text })
  }
  try {
    await new Promise<void>((resolve, reject) => {
      const finish = (error?: Error) => {
        if (finished) return
        finished = true
        if (error) reject(error)
        else resolve()
      }
      const abort = () => finish(new Error("Execution cancelled"))
      timer = setTimeout(() => {
        deadline.abort()
        finish(
          new Error(
            "Execution reached its yield deadline; retained execution is unavailable",
          ),
        )
      }, yieldTime)
      signal?.addEventListener("abort", abort, { once: true })
      worker.once("exit", () => {
        signal?.removeEventListener("abort", abort)
        if (!finished) finish(new Error("Execution stopped before completion"))
      })
      worker.once("error", finish)
      worker.on("message", async (serialized: string) => {
        if (finished) return
        const message = JSON.parse(serialized) as {
          type: string
          text: string
          message: string
          id: number
          name: string
          args: unknown
        }
        if (message.type === "text") {
          append(message.text)
        } else if (message.type === "done" || message.type === "exit") {
          finish()
        } else if (message.type === "error") {
          finish(new Error(message.message))
        } else if (message.type === "call") {
          const call = ctx.executeTool(
            message.name,
            message.name === "apply_patch"
              ? { input: message.args }
              : message.args,
            {
              signal: callSignal,
            },
          )
          calls.add(call)
          try {
            const outcome = await call
            const text = outcome.result.content
              .filter((part) => part.type === "text")
              .map((part) => part.text)
              .join("\n")
            if (finished) {
              if (callSignal.aborted && text) append(text)
              return
            }
            const response = JSON.stringify({
              id: message.id,
              ...(outcome.isError
                ? { error: text }
                : { result: outcome.result.structuredContent ?? text }),
            })
            // oxlint-disable-next-line require-post-message-target-origin -- This is a Node worker, not a browser window.
            worker.postMessage(response)
          } catch (error) {
            finish(error instanceof Error ? error : new Error(String(error)))
          } finally {
            calls.delete(call)
          }
        }
      })
      if (signal?.aborted) abort()
    })
  } catch (error) {
    failure = error
  } finally {
    clearTimeout(timer)
    await worker.terminate()
    if (callSignal.aborted) await Promise.allSettled(calls)
  }
  const content = bounded.truncated
    ? [{ type: "text" as const, text: bounded.result().output }]
    : output
  return failure
    ? {
        content: [
          ...content,
          {
            type: "text",
            text: `Script error:\n${failure instanceof Error ? failure.message : String(failure)}`,
          },
        ],
        details: undefined,
        isError: true,
      }
    : {
        content: [
          {
            type: "text",
            text: `Script completed\nWall time ${((performance.now() - started) / 1000).toFixed(1)} seconds\nOutput:\n`,
          },
          ...content,
        ],
        details: undefined,
      }
}
