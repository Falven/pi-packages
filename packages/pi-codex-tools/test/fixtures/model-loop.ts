import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { after } from "node:test"
import { ModelRuntime } from "@earendil-works/pi-coding-agent"
import type { openNativeHost } from "../../../../fixtures/native-host.ts"

export const extension = new URL("../../src/index.ts", import.meta.url).pathname
const catalogDirectory = await mkdtemp(join(tmpdir(), "core-tools-catalog-"))
after(() => rm(catalogDirectory, { recursive: true, force: true }))
const models = await ModelRuntime.create({
  authPath: join(catalogDirectory, "auth.json"),
  modelsPath: null,
  modelsStorePath: join(catalogDirectory, "models.json"),
  refreshOnCreate: false,
})
export const providerApi = models
  .getModels()
  .find((model) => model.api.endsWith("-responses"))?.api
assert(
  providerApi,
  "The native model catalog must include a Responses transport",
)
export const completed = {
  event: {
    type: "response.completed",
    response: { id: "r1", status: "completed" },
  },
}

export function call(
  input: string,
  id = "one",
  namespace: string | null = "functions",
) {
  const item = {
    type: "custom_tool_call",
    id: `ctc_${id}`,
    call_id: `call_${id}`,
    name: "exec",
    ...(namespace ? { namespace } : {}),
    input,
    status: "completed",
  }
  return [
    {
      event: {
        type: "response.output_item.added",
        output_index: 0,
        item: { ...item, input: "", status: "in_progress" },
      },
    },
    {
      event: {
        type: "response.custom_tool_call_input.delta",
        output_index: 0,
        delta: input,
      },
    },
    {
      event: {
        type: "response.output_item.done",
        output_index: 0,
        item,
      },
    },
    completed,
  ]
}

export function functionCall(
  name: string,
  args: unknown,
  id = "native",
  namespace?: string,
) {
  const item = {
    type: "function_call",
    id: `fc_${id}`,
    call_id: `call_${id}`,
    name,
    ...(namespace ? { namespace } : {}),
    arguments: JSON.stringify(args),
    status: "completed",
  }
  return [
    {
      event: {
        type: "response.output_item.added",
        output_index: 0,
        item: { ...item, arguments: "", status: "in_progress" },
      },
    },
    { event: { type: "response.output_item.done", output_index: 0, item } },
    completed,
  ]
}

export function output(
  host: Awaited<ReturnType<typeof openNativeHost>>,
  id = "one",
) {
  const request = host.requests.at(-1) as unknown as {
    input: Record<string, unknown>[]
  }
  const result = request.input.find(
    (item) =>
      ["custom_tool_call_output", "function_call_output"].includes(
        String(item["type"]),
      ) && item["call_id"] === `call_${id}`,
  )
  assert(result)
  const value = result["output"]
  return typeof value === "string"
    ? value
    : (value as { text: string }[]).map((part) => part.text).join("\n")
}
