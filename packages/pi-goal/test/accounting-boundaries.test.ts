import assert from "node:assert/strict";
import { mkdirSync, renameSync, rmSync } from "node:fs";
import test, { type TestContext } from "node:test";
import { openNativeHost, type NativeHostOptions } from "../../../fixtures/native-host.ts";
import { GoalAccounting, reportedTokens } from "../src/accounting.ts";
import { GoalStore, goalResult } from "../src/state.ts";

async function storeFor(
  t: TestContext,
  options: Pick<NativeHostOptions, "directory" | "sessionFile"> = {},
) {
  let store: GoalStore | undefined;
  const host = await openNativeHost(t, {
    ...options,
    persistSession: true,
    headless: true,
    noTools: "builtin",
    extensionFactories: [
      (pi) => {
        pi.on("session_start", (_event, ctx) => {
          store = new GoalStore(pi, ctx.sessionManager, () => {});
        });
      },
    ],
  });
  assert(store);
  return { store, host, threadId: host.session.sessionManager.getSessionId() };
}

test("safe reported components retain an exact total beyond numeric precision", async (t) => {
  const { store, threadId } = await storeFor(t);
  const accounting = new GoalAccounting(() => 0n);
  accounting.record(123n);
  const goal = store.create(threadId, "Keep the complete reported total", 9223372036854775807n);
  accounting.start(goal);
  accounting.record(
    reportedTokens({
      input: 9007199254740991,
      cacheWrite: 9007199254740991,
      output: 9007199254740991,
    }),
  );
  const current = accounting.checkpoint(store, goal.threadId, "active", true);
  assert.equal(current?.tokensUsed, 27021597764222973n);
  const result = goalResult(store.read(goal.threadId));
  assert.equal(result.structuredContent.goal?.tokensUsed, "27021597764222973");
  assert.equal(result.structuredContent.remainingTokens, "9196350439090552834");
  assert(result.content[0]);
  assert.deepEqual(JSON.parse(result.content[0].text), result.structuredContent);
  assert.equal(accounting.checkpoint(store, goal.threadId, "active", true), null);
});

test("token overflow preserves the stored maximum and the pending baseline", async (t) => {
  const { store, threadId } = await storeFor(t);
  const accounting = new GoalAccounting(() => 0n);
  const goal = store.create(threadId, "Preserve the complete integer allowance");
  accounting.start(goal);
  accounting.record(9223372036854775807n);
  const full = accounting.checkpoint(store, goal.threadId, "active", true);
  assert.equal(full?.tokensUsed, 9223372036854775807n);
  assert.equal(goalResult(full).structuredContent.goal?.tokensUsed, "9223372036854775807");
  accounting.record(1n);
  assert.throws(
    () => accounting.checkpoint(store, goal.threadId, "active", true),
    /Goal accounting exceeds the nonnegative integer range/,
  );
  assert.deepEqual(store.read(goal.threadId), full);
  assert.throws(
    () => accounting.checkpoint(store, goal.threadId, "active", true),
    /Goal accounting exceeds the nonnegative integer range/,
  );
  assert.deepEqual(store.read(goal.threadId), full);
  assert.equal(store.failed, false);
});

test("elapsed overflow preserves the full integer clock and uncommitted progress", async (t) => {
  const { store, threadId } = await storeFor(t);
  let now = 0n;
  const accounting = new GoalAccounting(() => now);
  const goal = store.create(threadId, "Preserve elapsed pursuit exactly");
  accounting.start(goal);
  now = 9223372036854775807_000000000n;
  const full = accounting.checkpoint(store, goal.threadId, "active", true);
  assert.equal(full?.timeUsedSeconds, 9223372036854775807n);
  assert.equal(goalResult(full).structuredContent.goal?.timeUsedSeconds, "9223372036854775807");
  now = 9223372036854775808_000000000n;
  accounting.record(3n);
  assert.throws(
    () => accounting.checkpoint(store, goal.threadId, "active", true),
    /Goal accounting exceeds the nonnegative integer range/,
  );
  assert.deepEqual(store.read(goal.threadId), full);
  assert.throws(
    () => accounting.checkpoint(store, goal.threadId, "active", true),
    /Goal accounting exceeds the nonnegative integer range/,
  );
  assert.deepEqual(store.read(goal.threadId), full);
  assert.equal(store.failed, false);
});

