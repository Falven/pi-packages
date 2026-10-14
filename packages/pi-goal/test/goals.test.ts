/* eslint-disable no-await-in-loop -- Each native session operation must settle before the next case. */
import assert from "node:assert/strict"
import test from "node:test"
import { DatabaseSync } from "node:sqlite"
import { join } from "node:path"
import { createCodemodeExtension } from "@earendil-works/pi-coding-agent"
import piGoal from "../src/index.ts"
import { openNativeHost } from "../../../fixtures/native-host.ts"

const extension = new URL("../src/index.ts", import.meta.url).pathname

function response(name: string, args = "{}", id = "goal-call") {
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
                id,
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

function lastResult(host: Awaited<ReturnType<typeof openNativeHost>>) {
  const result = host.session.messages.findLast(
    (message) => message.role === "toolResult",
  )
  assert(result?.role === "toolResult")
  const content = result.content[0]
  assert(content?.type === "text")
  return { text: content.text, isError: result.isError }
}

test("a persisted session without a goal returns explicit empty state", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [new URL("../", import.meta.url).pathname],
    noTools: "builtin",
    persistSession: true,
  })
  host.queueResponse(response("get_goal"), finish, done, end)
  await host.session.prompt("Inspect the current goal")
  assert.equal(host.requests.length, 2, JSON.stringify(host.session.messages))
  const result = host.session.messages.find(
    (message) => message.role === "toolResult",
  )
  assert(result?.role === "toolResult")
  assert.equal(result.isError, false, JSON.stringify(result.content))
  assert.deepEqual(result.content, [
    {
      type: "text",
      text: '{"goal":null,"remainingTokens":null,"completionBudgetReport":null}',
    },
  ])
  assert.doesNotMatch(await host.frame(), /Goal: active/)
})

test("explicit creation and pause persist the trimmed objective across reopening", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    noTools: "builtin",
    persistSession: true,
  })
  const before = Math.floor(Date.now() / 1000)
  host.queueResponse(
    response(
      "create_goal",
      '{"objective":"  Finish the work  ","token_budget":1000}',
    ),
    finish,
    done,
    end,
  )
  await host.session.prompt(
    "Create a goal to finish the work with a budget of 1000 tokens",
  )
  const result = host.session.messages.find(
    (message) => message.role === "toolResult",
  )
  assert(result?.role === "toolResult")
  assert.equal(result.isError, false, JSON.stringify(result.content))
  const text = result.content[0]
  assert(text?.type === "text")
  const stored = JSON.parse(text.text)
  assert.deepEqual(stored, {
    goal: {
      threadId: host.session.sessionManager.getSessionId(),
      objective: "Finish the work",
      status: "active",
      tokenBudget: 1000,
      tokensUsed: 0,
      timeUsedSeconds: 0,
      createdAt: stored.goal.createdAt,
      updatedAt: stored.goal.createdAt,
    },
    remainingTokens: 1000,
    completionBudgetReport: null,
  })
  assert(stored.goal.createdAt >= before)
  assert(stored.goal.createdAt <= Math.floor(Date.now() / 1000))
  await host.session.prompt("/goal pause")
  assert.match(await host.frame(), /Goal: paused/)
  const sessionFile = host.session.sessionManager.getSessionFile()
  assert(sessionFile)
  await host.close()

  const reopened = await openNativeHost(t, {
    directory: host.directory,
    sessionFile,
    extensionPaths: [extension],
    noTools: "builtin",
  })
  assert.match(await reopened.frame(), /Goal: paused/)
  reopened.queueResponse(
    response("get_goal", "{}", "reopened-goal"),
    finish,
    done,
    end,
  )
  await reopened.session.prompt("Inspect the saved goal")
  const saved = reopened.session.messages.findLast(
    (message) => message.role === "toolResult",
  )
  assert(saved?.role === "toolResult")
  const savedText = saved.content[0]
  assert(savedText?.type === "text")
  const restored = JSON.parse(savedText.text)
  assert.deepEqual(restored, {
    ...stored,
    goal: {
      ...stored.goal,
      status: "paused",
      updatedAt: restored.goal.updatedAt,
    },
  })
  assert(restored.goal.updatedAt >= stored.goal.updatedAt)
})

