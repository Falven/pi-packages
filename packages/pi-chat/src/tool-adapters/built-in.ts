import { homedir } from "node:os";
import { resolve } from "node:path";
import {
  createBashToolDefinition,
  createEditToolDefinition,
  createFindToolDefinition,
  createGrepToolDefinition,
  createLsToolDefinition,
  createReadToolDefinition,
  createWriteToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { describeCommands } from "./command.ts";
import { argumentsOf, type ActivityItem, type CallFacts } from "./types.ts";

const definitions = {
  bash: createBashToolDefinition,
  edit: createEditToolDefinition,
  find: createFindToolDefinition,
  grep: createGrepToolDefinition,
  ls: createLsToolDefinition,
  read: createReadToolDefinition,
  write: createWriteToolDefinition,
};

export function builtInItems(facts: CallFacts): ActivityItem[] | undefined {
  if (!facts.builtin || !Object.hasOwn(definitions, facts.name)) return;
  const name = facts.name as keyof typeof definitions;
  const args = argumentsOf(facts.args);
  const path = typeof args["path"] === "string" ? args["path"] : undefined;
  const targetKey = path ? resolve(facts.cwd, path.replace(/^~(?=\/|$)/, homedir())) : undefined;
  const item: ActivityItem = {
    id: facts.id,
    kind: name === "bash" ? "command" : name === "edit" || name === "write" ? "edit" : "read",
    status: facts.status,
    ...(path ? { target: path } : {}),
    ...(targetKey ? { targetKey } : {}),
    body: {
      source: true,
      name,
      args: facts.args,
      cwd: facts.cwd,
      result: facts.result,
      renderers: () => definitions[name](facts.cwd),
    },
  };
  if (name === "bash" && typeof args["command"] === "string")
    return describeCommands(args["command"]).map((action, index) =>
      Object.assign({}, item, action, {
        id: index ? `${facts.id}:action:${index}` : facts.id,
      }),
    );
  else if (name === "read") item.action = "read";
  else if (name === "ls") item.action = "list";
  else if (name === "grep" || name === "find") {
    item.action = "search";
    item.searchPath = path;
    if (typeof args["pattern"] === "string") item.target = args["pattern"];
  }
  if (item.kind === "edit" && path) item.editOperation = { status: facts.status, fileCount: 1 };
  const details = argumentsOf(facts.result?.details);
  if (
    item.kind === "edit" &&
    facts.status === "completed" &&
    typeof details["patch"] === "string"
  ) {
    const lines = details["patch"].split("\n");
    if (lines[0]?.startsWith("--- ") && lines[1]?.startsWith("+++ "))
      item.changes = {
        added: lines.slice(2).filter((line) => line.startsWith("+")).length,
        removed: lines.slice(2).filter((line) => line.startsWith("-")).length,
      };
  }
  return [item];
}
