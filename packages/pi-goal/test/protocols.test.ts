/* eslint-disable no-await-in-loop -- Each native session must close before opening the next one. */
import assert from "node:assert/strict"
import test from "node:test"
import { openNativeHost } from "../../../fixtures/native-host.ts"

const extension = new URL("../src/index.ts", import.meta.url).pathname
const end = { end: true } as const

function call(name: string, raw: string, delta: boolean) {
  const item = {
    type: "function_call",
    id: "goal-item",
    call_id: "goal-call",
    name,
    arguments: raw,
  }
  return [
    { event: { type: "response.created", response: { id: "goal-response" } } },
    {
      event: {
        type: "response.output_item.added",
        output_index: 0,
        item: { ...item, arguments: "" },
      },
    },
    ...(delta
      ? [
          {
            event: {
              type: "response.function_call_arguments.delta",
              output_index: 0,
              item_id: item.id,
              delta: raw,
            },
          },
        ]
      : []),
    { event: { type: "response.output_item.done", output_index: 0, item } },
    {
      event: {
        type: "response.completed",
        response: { id: "goal-response", status: "completed", output: [item] },
      },
    },
    end,
  ]
}

test("both provider protocols advertise native goal inputs and lossless budget guidance", async (t) => {
  for (const providerProtocol of ["completions", "responses"] as const) {
    await t.test(providerProtocol, async (caseT) => {
      const host = await openNativeHost(caseT, {
        providerProtocol,
        extensionPaths: [extension],
        noTools: "builtin",
        persistSession: true,
      })
      await host.session.prompt("Explain goal controls")
      assert.equal(host.requests.length, 1)
      const payload = JSON.parse(host.requestBodies[0]!)
      const declarations = payload.tools.map(
        (tool: { function?: unknown }) => tool.function ?? tool,
      )
      assert.deepEqual(
        declarations.map((tool: { name: string }) => tool.name).toSorted(),
        ["create_goal", "get_goal", "update_goal"],
      )
      for (const tool of declarations) {
        assert.equal(tool.parameters.type, "object")
        assert.equal(tool.parameters.additionalProperties, false)
        assert.equal("outputSchema" in tool, false)
        assert.equal("output_schema" in tool, false)
        if (tool.name === "get_goal") {
          assert.deepEqual(tool.parameters.properties, {})
          assert.deepEqual(tool.parameters.required, [])
        } else if (tool.name === "update_goal") {
          assert.deepEqual(tool.parameters.required, ["status"])
          assert.deepEqual(tool.parameters.properties.status.enum, [
            "complete",
            "blocked",
            "paused",
          ])
          assert.equal(tool.parameters.properties.status.type, "string")
          assert.match(tool.description, /explicit user request/)
          assert.match(tool.description, /three consecutive goal turns/)
          assert.match(tool.description, /fresh three-turn audit/)
          assert.match(tool.description, /returned fields/)
        } else {
          assert.deepEqual(tool.parameters.required, ["objective"])
          assert.equal(tool.parameters.properties.objective.type, "string")
          const budget = tool.parameters.properties.token_budget
          assert.deepEqual(budget.type, ["integer", "string"])
          assert.equal(budget.minimum, 1)
          assert.equal(budget.maximum, 9007199254740991)
          assert.equal(budget.maxLength, 19)
          assert.match(budget.description, /exact decimal string/)
          assert.match(tool.description, /explicit user request/)
          assert.match(
            tool.description,
            /only when the budget was explicitly requested/,
          )
        }
      }
    })
  }
})

test("native provider history preserves decimal-string budgets after reopening", async (t) => {
  for (const delta of [true, false]) {
    await t.test(
      delta ? "streamed arguments" : "finalized arguments",
      async (caseT) => {
        const host = await openNativeHost(caseT, {
          providerProtocol: "responses",
          extensionPaths: [extension],
          noTools: "builtin",
          persistSession: true,
        })
        const raw =
          '{"objective": "Retain exact input", "token_budget": "9223372036854775807"}'
        host.queueResponse(...call("create_goal", raw, delta))
        await host.session.prompt("Create the explicitly budgeted goal")
        const result = host.session.messages.findLast(
          (message) => message.role === "toolResult",
        )
        assert(result?.role === "toolResult")
        const content = result.content[0]
        assert(content?.type === "text")
        assert.equal(result.isError, false, content.text)
        assert.match(content.text, /"tokenBudget":"9223372036854775807"/)
        const after = JSON.parse(host.requestBodies[1]!)
        const replayed = after.input.find(
          (item: { type: string }) => item.type === "function_call",
        )
        assert.deepEqual(JSON.parse(replayed.arguments), JSON.parse(raw))
        const output = after.input.find(
          (item: { type: string }) => item.type === "function_call_output",
        )
        assert.equal(output.call_id, replayed.call_id)
        assert.match(output.output, /"remainingTokens":"9223372036854775807"/)
        const sessionFile = host.session.sessionManager.getSessionFile()
        assert(sessionFile)
        await host.session.prompt("/goal pause")
        await host.close()
        const reopened = await openNativeHost(caseT, {
          providerProtocol: "responses",
          extensionPaths: [extension],
          noTools: "builtin",
          directory: host.directory,
          sessionFile,
        })
        await reopened.session.prompt("Retain the current goal")
        const restored = JSON.parse(reopened.requestBodies[0]!)
        assert.deepEqual(
          JSON.parse(
            restored.input.find(
              (item: { type: string }) => item.type === "function_call",
            ).arguments,
          ),
          JSON.parse(raw),
        )
      },
    )
  }
})