test("the full integer budget survives direct and native programmatic calls without rounding", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    extensionFactories: [createCodemodeExtension({ models: false })],
    tools: ["codemode", "create_goal", "get_goal"],
    persistSession: true,
  })
  const raw =
    '{"objective":"Preserve the whole budget","token_budget":"9223372036854775807"}'
  host.queueResponse(response("create_goal", raw), finish, done, end)
  await host.session.prompt("Create the explicitly budgeted goal")
  const result = host.session.messages.find(
    (message) => message.role === "toolResult",
  )
  assert(result?.role === "toolResult")
  assert.equal(result.isError, false, JSON.stringify(result.content))
  const content = result.content[0]
  assert(content?.type === "text")
  assert.match(content.text, /"tokenBudget":"9223372036854775807"/)
  assert.match(content.text, /"remainingTokens":"9223372036854775807"/)
  assert(JSON.stringify(host.requests[1]).includes(JSON.stringify(raw)))
  host.queueResponse(
    response(
      "codemode",
      JSON.stringify({
        code: "const value = await tools.get_goal({}); text({type:typeof value.goal.tokenBudget, value});",
      }),
      "native-budget",
    ),
    finish,
    done,
    end,
  )
  await host.session.prompt(
    "Inspect the saved budget through the programmatic interface",
  )
  const nested = host.session.messages.findLast(
    (message) => message.role === "toolResult",
  )
  assert(nested?.role === "toolResult")
  const output = nested.content.at(-1)
  assert(output?.type === "text")
  const value = JSON.parse(output.text)
  assert.equal(value.type, "string")
  assert.equal(value.value.goal.tokenBudget, "9223372036854775807")
  assert.equal(value.value.remainingTokens, "9223372036854775807")
  host.queueResponse(
    response("get_goal", "{}", "exact-budget"),
    finish,
    done,
    end,
  )
  await host.session.prompt("Read the exact persisted budget")
  assert.equal(lastResult(host).text, content.text)
})

test("native goal presentation strips terminal controls without changing the objective", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    noTools: "builtin",
    persistSession: true,
  })
  const objective = "Review \u001b]52;c;Z29hbA==\u0007the work"
  host.queueResponse(
    response("create_goal", JSON.stringify({ objective })),
    finish,
    done,
    end,
  )
  await host.session.prompt("Create the explicitly requested goal")
  assert.equal(JSON.parse(lastResult(host).text).goal.objective, objective)
  await host.session.prompt("/goal pause")
  await host.frame()
  assert.equal(host.terminal.output.includes("\u001b]52"), false)
  await host.session.prompt("/goal inspect")
  await host.frame()
  assert.equal(host.terminal.output.includes("\u001b]52"), false)
  assert.match(host.terminal.output, /paused: Review the work/)
})

test("objectives reject unpaired surrogates before persistence can change their value", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    noTools: "builtin",
    persistSession: true,
  })
  host.queueResponse(
    response("create_goal", JSON.stringify({ objective: "a\ud800b" })),
    finish,
    done,
    end,
  )
  await host.session.prompt("Create the explicitly requested goal")
  assert.equal(lastResult(host).isError, true)
  assert.match(
    lastResult(host).text,
    /goal objective must contain only Unicode scalar values/,
  )
  host.queueResponse(
    response("get_goal", "{}", "after-invalid-objective"),
    finish,
    done,
    end,
  )
  await host.session.prompt("Inspect the rejected goal")
  assert.equal(JSON.parse(lastResult(host).text).goal, null)
})

