import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import type {
  ExtensionAPI,
  ToolDefinition,
} from "@earendil-works/pi-coding-agent"
import { Type, type TSchema } from "typebox"
import { createCommand, createStdin } from "./command.ts"
import { ExecutionCells, type WaitOptions } from "./execution.ts"
import { createImage } from "./image.ts"
import { createPatch } from "./patch.ts"
import { ProcessSessions } from "./process.ts"
import { waitRenderers } from "./presentation.ts"

type Declaration = { type: string; name: string; [key: string]: unknown }
type OwnedCall = { id: string; name: string }
const callJournalType = "core-tools.calls"
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
const waiting = contract.namespace.tools[1]!
const [preamble, ...sections] = String(execution["description"]).split(
  /\n(?=### `)/,
)

function description(names: ReadonlySet<string>): string {
  return [
    preamble!
      .split("\n")
      .filter(
        (line) => !line.startsWith("- `image(") || names.has("view_image"),
      )
      .join("\n"),
    ...sections.filter((section) =>
      names.has(section.match(/^### `([^`]+)`/)![1]!),
    ),
  ].join("\n")
}

export default function coreTools(pi: ExtensionAPI): void {
  const lifetime = new AbortController()
  const processes = new ProcessSessions()
  const availability = new Map<string, () => boolean>()
  const cells = new ExecutionCells(
    pi,
    (name) => availability.get(name)?.() ?? false,
    processes,
  )
  pi.on("session_shutdown", async () => {
    const closing = cells.close()
    lifetime.abort()
    const results = await Promise.allSettled([closing, processes.close()])
    const errors = results.flatMap((result) =>
      result.status === "rejected" ? [result.reason] : [],
    )
    if (errors.length)
      throw new AggregateError(
        errors,
        `Session cleanup failed: ${errors.map((error) => (error instanceof Error ? error.message : String(error))).join("; ")}`,
      )
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
  const registerNestedTool = <T extends TSchema, D>(
    tool: ToolDefinition<T, D>,
    available: () => boolean,
  ) => {
    availability.set(tool.name, available)
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
    ...cells.renderers,
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
    execute(id, args, signal, onUpdate, ctx) {
      return cells.start(
        args.input,
        id,
        ctx,
        signal ? AbortSignal.any([signal, lifetime.signal]) : lifetime.signal,
        onUpdate,
      )
    },
  })
  pi.registerTool({
    name: waiting.name,
    ...waitRenderers,
    label: "Wait",
    description: String(waiting["description"]),
    parameters: Type.Unsafe<WaitOptions>(waiting["parameters"] as TSchema),
    exposure: "model-only",
    namespace: { name: contract.namespace.name },
    executionMode: "sequential",
    execute(id, args, signal) {
      return cells.wait(args, signal, id)
    },
  })
  const ownsTool = (name: string) =>
    pi
      .getAllTools()
      .some(
        (tool) =>
          tool.name === name &&
          tool.sourceInfo.path === fileURLToPath(import.meta.url),
      )
  pi.on("message_end", (event) => {
    if (event.message.role !== "assistant") return
    const calls = event.message.content.flatMap((part) =>
      part.type === "toolCall" &&
      [execution.name, waiting.name].includes(part.name) &&
      ownsTool(part.name)
        ? [{ id: part.id, name: part.name }]
        : [],
    )
    // Receipt precedes dispatch, including calls blocked by native policy.
    if (calls.length) pi.appendEntry<OwnedCall[]>(callJournalType, calls)
  })
  pi.on("before_provider_request", (event, ctx) => {
    const payload = event.payload as {
      tools?: Declaration[]
      input?: Record<string, unknown>[]
    }
    const selected =
      payload.tools?.filter(
        (tool) =>
          [execution.name, waiting.name].includes(tool.name) &&
          ownsTool(tool.name),
      ) ?? []
    let inserted = false
    const rawCalls = new Set<string>()
    const ownedCalls = new Set<string>()
    const branch = ctx.sessionManager.getBranch()
    const ownership = new Map(
      branch.flatMap((entry) => {
        if (entry.type !== "custom") return []
        if (entry.customType === callJournalType)
          return (entry.data as OwnedCall[]).map(
            (call) => [call.id.split("|")[0]!, call.name] as const,
          )
        if (entry.customType === "core-tools.activity")
          return [
            [
              (entry.data as { parent_call_id: string }).parent_call_id.split(
                "|",
              )[0]!,
              execution.name,
            ] as const,
          ]
        return []
      }),
    )
    const retained = new Map(
      branch.flatMap((entry) =>
        entry.type === "message" &&
        entry.message.role === "toolResult" &&
        [execution.name, waiting.name].includes(entry.message.toolName)
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
        [execution.name, waiting.name].includes(String(item["name"])) &&
        ownership.get(String(item["call_id"])) === item["name"]
      )
        ownedCalls.add(String(item["call_id"]))
      if (
        item["type"] === "function_call" &&
        item["name"] === execution.name &&
        ownership.get(String(item["call_id"])) === execution.name
      ) {
        const { arguments: encoded, ...rest } = item
        const args = JSON.parse(String(encoded)) as { input: string }
        rawCalls.add(String(item["call_id"]))
        return { ...rest, type: "custom_tool_call", input: args.input }
      }
      if (
        item["type"] === "function_call_output" &&
        ownedCalls.has(String(item["call_id"]))
      ) {
        let output = item["output"]
        const retainedParts = retained.get(String(item["call_id"]))
        if (typeof output === "string") {
          const parts = retainedParts?.filter((part) => part.type === "text")
          // Restore text boundaries only when the processed request contains exactly the same text.
          if (
            parts &&
            parts.length > 1 &&
            parts.map((part) => part.text).join("\n") === output
          )
            output = parts.map((part) => ({
              type: "input_text",
              text: part.text,
            }))
        } else if (Array.isArray(output) && retainedParts) {
          const converted = output as Record<string, unknown>[]
          const texts = converted.filter(
            (part) => part["type"] === "input_text",
          )
          const images = converted.filter(
            (part) => part["type"] === "input_image",
          )
          const savedImages = retainedParts.filter(
            (part) => part.type === "image",
          )
          if (
            texts.length <= 1 &&
            texts.length + images.length === converted.length &&
            retainedParts
              .filter((part) => part.type === "text")
              .map((part) => part.text)
              .join("\n") === texts.map((part) => part["text"]).join("\n") &&
            savedImages.length === images.length &&
            savedImages.every(
              (part, index) =>
                images[index]!["image_url"] ===
                `data:${part.mimeType};base64,${part.data}`,
            )
          ) {
            let image = 0
            // oxlint-disable-next-line no-map-spread -- Each boundary keeps the processed text metadata without mutating the shared part.
            output = retainedParts.map((part) =>
              part.type === "text"
                ? { ...texts[0], type: "input_text", text: part.text }
                : images[image++],
            )
          }
        }
        return {
          ...item,
          ...(rawCalls.has(String(item["call_id"]))
            ? { type: "custom_tool_call_output" }
            : {}),
          output,
        }
      }
      return item
    })
    if (selected.length === 0 && ownedCalls.size === 0) return
    return {
      ...payload,
      ...(input ? { input } : {}),
      ...(payload.tools
        ? {
            tools: payload.tools.flatMap((tool) => {
              if (!selected.includes(tool)) return [tool]
              if (inserted) return []
              inserted = true
              return [
                {
                  ...contract.namespace,
                  tools: contract.namespace.tools.flatMap((declaration) => {
                    const current = selected.find(
                      (entry) => entry.name === declaration.name,
                    )
                    return current
                      ? [
                          {
                            ...declaration,
                            description: current["description"],
                          },
                        ]
                      : []
                  }),
                },
              ]
            }),
          }
        : {}),
    }
  })
}
