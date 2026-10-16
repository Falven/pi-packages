/* eslint-disable no-await-in-loop -- Output ranges and producer pressure preserve collection order. */
import { randomUUID } from "node:crypto"
import { Worker } from "node:worker_threads"
import { stripVTControlCharacters } from "node:util"
import { truncateToWidth } from "@earendil-works/pi-tui"
import {
  activityDetails,
  activityType,
  type ActivityOperation,
  type ActivityUpdate,
} from "pi-activity"
import { operationActivity, outputActivity } from "./activity.ts"
import {
  boundedPreview,
  createExecutionRenderers,
  type LivePresentation,
  contentHash,
  executionHash,
  type ExecutionDetails,
  type OperationPresentation,
  type PatchDetails,
} from "./presentation.ts"
import type { ProcessSessions, ProcessPresentation } from "./process.ts"
import { OutputStore, type OutputCursor } from "./output.ts"
import type {
  AgentToolResult,
  AgentToolUpdateCallback,
  ExtensionAPI,
  ExtensionContext,
  ExtensionToolContext,
} from "@earendil-works/pi-coding-agent"

export type WaitOptions = {
  cell_id: string
  max_tokens?: number
  terminate?: boolean
  yield_time_ms?: number
}
type Result = AgentToolResult<ExecutionDetails | undefined>
type Status = "running" | "completed" | "failed" | "terminated"
type Part = {
  id: number
  type: "text" | "image"
  from: OutputCursor
  through: OutputCursor
  sealed: boolean
  mimeType?: string
  owner?: number
}
type Activity = {
  type: string
  child_id?: string
  name?: string
  arguments?: string
  error?: string
  output?: string
  replace_output?: boolean
  presentation?: OperationPresentation
}
type Journal = {
  cell_id: string
  parent_call_id: string
  session_id: string
  status: Status
  events: Activity[]
  activity?: ActivityUpdate
}
type Cutoff = {
  status: Status
  error: string | undefined
  parts: Part[]
  text: OutputCursor
  images: OutputCursor
  yielded: number
}
type Cell = {
  id: string
  parentId: string
  sessionId: string
  ctx: ExtensionToolContext
  status: Status
  error: string | undefined
  collected: boolean
  accepting: boolean
  worker: Worker | undefined
  release: Promise<unknown> | undefined
  credits: Int32Array
  replies: Map<number, number>
  replyBytes: number
  controller: AbortController
  text: OutputStore
  images: OutputStore
  parts: Part[]
  nextPart: number
  textRead: OutputCursor
  imagesRead: OutputCursor
  hasText: boolean
  yielded: number
  collectedYield: number
  wake: (() => void) | undefined
  collection: Promise<void>
  collectors: number
  processing: Promise<void>
  writing: Promise<void>
  calls: Set<Promise<void>>
  stopping: Promise<void> | undefined
  events: Activity[]
  eventBytes: number
  scriptOutput: string
  scriptOutputReset: boolean
  eventCount: number
  revision: number
  outputRevision: number
  activityPending: Map<string, ActivityOperation>
  notificationBytes: number
  presentation: ExecutionDetails["execution"]
  activeOperations: Set<OperationPresentation>
  onUpdate: AgentToolUpdateCallback<ExecutionDetails | undefined> | undefined
}
const journalType = "core-tools.activity"
const messageLimit = 8 * 1024 * 1024
const queueLimit = 16 * 1024 * 1024
const cleanupLimit = 2000
const selectedNames = new Set([
  "exec_command",
  "write_stdin",
  "apply_patch",
  "view_image",
])
const brief = (value: unknown) =>
  truncateToWidth(
    stripVTControlCharacters(String(value)).replaceAll(/\s+/g, " "),
    256,
  )
const failure = (message: string): Result => ({
  content: [{ type: "text", text: `Script error:\n${message}` }],
  details: undefined,
  isError: true,
})
function integer(
  value: number | undefined,
  fallback: number,
  name: string,
): number {
  const result = value ?? fallback
  if (!Number.isSafeInteger(result) || result < 0)
    throw new Error(`${name} must be a nonnegative integer`)
  return result
}

export class ExecutionCells {
  private readonly presentations = new Map<string, LivePresentation>()
  readonly renderers = createExecutionRenderers(
    this.presentations,
    (execution, invalidate) => this.restore(execution, invalidate),
  )
  private context: ExtensionContext | undefined
  private readonly pendingRenders = new Set<() => void>()
  private readonly cells = new Map<string, Cell>()
  private readonly values = new Map<string, string>()
  private readonly workers = new Set<Worker>()
  private closed = false
  private closing = false

  constructor(
    private readonly pi: ExtensionAPI,
    private readonly available: (name: string) => boolean,
    private readonly processes: ProcessSessions,
  ) {
    pi.registerEntryRenderer<Journal>(journalType, () => undefined)
    pi.on("session_start", (_event, ctx) => {
      this.context = ctx
      for (const invalidate of this.pendingRenders) invalidate()
      this.pendingRenders.clear()
    })
    pi.on("session_tree", (_event, ctx) => {
      this.context = ctx
    })
  }

