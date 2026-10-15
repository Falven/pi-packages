import { homedir } from "node:os"
import { basename, resolve } from "node:path"
import type {
  ExtensionAPI,
  ToolExecutionEndEvent,
  ToolExecutionStartEvent,
} from "@earendil-works/pi-coding-agent"
import { stripTerminalSequences } from "@earendil-works/pi-tui"

// Completed categories use a fixed order independent of the calls' source order.
const completed = {
  loaded: ["loaded a tool", "loaded tools"],
  tool: ["called a tool", "called tools"],
  edit: ["edited a file", "edited files"],
  read: ["read files", "read files"],
  command: ["ran a command", "ran commands"],
} as const

type Action = {
  kind: keyof typeof completed
  active: string
  path?: string
}

const generic: Action = { kind: "tool", active: "Calling a tool" }
const nativeTools = new Map<string, Action["kind"]>([
  ["read", "read"],
  ["grep", "read"],
  ["find", "read"],
  ["ls", "read"],
  ["edit", "edit"],
  ["write", "edit"],
  ["bash", "command"],
])

type Call = { id: string }
type CallState = { action: Action; running: number }
type SummaryGroup = { items: readonly { occurrence?: object }[] }

function sourcePath(path: string, cwd: string) {
  return resolve(
    cwd,
    path === "~"
      ? homedir()
      : path.startsWith("~/")
        ? homedir() + path.slice(1)
        : path,
  )
}

function summaryText(value: string) {
  return stripTerminalSequences(value).replace(/\s+/g, " ").trim()
}

export class GroupSummaries {
  private readonly calls = new WeakMap<object, CallState>()
  private readonly entries = new WeakMap<object, Map<number, CallState>>()
  private readonly live = new Map<string, CallState>()
  private readonly groups = new WeakMap<
    SummaryGroup,
    { revision: number; owners: (object | undefined)[]; text: string }
  >()
  private revision = 0
  private sequence = 0

  constructor(
    private readonly pi: Pick<ExtensionAPI, "getAllTools" | "getCommands">,
  ) {}

  bind(
    owner: object,
    call: Call,
    live: boolean,
    entry?: object,
    index?: number,
  ) {
    const parts = entry && this.entries.get(entry)
    const state = this.calls.get(owner) ??
      (index !== undefined ? parts?.get(index) : undefined) ?? {
        action: generic,
        running: 0,
      }
    this.calls.set(owner, state)
    if (live) this.live.set(call.id, state)
    if (entry && index !== undefined) {
      const retained = parts ?? new Map<number, CallState>()
      retained.set(index, state)
      this.entries.set(entry, retained)
    }
  }

  start(event: ToolExecutionStartEvent, cwd: string) {
    if (event.parentToolCallId) return
    const state = this.live.get(event.toolCallId)
    if (!state) return
    state.action = this.classify(event, cwd)
    state.running = ++this.sequence
    this.revision++
  }

  end(event: ToolExecutionEndEvent) {
    if (event.parentToolCallId) return
    const state = this.live.get(event.toolCallId)
    if (!state) return
    state.running = 0
    this.live.delete(event.toolCallId)
    this.revision++
  }

  stop() {
    if (!this.live.size) return
    for (const state of this.live.values()) state.running = 0
    this.live.clear()
    this.revision++
  }

  summary(group: SummaryGroup): string {
    const cached = this.groups.get(group)
    if (
      cached?.revision === this.revision &&
      cached.owners.length === group.items.length &&
      group.items.every(
        (item, index) => item.occurrence === cached.owners[index],
      )
    )
      return cached.text

    const counts = new Map<Action["kind"], Set<object | string>>()
    let running: CallState | undefined
    for (const item of group.items) {
      const state = item.occurrence && this.calls.get(item.occurrence)
      if (state?.running && state.running > (running?.running ?? 0))
        running = state
      const action = state?.action ?? generic
      const items = counts.get(action.kind) ?? new Set<object | string>()
      items.add(action.path ?? item.occurrence ?? item)
      counts.set(action.kind, items)
    }
    const segments = Object.entries(completed).flatMap(([kind, summaries]) => {
      const count = counts.get(kind as Action["kind"])?.size ?? 0
      return count ? [summaries[count === 1 ? 0 : 1]] : []
    })
    const summary = segments.join(", ")
    const text =
      running?.action.active ??
      (summary ? summary[0]!.toUpperCase() + summary.slice(1) : "Worked")
    this.groups.set(group, {
      revision: this.revision,
      owners: group.items.map((item) => item.occurrence),
      text,
    })
    return text
  }

  private classify(event: ToolExecutionStartEvent, cwd: string): Action {
    const tool = this.pi
      .getAllTools()
      .find((candidate) => candidate.name === event.toolName)
    if (tool?.sourceInfo.source !== "builtin") return generic
    const kind = nativeTools.get(event.toolName)
    if (!kind) return generic
    const args: Record<string, unknown> = event.args ?? {}
    const path = typeof args["path"] === "string" ? args["path"] : undefined
    const target = path ? summaryText(basename(path) || path) : undefined
    const pattern =
      typeof args["pattern"] === "string"
        ? summaryText(args["pattern"])
        : undefined
    const command =
      typeof args["command"] === "string"
        ? summaryText(args["command"])
        : undefined
    if (kind === "command")
      return {
        kind,
        active: command ? `Running ${command}` : "Running command",
      }
    if (kind === "edit")
      return path
        ? { kind, path: sourcePath(path, cwd), active: "Editing files" }
        : generic
    if (event.toolName === "read") {
      if (!path) return generic
      const resolved = sourcePath(path, cwd)
      const skill = this.pi
        .getCommands()
        .find(
          (item) =>
            item.source === "skill" && item.sourceInfo?.path === resolved,
        )
      return skill
        ? {
            kind: "loaded",
            path: resolved,
            active: `Reading ${summaryText(skill.name.replace(/^skill:/, ""))} skill`,
          }
        : { kind, active: `Reading ${target}` }
    }
    if (event.toolName === "ls")
      return {
        kind,
        active: target ? `Listing files in ${target} folder` : "Listing files",
      }
    return {
      kind,
      active: target
        ? `Searching files in ${target} folder`
        : pattern
          ? `Searching for ${pattern}`
          : "Searching files",
    }
  }
}
