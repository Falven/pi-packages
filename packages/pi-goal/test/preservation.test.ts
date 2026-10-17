import assert from "node:assert/strict";
import test from "node:test";
import { setImmediate as nextImmediate } from "node:timers/promises";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { openNativeHost } from "../../../fixtures/native-host.ts";
import { toolResponse } from "./tool-response.ts";

const extension = new URL("../src/index.ts", import.meta.url).pathname;
type Host = Awaited<ReturnType<typeof openNativeHost>>;

const reported = {
  prompt_tokens: 100,
  completion_tokens: 12,
  total_tokens: 112,
  prompt_tokens_details: { cached_tokens: 20 },
};
const noUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

function response(name: string, args: unknown, id: string, usage: unknown = noUsage) {
  return toolResponse(name, args, id, usage);
}

function answer(text = "The requested boundary is reached.", usage: unknown = noUsage) {
  return [
    {
      event: {
        choices: [
          {
            index: 0,
            delta: { role: "assistant", content: text },
            finish_reason: "stop",
          },
        ],
        usage,
      },
    },
    { event: "[DONE]" },
    { end: true } as const,
  ];
}

function result(host: Host, id: string) {
  const message = host.session.messages.findLast(
    (item) => item.role === "toolResult" && item.toolCallId === id,
  );
  assert(message?.role === "toolResult");
  assert.equal(message.isError, false, JSON.stringify(message.content));
  const content = message.content[0];
  assert(content?.type === "text");
  return JSON.parse(content.text);
}

function generation(host: Host) {
  const entry = host.session.sessionManager
    .getEntries()
    .findLast(
      (item) =>
        item.type === "custom" &&
        item.customType === "pi-goal.state" &&
        (item.data as { threadId?: unknown }).threadId ===
          host.session.sessionManager.getSessionId(),
    );
  assert(entry?.type === "custom");
  const value = (entry.data as { generation?: unknown }).generation;
  assert(typeof value === "string");
  return value;
}

test("shutdown flushes live pursuit without pausing and restoration excludes downtime", async (t) => {
  let now = 1_000_000_000n;
  t.mock.method(process.hrtime, "bigint", () => now);
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    noTools: "builtin",
    persistSession: true,
    headless: true,
    holdResponses: true,
  });
  host.queueResponse(
    ...response(
      "create_goal",
      { objective: "Preserve reported pursuit", token_budget: 1000 },
      "create",
      reported,
    ),
  );
  host.queueResponse(...response("get_goal", {}, "read", reported));
  const run = host.session.prompt("Create the explicitly requested goal.");
  await t.waitFor(() => assert.equal(host.requests.length, 3));
  assert.equal(result(host, "read").goal.tokensUsed, 0);
  const sessionFile = host.session.sessionManager.getSessionFile();
  assert(sessionFile);
  const originalGeneration = generation(host);
  assert.equal(typeof originalGeneration, "string");
  now += 2_400_000_000n;
  await host.session.abort();
  await run;
  now += 1_800_000_000n;
  await host.close();
  now += 3_600_000_000_000n;

  const ready = Promise.withResolvers<void>();
  let settled = 0;
  const restored = await openNativeHost(t, {
    extensionPaths: [extension],
    noTools: "builtin",
    directory: host.directory,
    sessionFile,
    headless: true,
    holdResponses: true,
    extension: (pi) => {
      pi.on("before_provider_request", () => ready.promise);
      pi.on("agent_settled", () => {
        settled++;
      });
    },
  });
  restored.queueResponse(...response("get_goal", {}, "restored"));
  restored.queueResponse(...response("update_goal", { status: "paused" }, "pause"));
  restored.queueResponse(...answer());
  ready.resolve();
  await t.waitFor(() => {
    assert.equal(restored.requests.length, 3);
    assert.equal(settled, 1);
  });
  const snapshot = result(restored, "restored").goal;
  assert.equal(snapshot.status, "active");
  assert.equal(snapshot.objective, "Preserve reported pursuit");
  assert.equal(snapshot.threadId, host.session.sessionManager.getSessionId());
  assert.equal(snapshot.tokenBudget, 1000);
  assert.equal(snapshot.tokensUsed, 92);
  assert.equal(snapshot.timeUsedSeconds, 4);
  assert.equal(snapshot.createdAt, result(host, "create").goal.createdAt);
  assert.equal(generation(restored), originalGeneration);
  assert.equal(result(restored, "pause").goal.timeUsedSeconds, 4);
  assert.equal(restored.session.messages.filter((message) => message.role === "custom").length, 1);
});

