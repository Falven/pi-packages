import type {
  AgentBeforeSettleEvent,
  MessageEndEvent,
  MessageUpdateEvent,
  ProviderStreamEvent,
  SessionEntry,
  TurnEndEvent,
} from "@earendil-works/pi-coding-agent";

export class GoalGuards {
  private automatic = false;
  private continuation: string | undefined;
  private activity = false;
  private emptyFinal = false;
  private emptyTurns = 0;
  private unknownReasoning = false;
  private failed = false;
  private terminal: string | undefined;
  private quotas = new Set<string>();
  private entriesSeen = 0;

  start(entries: readonly SessionEntry[]): void {
    this.automatic = false;
    this.activity = false;
    this.emptyFinal = false;
    this.unknownReasoning = false;
    this.failed = false;
    this.terminal = undefined;
    this.quotas.clear();
    this.entriesSeen = entries.length;
  }

  expectContinuation(id: string): void {
    this.continuation = id;
  }

  cancelContinuation(): void {
    this.continuation = undefined;
  }

  reset(): void {
    this.automatic = false;
    this.continuation = undefined;
    this.emptyTurns = 0;
  }

  committed(entries: readonly SessionEntry[]): void {
    for (const entry of entries.slice(this.entriesSeen)) {
      if (
        (entry.type === "message" && entry.message.role === "user") ||
        (entry.type === "custom_message" && entry.customType !== "goal.internal_context") ||
        entry.type === "compaction" ||
        entry.type === "branch_summary"
      ) {
        this.activity = true;
        this.emptyTurns = 0;
      }
    }
    this.entriesSeen = entries.length;
  }

  beforeSettle(event: AgentBeforeSettleEvent): void {
    this.failed = event.outcome === "error";
  }

  provider(event: ProviderStreamEvent): void {
    const data = event.data as {
      type?: unknown;
      response?: { id?: unknown; error?: { code?: unknown } };
    } | null;
    if (
      data?.type === "response.failed" &&
      typeof data.response?.id === "string" &&
      data.response.id.length > 0 &&
      data.response.error?.code === "insufficient_quota"
    )
      this.quotas.add(JSON.stringify([event.provider, event.api, event.model, data.response.id]));
  }

  turn(message: TurnEndEvent["message"]): void {
    this.terminal =
      message.role === "assistant" && message.stopReason === "error" && message.responseId
        ? JSON.stringify([message.provider, message.api, message.model, message.responseId])
        : undefined;
  }

  tool(current: boolean): void {
    this.emptyTurns = 0;
    if (current) this.activity = true;
  }

  message(message: MessageEndEvent["message"]): void {
    if (message.role === "custom") {
      if (message.customType === "goal.internal_context") {
        const details = message.details as { continuationId?: unknown } | null;
        if (this.continuation !== undefined && details?.continuationId === this.continuation) {
          this.automatic = true;
          this.continuation = undefined;
        }
        return;
      }
    } else if (message.role !== "user") return;
    this.activity = true;
    this.emptyTurns = 0;
  }

  update(event: MessageUpdateEvent): void {
    const completed = event.assistantMessageEvent;
    if (completed.type === "thinking_end") {
      const block = completed.partial.content[completed.contentIndex];
      let item;
      try {
        item =
          block?.type === "thinking" && block.thinkingSignature
            ? JSON.parse(block.thinkingSignature)
            : undefined;
      } catch {
        item = undefined;
      }
      if (item?.type !== "reasoning" || !Array.isArray(item.summary)) {
        // shortcut: Opaque reasoning needs a public summary classification before certifying an empty turn.
        this.unknownReasoning = true;
        return;
      }
      for (const part of item.summary) {
        if (typeof part?.text !== "string") this.unknownReasoning = true;
        else if (/\P{White_Space}/u.test(part.text)) {
          this.activity = true;
          this.emptyTurns = 0;
        }
      }
      return;
    }
    if (completed.type !== "text_end") return;
    if (/\P{White_Space}/u.test(completed.content)) {
      this.activity = true;
      this.emptyTurns = 0;
      return;
    }
    const block = completed.partial.content[completed.contentIndex];
    let phase: unknown;
    if (block?.type === "text" && block.textSignature?.startsWith("{")) {
      try {
        const signature = JSON.parse(block.textSignature);
        phase = signature.v === 1 ? signature.phase : null;
      } catch {
        phase = null;
      }
    }
    this.emptyFinal ||= phase === undefined || phase === "final_answer";
  }

  finish(): "blocked" | "usageLimited" | undefined {
    const empty = this.automatic && this.emptyFinal && !this.activity && !this.unknownReasoning;
    this.emptyFinal = false;
    this.emptyTurns = empty ? this.emptyTurns + 1 : 0;
    if (this.failed)
      return this.terminal && this.quotas.has(this.terminal) ? "usageLimited" : "blocked";
    return this.emptyTurns >= 3 ? "blocked" : undefined;
  }
}
