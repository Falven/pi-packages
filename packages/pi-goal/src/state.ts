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

type GoalRow = Omit<Goal, "tokenBudget"> & {
  generation: string
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
    const statement = this.database.prepare(
      "SELECT * FROM goals WHERE threadId = ?",
    )
    statement.setReadBigInts(true)
    const row = statement.get(threadId) as GoalRow | undefined
    if (!row) return null
    return {
      threadId: row.threadId,
      objective: row.objective,
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

export function goalResult(goal: Goal | null) {
  const remainder =
    goal?.tokenBudget === undefined ? null : goal.tokenBudget - goal.tokensUsed
  const result = {
    goal,
    remainingTokens: remainder !== null && remainder < 0n ? 0n : remainder,
    completionBudgetReport: null,
  }
  const rawJSON = (JSON as typeof JSON & { rawJSON(value: string): unknown })
    .rawJSON
  const text = JSON.stringify(result, (_key, value) =>
    typeof value === "bigint" ? rawJSON(value.toString()) : value,
  )
  return {
    content: [{ type: "text" as const, text }],
    structuredContent: JSON.parse(text),
    details: undefined,
  }
}
