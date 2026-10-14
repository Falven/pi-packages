import assert from "node:assert/strict"
import test from "node:test"
import { setTimeout } from "node:timers/promises"
import { DatabaseSync } from "node:sqlite"
import { join } from "node:path"
import piGoal from "../src/index.ts"
import { openNativeHost } from "../../../fixtures/native-host.ts"

const extension = new URL("../src/index.ts", import.meta.url).pathname
type Host = Awaited<ReturnType<typeof openNativeHost>>

const reported = {
  prompt_tokens: 100,
  completion_tokens: 12,
  total_tokens: 112,
  prompt_tokens_details: { cached_tokens: 20 },
  completion_tokens_details: { reasoning_tokens: 4 },
}

function response(
  name: string,
  args: unknown,
  id: string,
  usage: unknown = reported,
) {
  return [
    {
      event: {
        choices: [
          {
            index: 0,
            delta: {
              role: "assistant",
              tool_calls: [
                {
                  index: 0,
                  id,
                  type: "function",
                  function: { name, arguments: JSON.stringify(args) },
                },
              ],
            },
            finish_reason: null,
          },
        ],
      },
    },
    {
      event: {
        choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }],
        usage,
      },
    },
    { event: "[DONE]" },
    { end: true } as const,
  ]
}

function answer(usage: unknown = reported) {
  return [
    {
      event: {
        choices: [
          {
            index: 0,
            delta: {
              role: "assistant",
              content: "The requested boundary is reached.",
            },
            finish_reason: "stop",
          },
        ],
        usage,
      },
    },
    { event: "[DONE]" },
    { end: true } as const,
  ]
}

function result(host: Host, id: string) {
  const message = host.session.messages.find(
    (item) => item.role === "toolResult" && item.toolCallId === id,
  )
  assert(message?.role === "toolResult")
  assert.equal(message.isError, false, JSON.stringify(message.content))
  const content = message.content[0]
  assert(content?.type === "text")
  return JSON.parse(content.text)
}

function ownUsage(tokens: number) {
  return {
    input: 0,
    output: tokens,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: tokens,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  }
}

const noUsage = {
  ...reported,
  prompt_tokens: 0,
  completion_tokens: 0,
  total_tokens: 0,
  prompt_tokens_details: { cached_tokens: 0 },
  completion_tokens_details: { reasoning_tokens: 0 },
}

test("provider usage stays pending until checkpoints and creation excludes earlier reports", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    noTools: "builtin",
    persistSession: true,
  })
  host.queueResponse(
    ...response("create_goal", { objective: "Count reported work" }, "create"),
  )
  host.queueResponse(...response("get_goal", {}, "first-read"))
  host.queueResponse(...response("get_goal", {}, "second-read"))
  host.queueResponse(...response("update_goal", { status: "paused" }, "pause"))
  host.queueResponse(...answer())
  await host.session.prompt(
    "Create the requested goal, inspect it twice, then pause it.",
  )

  assert.equal(result(host, "create").goal.tokensUsed, 0)
  assert.equal(result(host, "first-read").goal.tokensUsed, 0)
  assert.equal(result(host, "second-read").goal.tokensUsed, 92)
  assert.equal(result(host, "pause").goal.tokensUsed, 276)
  assert.equal(result(host, "pause").goal.status, "paused")
  const assistant = host.session.messages.find(
    (message) => message.role === "assistant",
  )
  assert(assistant?.role === "assistant")
  assert.equal(assistant.usage.input, 80)
  assert.equal(assistant.usage.cacheRead, 20)
  assert.equal(assistant.usage.output, 12)
  assert.equal(assistant.usage.reasoning, 4)

  host.queueResponse(...response("get_goal", {}, "after-pause"))
  host.queueResponse(...answer())
  await host.session.prompt("Inspect the paused snapshot.")
  assert.equal(result(host, "after-pause").goal.tokensUsed, 276)
})