for (const status of [
  "active",
  "paused",
  "blocked",
  "usageLimited",
  "budgetLimited",
  "complete",
] as const) {
  test(`restoration preserves the saved ${status} goal and its identity`, async (t) => {
    let now = 1_000_000_000n;
    let wallClock = 1_710_000_000_000;
    t.mock.method(process.hrtime, "bigint", () => now);
    t.mock.method(Date, "now", () => wallClock);
    const host = await openNativeHost(t, {
      extensionPaths: [extension],
      noTools: "builtin",
      persistSession: true,
      headless: true,
      holdResponses: true,
    });
    host.queueResponse(
      ...response(
        "create_goal",
        {
          objective: "Keep the saved objective 🧭",
          token_budget: status === "budgetLimited" ? 100 : "9223372036854775807",
        },
        "create",
      ),
    );
    host.queueResponse(
      { pause: true },
      ...response(
        "update_goal",
        {
          status: ["blocked", "complete"].includes(status) ? status : "paused",
        },
        "save",
        { prompt_tokens: 125, completion_tokens: 12, total_tokens: 137 },
      ),
    );
    host.queueResponse(...answer());
    const saving = host.session.prompt(
      "Create the explicitly requested goal and apply its requested status.",
    );
    await t.waitFor(() => assert.equal(host.requests.length, 2));
    now += 19_000_000_000n;
    wallClock += 5000;
    host.resumeResponse();
    await saving;
    assert.equal(result(host, "save").goal.tokensUsed, 137);
    assert.equal(result(host, "save").goal.timeUsedSeconds, 19);
    const sessionFile = host.session.sessionManager.getSessionFile();
    assert(sessionFile);
    const originalGeneration = generation(host);
    const owner = host.session.sessionManager.getSessionId();
    if (status === "active") {
      host.queueResponse(...response("get_goal", {}, "resumed"));
      await host.session.prompt("/goal resume");
      await t.waitFor(() => assert.equal(host.requests.length, 5));
      assert.equal(result(host, "resumed").goal.status, "active");
      await host.session.abort();
    }
    await host.close();
    if (status === "usageLimited") {
      let limitedSettled = false;
      const limited = await openNativeHost(t, {
        extensionPaths: [extension],
        noTools: "builtin",
        directory: host.directory,
        sessionFile,
        headless: true,
        providerProtocol: "responses",
        extension: (pi) => {
          pi.on("agent_settled", () => {
            limitedSettled = true;
          });
        },
      });
      limited.queueResponse(
        {
          event: {
            type: "response.created",
            response: { id: "preservation-limit" },
          },
        },
        {
          event: {
            type: "response.failed",
            response: {
              id: "preservation-limit",
              status: "failed",
              error: {
                code: "insufficient_quota",
                message: "Controlled usage limit",
              },
            },
          },
        },
        { end: true },
      );
      await limited.session.prompt("/goal resume");
      await t.waitFor(() => assert.equal(limitedSettled, true));
      assert.equal(limited.requests.length, 1);
      assert.equal(generation(limited), originalGeneration);
      await limited.close();
    }
    now += 3_600_000_000_000n;
    wallClock += 3_600_000;

    const ready = Promise.withResolvers<void>();
    let settled = 0;
    const restored = await openNativeHost(t, {
      extensionPaths: [extension],
      noTools: "builtin",
      directory: host.directory,
      sessionFile,
      headless: true,
      holdResponses: true,
      extension: (pi) => {
        pi.on("before_provider_request", () => ready.promise);
        pi.on("agent_settled", () => {
          settled++;
        });
      },
    });
    assert.equal(restored.requests.length, 0);
    restored.queueResponse(...response("get_goal", {}, "restored"));
    if (status === "active") {
      restored.queueResponse(...response("update_goal", { status: "paused" }, "stop-restored"));
    }
    restored.queueResponse(...answer());
    ready.resolve();
    if (status !== "active")
      await restored.session.prompt("Inspect the saved goal without resuming it.");
    await t.waitFor(() => {
      assert.equal(restored.requests.length, status === "active" ? 3 : 2);
      assert.equal(settled, 1);
    });
    assert.deepEqual(result(restored, "restored"), {
      goal: {
        threadId: owner,
        objective: "Keep the saved objective 🧭",
        status,
        tokenBudget: status === "budgetLimited" ? 100 : "9223372036854775807",
        tokensUsed: 137,
        timeUsedSeconds: 19,
        createdAt: 1710000000,
        updatedAt: 1710000005,
      },
      remainingTokens: status === "budgetLimited" ? 0 : "9223372036854775670",
      completionBudgetReport: null,
    });
    assert.equal(generation(restored), originalGeneration);
    assert.equal(
      restored.session.messages.filter((message) => message.role === "custom").length,
      status === "active" ? 2 : status === "usageLimited" ? 1 : 0,
    );
  });
}

