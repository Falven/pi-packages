import { readFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import {
  CoreActivity,
  readExecution,
  type CoreExecution,
  type CoreOperation,
} from "./core-activity.ts"
import { describeCommand } from "./command.ts"
import {
  argumentsOf,
  type ActivityItem,
  type ActivityResult,
  type CallFacts,
} from "./types.ts"

const names = new Set(["exec", "wait"])
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
type ImagePart = Extract<ActivityResult["content"][number], { type: "image" }>

function status(
  value: CoreOperation["status"] | CoreExecution["status"],
  live: boolean,
): ActivityItem["status"] {
  if (value === "running") return live ? "running" : "unknown"
  if (value === "interrupted or unknown") return "unknown"
  if (value === "terminated") return "failed"
  return value
}

function result(
  text: string | undefined,
  failed: boolean,
  images: ImagePart[] = [],
): ActivityResult {
  return {
    content: [...(text ? [{ type: "text" as const, text }] : []), ...images],
    isError: failed,
  }
}

function mergeExecution(
  base: CoreExecution,
  newer: CoreExecution,
): CoreExecution {
  const operations = new Map(
    base.operations.map((operation) => [operation.id, operation]),
  )
  for (const operation of newer.operations) {
    const previous = operations.get(operation.id)
    if (!previous || (operation.revision ?? -1) > (previous.revision ?? -1))
      operations.set(operation.id, operation)
  }
  return {
    ...base,
    status: newer.status === "running" ? base.status : newer.status,
    ...(newer.output !== undefined ? { output: newer.output } : {}),
    ...(newer.error !== undefined ? { error: newer.error } : {}),
    operations: [...operations.values()].toSorted((a, b) => a.order - b.order),
    ...(newer.omitted || base.omitted ? { omitted: true } : {}),
    ...(newer.omittedFailure || base.omittedFailure
      ? { omittedFailure: true }
      : {}),
  }
}

export class CoreToolAdapter {
  private readonly activity = new CoreActivity()
  private readonly receipts = new Map<string, "exec" | "wait">()
  private readonly cells = new Map<string, string>()
  private readonly provenance = new Map<string, boolean>()

  observe(type: string, data: unknown, live: boolean): string[] {
    if (type === "core-tools.calls") {
      if (!Array.isArray(data)) return []
      const affected: string[] = []
      for (const call of data) {
        if (
          !object(call) ||
          typeof call["id"] !== "string" ||
          !names.has(call["name"] as string)
        )
          continue
        const id = call["id"]
        const name = call["name"] as "exec" | "wait"
        if (this.receipts.has(id)) continue
        this.receipts.set(id, name)
        affected.push(id)
      }
      return affected
    }
    if (type !== "core-tools.activity" || !object(data)) return []
    const cellId = this.activity.observe(data, live)
    if (!cellId || typeof data["parent_call_id"] !== "string") return []
    this.cells.set(data["parent_call_id"], cellId)
    return [data["parent_call_id"]]
  }

  describe(facts: CallFacts): ActivityItem[] | undefined {
    if (!names.has(facts.name) || !this.owned(facts)) return
    const verified = facts.result ? readExecution(facts.result) : undefined
    // A processed result without valid metadata must never regain discarded bodies from the journal.
    if (facts.result && !verified) return
    if (facts.name === "wait")
      return [this.waitItem(facts, verified?.execution)]
    const cellId = verified?.execution.cellId ?? this.cells.get(facts.id)
    const snapshot = cellId
      ? this.activity.get(cellId, facts.id, verified?.execution.sessionId)
      : undefined
    const execution = verified?.execution
      ? snapshot
        ? mergeExecution(verified.execution, snapshot.execution)
        : verified.execution
      : snapshot?.execution
    if (!execution) return
    const live = snapshot?.live ?? facts.status === "running"
    const images = new Map<string | null, ImagePart[]>()
    let imageIndex = 0
    for (const part of facts.result?.content ?? []) {
      if (part.type !== "image") continue
      const owner = verified?.imageOrigins?.[imageIndex++] ?? null
      const owned = images.get(owner) ?? []
      owned.push(part)
      images.set(owner, owned)
    }
    const items = execution.operations.flatMap((operation) =>
      this.operationItems(
        facts,
        operation,
        live,
        images.get(operation.id) ?? [],
      ),
    )
    const scriptImages = images.get(null) ?? []
    if (execution.output || execution.error || scriptImages.length) {
      items.push({
        id: `${execution.cellId}:script`,
        kind: "execution",
        status: status(execution.status, live),
        body: {
          name: "exec",
          args: facts.args,
          cwd: facts.cwd,
          result: result(
            [execution.output, execution.error].filter(Boolean).join("\n") ||
              undefined,
            execution.status === "failed" || execution.status === "terminated",
            scriptImages,
          ),
        },
      })
    }
    return items
  }

  clear(): void {
    this.activity.clear()
    this.receipts.clear()
    this.cells.clear()
    this.provenance.clear()
  }

  private owned(facts: CallFacts): boolean {
    const source = facts.provenance
    if (source)
      return source.source === "extension" && this.providerPath(source.path)
    return this.receipts.get(facts.id) === facts.name
  }

  private providerPath(raw: string | undefined): boolean {
    if (!raw) return false
    const path = raw.startsWith("file:") ? fileURLToPath(raw) : raw
    const cached = this.provenance.get(path)
    if (cached !== undefined) return cached
    let directory = dirname(path)
    while (true) {
      try {
        const manifest = JSON.parse(
          readFileSync(join(directory, "package.json"), "utf8"),
        ) as { name?: string }
        const owned = manifest.name === "pi-codex-tools"
        this.provenance.set(path, owned)
        return owned
      } catch (error) {
        if (error instanceof SyntaxError) break
        if (object(error) && error["code"] !== "ENOENT") break
      }
      const parent = dirname(directory)
      if (parent === directory) break
      directory = parent
    }
    this.provenance.set(path, false)
    return false
  }

  private waitItem(
    facts: CallFacts,
    execution: CoreExecution | undefined,
  ): ActivityItem {
    const args = argumentsOf(facts.args)
    const cellId =
      typeof args["cell_id"] === "string" ? args["cell_id"] : undefined
    return {
      id: facts.id,
      kind: "collection",
      ...(cellId ? { target: cellId } : {}),
      status: facts.status,
      body: {
        name: "wait",
        args: {
          ...args,
          ...(execution ? { cell_status: execution.status } : {}),
        },
        cwd: facts.cwd,
        result: facts.result
          ? result(
              undefined,
              facts.result.isError,
              facts.result.content.filter(
                (part): part is ImagePart => part.type === "image",
              ),
            )
          : undefined,
      },
    }
  }

  private operationItems(
    facts: CallFacts,
    operation: CoreOperation,
    live: boolean,
    images: ImagePart[],
  ): ActivityItem[] {
    const ownStatus = status(operation.status, live)
    const cwd = operation.cwd ?? facts.cwd
    const providerChild =
      operation.toolSource === "extension" &&
      this.providerPath(operation.toolPath)
    if (
      providerChild &&
      operation.name === "apply_patch" &&
      operation.patchChanges?.length
    ) {
      return operation.patchChanges.map((change) => ({
        id: `${operation.id}:${change.id}`,
        kind: "edit",
        target: change.path,
        targetKey: resolve(cwd, change.path),
        status: change.status,
        ...(change.status === "completed" &&
        Number.isSafeInteger(change.added) &&
        Number.isSafeInteger(change.removed)
          ? { changes: { added: change.added!, removed: change.removed! } }
          : {}),
        body: {
          name: "apply_patch",
          args: {
            action: change.action,
            path: change.path,
            ...(change.destination ? { destination: change.destination } : {}),
          },
          cwd,
          result: result(change.output, change.status === "failed"),
          ...(change.outputOmitted || operation.patchOmitted
            ? { availability: "omitted" as const }
            : {}),
        },
      }))
    }
    if (providerChild && operation.name === "apply_patch") {
      return [
        {
          id: operation.id,
          kind: "edit",
          ...(operation.path
            ? {
                target: operation.path,
                targetKey: resolve(cwd, operation.path),
              }
            : {}),
          status: ownStatus,
          body: {
            name: "apply_patch",
            args: operation.effectiveArgs ?? {},
            cwd,
            result: result(
              operation.output ?? operation.resultText,
              ownStatus === "failed",
            ),
            ...(operation.patchOmitted || operation.outputOmitted
              ? { availability: "omitted" as const }
              : {}),
          },
        },
      ]
    }
    const args = operation.effectiveArgs ?? {}
    const contextArgs = {
      ...args,
      ...(operation.sessionId === undefined
        ? {}
        : { session_id: operation.sessionId }),
      ...(operation.exitCode === undefined
        ? {}
        : { exit_code: operation.exitCode }),
    }
    const text = operation.output ?? operation.resultText
    const item: ActivityItem = {
      id: operation.id,
      kind: providerChild && operation.name === "view_image" ? "image" : "tool",
      status: ownStatus,
      body: {
        name: operation.name,
        args: contextArgs,
        cwd,
        result: result(text, ownStatus === "failed", images),
        ...(operation.outputOmitted ? { availability: "omitted" } : {}),
      },
    }
    if (!providerChild) return [item]
    if (operation.name === "exec_command") {
      const command = operation.command ?? args["cmd"]
      if (typeof command === "string")
        Object.assign(item, describeCommand(command))
    } else if (operation.name === "view_image") {
      if (operation.path) item.target = operation.path
    } else if (operation.name === "write_stdin") {
      const chars = args["chars"]
      item.kind =
        typeof chars === "string" && chars.length ? "input" : "collection"
      if (operation.sessionId !== undefined)
        item.target = String(operation.sessionId)
      item.body.result =
        ownStatus === "failed"
          ? result(
              operation.exitCode === undefined
                ? "Process input failed"
                : `Process exited with code ${operation.exitCode}`,
              true,
            )
          : operation.exitCode === undefined
            ? undefined
            : result(`Process exited with code ${operation.exitCode}`, false)
      delete item.body.availability
    }
    return [item]
  }
}
