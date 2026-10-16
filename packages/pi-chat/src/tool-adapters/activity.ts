import { resolve } from "node:path"
import { Text } from "@earendil-works/pi-tui"
import { activityConfig } from "../config.ts"
import {
  activityType,
  readActivity,
  readActivityUpdate,
  type ActivityOperation,
  type ActivityUpdate,
} from "./activity-contract.ts"
import { describeCommands } from "./command.ts"
import {
  argumentsOf,
  type ActivityItem,
  type ActivityResult,
  type CallFacts,
} from "./types.ts"

type ImagePart = Extract<ActivityResult["content"][number], { type: "image" }>
type Observed = { operation: ActivityOperation; live: boolean }
type Source = Pick<ActivityUpdate, "callId" | "sessionId"> & {
  operations: Map<string, Observed>
}

function result(
  output: string | undefined,
  failed: boolean,
  images: ImagePart[],
): ActivityResult {
  return {
    content: [
      ...(output ? [{ type: "text" as const, text: output }] : []),
      ...images,
    ],
    isError: failed,
  }
}

const heading =
  (text: string): NonNullable<ActivityItem["body"]["renderers"]> =>
  () => ({
    renderCall: (_args, theme) =>
      new Text(theme.fg("toolTitle", theme.bold(text)), 0, 0),
  })

export class ActivityAdapter {
  private readonly sources = new Map<string, Source>()
  private readonly calls = new Map<string, string>()

  observe(type: string, data: unknown, live: boolean): string[] {
    const update = readActivityUpdate(
      type === activityType && live ? data : argumentsOf(data)["activity"],
    )
    if (!update) return []
    const source = this.sources.get(update.id) ?? {
      callId: update.callId,
      sessionId: update.sessionId,
      operations: new Map<string, Observed>(),
    }
    if (
      source.callId !== update.callId ||
      source.sessionId !== update.sessionId
    )
      return []
    for (const operation of update.operations) {
      const previous = source.operations.get(operation.id)
      if (
        !previous ||
        operation.revision > previous.operation.revision ||
        (operation.revision === previous.operation.revision &&
          live &&
          !previous.live)
      )
        source.operations.set(operation.id, { operation, live })
    }
    this.sources.set(update.id, source)
    this.calls.set(JSON.stringify([update.sessionId, update.callId]), update.id)
    return [update.callId]
  }

  describe(facts: CallFacts): ActivityItem[] | undefined {
    const verified = facts.result ? readActivity(facts.result) : undefined
    // Processed results cannot regain removed or invalidated metadata from live/history updates.
    if (facts.result && !verified) return
    const update = verified?.update
    if (update && update.callId !== facts.id) return
    // Forks retain the source session identity in their inherited result metadata.
    const sessionId = update?.sessionId ?? facts.sessionId
    const sourceId =
      update?.id ?? this.calls.get(JSON.stringify([sessionId, facts.id]))
    const source = sourceId ? this.sources.get(sourceId) : undefined
    if (!update && !source) return
    if (
      source &&
      (source.callId !== facts.id || source.sessionId !== sessionId)
    )
      return
    const operations = new Map<string, Observed>(
      (update?.operations ?? []).map((operation) => [
        operation.id,
        { operation, live: facts.status === "running" },
      ]),
    )
    for (const [id, observed] of source?.operations ?? []) {
      const previous = operations.get(id)
      if (!previous && update && observed.operation.revision <= update.revision)
        continue
      if (
        !previous ||
        observed.operation.revision > previous.operation.revision
      )
        operations.set(id, observed)
      else if (observed.operation.revision === previous.operation.revision)
        previous.live ||= observed.live
    }
    const images = new Map<string | null, ImagePart[]>()
    let imageIndex = 0
    for (const part of facts.result?.content ?? []) {
      if (part.type !== "image") continue
      const owner = verified?.imageOwners[imageIndex++] ?? null
      const parts = images.get(owner) ?? []
      parts.push(part)
      images.set(owner, parts)
    }
    let items = [...operations.values()]
      .toSorted((a, b) => a.operation.order - b.operation.order)
      .flatMap(({ operation, live }) =>
        this.items(facts, operation, live, images.get(operation.id) ?? []),
      )
    const failed = items.findLast(
      (item) => item.status === "failed" && item.kind !== "output",
    )
    if (failed) {
      for (const item of items) {
        if (item.kind !== "output") continue
        failed.body.result = {
          isError: true,
          content: [
            ...(failed.body.result?.content ?? []),
            { type: "text", text: activityConfig.body.callError },
            ...(item.body.result?.content ?? []),
            ...(item.body.availability === "omitted"
              ? [
                  {
                    type: "text" as const,
                    text: activityConfig.body.omitted,
                  },
                ]
              : []),
          ],
        }
      }
      items = items.filter((item) => item.kind !== "output")
    }
    const unowned = images.get(null)
    if (unowned?.length)
      items.push({
        id: `${sourceId}:images`,
        kind: "image",
        status: "completed",
        body: {
          name: "image",
          args: {},
          cwd: facts.cwd,
          result: result(undefined, false, unowned),
          renderers: heading(activityConfig.body.image),
        },
      })
    return items
  }

