import { createHash } from "node:crypto"
import type {
  ExtensionAPI,
  SessionEntry,
  ToolExecutionEndEvent,
  ToolExecutionStartEvent,
  ToolExecutionUpdateEvent,
} from "@earendil-works/pi-coding-agent"
import { ActivityAdapters } from "./tool-adapters/index.ts"
import { fallbackItems } from "./tool-adapters/fallback.ts"
import type {
  ActivityItem,
  ActivityResult,
  CallFacts,
} from "./tool-adapters/types.ts"
import { argumentsOf } from "./tool-adapters/types.ts"

export const nativeToolType = "pi-chat.native-tool"
type NativeTool = {
  version: 1
  entryId: string
  contentIndex: number
  callId: string
  name: string
  cwd: string
  argsHash: string
}
const argsHash = (args: unknown) =>
  createHash("sha256").update(JSON.stringify({ args })).digest("hex")
const sourceKey = (source: Pick<NativeTool, "entryId" | "contentIndex">) =>
  JSON.stringify([source.entryId, source.contentIndex])

type Call = { id: string; name: string; arguments: unknown }
type State = {
  facts: CallFacts
  pending: boolean
  items?: ActivityItem[]
  retained?: ActivityResult
  source?: Pick<NativeTool, "entryId" | "contentIndex">
}

export class ActivityItems {
  private readonly calls = new WeakMap<object, State>()
  private readonly entries = new WeakMap<object, Map<number, State>>()
  private readonly live = new Map<string, State>()
  private readonly byId = new Map<string, Set<State>>()
  private readonly adapters = new ActivityAdapters()
  private readonly nativeTools = new Map<string, NativeTool>()

  constructor(
    private readonly pi: Pick<
      ExtensionAPI,
      "getAllTools" | "getCommands" | "appendEntry"
    >,
  ) {}

  bind(
    owner: object,
    call: Call,
    live: boolean,
    cwd: string,
    sessionId: string,
    entry?: SessionEntry,
    index?: number,
  ) {
    const parts = entry && this.entries.get(entry)
    const state: State = this.calls.get(owner) ??
      (index !== undefined ? parts?.get(index) : undefined) ?? {
        pending: live,
        facts: {
          id: call.id,
          sessionId,
          name: call.name,
          args: call.arguments,
          cwd,
          status: "unknown",
          builtin: false,
          result: undefined,
          skills: [],
        },
      }
    this.calls.set(owner, state)
    const states = this.byId.get(call.id) ?? new Set<State>()
    states.add(state)
    this.byId.set(call.id, states)
    if (live) this.live.set(call.id, state)
    if (entry && index !== undefined) {
      state.source = { entryId: entry.id, contentIndex: index }
      const retained = parts ?? new Map<number, State>()
      retained.set(index, state)
      this.entries.set(entry, retained)
    }
  }

  start(event: ToolExecutionStartEvent, cwd: string) {
    if (event.parentToolCallId) return
    const state = this.live.get(event.toolCallId)
    if (!state) return
    state.pending = false
    state.facts = {
      ...state.facts,
      args: event.args,
      cwd,
      status: "running",
      builtin:
        this.pi.getAllTools().find((tool) => tool.name === event.toolName)
          ?.sourceInfo.source === "builtin",
    }
    delete state.items
  }

  update(event: ToolExecutionUpdateEvent) {
    if (event.parentToolCallId) return
    const state = this.live.get(event.toolCallId)
    if (!state) return
    state.pending = false
    state.facts.result = { ...event.partialResult, isError: false }
    delete state.items
  }

  end(event: ToolExecutionEndEvent) {
    if (event.parentToolCallId) return
    const state = this.live.get(event.toolCallId)
    if (!state) return
    state.pending = false
    state.facts.result = { ...event.result, isError: event.isError }
    state.facts.status = event.isError ? "failed" : "completed"
    if (state.source && state.facts.builtin)
      this.pi.appendEntry(nativeToolType, {
        version: 1,
        ...state.source,
        callId: state.facts.id,
        name: state.facts.name,
        cwd: state.facts.cwd,
        argsHash: argsHash(state.facts.args),
      } satisfies NativeTool)
    this.live.delete(event.toolCallId)
    delete state.items
  }

  items(owner: object, result?: ActivityResult): readonly ActivityItem[] {
    const state = this.calls.get(owner)
    if (!state) return []
    if (result && result !== state.retained) {
      state.pending = false
      state.retained = result
      state.facts.result = result
      if (state.facts.status !== "running")
        state.facts.status = result.isError ? "failed" : "completed"
      delete state.items
    }
    if (state.pending) return []
    if (!state.items) {
      const native =
        state.source && this.nativeTools.get(sourceKey(state.source))
      if (
        native &&
        native.callId === state.facts.id &&
        native.name === state.facts.name &&
        native.argsHash === argsHash(state.facts.args)
      ) {
        state.facts.builtin = true
        state.facts.cwd = native.cwd
      }
      state.facts.skills = this.pi
        .getCommands()
        .flatMap((command) =>
          command.source === "skill" && command.sourceInfo?.path
            ? [{ name: command.name, path: command.sourceInfo.path }]
            : [],
        )
      state.items = this.adapters.describe(state.facts)
    }
    return state.items
  }

  observe(type: string, data: unknown, live: boolean) {
    let changed: string[]
    if (type === nativeToolType) {
      const value = argumentsOf(data)
      if (
        value["version"] !== 1 ||
        !["entryId", "callId", "name", "cwd", "argsHash"].every(
          (key) => typeof value[key] === "string" && value[key].length > 0,
        ) ||
        !Number.isSafeInteger(value["contentIndex"]) ||
        (value["contentIndex"] as number) < 0
      )
        return false
      const native = data as NativeTool
      this.nativeTools.set(sourceKey(native), native)
      changed = [native.callId]
    } else changed = this.adapters.observe(type, data, live)
    for (const id of changed)
      for (const state of this.byId.get(id) ?? []) {
        if (live) state.pending = false
        delete state.items
      }
    return changed.length > 0
  }

  sourceItems(owner: object): readonly ActivityItem[] {
    const state = this.calls.get(owner)
    if (!state) return []
    const items = fallbackItems(state.facts)
    for (const item of items) {
      while (state.items?.some((normal) => normal.id === item.id))
        item.id = `source:${item.id}`
      if (item.body.result)
        item.body.result = {
          ...item.body.result,
          // Images keep their normal activity owner while Find reveals text.
          content: item.body.result.content.filter(
            (part) => part.type === "text",
          ),
        }
    }
    return items
  }

  rebase() {
    this.adapters.clear()
    this.nativeTools.clear()
    for (const states of this.byId.values())
      for (const state of states) {
        state.pending = false
        state.facts.builtin = false
        delete state.items
      }
    this.byId.clear()
    this.live.clear()
  }

  stop() {
    for (const state of this.live.values()) {
      state.pending = false
      state.facts.status = "unknown"
      delete state.items
    }
    this.live.clear()
  }
}
