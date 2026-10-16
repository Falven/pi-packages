import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { mkdirSync, renameSync, rmSync } from "node:fs"
import test from "node:test"
import { openNativeHost } from "../../../fixtures/native-host.ts"

const extension = new URL("../src/index.ts", import.meta.url).pathname
type Host = Awaited<ReturnType<typeof openNativeHost>>

function text(content: string, phase?: string) {
  return {
    type: "message",
    id: randomUUID(),
    role: "assistant",
    content: [{ type: "output_text", text: content }],
    ...(phase === undefined ? {} : { phase }),
  }
}

function call(name: string, args: unknown, id: string) {
  return {
    type: "function_call",
    id: `${id}-item`,
    call_id: id,
    name,
    arguments: JSON.stringify(args),
  }
}

function response(...items: unknown[]) {
  const id = randomUUID()
  return [
    { event: { type: "response.created", response: { id } } },
    ...items.flatMap((item, output_index) => [
      { event: { type: "response.output_item.added", output_index, item } },
      { event: { type: "response.output_item.done", output_index, item } },
    ]),
    {
      event: {
        type: "response.completed",
        response: { id, status: "completed", output: items },
      },
    },
    { end: true } as const,
  ]
}

function failure(id: string | undefined, code: string) {
  return [
    { event: { type: "response.created", response: { id } } },
    {
      event: {
        type: "response.failed",
        response: {
          id,
          status: "failed",
          error: { code, message: "Controlled provider failure" },
        },
      },
    },
    { end: true } as const,
  ]
}

function chargedResponse(tokens: number, ...items: unknown[]) {
  const steps = response(...items)
  const completed = steps.find(
    (step) => "event" in step && step.event.type === "response.completed",
  )
  assert(completed && "event" in completed && "response" in completed.event)
  Object.assign(completed.event.response, {
    usage: {
      input_tokens: tokens,
      input_tokens_details: { cached_tokens: 0 },
      output_tokens: 0,
      total_tokens: tokens,
    },
  })
  return steps
}

function result(host: Host, id: string) {
  const message = host.session.messages.findLast(
    (item) => item.role === "toolResult" && item.toolCallId.startsWith(id),
  )
  assert(message?.role === "toolResult")
  assert.equal(message.isError, false, JSON.stringify(message.content))
  const content = message.content[0]
  assert(content?.type === "text")
  return JSON.parse(content.text)
}

test("the third admitted empty continuation blocks the goal", async (t) => {
  let settled = 0
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerProtocol: "responses",
    noTools: "builtin",
    persistSession: true,
    holdResponses: true,
    extensionFactories: [
      (pi) => {
        pi.on("agent_settled", () => {
          settled++
          if (settled === 3) pi.sendUserMessage("Inspect the stopped goal.")
        })
      },
    ],
  })
  host.queueResponse(...response(text("", "final_answer")))
  host.queueResponse(...response(text(" \n\u0085", "final_answer")))
  host.queueResponse(...response(text("")))
  host.queueResponse(...response(call("get_goal", {}, "inspect")))
  host.queueResponse(...response(text("Inspection complete.")))
  await host.session.prompt("/goal create Finish the requested work")
  await t.waitFor(() => assert(settled >= 4))
  assert.equal(result(host, "inspect").goal.status, "blocked")
  assert.equal(host.requests.length, 5)
  assert.equal(
    host.session.messages.filter((message) => message.role === "custom").length,
    3,
  )
})

