import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent"
import { Type } from "typebox"
import { createCommand } from "./command.ts"
import { execute } from "./execution.ts"

type Declaration = { type: string; name: string; [key: string]: unknown }
const contract = JSON.parse(
  readFileSync(new URL("./contract.json", import.meta.url), "utf8"),
) as {
  namespace: {
    type: string
    name: string
    description: string
    tools: Declaration[]
  }
}
const execution = contract.namespace.tools[0]!
const [preamble, ...sections] = String(execution["description"]).split(
  /\n(?=### `)/,
)

function description(names: ReadonlySet<string>): string {
  return [
    preamble!
      .split("\n")
      .filter(
        (line) =>
          !/^- `(?:image\(|store\(|load\(|notify\(|setTimeout\(|clearTimeout\(|yield_control\(|yield_time_ms`)/.test(
            line,
          ),
      )
      .join("\n"),
    "Only completed scripts are supported. Await every tool call before the script ends. Command calls wait for completion; process sessions and interactive commands are unavailable. Retained execution is unavailable. Reaching the script yield deadline returns an error and cancels pending calls.",
    ...sections.filter((section) =>
      names.has(section.match(/^### `([^`]+)`/)![1]!),
    ),
  ].join("\n")
}

export default function coreTools(pi: ExtensionAPI): void {
  const lifetime = new AbortController()
  pi.on("session_shutdown", () => lifetime.abort())
  const commandAvailable = () => {
    const active = new Set(pi.getActiveTools())
    return (
      active.has("exec_command") ||
      (active.has("bash") &&
        pi
          .getAllTools()
          .some(
            (tool) =>
              tool.name === "bash" && tool.sourceInfo.source === "builtin",
          ))
    )
  }
  const command = createCommand(pi, commandAvailable, lifetime.signal)
  pi.registerTool(command)
  const syncCommand = () => {
    const registered = pi.getAllTools()
    const current = registered.find((tool) => tool.name === command.name)
    if (!current || current.sourceInfo.path !== fileURLToPath(import.meta.url))
      return
    const exposure = commandAvailable() ? "codemode" : "hidden"
    if (current.exposure !== exposure) pi.registerTool({ ...command, exposure })
  }
  pi.on("session_start", syncCommand)
  pi.on("before_agent_start", syncCommand)
  pi.registerTool({
    name: execution.name,
    label: "Execute",
    description: description(new Set()),
    parameters: Type.Object({ input: Type.String() }),
    exposure: "model-only",
    namespace: { name: contract.namespace.name },
    executionMode: "sequential",
    prepareLoadout(loadout) {
      const names = new Set(loadout.callable.map((tool) => tool.name))
      const stock = new Set(
        pi
          .getAllTools()
          .filter((tool) => tool.sourceInfo.source === "builtin")
          .map((tool) => tool.name),
      )
      return {
        descriptions: { exec: description(names) },
        hiddenDeclarations: names.has("exec_command")
          ? loadout.declared
              .filter(
                (tool) =>
                  tool.name === "exec_command" ||
                  (stock.has(tool.name) &&
                    ["bash", "grep", "find", "ls"].includes(tool.name)),
              )
              .map((tool) => tool.name)
          : [],
      }
    },
    execute(_id, args, signal, _onUpdate, ctx) {
      return execute(
        args.input,
        ctx,
        signal ? AbortSignal.any([signal, lifetime.signal]) : lifetime.signal,
      )
    },
  })
  pi.on("before_provider_request", (event, ctx) => {
    const payload = event.payload as {
      tools?: Declaration[]
      input?: Record<string, unknown>[]
    }
    const selected = payload.tools?.some((tool) => tool.name === execution.name)
    let inserted = false
    const rawCalls = new Set<string>()
    const retained = new Map(
      ctx.sessionManager
        .getBranch()
        .flatMap((entry) =>
          entry.type === "message" &&
          entry.message.role === "toolResult" &&
          entry.message.toolName === execution.name
            ? [
                [
                  entry.message.toolCallId.split("|")[0]!,
                  entry.message.content,
                ] as const,
              ]
            : [],
        ),
    )
    const input = payload.input?.map((item) => {
      if (
        item["type"] === "function_call" &&
        item["name"] === execution.name &&
        item["namespace"] === contract.namespace.name
      ) {
        const { arguments: encoded, ...rest } = item
        const args = JSON.parse(String(encoded)) as { input: string }
        rawCalls.add(String(item["call_id"]))
        return { ...rest, type: "custom_tool_call", input: args.input }
      }
      if (
        item["type"] === "function_call_output" &&
        rawCalls.has(String(item["call_id"]))
      ) {
        let output = item["output"]
        if (typeof output === "string") {
          const parts = retained
            .get(String(item["call_id"]))
            ?.filter((part) => part.type === "text")
          // Restore text boundaries only when the processed request contains exactly the same text.
          output =
            parts?.map((part) => part.text).join("\n") === output
              ? parts.map((part) => ({ type: "input_text", text: part.text }))
              : [{ type: "input_text", text: output }]
        }
        return { ...item, type: "custom_tool_call_output", output }
      }
      return item
    })
    if (!selected && rawCalls.size === 0) return
    return {
      ...payload,
      ...(input ? { input } : {}),
      ...(payload.tools
        ? {
            tools: payload.tools.flatMap((tool) => {
              if (tool.name !== execution.name) return [tool]
              if (inserted) return []
              inserted = true
              return [
                {
                  ...contract.namespace,
                  tools: [{ ...execution, description: tool["description"] }],
                },
              ]
            }),
          }
        : {}),
    }
  })
}
