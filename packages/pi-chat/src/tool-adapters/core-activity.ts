import { createHash } from "node:crypto"
import { stripVTControlCharacters } from "node:util"
import { truncateToWidth } from "@earendil-works/pi-tui"
import type { ActivityResult } from "./types.ts"

type OperationStatus =
  | "running"
  | "completed"
  | "failed"
  | "interrupted or unknown"
type CellStatus = OperationStatus | "terminated"
type PatchChange = {
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

export type CoreOperation = {
  id: string
  order: number
  revision?: number
  name: string
  status: OperationStatus
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

export type CoreExecution = {
  cellId: string
  parentCallId: string
  status: CellStatus
  sessionId?: string
  output?: string
  error?: string
  operations: CoreOperation[]
  omitted?: boolean
  omittedFailure?: boolean
}

type Snapshot = { execution: CoreExecution; revision: number; live: boolean }
type Cell = { record: Snapshot; revisions: Map<string, number> }
type Event = {
  type: string
  child_id?: string
  name?: string
  output?: string
  replace_output?: boolean
  error?: string
  presentation?: CoreOperation
}
type Journal = {
  cell_id: string
  parent_call_id: string
  session_id: string
  status: CellStatus
  events: Event[]
}

const statuses = new Set<CellStatus>([
  "running",
  "completed",
  "failed",
  "terminated",
  "interrupted or unknown",
])
const operationStatuses = new Set<OperationStatus>([
  "running",
  "completed",
  "failed",
  "interrupted or unknown",
])
const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex")
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
const nonempty = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0
const bounded = (value: string) =>
  truncateToWidth(
    stripVTControlCharacters(value).replaceAll("\t", "    "),
    16384,
  )

function validOperation(value: unknown): value is CoreOperation {
  return (
    object(value) &&
    nonempty(value["id"]) &&
    Number.isSafeInteger(value["order"]) &&
    (value["order"] as number) >= 0 &&
    nonempty(value["name"]) &&
    operationStatuses.has(value["status"] as OperationStatus) &&
    (value["revision"] === undefined ||
      (Number.isSafeInteger(value["revision"]) &&
        (value["revision"] as number) >= 0)) &&
    (value["command"] === undefined || typeof value["command"] === "string") &&
    (value["cwd"] === undefined || typeof value["cwd"] === "string") &&
    (value["path"] === undefined || typeof value["path"] === "string") &&
    (value["output"] === undefined || typeof value["output"] === "string") &&
    (value["resultText"] === undefined ||
      typeof value["resultText"] === "string") &&
    (value["patchChanges"] === undefined ||
      (Array.isArray(value["patchChanges"]) &&
        value["patchChanges"].every(
          (change: unknown) =>
            object(change) &&
            nonempty(change["id"]) &&
            nonempty(change["path"]) &&
            ["Added", "Updated", "Moved", "Deleted"].includes(
              change["action"] as string,
            ) &&
            ["completed", "failed", "unattempted"].includes(
              change["status"] as string,
            ) &&
            (change["output"] === undefined ||
              typeof change["output"] === "string"),
        )))
  )
}

function validExecution(value: unknown): value is CoreExecution {
  return (
    object(value) &&
    nonempty(value["cellId"]) &&
    nonempty(value["parentCallId"]) &&
    (value["sessionId"] === undefined || nonempty(value["sessionId"])) &&
    statuses.has(value["status"] as CellStatus) &&
    (value["output"] === undefined || typeof value["output"] === "string") &&
    (value["error"] === undefined || typeof value["error"] === "string") &&
    Array.isArray(value["operations"]) &&
    value["operations"].every(validOperation)
  )
}

const nativeImageHint =
  /^(?:\[Image converted from [\w/+.-]+ to [\w/+.-]+\.\](?:\n|$))(?:\[Image: original \d+x\d+, displayed at \d+x\d+\. Multiply coordinates by \d+\.\d+ to map to original image\.\])?$|^\[Image: original \d+x\d+, displayed at \d+x\d+\. Multiply coordinates by \d+\.\d+ to map to original image\.\]$/

function contentHash(content: ActivityResult["content"], nativeHints: boolean) {
  return hash(
    content.flatMap((part, index) => {
      if (part.type === "image") return [{ type: "image" }]
      if (
        nativeHints &&
        part.type === "text" &&
        content[index - 1]?.type === "image" &&
        nativeImageHint.test(part.text)
      )
        return []
      return [part]
    }),
  )
}

export function readExecution(
  result: ActivityResult,
): { execution: CoreExecution; imageOrigins?: (string | null)[] } | undefined {
  const details = result.details
  if (
    !object(details) ||
    typeof details["contentHash"] !== "string" ||
    typeof details["executionHash"] !== "string" ||
    !validExecution(details["execution"]) ||
    (details["contentHash"] !== contentHash(result.content, false) &&
      details["contentHash"] !== contentHash(result.content, true)) ||
    details["executionHash"] !== hash(details["execution"])
  )
    return
  const imageOrigins = details["imageOrigins"]
  if (
    imageOrigins !== undefined &&
    (!Array.isArray(imageOrigins) ||
      !imageOrigins.every(
        (value) => value === null || typeof value === "string",
      ))
  )
    return
  return {
    execution: details["execution"],
    ...(imageOrigins === undefined ? {} : { imageOrigins }),
  }
}

function validJournal(value: unknown): value is Journal {
  return (
    object(value) &&
    nonempty(value["cell_id"]) &&
    nonempty(value["parent_call_id"]) &&
    nonempty(value["session_id"]) &&
    statuses.has(value["status"] as CellStatus) &&
    Array.isArray(value["events"]) &&
    value["events"].length > 0 &&
    value["events"].every(
      (event: unknown) => object(event) && nonempty(event["type"]),
    )
  )
}

function copyOperation(operation: CoreOperation): CoreOperation {
  return {
    ...operation,
    ...(operation.output === undefined
      ? {}
      : { output: bounded(operation.output) }),
    ...(operation.resultText === undefined
      ? {}
      : { resultText: bounded(operation.resultText) }),
    ...(operation.patchChanges === undefined
      ? {}
      : {
          patchChanges: operation.patchChanges.map((change) => ({
            ...change,
            ...(change.output === undefined
              ? {}
              : { output: bounded(change.output) }),
          })),
        }),
  }
}

export class CoreActivity {
  private readonly retained = new Map<string, Cell>()
  private readonly live = new Map<string, Cell>()

  observe(data: unknown, live: boolean): string | undefined {
    if (!validJournal(data)) return
    const own = live ? this.live : this.retained
    const other = live ? this.retained : this.live
    const existing = own.get(data.cell_id)
    const previous = existing ?? other.get(data.cell_id)
    if (
      previous &&
      (previous.record.execution.parentCallId !== data.parent_call_id ||
        previous.record.execution.sessionId !== data.session_id)
    )
      return
    const cell = existing ?? {
      record: {
        execution:
          previous && live
            ? structuredClone(previous.record.execution)
            : {
                cellId: data.cell_id,
                parentCallId: data.parent_call_id,
                sessionId: data.session_id,
                status: "running" as const,
                operations: [],
              },
        revision: previous && live ? previous.record.revision : 0,
        live,
      },
      revisions:
        previous && live
          ? new Map(previous.revisions)
          : new Map<string, number>(),
    }
    let changed = !existing
    const execution = cell.record.execution
    for (const event of data.events) {
      if (event.presentation && validOperation(event.presentation)) {
        const operation = event.presentation
        if (!operation.id.startsWith(`${data.cell_id}/`)) continue
        const revision = operation.revision ?? 0
        const previousRevision = cell.revisions.get(operation.id) ?? -1
        if (revision >= previousRevision) {
          const copy = copyOperation(operation)
          const index = execution.operations.findIndex(
            (item) => item.id === copy.id,
          )
          const current = execution.operations[index]
          if (
            (!current ||
              revision > previousRevision ||
              JSON.stringify(current) !== JSON.stringify(copy)) &&
            (revision > previousRevision ||
              ((!current?.outputOmitted || copy.outputOmitted) &&
                (!current?.patchOmitted || copy.patchOmitted)))
          ) {
            if (index < 0) {
              if (execution.operations.length >= 4096) continue
              execution.operations.push(copy)
            } else execution.operations[index] = copy
            cell.revisions.set(copy.id, revision)
            execution.operations.sort((a, b) => a.order - b.order)
            changed = true
          }
        }
      } else if (
        event.type === "started" &&
        nonempty(event.child_id) &&
        event.child_id.startsWith(`${data.cell_id}/`) &&
        nonempty(event.name) &&
        !execution.operations.some((item) => item.id === event.child_id) &&
        execution.operations.length < 4096
      ) {
        execution.operations.push({
          id: event.child_id,
          order: execution.operations.length,
          name: event.name,
          status: "running",
        })
        changed = true
      }
      if (event.type === "script-output" && typeof event.output === "string") {
        const output = bounded(
          (event.replace_output ? "" : (execution.output ?? "")) + event.output,
        )
        if (output !== execution.output) {
          execution.output = output
          changed = true
        }
      }
      if (
        !event.child_id &&
        typeof event.error === "string" &&
        event.error !== execution.error
      ) {
        execution.error = bounded(event.error)
        changed = true
      }
      if (
        !event.child_id &&
        statuses.has(event.type as CellStatus) &&
        execution.status !== event.type
      ) {
        execution.status = event.type as CellStatus
        changed = true
      }
    }
    if (data.status !== "running" && execution.status === "running") {
      execution.status = data.status
      changed = true
    }
    if (!changed) return
    cell.record.revision++
    own.set(data.cell_id, cell)
    return !live && this.live.has(data.cell_id) ? undefined : data.cell_id
  }

  get(
    cellId: string,
    parentCallId: string,
    sessionId?: string,
  ): Snapshot | undefined {
    const cell = this.live.get(cellId) ?? this.retained.get(cellId)
    if (
      cell?.record.execution.parentCallId !== parentCallId ||
      (sessionId !== undefined && cell.record.execution.sessionId !== sessionId)
    )
      return
    return cell.record
  }

  clear(): void {
    this.live.clear()
    this.retained.clear()
  }
}
