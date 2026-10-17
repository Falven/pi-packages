import type { GoalStore, StoredGoal } from "./state.ts";

export type GoalIdentity = Pick<StoredGoal, "threadId" | "generation">;
export type AccountingMode = "active" | "complete" | "stopped";

export function reportedTokens(usage: {
  input: number;
  cacheWrite: number;
  output: number;
}): bigint {
  let total = 0n;
  for (const value of [usage.input, usage.cacheWrite, usage.output]) {
    if (!Number.isSafeInteger(value) || value < 0)
      throw new Error("Reported goal usage must contain nonnegative safe integers");
    total += BigInt(value);
  }
  return total;
}

function sameGoal(left: GoalIdentity | undefined, right: GoalIdentity) {
  return left?.threadId === right.threadId && left.generation === right.generation;
}

export class GoalAccounting {
  private observed = 0n;
  private accounted = 0n;
  private active: GoalIdentity | undefined;
  private accountedAt = 0n;
  private inTurn = false;
  private turnGoal: GoalIdentity | undefined;
  private readonly now: () => bigint;

  constructor(now: () => bigint = process.hrtime.bigint) {
    this.now = now;
  }

  get currentGoal(): GoalIdentity | undefined {
    return this.turnGoal;
  }

  get activeGoal(): GoalIdentity | undefined {
    return this.active;
  }

  record(tokens: bigint): void {
    if (tokens < 0n) throw new Error("Goal usage cannot be negative");
    this.observed += tokens;
  }

  start(goal: StoredGoal | null): void {
    // Native retries can emit agent_start again before the outer run settles.
    if (this.inTurn) return;
    this.inTurn = true;
    if (goal?.status === "active") this.activate(goal);
  }

  activate(goal: StoredGoal): void {
    if (!sameGoal(this.active, goal)) {
      this.accounted = this.observed;
      this.accountedAt = this.now();
    }
    this.active = { threadId: goal.threadId, generation: goal.generation };
    if (this.inTurn) this.turnGoal = this.active;
  }

  applyExternal(goal: StoredGoal | null): void {
    if (goal?.status === "active") this.activate(goal);
    else if (goal?.status !== "budgetLimited" || !this.inTurn) this.clear();
  }

  checkpoint(
    store: GoalStore,
    threadId: string,
    mode: AccountingMode,
    keepBudgetLimited: boolean,
  ): StoredGoal | null {
    const owner = this.inTurn ? this.turnGoal : this.active;
    if (!owner || owner.threadId !== threadId) return null;
    const tokens = this.observed - this.accounted;
    const seconds = (this.now() - this.accountedAt) / 1_000_000_000n;
    if (tokens === 0n && seconds === 0n) return null;
    // Synchronous appends serialize snapshots and baseline commits.
    const goal = store.account(owner, tokens, seconds, mode);
    if (!goal) return null;
    this.accounted = this.observed;
    this.accountedAt += seconds * 1_000_000_000n;
    if (goal.status !== "active" && !(keepBudgetLimited && goal.status === "budgetLimited"))
      this.clear();
    return goal;
  }

  finish(): void {
    this.inTurn = false;
    this.turnGoal = undefined;
  }

  clear(): void {
    this.active = undefined;
    this.turnGoal = undefined;
  }
}
