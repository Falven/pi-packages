import assert from "node:assert/strict"
import test from "node:test"
import { openNativeHost } from "../../../fixtures/native-host.ts"

const extension = new URL("../src/index.ts", import.meta.url).pathname

function call(name: string, args: unknown, id: string) {
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
      },
    },
    { event: "[DONE]" },
    { end: true } as const,
  ]
}

function answer(text: string) {
  return [
    {
      event: {
        choices: [
          {
            index: 0,
            delta: { role: "assistant", content: text },
            finish_reason: null,
          },
        ],
      },
    },
    { event: { choices: [{ index: 0, delta: {}, finish_reason: "stop" }] } },
    { event: "[DONE]" },
    { end: true } as const,
  ]
}

test("an active goal continues in one fresh outer run with hidden current context", async (t) => {
  const boundaries: string[] = []
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    noTools: "builtin",
    persistSession: true,
    extensionFactories: [
      (pi) => {
        pi.on("agent_start", () => {
          boundaries.push("start")
        })
        pi.on("agent_settled", () => {
          boundaries.push("settled")
        })
      },
    ],
  })
  host.queueResponse(
    ...call(
      "create_goal",
      { objective: "Finish <scope> & verify", token_budget: 5000 },
      "create",
    ),
  )
  host.queueResponse(...answer("The first work attempt is finished."))
  host.queueResponse(...call("update_goal", { status: "paused" }, "pause"))
  host.queueResponse(
    ...answer("Paused as explicitly requested for this controlled run."),
  )
  await host.session.prompt(
    "Create the requested goal, work once, then pause during the next work attempt.",
  )
  await t.waitFor(() =>
    assert.deepEqual(boundaries, ["start", "settled", "start", "settled"]),
  )
  assert.equal(host.requests.length, 4)
  assert.equal(
    JSON.stringify(host.requests[1]).includes("<goal_internal_context"),
    false,
  )
  const last = host.requests[2]?.messages.at(-1)
  assert.equal(last?.role, "user")
  assert(Array.isArray(last.content))
  const content = last.content[0]
  assert.equal(content.type, "text")
  assert.match(
    content.text,
    /<objective>\nFinish &lt;scope&gt; &amp; verify\n<\/objective>/,
  )
  assert.match(
    content.text,
    /Tokens used: 0\n- Token budget: 5000\n- Tokens remaining: 5000/,
  )
  assert.match(content.text, /three consecutive goal turns/)
  assert.match(content.text, /\n\n<\/goal_internal_context>$/)
  assert.doesNotMatch(content.text, /update_plan/)
  const contexts = host.session.messages.filter(
    (message) => message.role === "custom",
  )
  assert.equal(contexts.length, 1)
  const context = contexts[0]
  assert(context?.role === "custom")
  assert.equal(context.customType, "goal.internal_context")
  assert.equal(context.display, false)
  const details = context.details as {
    source: string
    kind: string
    continuationId: string
  }
  assert.equal(details.source, "goal")
  assert.equal(details.kind, "goal.internal_context")
  assert.equal(typeof details.continuationId, "string")
  const result = host.session.messages.findLast(
    (message) => message.role === "toolResult",
  )
  assert(result?.role === "toolResult")
  assert(result.content[0]?.type === "text")
  assert.equal(JSON.parse(result.content[0].text).goal.status, "paused")
})

test("an idle activation uses the latest objective and optional plan capability", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    noTools: "builtin",
    persistSession: true,
    extensionFactories: [
      (pi) => {
        pi.registerTool({
          name: "update_plan",
          label: "Update plan",
          description: "Maintain a concise work plan",
          parameters: { type: "object", properties: {}, required: [] },
          execute: async () => ({
            content: [{ type: "text", text: "Plan updated" }],
            details: undefined,
          }),
        })
      },
    ],
  })
  host.queueResponse(...call("update_goal", { status: "paused" }, "pause-idle"))
  host.queueResponse(...answer("Paused at the requested test boundary."))
  await host.session.prompt("/goal create The original idle objective")
  await host.session.prompt("/goal edit Latest <scope> & evidence")
  await t.waitFor(() => assert.equal(host.requests.length, 2))
  await t.waitFor(() => assert.equal(host.session.isStreaming, false))
  const next = host.requests[0]?.messages.at(-1)
  assert.equal(next?.role, "user")
  assert(Array.isArray(next.content))
  assert.match(
    next.content[0].text,
    /<objective>\nLatest &lt;scope&gt; &amp; evidence\n<\/objective>/,
  )
  assert.match(
    next.content[0].text,
    /Token budget: none\n- Tokens remaining: unbounded/,
  )
  assert.match(next.content[0].text, /update_plan/)
  assert.equal(
    host.session.messages.filter((message) => message.role === "custom").length,
    1,
  )
  assert.equal(
    JSON.stringify(host.requests[0]).includes("untrusted_objective"),
    false,
  )
})

