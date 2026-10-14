import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent"
import { decodeCreate, type CreateGoalRequest } from "./decoder.ts"

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

export function goalArguments(
  pi: ExtensionAPI,
  owns: (name: string) => boolean,
) {
  let rawCalls = new Map<string, string>()
  const streaming = new Map<string, string>()
  const finalized = new Map<string, string>()
  const pending = new Map<
    string,
    {
      args: unknown
      raw: string
      ctx: ExtensionContext
      request?: CreateGoalRequest
    }
  >()
  const isGoal = (name: unknown) => typeof name === "string" && owns(name)
  const findRaw = (id: string) =>
    rawCalls.get(id) ??
    [...rawCalls].find(([key]) => key.split("|")[0] === id)?.[1]

  pi.on("session_start", (_event, ctx) => {
    rawCalls = new Map()
    streaming.clear()
    finalized.clear()
    pending.clear()
    for (const entry of ctx.sessionManager.getEntries()) {
      if (
        entry.type !== "custom" ||
        entry.customType !== "goal.arguments" ||
        !object(entry.data)
      )
        continue
      if (
        typeof entry.data["id"] === "string" &&
        typeof entry.data["arguments"] === "string"
      ) {
        rawCalls.set(entry.data["id"], entry.data["arguments"])
      }
    }
  })
  pi.on("provider_stream_event", ({ data }) => {
    if (!object(data)) return
    const items =
      data["type"] === "response.output_item.done"
        ? [data["item"]]
        : data["type"] === "response.completed" &&
            object(data["response"]) &&
            Array.isArray(data["response"]["output"])
          ? data["response"]["output"]
          : []
    for (const item of items) {
      if (
        !object(item) ||
        item["type"] !== "function_call" ||
        !isGoal(item["name"])
      )
        continue
      if (
        typeof item["call_id"] === "string" &&
        typeof item["id"] === "string" &&
        typeof item["arguments"] === "string"
      ) {
        finalized.set(`${item["call_id"]}|${item["id"]}`, item["arguments"])
      }
    }
  })
  pi.on("message_update", ({ assistantMessageEvent: event }) => {
    if (event.type !== "toolcall_start" && event.type !== "toolcall_delta")
      return
    const call = event.partial.content[event.contentIndex]
    if (call?.type !== "toolCall" || !isGoal(call.name)) return
    if (event.type === "toolcall_start") streaming.set(call.id, "")
    else streaming.set(call.id, (streaming.get(call.id) ?? "") + event.delta)
  })
  pi.on("message_end", ({ message }) => {
    if (message.role !== "assistant") return
    for (const call of message.content) {
      if (call.type !== "toolCall" || !isGoal(call.name)) continue
      const raw = finalized.get(call.id) ?? streaming.get(call.id)
      if (raw === undefined) continue
      streaming.delete(call.id)
      finalized.delete(call.id)
      rawCalls.set(call.id, raw)
      pi.appendEntry("goal.arguments", { id: call.id, arguments: raw })
    }
  })
  pi.on("tool_execution_start", (event, ctx) => {
    if (event.toolName !== "create_goal" || !isGoal(event.toolName)) return
    const raw = event.parentToolCallId
      ? JSON.stringify(event.args)
      : rawCalls.get(event.toolCallId)
    if (raw !== undefined)
      pending.set(event.toolCallId, { args: event.args, raw, ctx })
  })
  pi.on("tool_execution_end", (event) => {
    pending.delete(event.toolCallId)
  })
  pi.on("before_provider_request", (event) => {
    if (!object(event.payload)) return
    const tools = event.payload["tools"]
    if (Array.isArray(tools)) {
      for (const tool of tools) {
        if (!object(tool) || tool["type"] !== "function") continue
        const definition = object(tool["function"]) ? tool["function"] : tool
        if (isGoal(definition["name"])) definition["strict"] = false
      }
    }
    const input = event.payload["input"]
    if (Array.isArray(input)) {
      for (const item of input) {
        if (
          !object(item) ||
          item["type"] !== "function_call" ||
          !isGoal(item["name"]) ||
          typeof item["call_id"] !== "string"
        )
          continue
        const raw = findRaw(item["call_id"])
        if (raw !== undefined) item["arguments"] = raw
      }
    }
    const messages = event.payload["messages"]
    if (Array.isArray(messages)) {
      for (const message of messages) {
        if (!object(message) || !Array.isArray(message["tool_calls"])) continue
        for (const call of message["tool_calls"]) {
          if (
            !object(call) ||
            !object(call["function"]) ||
            !isGoal(call["function"]["name"]) ||
            typeof call["id"] !== "string"
          )
            continue
          const raw = findRaw(call["id"])
          if (raw !== undefined) call["function"]["arguments"] = raw
        }
      }
    }
    return event.payload
  })
  pi.on("session_shutdown", () => {
    streaming.clear()
    finalized.clear()
    pending.clear()
    rawCalls.clear()
  })

  return {
    prepareCreate(args: unknown) {
      const call = [...pending.values()].find(
        (candidate) => !candidate.request && Object.is(candidate.args, args),
      )
      if (!call)
        throw new Error("Goal argument fidelity is unavailable for this call.")
      if (!call.ctx.sessionManager.getSessionFile())
        throw new Error("Goal tools require a persistent thread.")
      const request = decodeCreate(call.raw)
      call.request = request
      return {
        objective: request.objective,
        ...(request.token_budget === undefined
          ? {}
          : { token_budget: Number(request.token_budget) }),
      }
    },
    create(id: string, args: { objective: string; token_budget?: number }) {
      const request = pending.get(id)?.request
      if (!request)
        throw new Error("Goal argument fidelity is unavailable for this call.")
      const budgetUnchanged =
        args.token_budget ===
        (request.token_budget === undefined
          ? undefined
          : Number(request.token_budget))
      if (args.objective === request.objective && budgetUnchanged)
        return request
      const effective = decodeCreate(
        JSON.stringify({
          ...args,
          ...(budgetUnchanged ? { token_budget: undefined } : {}),
        }),
      )
      if (budgetUnchanged && request.token_budget !== undefined)
        effective.token_budget = request.token_budget
      return effective
    },
  }
}