test("a goal activated during manual compaction continues when compaction finishes", async (t) => {
  let settled = 0;
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    noTools: "builtin",
    persistSession: true,
    holdResponses: true,
    settings: { compaction: { enabled: false, keepRecentTokens: 1 } },
    extension: (pi) => {
      pi.on("agent_settled", () => {
        settled++;
      });
    },
  });
  host.queueResponse(...answer("The first ordinary turn is finished."));
  await host.session.prompt("Establish ordinary conversation history.");
  host.queueResponse(...answer("The second ordinary turn is finished."));
  await host.session.prompt("Continue the ordinary conversation.");
  host.queueResponse({ pause: true }, ...answer("The earlier conversation was summarized."));
  host.queueResponse(...answer("The retained turn prefix was summarized."));
  const compacting = host.session.compact();
  await t.waitFor(() => assert.equal(host.requests.length, 3));
  assert.equal(host.session.isCompacting, true);
  await host.session.prompt("/goal create Pursue the objective after compaction");
  host.queueResponse(...response("update_goal", { status: "paused" }, "pause-after-compaction"));
  host.queueResponse(...answer());
  host.resumeResponse();
  await compacting;
  assert.equal(host.session.isCompacting, false);
  await t.waitFor(() => {
    assert.equal(host.requests.length, 6);
    assert.equal(settled, 3);
  });
  assert.equal(result(host, "pause-after-compaction").goal.status, "paused");
  const last = host.requests[4]?.messages.at(-1);
  assert.equal(last?.role, "user");
  assert.match(JSON.stringify(last?.content), /Pursue the objective after compaction/);
});

for (const control of ["pause", "clear", "native Stop"] as const) {
  test(`${control} cancels continuation waiting for manual compaction`, async (t) => {
    let settled = 0;
    const host = await openNativeHost(t, {
      extensionPaths: [extension],
      noTools: "builtin",
      persistSession: true,
      holdResponses: true,
      settings: { compaction: { enabled: false, keepRecentTokens: 1 } },
      extension: (pi) => {
        pi.on("agent_settled", () => {
          settled++;
        });
      },
    });
    host.queueResponse(...answer("The first ordinary turn is finished."));
    await host.session.prompt("Establish ordinary conversation history.");
    host.queueResponse(...answer("The second ordinary turn is finished."));
    await host.session.prompt("Continue the ordinary conversation.");
    host.queueResponse({ pause: true }, ...answer("The earlier conversation was summarized."));
    if (control !== "native Stop") {
      host.queueResponse(...answer("The retained turn prefix was summarized."));
    }
    const compacting = host.session.compact();
    const finished =
      control === "native Stop" ? assert.rejects(compacting, /cancel|abort/i) : compacting;
    await t.waitFor(() => assert.equal(host.requests.length, 3));
    await host.session.prompt("/goal create Wait for the current compaction");
    if (control === "native Stop") {
      await host.key("\x1b");
    } else {
      await host.session.prompt(`/goal ${control}`);
      host.resumeResponse();
    }
    await finished;
    await host.session.waitForIdle();
    await nextImmediate();
    await nextImmediate();
    assert.equal(host.session.isCompacting, false);
    assert.equal(host.session.isStreaming, false);
    assert.equal(host.session.getSteeringMessages().length, 0);
    assert.equal(host.session.getFollowUpMessages().length, 0);
    assert.equal(host.requests.length, control === "native Stop" ? 3 : 4);
    assert.equal(settled, 2);
    host.queueResponse(...response("get_goal", {}, "after-cancelled-wait"));
    host.queueResponse(...answer());
    await host.session.prompt(
      "Inspect the saved state after the pending continuation was cancelled.",
    );
    const snapshot = result(host, "after-cancelled-wait").goal;
    if (control === "clear") {
      assert.equal(snapshot, null);
    } else {
      assert.equal(snapshot.status, "paused");
      assert.equal(snapshot.objective, "Wait for the current compaction");
      assert.equal(snapshot.tokensUsed, 0);
    }
  });
}