for (const completeEarly of [false, true]) {
  test(`nested own reports preserve the ${completeEarly ? "completion" : "creation"} cutoff without charging the later root aggregate`, async (t) => {
    let completion: unknown
    const host = await openNativeHost(t, {
      extensionPaths: [extension],
      noTools: "builtin",
      persistSession: true,
      headless: true,
      extensionFactories: [
        (pi) => {
          const parameters = {
            type: "object",
            properties: {},
            required: [],
          } as const
          for (const [name, tokens] of [
            ["early", 10],
            ["grandchild", 7],
          ] as const) {
            pi.registerTool({
              name,
              label: name,
              description: "Report measured work",
              parameters,
              execute: async () => ({
                content: [{ type: "text", text: "Measured work finished" }],
                usage: ownUsage(tokens),
                details: undefined,
              }),
            })
          }
          pi.registerTool({
            name: "parent",
            label: "Parent",
            description: "Run measured child work",
            parameters,
            execute: async (_id, _args, _signal, _update, ctx) => {
              const child = await ctx.executeTool("grandchild", {})
              assert.equal(child.isError, false)
              if (completeEarly) {
                const completed = await ctx.executeTool("update_goal", {
                  status: "complete",
                })
                assert.equal(completed.isError, false)
                const text = completed.result.content[0]
                assert(text?.type === "text")
                completion = JSON.parse(text.text)
              }
              return {
                content: [{ type: "text", text: "Parent finished" }],
                usage: ownUsage(3),
                details: undefined,
              }
            },
          })
          pi.registerTool({
            name: "exercise",
            label: "Exercise",
            description: "Run nested measured work",
            parameters,
            execute: async (_id, _args, _signal, _update, ctx) => {
              const early = await ctx.executeTool("early", {})
              assert.equal(early.isError, false)
              const created = await ctx.executeTool("create_goal", {
                objective: "Count only newly reported work",
                token_budget: 100,
              })
              assert.equal(created.isError, false)
              const parent = await ctx.executeTool("parent", {})
              assert.equal(parent.isError, false)
              return {
                content: [{ type: "text", text: "Nested work finished" }],
                usage: ownUsage(2),
                details: undefined,
              }
            },
          })
        },
      ],
    })
    host.queueResponse(...response("exercise", {}, "root"))
    host.queueResponse(...response("get_goal", {}, "read-nested", noUsage))
    if (!completeEarly)
      host.queueResponse(
        ...response(
          "update_goal",
          { status: "paused" },
          "pause-nested",
          noUsage,
        ),
      )
    host.queueResponse(...answer(noUsage))
    await host.session.prompt(
      "Run the requested nested goal accounting scenario, then pause.",
    )
    assert.equal(
      result(host, "read-nested").goal.tokensUsed,
      completeEarly ? 7 : 12,
    )
    if (completeEarly) {
      assert.deepEqual(completion, {
        ...result(host, "read-nested"),
        completionBudgetReport:
          "Report completion using the usage in this result. When goal.tokenBudget is present, report goal.tokensUsed against that allowance. When goal.timeUsedSeconds is positive, express the elapsed time briefly in the response language.",
      })
    } else assert.equal(result(host, "pause-nested").goal.tokensUsed, 12)
    const root = host.session.messages.find(
      (message) =>
        message.role === "toolResult" && message.toolCallId === "root",
    )
    assert(root?.role === "toolResult")
    assert.equal(root.usage?.output, 22)
  })
}

test("accounting observes assistant usage after the native message replacement pipeline", async (t) => {
  const host = await openNativeHost(t, {
    extensionFactories: [
      piGoal,
      (pi) => {
        pi.on("message_end", (event) => {
          if (event.message.role === "assistant")
            return { message: { ...event.message, usage: ownUsage(7) } }
          return undefined
        })
      },
    ],
    noTools: "builtin",
    persistSession: true,
  })
  host.queueResponse(
    ...response(
      "create_goal",
      { objective: "Use final reported values" },
      "create",
    ),
  )
  host.queueResponse(...response("get_goal", {}, "read"))
  host.queueResponse(...response("update_goal", { status: "paused" }, "pause"))
  host.queueResponse(...answer())
  await host.session.prompt("Create the requested goal, inspect it and pause.")
  assert.equal(result(host, "pause").goal.tokensUsed, 14)
})