  async start(
    source: string,
    parentId: string,
    ctx: ExtensionToolContext,
    signal: AbortSignal | undefined,
    onUpdate?: AgentToolUpdateCallback<ExecutionDetails | undefined>,
  ): Promise<Result> {
    if (this.closed || this.closing)
      return failure("Execution session is closed")
    if (this.cells.size >= 32)
      return failure("Execution has too many retained cells (32)")
    if (this.workers.size >= 8)
      return failure("Execution has too many live workers (8)")
    if (Buffer.byteLength(source) > 1024 * 1024)
      return failure("Execution source exceeds 1 MiB")
    const pragma = source.match(/^[ \t]*\/\/ @exec:([^\r\n]*)/)
    let maxTokens: number
    let yieldTime: number
    try {
      const options = pragma
        ? (JSON.parse(pragma[1]!) as {
            max_output_tokens?: number
            yield_time_ms?: number
          })
        : {}
      maxTokens = integer(options.max_output_tokens, 10000, "max_output_tokens")
      yieldTime = integer(options.yield_time_ms, 30000, "yield_time_ms")
    } catch (error) {
      return failure(error instanceof Error ? error.message : String(error))
    }
    const credits = new Int32Array(new SharedArrayBuffer(4))
    Atomics.store(credits, 0, queueLimit)
    const cell: Cell = {
      id: randomUUID(),
      parentId,
      sessionId: ctx.sessionManager.getSessionId(),
      ctx,
      status: "running",
      error: undefined,
      collected: false,
      accepting: true,
      worker: undefined,
      release: undefined,
      credits,
      replies: new Map(),
      replyBytes: 0,
      controller: new AbortController(),
      text: new OutputStore((error) => void this.stop(cell, String(error))),
      images: new OutputStore((error) => void this.stop(cell, String(error))),
      parts: [],
      nextPart: 0,
      textRead: { bytes: 0, lines: 0, lastByte: undefined },
      imagesRead: { bytes: 0, lines: 0, lastByte: undefined },
      hasText: false,
      yielded: 0,
      collectedYield: 0,
      wake: undefined,
      collection: Promise.resolve(),
      collectors: 0,
      processing: Promise.resolve(),
      writing: Promise.resolve(),
      calls: new Set(),
      stopping: undefined,
      events: [],
      eventBytes: 0,
      scriptOutput: "",
      scriptOutputReset: false,
      eventCount: 0,
      revision: 0,
      outputRevision: 0,
      activityPending: new Map(),
      notificationBytes: 0,
      presentation: {
        cellId: "",
        parentCallId: parentId,
        sessionId: ctx.sessionManager.getSessionId(),
        status: "running",
        operations: [],
      },
      activeOperations: new Set(),
      onUpdate,
    }
    cell.presentation.cellId = cell.id
    this.presentations.set(cell.id, {
      execution: cell.presentation,
      invalidates: new Set(),
    })
    this.cells.set(cell.id, cell)
    this.pi.events.emit(activityType, this.activityUpdate(cell, []))
    this.record(cell, { type: "created" })
    const tools = ctx.tools.filter(
      (tool) => selectedNames.has(tool.name) && this.available(tool.name),
    )
    const worker = new Worker(new URL("./worker.mjs", import.meta.url), {
      workerData: {
        source,
        tools: tools.map(({ name, description }) => ({ name, description })),
        values: [...this.values],
        credits: credits.buffer,
      },
      execArgv: [
        "--experimental-vm-modules",
        "--disable-warning=ExperimentalWarning",
      ],
      resourceLimits: { maxOldGenerationSizeMb: 128, stackSizeMb: 4 },
    })
    cell.worker = worker
    this.workers.add(worker)
    worker.once("error", (error) => void this.stop(cell, error.message))
    worker.once("exit", () => {
      this.workers.delete(worker)
      if (cell.worker === worker) {
        cell.worker = undefined
        if (cell.status === "running" && !cell.stopping)
          void this.stop(cell, "Execution stopped before completion")
      }
    })
    worker.on("message", (serialized: string) => {
      const bytes = Buffer.byteLength(serialized)
      cell.processing = cell.processing
        .then(() => this.message(cell, serialized))
        .catch((error: unknown) => {
          void this.stop(
            cell,
            error instanceof Error ? error.message : String(error),
          )
        })
        .finally(() => {
          Atomics.add(credits, 0, bytes)
          Atomics.notify(credits, 0)
        })
    })
    const abort = () => void this.stop(cell, "Execution cancelled")
    signal?.addEventListener("abort", abort, { once: true })
    if (signal?.aborted) abort()
    try {
      return await this.collect(cell, yieldTime, maxTokens)
    } finally {
      signal?.removeEventListener("abort", abort)
    }
  }

  async wait(
    args: WaitOptions,
    signal: AbortSignal | undefined,
    callId: string,
  ): Promise<Result> {
    try {
      const maxTokens = integer(args.max_tokens, 10000, "max_tokens")
      const yieldTime = integer(args.yield_time_ms, 10000, "yield_time_ms")
      const cell = this.cells.get(args.cell_id)
      if (!cell || cell.collected)
        return failure(`exec cell ${args.cell_id} not found`)
      this.pi.events.emit(activityType, this.activityUpdate(cell, [], callId))
      if (args.terminate) await this.stop(cell)
      return await this.collect(cell, yieldTime, maxTokens, signal, callId)
    } catch (error) {
      return failure(error instanceof Error ? error.message : String(error))
    }
  }