test("compaction preserves current accounting without reinjecting replaced goal context", async (t) => {
  let settled = 0;
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    noTools: "builtin",
    persistSession: true,
    headless: true,
    holdResponses: true,
    settings: { compaction: { enabled: false, keepRecentTokens: 1 } },
    extension: (pi) => {
      pi.on("agent_settled", () => {
        settled++;
      });
    },
  });
  host.queueResponse(...response("get_goal", {}, "initial", reported));
  host.queueResponse(...response("update_goal", { status: "paused" }, "paused", reported));
  host.queueResponse(...answer());
  await host.session.prompt("/goal create Retain the durable objective through history changes");
  await t.waitFor(() => assert.equal(settled, 1));
  const before = result(host, "paused");
  assert.equal(before.goal.tokensUsed, 184);
  const originalGeneration = generation(host);
  assert.equal(host.session.messages.filter((message) => message.role === "custom").length, 1);
  host.queueResponse(...answer("The unrelated first observation is recorded."));
  await host.session.prompt("Record the first unrelated observation.");
  host.queueResponse(...answer("The unrelated second observation is recorded."));
  await host.session.prompt("Record the second unrelated observation.");
  host.queueResponse(...answer("The earlier conversation was summarized."));
  host.queueResponse(...answer("The retained turn prefix was summarized."));
  const compacted = await host.session.compact();
  assert.match(compacted.summary, /summarized/);
  assert.equal(settled, 3);
  assert.equal(host.requests.length, 7);
  assert.equal(host.session.messages.filter((message) => message.role === "custom").length, 0);
  host.queueResponse(...response("get_goal", {}, "after-compaction"));
  host.queueResponse(...answer());
  await host.session.prompt("Inspect the stored state after history replacement.");
  assert.deepEqual(result(host, "after-compaction"), before);
  assert.equal(generation(host), originalGeneration);
  const request = JSON.stringify(host.requests[7]);
  assert.doesNotMatch(request, /goal_internal_context/);
  assert.doesNotMatch(request, /Retain the durable objective through history changes/);
});

test("history rewind retains current usage and cannot resurrect a cleared goal", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    noTools: "builtin",
    persistSession: true,
    headless: true,
    holdResponses: true,
  });
  host.queueResponse(...answer("This history predates the goal."));
  await host.session.prompt("Establish a history navigation target.");
  const beforeCreation = host.session.sessionManager.getLeafId();
  assert(beforeCreation);
  host.queueResponse(
    ...response(
      "create_goal",
      { objective: "The original objective", token_budget: 1000 },
      "create",
      reported,
    ),
  );
  host.queueResponse(...response("get_goal", {}, "initial", reported));
  host.queueResponse(...response("update_goal", { status: "paused" }, "paused", reported));
  host.queueResponse(...answer());
  await host.session.prompt("Create and pause the explicitly requested goal.");
  const historicalGoal = host.session.sessionManager.getLeafId();
  assert(historicalGoal);
  await host.session.prompt("/goal edit The current saved objective");
  await host.session.prompt("/goal pause");
  host.queueResponse(...response("get_goal", {}, "current"));
  host.queueResponse(...answer());
  await host.session.prompt("Inspect the edited objective.");
  const current = result(host, "current");
  assert.equal(current.goal.objective, "The current saved objective");
  assert.equal(current.goal.tokensUsed, 184);
  const originalGeneration = generation(host);

  assert.equal((await host.session.navigateTree(beforeCreation)).cancelled, false);
  assert.doesNotMatch(JSON.stringify(host.session.messages), /The original objective/);
  host.queueResponse(...response("get_goal", {}, "after-rewind"));
  host.queueResponse(...answer());
  await host.session.prompt("Inspect the current goal from the older history branch.");
  assert.deepEqual(result(host, "after-rewind"), current);
  assert.equal(generation(host), originalGeneration);

  await host.session.prompt("/goal clear");
  assert.equal((await host.session.navigateTree(historicalGoal)).cancelled, false);
  assert.match(JSON.stringify(host.session.messages), /The original objective/);
  host.queueResponse(...response("get_goal", {}, "after-clear-rewind"));
  host.queueResponse(...answer());
  await host.session.prompt("Inspect current state after revisiting old goal results.");
  assert.deepEqual(result(host, "after-clear-rewind"), {
    goal: null,
    remainingTokens: null,
    completionBudgetReport: null,
  });
});