test("a tool checkpoint emits one hidden budget notice and model pause ends the exhausted ledger", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    noTools: "builtin",
    persistSession: true,
  })
  host.queueResponse(
    ...response(
      "create_goal",
      { objective: "Review <scope> & finish", token_budget: 100 },
      "create",
    ),
  )
  host.queueResponse(...response("get_goal", {}, "read-one"))
  host.queueResponse(...response("get_goal", {}, "read-two"))
  host.queueResponse(...response("get_goal", {}, "read-three"))
  host.queueResponse(...response("update_goal", { status: "paused" }, "pause"))
  host.queueResponse(...response("get_goal", {}, "after-pause"))
  host.queueResponse(...answer())
  await host.session.prompt(
    "Create the requested budgeted goal, inspect usage, then pause at the requested boundary.",
  )
  assert.equal(result(host, "read-three").goal.status, "budgetLimited")
  assert.equal(result(host, "read-three").goal.tokensUsed, 184)
  assert.equal(result(host, "read-three").remainingTokens, 0)
  assert.equal(result(host, "pause").goal.status, "budgetLimited")
  assert.equal(result(host, "pause").goal.tokensUsed, 368)
  assert.equal(result(host, "after-pause").goal.tokensUsed, 368)
  assert.equal(host.requests.length, 7)
  const contexts = host.session.messages.filter(
    (message) => message.role === "custom",
  )
  assert.equal(contexts.length, 1)
  const context = contexts[0]
  assert(context?.role === "custom")
  assert.equal(context.customType, "goal.internal_context")
  assert.equal(context.display, false)
  assert.deepEqual(context.details, {
    source: "goal",
    kind: "goal.internal_context",
  })
  assert.equal(typeof context.content, "string")
  assert.match(
    String(context.content),
    /<objective>\nReview &lt;scope&gt; &amp; finish\n<\/objective>/,
  )
  assert.match(String(context.content), /budget_limited/)
  assert.match(String(context.content), /Tokens used: 184\n- Token budget: 100/)
  assert.match(String(context.content), /Elapsed pursuit: 0 seconds/)
  assert.match(String(context.content), /remaining work/)
  assert.match(String(context.content), /<\/goal_internal_context>\n$/)
  const delivered = host.requests[3]?.messages.find((message) =>
    JSON.stringify(message.content).includes("budget_limited"),
  )
  assert.equal(delivered?.role, "user")
})

test("an external edit preserves an exhausted ledger only when its checkpoint is empty", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    noTools: "builtin",
    persistSession: true,
  })
  host.queueResponse(
    ...response(
      "create_goal",
      { objective: "Retain the cutoff", token_budget: 100 },
      "create",
    ),
  )
  host.queueResponse(...response("get_goal", {}, "read-one"))
  host.queueResponse(...response("get_goal", {}, "read-two"))
  host.queueResponse(
    { pause: true },
    ...response("get_goal", {}, "after-empty-edit"),
  )
  host.queueResponse(
    { pause: true },
    ...response("get_goal", {}, "after-timed-edit"),
  )
  host.queueResponse(...response("get_goal", {}, "final-read"))
  host.queueResponse(...answer())
  const run = host.session.prompt(
    "Create the requested budgeted goal and inspect the controlled checkpoints.",
  )
  await t.waitFor(() => assert.equal(host.requests.length, 4))
  await host.session.prompt(
    "/goal edit Updated objective at an empty checkpoint",
  )
  host.resumeResponse()
  await t.waitFor(() => assert.equal(host.requests.length, 5))
  assert.equal(result(host, "after-empty-edit").goal.tokensUsed, 184)
  assert.equal(result(host, "after-empty-edit").goal.timeUsedSeconds, 0)
  await setTimeout(1100)
  await host.session.prompt(
    "/goal edit Updated objective at a timed checkpoint",
  )
  host.resumeResponse()
  await run
  const timed = result(host, "after-timed-edit")
  assert.equal(timed.goal.status, "budgetLimited")
  assert.equal(timed.goal.tokensUsed, 276)
  assert(timed.goal.timeUsedSeconds >= 1)
  assert.equal(timed.goal.objective, "Updated objective at a timed checkpoint")
  assert.deepEqual(result(host, "final-read"), timed)
  assert.equal(host.requests.length, 7)
})

