import { createHash } from "node:crypto"
import { stripVTControlCharacters } from "node:util"
import { Text, truncateToWidth } from "@earendil-works/pi-tui"
import type {
  AgentToolResult,
  ToolRenderers,
} from "@earendil-works/pi-coding-agent"

export type PatchChange = {
  id: string
  action: "Added" | "Updated" | "Moved" | "Deleted"
  path: string
  destination?: string
  status: "completed" | "failed" | "unattempted"
  added?: number
  removed?: number
  output?: string
  outputOmitted?: boolean
}
export type PatchDetails = {
  contentHash: string
  patchChanges: PatchChange[]
  patchOmitted?: boolean
}

export type OperationPresentation = {
  id: string
  order: number
  revision?: number
  name: string
  status: "running" | "completed" | "failed" | "interrupted or unknown"
  toolSource?: string
  toolPath?: string
  effectiveArgs?: Record<string, unknown>
  command?: string
  cwd?: string
  path?: string
  patchChanges?: PatchChange[]
  patchOmitted?: boolean
  output?: string
  outputOmitted?: boolean
  resultText?: string
  sessionId?: number
  input?: boolean
  live?: boolean
  exitCode?: number
}
export type ExecutionDetails = {
  contentHash: string
  executionHash?: string
  imageOrigins?: (string | null)[]
  execution: {
    cellId: string
    parentCallId: string
    status:
      | "running"
      | "completed"
      | "failed"
      | "terminated"
      | "interrupted or unknown"
    sessionId?: string
    output?: string
    error?: string
    operations: OperationPresentation[]
    omitted?: boolean
    omittedFailure?: boolean
  }
}

export const executionHash = (execution: ExecutionDetails["execution"]) =>
  createHash("sha256").update(JSON.stringify(execution)).digest("hex")

export const contentHash = (
  content: AgentToolResult<unknown>["content"],
  nativeHints = false,
) =>
  createHash("sha256")
    .update(
      JSON.stringify(
        content.flatMap((part, index) => {
          if (part.type === "image") return [{ type: "image" }]
          // Native image normalization appends hints immediately after its image.
          if (
            nativeHints &&
            part.type === "text" &&
            content[index - 1]?.type === "image" &&
            /^(?:\[Image converted from [\w/+.-]+ to [\w/+.-]+\.\](?:\n|$))(?:\[Image: original \d+x\d+, displayed at \d+x\d+\. Multiply coordinates by \d+\.\d+ to map to original image\.\])?$|^\[Image: original \d+x\d+, displayed at \d+x\d+\. Multiply coordinates by \d+\.\d+ to map to original image\.\]$/.test(
              part.text,
            )
          )
            return []
          return [part]
        }),
      ),
    )
    .digest("hex")

