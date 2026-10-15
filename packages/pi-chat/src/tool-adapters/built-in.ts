import { homedir } from "node:os"
import { resolve } from "node:path"
import {
  createBashToolDefinition,
  createEditToolDefinition,
  createFindToolDefinition,
  createGrepToolDefinition,
  createLsToolDefinition,
  createReadToolDefinition,
  createWriteToolDefinition,
} from "@earendil-works/pi-coding-agent"
import { describeCommand } from "./command.ts"
import { argumentsOf, type ActivityItem, type CallFacts } from "./types.ts"

const definitions = {
  bash: createBashToolDefinition,
  edit: createEditToolDefinition,
  find: createFindToolDefinition,
  grep: createGrepToolDefinition,
  ls: createLsToolDefinition,
  read: createReadToolDefinition,
  write: createWriteToolDefinition,
}

export function builtInItems(facts: CallFacts): ActivityItem[] | undefined {
  if (
    facts.provenance?.source !== "builtin" ||
    !Object.hasOwn(definitions, facts.name)
  )
    return
  const name = facts.name as keyof typeof definitions
  const args = argumentsOf(facts.args)
  const path = typeof args["path"] === "string" ? args["path"] : undefined
  const targetKey = path
    ? resolve(facts.cwd, path.replace(/^~(?=\/|$)/, homedir()))
    : undefined
  const skill =
    name === "read" && facts.skills.find((item) => item.path === targetKey)
  const item: ActivityItem = {
    id: facts.id,
    kind:
      name === "bash"
        ? "command"
        : name === "edit" || name === "write"
          ? "edit"
          : skill
            ? "loaded"
            : "read",
    status: facts.status,
    ...(path ? { target: path } : {}),
    ...(targetKey ? { targetKey } : {}),
    body: {
      name,
      args: facts.args,
      cwd: facts.cwd,
      result: facts.result,
      renderers: () => definitions[name](facts.cwd),
    },
  }
  if (name === "bash" && typeof args["command"] === "string")
    Object.assign(item, describeCommand(args["command"]))
  else if (skill) item.target = skill.name.replace(/^skill:/, "")
  else if (name === "read") item.action = "read"
  else if (name === "ls") item.action = "list"
  else if (name === "grep" || name === "find") {
    item.action = "search"
    if (typeof args["pattern"] === "string") item.target = args["pattern"]
  }
  const details = argumentsOf(facts.result?.details)
  if (
    item.kind === "edit" &&
    facts.status === "completed" &&
    typeof details["patch"] === "string"
  ) {
    const lines = details["patch"].split("\n")
    item.changes = {
      added: lines.filter(
        (line) => line.startsWith("+") && !line.startsWith("+++"),
      ).length,
      removed: lines.filter(
        (line) => line.startsWith("-") && !line.startsWith("---"),
      ).length,
    }
  }
  return [item]
}