test("objectives retain Unicode content and enforce the scalar limit", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    noTools: "builtin",
    persistSession: true,
  })
  const examples = [
    {
      name: "Unicode whitespace",
      objective: "\u0085\u2003 Finish 🌱 \u0085",
      expected: "Finish 🌱",
    },
    {
      name: "retained format character",
      objective: "\ufeffWork\ufeff",
      expected: "\ufeffWork\ufeff",
    },
    { name: "embedded null", objective: "a\0b", expected: "a\0b" },
    {
      name: "four thousand scalars",
      objective: "🌱".repeat(4000),
      expected: "🌱".repeat(4000),
    },
    {
      name: "empty after trimming",
      objective: "\u0085\u2003",
      error: /must not be empty/,
    },
    {
      name: "too many scalars",
      objective: "🌱".repeat(4001),
      error: /at most 4000/,
    },
  ]
  for (const example of examples) {
    await t.test(example.name, async () => {
      await host.runtime.newSession()
      host.queueResponse(
        response(
          "create_goal",
          JSON.stringify({ objective: example.objective }),
        ),
        finish,
        done,
        end,
      )
      await host.session.prompt("Create the explicitly requested goal")
      const result = lastResult(host)
      if (example.error) {
        assert.equal(result.isError, true)
        assert.match(result.text, example.error)
      } else {
        assert.equal(result.isError, false, result.text)
        assert.equal(JSON.parse(result.text).goal.objective, example.expected)
      }
      host.queueResponse(
        response("get_goal", "{}", "inspect-objective"),
        finish,
        done,
        end,
      )
      await host.session.prompt("Inspect the saved goal")
      assert.equal(
        JSON.parse(lastResult(host).text).goal?.objective,
        example.expected,
      )
    })
  }
})

test("Pi validates goal inputs and applies its native coercion", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    noTools: "builtin",
    persistSession: true,
  })
  for (const [name, args] of [
    ["get_goal", '{"extra":true}'],
    ["create_goal", '{"objective":"Work","extra":true}'],
  ]) {
    assert(name && args)
    host.queueResponse(response(name, args, name), finish, done, end)
    await host.session.prompt("Inspect or create the explicitly requested goal")
    assert.equal(lastResult(host).isError, true)
    assert(
      lastResult(host).text.startsWith(`Validation failed for tool "${name}":`),
    )
  }
  host.queueResponse(
    response("create_goal", '{"objective":42}', "native-coercion"),
    finish,
    done,
    end,
  )
  await host.session.prompt("Create the explicitly requested goal")
  assert.equal(lastResult(host).isError, false, lastResult(host).text)
  assert.equal(JSON.parse(lastResult(host).text).goal.objective, "42")
})