test("native state entries neither reset empty turns nor make a user turn automatic", async (t) => {
  let settled = 0
  let appended = 0
  let generation: string | undefined
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerProtocol: "responses",
    noTools: "builtin",
    persistSession: true,
    holdResponses: true,
    extensionFactories: [
      (pi) => {
        pi.on("agent_before_settle", (_event, ctx) => {
          if (settled >= 4) return
          const stored = ctx.sessionManager
            .getEntries()
            .findLast(
              (entry) =>
                entry.type === "custom" && entry.customType === "pi-goal.state",
            )
          assert(stored?.type === "custom")
          generation = (stored.data as { generation: string }).generation
          pi.appendEntry("pi-goal.state", stored.data)
          appended++
        })
        pi.on("agent_settled", () => {
          settled++
          if (settled === 4)
            pi.sendUserMessage("Inspect after the empty attempts.")
        })
      },
    ],
  })
  for (let i = 0; i < 4; i++) host.queueResponse(...response(text("")))
  host.queueResponse(...response(call("get_goal", {}, "inspect")))
  host.queueResponse(...response(text("Inspection complete.")))
  await host.session.prompt("/goal create Finish the current objective")
  await host.session.prompt("Work on the goal once.")
  await t.waitFor(() => assert(settled >= 5))
  assert.equal(result(host, "inspect").goal.status, "blocked")
  assert.equal(appended, 4)
  assert.equal(host.requests.length, 6)
  const contexts = host.session.messages.filter(
    (message) => message.role === "custom",
  )
  assert.equal(contexts.length, 3)
  assert(
    contexts.every((message) => message.customType === "goal.internal_context"),
  )
  const firstRequest = host.requestBodies[0]
  assert(firstRequest)
  assert.match(firstRequest, /Work on the goal once\./)
  assert.doesNotMatch(firstRequest, /<goal_internal_context/)
  assert(generation)
  const payloads = host.requestBodies.join("\n")
  assert.equal(payloads.includes(generation), false)
  assert.doesNotMatch(payloads, /pi-goal\.state/)
})

test("a completed reasoning summary resets the empty continuation sequence", async (t) => {
  let settled = 0
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerProtocol: "responses",
    noTools: "builtin",
    persistSession: true,
    holdResponses: true,
    extensionFactories: [
      (pi) => {
        pi.on("agent_settled", () => {
          settled++
          if (settled === 6) pi.sendUserMessage("Inspect the stopped goal.")
        })
      },
    ],
  })
  host.queueResponse(...response(text("")))
  host.queueResponse(...response(text("")))
  host.queueResponse(
    ...response(
      {
        type: "reasoning",
        id: "summary",
        summary: [{ type: "summary_text", text: "Checked the current work." }],
      },
      text(""),
    ),
  )
  host.queueResponse(...response(text("")))
  host.queueResponse(...response(text("")))
  host.queueResponse(...response(text("")))
  host.queueResponse(...response(call("get_goal", {}, "inspect")))
  host.queueResponse(...response(text("Inspection complete.")))
  await host.session.prompt(
    "/goal create Finish the work with current evidence",
  )
  await t.waitFor(() => assert(settled >= 7))
  assert.equal(result(host, "inspect").goal.status, "blocked")
  assert.equal(host.requests.length, 8)
})

test("a delivered tool outcome resets the empty continuation sequence", async (t) => {
  let settled = 0
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerProtocol: "responses",
    noTools: "builtin",
    persistSession: true,
    holdResponses: true,
    extensionFactories: [
      (pi) => {
        pi.on("agent_settled", () => {
          settled++
          if (settled === 6) pi.sendUserMessage("Inspect the stopped goal.")
        })
      },
    ],
  })
  host.queueResponse(...response(text("")))
  host.queueResponse(...response(text("")))
  host.queueResponse(...response(call("get_goal", {}, "activity")))
  host.queueResponse(...response(text("")))
  host.queueResponse(...response(text("")))
  host.queueResponse(...response(text("")))
  host.queueResponse(...response(text("")))
  host.queueResponse(...response(call("get_goal", {}, "inspect")))
  host.queueResponse(...response(text("Inspection complete.")))
  await host.session.prompt("/goal create Inspect the goal between attempts")
  await t.waitFor(() => assert(settled >= 7))
  assert.equal(result(host, "inspect").goal.status, "blocked")
  assert.equal(host.requests.length, 9)
})

test("a terminal error blocks only after the native retry is exhausted", async (t) => {
  const outcomes: string[] = []
  let starts = 0
  let settled = 0
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerProtocol: "responses",
    noTools: "builtin",
    persistSession: true,
    holdResponses: true,
    settings: {
      retry: {
        enabled: true,
        maxRetries: 1,
        baseDelayMs: 1,
        maxAgentDelayMs: 1,
      },
    },
    extensionFactories: [
      (pi) => {
        pi.on("agent_start", () => {
          starts++
        })
        pi.on("agent_before_settle", (event) => {
          outcomes.push(event.outcome)
        })
        pi.on("agent_settled", () => {
          settled++
          if (settled === 1)
            pi.sendUserMessage("Inspect after the final error.")
        })
      },
    ],
  })
  host.queueResponse({ status: 503 })
  host.queueResponse({ status: 503 })
  host.queueResponse(...response(call("get_goal", {}, "inspect")))
  host.queueResponse(...response(text("Inspection complete.")))
  await host.session.prompt("/goal create Finish the requested work")
  await t.waitFor(() => assert(settled >= 2))
  assert.equal(result(host, "inspect").goal.status, "blocked")
  assert.deepEqual(outcomes, ["error", "completed"])
  assert.equal(starts, 3)
  assert.equal(host.requests.length, 4)
})

