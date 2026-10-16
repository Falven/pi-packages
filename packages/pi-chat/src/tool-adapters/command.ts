// Adapted from the app's OpenAI Codex build at 740e5af3; see ../../NOTICE.
import { isAbsolute, sep } from "node:path"
import { activityConfig } from "../config.ts"
import {
  joinWords,
  plainCommands,
  shellType,
  splitWords,
} from "./command-shell.ts"
import type { ActivityItem } from "./types.ts"

export type ParsedCommand =
  | { type: "read"; cmd: string; name: string; path: string }
  | { type: "list_files"; cmd: string; path: string | null }
  | { type: "search"; cmd: string; query: string | null; path: string | null }
  | { type: "unknown"; cmd: string }

const connectors = new Set(["&&", "||", "|", ";"])
const nonFlag = (word: string) => !word.startsWith("-")
const sedRange = (word: string | undefined) =>
  word !== undefined && /^[0-9]+(?:,[0-9]+)?p$/.test(word)

function recognizer(name: string) {
  return (
    activityConfig.commands.names[name] ??
    activityConfig.commands.caseInsensitiveNames[
      name.replace(/[A-Z]/g, (char) => char.toLowerCase())
    ] ??
    Object.entries(activityConfig.commands.prefixes).find(([prefix]) =>
      name.startsWith(prefix),
    )?.[1]
  )
}

function trimAtConnector(args: readonly string[]): readonly string[] {
  const index = args.findIndex((word) => connectors.has(word))
  return index < 0 ? args : args.slice(0, index)
}

function shortPath(path: string): string {
  const trimmed = path.replaceAll("\\", "/").replace(/\/+$/, "")
  return (
    trimmed
      .split("/")
      .findLast(
        (part) =>
          part && !activityConfig.commands.omitPathComponents.includes(part),
      ) ?? trimmed
  )
}

function joinPaths(base: string, relative: string): string {
  if (
    !base ||
    isAbsolute(relative) ||
    /^[A-Za-z]:\\/.test(relative) ||
    relative.startsWith("\\\\")
  )
    return relative
  // PathBuf::push retains . and ..; path.join would change the reference result.
  return `${base}${base.endsWith(sep) ? "" : sep}${relative}`
}

function skipFlagValues(
  args: readonly string[],
  flags: readonly string[],
): string[] {
  const result: string[] = []
  for (let index = 0; index < args.length; index++) {
    const word = args[index]!
    if (word === "--") {
      result.push(...args.slice(index + 1))
      break
    }
    if (word.startsWith("--") && word.includes("=")) continue
    if (flags.includes(word)) {
      index++
      continue
    }
    result.push(word)
  }
  return result
}

function positionalOperands(
  args: readonly string[],
  flags: readonly string[],
): string[] {
  const result: string[] = []
  for (let index = 0; index < args.length; index++) {
    const word = args[index]!
    if (word === "--") {
      result.push(...args.slice(index + 1))
      break
    }
    if (word.startsWith("--") && word.includes("=")) continue
    if (flags.includes(word)) {
      index++
      continue
    }
    if (nonFlag(word)) result.push(word)
  }
  return result
}

function singleOperand(
  args: readonly string[],
  flags: readonly string[] = [],
): string | undefined {
  const operands = positionalOperands(args, flags)
  return operands.length === 1 ? operands[0] : undefined
}

function grepLike(cmd: string, tail: readonly string[]): ParsedCommand {
  const args = trimAtConnector(tail)
  const operands: string[] = []
  let pattern: string | undefined
  for (let index = 0; index < args.length; index++) {
    const word = args[index]!
    if (word === "--") {
      operands.push(...args.slice(index + 1))
      break
    }
    if (["-e", "--regexp", "-f", "--file"].includes(word)) {
      const value = args[++index]
      pattern ??= value
      continue
    }
    if (
      [
        "-m",
        "--max-count",
        "-C",
        "--context",
        "-A",
        "--after-context",
        "-B",
        "--before-context",
      ].includes(word)
    ) {
      index++
      continue
    }
    if (nonFlag(word)) operands.push(word)
  }
  const path = operands[pattern === undefined ? 1 : 0]
  return {
    type: "search",
    cmd,
    query: pattern ?? operands[0] ?? null,
    path: path === undefined ? null : shortPath(path),
  }
}

