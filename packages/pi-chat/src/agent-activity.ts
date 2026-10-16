import { DynamicBorder } from "@earendil-works/pi-coding-agent"
import { Box, Spacer, Text, type Component } from "@earendil-works/pi-tui"
import type { NativeChatHost, Occurrence } from "./native-host.ts"
import type { RelationshipFact } from "./relationships.ts"
import type { MessagePhase } from "./provider-phase.ts"

export type DeliveryKind = "initial" | "steering" | "follow-up"
export type AgentActivity = {
  request: Occurrence
  lastAssistant?: Occurrence
  lastCommitted?: Occurrence
  final?: Occurrence
  finalParts?: number[]
  settled: boolean
  cancelled: boolean
  manualExpanded?: boolean
  keepOpen: boolean
  header?: AgentActivityHeader
}

export class AgentActivityIndex {
  private candidates = new WeakMap<object, DeliveryKind>()
  private owners = new WeakMap<Occurrence, AgentActivity>()
  private phases = new WeakMap<Occurrence, Map<number, MessagePhase>>()
  private phaseEvidence = new WeakSet<Occurrence>()
  private readonly entries = new Map<string, AgentActivity>()
  private current: AgentActivity | undefined

  clear() {
    this.candidates = new WeakMap()
    this.owners = new WeakMap()
    this.phases = new WeakMap()
    this.phaseEvidence = new WeakSet()
    this.entries.clear()
    this.current = undefined
  }

  observe(messages: object[], kind: DeliveryKind) {
    for (const message of messages) this.candidates.set(message, kind)
  }

  start(occurrence: Occurrence): RelationshipFact | undefined {
    const message = occurrence.message
    if (!message) return
    let previous: RelationshipFact | undefined
    if (message.role === "user") {
      const kind = this.candidates.get(message)
      if (kind === "initial" || kind === "follow-up") {
        if (this.current && !this.current.settled) previous = this.settle(false)
        this.current = {
          request: occurrence,
          settled: false,
          cancelled: false,
          keepOpen: false,
        }
      } else if (kind !== "steering") {
        // A user row without observed delivery cannot establish an agent activity boundary.
        this.current = undefined
      }
      if (this.current) {
        this.current.settled = false
        delete this.current.lastAssistant
        delete this.current.final
        delete this.current.finalParts
      }
    }
    if (
      !this.current ||
      (this.current.settled &&
        message.role !== "assistant" &&
        message.role !== "user")
    )
      return previous
    this.owners.set(occurrence, this.current)
    if (message.role === "assistant") {
      this.current.settled = false
      this.current.lastAssistant = occurrence
      delete this.current.final
      delete this.current.finalParts
    }
    return previous
  }

  committed(occurrence: Occurrence): RelationshipFact | undefined {
    const agentActivity = this.find(occurrence)
    if (!agentActivity || !occurrence.entry || !agentActivity.request.entry)
      return
    this.entries.set(occurrence.entry.id, agentActivity)
    agentActivity.lastCommitted = occurrence
    const delivery =
      occurrence.message?.role === "user"
        ? this.candidates.get(occurrence.message)
        : undefined
    return {
      version: 1,
      kind: "member",
      requestId: agentActivity.request.entry.id,
      sourceId: occurrence.entry.id,
      ...(delivery ? { delivery } : {}),
    }
  }

  find(occurrence: Occurrence | undefined): AgentActivity | undefined {
    if (!occurrence) return undefined
    const owner = occurrence.parent ?? occurrence
    return (
      this.owners.get(owner) ??
      (owner.entry && this.entries.get(owner.entry.id))
    )
  }

  hasFinalResponse() {
    return Boolean(
      this.current && !this.current.settled && this.current.finalParts?.length,
    )
  }

  notePhase(occurrence: Occurrence, contentIndex: number, phase: MessagePhase) {
    const phases = new Map(this.phases.get(occurrence))
    phases.set(contentIndex, phase)
    this.reconcilePhases(occurrence, phases, true)
  }