test("cache writes are charged while cache reads and the reasoning subset are not charged twice", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    noTools: "builtin",
    persistSession: true,
  })
  host.queueResponse(
    ...response(
      "create_goal",
      { objective: "Measure cache variants" },
      "create",
      noUsage,
    ),
  )
  host.queueResponse(
    ...response("get_goal", {}, "cache", {
      ...reported,
      prompt_tokens_details: { cached_tokens: 20, cache_write_tokens: 30 },
    }),
  )
  host.queueResponse(
    ...response("update_goal", { status: "paused" }, "pause", noUsage),
  )
  host.queueResponse(...answer(noUsage))
  await host.session.prompt(
    "Create the requested goal and inspect the reported cache usage, then pause.",
  )
  assert.equal(result(host, "pause").goal.tokensUsed, 92)
  const message = host.session.messages.find(
    (item) => item.role === "assistant" && item.usage.cacheWrite > 0,
  )
  assert(message?.role === "assistant")
  assert.equal(message.usage.input, 50)
  assert.equal(message.usage.cacheWrite, 30)
  assert.equal(message.usage.cacheRead, 20)
  assert.equal(message.usage.output, 12)
  assert.equal(message.usage.reasoning, 4)
})

test("a native retry preserves pending reports across repeated start events in one outer run", async (t) => {
  const boundaries: string[] = []
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    noTools: "builtin",
    persistSession: true,
    settings: {
      retry: { enabled: true, maxRetries: 1, baseDelayMs: 10 },
    },
    extensionFactories: [
      (pi) => {
        pi.on("agent_start", () => {
          boundaries.push("start")
        })
        pi.on("agent_settled", () => {
          boundaries.push("settled")
        })
        pi.on("message_end", (event) => {
          if (
            event.message.role === "assistant" &&
            event.message.stopReason === "error"
          )
            return { message: { ...event.message, usage: ownUsage(17) } }
          return undefined
        })
      },
    ],
  })
  host.queueResponse(
    ...response(
      "create_goal",
      { objective: "Retain the retry baseline" },
      "create",
    ),
  )
  host.queueResponse(...response("get_goal", {}, "read-one"))
  host.queueResponse({ status: 503 })
  host.queueResponse(...response("get_goal", {}, "read-retried"))
  host.queueResponse(...response("update_goal", { status: "paused" }, "pause"))
  host.queueResponse(...answer())
  await host.session.prompt(
    "Create the requested goal and pause after the controlled retry.",
  )
  assert.deepEqual(boundaries, ["start", "start", "settled"])
  assert.equal(result(host, "read-retried").goal.tokensUsed, 92)
  assert.equal(result(host, "pause").goal.tokensUsed, 293)
})