test("a structured quota stops the goal when it matches the terminal response", async (t) => {
  let settled = 0
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerProtocol: "responses",
    noTools: "builtin",
    persistSession: true,
    holdResponses: true,
    extensionFactories: [
      (pi) => {
        pi.on("agent_settled", () => {
          settled++
          if (settled === 1) pi.sendUserMessage("Inspect the provider limit.")
        })
      },
    ],
  })
  host.queueResponse(...failure("terminal-quota", "insufficient_quota"))
  host.queueResponse(...response(call("get_goal", {}, "inspect")))
  host.queueResponse(...response(text("Inspection complete.")))
  await host.session.prompt("/goal create Finish within the available usage")
  await t.waitFor(() => assert(settled >= 2))
  assert.equal(result(host, "inspect").goal.status, "usageLimited")
  assert.equal(host.requests.length, 3)
})

test("an objective edit clears the automatic marker before the current turn finishes", async (t) => {
  let settled = 0
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerProtocol: "responses",
    noTools: "builtin",
    persistSession: true,
    holdResponses: true,
    extensionFactories: [
      (pi) => {
        pi.on("agent_settled", () => {
          settled++
          if (settled === 6) pi.sendUserMessage("Inspect the edited goal.")
        })
      },
    ],
  })
  host.queueResponse(...response(text("")))
  host.queueResponse(...response(text("")))
  host.queueResponse({ pause: true }, ...response(text("")))
  host.queueResponse(...response(text("")))
  host.queueResponse(...response(text("")))
  host.queueResponse(...response(text("")))
  host.queueResponse(...response(call("get_goal", {}, "inspect")))
  host.queueResponse(...response(text("Inspection complete.")))
  await host.session.prompt("/goal create Finish the initial objective")
  await t.waitFor(() => assert.equal(host.requests.length, 3))
  await host.session.prompt("/goal edit Finish the edited objective")
  host.resumeResponse()
  await t.waitFor(() => assert(settled >= 7))
  assert.equal(result(host, "inspect").goal.status, "blocked")
  assert.equal(
    result(host, "inspect").goal.objective,
    "Finish the edited objective",
  )
  assert.equal(host.requests.length, 8)
})

test("a failed native edit stops automatic work until reopening with fresh guard counters", async (t) => {
  let settled = 0
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerProtocol: "responses",
    noTools: "builtin",
    persistSession: true,
    holdResponses: true,
    extensionFactories: [
      (pi) => {
        pi.on("agent_settled", () => {
          settled++
        })
      },
    ],
  })
  host.queueResponse(...chargedResponse(11, text("")))
  host.queueResponse(...chargedResponse(13, text("")))
  host.queueResponse({ pause: true }, ...chargedResponse(17, text("")))
  await host.session.prompt("/goal create Finish the saved objective")
  await t.waitFor(() => assert.equal(host.requests.length, 3))
  const manager = host.session.sessionManager
  const sessionFile = manager.getSessionFile()
  assert(sessionFile)
  renameSync(sessionFile, `${sessionFile}.saved`)
  mkdirSync(sessionFile)
  try {
    await host.session.prompt("/goal edit Finish the unsaved objective")
  } finally {
    rmSync(sessionFile, { recursive: true })
    renameSync(`${sessionFile}.saved`, sessionFile)
  }
  assert.match(await host.frame(), /Reopen the saved\s+session/)
  const entriesAfterFailure = manager
    .getEntries()
    .filter((entry) => entry.type === "custom")
  host.resumeResponse()
  await t.waitFor(() => assert.equal(settled, 3))
  await host.session.prompt("/goal resume")
  await host.session.prompt("/goal inspect")
  assert.match(await host.frame(), /Goal\s+storage is unavailable/)
  await new Promise<void>((resolve) => setImmediate(resolve))
  assert.equal(host.requests.length, 3)
  assert.deepEqual(
    manager.getEntries().filter((entry) => entry.type === "custom"),
    entriesAfterFailure,
  )
  await host.close()

  let recovered = 0
  const reopened = await openNativeHost(t, {
    directory: host.directory,
    sessionFile,
    extensionPaths: [extension],
    providerProtocol: "responses",
    noTools: "builtin",
    holdResponses: true,
    extensionFactories: [
      (pi) => {
        pi.on("agent_settled", () => {
          recovered++
          if (recovered === 3) pi.sendUserMessage("Inspect the recovered goal.")
        })
      },
    ],
  })
  assert.notEqual(reopened.session.sessionManager, manager)
  for (let i = 0; i < 3; i++) reopened.queueResponse(...response(text("")))
  reopened.queueResponse(...response(call("get_goal", {}, "inspect")))
  reopened.queueResponse(...response(text("Inspection complete.")))
  await t.waitFor(() => assert(recovered >= 4))
  const goal = result(reopened, "inspect").goal
  assert.equal(goal.status, "blocked")
  assert.equal(goal.objective, "Finish the saved objective")
  assert.equal(goal.tokensUsed, 24)
  assert.equal(reopened.requests.length, 5)
})

