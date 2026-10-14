import { createHash } from "node:crypto"
import { stripVTControlCharacters } from "node:util"
import { Text, truncateToWidth } from "@earendil-works/pi-tui"
import type {
  AgentToolResult,
  ToolRenderers,
} from "@earendil-works/pi-coding-agent"

export type OperationPresentation = {
  id: string
  name: string
  status: "running" | "completed" | "failed"
  command?: string
  cwd?: string
  output?: string
  exitCode?: number
}
export type ExecutionDetails = {
  contentHash: string
  execution: {
    cellId: string
    parentCallId: string
    status: "running" | "completed" | "failed" | "terminated"
    operations: OperationPresentation[]
    omitted?: boolean
  }
}

export const contentHash = (content: AgentToolResult<unknown>["content"]) =>
  createHash("sha256").update(JSON.stringify(content)).digest("hex")

const previewLimit = 16384
export function boundedPreview(text: string): string {
  const plain = stripVTControlCharacters(text).replaceAll("\t", "    ")
  let length = 0
  let bytes = 0
  // Bound zero-width output without splitting a Unicode grapheme.
  for (const { segment } of new Intl.Segmenter().segment(plain)) {
    bytes += Buffer.byteLength(segment)
    if (bytes > previewLimit) break
    length += segment.length
  }
  return (
    truncateToWidth(
      plain.substring(0, length),
      previewLimit - 20,
      "… [output omitted]",
    ) + (length < plain.length ? "\n… [output omitted]" : "")
  )
}

function readable(
  content: AgentToolResult<unknown>["content"],
  operations: OperationPresentation[] = [],
): string {
  return content
    .filter((part) => part.type === "text")
    .map((part) => {
      const text = part.text.replace(
        /^Script (?:completed|terminated|running with cell ID [^\n]+)\nWall time [^\n]+\nOutput:\n/,
        "",
      )
      try {
        const parsed = JSON.parse(text) as {
          output?: unknown
          wall_time_seconds?: unknown
        }
        if (
          typeof parsed.output === "string" &&
          typeof parsed.wall_time_seconds === "number"
        ) {
          const output = boundedPreview(parsed.output)
          return operations.some((operation) => operation.output === output)
            ? ""
            : output
        }
      } catch {
        /* Ordinary script text is already readable. */
      }
      return text
    })
    .filter(Boolean)
    .join("\n")
}

export const executionRenderers: ToolRenderers = {
  renderCall(_args, theme) {
    return new Text(theme.fg("toolTitle", theme.bold("Execution")), 0, 0)
  },
  renderResult(result, options, theme, context) {
    const details = result.details as ExecutionDetails | undefined
    const execution =
      details?.contentHash === contentHash(result.content)
        ? details.execution
        : undefined
    const operations = execution?.operations ?? []
    const status =
      context.isError ||
      operations.some((operation) => operation.status === "failed")
        ? "failed"
        : (execution?.status ?? "completed")
    const label =
      operations.length === 1 && operations[0]?.name === "exec_command"
        ? "Command"
        : operations.length
          ? `${operations.length} operations`
          : "Execution"
    const lines = [
      theme.fg(
        status === "failed"
          ? "error"
          : status === "running"
            ? "warning"
            : "success",
        `${label} · ${status}`,
      ),
    ]
    if (options.expanded) {
      for (const operation of operations) {
        lines.push(
          `${operation.name === "exec_command" ? "Command" : operation.name} · ${operation.status}`,
        )
        if (operation.command !== undefined)
          lines.push(`$ ${operation.command}`)
        if (operation.cwd !== undefined)
          lines.push(`Directory: ${operation.cwd}`)
        if (operation.output) lines.push(operation.output)
        if (operation.exitCode !== undefined)
          lines.push(`Exit status: ${operation.exitCode}`)
      }
      if (execution?.omitted)
        lines.push("… [earlier operation details omitted]")
      const output = readable(result.content, operations)
      if (output) lines.push(boundedPreview(output))
    }
    return new Text(lines.join("\n"), 0, 0)
  },
}

export const waitRenderers: ToolRenderers = {
  renderCall(_args, theme) {
    return new Text(theme.fg("toolTitle", theme.bold("Wait")), 0, 0)
  },
  renderResult(result, _options, theme, context) {
    const error = result.content.findLast((part) => part.type === "text")
    const status = context.isError
      ? error?.type === "text"
        ? error.text.replace(/^Script error:\n/, "")
        : "Execution failed"
      : (result.content[0]?.type === "text"
            ? result.content[0].text
            : ""
          ).startsWith("Script running")
        ? "Execution running"
        : "Output collected"
    return new Text(
      theme.fg(context.isError ? "error" : "muted", boundedPreview(status)),
      0,
      0,
    )
  },
}