test("concurrent child reports are charged once and a late earlier child can contribute after replacement", async (t) => {
  const started = Promise.withResolvers<void>()
  const finishLate = Promise.withResolvers<void>()
  let oldSnapshot: unknown
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    noTools: "builtin",
    persistSession: true,
    extensionFactories: [
      (pi) => {
        const parameters = {
          type: "object",
          properties: {},
          required: [],
        } as const
        pi.registerTool({
          name: "late",
          label: "Late",
          description: "Report work after the controlled release",
          parameters,
          execute: async () => {
            started.resolve()
            await finishLate.promise
            return {
              content: [{ type: "text", text: "Late report" }],
              details: undefined,
              usage: ownUsage(5),
            }
          },
        })
        pi.registerTool({
          name: "measured",
          label: "Measured",
          description: "Report completed work",
          parameters: {
            type: "object",
            properties: { tokens: { type: "integer" } },
            required: ["tokens"],
          } as const,
          execute: async (_id, args) => ({
            content: [{ type: "text", text: "Work reported" }],
            details: undefined,
            usage: ownUsage(args.tokens),
          }),
        })
        pi.registerTool({
          name: "exercise",
          label: "Exercise",
          description: "Run the controlled replacement and parallel reports",
          parameters,
          execute: async (_id, _args, _signal, _update, ctx) => {
            const create = await ctx.executeTool("create_goal", {
              objective: "First objective",
            })
            assert.equal(create.isError, false)
            await ctx.executeTool("measured", { tokens: 20 })
            const late = ctx.executeTool("late", {})
            await started.promise
            const complete = await ctx.executeTool("update_goal", {
              status: "complete",
            })
            assert.equal(complete.isError, false)
            const text = complete.result.content[0]
            assert(text?.type === "text")
            oldSnapshot = JSON.parse(text.text)
            const replacement = await ctx.executeTool("create_goal", {
              objective: "Replacement objective",
            })
            assert.equal(replacement.isError, false)
            finishLate.resolve()
            const outcomes = await Promise.all([
              late,
              ctx.executeTool("measured", { tokens: 7 }),
              ctx.executeTool("measured", { tokens: 3 }),
            ])
            assert(outcomes.every((outcome) => !outcome.isError))
            return {
              content: [{ type: "text", text: "Concurrent reports finished" }],
              details: undefined,
              usage: ownUsage(2),
            }
          },
        })
      },
    ],
  })
  host.queueResponse(...response("exercise", {}, "root"))
  host.queueResponse(...response("get_goal", {}, "read-new", noUsage))
  host.queueResponse(
    ...response("update_goal", { status: "paused" }, "pause", noUsage),
  )
  host.queueResponse(...answer(noUsage))
  await host.session.prompt(
    "Run the requested replacement scenario and pause the replacement goal.",
  )
  assert.equal(
    (oldSnapshot as { goal: { tokensUsed: number } }).goal.tokensUsed,
    20,
  )
  assert.equal(result(host, "read-new").goal.objective, "Replacement objective")
  assert.equal(result(host, "read-new").goal.tokensUsed, 17)
  assert.equal(result(host, "pause").goal.tokensUsed, 17)
  const root = host.session.messages.find(
    (message) => message.role === "toolResult" && message.toolCallId === "root",
  )
  assert(root?.role === "toolResult")
  assert.equal(root.usage?.output, 37)
})

test("final-response exhaustion has no tool notice and completion retains its snapshot after interactive cleanup", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    noTools: "builtin",
    persistSession: true,
  })
  host.queueResponse(
    ...response(
      "create_goal",
      { objective: "Finish the requested work", token_budget: 100 },
      "create",
    ),
  )
  host.queueResponse(
    ...answer({ ...reported, prompt_tokens: 192, total_tokens: 204 }),
  )
  await host.session.prompt(
    "Create the requested budgeted goal and finish the current work attempt.",
  )
  assert.equal(host.requests.length, 2)
  assert.equal(
    host.session.messages.filter((message) => message.role === "custom").length,
    0,
  )
  host.queueResponse(
    ...response("update_goal", { status: "complete" }, "complete"),
  )
  host.queueResponse(...answer())
  await host.session.prompt(
    "The whole objective is verified complete; record completion.",
  )
  const completed = result(host, "complete")
  assert.equal(completed.goal.status, "complete")
  assert.equal(completed.goal.tokensUsed, 184)
  assert.equal(completed.remainingTokens, 0)
  assert.equal(typeof completed.completionBudgetReport, "string")
  host.queueResponse(...response("get_goal", {}, "after-cleanup"))
  host.queueResponse(...answer())
  await host.session.prompt("Inspect the current goal after completion.")
  assert.equal(result(host, "after-cleanup").goal, null)
  assert.equal(result(host, "complete").goal.tokensUsed, 184)
})