for (const scenario of [
  { name: "a missing final", items: [], resets: true },
  { name: "empty commentary", items: [text("", "commentary")], resets: true },
  {
    name: "an empty partial phase",
    items: [text("", "partial")],
    resets: true,
  },
  { name: "an empty unknown phase", items: [text("", "other")], resets: true },
  {
    name: "nonblank commentary",
    items: [text("Checked.", "commentary"), text("")],
    resets: true,
  },
  { name: "a byte order mark", items: [text("\ufeff")], resets: true },
  {
    name: "an empty final followed by commentary",
    items: [text(""), text("", "commentary")],
    resets: false,
  },
  {
    name: "raw reasoning without a summary",
    items: [
      {
        type: "reasoning",
        id: "raw",
        summary: [],
        content: [{ type: "reasoning_text", text: "Unsummarized reasoning." }],
      },
      text(""),
    ],
    resets: false,
  },
  {
    name: "a blank reasoning summary",
    items: [
      {
        type: "reasoning",
        id: "blank-summary",
        summary: [{ type: "summary_text", text: " \n" }],
      },
      text(""),
    ],
    resets: false,
  },
]) {
  test(`${scenario.name} keeps its completed-item classification`, async (t) => {
    let settled = 0
    const attempts = scenario.resets ? 6 : 3
    const host = await openNativeHost(t, {
      extensionPaths: [extension],
      providerProtocol: "responses",
      noTools: "builtin",
      persistSession: true,
      holdResponses: true,
      extensionFactories: [
        (pi) => {
          pi.on("agent_settled", () => {
            settled++
            if (settled === attempts)
              pi.sendUserMessage("Inspect the completed attempts.")
          })
        },
      ],
    })
    host.queueResponse(...response(text("")))
    host.queueResponse(...response(text("")))
    host.queueResponse(...response(...scenario.items))
    if (scenario.resets)
      for (let i = 0; i < 3; i++) host.queueResponse(...response(text("")))
    host.queueResponse(...response(call("get_goal", {}, "inspect")))
    host.queueResponse(...response(text("Inspection complete.")))
    await host.session.prompt("/goal create Finish with verified activity")
    await t.waitFor(() => assert(settled >= attempts + 1))
    assert.equal(result(host, "inspect").goal.status, "blocked")
    assert.equal(host.requests.length, attempts + 2)
  })
}

test("retry recovery preserves the admitted automatic turn", async (t) => {
  let settled = 0
  let starts = 0
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerProtocol: "responses",
    noTools: "builtin",
    persistSession: true,
    holdResponses: true,
    settings: {
      retry: {
        enabled: true,
        maxRetries: 1,
        baseDelayMs: 1,
        maxAgentDelayMs: 1,
      },
    },
    extensionFactories: [
      (pi) => {
        pi.on("agent_start", () => {
          starts++
        })
        pi.on("agent_settled", () => {
          settled++
          if (settled === 3) pi.sendUserMessage("Inspect after recovery.")
        })
      },
    ],
  })
  host.queueResponse(...response(text("")))
  host.queueResponse(...response(text("")))
  host.queueResponse({ status: 503 })
  host.queueResponse(...response(text("")))
  host.queueResponse(...response(call("get_goal", {}, "inspect")))
  host.queueResponse(...response(text("Inspection complete.")))
  await host.session.prompt("/goal create Finish the recoverable work")
  await t.waitFor(() => assert(settled >= 4))
  assert.equal(result(host, "inspect").goal.status, "blocked")
  assert.equal(starts, 5)
  assert.equal(host.requests.length, 6)
})