function awkPath(tail: readonly string[]): string | undefined {
  const args = trimAtConnector(tail)
  const operands = skipFlagValues(args, [
    "-F",
    "-v",
    "-f",
    "--field-separator",
    "--assign",
    "--file",
  ]).filter(nonFlag)
  return operands[args.includes("-f") || args.includes("--file") ? 0 : 1]
}

function sedInPlace(args: readonly string[]): boolean {
  for (let index = 0; index < args.length; index++) {
    const word = args[index]!
    if (word === "--") break
    if (["-e", "-f", "--expression", "--file"].includes(word)) {
      index++
      continue
    }
    if (word === "--in-place" || word.startsWith("--in-place=")) return true
    if (word.startsWith("--") || !word.startsWith("-")) continue
    for (let position = 1; position < word.length; position++) {
      const option = word[position]
      if (option === "i") return true
      if (option === "e" || option === "f") {
        if (position + 1 === word.length) index++
        break
      }
    }
  }
  return false
}

function sedPath(tail: readonly string[]): string | undefined {
  const args = trimAtConnector(tail)
  if (sedInPlace(args) || !args.includes("-n")) return
  let range = false
  for (let index = 0; index < args.length; index++) {
    const word = args[index]
    if (word === "-e" || word === "--expression")
      range = sedRange(args[++index]) || range
    else if (word === "-f" || word === "--file") index++
  }
  if (!range && !args.some((word) => nonFlag(word) && sedRange(word))) return
  const operands = skipFlagValues(args, [
    "-e",
    "-f",
    "--expression",
    "--file",
  ]).filter(nonFlag)
  return operands[sedRange(operands[0]) ? 1 : 0]
}

function mutatingXargs(tokens: readonly string[]): boolean {
  let index = 1
  while (index < tokens.length) {
    const word = tokens[index]!
    if (word === "--") {
      index++
      break
    }
    if (nonFlag(word)) break
    index += ["-E", "-e", "-I", "-L", "-n", "-P", "-s"].includes(word) ? 2 : 1
  }
  const head = tokens[index]
  const args = tokens.slice(index + 1)
  if (head === "sed") return sedInPlace(args)
  if (head === "rg") return args.includes("--replace")
  return (
    (head === "perl" || head === "ruby") &&
    args.some(
      (word) =>
        word.startsWith("-i") ||
        word.startsWith("-pi") ||
        word === "--in-place" ||
        word.startsWith("--in-place="),
    )
  )
}

function cdTarget(args: readonly string[]): string | undefined {
  let target: string | undefined
  for (let index = 0; index < args.length; index++) {
    if (args[index] === "--") return args[index + 1]
    if (nonFlag(args[index]!)) target = args[index]
  }
  return target
}

