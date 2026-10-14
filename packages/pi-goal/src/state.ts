import { DatabaseSync } from "node:sqlite"
import { randomUUID } from "node:crypto"

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

type GoalRow = Omit<Goal, "objective" | "tokenBudget"> & {
  objective: Uint8Array
  tokenBudget: bigint | null
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

  read(threadId: string): Goal | null {
    // Byte reads preserve embedded NULs on runtimes that truncate text reads.
    const statement = this.database.prepare(`
      SELECT threadId, CAST(objective AS BLOB) AS objective, status, tokenBudget,
             tokensUsed, timeUsedSeconds, createdAt, updatedAt
      FROM goals WHERE threadId = ?
    `)
    statement.setReadBigInts(true)
    const row = statement.get(threadId) as GoalRow | undefined
    if (!row) return null
    return {
      threadId: row.threadId,
      objective: Buffer.from(row.objective).toString("utf8"),
      status: row.status,
      ...(row.tokenBudget === null ? {} : { tokenBudget: row.tokenBudget }),
      tokensUsed: row.tokensUsed,
      timeUsedSeconds: row.timeUsedSeconds,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }
  }

  create(threadId: string, objective: string, tokenBudget?: bigint): Goal {
    const now = BigInt(Math.floor(Date.now() / 1000))
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
      randomUUID(),
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
      objective,
      status: "active",
      ...(tokenBudget === undefined ? {} : { tokenBudget }),
      tokensUsed: 0n,
      timeUsedSeconds: 0n,
      createdAt: now,
      updatedAt: now,
    }
  }

  close(): void {
    this.database.close()
  }
}

function integer(value: bigint): number | string {
  const number = Number(value)
  return Number.isSafeInteger(number) ? number : value.toString()
}

export function goalResult(goal: Goal | null) {
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
    completionBudgetReport: null,
  }
  return {
    content: [{ type: "text" as const, text: JSON.stringify(result) }],
    structuredContent: result,
    details: undefined,
  }
}