test("a failed native checkpoint stops retries and reopening restores only saved usage", async (t) => {
  const { store, host, threadId } = await storeFor(t);
  await host.session.prompt("Save the conversation before measuring usage.");
  let now = 0n;
  const accounting = new GoalAccounting(() => now);
  const goal = store.create(threadId, "Recover saved progress");
  accounting.start(goal);
  accounting.record(7n);
  now = 500_000_000n;
  const saved = accounting.checkpoint(store, threadId, "active", true);
  assert.equal(saved?.tokensUsed, 7n);
  assert.equal(saved?.timeUsedSeconds, 0n);
  accounting.record(11n);
  now = 1_250_000_000n;
  const path = host.session.sessionManager.getSessionFile();
  assert(path);
  const backup = `${path}.saved`;
  renameSync(path, backup);
  mkdirSync(path);
  try {
    assert.throws(
      () => accounting.checkpoint(store, threadId, "active", true),
      /EISDIR.*Reopen the saved session/,
    );
  } finally {
    rmSync(path, { recursive: true });
    renameSync(backup, path);
  }
  assert.equal(store.failed, true);
  assert.throws(() => store.read(threadId), /Reopen the saved session/);
  now = 1_750_000_000n;
  accounting.record(4n);
  assert.throws(
    () => accounting.checkpoint(store, threadId, "active", true),
    /Goal storage is unavailable.*Reopen the saved session/,
  );
  await host.close();
  const reopened = await storeFor(t, {
    directory: host.directory,
    sessionFile: path,
  });
  const restored = reopened.store.read(threadId);
  assert.deepEqual(restored, saved);
  assert(restored);
  now = 100_000_000_000n;
  const resumed = new GoalAccounting(() => now);
  resumed.start(restored);
  resumed.record(3n);
  now = 101_250_000_000n;
  const current = resumed.checkpoint(reopened.store, threadId, "active", true);
  assert.equal(current?.tokensUsed, 10n);
  assert.equal(current?.timeUsedSeconds, 1n);
  now = 102_000_000_000n;
  const carried = resumed.checkpoint(reopened.store, threadId, "active", true);
  assert.equal(carried?.tokensUsed, 10n);
  assert.equal(carried?.timeUsedSeconds, 2n);
  assert.equal(resumed.checkpoint(reopened.store, threadId, "active", true), null);
});

test("stale checkpoints protect other sessions and replacements without discarding later reports", async (t) => {
  const { store, threadId } = await storeFor(t);
  const independent = await storeFor(t);
  let now = 0n;
  const accounting = new GoalAccounting(() => now);
  const original = store.create(threadId, "Account only for this goal");
  const other = independent.store.create(independent.threadId, "Keep independent usage");
  accounting.start(original);
  accounting.record(7n);
  now = 1_200_000_000n;
  assert.equal(accounting.checkpoint(store, other.threadId, "active", true), null);
  assert.equal(
    store.account({ threadId: other.threadId, generation: original.generation }, 17n, 2n, "active"),
    null,
  );
  assert.deepEqual(store.read(original.threadId), original);
  assert.deepEqual(independent.store.read(other.threadId), other);
  const first = accounting.checkpoint(store, original.threadId, "active", true);
  assert.equal(first?.tokensUsed, 7n);
  assert.equal(first?.timeUsedSeconds, 1n);

  store.update(original, "complete");
  const replacement = store.create(original.threadId, "Pursue the replacement");
  accounting.record(11n);
  now = 2_200_000_000n;
  assert.equal(accounting.checkpoint(store, original.threadId, "active", true), null);
  assert.deepEqual(store.read(replacement.threadId), replacement);
  accounting.activate(replacement);
  accounting.record(13n);
  const current = accounting.checkpoint(store, replacement.threadId, "active", true);
  assert.equal(current?.tokensUsed, 13n);
  assert.equal(current?.timeUsedSeconds, 0n);
  assert.equal(current?.generation, replacement.generation);
  assert.deepEqual(independent.store.read(other.threadId), other);
});

test("active edits preserve the usage baseline and fractional elapsed carry", async (t) => {
  const { store, threadId } = await storeFor(t);
  let now = 0n;
  const accounting = new GoalAccounting(() => now);
  const goal = store.create(threadId, "Finish the original objective");
  accounting.start(goal);
  accounting.record(7n);
  now = 750_000_000n;
  const prepared = accounting.checkpoint(store, goal.threadId, "active", false);
  assert.equal(prepared?.tokensUsed, 7n);
  assert.equal(prepared?.timeUsedSeconds, 0n);
  const edited = store.update(goal, "active", "Finish the revised objective");
  accounting.applyExternal(edited);

  now = 1_250_000_000n;
  accounting.record(3n);
  const first = accounting.checkpoint(store, goal.threadId, "active", true);
  assert.equal(first?.tokensUsed, 10n);
  assert.equal(first?.timeUsedSeconds, 1n);
  assert.equal(first?.objective, "Finish the revised objective");
  now = 1_900_000_000n;
  accounting.record(2n);
  const second = accounting.checkpoint(store, goal.threadId, "active", true);
  assert.equal(second?.tokensUsed, 12n);
  assert.equal(second?.timeUsedSeconds, 1n);
  now = 2_050_000_000n;
  const third = accounting.checkpoint(store, goal.threadId, "active", true);
  assert.equal(third?.tokensUsed, 12n);
  assert.equal(third?.timeUsedSeconds, 2n);
});