function summarize(tokens: readonly string[]): ParsedCommand {
  const [name = "", ...tail] = tokens
  const kind = recognizer(name)
  const cmd = joinWords(tokens)
  const args = trimAtConnector(tail)
  const operands = args.filter(nonFlag)
  const display = (path: string | undefined) =>
    path === undefined ? null : shortPath(path)
  let path: string | undefined
  switch (kind) {
    case "ls":
      return {
        type: "list_files",
        cmd,
        path: display(
          positionalOperands(tail, [
            "-I",
            "-w",
            "--block-size",
            "--format",
            "--time-style",
            "--color",
            "--quoting-style",
          ])[0],
        ),
      }
    case "eza":
      return {
        type: "list_files",
        cmd,
        path: display(
          positionalOperands(tail, [
            "-I",
            "--ignore-glob",
            "--color",
            "--sort",
            "--time-style",
            "--time",
          ])[0],
        ),
      }
    case "tree":
      return {
        type: "list_files",
        cmd,
        path: display(
          positionalOperands(tail, [
            "-L",
            "-P",
            "-I",
            "--charset",
            "--filelimit",
            "--sort",
          ])[0],
        ),
      }
    case "du":
      return {
        type: "list_files",
        cmd,
        path: display(
          positionalOperands(tail, [
            "-d",
            "--max-depth",
            "-B",
            "--block-size",
            "--exclude",
            "--time-style",
          ])[0],
        ),
      }
    case "rg": {
      const values = skipFlagValues(args, [
        "-g",
        "--glob",
        "--iglob",
        "-t",
        "--type",
        "--type-add",
        "--type-not",
        "-m",
        "--max-count",
        "-A",
        "-B",
        "-C",
        "--context",
        "--max-depth",
      ]).filter(nonFlag)
      return args.includes("--files")
        ? { type: "list_files", cmd, path: display(values[0]) }
        : {
            type: "search",
            cmd,
            query: values[0] ?? null,
            path: display(values[1]),
          }
    }
    case "grep":
      return grepLike(cmd, tail)
    case "git":
      if (tail[0] === "grep") return grepLike(cmd, tail.slice(1))
      if (tail[0] === "ls-files")
        return {
          type: "list_files",
          cmd,
          path: display(
            positionalOperands(tail.slice(1), [
              "--exclude",
              "--exclude-from",
              "--pathspec-from-file",
            ])[0],
          ),
        }
      break
    case "ag": {
      const values = skipFlagValues(args, [
        "-G",
        "-g",
        "--file-search-regex",
        "--ignore-dir",
        "--ignore-file",
        "--path-to-ignore",
      ]).filter(nonFlag)
      return {
        type: "search",
        cmd,
        query: values[0] ?? null,
        path: display(values[1]),
      }
    }
    case "fd": {
      const values = skipFlagValues(args, [
        "-t",
        "--type",
        "-e",
        "--extension",
        "-E",
        "--exclude",
        "--search-path",
      ]).filter(nonFlag)
      const first = values[0]
      const pathOnly =
        values.length === 1 &&
        first !== undefined &&
        (first === "." ||
          first === ".." ||
          first.includes("/") ||
          first.includes("\\"))
      const query = pathOnly ? null : (first ?? null)
      const location = display(values[pathOnly ? 0 : 1])
      return query === null
        ? { type: "list_files", cmd, path: location }
        : { type: "search", cmd, query, path: location }
    }
    case "find": {
      const queryIndex = args.findIndex((word) =>
        ["-name", "-iname", "-path", "-regex"].includes(word),
      )
      const query = queryIndex < 0 ? null : (args[queryIndex + 1] ?? null)
      const location = display(
        operands.find((word) => !["!", "(", ")"].includes(word)),
      )
      return query === null
        ? { type: "list_files", cmd, path: location }
        : { type: "search", cmd, query, path: location }
    }
    case "cat":
    case "more":
      path = singleOperand(tail)
      break
    case "get-content":
      if (
        tail.every(
          (word) =>
            nonFlag(word) ||
            ["-raw", "-path", "-literalpath"].includes(word.toLowerCase()),
        )
      ) {
        const operand = singleOperand(tail)
        if (
          operand &&
          nonFlag(operand) &&
          /^[\p{Alphabetic}\p{Number} /\\.\-_:]+$/u.test(operand)
        )
          path = operand
      }
      break
    case "bat":
      path = singleOperand(tail, [
        "--theme",
        "--language",
        "--style",
        "--terminal-width",
        "--tabs",
        "--line-range",
        "--map-syntax",
      ])
      break
    case "less":
      path = singleOperand(tail, [
        "-p",
        "-P",
        "-x",
        "-y",
        "-z",
        "-j",
        "--pattern",
        "--prompt",
        "--tabs",
        "--shift",
        "--jump-target",
      ])
      break
    case "head":
    case "tail": {
      const first = tail[0]
      const count =
        first === "-n"
          ? tail[1]
          : first?.startsWith("-n")
            ? first.slice(2)
            : undefined
      const valid =
        count !== undefined &&
        (kind === "head" ? /^[0-9]*$/ : /^\+?[0-9]+$/).test(count)
      if (valid) path = tail.slice(first === "-n" ? 2 : 0).find(nonFlag)
      if (path === undefined && tail.length === 1 && nonFlag(tail[0]!))
        path = tail[0]
      break
    }
    case "nl":
      path = skipFlagValues(tail, ["-s", "-w", "-v", "-i", "-b"]).find(nonFlag)
      break
    case "sed":
      path = sedPath(tail)
      break
    case "awk":
      path = awkPath(tail)
      break
    case "python": {
      const index = args.indexOf("-c")
      const script = index < 0 ? undefined : args[index + 1]
      if (
        script &&
        [
          "os.walk",
          "os.listdir",
          "os.scandir",
          "glob.glob",
          "glob.iglob",
          "pathlib.Path",
          ".rglob(",
        ].some((text) => script.includes(text))
      )
        return { type: "list_files", cmd, path: null }
      break
    }
  }
  return path === undefined
    ? { type: "unknown", cmd }
    : { type: "read", cmd, name: shortPath(path), path }
}

