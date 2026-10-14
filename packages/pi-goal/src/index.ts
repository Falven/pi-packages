import { join } from "node:path"
import { stripVTControlCharacters } from "node:util"
import {
  getAgentDir,
  type ExtensionAPI,
  type ExtensionContext,
} from "@earendil-works/pi-coding-agent"
import { GoalStore, goalResult, type Goal } from "./state.ts"
import { goalArguments } from "./arguments.ts"

function displayObjective(objective: string): string {
  return stripVTControlCharacters(objective).replace(/\p{Cc}/gu, " ")
}

function present(ctx: ExtensionContext, goal: Goal | null) {
  ctx.ui.setStatus(
    "pi-goal",
    goal
      ? `Goal: ${goal.status} · ${displayObjective(goal.objective)}`
      : undefined,
  )
}

export default function piGoal(pi: ExtensionAPI): void {
  const parameters = {
    get_goal: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
    create_goal: {
      type: "object",
      properties: {
        objective: {
          type: "string",
          description:
            "Required. The complete objective to pursue. Creates an active goal, or replaces a completed goal.",
        },
        token_budget: {
          type: "integer",
          description:
            "Positive token allowance. Omit unless explicitly requested.",
        },
      },
      required: ["objective"],
      additionalProperties: false,
    },
  } as const
  const owns = (name: string) =>
    Object.hasOwn(parameters, name) &&
    pi
      .getAllTools()
      .some(
        (tool) =>
          tool.name === name &&
          tool.parameters === parameters[name as keyof typeof parameters],
      )
  const checkTools = () => {
    const collision = pi
      .getAllTools()
      .find((tool) => Object.hasOwn(parameters, tool.name) && !owns(tool.name))
    if (collision)
      throw new Error(
        `Goal tool name collision: ${collision.name}. Remove the duplicate goal extension.`,
      )
  }
  const argumentsFor = goalArguments(pi, owns)
  let store: GoalStore | undefined
  const storage = () =>
    (store ??= new GoalStore(join(getAgentDir(), "pi-goal.sqlite")))
  const read = (ctx: ExtensionContext) => {
    checkTools()
    if (!ctx.sessionManager.getSessionFile()) {
      throw new Error("Goal tools require a persistent thread.")
    }
    try {
      return storage().read(ctx.sessionManager.getSessionId())
    } catch (error) {
      throw new Error(
        `failed to read goal: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      )
    }
  }

  pi.registerTool({
    name: "get_goal",
    label: "Get goal",
    description:
      "Read the current goal for this session, including its status, budget, token usage, elapsed pursuit time, and remaining tokens.",
    parameters: parameters.get_goal,
    constrainedSampling: false,
    outputSchema: {},
    executionMode: "sequential",
    prepareArguments: () => ({}),
    execute: async (_id, _args, _signal, _update, ctx) => goalResult(read(ctx)),
  })

  pi.registerTool({
    name: "create_goal",
    label: "Create goal",
    description:
      "Create a goal only with an explicit user request or an explicit system/developer instruction. Do not infer a goal from an ordinary task. Set token_budget only when the budget was explicitly requested. An unfinished goal cannot be replaced; use update_goal for status changes.",
    parameters: parameters.create_goal,
    constrainedSampling: false,
    outputSchema: {},
    executionMode: "sequential",
    prepareArguments: argumentsFor.prepareCreate,
    execute: async (id, args, _signal, _update, ctx) => {
      checkTools()
      if (!ctx.sessionManager.getSessionFile()) {
        throw new Error("Goal tools require a persistent thread.")
      }
      const { objective, token_budget: budget } = argumentsFor.create(id, args)
      let goal: Goal
      try {
        goal = storage().create(
          ctx.sessionManager.getSessionId(),
          objective,
          budget,
        )
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (message.startsWith("cannot create a new goal")) throw error
        throw new Error(`failed to create goal: ${message}`, { cause: error })
      }
      present(ctx, goal)
      return goalResult(goal)
    },
  })

  pi.registerCommand("goal", {
    description: "Inspect the current goal",
    handler: async (_args, ctx) => {
      const goal = read(ctx)
      ctx.ui.notify(
        goal
          ? `${goal.status}: ${displayObjective(goal.objective)}`
          : "No current goal.",
        "info",
      )
    },
  })

  pi.on("session_start", (_event, ctx) => {
    if (ctx.sessionManager.getSessionFile()) {
      try {
        present(ctx, read(ctx))
      } catch (error) {
        ctx.ui.notify(
          error instanceof Error ? error.message : String(error),
          "error",
        )
      }
    }
  })

  pi.on("session_shutdown", () => {
    store?.close()
    store = undefined
  })
}