test("pause and resume exclude downtime and reports already received while paused", async (t) => {
  const { store, threadId } = await storeFor(t);
  let now = 0n;
  const accounting = new GoalAccounting(() => now);
  const goal = store.create(threadId, "Count only active pursuit");
  accounting.start(goal);
  accounting.record(3n);
  now = 1_000_000_000n;
  const prepared = accounting.checkpoint(store, goal.threadId, "active", false);
  assert.equal(prepared?.tokensUsed, 3n);
  assert.equal(prepared?.timeUsedSeconds, 1n);
  const paused = store.update(goal, "paused");
  accounting.applyExternal(paused);

  now = 101_000_000_000n;
  accounting.record(50n);
  assert.equal(accounting.checkpoint(store, goal.threadId, "active", true), null);
  assert.deepEqual(store.read(goal.threadId), paused);
  const resumed = store.update(paused, "active");
  accounting.applyExternal(resumed);
  now = 102_000_000_000n;
  accounting.record(5n);
  const current = accounting.checkpoint(store, goal.threadId, "active", true);
  assert.equal(current?.tokensUsed, 8n);
  assert.equal(current?.timeUsedSeconds, 2n);
  assert.equal(current?.status, "active");
});

test("finishing an outer run retains the active clock until an external pause", async (t) => {
  const { store, threadId } = await storeFor(t);
  let now = 0n;
  const accounting = new GoalAccounting(() => now);
  const goal = store.create(threadId, "Retain the active pursuit clock");
  accounting.start(goal);
  now = 400_000_000n;
  assert.equal(accounting.checkpoint(store, goal.threadId, "active", false), null);
  accounting.finish();

  now = 2_200_000_000n;
  assert.deepEqual(store.read(goal.threadId), goal);
  const prepared = accounting.checkpoint(store, goal.threadId, "active", false);
  assert.equal(prepared?.tokensUsed, 0n);
  assert.equal(prepared?.timeUsedSeconds, 2n);
  const paused = store.update(goal, "paused");
  accounting.applyExternal(paused);
  now = 3_400_000_000n;
  assert.equal(accounting.checkpoint(store, goal.threadId, "active", false), null);
  assert.deepEqual(store.read(goal.threadId), paused);
  assert.equal(paused.timeUsedSeconds, 2n);
});

test("only a nonzero external checkpoint clears exhausted in-flight accounting", async (t) => {
  const { store, threadId } = await storeFor(t);
  let now = 0n;
  const accounting = new GoalAccounting(() => now);
  const goal = store.create(threadId, "Account until the effective cutoff", 100n);
  accounting.start(goal);
  accounting.record(184n);
  const exhausted = accounting.checkpoint(store, goal.threadId, "active", true);
  assert.equal(exhausted?.tokensUsed, 184n);
  assert.equal(exhausted?.status, "budgetLimited");

  assert.equal(accounting.checkpoint(store, goal.threadId, "active", false), null);
  const unchanged = store.update(goal, "paused");
  assert.equal(unchanged.status, "budgetLimited");
  accounting.applyExternal(unchanged);
  accounting.record(92n);
  const continued = accounting.checkpoint(store, goal.threadId, "active", true);
  assert.equal(continued?.tokensUsed, 276n);
  assert.equal(continued?.timeUsedSeconds, 0n);

  now = 1_200_000_000n;
  const prepared = accounting.checkpoint(store, goal.threadId, "active", false);
  assert.equal(prepared?.tokensUsed, 276n);
  assert.equal(prepared?.timeUsedSeconds, 1n);
  const stopped = store.update(goal, "paused");
  assert.equal(stopped.status, "budgetLimited");
  accounting.applyExternal(stopped);
  accounting.record(92n);
  now = 2_400_000_000n;
  assert.equal(accounting.checkpoint(store, goal.threadId, "active", true), null);
  assert.deepEqual(store.read(goal.threadId), stopped);
});
