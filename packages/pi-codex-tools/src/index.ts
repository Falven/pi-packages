import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import type {
  ExtensionAPI,
  ToolDefinition,
} from "@earendil-works/pi-coding-agent"
import { Type, type TSchema } from "typebox"
import { createCommand, createStdin } from "./command.ts"
import { execute } from "./execution.ts"
import { createImage } from "./image.ts"
import { createPatch } from "./patch.ts"
import { ProcessSessions } from "./process.ts"

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
          !/^- `(?:store\(|load\(|notify\(|setTimeout\(|clearTimeout\(|yield_control\(|yield_time_ms`)/.test(
            line,
          ) &&
          (!line.startsWith("- `image(") || names.has("view_image")),
      )
      .join("\n"),
    "Only completed scripts are supported. Await every tool call before the script ends. Command calls may yield a process session for later input or polling. Retained execution is unavailable. Reaching the script yield deadline returns an error and cancels pending calls.",
    ...(names.has("view_image")
      ? [
          "Image emission uses Pi's native processing. Requested image detail is not preserved by this host's provider conversion.",
        ]
      : []),
    ...sections.filter((section) =>
      names.has(section.match(/^### `([^`]+)`/)![1]!),
    ),
  ].join("\n")
}

export default function coreTools(pi: ExtensionAPI): void {
  const lifetime = new AbortController()
  const processes = new ProcessSessions()
  pi.on("session_shutdown", async () => {
    lifetime.abort()
    await processes.close()
  })
  const commandAvailable = (name: string) => {
    const active = new Set(pi.getActiveTools())
    return (
      active.has(name) ||
      (active.has("bash") &&
        pi
          .getAllTools()
          .some(
            (tool) =>
              tool.name === "bash" && tool.sourceInfo.source === "builtin",
          ))
    )
  }
  const registerNestedTool = <T extends TSchema>(
    tool: ToolDefinition<T, undefined>,
    available: () => boolean,
  ) => {
    pi.registerTool(tool)
    const sync = () => {
      const current = pi.getAllTools().find((entry) => entry.name === tool.name)
      if (
        !current ||
        current.sourceInfo.path !== fileURLToPath(import.meta.url)
      )
        return
      const exposure = available() ? "codemode" : "hidden"
      if (current.exposure !== exposure) pi.registerTool({ ...tool, exposure })
    }
    pi.on("session_start", sync)
    pi.on("before_agent_start", sync)
  }
  const execCommandAvailable = () => commandAvailable("exec_command")
  registerNestedTool(
    createCommand(pi, execCommandAvailable, lifetime.signal, processes),
    execCommandAvailable,
  )
  const stdinAvailable = () => commandAvailable("write_stdin")
  registerNestedTool(
    createStdin(stdinAvailable, lifetime.signal, processes),
    stdinAvailable,
  )
  const imageAvailable = () => {
    const active = new Set(pi.getActiveTools())
    return (
      active.has("view_image") ||
      (active.has("read") &&
        pi
          .getAllTools()
          .some(
            (tool) =>
              tool.name === "read" && tool.sourceInfo.source === "builtin",
          ))
    )
  }
  registerNestedTool(createImage(pi, imageAvailable), imageAvailable)
  const patchAvailable = () => {
    const active = new Set(pi.getActiveTools())
    const stock = new Set(
      pi
        .getAllTools()
        .filter((tool) => tool.sourceInfo.source === "builtin")
        .map((tool) => tool.name),
    )
    return (
      active.has("apply_patch") ||
      ["edit", "write"].every((name) => active.has(name) && stock.has(name))
    )
  }
  registerNestedTool(
    createPatch(patchAvailable, lifetime.signal),
    patchAvailable,
  )
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
        hiddenDeclarations: loadout.declared
          .filter(
            (tool) =>
              (["exec_command", "write_stdin"].includes(tool.name) &&
                names.has(tool.name)) ||
              (names.has("exec_command") &&
                stock.has(tool.name) &&
                ["bash", "grep", "find", "ls"].includes(tool.name)) ||
              (names.has("apply_patch") &&
                (tool.name === "apply_patch" ||
                  (stock.has(tool.name) &&
                    ["edit", "write"].includes(tool.name)))) ||
              (names.has("view_image") &&
                (tool.name === "view_image" ||
                  (names.has("exec_command") &&
                    stock.has(tool.name) &&
                    tool.name === "read"))),
          )
          .map((tool) => tool.name),
      }
    },
    execute(_id, args, signal, _onUpdate, ctx) {
      return execute(
        args.input,
        ctx,
        signal ? AbortSignal.any([signal, lifetime.signal]) : lifetime.signal,
        pi,
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