  reconcilePhases(
    occurrence: Occurrence,
    phases: Map<number, MessagePhase>,
    hasEvidence: boolean,
  ) {
    const agentActivity = this.find(occurrence)
    const message = occurrence.message
    if (!agentActivity || message?.role !== "assistant") return
    this.phases.set(occurrence, new Map(phases))
    if (hasEvidence) this.phaseEvidence.add(occurrence)
    const finalParts = [...phases]
      .filter(
        ([index, value]) =>
          value === "final_answer" &&
          message.content[index]?.type === "text" &&
          message.content[index].text.trim(),
      )
      .map(([index]) => index)
    if (finalParts.length) {
      agentActivity.final = occurrence
      agentActivity.finalParts = finalParts
    } else if (this.same(agentActivity.final, occurrence)) {
      delete agentActivity.final
      delete agentActivity.finalParts
    }
  }

  settle(cancelled: boolean): RelationshipFact | undefined {
    const agentActivity = this.current
    if (!agentActivity || agentActivity.settled) return
    agentActivity.settled = true
    agentActivity.cancelled = cancelled
    const candidate = agentActivity.lastAssistant
    const message = candidate?.message
    const explicitFinal = Boolean(agentActivity.finalParts?.length)
    if (
      !explicitFinal &&
      candidate &&
      !cancelled &&
      !this.phaseEvidence.has(candidate) &&
      message?.role === "assistant" &&
      message.stopReason !== "error" &&
      message.stopReason !== "aborted" &&
      !message.content.some((part) => part.type === "toolCall") &&
      message.content.some((part) => part.type === "text" && part.text.trim())
    )
      agentActivity.final = candidate
    else if (!explicitFinal) {
      delete agentActivity.final
      delete agentActivity.finalParts
    }
    if (!agentActivity.request.entry || !agentActivity.lastCommitted?.entry)
      return
    return {
      version: 1,
      kind: "settled",
      requestId: agentActivity.request.entry.id,
      sourceId: agentActivity.lastCommitted.entry.id,
      ...(agentActivity.final?.entry
        ? { finalId: agentActivity.final.entry.id }
        : {}),
      ...(agentActivity.finalParts
        ? { finalParts: agentActivity.finalParts }
        : {}),
      cancelled,
    }
  }

  restore(
    facts: RelationshipFact[],
    occurrenceFor: (id: string) => Occurrence | undefined,
  ) {
    this.clear()
    const agentActivities = new Map<string, AgentActivity>()
    for (const fact of facts) {
      if (
        fact.kind !== "member" ||
        (fact.delivery !== "initial" && fact.delivery !== "follow-up") ||
        fact.requestId !== fact.sourceId
      )
        continue
      const request = occurrenceFor(fact.requestId)
      if (!request) continue
      const agentActivity: AgentActivity = {
        request,
        settled: false,
        cancelled: false,
        keepOpen: false,
      }
      agentActivities.set(fact.requestId, agentActivity)
      this.current = agentActivity
    }
    for (const fact of facts) {
      const agentActivity = agentActivities.get(fact.requestId)
      if (!agentActivity) continue
      if (fact.kind === "member") {
        if (fact.delivery === "steering") {
          agentActivity.settled = false
          agentActivity.cancelled = false
          delete agentActivity.final
          delete agentActivity.finalParts
        }
        this.entries.set(fact.sourceId, agentActivity)
        const source = occurrenceFor(fact.sourceId)
        if (source) {
          agentActivity.lastCommitted = source
          if (source.message?.role === "assistant") {
            agentActivity.lastAssistant = source
            delete agentActivity.final
            delete agentActivity.finalParts
          }
        }
      } else if (fact.kind === "phase") {
        const source = occurrenceFor(fact.sourceId)
        if (source) this.notePhase(source, fact.contentIndex, fact.phase)
      } else if (fact.kind === "settled") {
        agentActivity.settled = true
        agentActivity.cancelled = fact.cancelled
        const final = fact.finalId ? occurrenceFor(fact.finalId) : undefined
        if (final) agentActivity.final = final
        else delete agentActivity.final
        if (final && fact.finalParts) agentActivity.finalParts = fact.finalParts
        else delete agentActivity.finalParts
      }
    }
    if (this.current?.settled) this.current = undefined
  }