test("session switches flush the source and restore only the selected session", async (t) => {
  let now = 1_000_000_000n;
  t.mock.method(process.hrtime, "bigint", () => now);
  const started: string[] = [];
  const shutdown: string[] = [];
  let settled = 0;
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    noTools: "builtin",
    persistSession: true,
    headless: true,
    holdResponses: true,
    extension: (pi) => {
      pi.on("agent_start", (_event, ctx) => {
        started.push(ctx.sessionManager.getSessionId());
      });
      pi.on("agent_settled", () => {
        settled++;
      });
      pi.on("session_shutdown", (event) => {
        shutdown.push(event.reason);
      });
    },
  });
  host.queueResponse(
    ...response("create_goal", { objective: "Pursue the first session" }, "create-a", reported),
  );
  host.queueResponse(...response("get_goal", {}, "initial-a", reported));
  host.queueResponse(...answer());
  await host.session.prompt("Create the first explicitly requested goal.");
  const first = host.session;
  const firstFile = first.sessionManager.getSessionFile();
  assert(firstFile);
  const firstId = first.sessionManager.getSessionId();
  const firstGeneration = generation(host);
  now += 2_200_000_000n;
  assert.equal((await host.runtime.newSession()).cancelled, false);
  const secondFile = host.session.sessionManager.getSessionFile();
  assert(secondFile);
  const secondId = host.session.sessionManager.getSessionId();
  assert.notEqual(secondId, firstId);
  assert.equal(first.isStreaming, false);
  assert.deepEqual(shutdown, ["new"]);
  assert.equal(host.requests.length, 3);
  host.queueResponse(...response("get_goal", {}, "empty-b", reported));
  host.queueResponse(...answer());
  await host.session.prompt("Inspect this session before creating a goal.");
  assert.equal(result(host, "empty-b").goal, null);
  host.queueResponse(
    ...response("create_goal", { objective: "Pursue the second session" }, "create-b", reported),
  );
  host.queueResponse(...response("update_goal", { status: "paused" }, "pause-b", reported));
  host.queueResponse(...answer());
  await host.session.prompt("Create and pause the second explicitly requested goal.");
  const second = result(host, "pause-b");
  assert.equal(second.goal.tokensUsed, 92);
  const secondGeneration = generation(host);
  assert.notEqual(secondGeneration, firstGeneration);
  now += 3_600_000_000_000n;

  host.queueResponse(...response("get_goal", {}, "restored-a"));
  host.queueResponse(...response("update_goal", { status: "paused" }, "pause-a"));
  host.queueResponse(...answer());
  assert.equal((await host.runtime.switchSession(firstFile)).cancelled, false);
  await t.waitFor(() => assert.equal(settled, 4));
  const restored = result(host, "restored-a").goal;
  assert.equal(restored.threadId, firstId);
  assert.equal(restored.status, "active");
  assert.equal(restored.objective, "Pursue the first session");
  assert.equal(restored.tokensUsed, 92);
  assert.equal(restored.timeUsedSeconds, 2);
  assert.equal(generation(host), firstGeneration);

  assert.equal((await host.runtime.switchSession(secondFile)).cancelled, false);
  assert.equal(host.requests.length, 11);
  host.queueResponse(...response("get_goal", {}, "restored-b"));
  host.queueResponse(...answer());
  await host.session.prompt("Inspect the unchanged second session.");
  assert.deepEqual(result(host, "restored-b"), second);
  assert.equal(generation(host), secondGeneration);
  assert.deepEqual(started, [firstId, secondId, secondId, firstId, secondId]);
  assert.deepEqual(shutdown, ["new", "resume", "resume"]);
});

