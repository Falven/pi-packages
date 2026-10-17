/* eslint-disable no-await-in-loop -- Each mutation is observed through the same live session before the next operation. */
import assert from "node:assert/strict";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import test from "node:test";
import { createCodemodeExtension } from "@earendil-works/pi-coding-agent";
import { openNativeHost } from "../../../fixtures/native-host.ts";
import { toolResponse } from "./tool-response.ts";

const extension = new URL("../src/index.ts", import.meta.url).pathname;
type Host = Awaited<ReturnType<typeof openNativeHost>>;
let nextCall = 0;

function response(name: string, args: unknown, usage?: unknown) {
  return toolResponse(name, args, `lifecycle-${++nextCall}`, usage);
}

function lastResult(host: Host) {
  const result = host.session.messages.findLast((message) => message.role === "toolResult");
  assert(result?.role === "toolResult");
  const content = result.content[0];
  assert(content?.type === "text");
  return { text: content.text, isError: result.isError };
}

async function call(host: Host, name: string, args: unknown = {}, usage?: unknown) {
  host.queueResponse(...response(name, args, usage));
  await host.session.prompt("Apply the explicitly requested goal operation");
  const result = lastResult(host);
  assert.equal(result.isError, false, result.text);
  return JSON.parse(result.text);
}

function generation(host: Host) {
  const entry = host.session.sessionManager
    .getEntries()
    .findLast((item) => item.type === "custom" && item.customType === "pi-goal.state");
  assert(entry?.type === "custom");
  const value = (entry.data as { generation?: unknown }).generation;
  assert(typeof value === "string");
  return value;
}

test("model status updates preserve the objective and exact allowance", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    noTools: "builtin",
    persistSession: true,
  });
  const created = await call(host, "create_goal", {
    objective: "Finish the authorized work",
    token_budget: "9223372036854775807",
  });
  const paused = await call(host, "update_goal", { status: "paused" });
  assert.deepEqual(paused, {
    ...created,
    goal: {
      ...created.goal,
      status: "paused",
      updatedAt: paused.goal.updatedAt,
    },
  });
  assert(paused.goal.updatedAt >= created.goal.updatedAt);
  const blocked = await call(host, "update_goal", { status: "blocked" });
  assert.equal(blocked.goal.status, "blocked");
  assert.equal(blocked.goal.tokenBudget, "9223372036854775807");
  assert.equal(blocked.remainingTokens, "9223372036854775807");
  assert.deepEqual(await call(host, "get_goal"), blocked);
});

test("terminal completion returns its snapshot and retains the display after clearing current state", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    noTools: "builtin",
    persistSession: true,
  });
  const created = await call(host, "create_goal", {
    objective: "Verify the completion snapshot",
    token_budget: "9223372036854775807",
  });
  const originalGeneration = generation(host);
  const completed = await call(host, "update_goal", { status: "complete" });
  assert.equal(completed.goal.status, "complete");
  assert.equal(completed.goal.tokenBudget, "9223372036854775807");
  assert.equal(completed.goal.createdAt, created.goal.createdAt);
  assert.equal(completed.goal.tokensUsed, 0);
  assert.equal(completed.remainingTokens, "9223372036854775807");
  assert.match(completed.completionBudgetReport, /report/i);
  assert.match(completed.completionBudgetReport, /goal\.tokensUsed/);
  assert.match(completed.completionBudgetReport, /goal\.tokenBudget/);
  assert.deepEqual(await call(host, "get_goal"), {
    goal: null,
    remainingTokens: null,
    completionBudgetReport: null,
  });
  assert.match(await host.frame(), /Goal: complete/);
  assert(JSON.stringify(host.requests.at(-1)).includes("Verify the completion snapshot"));
  const replacement = await call(host, "create_goal", {
    objective: "A separately authorized replacement",
  });
  assert.equal(replacement.goal.status, "active");
  assert.equal(replacement.goal.tokensUsed, 0);
  assert.equal("tokenBudget" in replacement.goal, false);
  assert.notEqual(generation(host), originalGeneration);
  await host.session.prompt("/goal pause");
  assert.doesNotMatch(await host.frame(), /Goal: complete/);
});

