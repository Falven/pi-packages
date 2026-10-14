import { DatabaseSync } from "node:sqlite"
import { randomUUID } from "node:crypto"
import type { AccountingMode, GoalIdentity } from "./accounting.ts"

export type Goal = {
  threadId: string
  objective: string
  status:
    | "active"
    | "paused"
    | "blocked"
    | "usageLimited"
    | "budgetLimited"
    | "complete"
  tokenBudget?: bigint
  tokensUsed: bigint
  timeUsedSeconds: bigint
  createdAt: bigint
  updatedAt: bigint
}

export type StoredGoal = Goal & { generation: string }

type GoalRow = Omit<StoredGoal, "objective" | "tokenBudget"> & {
  objective: Uint8Array
  tokenBudget: bigint | null
}

function decode(row: GoalRow): StoredGoal {
  return {
    threadId: row.threadId,
    generation: row.generation,
    objective: Buffer.from(row.objective).toString("utf8"),
    status: row.status,
    ...(row.tokenBudget === null ? {} : { tokenBudget: row.tokenBudget }),
    tokensUsed: row.tokensUsed,
    timeUsedSeconds: row.timeUsedSeconds,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export class GoalStore {
  private readonly database: DatabaseSync

  constructor(path: string) {
    this.database = new DatabaseSync(path)
    try {
      this.database.exec(`
      CREATE TABLE IF NOT EXISTS goals (
        threadId TEXT PRIMARY KEY,
        generation TEXT NOT NULL,
        objective TEXT NOT NULL,
        status TEXT NOT NULL,
        tokenBudget INTEGER,
        tokensUsed INTEGER NOT NULL,
        timeUsedSeconds INTEGER NOT NULL,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL
      );
      `)
    } catch (error) {
      this.database.close()
      throw error
    }
  }

  read(threadId: string): StoredGoal | null {
    // Byte reads preserve embedded NULs on runtimes that truncate text reads.
    const statement = this.database.prepare(`
      SELECT threadId, generation, CAST(objective AS BLOB) AS objective, status, tokenBudget,
             tokensUsed, timeUsedSeconds, createdAt, updatedAt
      FROM goals WHERE threadId = ?
    `)
    statement.setReadBigInts(true)
    const row = statement.get(threadId) as GoalRow | undefined
    if (!row) return null
    return decode(row)
  }

  create(
    threadId: string,
    objective: string,
    tokenBudget?: bigint,
  ): StoredGoal {
    const now = BigInt(Math.floor(Date.now() / 1000))
    const generation = randomUUID()
    const statement = this.database.prepare(`
      INSERT INTO goals VALUES (?, ?, ?, 'active', ?, 0, 0, ?, ?)
      ON CONFLICT(threadId) DO UPDATE SET
        generation = excluded.generation,
        objective = excluded.objective,
        status = excluded.status,
        tokenBudget = excluded.tokenBudget,
        tokensUsed = 0,
        timeUsedSeconds = 0,
        createdAt = excluded.createdAt,
        updatedAt = excluded.updatedAt
      WHERE goals.status = 'complete'
    `)
    const changed = statement.run(
      threadId,
      generation,
      objective,
      tokenBudget ?? null,
      now,
      now,
    ).changes
    if (!changed) {
      throw new Error(
        "cannot create a new goal because this thread has an unfinished goal; complete the existing goal first",
      )
    }
    return {
      threadId,
      generation,
      objective,
      status: "active",
      ...(tokenBudget === undefined ? {} : { tokenBudget }),
      tokensUsed: 0n,
      timeUsedSeconds: 0n,
      createdAt: now,
      updatedAt: now,
    }
  }

  update(
    goal: StoredGoal,
    status: "active" | "paused" | "blocked" | "complete",
    objective?: string,
  ): StoredGoal {
    const statement = this.database.prepare(`
      UPDATE goals SET status = CASE
        WHEN ? = 'complete' THEN 'complete'
        WHEN tokenBudget IS NOT NULL AND tokensUsed >= tokenBudget THEN 'budgetLimited'
        ELSE ? END,
        objective = COALESCE(?, objective), updatedAt = ?
      WHERE threadId = ? AND generation = ?
      RETURNING threadId, generation, CAST(objective AS BLOB) AS objective,
                status, tokenBudget, tokensUsed, timeUsedSeconds, createdAt, updatedAt
    `)
    statement.setReadBigInts(true)
    const row = statement.get(
      status,
      status,
      objective ?? null,
      BigInt(Math.floor(Date.now() / 1000)),
      goal.threadId,
      goal.generation,
    ) as GoalRow | undefined
    if (!row)
      throw new Error(
        "the goal changed while this action was pending; inspect the current goal and try again",
      )
    return decode(row)
  }

  account(
    goal: GoalIdentity,
    tokens: bigint,
    seconds: bigint,
    mode: AccountingMode,
  ): StoredGoal | null {
    const maximum = 9223372036854775807n
    if (tokens < 0n || seconds < 0n || tokens > maximum || seconds > maximum)
      throw new Error("Goal accounting exceeds the nonnegative integer range")
    const statuses =
      mode === "complete"
        ? "'active', 'budgetLimited', 'complete'"
        : mode === "stopped"
          ? "'active', 'budgetLimited', 'paused', 'blocked', 'usageLimited'"
          : "'active', 'budgetLimited'"
    const statement = this.database.prepare(`
      UPDATE goals SET
        tokensUsed = tokensUsed + ?, timeUsedSeconds = timeUsedSeconds + ?,
        status = CASE
          WHEN ${mode === "stopped" ? "status != 'complete'" : "status = 'active'"}
            AND tokenBudget IS NOT NULL AND tokensUsed + ? >= tokenBudget
          THEN 'budgetLimited' ELSE status END,
        updatedAt = ?
      WHERE threadId = ? AND generation = ? AND status IN (${statuses})
        AND tokensUsed <= ? AND timeUsedSeconds <= ?
      RETURNING threadId, generation, CAST(objective AS BLOB) AS objective,
                status, tokenBudget, tokensUsed, timeUsedSeconds, createdAt, updatedAt
    `)
    statement.setReadBigInts(true)
    const row = statement.get(
      tokens,
      seconds,
      tokens,
      BigInt(Math.floor(Date.now() / 1000)),
      goal.threadId,
      goal.generation,
      maximum - tokens,
      maximum - seconds,
    ) as GoalRow | undefined
    if (row) return decode(row)
    const current = this.read(goal.threadId)
    if (
      current?.generation === goal.generation &&
      (current.tokensUsed > maximum - tokens ||
        current.timeUsedSeconds > maximum - seconds)
    )
      throw new Error("Goal accounting exceeds the nonnegative integer range")
    return null
  }

  clear(goal: StoredGoal): void {
    this.database
      .prepare("DELETE FROM goals WHERE threadId = ? AND generation = ?")
      .run(goal.threadId, goal.generation)
  }

  close(): void {
    this.database.close()
  }
}

function integer(value: bigint): number | string {
  const number = Number(value)
  return Number.isSafeInteger(number) ? number : value.toString()
}

export function goalResult(goal: Goal | null, completing = false) {
  const remainder =
    goal?.tokenBudget === undefined ? null : goal.tokenBudget - goal.tokensUsed
  const result = {
    goal: goal && {
      threadId: goal.threadId,
      objective: goal.objective,
      status: goal.status,
      ...(goal.tokenBudget === undefined
        ? {}
        : { tokenBudget: integer(goal.tokenBudget) }),
      tokensUsed: integer(goal.tokensUsed),
      timeUsedSeconds: integer(goal.timeUsedSeconds),
      createdAt: integer(goal.createdAt),
      updatedAt: integer(goal.updatedAt),
    },
    remainingTokens:
      remainder === null ? null : integer(remainder < 0n ? 0n : remainder),
    completionBudgetReport:
      completing &&
      goal?.status === "complete" &&
      (goal.tokenBudget !== undefined || goal.timeUsedSeconds > 0n)
        ? "Report completion using the usage in this result. When goal.tokenBudget is present, report goal.tokensUsed against that allowance. When goal.timeUsedSeconds is positive, express the elapsed time briefly in the response language."
        : null,
  }
  return {
    content: [{ type: "text" as const, text: JSON.stringify(result) }],
    structuredContent: result,
    details: undefined,
  }
}