test("retaining reload checkpoints once and admits one fresh continuation", async (t) => {
  let now = 1_000_000_000n;
  t.mock.method(process.hrtime, "bigint", () => now);
  const events: string[] = [];
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    noTools: "builtin",
    persistSession: true,
    holdResponses: true,
    extension: (pi) => {
      pi.registerCommand("preservation-reload", {
        description: "Reload through the native command lifecycle",
        handler: async (_args, ctx) => ctx.reload(),
      });
      pi.on("agent_start", () => {
        events.push("start");
      });
      pi.on("agent_settled", () => {
        events.push("settled");
      });
      pi.on("session_shutdown", (event) => {
        events.push(event.reason);
      });
    },
  });
  host.queueResponse(
    ...response("create_goal", { objective: "Retain pursuit through reload" }, "create", reported),
  );
  host.queueResponse(...response("get_goal", {}, "read", reported));
  host.queueResponse(...answer());
  await host.session.prompt("Create the explicitly requested persistent goal.");
  const originalGeneration = generation(host);
  const originalSession = host.session.sessionManager.getSessionId();
  now += 1_900_000_000n;
  host.queueResponse(...response("get_goal", {}, "after-reload"));
  host.queueResponse(...response("update_goal", { status: "paused" }, "pause"));
  host.queueResponse(...answer());
  await host.session.prompt("/preservation-reload");
  await t.waitFor(() => {
    assert.equal(host.requests.length, 6);
    assert.deepEqual(events, ["start", "settled", "reload", "start", "settled"]);
  });
  const restored = result(host, "after-reload").goal;
  assert.equal(restored.threadId, originalSession);
  assert.equal(restored.status, "active");
  assert.equal(restored.tokensUsed, 92);
  assert.equal(restored.timeUsedSeconds, 1);
  assert.equal(generation(host), originalGeneration);
  assert.equal(host.session.messages.filter((message) => message.role === "custom").length, 1);
  assert.equal(host.session.pendingMessageCount, 0);
  assert.equal(result(host, "pause").goal.tokensUsed, 92);
});

for (const operation of ["fork", "clone"] as const) {
  test(`a generic persisted ${operation} retains history without inheriting the source goal`, async (t) => {
    let now = 1_000_000_000n;
    t.mock.method(process.hrtime, "bigint", () => now);
    let settled = 0;
    const host = await openNativeHost(t, {
      extensionPaths: [extension],
      noTools: "builtin",
      persistSession: true,
      headless: true,
      holdResponses: true,
      extension: (pi) => {
        pi.on("agent_settled", () => {
          settled++;
        });
      },
    });
    host.queueResponse(
      ...response(
        "create_goal",
        { objective: "The source session objective" },
        "create-source",
        reported,
      ),
    );
    host.queueResponse(...response("get_goal", {}, "source-read", reported));
    host.queueResponse(...answer());
    await host.session.prompt("Create the explicitly requested source goal.");
    const sourceFile = host.session.sessionManager.getSessionFile();
    const sourceId = host.session.sessionManager.getSessionId();
    const sourceGeneration = generation(host);
    const entry = host.session.sessionManager.getLeafId();
    assert(sourceFile && entry);
    now += 1_300_000_000n;
    if (operation === "fork") {
      assert.equal((await host.runtime.fork(entry, { position: "at" })).cancelled, false);
    } else {
      const clone = SessionManager.forkFrom(sourceFile, host.directory);
      const cloneFile = clone.getSessionFile();
      assert(cloneFile);
      assert.deepEqual(clone.getEntries(), SessionManager.open(sourceFile).getEntries());
      assert.equal((await host.runtime.switchSession(cloneFile)).cancelled, false);
    }
    const targetId = host.session.sessionManager.getSessionId();
    assert.notEqual(targetId, sourceId);
    assert(host.session.sessionManager.getSessionFile());
    assert.match(JSON.stringify(host.session.messages), /The source session objective/);
    assert.equal(host.requests.length, 3);
    host.queueResponse(...response("get_goal", {}, "target-read", reported));
    host.queueResponse(
      ...response(
        "create_goal",
        { objective: "The separately authorized target" },
        "create-target",
        reported,
      ),
    );
    host.queueResponse(...response("update_goal", { status: "paused" }, "pause-target", reported));
    host.queueResponse(...answer());
    await host.session.prompt(
      "Inspect this session, then create and pause its separately authorized goal.",
    );
    assert.equal(result(host, "target-read").goal, null);
    assert.equal(result(host, "create-target").goal.tokensUsed, 0);
    assert.equal(result(host, "pause-target").goal.tokensUsed, 92);
    assert.equal(result(host, "pause-target").goal.threadId, targetId);
    assert.notEqual(generation(host), sourceGeneration);

    host.queueResponse(...response("get_goal", {}, "restored-source"));
    host.queueResponse(...response("update_goal", { status: "paused" }, "pause-source"));
    host.queueResponse(...answer());
    assert.equal((await host.runtime.switchSession(sourceFile)).cancelled, false);
    await t.waitFor(() => assert.equal(settled, 3));
    const source = result(host, "restored-source").goal;
    assert.equal(source.status, "active");
    assert.equal(source.threadId, sourceId);
    assert.equal(source.objective, "The source session objective");
    assert.equal(source.tokensUsed, 92);
    assert.equal(source.timeUsedSeconds, 1);
    assert.equal(generation(host), sourceGeneration);
  });
}