test("headless completion stays readable and a later replacement starts fresh", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    noTools: "builtin",
    persistSession: true,
    headless: true,
  });
  await call(host, "create_goal", { objective: "Finish the unbounded work" });
  const originalGeneration = generation(host);
  const completed = await call(host, "update_goal", { status: "complete" });
  assert.equal(completed.goal.status, "complete");
  assert.equal(completed.completionBudgetReport, null);
  assert.deepEqual(await call(host, "get_goal"), completed);
  const sessionFile = host.session.sessionManager.getSessionFile();
  assert(sessionFile);
  await host.close();
  const reopened = await openNativeHost(t, {
    directory: host.directory,
    sessionFile,
    extensionPaths: [extension],
    noTools: "builtin",
    headless: true,
  });
  assert.deepEqual(await call(reopened, "get_goal"), completed);
  assert.equal(generation(reopened), originalGeneration);
  const replacement = await call(reopened, "create_goal", {
    objective: "The next authorized goal",
    token_budget: 100,
  });
  assert.equal(replacement.goal.status, "active");
  assert.equal(replacement.goal.objective, "The next authorized goal");
  assert.equal(replacement.goal.tokensUsed, 0);
  assert.equal(replacement.goal.timeUsedSeconds, 0);
  assert.equal(replacement.remainingTokens, 100);
  assert.notEqual(generation(reopened), originalGeneration);
  await reopened.session.prompt("/goal pause");
});

test("a presentation cleanup failure preserves the successful completion snapshot", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    noTools: "builtin",
    persistSession: true,
  });
  await call(host, "create_goal", {
    objective: "Finish despite unavailable presentation cleanup",
    token_budget: 100,
  });
  const sessionFile = host.session.sessionManager.getSessionFile();
  assert(sessionFile);
  const originalAppend = fs.appendFileSync;
  let failed = false;
  const failCleanup: typeof fs.appendFileSync = (file, data, options) => {
    if (file === sessionFile && typeof data === "string" && JSON.parse(data).data?.clear === true) {
      failed = true;
      throw new Error("Controlled cleanup failure");
    }
    return originalAppend(file, data, options);
  };
  const append = t.mock.method(fs, "appendFileSync", failCleanup);
  syncBuiltinESMExports();
  host.queueResponse(...response("update_goal", { status: "complete" }));
  host.queueResponse({ pause: true });
  const before = host.requests.length;
  const completing = host.session.prompt("Complete the explicitly requested goal.");
  try {
    await t.waitFor(() => assert.equal(host.requests.length, before + 2));
    assert.match(await host.frame(), /Could not clear the completed goal/);
    await host.key("\x1b");
    await completing;
  } finally {
    append.mock.restore();
    syncBuiltinESMExports();
  }
  assert.equal(lastResult(host).isError, false);
  const completed = JSON.parse(lastResult(host).text);
  assert.equal(failed, true);
  assert.equal(completed.goal.status, "complete");
  assert.match(completed.completionBudgetReport, /report/i);
  assert.equal(host.session.isStreaming, false);
  assert.match(await host.frame(), /Could not pause the goal/);
  assert.match(await host.frame(), /Reopen the saved session/);
  const lastEntry = host.session.sessionManager
    .getEntries()
    .findLast((entry) => entry.type === "custom" && entry.customType === "pi-goal.state");
  assert(lastEntry?.type === "custom");
  assert.deepEqual(lastEntry.data, {
    threadId: host.session.sessionManager.getSessionId(),
    clear: true,
  });
  host.queueResponse(...response("get_goal", {}));
  await host.session.prompt("Inspect after the failed presentation cleanup.");
  assert.equal(lastResult(host).isError, true);
  assert.match(lastResult(host).text, /Reopen the saved session/);
  await host.close();
  const reopened = await openNativeHost(t, {
    directory: host.directory,
    sessionFile,
    extensionPaths: [extension],
    noTools: "builtin",
    headless: true,
  });
  const retained = await call(reopened, "get_goal");
  assert.deepEqual(retained.goal, completed.goal);
  assert.equal(retained.completionBudgetReport, null);
});