test("accepted user work awaiting a public start hook cancels pending idle admission", async (t) => {
  let waiting = false
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    noTools: "builtin",
    persistSession: true,
    extensionFactories: [
      (pi) => {
        pi.on("before_agent_start", async () => {
          waiting = true
          await new Promise<void>((resolve) => setImmediate(resolve))
        })
      },
    ],
  })
  host.queueResponse(...call("update_goal", { status: "paused" }, "pause-user"))
  host.queueResponse(
    ...answer("The accepted user work reached its requested pause."),
  )
  await host.session.prompt("/goal create Preserve accepted user work")
  await host.session.prompt("Do this already accepted work and pause the goal.")
  assert(waiting)
  assert.equal(host.requests.length, 2)
  assert.deepEqual(host.requests[0]?.messages.at(-1), {
    role: "user",
    content: [
      {
        type: "text",
        text: "Do this already accepted work and pause the goal.",
      },
    ],
  })
  assert.equal(
    host.session.messages.filter((message) => message.role === "custom").length,
    0,
  )
})

for (const action of ["pause", "clear"] as const) {
  test(`an asynchronously settled ${action} rejects an already deferred continuation`, async (t) => {
    let queued = false
    const boundaries: string[] = []
    const host = await openNativeHost(t, {
      extensionPaths: [extension],
      noTools: "builtin",
      persistSession: true,
      holdResponses: true,
      extensionFactories: [
        (pi) => {
          pi.on("agent_start", () => {
            boundaries.push("start")
          })
          pi.on("agent_settled", async () => {
            boundaries.push("settled")
            if (queued) return
            queued = true
            pi.sendUserMessage(`/goal ${action}`, {
              expandPromptTemplates: true,
            })
            await new Promise<void>((resolve) => setImmediate(resolve))
          })
        },
      ],
    })
    host.queueResponse(
      ...call(
        "create_goal",
        { objective: `Verify deferred ${action}` },
        `create-${action}`,
      ),
    )
    host.queueResponse(...answer("The first work attempt is finished."))
    await host.session.prompt(
      "Create the requested goal, then apply the queued explicit control.",
    )
    await new Promise<void>((resolve) => setImmediate(resolve))
    assert.equal(host.requests.length, 2)
    assert.deepEqual(boundaries, ["start", "settled"])
    assert.equal(
      host.session.messages.filter((message) => message.role === "custom")
        .length,
      0,
    )
    host.queueResponse(...call("get_goal", {}, `read-${action}`))
    host.queueResponse(...answer("Inspection complete."))
    await host.session.prompt("Inspect the goal after the requested control.")
    const result = host.session.messages.findLast(
      (message) => message.role === "toolResult",
    )
    assert(result?.role === "toolResult" && result.content[0]?.type === "text")
    const current = JSON.parse(result.content[0].text).goal
    if (action === "pause") assert.equal(current.status, "paused")
    else assert.equal(current, null)
    assert.equal(host.requests.length, 4)
  })
}