test("a generic ephemeral fork remains ephemeral and cannot persist a goal", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    noTools: "builtin",
    headless: true,
    holdResponses: true,
  });
  host.queueResponse(
    ...response(
      "create_goal",
      { objective: "A goal requires persistent ownership" },
      "source-create",
    ),
  );
  host.queueResponse(...answer());
  await host.session.prompt("Attempt the explicitly requested goal in this ephemeral session.");
  const sourceId = host.session.sessionManager.getSessionId();
  const entry = host.session.sessionManager.getLeafId();
  assert(entry);
  assert.equal(host.session.sessionManager.getSessionFile(), undefined);
  assert.equal((await host.runtime.fork(entry, { position: "at" })).cancelled, false);
  assert.notEqual(host.session.sessionManager.getSessionId(), sourceId);
  assert.equal(host.session.sessionManager.getSessionFile(), undefined);
  assert.equal(host.requests.length, 2);
  host.queueResponse(...response("get_goal", {}, "target-read"));
  host.queueResponse(
    ...response("create_goal", { objective: "A separate requested target goal" }, "target-create"),
  );
  host.queueResponse(...answer());
  await host.session.prompt("Inspect this fork and attempt its explicitly requested goal.");
  for (const id of ["source-create", "target-read", "target-create"]) {
    const message = host.session.messages.find(
      (item) => item.role === "toolResult" && item.toolCallId === id,
    );
    assert(message?.role === "toolResult");
    assert.equal(message.isError, true);
    assert.match(JSON.stringify(message.content), /persistent thread/);
  }
  assert.equal(host.session.sessionManager.getSessionFile(), undefined);
});

test("manual compaction adds its reported usage and continues with the latest objective", async (t) => {
  t.mock.method(process.hrtime, "bigint", () => 1_000_000_000n);
  let settled = 0;
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    noTools: "builtin",
    persistSession: true,
    headless: true,
    holdResponses: true,
    settings: { compaction: { enabled: false, keepRecentTokens: 1 } },
    extension: (pi) => {
      pi.on("agent_settled", () => {
        settled++;
      });
    },
  });
  host.queueResponse(
    ...response(
      "create_goal",
      { objective: "The earlier active objective", token_budget: 1000 },
      "create",
      reported,
    ),
  );
  host.queueResponse(...response("get_goal", {}, "first-read", reported));
  host.queueResponse(...response("get_goal", {}, "second-read"));
  host.queueResponse(...answer());
  await host.session.prompt("Create the explicitly requested goal and inspect its progress.");
  assert.equal(result(host, "second-read").goal.tokensUsed, 92);
  const originalGeneration = generation(host);
  host.queueResponse({ pause: true }, ...answer("The earlier pursuit was summarized.", reported));
  const compacting = host.session.compact();
  await t.waitFor(() => assert.equal(host.requests.length, 5));
  await host.session.prompt("/goal edit The latest active objective");
  host.queueResponse(...response("get_goal", {}, "after-active-compaction"));
  host.queueResponse(...response("update_goal", { status: "paused" }, "pause"));
  host.queueResponse(...answer());
  host.resumeResponse();
  await compacting;
  await t.waitFor(() => {
    assert.equal(host.requests.length, 8);
    assert.equal(settled, 2);
  });
  const restored = result(host, "after-active-compaction").goal;
  assert.equal(restored.status, "active");
  assert.equal(restored.objective, "The latest active objective");
  assert.equal(restored.tokensUsed, 184);
  assert.equal(restored.tokenBudget, 1000);
  assert.equal(restored.timeUsedSeconds, 0);
  assert.equal(generation(host), originalGeneration);
  const continuation = host.requests[5]?.messages.at(-1);
  assert.equal(continuation?.role, "user");
  assert.match(JSON.stringify(continuation?.content), /The latest active objective/);
  assert.equal(result(host, "pause").goal.tokensUsed, 184);
});