test("opening a headless completion in the terminal retains its display and clears current state", async (t) => {
  const headless = await openNativeHost(t, {
    extensionPaths: [extension],
    noTools: "builtin",
    persistSession: true,
    headless: true,
  });
  await call(headless, "create_goal", {
    objective: "Finish before opening the terminal",
  });
  await call(headless, "update_goal", { status: "complete" });
  const sessionFile = headless.session.sessionManager.getSessionFile();
  assert(sessionFile);
  await headless.close();
  const terminal = await openNativeHost(t, {
    directory: headless.directory,
    sessionFile,
    extensionPaths: [extension],
    noTools: "builtin",
  });
  assert.match(await terminal.frame(), /Goal: complete/);
  assert.equal((await call(terminal, "get_goal")).goal, null);
  await terminal.close();
  const reopened = await openNativeHost(t, {
    directory: terminal.directory,
    sessionFile,
    extensionPaths: [extension],
    noTools: "builtin",
    headless: true,
  });
  assert.equal((await call(reopened, "get_goal")).goal, null);
});

test("explicit controls mutate the goal before automatic admission", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    noTools: "builtin",
    persistSession: true,
  });
  await host.session.prompt("/goal create   Finish the user-authorized work   ");
  assert.equal(host.requests.length, 0);
  const created = await call(host, "get_goal");
  assert.equal(created.goal.objective, "Finish the user-authorized work");
  assert.equal(created.goal.status, "active");
  assert.equal("tokenBudget" in created.goal, false);
  await host.session.prompt("/goal pause");
  const paused = await call(host, "get_goal");
  assert.equal(paused.goal.status, "paused");
  await host.session.prompt("/goal resume");
  assert.equal((await call(host, "get_goal")).goal.status, "active");
  await host.session.prompt("/goal edit   Finish the revised scope   ");
  const edited = await call(host, "get_goal");
  assert.equal(edited.goal.objective, "Finish the revised scope");
  assert.equal(edited.goal.createdAt, created.goal.createdAt);
  assert.equal(edited.goal.tokensUsed, 0);
  assert.equal(edited.goal.timeUsedSeconds, 0);
  await host.session.prompt("/goal inspect");
  await host.session.prompt("/goal pause");
  assert.match(await host.frame(), /active: Finish the revised scope/);
  const beforeClearLeaf = host.session.sessionManager.getLeafId();
  const sessionFile = host.session.sessionManager.getSessionFile();
  assert(beforeClearLeaf);
  assert(sessionFile);
  const beforeClear = host.session.messages.length;
  await host.session.prompt("/goal clear");
  await host.session.prompt("/goal clear");
  assert.equal(host.session.messages.length, beforeClear);
  assert.equal((await call(host, "get_goal")).goal, null);
  assert.equal(host.requests.length, 10);
  assert.equal(
    host.session.messages.some((message) => message.role === "custom"),
    false,
  );
  assert.equal((await host.session.navigateTree(beforeClearLeaf)).cancelled, false);
  assert.equal((await call(host, "get_goal")).goal, null);
  await host.close();
  const reopened = await openNativeHost(t, {
    directory: host.directory,
    sessionFile,
    extensionPaths: [extension],
    noTools: "builtin",
    headless: true,
  });
  assert.equal((await call(reopened, "get_goal")).goal, null);
});

test("pause and clear change durable state without interrupting a running turn", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    noTools: "builtin",
    persistSession: true,
  });
  await host.session.prompt("/goal create Finish the controlled work");
  for (const action of ["pause", "clear"]) {
    const before = host.requests.length;
    const steps = response("get_goal", {});
    host.queueResponse(steps[0]!, { pause: true }, ...steps.slice(1));
    const running = host.session.prompt("Inspect the current goal");
    await t.waitFor(() => assert.equal(host.requests.length, before + 1));
    await host.session.prompt(`/goal ${action}`);
    assert.equal(host.session.isStreaming, true);
    host.resumeResponse();
    await running;
    assert.equal(lastResult(host).isError, false);
    const result = JSON.parse(lastResult(host).text);
    if (action === "pause") assert.equal(result.goal.status, "paused");
    else assert.equal(result.goal, null);
    assert.equal(host.requests.length, before + 2);
  }
  assert.equal(
    host.session.messages.some((message) => message.role === "custom"),
    false,
  );
});

