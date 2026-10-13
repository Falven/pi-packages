import { Text, type Component } from "@earendil-works/pi-tui"
import type { NativeChatHost, Occurrence } from "./native-host.ts"
import type { RelationshipFact } from "./relationships.ts"

export type DeliveryKind = "initial" | "steering" | "follow-up"
export type WorkHistory = {
  request: Occurrence
  lastAssistant?: Occurrence
  lastCommitted?: Occurrence
  final?: Occurrence
  settled: boolean
  cancelled: boolean
  manualExpanded?: boolean
  keepOpen: boolean
  header?: WorkHeader
}

export class WorkIndex {
  private candidates = new WeakMap<object, DeliveryKind>()
  private owners = new WeakMap<Occurrence, WorkHistory>()
  private readonly entries = new Map<string, WorkHistory>()
  private current: WorkHistory | undefined

  clear() {
    this.candidates = new WeakMap()
    this.owners = new WeakMap()
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
        // A user row without observed delivery cannot establish a work boundary.
        this.current = undefined
      }
      if (this.current) {
        this.current.settled = false
        delete this.current.lastAssistant
        delete this.current.final
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
    }
    return previous
  }

  committed(occurrence: Occurrence): RelationshipFact | undefined {
    const work = this.find(occurrence)
    if (!work || !occurrence.entry || !work.request.entry) return
    this.entries.set(occurrence.entry.id, work)
    work.lastCommitted = occurrence
    const delivery =
      occurrence.message?.role === "user"
        ? this.candidates.get(occurrence.message)
        : undefined
    return {
      version: 1,
      kind: "member",
      requestId: work.request.entry.id,
      sourceId: occurrence.entry.id,
      ...(delivery ? { delivery } : {}),
    }
  }

  find(occurrence: Occurrence | undefined): WorkHistory | undefined {
    if (!occurrence) return undefined
    const owner = occurrence.parent ?? occurrence
    return (
      this.owners.get(owner) ??
      (owner.entry && this.entries.get(owner.entry.id))
    )
  }

  settle(cancelled: boolean): RelationshipFact | undefined {
    const work = this.current
    if (!work || work.settled) return
    work.settled = true
    work.cancelled = cancelled
    const candidate = work.lastAssistant
    const message = candidate?.message
    if (
      candidate &&
      !cancelled &&
      message?.role === "assistant" &&
      message.stopReason !== "error" &&
      message.stopReason !== "aborted" &&
      !message.content.some((part) => part.type === "toolCall") &&
      message.content.some((part) => part.type === "text" && part.text.trim())
    )
      work.final = candidate
    else delete work.final
    if (!work.request.entry || !work.lastCommitted?.entry) return
    return {
      version: 1,
      kind: "settled",
      requestId: work.request.entry.id,
      sourceId: work.lastCommitted.entry.id,
      ...(work.final?.entry ? { finalId: work.final.entry.id } : {}),
      cancelled,
    }
  }

  restore(
    facts: RelationshipFact[],
    occurrenceFor: (id: string) => Occurrence | undefined,
  ) {
    this.clear()
    const works = new Map<string, WorkHistory>()
    for (const fact of facts) {
      if (
        fact.kind !== "member" ||
        (fact.delivery !== "initial" && fact.delivery !== "follow-up") ||
        fact.requestId !== fact.sourceId
      )
        continue
      const request = occurrenceFor(fact.requestId)
      if (!request) continue
      const work: WorkHistory = {
        request,
        settled: false,
        cancelled: false,
        keepOpen: false,
      }
      works.set(fact.requestId, work)
      this.current = work
    }
    for (const fact of facts) {
      const work = works.get(fact.requestId)
      if (!work) continue
      if (fact.kind === "member") {
        if (fact.delivery === "steering") {
          work.settled = false
          work.cancelled = false
          delete work.final
        }
        this.entries.set(fact.sourceId, work)
        const source = occurrenceFor(fact.sourceId)
        if (source) work.lastCommitted = source
      } else {
        work.settled = true
        work.cancelled = fact.cancelled
        const final = fact.finalId ? occurrenceFor(fact.finalId) : undefined
        if (final) work.final = final
        else delete work.final
      }
    }
    if (this.current?.settled) this.current = undefined
  }

  isRequest(occurrence: Occurrence | undefined, work: WorkHistory) {
    return this.same(occurrence?.parent ?? occurrence, work.request)
  }

  isFinal(occurrence: Occurrence | undefined, work: WorkHistory) {
    const owner = occurrence?.parent ?? occurrence
    if (
      !this.isFinalMessage(occurrence, work) ||
      owner?.message?.role !== "assistant"
    )
      return false
    if (occurrence?.contentIndex !== undefined)
      return owner.message.content[occurrence.contentIndex]?.type === "text"
    return owner === occurrence && !this.needsParts(owner)
  }

  isFinalMessage(occurrence: Occurrence | undefined, work: WorkHistory) {
    return this.same(occurrence?.parent ?? occurrence, work.final)
  }

  needsParts(occurrence: Occurrence) {
    const work = this.find(occurrence)
    return Boolean(
      work &&
      this.same(occurrence, work.final) &&
      occurrence.message?.role === "assistant" &&
      occurrence.message.content.some(
        (part) => part.type === "thinking" && part.thinking.trim(),
      ),
    )
  }

  expanded(work: WorkHistory) {
    return (
      !work.final || work.cancelled || (work.manualExpanded ?? work.keepOpen)
    )
  }

  inspect(occurrence: Occurrence | undefined) {
    const work = this.find(occurrence)
    if (work) work.keepOpen = true
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

export class WorkHeader extends Text {
  focused = false

  constructor(
    private readonly adapter: NativeChatHost,
    readonly work: WorkHistory,
  ) {
    super("", 1, 0)
  }

  override render(width: number) {
    this.setText(
      `${this.focused ? "→" : this.adapter.work.expanded(this.work) ? "▾" : "▸"} Worked`,
    )
    return super.render(width)
  }

  handleInput(data: string) {
    this.adapter.handleDisclosureInput(data, () =>
      this.adapter.toggleWork(this.work),
    )
  }

  handleMouse(event: Parameters<NonNullable<Component["handleMouse"]>>[0]) {
    if (event.type !== "click" || event.button !== "left") return undefined
    this.adapter.toggleWork(this.work)
    return { handled: true, focus: true }
  }
}
