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
import { describeCommands } from "./command.ts"
import {
  argumentsOf,
  type ActivityItem,
  type ActivityResult,
  type CallFacts,
} from "./types.ts"

const definitions = {
  bash: createBashToolDefinition,
  edit: createEditToolDefinition,
  find: createFindToolDefinition,
  grep: createGrepToolDefinition,
  ls: createLsToolDefinition,
  read: createReadToolDefinition,
  write: createWriteToolDefinition,
}

function bashCopy(
  result: ActivityResult,
): Pick<ActivityItem["body"], "copyContent" | "copyOmitted"> {
  const part = result.content.length === 1 ? result.content[0] : undefined
  if (part?.type !== "text") return {}
  const details = argumentsOf(result.details)
  const truncation = argumentsOf(details["truncation"])
  const tail = truncation["content"]
  const path = details["fullOutputPath"]
  let text = part.text
  let normalized = false
  let partial = false
  let retainedTail: string | undefined
  if (
    truncation["truncated"] === true &&
    typeof tail === "string" &&
    typeof path === "string" &&
    text.startsWith(`${tail}\n\n[Showing `)
  ) {
    const ending = `. Full output: ${path}]`
    const end = text.indexOf(ending, tail.length)
    // The retained tail and native path prove this appended notice's ownership.
    if (end >= 0 && !text.slice(tail.length + 2, end).includes("\n")) {
      text = tail + text.slice(end + ending.length)
      retainedTail = tail
      normalized = true
      partial = true
    }
  }
  const structured = argumentsOf(result.structuredContent)
  const output = structured["output"]
  const code = structured["exit_code"]
  if (
    typeof output === "string" &&
    typeof code === "number" &&
    result.isError === (code !== 0)
  ) {
    let retained = structured["truncated"] === false ? output : undefined
    const totalBytes = truncation["totalBytes"]
    if (
      structured["truncated"] === true &&
      structured["full_output_path"] === path &&
      typeof totalBytes === "number"
    ) {
      for (const match of output.matchAll(
        /\n\n\[\.\.\. (\d+) bytes omitted \.\.\.\]\n\n/g,
      )) {
        const before = output.slice(0, match.index)
        const after = output.slice(match.index + match[0].length)
        const headBytes = Buffer.byteLength(before)
        const tailBytes = Buffer.byteLength(after)
        const missing = totalBytes - headBytes - tailBytes - Number(match[1])
        // Native structured output retains equal-sized head/tail byte windows,
        // minus up to three bytes each to preserve UTF-8 character boundaries.
        if (
          Math.abs(headBytes - tailBytes) <= 3 &&
          missing >= 0 &&
          missing <= 6
        ) {
          retained = before + after
          break
        }
      }
    }
    const failure = code ? `\n\nCommand exited with code ${code}` : ""
    if (
      retained !== undefined &&
      text === (retainedTail ?? (output || "(no output)")) + failure &&
      (retainedTail === undefined ||
        output.endsWith(retainedTail) ||
        output.endsWith(`${retainedTail}\n`))
    ) {
      text = retained + (retained ? failure : failure.slice(2))
      normalized = true
      partial = structured["truncated"] === true
    }
  }
  return normalized
    ? { copyContent: [{ type: "text", text }], copyOmitted: partial }
    : {}
}

export function builtInItems(facts: CallFacts): ActivityItem[] | undefined {
  if (!facts.builtin || !Object.hasOwn(definitions, facts.name)) return
  const name = facts.name as keyof typeof definitions
  const args = argumentsOf(facts.args)
  const path = typeof args["path"] === "string" ? args["path"] : undefined
  const targetKey = path
    ? resolve(facts.cwd, path.replace(/^~(?=\/|$)/, homedir()))
    : undefined
  const item: ActivityItem = {
    id: facts.id,
    kind:
      name === "bash"
        ? "command"
        : name === "edit" || name === "write"
          ? "edit"
          : "read",
    status: facts.status,
    ...(path ? { target: path } : {}),
    ...(targetKey ? { targetKey } : {}),
    body: {
      source: true,
      name,
      args: facts.args,
      cwd: facts.cwd,
      result: facts.result,
      ...(name === "bash" && facts.result ? bashCopy(facts.result) : {}),
      renderers: () => definitions[name](facts.cwd),
    },
  }
  if (name === "bash" && typeof args["command"] === "string")
    return describeCommands(args["command"]).map((action, index) =>
      Object.assign({}, item, action, {
        id: index ? `${facts.id}:action:${index}` : facts.id,
      }),
    )
  else if (name === "read") item.action = "read"
  else if (name === "ls") item.action = "list"
  else if (name === "grep" || name === "find") {
    item.action = "search"
    item.searchPath = path
    if (typeof args["pattern"] === "string") item.target = args["pattern"]
  }
  if (item.kind === "edit" && path)
    item.editOperation = { status: facts.status, fileCount: 1 }
  const details = argumentsOf(facts.result?.details)
  if (
    item.kind === "edit" &&
    facts.status === "completed" &&
    typeof details["patch"] === "string"
  ) {
    const lines = details["patch"].split("\n")
    if (lines[0]?.startsWith("--- ") && lines[1]?.startsWith("+++ "))
      item.changes = {
        added: lines.slice(2).filter((line) => line.startsWith("+")).length,
        removed: lines.slice(2).filter((line) => line.startsWith("-")).length,
      }
  }
  return [item]
}
