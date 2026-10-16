import type { ActivityItem } from "./types.ts"

type CommandAction = Pick<
  ActivityItem,
  "kind" | "action" | "target" | "command"
>
type LiteralCommand = { command: string; tokens: string[] }

function literalCommands(command: string): LiteralCommand[] | undefined {
  const token =
    /[ \t]+|[;\r\n]|'[^']*'|"[^"\\$`]*"|[^\s"';&|<>`$*?{}()[\]\\#~]+/gy
  const commands: LiteralCommand[] = []
  let tokens: string[] = []
  let start = 0
  let wordEnd = -1
  while (token.lastIndex < command.length) {
    const match = token.exec(command)
    if (!match) return
    const value = match[0]
    if (/^[ \t]+$/.test(value)) continue
    if (/^[;\r\n]$/.test(value)) {
      if (tokens.length)
        commands.push({
          command: command.slice(start, match.index).trim(),
          tokens,
        })
      else if (value === ";") return
      tokens = []
      start = token.lastIndex
      continue
    }
    // Adjacent quoted fragments and escapes stay with the shell's full command summary.
    if (wordEnd === match.index) return
    const quoted = value.startsWith("'") || value.startsWith('"')
    tokens.push(quoted ? value.slice(1, -1) : value)
    wordEnd = token.lastIndex
  }
  if (tokens.length)
    commands.push({ command: command.slice(start).trim(), tokens })
  return commands.length ? commands : undefined
}

function describeCommand({ command, tokens }: LiteralCommand): CommandAction[] {
  const [name, ...args] = tokens
  if (name === "cat") {
    const paths = args[0] === "--" ? args.slice(1) : args
    if (paths.length && paths.every((path) => path && !path.startsWith("-")))
      return paths.map((target) => ({
        kind: "read",
        action: "read",
        target,
        command,
      }))
  }
  if (
    name === "ls" &&
    args.every((arg) => /^-[alh1]+$/.test(arg) || !arg.startsWith("-"))
  ) {
    const paths = args.filter((arg) => !arg.startsWith("-"))
    if (paths.length <= 1)
      return [{ kind: "read", action: "list", target: paths[0], command }]
  }
  if ((name === "rg" || name === "grep") && args.length >= 1) {
    const positional = args.filter((arg) => !/^-[inlw]+$/.test(arg))
    if (
      positional.length >= 1 &&
      positional.length <= 2 &&
      positional.every((arg) => !arg.startsWith("-"))
    )
      return [
        { kind: "read", action: "search", target: positional[0], command },
      ]
    if (
      name === "rg" &&
      args[0] === "--files" &&
      args.length <= 2 &&
      !args[1]?.startsWith("-")
    )
      return [{ kind: "read", action: "list", target: args[1], command }]
  }
  return [{ kind: "command", command }]
}

export function describeCommands(command: string): CommandAction[] {
  const fallback: CommandAction[] = [{ kind: "command", command }]
  const commands = literalCommands(command)
  if (!commands) return fallback
  const actions = commands.map(describeCommand)
  const printing = (index: number) =>
    commands[index]?.tokens[0] === "echo" ||
    (commands[index]?.tokens[0] === "printf" &&
      !commands[index]?.tokens[1]?.startsWith("-v"))
  // An unknown earlier command may change shell state, including the directory.
  if (
    actions
      .slice(0, -1)
      .some(
        (items, index) =>
          items.some((item) => item.kind === "command") && !printing(index),
      )
  )
    return fallback
  return actions.flatMap((items, index) => {
    const args = commands[index]!.tokens.slice(1)
    const header =
      printing(index) &&
      args.length === 1 &&
      !args[0]!.includes("%") &&
      /^---.+---$/.test(args[0]!.replace(/\\[nrt]/g, " ").trim())
    return header && actions[index + 1]?.every((item) => item.action === "read")
      ? []
      : items
  })
}