test("native validation and domain rules preserve the full budget range", async (t) => {
  const permitted: unknown[] = []
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    noTools: "builtin",
    persistSession: true,
    extension: (pi) => {
      pi.on("tool_call", (event) => {
        if (event.toolName === "create_goal") permitted.push(event.input)
      })
    },
  })
  const examples = [
    { name: "minimum number", budget: "1", expected: 1 },
    {
      name: "safe numeric limit",
      budget: "9007199254740991",
      expected: 9007199254740991,
    },
    { name: "safe decimal string", budget: '"42"', expected: 42 },
    {
      name: "first larger integer",
      budget: '"9007199254740992"',
      expected: "9007199254740992",
    },
    {
      name: "full allowance",
      budget: '"9223372036854775807"',
      expected: "9223372036854775807",
    },
    { name: "optional null", budget: "null", expected: null },
    { name: "native boolean coercion", budget: "true", expected: 1 },
    { name: "unsafe number", budget: "9007199254740992", nativeError: true },
    {
      name: "rounded unsafe number",
      budget: "9007199254740993",
      nativeError: true,
    },
    {
      name: "unsafe full allowance",
      budget: "9223372036854775807",
      nativeError: true,
    },
    { name: "zero", budget: "0", nativeError: true },
    { name: "negative", budget: "-1", nativeError: true },
    { name: "fraction", budget: "1.5", nativeError: true },
    { name: "fractional string", budget: '"1.5"', nativeError: true },
    { name: "nondecimal string", budget: '"1e3"', nativeError: true },
    { name: "zero string", budget: '"0"', nativeError: true },
    {
      name: "oversized string",
      budget: '"10000000000000000000"',
      nativeError: true,
    },
    {
      name: "outside signed range",
      budget: '"9223372036854775808"',
      domainError: true,
    },
  ]
  for (const example of examples) {
    await t.test(example.name, async () => {
      await host.runtime.newSession()
      const before = permitted.length
      host.queueResponse(
        response(
          "create_goal",
          `{"objective":"Budgeted work","token_budget":${example.budget}}`,
        ),
        finish,
        done,
        end,
      )
      await host.session.prompt("Create the explicitly budgeted goal")
      const result = lastResult(host)
      if (example.nativeError || example.domainError) {
        assert.equal(result.isError, true)
        assert.match(
          result.text,
          example.nativeError
            ? /^Validation failed for tool "create_goal":/
            : /goal budgets must be between 1 and 9223372036854775807/,
        )
        assert.equal(permitted.length, before + (example.domainError ? 1 : 0))
        host.queueResponse(
          response("get_goal", "{}", "after-invalid-budget"),
          finish,
          done,
          end,
        )
        await host.session.prompt("Inspect the rejected goal")
        assert.equal(JSON.parse(lastResult(host).text).goal, null)
      } else {
        assert.equal(result.isError, false, result.text)
        const actual = JSON.parse(result.text)
        if (example.expected === null) {
          assert.equal("tokenBudget" in actual.goal, false)
        } else {
          assert.equal(actual.goal.tokenBudget, example.expected)
        }
        assert.equal(actual.remainingTokens, example.expected)
      }
    })
  }
})

test("ordinary tasks leave no goal and an unfinished goal cannot be replaced", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    noTools: "builtin",
    persistSession: true,
  })
  await host.session.prompt("Explain how a queue works")
  host.queueResponse(
    response("get_goal", "{}", "empty-read"),
    finish,
    done,
    end,
  )
  await host.session.prompt("Inspect the current goal")
  assert.deepEqual(lastResult(host), {
    isError: false,
    text: '{"goal":null,"remainingTokens":null,"completionBudgetReport":null}',
  })

  host.queueResponse(
    response("create_goal", '{"objective":"Original work"}', "first"),
    finish,
    done,
    end,
  )
  await host.session.prompt("Create a goal to finish the original work")
  const original = JSON.parse(lastResult(host).text)
  assert.equal("tokenBudget" in original.goal, false)
  host.queueResponse(
    response("create_goal", '{"objective":"Replacement work"}', "second"),
    finish,
    done,
    end,
  )
  await host.session.prompt("Create another goal")
  assert.deepEqual(lastResult(host), {
    isError: true,
    text: "cannot create a new goal because this thread has an unfinished goal; complete the existing goal first",
  })
  host.queueResponse(response("get_goal", "{}", "retained"), finish, done, end)
  await host.session.prompt("Read the saved goal")
  assert.deepEqual(JSON.parse(lastResult(host).text), original)
  assert.equal(
    host.session.messages.filter((message) => message.role === "user").length,
    5,
  )
})

test("ephemeral sessions cannot create a goal or report successful missing state", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    noTools: "builtin",
  })
  for (const [name, raw] of [
    ["get_goal", "{}"],
    ["create_goal", '{"objective":"Requested work"}'],
  ]) {
    assert(name && raw)
    host.queueResponse(response(name, raw, name), finish, done, end)
    await host.session.prompt("Inspect or create the explicitly requested goal")
    assert.deepEqual(lastResult(host), {
      isError: true,
      text: "Goal tools require a persistent thread.",
    })
  }
})

