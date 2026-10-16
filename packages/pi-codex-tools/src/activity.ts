import { fileURLToPath } from "node:url"
import type { ActivityOperation, ActivityStatus } from "pi-activity"
import type { ExecutionDetails, OperationPresentation } from "./presentation.ts"

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
    case "exec_command":
      if (operation.command === undefined)
        return operation.status === "failed" ? tool : undefined
      return {
        ...common,
        kind: "command",
        commands: [operation.command, ...(operation.submitted ?? [])],
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

export function outputActivity(
  execution: ExecutionDetails["execution"],
  revision: number,
): ActivityOperation | undefined {
  const output = [execution.output, execution.error].filter(Boolean).join("\n")
  if (!output) return
  return {
    id: `${execution.cellId}:output`,
    order: Number.MAX_SAFE_INTEGER,
    revision,
    kind: "output",
    status: status(execution.status),
    output,
  }
}