for (const delivery of ["context-only", "boundary"] as const) {
  test(`an empty hidden ${delivery} custom message counts when committed`, async (t) => {
    let settled = 0
    const host = await openNativeHost(t, {
      extensionPaths: [extension],
      providerProtocol: "responses",
      noTools: "builtin",
      persistSession: true,
      holdResponses: true,
      extensionFactories: [
        (pi) => {
          pi.on("agent_before_settle", () => {
            if (settled !== 2) return
            const message = {
              customType: "guard.note",
              content: "",
              display: false,
            }
            if (delivery === "context-only")
              pi.sendMessage(message, { triggerTurn: false })
            else return { entries: [{ type: "custom_message", ...message }] }
            return undefined
          })
          pi.on("agent_settled", () => {
            settled++
            if (settled === 6)
              pi.sendUserMessage("Inspect after delivered context.")
          })
        },
      ],
    })
    for (let i = 0; i < 6; i++) host.queueResponse(...response(text("")))
    host.queueResponse(...response(call("get_goal", {}, "inspect")))
    host.queueResponse(...response(text("Inspection complete.")))
    await host.session.prompt("/goal create Finish the current work")
    await t.waitFor(() => assert(settled >= 7))
    assert.equal(result(host, "inspect").goal.status, "blocked")
    assert.equal(host.requests.length, 8)
  })
}

test("an abort after an empty final suppresses the empty stop", async (t) => {
  let settled = 0
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerProtocol: "responses",
    noTools: "builtin",
    persistSession: true,
    holdResponses: true,
    extensionFactories: [
      (pi) => {
        pi.on("agent_before_settle", (_event, ctx) => {
          if (settled >= 2) ctx.abort()
        })
        pi.on("agent_settled", () => {
          settled++
          if (settled === 3) pi.sendUserMessage("Inspect after interruption.")
        })
      },
    ],
  })
  for (let i = 0; i < 3; i++) host.queueResponse(...response(text("")))
  host.queueResponse(...response(call("get_goal", {}, "inspect")))
  host.queueResponse(...response(text("Inspection complete.")))
  await host.session.prompt("/goal create Finish without ignoring interruption")
  await t.waitFor(() => assert(settled >= 4))
  assert.equal(result(host, "inspect").goal.status, "active")
  assert.equal(host.requests.length, 5)
})

for (const mismatch of [
  "responseId",
  "provider",
  "api",
  "model",
  "missing-id",
] as const) {
  test(`a quota ${mismatch} mismatch leaves the terminal error classified as blocked`, async (t) => {
    let settled = 0
    const host = await openNativeHost(t, {
      extensionPaths: [extension],
      providerProtocol: "responses",
      noTools: "builtin",
      persistSession: true,
      holdResponses: true,
      extensionFactories: [
        (pi) => {
          pi.on("message_end", (event) => {
            const message = event.message
            if (
              message.role === "assistant" &&
              message.stopReason === "error" &&
              mismatch !== "missing-id"
            )
              return {
                message: {
                  ...message,
                  [mismatch]: `${message[mismatch]}-changed`,
                },
              }
            return undefined
          })
          pi.on("agent_settled", () => {
            settled++
            if (settled === 1)
              pi.sendUserMessage("Inspect the terminal classification.")
          })
        },
      ],
    })
    host.queueResponse(
      ...failure(
        mismatch === "missing-id" ? undefined : "outer-quota",
        "insufficient_quota",
      ),
    )
    host.queueResponse(...response(call("get_goal", {}, "inspect")))
    host.queueResponse(...response(text("Inspection complete.")))
    await host.session.prompt("/goal create Finish with an attributed result")
    await t.waitFor(() => assert(settled >= 2))
    assert.equal(result(host, "inspect").goal.status, "blocked")
    assert.equal(host.requests.length, 3)
  })
}