  clear(): void {
    this.sources.clear()
    this.calls.clear()
  }

  private items(
    facts: CallFacts,
    operation: ActivityOperation,
    live: boolean,
    images: ImagePart[],
  ): ActivityItem[] {
    const id = JSON.stringify([operation.id])
    const status =
      operation.status === "running" && !live ? "unknown" : operation.status
    const cwd = operation.cwd ?? facts.cwd
    const body: ActivityItem["body"] = {
      name: operation.kind,
      args: operation.args ?? {},
      cwd,
      result: result(operation.output, status === "failed", images),
      ...(operation.outputOmitted ? { availability: "omitted" } : {}),
    }
    if (operation.kind === "command")
      return operation.commands.flatMap((command, index) =>
        describeCommands(command, operation.shell).map((action, actionIndex) =>
          Object.assign(action, {
            id:
              index || actionIndex
                ? JSON.stringify([operation.id, index, actionIndex])
                : id,
            status,
            body: {
              ...body,
              args: { command },
              renderers: heading(command),
              ...(index || actionIndex
                ? { result: result(operation.output, status === "failed", []) }
                : {}),
            },
          }),
        ),
      )
    if (operation.kind === "edit" && operation.files)
      return operation.files.map((file, index) => ({
        id: JSON.stringify([operation.id, file.id]),
        kind: "edit",
        target: file.path,
        targetKey: resolve(cwd, file.path),
        status: file.status === "running" && !live ? "unknown" : file.status,
        ...(file.status === "completed" && file.changes
          ? { changes: file.changes }
          : {}),
        body: {
          name: "edit",
          args: file.args ?? { path: file.path },
          cwd,
          result: result(
            file.output,
            file.status === "failed",
            index ? [] : images,
          ),
          renderers: heading(file.path),
          ...(file.outputOmitted ? { availability: "omitted" } : {}),
        },
      }))
    if (operation.kind === "tool")
      return [
        {
          id,
          kind: "tool",
          target: operation.name,
          status,
          body: { ...body, name: operation.name },
        },
      ]
    if (operation.kind === "output") {
      if (status !== "failed" && !images.length) return []
      return [
        {
          id,
          kind: status === "failed" ? "output" : "image",
          status,
          body: {
            ...body,
            result: result(
              status === "failed" ? operation.output : undefined,
              status === "failed",
              images,
            ),
            renderers: heading(
              status === "failed"
                ? activityConfig.body.error
                : activityConfig.body.image,
            ),
          },
        },
      ]
    }
    return [
      {
        id,
        kind: operation.kind,
        target: operation.path,
        status,
        ...(operation.path ? { targetKey: resolve(cwd, operation.path) } : {}),
        body: {
          ...body,
          renderers: heading(
            operation.path ??
              (operation.kind === "image"
                ? activityConfig.body.image
                : activityConfig.body.edit),
          ),
        },
      },
    ]
  }
}