test("storage failures remain failures and a failed creation is not remembered as success", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    noTools: "builtin",
    persistSession: true,
  })
  const lock = new DatabaseSync(join(host.directory, "pi-goal.sqlite"))
  t.after(() => lock.close())
  lock.exec("BEGIN EXCLUSIVE")
  host.queueResponse(
    response("get_goal", "{}", "locked-read"),
    finish,
    done,
    end,
  )
  await host.session.prompt("Inspect the current goal")
  assert.equal(lastResult(host).isError, true)
  assert.match(lastResult(host).text, /^failed to read goal: .*locked/)
  host.queueResponse(
    response("create_goal", '{"objective":"Pending work"}', "locked-create"),
    finish,
    done,
    end,
  )
  await host.session.prompt("Create a goal for the pending work")
  assert.equal(lastResult(host).isError, true)
  assert.match(lastResult(host).text, /^failed to create goal: .*locked/)
  assert.doesNotMatch(await host.frame(), /Goal: active/)
  lock.exec("ROLLBACK")
  host.queueResponse(
    response("get_goal", "{}", "recovered-read"),
    finish,
    done,
    end,
  )
  await host.session.prompt("Inspect the recovered storage")
  assert.deepEqual(lastResult(host), {
    isError: false,
    text: '{"goal":null,"remainingTokens":null,"completionBudgetReport":null}',
  })
})

test("native programmatic calls return JSON values, serialize mutations, and reject ordinary errors", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    extensionFactories: [createCodemodeExtension({ models: false })],
    tools: ["codemode", "create_goal", "get_goal"],
    persistSession: true,
  })
  const code = `
    const invalid = await Promise.allSettled([
      tools.create_goal({objective:"Unsafe allowance", token_budget:9007199254740993})
    ]);
    const empty = await tools.get_goal({});
    const created = await tools.create_goal({ objective: "Nested work", token_budget:"9223372036854775807" });
    const failures = await Promise.allSettled([
      tools.create_goal({ objective: "Unfinished replacement" }),
      tools.create_goal({ objective: " " })
    ]);
    const inspected = await tools.get_goal({});
    text({ empty, created, inspected, invalid: invalid.map(value => ({
      status:value.status,
      ...(value.status === "rejected" ? {type:typeof value.reason, message:value.reason.message} : {})
    })), failures: failures.map(value => ({
      status: value.status,
      ...(value.status === "rejected" ? {
        type: typeof value.reason,
        text: String(value.reason),
        message: value.reason.message
      } : {})
    })) });
  `
  host.queueResponse(
    response("codemode", JSON.stringify({ code })),
    finish,
    done,
    end,
  )
  await host.session.prompt(
    "Create and inspect the explicitly requested goal through the programmatic interface",
  )
  assert.equal(lastResult(host).isError, false, lastResult(host).text)
  const resultMessage = host.session.messages.findLast(
    (message) => message.role === "toolResult",
  )
  assert(resultMessage?.role === "toolResult")
  const output = resultMessage.content.at(-1)
  assert(output?.type === "text")
  const result = JSON.parse(output.text)
  assert.deepEqual(result.empty, {
    goal: null,
    remainingTokens: null,
    completionBudgetReport: null,
  })
  assert.equal(result.created.goal.objective, "Nested work")
  assert.equal(result.created.goal.tokenBudget, "9223372036854775807")
  assert.equal(result.created.remainingTokens, "9223372036854775807")
  assert.equal(result.invalid[0].status, "rejected")
  assert.equal(result.invalid[0].type, "object")
  assert.match(
    result.invalid[0].message,
    /^Validation failed for tool "create_goal":/,
  )
  assert.deepEqual(result.inspected, result.created)
  assert.deepEqual(result.failures, [
    {
      status: "rejected",
      type: "object",
      text: "Error: cannot create a new goal because this thread has an unfinished goal; complete the existing goal first",
      message:
        "cannot create a new goal because this thread has an unfinished goal; complete the existing goal first",
    },
    {
      status: "rejected",
      type: "object",
      text: "Error: goal objective must not be empty",
      message: "goal objective must not be empty",
    },
  ])
  assert.equal("success" in result.created, false)
  assert(JSON.stringify(host.requests[1]).includes("Nested work"))
})