for (const action of ["pause", "clear", "replace"] as const) {
  test(`a terminal quota respects the current accounting binding after ${action}`, async (t) => {
    let settled = 0
    const host = await openNativeHost(t, {
      extensionPaths: [extension],
      providerProtocol: "responses",
      noTools: "builtin",
      persistSession: true,
      holdResponses: true,
      extensionFactories: [
        (pi) => {
          pi.on("agent_settled", () => {
            settled++
            if (settled === 1) pi.sendUserMessage("Inspect the selected goal.")
          })
        },
      ],
    })
    host.queueResponse(
      { pause: true },
      ...failure("current-quota", "insufficient_quota"),
    )
    host.queueResponse(...response(call("get_goal", {}, "inspect")))
    host.queueResponse(...response(text("Inspection complete.")))
    await host.session.prompt("/goal create Finish the earlier objective")
    await t.waitFor(() => assert.equal(host.requests.length, 1))
    await host.session.prompt(
      `/goal ${action === "replace" ? "clear" : action}`,
    )
    if (action === "replace")
      await host.session.prompt("/goal create Finish the replacement objective")
    host.resumeResponse()
    await t.waitFor(() => assert(settled >= 2))
    const goal = result(host, "inspect").goal
    if (action === "clear") assert.equal(goal, null)
    else {
      assert.equal(goal.status, action === "pause" ? "paused" : "usageLimited")
      assert.equal(
        goal.objective,
        action === "pause"
          ? "Finish the earlier objective"
          : "Finish the replacement objective",
      )
    }
  })
}

for (const quota of [false, true]) {
  test(`an in-flight budget limit ${quota ? "yields to a matched usage limit" : "takes precedence over a terminal block"}`, async (t) => {
    let settled = 0
    const host = await openNativeHost(t, {
      extensionPaths: [extension],
      providerProtocol: "responses",
      noTools: "builtin",
      persistSession: true,
      holdResponses: true,
      extensionFactories: [
        (pi) => {
          pi.on("agent_settled", () => {
            settled++
            if (settled === 1)
              pi.sendUserMessage("Inspect the effective limit.")
          })
        },
      ],
    })
    host.queueResponse(
      ...response(
        call(
          "create_goal",
          {
            objective: "Finish within the explicit allowance",
            token_budget: 50,
          },
          "create",
        ),
      ),
    )
    host.queueResponse(
      ...chargedResponse(80, call("get_goal", {}, "checkpoint")),
    )
    host.queueResponse(
      ...failure(
        "limited-response",
        quota ? "insufficient_quota" : "server_error",
      ),
    )
    host.queueResponse(...response(call("get_goal", {}, "inspect")))
    host.queueResponse(...response(text("Inspection complete.")))
    await host.session.prompt(
      "Create the requested goal with a budget of 50 tokens.",
    )
    await t.waitFor(() => assert(settled >= 2))
    const observed = result(host, "inspect")
    assert.equal(observed.goal.status, quota ? "usageLimited" : "budgetLimited")
    assert.equal(observed.goal.tokensUsed, 80)
    assert.equal(observed.remainingTokens, 0)
    assert.equal(host.requests.length, 5)
  })
}

for (const outcome of [
  "invalid",
  "unsuccessful",
  "handler-failure",
  "blocked",
] as const) {
  test(`a delivered ${outcome} tool outcome resets the empty sequence`, async (t) => {
    let settled = 0
    const host = await openNativeHost(t, {
      extensionPaths: [extension],
      providerProtocol: "responses",
      noTools: "builtin",
      persistSession: true,
      holdResponses: true,
      extensionFactories: [
        (pi) => {
          pi.registerTool({
            name: "work",
            label: "Work",
            description: "Exercise a controlled tool outcome",
            parameters: {
              type: "object",
              properties: {},
              required: [],
              additionalProperties: false,
            },
            execute: async () => {
              if (outcome === "handler-failure")
                throw new Error("Controlled handler failure")
              return {
                content: [{ type: "text", text: "The work returned." }],
                details: undefined,
              }
            },
          })
          pi.on("tool_call", (event) => {
            if (event.toolName === "work" && outcome === "blocked")
              return { block: true, reason: "Controlled tool block" }
            return undefined
          })
          pi.on("tool_result", (event) => {
            if (event.toolName === "work" && outcome === "unsuccessful")
              return { isError: true }
            return undefined
          })
          pi.on("agent_settled", () => {
            settled++
            if (settled === 6)
              pi.sendUserMessage("Inspect after the tool outcome.")
          })
        },
      ],
    })
    host.queueResponse(...response(text("")))
    host.queueResponse(...response(text("")))
    host.queueResponse(
      ...response(
        call("work", outcome === "invalid" ? { unexpected: true } : {}, "work"),
      ),
    )
    for (let i = 0; i < 4; i++) host.queueResponse(...response(text("")))
    host.queueResponse(...response(call("get_goal", {}, "inspect")))
    host.queueResponse(...response(text("Inspection complete.")))
    await host.session.prompt(
      "/goal create Finish after verifying the tool result",
    )
    await t.waitFor(() => assert(settled >= 7))
    assert.equal(result(host, "inspect").goal.status, "blocked")
    assert.equal(host.requests.length, 9)
  })
}