test("a failed native tool checkpoint retains pending usage for the next successful write", async (t) => {
  let database: DatabaseSync | undefined
  const host = await openNativeHost(t, {
    extensionFactories: [
      piGoal,
      (pi) => {
        pi.on("tool_execution_end", (event) => {
          if (event.toolName === "create_goal") {
            database = new DatabaseSync(join(host.directory, "pi-goal.sqlite"))
            database.exec(
              "CREATE TRIGGER fail_accounting BEFORE UPDATE OF tokensUsed ON goals BEGIN SELECT RAISE(FAIL, 'Accounting storage unavailable'); END",
            )
          } else if (event.toolCallId === "failed-read") {
            database?.exec("DROP TRIGGER fail_accounting")
          }
        })
      },
    ],
    noTools: "builtin",
    persistSession: true,
  })
  t.after(() => database?.close())
  host.queueResponse(
    ...response(
      "create_goal",
      { objective: "Retain uncommitted usage" },
      "create",
    ),
  )
  host.queueResponse(...response("get_goal", {}, "failed-read"))
  host.queueResponse(...response("get_goal", {}, "retry-read"))
  host.queueResponse(...response("update_goal", { status: "paused" }, "pause"))
  host.queueResponse(...answer())
  await host.session.prompt(
    "Create the requested goal and pause after the recoverable storage failure.",
  )
  assert.equal(result(host, "failed-read").goal.tokensUsed, 0)
  assert.equal(result(host, "retry-read").goal.tokensUsed, 0)
  assert.equal(result(host, "pause").goal.tokensUsed, 276)
})

test("an unaccountable tool report prevents automatic admission even after later valid checkpoints", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    noTools: "builtin",
    persistSession: true,
    holdResponses: true,
    extensionFactories: [
      (pi) => {
        pi.registerTool({
          name: "invalid_report",
          label: "Invalid report",
          description: "Exercise an unsafe native usage value",
          parameters: { type: "object", properties: {}, required: [] },
          execute: async () => ({
            content: [{ type: "text", text: "A report was returned" }],
            details: undefined,
            usage: ownUsage(Number.MAX_SAFE_INTEGER + 1),
          }),
        })
      },
    ],
  })
  host.queueResponse(
    ...response(
      "create_goal",
      { objective: "Require exact measured usage" },
      "create",
    ),
  )
  host.queueResponse(...response("invalid_report", {}, "invalid"))
  host.queueResponse(...response("get_goal", {}, "read"))
  host.queueResponse(...answer())
  await host.session.prompt(
    "Create the requested goal and exercise the invalid report boundary.",
  )
  await new Promise<void>((resolve) => setImmediate(resolve))
  await new Promise<void>((resolve) => setImmediate(resolve))
  assert.equal(
    host.session.messages.filter((message) => message.role === "custom").length,
    0,
  )
  assert.equal(host.requests.length, 4)
  await host.session.prompt("/goal pause")
  host.queueResponse(...response("get_goal", {}, "paused", noUsage))
  host.queueResponse(...answer(noUsage))
  await host.session.prompt("Inspect the known paused usage.")
  assert.equal(result(host, "paused").goal.tokensUsed, 276)
})

for (const shutdown of [false, true]) {
  test(`failed settlement accounting suppresses continuation and ${shutdown ? "shutdown still disposes the extension" : "external pause can retry pending usage"}`, async (t) => {
    let database: DatabaseSync | undefined
    let shutdownObserved = false
    const host = await openNativeHost(t, {
      extensionFactories: [
        piGoal,
        (pi) => {
          pi.on("tool_execution_end", (event) => {
            if (event.toolName === "create_goal") {
              database = new DatabaseSync(
                join(host.directory, "pi-goal.sqlite"),
              )
              database.exec(
                "CREATE TRIGGER fail_accounting BEFORE UPDATE OF tokensUsed ON goals BEGIN SELECT RAISE(FAIL, 'Accounting storage unavailable'); END",
              )
            }
          })
          pi.on("session_shutdown", () => {
            shutdownObserved = true
          })
        },
      ],
      noTools: "builtin",
      persistSession: true,
      holdResponses: true,
    })
    t.after(() => database?.close())
    host.queueResponse(
      ...response(
        "create_goal",
        { objective: "Preserve the failed checkpoint" },
        "create",
      ),
    )
    host.queueResponse(...answer())
    await host.session.prompt(
      "Create the requested goal and finish the controlled attempt.",
    )
    await new Promise<void>((resolve) => setImmediate(resolve))
    await new Promise<void>((resolve) => setImmediate(resolve))
    assert.equal(host.requests.length, 2)
    assert.equal(
      host.session.messages.filter((message) => message.role === "custom")
        .length,
      0,
    )
    if (shutdown) {
      await host.close()
      assert(shutdownObserved)
      await new Promise<void>((resolve) => setImmediate(resolve))
      assert.equal(host.requests.length, 2)
    } else {
      database?.exec("DROP TRIGGER fail_accounting")
      await host.session.prompt("/goal pause")
      host.queueResponse(...response("get_goal", {}, "read", noUsage))
      host.queueResponse(...answer(noUsage))
      await host.session.prompt("Inspect the recovered checkpoint.")
      assert.equal(result(host, "read").goal.status, "paused")
      assert.equal(result(host, "read").goal.tokensUsed, 92)
    }
  })
}