test("explicit objective controls retain format characters outside Unicode whitespace", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    noTools: "builtin",
    persistSession: true,
    headless: true,
  });
  await host.session.prompt("/goal create \ufeffOriginal objective\ufeff");
  assert.equal((await call(host, "get_goal")).goal.objective, "\ufeffOriginal objective\ufeff");
  await host.session.prompt("/goal edit \ufeffRevised objective\ufeff");
  assert.equal((await call(host, "get_goal")).goal.objective, "\ufeffRevised objective\ufeff");
});

test("native validation rejects invalid model statuses without changing the goal", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    noTools: "builtin",
    persistSession: true,
  });
  const created = await call(host, "create_goal", {
    objective: "Keep the authorized goal",
  });
  for (const args of [
    { status: "active" },
    { status: "usageLimited" },
    { status: "budgetLimited" },
    {},
  ]) {
    host.queueResponse(...response("update_goal", args));
    await host.session.prompt("Exercise an invalid goal status");
    assert.equal(lastResult(host).isError, true);
    assert.match(lastResult(host).text, /Validation failed for tool "update_goal"/);
    assert.deepEqual(await call(host, "get_goal"), created);
  }
});

test("resume preserves paused and blocked usage and is unavailable for completed goals", async (t) => {
  let now = 1_000_000_000n;
  t.mock.method(process.hrtime, "bigint", () => now);
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    noTools: "builtin",
    persistSession: true,
    headless: true,
  });
  const created = await call(host, "create_goal", {
    objective: "Resume the same allowance",
    token_budget: 100,
  });
  const originalGeneration = generation(host);
  now += 17_000_000_000n;
  for (const status of ["paused", "blocked", "complete"]) {
    await call(
      host,
      "update_goal",
      { status },
      status === "paused"
        ? { prompt_tokens: 50, completion_tokens: 11, total_tokens: 61 }
        : undefined,
    );
    await host.session.prompt("/goal resume");
    const resumed = await call(host, "get_goal");
    assert.equal(resumed.goal.status, status === "complete" ? "complete" : "active");
    assert.equal(resumed.goal.tokensUsed, 61);
    assert.equal(resumed.goal.timeUsedSeconds, 17);
    assert.equal(resumed.goal.tokenBudget, 100);
    assert.equal(resumed.goal.createdAt, created.goal.createdAt);
    assert.equal(generation(host), originalGeneration);
  }
});