for (const actions of [
  ["clear", "create Replacement objective"],
  ["pause", "resume"],
]) {
  test(`deferred ${actions.join(" and ")} admits only the latest active state`, async (t) => {
    let queued = false
    const boundaries: string[] = []
    const host = await openNativeHost(t, {
      extensionPaths: [extension],
      noTools: "builtin",
      persistSession: true,
      holdResponses: true,
      extensionFactories: [
        (pi) => {
          pi.on("agent_start", () => {
            boundaries.push("start")
          })
          pi.on("agent_settled", async () => {
            boundaries.push("settled")
            if (queued) return
            queued = true
            for (const action of actions)
              pi.sendUserMessage(`/goal ${action}`, {
                expandPromptTemplates: true,
              })
            await new Promise<void>((resolve) => setImmediate(resolve))
          })
        },
      ],
    })
    host.queueResponse(
      ...call(
        "create_goal",
        { objective: "Original objective" },
        "create-stale",
      ),
    )
    host.queueResponse(...answer("The first work attempt is finished."))
    host.queueResponse(
      ...call("update_goal", { status: "paused" }, "pause-latest"),
    )
    host.queueResponse(
      ...answer("The latest work attempt reached its requested pause."),
    )
    await host.session.prompt(
      "Create the requested goal and apply the queued controls before the next attempt.",
    )
    await t.waitFor(() =>
      assert.deepEqual(boundaries, ["start", "settled", "start", "settled"]),
    )
    assert.equal(host.requests.length, 4)
    const contexts = host.session.messages.filter(
      (message) => message.role === "custom",
    )
    assert.equal(contexts.length, 1)
    const latest = contexts[0]
    assert(latest?.role === "custom" && typeof latest.content === "string")
    assert.match(
      latest.content,
      actions[0] === "clear"
        ? /<objective>\nReplacement objective\n/
        : /<objective>\nOriginal objective\n/,
    )
    assert.equal(
      typeof (latest.details as { continuationId: string }).continuationId,
      "string",
    )
  })
}

test("restoring the individual active session admits its current goal", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    noTools: "builtin",
    persistSession: true,
    holdResponses: true,
  })
  host.queueResponse(
    ...call(
      "create_goal",
      { objective: "Continue this restored session only" },
      "create-restored",
    ),
  )
  host.queueResponse(...answer("The initial work attempt is finished."))
  await host.session.prompt("Create the requested persistent goal.")
  const sessionFile = host.session.sessionManager.getSessionFile()
  assert(sessionFile)
  await host.close()
  const restored = await openNativeHost(t, {
    extensionPaths: [extension],
    noTools: "builtin",
    directory: host.directory,
    sessionFile,
    holdResponses: true,
  })
  await t.waitFor(() => assert.equal(restored.requests.length, 1))
  const last = restored.requests[0]?.messages.at(-1)
  assert.equal(last?.role, "user")
  assert.match(
    JSON.stringify(last?.content),
    /Continue this restored session only/,
  )
  assert.equal(
    restored.session.messages.filter((message) => message.role === "custom")
      .length,
    1,
  )
  await restored.session.prompt("/goal pause")
  await restored.session.abort()
})

test("already queued user work runs before an idle continuation and can pause it", async (t) => {
  let queued = false
  const boundaries: string[] = []
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    noTools: "builtin",
    persistSession: true,
    holdResponses: true,
    extensionFactories: [
      (pi) => {
        pi.on("agent_start", () => {
          boundaries.push("start")
        })
        pi.on("agent_settled", async () => {
          boundaries.push("settled")
          if (queued) return
          queued = true
          pi.sendUserMessage(
            "Apply this accepted user request and pause the goal.",
          )
          await new Promise<void>((resolve) => setImmediate(resolve))
        })
      },
    ],
  })
  host.queueResponse(
    ...call(
      "create_goal",
      { objective: "Respect accepted work" },
      "create-queued",
    ),
  )
  host.queueResponse(...answer("The initial attempt is finished."))
  host.queueResponse(
    ...call("update_goal", { status: "paused" }, "pause-queued"),
  )
  host.queueResponse(...answer("The accepted user request paused the goal."))
  await host.session.prompt(
    "Create the requested goal, then handle the queued user work.",
  )
  assert.deepEqual(boundaries, ["start", "settled", "start", "settled"])
  assert.equal(host.requests.length, 4)
  assert.deepEqual(host.requests[2]?.messages.at(-1), {
    role: "user",
    content: [
      {
        type: "text",
        text: "Apply this accepted user request and pause the goal.",
      },
    ],
  })
  assert.equal(
    host.session.messages.filter((message) => message.role === "custom").length,
    0,
  )
})

