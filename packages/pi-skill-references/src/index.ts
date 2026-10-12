import { readFile } from "node:fs/promises"
import { dirname } from "node:path"
import {
  stripFrontmatter,
  type ExtensionAPI,
} from "@earendil-works/pi-coding-agent"
import { Marked } from "@earendil-works/pi-tui"
import { withInlineSkills } from "./completion.ts"

export default function piSkillReferences(pi: ExtensionAPI): void {
  pi.on("session_start", (_event, ctx) => {
    ctx.ui.addAutocompleteProvider(withInlineSkills)
  })
  const markdown = new Marked({
    extensions: [
      {
        name: "skillReference",
        level: "inline",
        start: (text) => text.indexOf("/skill:"),
        tokenizer(text, tokens) {
          const previous = tokens.at(-1)?.raw.at(-1)
          if (previous && !/[\s([{"'“‘]/.test(previous)) return
          const reference = text.match(/^\/skill:[^\s)\]}"'”’]+/)?.[0]
          if (reference) return { type: "skillReference", raw: reference }
          return undefined
        },
      },
    ],
  })
  pi.on("input", async (event, ctx) => {
    const commands = pi.getCommands()
    const leadingCommand = event.text.match(/^\/(\S+)/)?.[1]
    if (
      commands.some(
        (command) =>
          command.source === "prompt" && command.name === leadingCommand,
      ) &&
      !commands.some(
        (command) =>
          command.source === "skill" && command.name === leadingCommand,
      )
    ) {
      return { action: "continue" }
    }
    const references: string[] = []
    // Pi owns submission trimming; literal boundaries follow the delivered Markdown.
    markdown.walkTokens(markdown.lexer(event.text), (token) => {
      if (token.type === "skillReference") references.push(token.raw.slice(1))
    })
    const expandedPaths = new Set<string>()
    const blocks = await Promise.all(
      references.map(async (reference) => {
        const name = reference.replace(/[.,:;!?]+$/, "")
        const skill =
          commands.find(
            (command) =>
              command.source === "skill" && command.name === reference,
          ) ??
          commands.find(
            (command) => command.source === "skill" && command.name === name,
          )
        if (!skill) return undefined
        const path = skill.sourceInfo.path
        if (expandedPaths.has(path)) return undefined
        expandedPaths.add(path)
        try {
          const body = stripFrontmatter(await readFile(path, "utf8")).trim()
          return `<skill name="${skill.name.slice(6)}" location="${path}">\nReferences are relative to ${dirname(path)}.\n\n${body}\n</skill>`
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          if (ctx.hasUI) ctx.ui.notify(message, "error")
          else console.error(message)
          return undefined
        }
      }),
    )
    const instructions = blocks.filter(Boolean).join("\n\n")
    // Pi expands leading skills after input handlers; instruction blocks keep it from expanding twice.
    return instructions
      ? { action: "transform", text: `${instructions}\n\n${event.text}` }
      : { action: "continue" }
  })
}