function formatting(tokens: readonly string[]): boolean {
  const [name = "", flag, count] = tokens
  if (activityConfig.commands.formatting.includes(name)) return true
  const kind = recognizer(name)
  switch (kind) {
    case "xargs":
      return !mutatingXargs(tokens)
    case "awk":
      return awkPath(tokens.slice(1)) === undefined
    case "head":
    case "tail":
      if (tokens.length === 1) return true
      if (tokens.length === 2) return flag!.startsWith("-")
      return (
        tokens.length === 3 &&
        (flag === "-n" || flag === "-c") &&
        (kind === "head" ? /^[0-9]*$/ : /^\+?[0-9]*$/).test(count!)
      )
    case "sed":
      return (
        !sedInPlace(tokens.slice(1)) && sedPath(tokens.slice(1)) === undefined
      )
    default:
      return false
  }
}

function simplify(commands: ParsedCommand[]): ParsedCommand[] {
  while (commands.length > 1) {
    const unknownTokens = commands.map((command) =>
      command.type === "unknown" ? splitWords(command.cmd) : undefined,
    )
    let index = unknownTokens[0]?.[0] === "echo" ? 0 : -1
    if (index < 0)
      index = unknownTokens.findIndex(
        (tokens, position) =>
          tokens?.[0] === "cd" && position + 1 < commands.length,
      )
    if (index < 0)
      index = commands.findIndex(
        (command) => command.type === "unknown" && command.cmd === "true",
      )
    if (index < 0)
      index = unknownTokens.findIndex(
        (tokens) =>
          tokens?.[0] !== undefined &&
          recognizer(tokens[0]) === "nl" &&
          tokens.slice(1).every((word) => word.startsWith("-")),
      )
    if (index < 0) break
    commands = commands.filter((_, position) => position !== index)
  }
  return commands
}

function summarizeSequence(parts: readonly string[][]): ParsedCommand[] {
  const commands: ParsedCommand[] = []
  let cwd: string | undefined
  for (const tokens of parts) {
    if (tokens[0] === "cd") {
      const target = cdTarget(tokens.slice(1))
      if (target !== undefined)
        cwd = cwd === undefined ? target : joinPaths(cwd, target)
      continue
    }
    const command = summarize(tokens)
    if (command.type === "read" && cwd !== undefined)
      command.path = joinPaths(cwd, command.path)
    commands.push(command)
  }
  return commands
}

function parseScript(script: string): ParsedCommand[] {
  const allCommands = plainCommands(script)
  const filtered = allCommands?.filter((tokens) => !formatting(tokens))
  if (!filtered?.length) return [{ type: "unknown", cmd: script }]
  const scriptTokens = splitWords(script) ?? [script]
  let commands = summarizeSequence(filtered)
  if (commands.length > 1)
    commands = simplify(
      commands.filter(
        (command) => command.type !== "unknown" || command.cmd !== "true",
      ),
    )
  if (commands.length === 1) {
    const command = commands[0]!
    const connected =
      allCommands!.length > 1 ||
      scriptTokens.some((word) => connectors.has(word))
    if (command.type !== "unknown") {
      if (!connected) command.cmd = joinWords(scriptTokens)
      else if (
        command.type === "read" &&
        scriptTokens.includes("|") &&
        scriptTokens.some(
          (word, index) => word === "sed" && scriptTokens[index + 1] === "-n",
        )
      )
        command.cmd = script
    }
  }
  return commands
}

function bashScript(argv: readonly string[]): string | undefined {
  const shell = shellType(argv[0] ?? "")
  if (
    argv.length === 3 &&
    ["bash", "zsh", "sh"].includes(shell ?? "") &&
    ["-c", "-lc"].includes(argv[1]!)
  )
    return argv[2]
  return
}

