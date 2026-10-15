import type {
  ExtensionAPI,
  ToolExecutionEndEvent,
  ToolExecutionStartEvent,
  ToolExecutionUpdateEvent,
} from "@earendil-works/pi-coding-agent"
import { ActivityAdapters } from "./tool-adapters/index.ts"
import type {
  ActivityItem,
  ActivityResult,
  CallFacts,
} from "./tool-adapters/types.ts"

type Call = { id: string; name: string; arguments: unknown }
type State = {
  facts: CallFacts
  items?: ActivityItem[]
  retained?: ActivityResult
}

export class ActivityItems {
  private readonly calls = new WeakMap<object, State>()
  private readonly entries = new WeakMap<object, Map<number, State>>()
  private readonly live = new Map<string, State>()
  private readonly byId = new Map<string, Set<State>>()
  private readonly adapters = new ActivityAdapters()

  constructor(
    private readonly pi: Pick<ExtensionAPI, "getAllTools" | "getCommands">,
  ) {}

  bind(
    owner: object,
    call: Call,
    live: boolean,
    cwd: string,
    entry?: object,
    index?: number,
  ) {
    const parts = entry && this.entries.get(entry)
    const state: State = this.calls.get(owner) ??
      (index !== undefined ? parts?.get(index) : undefined) ?? {
        facts: {
          id: call.id,
          name: call.name,
          args: call.arguments,
          cwd,
          status: "unknown",
          provenance: undefined,
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
      const retained = parts ?? new Map<number, State>()
      retained.set(index, state)
      this.entries.set(entry, retained)
    }
  }

  start(event: ToolExecutionStartEvent, cwd: string) {
    if (event.parentToolCallId) return
    const state = this.live.get(event.toolCallId)
    if (!state) return
    state.facts = {
      ...state.facts,
      args: event.args,
      cwd,
      status: "running",
      provenance: this.pi
        .getAllTools()
        .find((tool) => tool.name === event.toolName)?.sourceInfo,
      skills: this.pi
        .getCommands()
        .flatMap((command) =>
          command.source === "skill" && command.sourceInfo?.path
            ? [{ name: command.name, path: command.sourceInfo.path }]
            : [],
        ),
    }
    delete state.items
  }

  update(event: ToolExecutionUpdateEvent) {
    if (event.parentToolCallId) return
    const state = this.live.get(event.toolCallId)
    if (!state) return
    state.facts.result = { ...event.partialResult, isError: false }
    delete state.items
  }

  end(event: ToolExecutionEndEvent) {
    if (event.parentToolCallId) return
    const state = this.live.get(event.toolCallId)
    if (!state) return
    state.facts.result = { ...event.result, isError: event.isError }
    state.facts.status = event.isError ? "failed" : "completed"
    this.live.delete(event.toolCallId)
    delete state.items
  }

  items(owner: object, result?: ActivityResult): readonly ActivityItem[] {
    const state = this.calls.get(owner)
    if (!state) return []
    if (result && result !== state.retained) {
      state.retained = result
      state.facts.result = result
      if (state.facts.status !== "running")
        state.facts.status = result.isError ? "failed" : "completed"
      delete state.items
    }
    return (state.items ??= this.adapters.describe(state.facts))
  }

  observe(type: string, data: unknown, live: boolean) {
    const changed = this.adapters.observe(type, data, live)
    for (const id of changed)
      for (const state of this.byId.get(id) ?? []) delete state.items
    return changed.length > 0
  }

  rebase() {
    this.adapters.clear()
    for (const states of this.byId.values())
      for (const state of states) delete state.items
    this.byId.clear()
    this.live.clear()
  }

  stop() {
    for (const state of this.live.values()) {
      state.facts.status = "unknown"
      delete state.items
    }
    this.live.clear()
  }
}