test("resume preserves a restored usage-limited goal and its recorded usage", async (t) => {
  let now = 1_000_000_000n;
  t.mock.method(process.hrtime, "bigint", () => now);
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    noTools: "builtin",
    persistSession: true,
    headless: true,
  });
  const created = await call(host, "create_goal", {
    objective: "Resume after the provider limit",
    token_budget: 100,
  });
  const originalGeneration = generation(host);
  now += 17_000_000_000n;
  await call(
    host,
    "update_goal",
    { status: "paused" },
    {
      prompt_tokens: 50,
      completion_tokens: 11,
      total_tokens: 61,
    },
  );
  const sessionFile = host.session.sessionManager.getSessionFile();
  assert(sessionFile);
  await host.close();
  let settled = false;
  const limited = await openNativeHost(t, {
    directory: host.directory,
    sessionFile,
    extensionPaths: [extension],
    noTools: "builtin",
    headless: true,
    providerProtocol: "responses",
    extension: (pi) => {
      pi.on("agent_settled", () => {
        settled = true;
      });
    },
  });
  limited.queueResponse(
    {
      event: { type: "response.created", response: { id: "lifecycle-limit" } },
    },
    {
      event: {
        type: "response.failed",
        response: {
          id: "lifecycle-limit",
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
  await t.waitFor(() => assert.equal(settled, true));
  await limited.close();
  const reopened = await openNativeHost(t, {
    directory: host.directory,
    sessionFile,
    extensionPaths: [extension],
    noTools: "builtin",
    headless: true,
  });
  const before = await call(reopened, "get_goal");
  assert.equal(before.goal.status, "usageLimited");
  assert.equal(before.goal.tokensUsed, 61);
  assert.equal(before.goal.timeUsedSeconds, 17);
  assert.equal(before.goal.tokenBudget, 100);
  assert.equal(before.goal.createdAt, created.goal.createdAt);
  await reopened.session.prompt("/goal resume");
  const resumed = await call(reopened, "get_goal");
  assert.deepEqual(resumed.goal, {
    ...before.goal,
    status: "active",
    updatedAt: resumed.goal.updatedAt,
  });
  assert.equal(generation(reopened), originalGeneration);
  await reopened.session.prompt("/goal pause");
});

test("stored exhaustion prevents activation and pause or block while completion retains final usage", async (t) => {
  let now = 1_000_000_000n;
  t.mock.method(process.hrtime, "bigint", () => now);
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    noTools: "builtin",
    persistSession: true,
    headless: true,
  });
  const created = await call(host, "create_goal", {
    objective: "Finish within the existing allowance",
    token_budget: 100,
  });
  const originalGeneration = generation(host);
  now += 17_000_000_000n;
  const paused = await call(
    host,
    "update_goal",
    { status: "paused" },
    { prompt_tokens: 100, completion_tokens: 25, total_tokens: 125 },
  );
  assert.equal(paused.goal.status, "budgetLimited");
  assert.equal(paused.goal.tokensUsed, 125);
  assert.equal(paused.goal.timeUsedSeconds, 17);
  assert.equal(paused.remainingTokens, 0);
  await host.session.prompt("/goal resume");
  assert.deepEqual(await call(host, "get_goal"), paused);
  assert.equal(
    (await call(host, "update_goal", { status: "blocked" })).goal.status,
    "budgetLimited",
  );
  await host.session.prompt("/goal edit Finish the corrected scope");
  const edited = await call(host, "get_goal");
  assert.equal(edited.goal.status, "budgetLimited");
  assert.equal(edited.goal.objective, "Finish the corrected scope");
  assert.equal(edited.goal.createdAt, created.goal.createdAt);
  assert.equal(edited.goal.tokenBudget, 100);
  assert.equal(edited.goal.tokensUsed, 125);
  assert.equal(generation(host), originalGeneration);
  const completed = await call(host, "update_goal", { status: "complete" });
  assert.equal(completed.goal.status, "complete");
  assert.equal(completed.goal.tokensUsed, 125);
  assert.equal(completed.goal.timeUsedSeconds, 17);
  assert.match(completed.completionBudgetReport, /goal\.timeUsedSeconds/);
  const read = await call(host, "get_goal");
  assert.deepEqual(read.goal, completed.goal);
  assert.equal(read.completionBudgetReport, null);
});

