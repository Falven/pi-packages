import type { ActivityItem } from "./types.ts"

type CommandAction = Pick<
  ActivityItem,
  "kind" | "action" | "target" | "command"
>

export function describeCommand(command: string): CommandAction {
  // Only plain, single commands are classified; shell syntax keeps its full command summary.
  if (!command || /[\n\r|;&<>`$*?{}()[\]\\]/.test(command))
    return { kind: "command", command }
  const tokens = command.match(/"[^"\n]*"|'[^'\n]*'|[^\s"']+/g)
  if (!tokens || tokens.join(" ") !== command.trim().replace(/\s+/g, " "))
    return { kind: "command", command }
  const [name, ...args] = tokens.map((token) =>
    token.replace(/^(["'])(.*)\1$/, "$2"),
  )
  if (name === "cat" && args.length === 1 && !args[0]!.startsWith("-"))
    return { kind: "read", action: "read", target: args[0], command }
  if (
    name === "ls" &&
    args.every((arg) => /^-[alh1]+$/.test(arg) || !arg.startsWith("-"))
  ) {
    const paths = args.filter((arg) => !arg.startsWith("-"))
    if (paths.length <= 1)
      return { kind: "read", action: "list", target: paths[0], command }
  }
  if ((name === "rg" || name === "grep") && args.length >= 1) {
    const positional = args.filter((arg) => !/^-[inlw]+$/.test(arg))
    if (
      positional.length >= 1 &&
      positional.length <= 2 &&
      positional.every((arg) => !arg.startsWith("-"))
    )
      return { kind: "read", action: "search", target: positional[0], command }
    if (
      name === "rg" &&
      args[0] === "--files" &&
      args.length <= 2 &&
      !args[1]?.startsWith("-")
    )
      return { kind: "read", action: "list", target: args[1], command }
  }
  return { kind: "command", command }
}