  private async message(cell: Cell, serialized: string): Promise<void> {
    if (!cell.accepting) return
    const message = JSON.parse(serialized) as {
      type: string
      text: string
      message: string
      id: number
      name: string
      args: unknown
      url: string
      writes: [string, string][]
      owner?: number
    }
    if (message.type === "text")
      await this.appendText(cell, message.text, message.owner !== undefined)
    else if (message.type === "image") {
      if (this.pi.getSettings().images?.blockImages)
        await this.appendText(cell, "Image reading is disabled.")
      else {
        this.checkParts(cell)
        const comma = message.url.indexOf(",")
        const from = cell.images.snapshot()
        await this.append(cell.images, message.url.slice(comma + 1))
        cell.parts.push({
          id: ++cell.nextPart,
          type: "image",
          from,
          through: cell.images.snapshot(),
          sealed: true,
          mimeType: message.url.slice(5, comma).split(";")[0]!,
          ...(message.owner === undefined ? {} : { owner: message.owner }),
        })
      }
    } else if (message.type === "notify") {
      cell.notificationBytes += Buffer.byteLength(message.text)
      if (cell.notificationBytes > 1024 * 1024)
        throw new Error("Execution notifications exceed 1 MiB")
      this.record(cell, { type: "notified" })
      this.pi.sendMessage(
        {
          customType: "core-tools.notice",
          content: message.text,
          display: true,
        },
        { triggerTurn: false },
      )
    } else if (message.type === "yield") {
      cell.yielded++
      this.flush(cell)
      cell.wake?.()
    } else if (message.type === "done" || message.type === "error") {
      this.commit(message.writes)
      cell.status = message.type === "done" ? "completed" : "failed"
      cell.error = message.type === "error" ? message.message : undefined
      cell.accepting = false
      if (cell.error) cell.presentation.error = boundedPreview(cell.error)
      else delete cell.presentation.error
      this.update(cell)
      this.release(cell)
      this.record(cell, {
        type: cell.status,
        ...(cell.error ? { error: brief(cell.error) } : {}),
      })
      this.flush(cell)
      cell.wake?.()
    } else if (message.type === "call") {
      if (cell.calls.size >= 32)
        throw new Error("Execution has too many pending tool calls (32)")
      const call = this.dispatch(cell, message)
        .catch((error: unknown) => {
          void this.stop(
            cell,
            error instanceof Error ? error.message : String(error),
          )
        })
        .finally(() => {
          cell.calls.delete(call)
          if (cell.collected && !cell.calls.size) this.cells.delete(cell.id)
        })
      cell.calls.add(call)
    } else if (message.type === "received") {
      cell.replyBytes -= cell.replies.get(message.id) ?? 0
      cell.replies.delete(message.id)
    }
  }

