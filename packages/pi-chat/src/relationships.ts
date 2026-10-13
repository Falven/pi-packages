import type {
  AgentSessionRuntime,
  SessionEntry,
  SessionManager,
} from "@earendil-works/pi-coding-agent"
import type { DeliveryKind } from "./work-history.ts"

const customType = "pi-chat.relationship"

export type RelationshipFact =
  | {
      version: 1
      kind: "member"
      requestId: string
      sourceId: string
      delivery?: DeliveryKind
    }
  | {
      version: 1
      kind: "settled"
      requestId: string
      sourceId: string
      finalId?: string
      cancelled: boolean
    }

type Recorded = { id: string; fact: RelationshipFact }

function certified(entry: SessionEntry): Recorded | undefined {
  if (entry.type !== "custom" || entry.customType !== customType) return
  const value: unknown = entry.data
  if (!value || typeof value !== "object") return
  const fact = value as Partial<RelationshipFact>
  if (
    fact.version !== 1 ||
    typeof fact.requestId !== "string" ||
    typeof fact.sourceId !== "string"
  )
    return
  if (fact.kind === "member") {
    if (
      fact.delivery !== undefined &&
      fact.delivery !== "initial" &&
      fact.delivery !== "steering" &&
      fact.delivery !== "follow-up"
    )
      return
    return { id: entry.id, fact: fact as RelationshipFact }
  }
  if (
    fact.kind === "settled" &&
    typeof fact.cancelled === "boolean" &&
    (fact.finalId === undefined || typeof fact.finalId === "string")
  )
    return { id: entry.id, fact: fact as RelationshipFact }
  return undefined
}

export class RelationshipJournal {
  private readonly facts: Recorded[] = []
  private writeFailure?: Error

  constructor(private readonly manager: SessionManager) {
    for (const entry of manager.getEntries()) {
      const record = certified(entry)
      if (record) this.facts.push(record)
    }
  }

  record(fact: RelationshipFact) {
    if (this.writeFailure) throw this.writeFailure
    try {
      const id = this.manager.appendCustomEntry(customType, fact)
      this.facts.push({ id, fact })
    } catch (cause) {
      this.writeFailure = new Error(
        "pi-chat could not persist a work relationship",
        {
          cause,
        },
      )
      throw this.writeFailure
    }
  }

  active(branch: SessionEntry[]) {
    const sources = new Map(branch.map((entry) => [entry.id, entry]))
    return this.facts.flatMap(({ fact }) =>
      this.survives(fact, sources) ? [fact] : [],
    )
  }

  transferTo(manager: SessionManager) {
    const sources = new Map(
      manager.getBranch().map((entry) => [entry.id, entry]),
    )
    const copied = new Set(manager.getEntries().map((entry) => entry.id))
    for (const { id, fact } of this.facts) {
      if (!copied.has(id) && this.survives(fact, sources)) {
        try {
          manager.appendCustomEntry(customType, fact)
        } catch (cause) {
          throw new Error("pi-chat could not persist fork relationships", {
            cause,
          })
        }
      }
    }
  }

  private survives(fact: RelationshipFact, sources: Map<string, SessionEntry>) {
    const request = sources.get(fact.requestId)
    const source = sources.get(fact.sourceId)
    if (
      request?.type !== "message" ||
      request.message.role !== "user" ||
      !source ||
      (source.type !== "message" && source.type !== "custom_message")
    )
      return false
    if (fact.kind === "member" && fact.delivery)
      return source.type === "message" && source.message.role === "user"
    if (fact.kind === "settled" && fact.finalId) {
      const final = sources.get(fact.finalId)
      return final?.type === "message" && final.message.role === "assistant"
    }
    return true
  }
}

export function carryObservedFork(
  host: AgentSessionRuntime,
  journal: RelationshipJournal,
  reportFailure: (error: Error) => void,
) {
  // Pi copies only the selected ancestry; install the surviving facts before
  // its new runtime reads the forked manager and builds the initial chat.
  const runtime = host as unknown as {
    fork: AgentSessionRuntime["fork"]
    createRuntime: (options: {
      sessionManager: SessionManager
      sessionStartEvent?: { reason: string }
    }) => Promise<unknown>
  }
  const originalFork = runtime.fork
  const forkDescriptor = Object.getOwnPropertyDescriptor(runtime, "fork")
  let active = true
  const wrappedFork: typeof runtime.fork = async (entryId, options) => {
    if (!active) return originalFork.call(runtime, entryId, options)
    const originalCreate = runtime.createRuntime
    const createDescriptor = Object.getOwnPropertyDescriptor(
      runtime,
      "createRuntime",
    )
    let pending = true
    let transferFailure: Error | undefined
    const wrappedCreate: typeof runtime.createRuntime = async (input) => {
      if (pending && input.sessionStartEvent?.reason === "fork") {
        pending = false
        try {
          journal.transferTo(input.sessionManager)
        } catch (error) {
          transferFailure =
            error instanceof Error ? error : new Error(String(error))
        }
      }
      return originalCreate.call(runtime, input)
    }
    runtime.createRuntime = wrappedCreate
    try {
      const result = await originalFork.call(runtime, entryId, options)
      if (transferFailure) reportFailure(transferFailure)
      return result
    } finally {
      pending = false
      if (runtime.createRuntime === wrappedCreate) {
        if (createDescriptor)
          Object.defineProperty(runtime, "createRuntime", createDescriptor)
        else
          delete (runtime as unknown as Record<string, unknown>)[
            "createRuntime"
          ]
      }
    }
  }
  runtime.fork = wrappedFork
  return () => {
    active = false
    if (runtime.fork !== wrappedFork) return
    if (forkDescriptor) Object.defineProperty(runtime, "fork", forkDescriptor)
    else delete (runtime as unknown as Record<string, unknown>)["fork"]
  }
}
