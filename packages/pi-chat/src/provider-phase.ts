export type MessagePhase = "commentary" | "final_answer"

type ItemKind = "reasoning" | "message" | "function_call" | "custom_tool_call"
type ProviderItem = {
  type?: unknown
  id?: unknown
  phase?: unknown
}
type ProviderEvent = {
  type?: unknown
  output_index?: unknown
  item?: unknown
}
type Creation = Readonly<{
  contentIndex: number
  outputIndex: number
  kind: ItemKind
  itemId?: string
}>
type Evidence = {
  creation: Creation
  phase?: MessagePhase
  phaseSeen?: boolean
  doneId?: string
}
type NativeText = { type: "text"; textSignature?: string }

const phaseOf = (value: unknown): MessagePhase | undefined =>
  value === "commentary" || value === "final_answer" ? value : undefined

function itemOf(value: unknown): ProviderItem | undefined {
  return value && typeof value === "object"
    ? (value as ProviderItem)
    : undefined
}

// Pi's normalized text omits phase, so associate provider slots before normalization.
export class ProviderPhaseIndex {
  private nextContentIndex = 0
  private readonly active = new Map<number, Creation>()
  private readonly evidence = new Map<number, Evidence>()
  private readonly normalized = new Map<number, object>()

  beginRequest() {
    this.nextContentIndex = 0
    this.active.clear()
    this.evidence.clear()
    this.normalized.clear()
  }

  observe(value: unknown) {
    if (!value || typeof value !== "object") return
    const event = value as ProviderEvent
    if (
      (event.type !== "response.output_item.added" &&
        event.type !== "response.output_item.done") ||
      !Number.isInteger(event.output_index) ||
      (event.output_index as number) < 0
    )
      return
    const item = itemOf(event.item)
    if (!item) return
    const outputIndex = event.output_index as number
    const creation =
      event.type === "response.output_item.added"
        ? this.create(outputIndex, item)
        : (this.active.get(outputIndex) ?? this.create(outputIndex, item))
    if (!creation) return
    const evidence = this.evidence.get(creation.contentIndex)!
    if (creation.kind === "message" && item.type === "message") {
      const phase = phaseOf(item.phase)
      if (phase) {
        evidence.phase = phase
        evidence.phaseSeen = true
      } else if (item.phase !== undefined && item.phase !== null) {
        // An explicit unrecognized phase corrects a prior final; omission does not.
        delete evidence.phase
        evidence.phaseSeen = true
      }
      if (
        event.type === "response.output_item.done" &&
        typeof item.id === "string"
      )
        evidence.doneId = item.id
    }
    if (
      event.type === "response.output_item.done" &&
      creation.kind === item.type
    )
      this.active.delete(outputIndex)
  }

  bindNormalized(contentIndex: number, part: unknown) {
    if (
      !part ||
      typeof part !== "object" ||
      (part as { type?: unknown }).type !== "text" ||
      this.normalized.has(contentIndex) ||
      this.evidence.get(contentIndex)?.creation.kind !== "message"
    )
      return
    this.normalized.set(contentIndex, part)
  }

  hasPhaseEvidence() {
    return [...this.evidence.values()].some((item) => item.phaseSeen)
  }

  phaseFor(contentIndex: number, part: NativeText): MessagePhase | undefined {
    const evidence = this.evidence.get(contentIndex)
    if (
      evidence?.creation.kind !== "message" ||
      !this.normalized.has(contentIndex)
    )
      return
    const textSignature = part.textSignature
    if (textSignature !== undefined) {
      try {
        const signature: unknown = JSON.parse(textSignature)
        if (signature && typeof signature === "object") {
          const native = signature as {
            v?: unknown
            id?: unknown
            phase?: unknown
          }
          if (
            native.v !== 1 ||
            typeof native.id !== "string" ||
            native.id !== (evidence.doneId ?? evidence.creation.itemId)
          )
            return
          const nativePhase = phaseOf(native.phase)
          if (nativePhase && nativePhase !== evidence.phase) return
          return evidence.phase
        }
      } catch {
        return
      }
      return
    }
    if (evidence.doneId || this.normalized.get(contentIndex) !== part) return
    return evidence.phase
  }

  private create(
    outputIndex: number,
    item: ProviderItem,
  ): Creation | undefined {
    if (
      item.type !== "reasoning" &&
      item.type !== "message" &&
      item.type !== "function_call" &&
      item.type !== "custom_tool_call"
    )
      return
    const creation: Creation = {
      contentIndex: this.nextContentIndex++,
      outputIndex,
      kind: item.type,
      ...(typeof item.id === "string" ? { itemId: item.id } : {}),
    }
    this.active.set(outputIndex, creation)
    this.evidence.set(creation.contentIndex, { creation })
    return creation
  }
}