  private async dispatch(
    cell: Cell,
    message: {
      id: number
      name: string
      args: unknown
    },
  ): Promise<void> {
    const child = `${cell.id}/${message.id}`
    const operation: OperationPresentation = {
      id: child,
      order: cell.presentation.operations.length,
      name: message.name,
      status: "running",
    }
    const source = this.pi
      .getAllTools()
      .find((tool) => tool.name === message.name)?.sourceInfo
    if (source) {
      operation.toolSource = source.source
      operation.toolPath = source.path
    }
    cell.activeOperations.add(operation)
    cell.presentation.operations.push(operation)
    this.update(cell, operation)
    let processId: number | undefined
    let observing = false
    const observe = (process: ProcessPresentation) => {
      const submitted =
        (process.submitted?.length ?? 0) !== (operation.submitted?.length ?? 0)
      operation.live = true
      operation.output = process.output
      if (process.submitted) operation.submitted = process.submitted
      operation.status = process.status
      if (process.exitCode !== undefined) operation.exitCode = process.exitCode
      if (returned && process.status !== "running")
        this.settleOperation(cell, operation)
      this.update(cell, operation)
      if (submitted) this.flush(cell)
      if (returned && process.status !== "running") {
        this.record(cell, {
          type: "process-completed",
          child_id: child,
          name: message.name,
          presentation: { ...operation },
        })
        this.flush(cell)
        this.releasePresentation(cell)
      }
    }
    let returned = false
    let liveRedacted = false
    try {
      this.record(cell, {
        type: "started",
        child_id: child,
        name: message.name,
        arguments: brief(JSON.stringify(message.args)),
      })
      if (
        !selectedNames.has(message.name) ||
        !this.available(message.name) ||
        !cell.ctx.tools.some((tool) => tool.name === message.name)
      )
        throw new Error(`Tool ${message.name} is not available`)
      const outcome = await cell.ctx.executeTool(
        message.name,
        message.name === "apply_patch" ? { input: message.args } : message.args,
        {
          signal: cell.controller.signal,
          onUpdate: (partial) => {
            const context = partial.details as
              | {
                  command?: string
                  cwd?: string
                  path?: string
                  effectiveArgs?: Record<string, unknown>
                  process?: ProcessPresentation
                }
              | undefined
            if (typeof context?.command === "string")
              operation.command = boundedPreview(context.command)
            if (typeof context?.cwd === "string")
              operation.cwd = boundedPreview(context.cwd)
            if (context?.process && !observing) {
              observing = true
              processId = context.process.id
              this.processes.observe(context.process.id, observe)
            }
            if (typeof context?.path === "string")
              operation.path = boundedPreview(context.path)
            if (context?.effectiveArgs)
              operation.effectiveArgs = context.effectiveArgs
            else if (typeof context?.path === "string")
              operation.effectiveArgs = { path: context.path }
            this.update(cell, operation)
          },
        },
      )
      returned = true
      const blocked =
        message.name === "view_image" &&
        this.pi.getSettings().images?.blockImages
      const text = blocked
        ? "Image reading is disabled."
        : outcome.result.content
            .filter((part) => part.type === "text")
            .map((part) => part.text)
            .join("\n")
      const context = outcome.result.details as
        | {
            command?: string
            cwd?: string
            outputHash?: string
            path?: string
            effectiveArgs?: Record<string, unknown>
          }
        | undefined
      if (typeof context?.command === "string")
        operation.command = boundedPreview(context.command)
      if (typeof context?.cwd === "string")
        operation.cwd = boundedPreview(context.cwd)
      if (typeof context?.path === "string")
        operation.path = boundedPreview(context.path)
      if (context?.effectiveArgs)
        operation.effectiveArgs = context.effectiveArgs
      else if (typeof context?.path === "string")
        operation.effectiveArgs = { path: context.path }
      const structured = outcome.result.structuredContent as
        | {
            output?: unknown
            exit_code?: unknown
            session_id?: unknown
            image_url?: unknown
          }
        | undefined
      const processedMatches = text === JSON.stringify(structured)
      if (
        !blocked &&
        !(
          message.name === "view_image" && /"image_url"\s*:\s*"data:/.test(text)
        )
      )
        operation.resultText = boundedPreview(text)
      if (typeof structured?.session_id === "number")
        operation.sessionId = structured.session_id
      if (message.name === "write_stdin") {
        const id = operation.effectiveArgs?.["session_id"]
        if (typeof id === "number") operation.sessionId = id
      }
      operation.input = message.name === "write_stdin" && !outcome.isError
      liveRedacted =
        operation.live === true &&
        (!processedMatches ||
          typeof structured?.output !== "string" ||
          context?.outputHash !==
            contentHash([{ type: "text", text: structured.output }]))
      if (!operation.live || liveRedacted)
        operation.output = boundedPreview(
          !blocked &&
            (typeof structured?.image_url === "string" ||
              (message.name === "view_image" &&
                /"image_url"\s*:\s*"data:/.test(text)))
            ? ""
            : processedMatches && typeof structured?.output === "string"
              ? structured.output
              : text,
        )
      if (liveRedacted) delete operation.exitCode
      if (!liveRedacted && typeof structured?.exit_code === "number")
        operation.exitCode = structured.exit_code
      if (message.name === "apply_patch") {
        const details = outcome.result.details as PatchDetails | undefined
        if (details?.contentHash === contentHash(outcome.result.content)) {
          operation.patchChanges = details.patchChanges
          if (details.patchOmitted) operation.patchOmitted = true
          if (text === "{}") operation.output = ""
        }
      }
      const exitCode =
        typeof structured?.exit_code === "number"
          ? structured.exit_code
          : operation.exitCode
      operation.status =
        outcome.isError || blocked || (exitCode !== undefined && exitCode !== 0)
          ? "failed"
          : message.name === "exec_command" &&
              typeof structured?.session_id === "number"
            ? "running"
            : "completed"
      if (liveRedacted && processId !== undefined)
        this.processes.replacePresentation(processId, operation.output ?? "")
      if (!operation.live || operation.status !== "running")
        this.settleOperation(cell, operation)
      this.update(cell, operation)
      this.record(cell, {
        presentation: { ...operation },
        type: outcome.isError || blocked ? "failed" : "completed",
        child_id: child,
        name: message.name,
        ...(outcome.isError || blocked ? { error: brief(text) } : {}),
      })
      if (cell.stopping && text) await this.appendText(cell, text)
      if (cell.accepting)
        this.reply(
          cell,
          message.id,
          outcome.isError || blocked
            ? { error: text }
            : { result: outcome.result.structuredContent ?? text },
        )
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error)
      operation.status = "failed"
      operation.output = boundedPreview(text)
      this.settleOperation(cell, operation)
      this.update(cell, operation)
      this.record(cell, {
        presentation: { ...operation },
        type: "failed",
        child_id: child,
        name: message.name,
        error: brief(text),
      })
      if (cell.accepting) this.reply(cell, message.id, { error: text })
    } finally {
      if (cell.status !== "running") this.flush(cell)
    }
  }

  private reply(
    cell: Cell,
    id: number,
    result: { error?: string; result?: unknown },
  ): void {
    const serialized = JSON.stringify({ id, ...result })
    const bytes = Buffer.byteLength(serialized)
    if (bytes > messageLimit || cell.replyBytes + bytes > queueLimit) {
      void this.stop(cell, "Tool replies exceed the worker message limit")
      return
    }
    cell.replyBytes += bytes
    cell.replies.set(id, bytes)
    // oxlint-disable-next-line require-post-message-target-origin -- This is a Node worker, not a browser window.
    cell.worker?.postMessage(serialized)
  }

  private checkParts(cell: Cell): void {
    if (cell.parts.length >= 4096)
      throw new Error("Execution has too many unread output items (4096)")
  }

  private async append(
    store: OutputStore,
    value: string,
    accepted?: () => void,
  ): Promise<void> {
    const bytes = Buffer.from(value)
    for (let offset = 0; offset < bytes.length;) {
      let through = Math.min(bytes.length, offset + 256 * 1024)
      while (through < bytes.length && (bytes[through]! & 0xc0) === 0x80)
        through--
      const pressure = store.append(bytes.subarray(offset, through))
      accepted?.()
      await pressure
      offset = through
    }
  }

  private appendText(
    cell: Cell,
    text: string,
    childOwned = false,
  ): Promise<void> {
    if (childOwned) cell.presentation.output ??= ""
    if (!childOwned) {
      let shown = text
      try {
        const value = JSON.parse(text) as { image_url?: unknown }
        if (
          typeof value.image_url === "string" &&
          value.image_url.startsWith("data:")
        )
          shown = "[Image result]"
      } catch {
        // Ordinary script text is displayed as written.
      }
      const previous = cell.presentation.output ?? ""
      const output = boundedPreview(previous + (previous ? "\n" : "") + shown)
      if (output !== previous) {
        cell.presentation.output = output
        const reset = !output.startsWith(previous)
        const delta = reset ? output : output.slice(previous.length)
        if (reset) {
          cell.scriptOutput = output
          cell.scriptOutputReset = true
        } else cell.scriptOutput += delta
        this.pi.events.emit(journalType, {
          cell_id: cell.id,
          parent_call_id: cell.parentId,
          session_id: cell.sessionId,
          status: cell.status,
          events: [
            {
              type: "script-output",
              output: delta,
              ...(reset ? { replace_output: true } : {}),
            },
          ],
        } satisfies Journal)
        this.update(cell)
      }
    }
    cell.writing = cell.writing.then(async () => {
      this.checkParts(cell)
      if (cell.hasText) await cell.text.append("\n")
      cell.hasText = true
      const from = cell.text.snapshot()
      const part: Part = {
        id: ++cell.nextPart,
        type: "text",
        from,
        through: from,
        sealed: false,
      }
      cell.parts.push(part)
      try {
        await this.append(cell.text, text, () => {
          part.through = cell.text.snapshot()
        })
      } finally {
        part.sealed = true
      }
    })
    return cell.writing
  }

  private commit(writes: [string, string][]): void {
    const next = new Map(this.values)
    for (const [key, value] of writes) next.set(key, value)
    const bytes = [...next].reduce(
      (size, [key, value]) =>
        size + Buffer.byteLength(key) + Buffer.byteLength(value),
      0,
    )
    if (next.size > 128 || bytes > 1024 * 1024)
      throw new Error("Stored values exceed the session limit")
    for (const [key, value] of writes) this.values.set(key, value)
  }

  private release(cell: Cell): void {
    const worker = cell.worker
    cell.worker = undefined
    if (worker) cell.release = worker.terminate()
    cell.replies.clear()
    cell.replyBytes = 0
  }

  private stop(cell: Cell, error?: string): Promise<void> {
    if (cell.stopping) return cell.stopping
    if (cell.status !== "running" && cell.calls.size === 0)
      return Promise.resolve()
    cell.accepting = false
    cell.controller.abort()
    this.release(cell)
    cell.stopping = (async () => {
      let timer: NodeJS.Timeout | undefined
      const complete = await Promise.race([
        Promise.allSettled([
          cell.release,
          cell.processing,
          cell.writing,
          ...cell.calls,
        ]).then(() => true),
        new Promise<false>((resolve) => {
          timer = setTimeout(() => resolve(false), cleanupLimit)
        }),
      ])
      clearTimeout(timer)
      cell.status = "terminated"
      cell.error =
        [
          error,
          ...(!complete
            ? ["Execution cleanup did not finish within 2000 ms"]
            : []),
        ]
          .filter(Boolean)
          .join("\n") || undefined
      if (cell.error) cell.presentation.error = boundedPreview(cell.error)
      else delete cell.presentation.error
      this.update(cell)
      this.record(cell, {
        type: "terminated",
        ...(cell.error ? { error: brief(cell.error) } : {}),
      })
      this.flush(cell)
      cell.wake?.()
    })()
    return cell.stopping
  }

  private capture(cell: Cell): Cutoff {
    const parts = cell.parts
      .filter((part) => part.sealed || part.through.bytes > part.from.bytes)
      // oxlint-disable-next-line no-map-spread -- The published cutoff must not change while producers append.
      .map((part) => ({ ...part }))
    return {
      status: cell.status,
      error: cell.error,
      parts,
      text:
        parts.findLast((part) => part.type === "text")?.through ??
        cell.textRead,
      images:
        parts.findLast((part) => part.type === "image")?.through ??
        cell.imagesRead,
      yielded: cell.yielded,
    }
  }

  private async collect(
    cell: Cell,
    yieldTime: number,
    maxTokens: number,
    signal?: AbortSignal,
    callId = cell.parentId,
  ): Promise<Result> {
    if (signal?.aborted) return failure("Wait cancelled")
    if (cell.collectors >= 32)
      return failure("Execution has too many waiting collectors (32)")
    cell.collectors++
    const waiting = cell.collection
      .then(async (): Promise<Result> => {
        if (signal?.aborted) return failure("Wait cancelled")
        if (cell.collected) return failure(`exec cell ${cell.id} not found`)
        const started = performance.now()
        let timer: NodeJS.Timeout | undefined
        let cancelled = false
        let abort: (() => void) | undefined
        const cutoff = await new Promise<Cutoff>((resolve) => {
          const capture = () => {
            if (cell.stopping && cell.status === "running") return
            resolve(this.capture(cell))
          }
          abort = () => {
            cancelled = true
            resolve(this.capture(cell))
          }
          cell.wake = capture
          signal?.addEventListener("abort", abort, { once: true })
          if (
            cell.status !== "running" ||
            cell.yielded > cell.collectedYield ||
            yieldTime === 0
          )
            capture()
          else timer = setTimeout(capture, Math.min(yieldTime, 2_147_483_647))
          if (signal?.aborted) abort()
        })
        clearTimeout(timer)
        cell.wake = undefined
        if (abort) signal?.removeEventListener("abort", abort)
        if (cancelled) return failure("Wait cancelled")
        const content = await this.contents(cell, cutoff, maxTokens)
        if (signal?.aborted) return failure("Wait cancelled")
        let collectedIndex = 0
        cell.parts = cell.parts.filter((part) => {
          const collected = cutoff.parts[collectedIndex]
          if (part.id !== collected?.id) return true
          collectedIndex++
          if (part.sealed && part.through.bytes === collected.through.bytes)
            return false
          part.from = collected.through
          return true
        })
        cell.text.discardThrough(cutoff.text)
        cell.images.discardThrough(cutoff.images)
        cell.textRead = cutoff.text
        cell.imagesRead = cutoff.images
        cell.collectedYield = cutoff.yielded
        this.flush(cell)
        cell.onUpdate = undefined
        this.releasePresentation(cell)
        if (cutoff.status !== "running") {
          cell.collected = true
          await Promise.all([cell.text.close(), cell.images.close()])
          if (!cell.calls.size) this.cells.delete(cell.id)
        }
        if (cutoff.status === "failed" || cutoff.error) {
          const failed = [
            ...content,
            ...failure(cutoff.error ?? "Execution failed").content,
          ]
          return {
            content: failed,
            details: this.details(cell, failed, cutoff.parts, callId),
            isError: true,
          }
        }
        const status =
          cutoff.status === "running"
            ? `running with cell ID ${cell.id}`
            : cutoff.status
        const resultContent: Result["content"] = [
          {
            type: "text",
            text: `Script ${status}\nWall time ${((performance.now() - started) / 1000).toFixed(1)} seconds\nOutput:\n`,
          },
          ...content,
        ]
        return {
          content: resultContent,
          details: this.details(cell, resultContent, cutoff.parts, callId),
        }
      })
      .catch((error: unknown) =>
        failure(error instanceof Error ? error.message : String(error)),
      )
    cell.collection = waiting.then(() => {
      cell.collectors--
    })
    if (!signal) return waiting
    let abort: (() => void) | undefined
    const cancelled = new Promise<Result>((resolve) => {
      abort = () => resolve(failure("Wait cancelled"))
      signal.addEventListener("abort", abort, { once: true })
      if (signal.aborted) abort()
    })
    try {
      return await Promise.race([waiting, cancelled])
    } finally {
      if (abort) signal.removeEventListener("abort", abort)
    }
  }

  private async contents(
    cell: Cell,
    cutoff: Cutoff,
    maxTokens: number,
  ): Promise<Result["content"]> {
    const texts = cutoff.parts.filter((part) => part.type === "text")
    const first = texts[0]
    const last = texts.at(-1)
    const bounded =
      first && last
        ? await cell.text.read(first.from, last.through, maxTokens)
        : undefined
    const truncated = bounded && bounded.original_token_count > maxTokens
    const mixed = cutoff.parts.some((part) => part.type === "image")
    const headEnd = first ? first.from.bytes + maxTokens * 2 : 0
    const tailStart = last ? last.through.bytes - maxTokens * 2 : 0
    const content: Result["content"] = []
    let addedText = false
    let marked = false
    for (const part of cutoff.parts) {
      if (part.type === "image") {
        content.push({
          type: "image",
          mimeType: part.mimeType!,
          data: (
            await cell.images.readRange(part.from.bytes, part.through.bytes)
          ).toString(),
        })
      } else if (truncated && mixed) {
        let text = addedText
          ? ""
          : bounded.output.slice(0, bounded.output.indexOf("\n\n") + 2)
        if (part.from.bytes < headEnd) {
          const head = await cell.text.readRange(
            part.from.bytes,
            Math.min(part.through.bytes, headEnd),
          )
          text += new TextDecoder().decode(head, { stream: true })
        }
        if (!marked && part.through.bytes >= headEnd) {
          text += `…${bounded.original_token_count - maxTokens} tokens truncated…`
          marked = true
        }
        if (part.through.bytes > tailStart) {
          const tail = await cell.text.readRange(
            Math.max(part.from.bytes, tailStart),
            part.through.bytes,
          )
          let start = 0
          while (start < tail.length && (tail[start]! & 0xc0) === 0x80) start++
          text += tail.subarray(start).toString()
        }
        if (text) content.push({ type: "text", text })
        addedText = true
      } else if (truncated) {
        if (!addedText) content.push({ type: "text", text: bounded.output })
        addedText = true
      } else
        content.push({
          type: "text",
          text: (
            await cell.text.readRange(part.from.bytes, part.through.bytes)
          ).toString(),
        })
    }
    return content
  }

  private details(
    cell: Cell,
    content: Result["content"] = [],
    parts: Part[] = [],
    callId = cell.parentId,
  ): ExecutionDetails {
    cell.presentation.status = cell.status
    const output = outputActivity(cell.presentation, cell.outputRevision)
    const operations =
      callId === cell.parentId
        ? cell.presentation.operations
            .flatMap((item) => operationActivity(item) ?? [])
            .concat(output ?? [])
        : []
    const imageOwners = parts
      .filter((part) => part.type === "image")
      .map((part) => {
        const owner =
          part.owner === undefined ? output?.id : `${cell.id}/${part.owner}`
        return operations.some((item) => item.id === owner) ? owner! : null
      })
    return {
      ...activityDetails(
        this.activityUpdate(cell, structuredClone(operations), callId),
        content,
        imageOwners,
      ),
      contentHash: contentHash(content),
      executionHash: executionHash(cell.presentation),
      imageOrigins: parts
        .filter((part) => part.type === "image")
        .map((part) =>
          part.owner === undefined ? null : `${cell.id}/${part.owner}`,
        ),
      execution: structuredClone(cell.presentation),
    }
  }

  private update(cell: Cell, operation?: OperationPresentation): void {
    cell.presentation.status = cell.status
    cell.revision++
    if (operation) operation.revision = cell.revision
    else cell.outputRevision = cell.revision
    const omitted = this.trimOperations(cell.presentation, (candidate) =>
      cell.activeOperations.has(candidate),
    )
    for (const trimmed of omitted) trimmed.revision = ++cell.revision
    const changed = operation ? [operation, ...omitted] : omitted
    const activity = changed.flatMap((item) => operationActivity(item) ?? [])
    if (!operation) {
      const output = outputActivity(cell.presentation, cell.outputRevision)
      if (output) activity.push(output)
    }
    for (const item of activity)
      cell.activityPending.set(item.id, structuredClone(item))
    this.pi.events.emit(
      activityType,
      this.activityUpdate(cell, structuredClone(activity)),
    )
    if (changed.length)
      this.pi.events.emit(journalType, {
        cell_id: cell.id,
        parent_call_id: cell.parentId,
        session_id: cell.sessionId,
        status: cell.status,
        events: changed.map((item) => ({
          type: "presentation",
          presentation: structuredClone(item),
        })),
      } satisfies Journal)
    const invalidates = [
      ...(this.presentations.get(cell.id)?.invalidates ?? []),
    ]
    if (!invalidates.length)
      cell.onUpdate?.({ content: [], details: this.details(cell) })
    for (const invalidate of invalidates) invalidate()
    this.releasePresentation(cell)
  }

  private releasePresentation(cell: Cell): void {
    if (
      cell.status === "running" ||
      cell.onUpdate ||
      cell.activeOperations.size
    )
      return
    this.presentations.delete(cell.id)
  }

  private settleOperation(cell: Cell, operation: OperationPresentation): void {
    if (!cell.activeOperations.delete(operation)) return
  }

  private trimOperations(
    execution: ExecutionDetails["execution"],
    active: (operation: OperationPresentation) => boolean,
  ): OperationPresentation[] {
    const settled = execution.operations.filter(
      (operation) =>
        !active(operation) && (operation.output || operation.resultText),
    )
    if (settled.length <= 8) return []
    const omitted = settled
      .toSorted((a, b) => (a.revision ?? 0) - (b.revision ?? 0))
      .slice(0, -8)
    for (const operation of omitted) {
      execution.omitted = true
      if (operation.status === "failed") execution.omittedFailure = true
      operation.outputOmitted = true
      delete operation.output
      delete operation.resultText
    }
    return omitted
  }

  private restore(
    original: ExecutionDetails["execution"],
    invalidate: () => void,
  ): ExecutionDetails["execution"] | undefined {
    if (!this.context) {
      this.pendingRenders.add(invalidate)
      return undefined
    }
    const records = this.context?.sessionManager
      .getBranch()
      .filter(
        (entry) =>
          entry.type === "custom" &&
          entry.customType === journalType &&
          (entry.data as Journal)?.cell_id === original.cellId &&
          (entry.data as Journal)?.parent_call_id === original.parentCallId &&
          (!original.sessionId ||
            (entry.data as Journal)?.session_id === original.sessionId),
      )
    if (!records?.length) return undefined
    const execution = structuredClone(original)
    delete execution.output
    for (const entry of records) {
      if (entry.type !== "custom") continue
      const record = entry.data as Journal
      execution.status = record.status
      for (const event of record.events) {
        if (event.output !== undefined)
          execution.output = boundedPreview(
            (event.replace_output ? "" : (execution.output ?? "")) +
              event.output,
          )
        if (event.error && !event.child_id) execution.error = event.error
        if (event.presentation) {
          const presentation = structuredClone(event.presentation)
          const index = execution.operations.findIndex(
            (operation) => operation.id === presentation.id,
          )
          if (index < 0) execution.operations.push(presentation)
          else execution.operations[index] = presentation
          execution.operations.sort((a, b) => a.order - b.order)
          this.trimOperations(
            execution,
            (operation) => operation.status === "running" && !operation.input,
          )
        }
      }
    }
    if (execution.status === "running")
      execution.status = "interrupted or unknown"
    for (const operation of execution.operations)
      if (operation.status === "running") {
        operation.status = "interrupted or unknown"
        operation.output = boundedPreview(
          (operation.output ? operation.output + "\n" : "") +
            "[Interrupted or unknown]",
        )
      }
    return execution
  }

  private record(cell: Cell, event: Activity): void {
    if (this.closed) return
    if (
      cell.eventCount >= 4096 &&
      event.type !== "process-completed" &&
      (event.child_id ||
        !["completed", "failed", "terminated"].includes(event.type))
    )
      throw new Error("Execution activity exceeds 4096 records")
    cell.eventCount++
    this.pi.events.emit(journalType, {
      cell_id: cell.id,
      parent_call_id: cell.parentId,
      session_id: cell.sessionId,
      status: cell.status,
      events: [structuredClone(event)],
    } satisfies Journal)
    cell.events.push(event)
    cell.eventBytes += Buffer.byteLength(JSON.stringify(event))
    if (cell.events.length >= 16 || cell.eventBytes >= 8192) this.flush(cell)
  }

  private flush(cell: Cell): void {
    if (cell.scriptOutput) {
      cell.events.push({
        type: "script-output",
        output: cell.scriptOutput,
        ...(cell.scriptOutputReset ? { replace_output: true } : {}),
      })
      cell.scriptOutput = ""
      cell.scriptOutputReset = false
    }
    if ((!cell.events.length && !cell.activityPending.size) || this.closed)
      return
    const empty = () => ({
      cell_id: cell.id,
      parent_call_id: cell.parentId,
      session_id: cell.sessionId,
      status: cell.status,
      events: [] as Activity[],
      activity: this.activityUpdate(cell, []),
    })
    let batch = empty()
    const overhead = Buffer.byteLength(JSON.stringify(batch))
    let bytes = overhead
    const reserve = (value: Activity | ActivityOperation) => {
      const extra = Buffer.byteLength(JSON.stringify(value)) + 1
      if (
        (batch.events.length || batch.activity.operations.length) &&
        (bytes + extra > 8192 || batch.events.length >= 16)
      ) {
        this.pi.appendEntry<Journal>(journalType, batch)
        batch = empty()
        bytes = overhead
      }
      // A single bounded body may exceed the batch threshold; never split its facts.
      bytes += extra
    }
    for (const event of cell.events.splice(0)) {
      reserve(event)
      batch.events.push(event)
    }
    for (const operation of cell.activityPending.values()) {
      reserve(operation)
      batch.activity.operations.push(operation)
    }
    this.pi.appendEntry<Journal>(journalType, batch)
    cell.activityPending.clear()
    cell.eventBytes = 0
  }

  private activityUpdate(
    cell: Cell,
    operations: ActivityOperation[],
    callId = cell.parentId,
  ): ActivityUpdate {
    return {
      version: 1,
      id: callId === cell.parentId ? cell.id : `${cell.id}/${callId}`,
      callId,
      sessionId: cell.sessionId,
      revision: cell.revision,
      operations,
    }
  }

  async close(): Promise<void> {
    if (this.closed) return
    this.closing = true
    const cells = [...this.cells.values()]
    for (const cell of cells) cell.accepting = false
    await Promise.all(
      cells.map((cell) => this.stop(cell, "Execution session closed")),
    )
    await Promise.all(cells.map((cell) => cell.collection))
    const incomplete = cells.some((cell) => cell.calls.size > 0)
    this.closed = true
    this.values.clear()
    this.presentations.clear()
    this.pendingRenders.clear()
    this.cells.clear()
    await Promise.all(
      cells.flatMap((cell) => [cell.text.close(), cell.images.close()]),
    )
    if (incomplete)
      throw new Error("Execution cleanup did not finish within 2000 ms")
  }
}
