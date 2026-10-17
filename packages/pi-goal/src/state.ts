import { randomUUID } from "node:crypto";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { AccountingMode, GoalIdentity } from "./accounting.ts";

export type Goal = {
  threadId: string;
  objective: string;
  status: "active" | "paused" | "blocked" | "usageLimited" | "budgetLimited" | "complete";
  tokenBudget?: bigint;
  tokensUsed: bigint;
  timeUsedSeconds: bigint;
  createdAt: bigint;
  updatedAt: bigint;
};

export type StoredGoal = Goal & { generation: string };

const entryType = "pi-goal.state";
const maximum = 9223372036854775807n;
const statuses = new Set<Goal["status"]>([
  "active",
  "paused",
  "blocked",
  "usageLimited",
  "budgetLimited",
  "complete",
]);

// Retaining reload reuses the manager, including its failed in-memory appends.
const failedManagersKey = Symbol.for("pi-goal:failed-managers");
const processState = globalThis as typeof globalThis & {
  [failedManagersKey]?: WeakSet<ExtensionContext["sessionManager"]>;
};
const failedManagers = (processState[failedManagersKey] ??= new WeakSet());
const recovery =
  "Automatic goal pursuit is stopped. Reopen the saved session to recover saved state.";

function integerField(value: unknown, name: string, positive = false): bigint {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]*)$/.test(value))
    throw new Error(`invalid goal snapshot: ${name}`);
  const parsed = BigInt(value);
  if (parsed > maximum || (positive && parsed === 0n))
    throw new Error(`invalid goal snapshot: ${name}`);
  return parsed;
}

function decode(data: unknown, threadId: string): StoredGoal | null {
  if (!data || typeof data !== "object" || Array.isArray(data))
    throw new Error("invalid goal snapshot");
  const record = data as Record<string, unknown>;
  if (record["threadId"] !== threadId) throw new Error("invalid goal snapshot: owner");
  if (record["clear"] === true) {
    if (Object.keys(record).length !== 2) throw new Error("invalid goal snapshot: clear");
    return null;
  }
  if (
    typeof record["generation"] !== "string" ||
    !record["generation"] ||
    typeof record["objective"] !== "string" ||
    !record["objective"] ||
    !record["objective"].isWellFormed() ||
    record["objective"].replace(/^\p{White_Space}+|\p{White_Space}+$/gu, "") !==
      record["objective"] ||
    [...record["objective"]].length > 4000 ||
    typeof record["status"] !== "string" ||
    !statuses.has(record["status"] as Goal["status"]) ||
    Object.keys(record).some(
      (key) =>
        ![
          "threadId",
          "generation",
          "objective",
          "status",
          "tokenBudget",
          "tokensUsed",
          "timeUsedSeconds",
          "createdAt",
          "updatedAt",
        ].includes(key),
    )
  )
    throw new Error("invalid goal snapshot");
  const tokenBudget =
    record["tokenBudget"] === undefined
      ? undefined
      : integerField(record["tokenBudget"], "tokenBudget", true);
  return {
    threadId,
    generation: record["generation"],
    objective: record["objective"],
    status: record["status"] as Goal["status"],
    ...(tokenBudget === undefined ? {} : { tokenBudget }),
    tokensUsed: integerField(record["tokensUsed"], "tokensUsed"),
    timeUsedSeconds: integerField(record["timeUsedSeconds"], "timeUsedSeconds"),
    createdAt: integerField(record["createdAt"], "createdAt"),
    updatedAt: integerField(record["updatedAt"], "updatedAt"),
  };
}

export class GoalStore {
  constructor(
    private readonly pi: ExtensionAPI,
    private readonly sessionManager: ExtensionContext["sessionManager"],
    private readonly onFailure: () => void,
  ) {}

  get failed(): boolean {
    return failedManagers.has(this.sessionManager);
  }

  private access<T>(operation: () => T): T {
    if (this.failed) {
      this.onFailure();
      throw new Error(`Goal storage is unavailable for this session. ${recovery}`);
    }
    try {
      return operation();
    } catch (error) {
      failedManagers.add(this.sessionManager);
      this.onFailure();
      throw new Error(
        `Goal storage failed: ${error instanceof Error ? error.message : String(error)}. ${recovery}`,
        { cause: error },
      );
    }
  }

  read(threadId: string): StoredGoal | null {
    if (threadId !== this.sessionManager.getSessionId()) throw new Error("goal session changed");
    return this.access(() => {
      let latest: unknown;
      let found = false;
      for (const entry of this.sessionManager.getEntries()) {
        if (entry.type !== "custom" || entry.customType !== entryType) continue;
        const data = entry.data;
        if (
          data &&
          typeof data === "object" &&
          !Array.isArray(data) &&
          typeof (data as { threadId?: unknown }).threadId === "string" &&
          (data as { threadId: string }).threadId !== threadId
        )
          continue;
        latest = data;
        found = true;
      }
      return found ? decode(latest, threadId) : null;
    });
  }

  private append(goal: StoredGoal): StoredGoal {
    if (goal.threadId !== this.sessionManager.getSessionId())
      throw new Error("goal session changed");
    const data = {
      threadId: goal.threadId,
      generation: goal.generation,
      objective: goal.objective,
      status: goal.status,
      ...(goal.tokenBudget === undefined ? {} : { tokenBudget: goal.tokenBudget.toString() }),
      tokensUsed: goal.tokensUsed.toString(),
      timeUsedSeconds: goal.timeUsedSeconds.toString(),
      createdAt: goal.createdAt.toString(),
      updatedAt: goal.updatedAt.toString(),
    };
    decode(data, goal.threadId);
    this.access(() => this.pi.appendEntry(entryType, data));
    return goal;
  }