test("the native goal picker creates an objective and offers the current status actions", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    noTools: "builtin",
    persistSession: true,
    keybindings: {
      "tui.select.confirm": "ctrl+j",
      "tui.select.cancel": "ctrl+q",
    },
  });
  const creating = host.session.prompt("/goal");
  await t.waitFor(async () => assert.match(await host.frame(), /Create goal/));
  await host.key("\x1b[B");
  await host.key("\n");
  await t.waitFor(async () => assert.match(await host.frame(), /Goal objective/));
  await host.type("Finish the selected work");
  host.queueResponse(...response("get_goal", {}));
  host.queueResponse(
    { pause: true },
    {
      event: {
        choices: [
          {
            index: 0,
            delta: {
              role: "assistant",
              content: "The controlled turn finished.",
            },
            finish_reason: "stop",
          },
        ],
      },
    },
    { event: "[DONE]" },
    { end: true },
  );
  await host.key("\r");
  await creating;
  await t.waitFor(() => assert.equal(host.requests.length, 2));
  assert.equal(JSON.parse(lastResult(host).text).goal.objective, "Finish the selected work");
  const pausing = host.session.prompt("/goal");
  await t.waitFor(async () => assert.match(await host.frame(), /Pause/));
  assert.doesNotMatch(await host.frame(), /Resume/);
  await host.key("\x1b[B");
  await host.key("\x1b[B");
  await host.key("\n");
  await pausing;
  host.resumeResponse();
  await host.session.waitForIdle();
  assert.equal((await call(host, "get_goal")).goal.status, "paused");
  const cancelling = host.session.prompt("/goal");
  await t.waitFor(async () => assert.match(await host.frame(), /Resume/));
  assert.doesNotMatch(await host.frame(), /Pause/);
  await host.key("\x11");
  await cancelling;
  assert.equal((await call(host, "get_goal")).goal.status, "paused");
});

test("a running objective edit follows tool output as hidden user context and persists once", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    noTools: "builtin",
    persistSession: true,
  });
  await call(host, "create_goal", {
    objective: "The original scope",
    token_budget: 5000,
  });
  const steps = response("get_goal", {});
  host.queueResponse(steps[0]!, { pause: true }, ...steps.slice(1));
  const running = host.session.prompt("Inspect the goal while its user edits the scope");
  await t.waitFor(() => assert.equal(host.requests.length, 3));
  await host.session.prompt("/goal edit   Revised <scope> & evidence   ");
  assert.equal(host.session.isStreaming, true);
  host.resumeResponse();
  await running;
  const next = host.requests[3]!.messages;
  const resultIndex = next.findLastIndex((message) => message.role === "tool");
  const edited = next[resultIndex + 1];
  assert.equal(edited?.role, "user");
  assert(Array.isArray(edited.content));
  assert.equal(edited.content.length, 1);
  const text = edited.content[0];
  assert(text?.type === "text");
  assert.match(text.text, /^<goal_internal_context source="goal">\n/);
  assert.match(
    text.text,
    /<untrusted_objective>\nRevised &lt;scope&gt; &amp; evidence\n<\/untrusted_objective>/,
  );
  assert.match(text.text, /Tokens used: 0\n- Token budget: 5000\n- Tokens remaining: 5000/);
  assert.match(text.text, /\n\n<\/goal_internal_context>$/);
  const context = host.session.messages.find((message) => message.role === "custom");
  assert(context?.role === "custom");
  assert.equal(context.customType, "goal.internal_context");
  assert.equal(context.display, false);
  assert.deepEqual(context.details, {
    source: "goal",
    kind: "goal.internal_context",
  });
  await host.session.prompt("/goal edit Revised <scope> & evidence");
  await host.session.prompt("/goal edit The next idle scope");
  const goal = await call(host, "get_goal");
  await host.session.prompt("/goal pause");
  assert.equal(goal.goal.objective, "The next idle scope");
  assert.equal(goal.goal.tokenBudget, 5000);
  assert.equal(host.session.messages.filter((message) => message.role === "custom").length, 1);
  assert.equal(JSON.stringify(host.requests.at(-1)).split("<goal_internal_context ").length - 1, 1);
});

test("an older objective editor cannot overwrite a cleared and replaced goal", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    noTools: "builtin",
    persistSession: true,
  });
  await host.session.prompt("/goal create Original goal");
  await host.session.prompt("/goal pause");
  const editing = host.session.prompt("/goal edit");
  await t.waitFor(async () => assert.match(await host.frame(), /Goal objective/));
  await host.key("\x15");
  await host.type("Stale objective");
  await host.session.prompt("/goal clear");
  await host.session.prompt("/goal create Replacement goal");
  await host.session.prompt("/goal pause");
  await host.key("\r");
  await editing;
  assert.match(await host.frame(), /The goal changed while this control was open/);
  const current = await call(host, "get_goal");
  assert.equal(current.goal.objective, "Replacement goal");
  assert.equal(current.goal.status, "paused");
});