const previewLimit = 16384
export function boundedPreview(text: string): string {
  const plain = stripVTControlCharacters(text).replaceAll("\t", "    ")
  if (/^\p{ASCII}*$/u.test(plain)) {
    if (plain.length <= previewLimit - 20) return plain
    return (
      truncateToWidth(
        plain.slice(0, previewLimit),
        previewLimit - 20,
        "… [output omitted]",
      ) + (plain.length > previewLimit ? "\n… [output omitted]" : "")
    )
  }
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

export function readable(
  content: AgentToolResult<unknown>["content"],
  operations: OperationPresentation[] = [],
): string {
  return content
    .filter((part) => part.type === "text")
    .map((part) => {
      const text = part.text
        .replace(
          /^Script (?:completed|terminated|running with cell ID [^\n]+)\nWall time [^\n]+\nOutput:\n/,
          "",
        )
        .replace(/^Exit code: 1\nWall time: [^\n]+\nOutput:\n/, "")
      // Aggregate truncation loses text boundaries, including serialized image envelopes.
      if (
        text.startsWith("Warning: truncated output") &&
        operations.some((operation) => operation.name === "view_image")
      )
        return "[Truncated script output omitted from preview]"
      try {
        const parsed = JSON.parse(text) as {
          output?: unknown
          wall_time_seconds?: unknown
          image_url?: unknown
        }
        if (
          typeof parsed.image_url === "string" &&
          parsed.image_url.startsWith("data:")
        )
          return "[Image result]"
        if (
          typeof parsed.output === "string" &&
          typeof parsed.wall_time_seconds === "number"
        ) {
          const output = boundedPreview(parsed.output)
          return operations.some(
            (operation) =>
              operation.input || operation.live || operation.output === output,
          )
            ? ""
            : output
        }
      } catch {
        /* Ordinary script text is already readable. */
      }
      if (
        text.split("\n").every((line) => line === "{}") &&
        operations.some((operation) => operation.patchChanges)
      )
        return ""
      return operations.some((operation) => operation.output === text)
        ? ""
        : text
    })
    .filter(Boolean)
    .join("\n")
}

export type LivePresentation = {
  execution: ExecutionDetails["execution"]
  invalidates: Set<() => void>
}
export function createExecutionRenderers(
  live: Map<string, LivePresentation>,
  restore: (
    execution: ExecutionDetails["execution"],
    invalidate: () => void,
  ) => ExecutionDetails["execution"] | undefined,
): ToolRenderers {
  const owner = {}
  return {
    renderCall(_args, theme) {
      return new Text(theme.fg("toolTitle", theme.bold("Execution")), 0, 0)
    },
    renderResult(result, options, theme, context) {
      const details = result.details as ExecutionDetails | undefined
      let execution =
        details &&
        (details.contentHash === contentHash(result.content) ||
          details.contentHash === contentHash(result.content, true))
          ? details.execution
          : undefined
      let follow =
        execution !== undefined &&
        details?.executionHash === executionHash(execution)
      if (details === undefined && result.content[0]?.type === "text") {
        const cellId = result.content[0].text.match(
          /^Script running with cell ID ([^\n]+)/,
        )?.[1]
        if (cellId) {
          execution = {
            cellId,
            parentCallId: context.toolCallId,
            status: "running",
            operations: [],
          }
          follow = true
        }
      }
      if (!follow) delete context.state["execution"]
      if (execution && follow) {
        if (context.state["owner"] !== owner) {
          delete context.state["execution"]
          context.state["owner"] = owner
        }
        const current = live.get(execution.cellId)
        if (current) {
          current.invalidates.clear()
          current.invalidates.add(context.invalidate)
          context.state["execution"] = current.execution
        }
        const restored =
          current || context.state["execution"]
            ? undefined
            : restore(execution, context.invalidate)
        execution =
          current?.execution ??
          restored ??
          context.state["execution"] ??
          execution
        if (current || restored) context.state["execution"] = execution
      }
      const operations = execution?.operations ?? []
      const status =
        context.isError ||
        execution?.status === "failed" ||
        execution?.omittedFailure ||
        operations.some((operation) => operation.status === "failed")
          ? "failed"
          : operations.some((operation) => operation.status === "running")
            ? "running"
            : operations.some(
                  (operation) => operation.status === "interrupted or unknown",
                )
              ? "interrupted or unknown"
              : (execution?.status ?? "completed")
      const itemSummary =
        operations.length === 1 && operations[0]?.name === "view_image"
          ? "Image"
          : operations.length === 1 && operations[0]?.name === "apply_patch"
            ? "Patch"
            : operations.length === 1 && operations[0]?.name === "exec_command"
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
          `${itemSummary} · ${status}`,
        ),
      ]
      if (options.expanded) {
        if (!details) lines.push("[Earlier activity body unavailable]")
        for (const operation of operations) {
          lines.push(
            `${operation.name === "exec_command" ? "Command" : operation.name === "view_image" ? "Image" : operation.name === "apply_patch" ? "Patch" : operation.name} · ${operation.status}`,
          )
          if (operation.command !== undefined)
            lines.push(`$ ${operation.command}`)
          if (operation.cwd !== undefined)
            lines.push(`Directory: ${operation.cwd}`)
          if (operation.path !== undefined)
            lines.push(`Path: ${operation.path}`)
          for (const change of operation.patchChanges ?? [])
            lines.push(
              `${change.action}${change.status === "completed" ? "" : ` (${change.status})`}: ${change.path}${change.destination ? ` → ${change.destination}` : ""}`,
            )
          if (operation.patchOmitted)
            lines.push("… [earlier file change bodies omitted]")
          if (operation.output && !operation.input)
            lines.push(
              operation.output.replace(
                /^Exit code: 1\nWall time: [^\n]+\nOutput:\n/,
                "",
              ),
            )
          if (operation.exitCode !== undefined)
            lines.push(`Exit status: ${operation.exitCode}`)
        }
        if (execution?.omitted)
          lines.push("… [earlier activity bodies omitted]")
        const output =
          execution?.output !== undefined
            ? execution.output
            : readable(result.content, operations)
        if (output) lines.push(boundedPreview(output))
        if (execution?.error) lines.push(execution.error)
      }
      return new Text(lines.join("\n"), 0, 0)
    },
  }
}

export const waitRenderers: ToolRenderers = {
  renderCall(_args, theme) {
    return new Text(theme.fg("toolTitle", theme.bold("Wait")), 0, 0)
  },
  renderResult(result, _options, theme, context) {
    const error = result.content.findLast((part) => part.type === "text")
    const status = context.isError
      ? error?.type === "text"
        ? error.text === "Operation aborted"
          ? "Wait cancelled"
          : (result.details as ExecutionDetails | undefined)?.execution
            ? "Execution failed"
            : error.text.replace(/^Script error:\n/, "")
        : "Execution failed"
      : (result.content[0]?.type === "text"
            ? result.content[0].text
            : ""
          ).startsWith("Script running")
        ? "Execution running"
        : result.content[0]?.type === "text" &&
            result.content[0].text.startsWith("Script terminated")
          ? "Execution terminated"
          : context.isPartial
            ? "Waiting"
            : "Output collected"
    return new Text(
      theme.fg(context.isError ? "error" : "muted", boundedPreview(status)),
      0,
      0,
    )
  },
}
