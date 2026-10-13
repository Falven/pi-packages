import { Text, getKeybindings, type Component } from "@earendil-works/pi-tui"
import type { NativeChatHost, Occurrence } from "./native-host.ts"

export type DeliveryKind = "initial" | "steering" | "follow-up"
export type WorkHistory = {
  request: Occurrence
  lastAssistant?: Occurrence
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

  start(occurrence: Occurrence) {
    const message = occurrence.message
    if (!message) return
    if (message.role === "user") {
      const kind = this.candidates.get(message)
      if (kind === "initial" || kind === "follow-up") {
        if (this.current && !this.current.settled) this.settle(false)
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
      return
    this.owners.set(occurrence, this.current)
    if (message.role === "assistant") {
      this.current.settled = false
      this.current.lastAssistant = occurrence
      delete this.current.final
    }
  }

  committed(occurrence: Occurrence) {
    const work = this.find(occurrence)
    if (work && occurrence.entry) this.entries.set(occurrence.entry.id, work)
  }

  find(occurrence: Occurrence | undefined): WorkHistory | undefined {
    if (!occurrence) return undefined
    const owner = occurrence.parent ?? occurrence
    return (
      this.owners.get(owner) ??
      (owner.entry && this.entries.get(owner.entry.id))
    )
  }

  settle(cancelled: boolean) {
    const work = this.current
    if (!work) return
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
    const keys = getKeybindings()
    if (keys.matches(data, "tui.select.up")) this.adapter.moveDisclosure(-1)
    else if (keys.matches(data, "tui.select.down"))
      this.adapter.moveDisclosure(1)
    else if (keys.matches(data, "tui.select.confirm"))
      this.adapter.toggleWork(this.work)
    else if (keys.matches(data, "tui.select.cancel"))
      this.adapter.returnToComposer()
    else if (this.adapter.host.keybindings.matches(data, "app.tools.expand"))
      this.adapter.host.toggleToolOutputExpansion()
    else if (this.adapter.host.keybindings.matches(data, "app.message.copy"))
      void this.adapter.host.handleCopyCommand({
        flashConfirmation: true,
        preferSelection: true,
      })
    else if (keys.matches(data, "tui.altScreen.pageUp"))
      this.adapter.scrollChat(-1)
    else if (keys.matches(data, "tui.altScreen.pageDown"))
      this.adapter.scrollChat(1)
  }

  handleMouse(event: Parameters<NonNullable<Component["handleMouse"]>>[0]) {
    if (event.type !== "click" || event.button !== "left") return undefined
    this.adapter.toggleWork(this.work)
    return { handled: true, focus: true }
  }
}