test("manual compaction after raw abort charges summary usage and resumes the active goal", async (t) => {
  t.mock.method(process.hrtime, "bigint", () => 1_000_000_000n);
  let settled = 0;
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    noTools: "builtin",
    persistSession: true,
    headless: true,
    holdResponses: true,
    settings: { compaction: { enabled: false, keepRecentTokens: 1 } },
    extension: (pi) => {
      pi.on("agent_settled", () => {
        settled++;
      });
    },
  });
  host.queueResponse(
    ...response(
      "create_goal",
      { objective: "Resume after a completed summary", token_budget: 1000 },
      "create",
      reported,
    ),
  );
  host.queueResponse(...response("get_goal", {}, "before-abort", reported));
  const run = host.session.prompt("Create the explicitly requested goal and inspect its progress.");
  await t.waitFor(() => assert.equal(host.requests.length, 3));
  assert.equal(result(host, "before-abort").goal.tokensUsed, 0);
  const originalGeneration = generation(host);
  await host.session.abort();
  await run;
  assert.equal(settled, 1);
  host.queueResponse({ pause: true }, ...answer("The earlier pursuit was summarized.", reported));
  const compacting = host.session.compact();
  await t.waitFor(() => assert.equal(host.requests.length, 4));
  assert.equal(host.session.isCompacting, true);
  host.queueResponse(...response("get_goal", {}, "after-summary"));
  host.queueResponse(...response("update_goal", { status: "paused" }, "pause"));
  host.queueResponse(...answer());
  host.resumeResponse();
  const compacted = await compacting;
  assert.match(compacted.summary, /summarized/);
  await t.waitFor(() => {
    assert.equal(host.requests.length, 7);
    assert.equal(settled, 2);
  });
  const snapshot = result(host, "after-summary").goal;
  assert.equal(snapshot.status, "active");
  assert.equal(snapshot.objective, "Resume after a completed summary");
  assert.equal(snapshot.tokensUsed, 184);
  assert.equal(snapshot.timeUsedSeconds, 0);
  assert.equal(generation(host), originalGeneration);
  assert.equal(result(host, "pause").goal.tokensUsed, 184);
  const continuation = host.requests[4]?.messages.at(-1);
  assert.equal(continuation?.role, "user");
  assert.match(JSON.stringify(continuation?.content), /Resume after a completed summary/);
});

test(
  "session switching cancels a pending objective editor without changing either goal",
  { timeout: 5000 },
  async (t) => {
    const host = await openNativeHost(t, {
      extensionPaths: [extension],
      noTools: "builtin",
      persistSession: true,
      holdResponses: true,
    });
    await host.session.prompt("/goal create The source objective");
    await host.session.prompt("/goal pause");
    host.queueResponse(...response("get_goal", {}, "source"));
    host.queueResponse(...answer());
    await host.session.prompt("Inspect the paused source goal.");
    const source = result(host, "source");
    const sourceFile = host.session.sessionManager.getSessionFile();
    assert(sourceFile);
    const editing = host.session.prompt("/goal edit");
    await t.waitFor(async () => assert.match(await host.frame(), /Goal objective/));
    await host.key("\x15");
    await host.type("An obsolete objective edit");
    assert.equal((await host.runtime.newSession()).cancelled, false);
    await host.session.prompt("/goal create The target objective");
    await host.session.prompt("/goal pause");
    await editing;
    host.queueResponse(...response("get_goal", {}, "target"));
    host.queueResponse(...answer());
    await host.session.prompt("Inspect the independently owned target goal.");
    assert.equal(result(host, "target").goal.objective, "The target objective");
    assert.equal(result(host, "target").goal.status, "paused");
    assert.notEqual(result(host, "target").goal.threadId, source.goal.threadId);
    assert.equal((await host.runtime.switchSession(sourceFile)).cancelled, false);
    host.queueResponse(...response("get_goal", {}, "source-after-edit"));
    host.queueResponse(...answer());
    await host.session.prompt("Inspect the source after the old editor has closed.");
    assert.deepEqual(result(host, "source-after-edit"), source);
  },
);