test("a delivered user follow-up resets the automatic empty sequence", async (t) => {
  let settled = 0
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerProtocol: "responses",
    noTools: "builtin",
    persistSession: true,
    holdResponses: true,
    extensionFactories: [
      (pi) => {
        pi.on("agent_settled", () => {
          settled++
          if (settled === 6)
            pi.sendUserMessage("Inspect after the delivered follow-up.")
        })
      },
    ],
  })
  host.queueResponse(...response(text("")))
  host.queueResponse(...response(text("")))
  host.queueResponse({ pause: true }, ...response(text("")))
  for (let i = 0; i < 4; i++) host.queueResponse(...response(text("")))
  host.queueResponse(...response(call("get_goal", {}, "inspect")))
  host.queueResponse(...response(text("Inspection complete.")))
  await host.session.prompt("/goal create Finish the original scope")
  await t.waitFor(() => assert.equal(host.requests.length, 3))
  await host.session.sendUserMessage("Keep the original scope.", {
    deliverAs: "followUp",
  })
  host.resumeResponse()
  await t.waitFor(() => assert(settled >= 7))
  assert.equal(result(host, "inspect").goal.status, "blocked")
  assert.equal(host.requests.length, 9)
})

test("a before-settle continuation stays inside one outer run", async (t) => {
  let settled = 0
  let continued = false
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerProtocol: "responses",
    noTools: "builtin",
    persistSession: true,
    holdResponses: true,
    extensionFactories: [
      (pi) => {
        pi.on("agent_before_settle", () => {
          if (settled === 2 && !continued) {
            continued = true
            return {
              entries: [
                {
                  type: "custom_message",
                  customType: "guard.note",
                  content: "Continue this turn.",
                  display: false,
                },
              ],
              continue: true,
            }
          }
          return undefined
        })
        pi.on("agent_settled", () => {
          settled++
          if (settled === 6)
            pi.sendUserMessage("Inspect after the continued boundary.")
        })
      },
    ],
  })
  for (let i = 0; i < 3; i++) host.queueResponse(...response(text("")))
  host.queueResponse(...response(text("", "commentary")))
  for (let i = 0; i < 3; i++) host.queueResponse(...response(text("")))
  host.queueResponse(...response(call("get_goal", {}, "inspect")))
  host.queueResponse(...response(text("Inspection complete.")))
  await host.session.prompt("/goal create Finish across settlement boundaries")
  await t.waitFor(() => assert(settled >= 7))
  assert.equal(result(host, "inspect").goal.status, "blocked")
  assert.equal(host.requests.length, 9)
})

test("standalone compaction resets the preceding empty sequence", async (t) => {
  let settled = 0
  let compacting: Promise<unknown> | undefined
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerProtocol: "responses",
    noTools: "builtin",
    persistSession: true,
    holdResponses: true,
    settings: { compaction: { enabled: false, keepRecentTokens: 1 } },
    extensionFactories: [
      (pi) => {
        pi.on("session_before_compact", (event) => ({
          compaction: {
            summary: "The completed attempts had no visible answer.",
            firstKeptEntryId: event.preparation.firstKeptEntryId,
            tokensBefore: event.preparation.tokensBefore,
          },
        }))
        pi.on("agent_settled", () => {
          settled++
          if (settled === 2) compacting = host.session.compact()
          if (settled === 5)
            pi.sendUserMessage("Inspect after the compacted sequence.")
        })
      },
    ],
  })
  for (let i = 0; i < 5; i++) host.queueResponse(...response(text("")))
  host.queueResponse(...response(call("get_goal", {}, "inspect")))
  host.queueResponse(...response(text("Inspection complete.")))
  await host.session.prompt("/goal create Finish through compaction")
  await t.waitFor(() => assert(settled >= 6))
  await compacting
  assert.equal(result(host, "inspect").goal.status, "blocked")
  assert.equal(host.requests.length, 7)
})
