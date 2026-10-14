import assert from "node:assert/strict"
import test from "node:test"
import { createCodemodeExtension } from "@earendil-works/pi-coding-agent"
import { openNativeHost } from "../../../fixtures/native-host.ts"

function call(name: string, args: string) {
  return {
    event: {
      choices: [
        {
          index: 0,
          delta: {
            role: "assistant",
            tool_calls: [
              {
                index: 0,
                id: "goal-boundary-call",
                type: "function",
                function: { name, arguments: args },
              },
            ],
          },
          finish_reason: null,
        },
      ],
    },
  }
}

const finish = {
  event: { choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }] },
}
const done = { event: "[DONE]" }
const end = { end: true } as const

test("public stream events retain arguments that the provider parser loses", async (t) => {
  const raw =
    '{"objective":"first","objective":"second","token_budget":9007199254740993}'
  const observed: unknown[] = []
  const streamed: unknown[] = []
  const host = await openNativeHost(t, {
    noTools: "builtin",
    extension: (pi) => {
      pi.on("provider_stream_event", (event) => {
        streamed.push(event.data)
      })
      pi.registerTool({
        name: "goal_boundary",
        label: "Goal boundary",
        description: "Inspect the provider argument boundary.",
        parameters: { type: "object", properties: {} },
        execute: async (_id, args) => {
          observed.push(args)
          return {
            content: [{ type: "text", text: JSON.stringify(args) }],
            details: undefined,
          }
        },
      })
    },
  })
  host.queueResponse(call("goal_boundary", raw), finish, done, end)
  await host.type("Inspect the goal argument boundary")
  await host.key("\r")
  await t.waitFor(() => assert.equal(host.requests.length, 2))
  await host.settled()

  assert.deepEqual(observed, [
    { objective: "second", token_budget: 9007199254740992 },
  ])
  assert(JSON.stringify(streamed).includes(JSON.stringify(raw)))
  assert.match(JSON.stringify(host.requests[1]), /9007199254740992/)
  assert.doesNotMatch(JSON.stringify(host.requests[1]), /9007199254740993/)
})

test("native programmatic calls without an output schema return JSON text", async (t) => {
  const host = await openNativeHost(t, {
    tools: ["codemode", "goal_boundary"],
    extensionFactories: [createCodemodeExtension({ models: false })],
    extension: (pi) => {
      pi.registerTool({
        name: "goal_boundary",
        label: "Goal boundary",
        description: "Inspect native programmatic goal results.",
        parameters: { type: "object", properties: {} },
        execute: async () => ({
          content: [{ type: "text", text: '{"goal":null}' }],
          structuredContent: { goal: null },
          details: undefined,
        }),
      })
    },
  })
  host.queueResponse(
    call(
      "codemode",
      JSON.stringify({
        code: "const value = await tools.goal_boundary({}); text({ type: typeof value, value });",
      }),
    ),
    finish,
    done,
    end,
  )
  await host.type("Inspect native programmatic goal results")
  await host.key("\r")
  await t.waitFor(() => assert.equal(host.requests.length, 2))
  await host.settled()

  const result = host.session.messages.find(
    (message) => message.role === "toolResult",
  )
  assert(result?.role === "toolResult")
  assert.equal(result.isError, false, JSON.stringify(result.content))
  const text = result.content
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n")
  assert.match(text, /"type":\s*"string"/)
  assert.match(text, /\\"goal\\":null/)
})

test("an internal unknown result schema preserves native JSON without an output declaration", async (t) => {
  const host = await openNativeHost(t, {
    tools: ["codemode", "goal_boundary"],
    extensionFactories: [createCodemodeExtension({ models: false })],
    extension: (pi) => {
      pi.registerTool({
        name: "goal_boundary",
        label: "Goal boundary",
        description: "Inspect native programmatic goal results.",
        parameters: { type: "object", properties: {} },
        outputSchema: {},
        execute: async () => ({
          content: [{ type: "text", text: '{"goal":null}' }],
          structuredContent: { goal: null },
          details: undefined,
        }),
      })
    },
  })
  host.queueResponse(
    call(
      "codemode",
      JSON.stringify({
        code: "const value = await tools.goal_boundary({}); text({ type: typeof value, value });",
      }),
    ),
    finish,
    done,
    end,
  )
  await host.type("Inspect native JSON results")
  await host.key("\r")
  await t.waitFor(() => assert.equal(host.requests.length, 2))
  await host.settled()

  const result = host.session.messages.find(
    (message) => message.role === "toolResult",
  )
  assert(result?.role === "toolResult")
  assert.equal(result.isError, false, JSON.stringify(result.content))
  const text = result.content
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n")
  assert.match(text, /"type":\s*"object"/)
  assert.match(text, /"goal":\s*null/)
  assert.doesNotMatch(
    JSON.stringify(host.requests[0]),
    /outputSchema|output_schema/,
  )
  assert.match(JSON.stringify(host.requests[0]), /resolves to `unknown`/)
})
