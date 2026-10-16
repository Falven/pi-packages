import { createHash } from "node:crypto"
import { fileURLToPath } from "node:url"
import type { ExecutionDetails, OperationPresentation } from "./presentation.ts"

export const activityType = "pi.activity"

export type ActivityStatus =
  | "running"
  | "completed"
  | "failed"
  | "unknown"
  | "unattempted"

export type ActivityFile = {
  id: string
  path: string
  status: ActivityStatus
  args?: Record<string, unknown>
  changes?: { added: number; removed: number }
  output?: string
  outputOmitted?: boolean
}

export type ActivityOperation = {
  id: string
  order: number
  revision: number
  status: ActivityStatus
  cwd?: string
  args?: Record<string, unknown>
  output?: string
  outputOmitted?: boolean
} & (
  | { kind: "command"; commands: string[]; shell?: string[] }
  | { kind: "edit"; path?: string; files?: ActivityFile[] }
  | { kind: "image"; path?: string }
  | { kind: "tool"; name: string }
  | { kind: "output" }
)

export type ActivityUpdate = {
  version: 1
  id: string
  callId: string
  sessionId: string
  revision: number
  operations: ActivityOperation[]
}

type Content = readonly (
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string }
)[]

export type ActivityDetails = {
  activity: {
    update: ActivityUpdate
    imageOwners: (string | null)[]
    contentHash: string
    activityHash: string
  }
}

const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex")

export function contentHash(content: Content, nativeHints = false): string {
  return hash(
    content.flatMap((part, index) => {
      if (part.type === "image") return [{ type: "image" }]
      // Pi may append conversion/resize hints immediately after a processed image.
      if (
        nativeHints &&
        content[index - 1]?.type === "image" &&
        /^(?:\[Image converted from [\w/+.-]+ to [\w/+.-]+\.\](?:\n|$))(?:\[Image: original \d+x\d+, displayed at \d+x\d+\. Multiply coordinates by \d+\.\d+ to map to original image\.\])?$|^\[Image: original \d+x\d+, displayed at \d+x\d+\. Multiply coordinates by \d+\.\d+ to map to original image\.\]$/.test(
          part.text,
        )
      )
        return []
      return [part]
    }),
  )
}

export function activityDetails(
  update: ActivityUpdate,
  content: Content,
  imageOwners: (string | null)[] = content
    .filter((part) => part.type === "image")
    .map(() => null),
): ActivityDetails {
  return {
    activity: {
      update,
      imageOwners,
      contentHash: contentHash(content),
      activityHash: hash({ update, imageOwners }),
    },
  }
}

const sourcePath = fileURLToPath(new URL("./index.ts", import.meta.url))
const status = (
  value:
    | OperationPresentation["status"]
    | ExecutionDetails["execution"]["status"],
): ActivityStatus =>
  value === "interrupted or unknown"
    ? "unknown"
    : value === "terminated"
      ? "failed"
      : value

function collectionFailure(
  operation: OperationPresentation,
): string | undefined {
  if (operation.status !== "failed" || operation.input) return
  return (
    operation.resultText ?? (!operation.live ? operation.output : undefined)
  )
}

export function operationActivity(
  operation: OperationPresentation,
): ActivityOperation | undefined {
  const common = {
    id: operation.id,
    order: operation.order,
    revision: operation.revision ?? 0,
    status: status(operation.status),
    ...(operation.cwd === undefined ? {} : { cwd: operation.cwd }),
    ...(operation.effectiveArgs ? { args: operation.effectiveArgs } : {}),
    ...(operation.outputOmitted ? { outputOmitted: true } : {}),
    ...((operation.output ?? operation.resultText) === undefined
      ? {}
      : {
          output: operation.output ?? operation.resultText,
        }),
  }
  const tool = { ...common, kind: "tool" as const, name: operation.name }
  if (operation.toolSource === "builtin" || operation.toolPath !== sourcePath)
    return tool
  switch (operation.name) {
    case "exec_command": {
      if (operation.command === undefined)
        return operation.status === "failed" ? tool : undefined
      const shell = operation.effectiveArgs?.["shell"]
      const login = operation.effectiveArgs?.["login"]
      return {
        ...common,
        kind: "command",
        commands: [operation.command, ...(operation.submitted ?? [])],
        ...(typeof shell === "string" && typeof login === "boolean"
          ? { shell: [shell, login ? "-lc" : "-c"] }
          : {}),
      }
    }
    case "write_stdin": {
      const output = collectionFailure(operation)
      return output ? { ...tool, output } : undefined
    }
    case "apply_patch":
      return {
        ...common,
        kind: "edit",
        ...(operation.path ? { path: operation.path } : {}),
        ...(operation.patchChanges?.length
          ? {
              files: operation.patchChanges.map((change) => ({
                id: change.id,
                path: change.path,
                status: change.status,
                args: {
                  action: change.action,
                  path: change.path,
                  ...(change.destination
                    ? { destination: change.destination }
                    : {}),
                },
                ...(change.status === "completed" &&
                change.added !== undefined &&
                change.removed !== undefined
                  ? {
                      changes: { added: change.added, removed: change.removed },
                    }
                  : {}),
                ...(change.output === undefined
                  ? {}
                  : { output: change.output }),
                ...(change.outputOmitted ? { outputOmitted: true } : {}),
              })),
            }
          : {}),
      }
    case "view_image":
      return {
        ...common,
        kind: "image",
        ...(operation.path ? { path: operation.path } : {}),
      }
    default:
      return tool
  }
}

export function errorActivity(
  execution: ExecutionDetails["execution"],
  revision: number,
): ActivityOperation | undefined {
  const output = execution.error ?? ""
  if (execution.status !== "failed" && !output) return
  return {
    id: `${execution.cellId}:output`,
    order: Number.MAX_SAFE_INTEGER,
    revision,
    kind: "output",
    status: "failed",
    output,
  }
}