test("raw interruption keeps the live clock while idle inspection leaves the stored snapshot unchanged", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    noTools: "builtin",
    persistSession: true,
    holdResponses: true,
  })
  await host.session.prompt("/goal create Measure active idle time")
  await t.waitFor(() => assert.equal(host.requests.length, 1))
  await host.session.abort()
  await setTimeout(1100)
  await host.session.prompt("/goal inspect")
  assert.match(await host.frame(), /Elapsed pursuit:\s+0 seconds/)
  assert.equal(host.requests.length, 1)
  await host.session.prompt("/goal pause")
  host.queueResponse(...response("get_goal", {}, "paused", noUsage))
  host.queueResponse(...answer(noUsage))
  await host.session.prompt("Inspect the paused elapsed-time snapshot.")
  assert.equal(result(host, "paused").goal.status, "paused")
  assert.equal(result(host, "paused").goal.tokensUsed, 0)
  assert(result(host, "paused").goal.timeUsedSeconds >= 1)
})

for (const outcome of ["invalid", "unsuccessful", "handler-failure"] as const) {
  test(`tool-finish accounting respects native execution provenance for ${outcome}`, async (t) => {
    const host = await openNativeHost(t, {
      extensionPaths: [extension],
      noTools: "builtin",
      persistSession: true,
      extensionFactories: [
        (pi) => {
          pi.registerTool({
            name: "work",
            label: "Work",
            description: "Exercise a controlled execution outcome",
            parameters: {
              type: "object",
              properties: {},
              required: [],
              additionalProperties: false,
            },
            execute: async () => {
              if (outcome === "handler-failure")
                throw new Error("Controlled executed failure")
              return {
                content: [{ type: "text", text: "Work did not succeed" }],
                details: undefined,
              }
            },
          })
          pi.on("tool_result", (event) => {
            if (event.toolName === "work" && outcome === "unsuccessful")
              return { isError: true, usage: ownUsage(17) }
            return undefined
          })
        },
      ],
    })
    host.queueResponse(
      ...response(
        "create_goal",
        { objective: "Count executed work", token_budget: 50 },
        "create",
      ),
    )
    host.queueResponse(
      ...response(
        "work",
        outcome === "invalid" ? { unexpected: true } : {},
        "attempt",
      ),
    )
    host.queueResponse(...response("get_goal", {}, "read"))
    host.queueResponse(...answer())
    await host.session.prompt(
      "Create the requested budgeted goal and observe the controlled tool outcome.",
    )
    const attempt = host.session.messages.find(
      (message) =>
        message.role === "toolResult" && message.toolCallId === "attempt",
    )
    assert(attempt?.role === "toolResult" && attempt.isError)
    assert.equal(
      result(host, "read").goal.tokensUsed,
      outcome === "invalid" ? 0 : outcome === "unsuccessful" ? 109 : 92,
    )
    assert.equal(
      host.session.messages.filter((message) => message.role === "custom")
        .length,
      1,
    )
    assert.equal(host.requests.length, 4)
  })
}