test("a winning tool override remains effective and reports the goal-name collision", async (t) => {
  const host = await openNativeHost(t, {
    persistSession: true,
    noTools: "builtin",
    expectedExtensionErrors: [
      {
        path: "<inline:2>",
        error: 'Tool "get_goal" conflicts with <inline:1>',
      },
    ],
    extensionFactories: [
      (pi) => {
        pi.registerTool({
          name: "get_goal",
          label: "Existing inspection",
          description: "Existing inspection tool",
          parameters: { type: "object", properties: {} },
          execute: async () => ({
            content: [{ type: "text", text: "Existing tool result" }],
            details: undefined,
          }),
        })
      },
      piGoal,
    ],
  })
  assert.match(await host.frame(), /Goal tool name collision: get_goal/)
  host.queueResponse(
    response("get_goal", '{"extra":1,"extra":2}', "foreign-read"),
    finish,
    done,
    end,
  )
  await host.session.prompt("Call the effective inspection tool")
  assert.deepEqual(lastResult(host), {
    isError: false,
    text: "Existing tool result",
  })
  assert.doesNotMatch(JSON.stringify(host.requests[1]), /extra\\":1/)
  host.queueResponse(
    response("create_goal", '{"objective":"Paused setup"}', "blocked-create"),
    finish,
    done,
    end,
  )
  await host.session.prompt("Create the explicitly requested goal")
  assert.deepEqual(lastResult(host), {
    isError: true,
    text: "Goal tool name collision: get_goal. Remove the duplicate goal extension.",
  })
})

test("permission handlers receive lossless inputs and can edit or block goal creation", async (t) => {
  let mode = "edit"
  const seen: unknown[] = []
  const host = await openNativeHost(t, {
    persistSession: true,
    noTools: "builtin",
    extensionPaths: [extension],
    extension: (pi) => {
      pi.on("tool_call", (event) => {
        if (event.toolName !== "create_goal") return
        seen.push({ ...event.input })
        if (mode === "deny")
          return {
            block: true,
            reason: "Creation denied by the permission handler",
          }
        event.input["objective"] = "Reviewed work"
        if (mode === "cap") event.input["token_budget"] = 100
        if (mode === "unsafe") event.input["token_budget"] = 9007199254740992
        return undefined
      })
    },
  })
  for (mode of ["edit", "cap", "unsafe", "deny"]) {
    await host.runtime.newSession()
    host.queueResponse(
      response(
        "create_goal",
        '{"objective":"Original work","token_budget":"9223372036854775807"}',
        mode,
      ),
      finish,
      done,
      end,
    )
    await host.session.prompt("Create the explicitly budgeted goal")
    const result = lastResult(host)
    if (mode === "deny" || mode === "unsafe") {
      assert.equal(result.isError, true)
      assert.match(
        result.text,
        mode === "deny"
          ? /Creation denied by the permission handler/
          : /use an exact decimal string/,
      )
    } else {
      assert.equal(result.isError, false, result.text)
      assert.equal(JSON.parse(result.text).goal.objective, "Reviewed work")
      assert.match(
        result.text,
        mode === "edit"
          ? /"tokenBudget":"9223372036854775807"/
          : /"tokenBudget":100/,
      )
    }
  }
  assert.deepEqual(
    seen,
    Array.from({ length: 4 }, () => ({
      objective: "Original work",
      token_budget: "9223372036854775807",
    })),
  )
  host.queueResponse(
    response("get_goal", "{}", "after-denial"),
    finish,
    done,
    end,
  )
  await host.session.prompt("Inspect the denied goal")
  assert.equal(JSON.parse(lastResult(host).text).goal, null)
})