for (const action of ["reload", "dispose"] as const) {
  test(`retaining ${action} invalidates the old pending command`, async (t) => {
    let queued = false
    const events: string[] = []
    const host = await openNativeHost(t, {
      extensionPaths: [extension],
      noTools: "builtin",
      persistSession: true,
      holdResponses: true,
      extensionFactories: [
        (pi) => {
          pi.registerCommand("goal-runtime-probe", {
            description: "Apply the requested runtime lifecycle boundary",
            handler: async (_args, ctx) => {
              if (action === "reload") await ctx.reload()
              else await host.runtime.dispose()
              events.push(action)
            },
          })
          pi.on("agent_start", () => {
            events.push("start")
          })
          pi.on("session_shutdown", () => {
            events.push("shutdown")
          })
          pi.on("agent_settled", async () => {
            events.push("settled")
            if (queued) return
            queued = true
            pi.sendUserMessage("/goal-runtime-probe", {
              expandPromptTemplates: true,
            })
            await new Promise<void>((resolve) => setImmediate(resolve))
          })
        },
      ],
    })
    host.queueResponse(
      ...call(
        "create_goal",
        { objective: "Respect the runtime lifetime" },
        `create-${action}`,
      ),
    )
    host.queueResponse(...answer("The initial attempt is finished."))
    if (action === "reload") {
      host.queueResponse(
        ...call("update_goal", { status: "paused" }, "pause-reloaded"),
      )
      host.queueResponse(
        ...answer("The restored attempt reached its requested pause."),
      )
    }
    await host.session.prompt(
      "Create the requested goal, then apply the runtime lifecycle boundary.",
    )
    if (action === "reload") {
      await t.waitFor(() =>
        assert.deepEqual(events, [
          "start",
          "settled",
          "shutdown",
          "reload",
          "start",
          "settled",
        ]),
      )
      assert.equal(host.requests.length, 4)
      assert.equal(
        host.session.messages.filter((message) => message.role === "custom")
          .length,
        1,
      )
    } else {
      await new Promise<void>((resolve) => setImmediate(resolve))
      assert.deepEqual(events, ["start", "settled", "shutdown", "dispose"])
      assert.equal(host.requests.length, 2)
      assert.equal(
        host.session.messages.filter((message) => message.role === "custom")
          .length,
        0,
      )
    }
  })
}

test("raw backend abort leaves the goal active without an immediate continuation", async (t) => {
  const boundaries: string[] = []
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    noTools: "builtin",
    persistSession: true,
    holdResponses: true,
    extensionFactories: [
      (pi) => {
        pi.on("agent_start", () => {
          boundaries.push("start")
        })
        pi.on("agent_settled", () => {
          boundaries.push("settled")
        })
      },
    ],
  })
  host.queueResponse(
    ...call(
      "create_goal",
      { objective: "Keep pause separate from raw abort" },
      "create-abort",
    ),
  )
  const run = host.session.prompt(
    "Create the requested goal and start the controlled work.",
  )
  await t.waitFor(() => assert.equal(host.requests.length, 2))
  assert.deepEqual(boundaries, ["start"])
  await host.session.abort()
  await run
  await new Promise<void>((resolve) => setImmediate(resolve))
  assert.deepEqual(boundaries, ["start", "settled"])
  assert.equal(host.requests.length, 2)
  assert.deepEqual(
    host.session.messages.filter((message) => message.role === "custom"),
    [],
  )
  host.queueResponse(...call("get_goal", {}, "read-aborted"))
  host.queueResponse(...answer("Inspection complete."))
  await host.session.prompt("Inspect the goal after the raw backend abort.")
  await host.session.prompt("/goal pause")
  const result = host.session.messages.findLast(
    (message) => message.role === "toolResult",
  )
  assert(result?.role === "toolResult" && result.content[0]?.type === "text")
  assert.equal(JSON.parse(result.content[0].text).goal.status, "active")
  assert.equal(host.requests.length, 4)
})