function powershellScript(argv: readonly string[]): string | undefined {
  const shell = shellType(argv[0] ?? "")
  if (shell === "pwsh" || shell === "powershell") {
    for (let index = 1; index + 1 < argv.length; index++) {
      const flag = argv[index]!.toLowerCase()
      if (!["-nologo", "-noprofile", "-command", "-c"].includes(flag)) break
      if (flag === "-command" || flag === "-c") return argv[index + 1]
    }
  }
  return
}

function powershellWords(script: string): string[] {
  const normalized = script.replaceAll("\\", "/")
  const tokens =
    splitWords(normalized) ?? normalized.match(/[^\p{White_Space}]+/gu) ?? []
  if (["get-content", "gc", "type"].includes(tokens[0]?.toLowerCase() ?? "")) {
    tokens[0] = "Get-Content"
    if (tokens.slice(1).some((word) => !normalized.includes(word))) return []
  }
  return tokens
}

function parseArguments(argv: readonly string[]): ParsedCommand[] {
  const script = bashScript(argv)
  if (script !== undefined) return parseScript(script)
  const normalizedShell = argv[0]?.includes("\\")
    ? [argv[0].split(/[/\\]/).at(-1)!, ...argv.slice(1)]
    : argv
  const powershell = powershellScript(normalizedShell)
  if (powershell !== undefined) {
    const tokens = powershellWords(powershell)
    const parsed = tokens[0] === "Get-Content" ? parseArguments(tokens) : []
    if (parsed.length === 1 && parsed[0]?.type === "read")
      return [{ ...parsed[0], cmd: powershell }]
    return [{ type: "unknown", cmd: powershell }]
  }
  const normalized =
    ["yes", "y", "no", "n"].includes(argv[0] ?? "") && argv[1] === "|"
      ? argv.slice(2)
      : [...argv]
  const parts: string[][] = []
  let part: string[] = []
  for (const word of normalized) {
    if (connectors.has(word)) {
      if (part.length) parts.push(part)
      part = []
    } else part.push(word)
  }
  if (part.length || !normalized.some((word) => connectors.has(word)))
    parts.push(part)
  return simplify(summarizeSequence(parts))
}

export function parseCommand(argv: readonly string[]): ParsedCommand[] {
  const parsed = parseArguments(argv)
  if (parsed.some((command) => command.type === "unknown"))
    return [
      {
        type: "unknown",
        cmd: bashScript(argv) ?? powershellScript(argv) ?? joinWords(argv),
      },
    ]
  const key = (command: ParsedCommand) => {
    if (command.type !== "read") return JSON.stringify(command)
    // Match PathBuf equality without changing the retained spelling of the path.
    const parts = command.path.split(sep)
    const root = isAbsolute(command.path)
      ? [sep]
      : parts[0] === "."
        ? ["."]
        : []
    return JSON.stringify({
      ...command,
      path: [...root, ...parts.filter((part) => part && part !== ".")],
    })
  }
  return parsed.filter(
    (command, index) => index === 0 || key(command) !== key(parsed[index - 1]!),
  )
}

type CommandAction = Pick<
  ActivityItem,
  "kind" | "action" | "target" | "targetKey" | "searchPath" | "command"
>

export function describeCommands(
  command: string,
  shell: readonly string[] = ["bash", "-lc"],
): CommandAction[] {
  const commands = parseCommand([...shell, command])
  if (commands.length === 0) return [{ kind: "command", command }]
  return commands.map((parsed) => {
    switch (parsed.type) {
      case "read":
        return {
          kind: "read",
          action: "read",
          target: parsed.name,
          targetKey: parsed.path,
          command: parsed.cmd,
        }
      case "list_files":
        return {
          kind: "read",
          action: "list",
          target: parsed.path ?? undefined,
          command: parsed.cmd,
        }
      case "search":
        return {
          kind: "read",
          action: "search",
          target: parsed.query ?? undefined,
          searchPath: parsed.path ?? undefined,
          command: parsed.cmd,
        }
      case "unknown":
        return { kind: "command", command: parsed.cmd }
    }
  })
}