test("a session switch cancels a pending goal picker without changing the new session", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    noTools: "builtin",
    persistSession: true,
  });
  await host.session.prompt("/goal create Original session goal");
  await host.session.prompt("/goal pause");
  const selecting = host.session.prompt("/goal");
  await t.waitFor(async () => assert.match(await host.frame(), /Goal controls/));
  await host.runtime.newSession();
  await selecting;
  await host.session.prompt("/goal create New session goal");
  const current = await call(host, "get_goal");
  await host.session.prompt("/goal pause");
  assert.equal(current.goal.objective, "New session goal");
  assert.equal(current.goal.status, "active");
});

test("native programmatic updates preserve completion values and reject invalid or absent-goal updates", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    extensionFactories: [createCodemodeExtension({ models: false })],
    tools: ["codemode", "create_goal", "get_goal", "update_goal"],
    persistSession: true,
  });
  host.queueResponse(
    ...response("codemode", {
      code: `
    const created = await tools.create_goal({ objective: "Finish the nested lifecycle", token_budget: "9223372036854775807" });
    const paused = await tools.update_goal({ status: "paused" });
    const invalid = await Promise.allSettled([tools.update_goal({ status: "active" })]);
    const completed = await tools.update_goal({ status: "complete" });
    const empty = await tools.get_goal({});
    const absent = await Promise.allSettled([tools.update_goal({ status: "blocked" })]);
    text({ created, paused, completed, empty, failures: [invalid[0], absent[0]].map(value => ({
      status: value.status, type: typeof value.reason, message: value.reason.message
    })) });
  `,
    }),
  );
  await host.session.prompt(
    "Create, pause, and complete the explicitly authorized goal, then inspect current state",
  );
  assert.equal(lastResult(host).isError, false, lastResult(host).text);
  const result = host.session.messages.findLast((message) => message.role === "toolResult");
  assert(result?.role === "toolResult");
  const content = result.content.at(-1);
  assert(content?.type === "text");
  const values = JSON.parse(content.text);
  assert.equal(values.paused.goal.status, "paused");
  assert.equal(values.completed.goal.status, "complete");
  assert.equal(values.completed.goal.tokenBudget, "9223372036854775807");
  assert.equal(values.completed.remainingTokens, "9223372036854775807");
  assert.equal(values.completed.goal.createdAt, values.created.goal.createdAt);
  assert.match(values.completed.completionBudgetReport, /report/i);
  assert.equal(values.empty.goal, null);
  assert.deepEqual(
    values.failures.map((failure: { status: string; type: string }) => [
      failure.status,
      failure.type,
    ]),
    [
      ["rejected", "object"],
      ["rejected", "object"],
    ],
  );
  assert.match(values.failures[0].message, /^Validation failed for tool "update_goal":/);
  assert.match(values.failures[1].message, /no goal exists/);
});

test("a restored unbounded goal reports elapsed completion time without adding a budget", async (t) => {
  let now = 1_000_000_000n;
  t.mock.method(process.hrtime, "bigint", () => now);
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    noTools: "builtin",
    persistSession: true,
    headless: true,
  });
  await call(host, "create_goal", {
    objective: "Finish the unbounded objective",
  });
  now += 17_000_000_000n;
  await host.session.prompt("/goal pause");
  const sessionFile = host.session.sessionManager.getSessionFile();
  assert(sessionFile);
  await host.close();
  now += 3_600_000_000_000n;
  const reopened = await openNativeHost(t, {
    directory: host.directory,
    sessionFile,
    extensionPaths: [extension],
    noTools: "builtin",
    headless: true,
  });
  const completed = await call(reopened, "update_goal", { status: "complete" });
  assert.equal("tokenBudget" in completed.goal, false);
  assert.equal(completed.goal.timeUsedSeconds, 17);
  assert.match(completed.completionBudgetReport, /goal\.timeUsedSeconds/);
  assert.equal((await call(reopened, "get_goal")).completionBudgetReport, null);
});