  create(threadId: string, objective: string, tokenBudget?: bigint): StoredGoal {
    const current = this.read(threadId);
    if (current && current.status !== "complete")
      throw new Error(
        "cannot create a new goal because this thread has an unfinished goal; complete the existing goal first",
      );
    const now = BigInt(Math.floor(Date.now() / 1000));
    return this.append({
      threadId,
      generation: randomUUID(),
      objective,
      status: "active",
      ...(tokenBudget === undefined ? {} : { tokenBudget }),
      tokensUsed: 0n,
      timeUsedSeconds: 0n,
      createdAt: now,
      updatedAt: now,
    });
  }

  update(
    goal: StoredGoal,
    status: "active" | "paused" | "blocked" | "complete",
    objective?: string,
  ): StoredGoal {
    if (goal.threadId !== this.sessionManager.getSessionId())
      throw new Error(
        "the goal changed while this action was pending; inspect the current goal and try again",
      );
    const current = this.read(goal.threadId);
    if (!current || current.generation !== goal.generation)
      throw new Error(
        "the goal changed while this action was pending; inspect the current goal and try again",
      );
    return this.append({
      ...current,
      status:
        status !== "complete" &&
        current.tokenBudget !== undefined &&
        current.tokensUsed >= current.tokenBudget
          ? "budgetLimited"
          : status,
      objective: objective ?? current.objective,
      updatedAt: BigInt(Math.floor(Date.now() / 1000)),
    });
  }

  account(
    goal: GoalIdentity,
    tokens: bigint,
    seconds: bigint,
    mode: AccountingMode,
  ): StoredGoal | null {
    if (tokens < 0n || seconds < 0n || tokens > maximum || seconds > maximum)
      throw new Error("Goal accounting exceeds the nonnegative integer range");
    if (goal.threadId !== this.sessionManager.getSessionId()) return null;
    const current = this.read(goal.threadId);
    if (!current || current.generation !== goal.generation) return null;
    if (current.tokensUsed > maximum - tokens || current.timeUsedSeconds > maximum - seconds)
      throw new Error("Goal accounting exceeds the nonnegative integer range");
    const allowed =
      mode === "complete"
        ? ["active", "budgetLimited", "complete"]
        : mode === "stopped"
          ? ["active", "budgetLimited", "paused", "blocked", "usageLimited"]
          : ["active", "budgetLimited"];
    if (!allowed.includes(current.status)) return null;
    const tokensUsed = current.tokensUsed + tokens;
    return this.append({
      ...current,
      tokensUsed,
      timeUsedSeconds: current.timeUsedSeconds + seconds,
      status:
        (mode === "stopped" ? current.status !== "complete" : current.status === "active") &&
        current.tokenBudget !== undefined &&
        tokensUsed >= current.tokenBudget
          ? "budgetLimited"
          : current.status,
      updatedAt: BigInt(Math.floor(Date.now() / 1000)),
    });
  }

  stop(goal: GoalIdentity, status: "blocked" | "usageLimited"): StoredGoal | null {
    if (goal.threadId !== this.sessionManager.getSessionId()) return null;
    const current = this.read(goal.threadId);
    if (
      !current ||
      current.generation !== goal.generation ||
      (status === "blocked"
        ? current.status !== "active"
        : !["active", "budgetLimited"].includes(current.status))
    )
      return null;
    return this.append({
      ...current,
      status,
      updatedAt: BigInt(Math.floor(Date.now() / 1000)),
    });
  }

  clear(goal: StoredGoal): void {
    if (goal.threadId !== this.sessionManager.getSessionId()) return;
    const current = this.read(goal.threadId);
    if (current?.generation !== goal.generation) return;
    this.access(() => this.pi.appendEntry(entryType, { threadId: goal.threadId, clear: true }));
  }
}

function integer(value: bigint): number | string {
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : value.toString();
}

export function goalResult(goal: Goal | null, completing = false) {
  const remainder = goal?.tokenBudget === undefined ? null : goal.tokenBudget - goal.tokensUsed;
  const result = {
    goal: goal && {
      threadId: goal.threadId,
      objective: goal.objective,
      status: goal.status,
      ...(goal.tokenBudget === undefined ? {} : { tokenBudget: integer(goal.tokenBudget) }),
      tokensUsed: integer(goal.tokensUsed),
      timeUsedSeconds: integer(goal.timeUsedSeconds),
      createdAt: integer(goal.createdAt),
      updatedAt: integer(goal.updatedAt),
    },
    remainingTokens: remainder === null ? null : integer(remainder < 0n ? 0n : remainder),
    completionBudgetReport:
      completing &&
      goal?.status === "complete" &&
      (goal.tokenBudget !== undefined || goal.timeUsedSeconds > 0n)
        ? "Report completion using the usage in this result. When goal.tokenBudget is present, report goal.tokensUsed against that allowance. When goal.timeUsedSeconds is positive, express the elapsed time briefly in the response language."
        : null,
  };
  return {
    content: [{ type: "text" as const, text: JSON.stringify(result) }],
    structuredContent: result,
    details: undefined,
  };
}