  isRequest(occurrence: Occurrence | undefined, agentActivity: AgentActivity) {
    return this.same(occurrence?.parent ?? occurrence, agentActivity.request)
  }

  isFinal(occurrence: Occurrence | undefined, agentActivity: AgentActivity) {
    const owner = occurrence?.parent ?? occurrence
    if (
      !this.isFinalMessage(occurrence, agentActivity) ||
      owner?.message?.role !== "assistant"
    )
      return false
    if (occurrence?.contentIndex !== undefined)
      return (
        owner.message.content[occurrence.contentIndex]?.type === "text" &&
        (!agentActivity.finalParts ||
          agentActivity.finalParts.includes(occurrence.contentIndex))
      )
    return owner === occurrence && !this.needsParts(owner)
  }

  isFinalMessage(
    occurrence: Occurrence | undefined,
    agentActivity: AgentActivity,
  ) {
    return this.same(occurrence?.parent ?? occurrence, agentActivity.final)
  }

  needsParts(occurrence: Occurrence) {
    const agentActivity = this.find(occurrence)
    return Boolean(
      agentActivity &&
      this.same(occurrence, agentActivity.final) &&
      occurrence.message?.role === "assistant" &&
      (Boolean(agentActivity.finalParts?.length) ||
        occurrence.message.content.some(
          (part) => part.type === "thinking" && part.thinking.trim(),
        )),
    )
  }

  expanded(agentActivity: AgentActivity) {
    return (
      agentActivity.manualExpanded ??
      (!agentActivity.final ||
        agentActivity.cancelled ||
        agentActivity.keepOpen)
    )
  }

  inspect(occurrence: Occurrence | undefined) {
    const agentActivity = this.find(occurrence)
    if (agentActivity) agentActivity.keepOpen = true
  }

  private same(left: Occurrence | undefined, right: Occurrence | undefined) {
    return Boolean(
      left &&
      right &&
      (left === right ||
        (left.entry &&
          right.entry &&
          left.entry.id === right.entry.id &&
          left.contentIndex === right.contentIndex &&
          (left.itemOrdinal ?? 0) === (right.itemOrdinal ?? 0))),
    )
  }
}

export class AgentActivityHeader implements Component {
  focused = false
  readonly spacing = new Spacer(1)

  constructor(
    private readonly adapter: NativeChatHost,
    readonly agentActivity: AgentActivity,
  ) {}

  invalidate() {}

  render(width: number) {
    const end = this.agentActivity.settled
      ? Date.parse(this.agentActivity.lastCommitted!.entry!.timestamp)
      : Date.now()
    const seconds = Math.max(
      0,
      Math.floor(
        (end - Date.parse(this.agentActivity.request.entry!.timestamp)) / 1_000,
      ),
    )
    const theme = this.adapter.extensionUI.theme
    const summary = `Worked for ${Math.floor(seconds / 60)}m ${seconds % 60}s ${this.adapter.agentActivity.expanded(this.agentActivity) ? "▼" : "▶"}`
    const header = new Box(this.adapter.host.outputPad, 0)
    header.addChild(
      new Text(
        theme.fg("muted", this.focused ? theme.underline(summary) : summary),
        0,
        0,
      ),
    )
    header.addChild(new DynamicBorder((line) => theme.fg("borderMuted", line)))
    return header.render(width)
  }

  handleInput(data: string) {
    this.adapter.handleDisclosureInput(data, () =>
      this.adapter.toggleAgentActivity(this.agentActivity),
    )
  }

  handleMouse(event: Parameters<NonNullable<Component["handleMouse"]>>[0]) {
    if (event.type !== "click" || event.button !== "left") return undefined
    this.adapter.toggleAgentActivity(this.agentActivity)
    return { handled: true, focus: true }
  }
}
