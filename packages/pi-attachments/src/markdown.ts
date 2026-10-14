import { stat } from "node:fs/promises"
import { basename, sep } from "node:path"
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent"
import {
  attachmentReferences,
  fileDestination,
  fileReferences,
} from "./references.ts"
import { saveRequest, saveSnapshot } from "./recovery.ts"

type Reference = ReturnType<typeof fileReferences>[number]
type Outcome =
  | { saved: Awaited<ReturnType<typeof saveSnapshot>> }
  | { retainedPath: string }
  | { unchanged: true }
  | { error: string }
  | undefined
type Capture = {
  promise: Promise<Outcome>
  outcome?: Outcome
  submitted: boolean
}
type Draft = {
  text: string
  sessionId: string
  references: { reference: Reference; capture?: Capture }[]
  prepared?: Promise<{ text: string; errors: string[] }>
}

function replacement(reference: Reference, path: string): string {
  const destination = fileDestination(path)
  return reference.label === undefined
    ? destination
    : `[${reference.label.replace(/[\\[\]`*_]/g, "\\$&")}](${destination})`
}

function movedRange(
  before: string,
  after: string,
  range: Reference["destination"],
) {
  let from = 0
  while (
    from < before.length &&
    from < after.length &&
    before[from] === after[from]
  )
    from++
  let oldEnd = before.length
  let newEnd = after.length
  while (
    oldEnd > from &&
    newEnd > from &&
    before[oldEnd - 1] === after[newEnd - 1]
  ) {
    oldEnd--
    newEnd--
  }
  if (range.to <= from) return range
  const delta = newEnd - oldEnd
  if (range.from >= oldEnd)
    return { from: range.from + delta, to: range.to + delta }
  return undefined
}

export function registerMarkdown(
  pi: ExtensionAPI,
  storage: string,
  signal: AbortSignal,
) {
  const drafts = new WeakMap<object, Draft>()

  async function preserve(
    path: string,
    text: string,
    ctx: ExtensionContext,
  ): Promise<Outcome> {
    const request = {
      sessionId: ctx.sessionManager.getSessionId(),
      sessionFile: ctx.sessionManager.getSessionFile(),
      cwd: ctx.cwd,
      text,
      snapshots: [
        { name: basename(path).replaceAll(/[<>[\]\\\p{Cc}]/gu, "_"), path },
      ],
    }
    try {
      const file = await stat(path).catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT" || error.code === "ENOTDIR")
          return undefined
        throw error
      })
      if (!file?.isFile()) return undefined
      return { saved: await saveSnapshot(storage, request) }
    } catch (error) {
      const message = `Could not attach ${path}: ${String(error)}\nUse /attachments-recover to retry retained contents.`
      if (!signal.aborted) ctx.ui.notify(message, "error")
      return { error: message }
    }
  }

  function prepare(draft: Draft) {
    for (const { capture } of draft.references)
      if (capture) capture.submitted = true
    return (draft.prepared ??= Promise.all(
      draft.references.map(async ({ reference, capture }) => ({
        reference,
        outcome: await capture?.promise,
      })),
    ).then((results) => {
      const destinations = new Map<number, { to: number; text: string }>()
      const errors = new Set<string>()
      for (const { reference, outcome } of results) {
        if (outcome && "error" in outcome) errors.add(outcome.error)
        else if (outcome && !("unchanged" in outcome)) {
          const path =
            "saved" in outcome ? outcome.saved.paths[0]! : outcome.retainedPath
          destinations.set(reference.destination.from, {
            to: reference.destination.to,
            text: replacement(reference, path),
          })
        }
      }
      let text = draft.text
      for (const [from, edit] of [...destinations].toSorted(
        ([left], [right]) => right - left,
      ))
        text = text.slice(0, from) + edit.text + text.slice(edit.to)
      return { text, errors: [...errors] }
    }))
  }

  pi.on("input_prepare", async (event, ctx) => {
    if (!event.editorTextIdentity) return undefined
    const sessionId = ctx.sessionManager.getSessionId()
    const draft = drafts.get(event.editorTextIdentity)
    if (
      draft?.sessionId !== sessionId ||
      !draft.references.some(({ capture }) => capture)
    )
      return undefined
    const prepared = await prepare(draft)
    const text = prepared.text.trim()
    if (prepared.errors.length) {
      let reason = `Attachment request not sent: ${prepared.errors.join("\n")}`
      try {
        reason += `\nRequest saved: ${await saveRequest(storage, {
          ...event,
          text,
          sessionId,
          sessionFile: ctx.sessionManager.getSessionFile(),
          cwd: ctx.cwd,
        })}`
      } catch (error) {
        reason += `\nCould not save recovery: ${String(error)}\nContents retained in memory until Pi exits; use /attachments-recover.`
      }
      return { action: "reject", reason }
    }
    return { action: "transform", text }
  })

  return {
    observe(ctx: ExtensionContext) {
      let previous: Draft | undefined
      let history: Promise<void> | undefined
      return {
        change(origin?: string, replaced = false) {
          if (signal.aborted) return
          const text = ctx.ui.getEditorText()
          const identity = ctx.ui.getEditorTextIdentity()
          const sessionId = ctx.sessionManager.getSessionId()
          let draft = drafts.get(identity)
          if (!draft) {
            draft = { text, sessionId, references: [] }
            const captures = new Map<string, Capture>()
            const destinations = new Set<number>()
            for (const reference of fileReferences(text, ctx.cwd, storage)) {
              const earlier =
                !replaced &&
                previous?.sessionId === sessionId &&
                previous.text !== text
                  ? previous.references.find(({ reference: old }) => {
                      if (old.path !== reference.path) return false
                      const moved = movedRange(
                        previous!.text,
                        text,
                        old.destination,
                      )
                      return (
                        moved?.from === reference.destination.from &&
                        moved.to === reference.destination.to
                      )
                    })
                  : undefined
              if (reference.legacyPath) {
                if (
                  earlier?.reference.legacyPath === reference.legacyPath &&
                  earlier.capture
                ) {
                  draft.references.push({ reference, capture: earlier.capture })
                  continue
                }
                const edit = ctx.ui.captureEditorEdit(
                  reference.destination.from,
                  reference.destination.to,
                )
                // Resolve historical literal-entity filenames on entry, never during rendering.
                const promise: Promise<Outcome> = stat(reference.legacyPath)
                  .then((file) => {
                    if (!file.isFile()) return { unchanged: true } as const
                    const path = reference.legacyPath!
                    if (!signal.aborted)
                      edit.replace(replacement(reference, path))
                    return { retainedPath: path }
                  })
                  .catch((error: NodeJS.ErrnoException) => {
                    if (error.code === "ENOENT" || error.code === "ENOTDIR")
                      return { unchanged: true } as const
                    const message = `Could not restore attachment ${reference.legacyPath}: ${String(error)}`
                    if (!signal.aborted) ctx.ui.notify(message, "error")
                    return { error: message }
                  })
                const capture: Capture = { promise, submitted: false }
                void promise.then((outcome) => {
                  capture.outcome = outcome
                })
                draft.references.push({ reference, capture })
                continue
              }
              if (reference.path.startsWith(storage + sep)) {
                draft.references.push({ reference })
                continue
              }
              let capture = earlier?.capture
              if (!capture && origin !== "undo" && origin !== "redo") {
                capture = captures.get(reference.path)
                if (!capture) {
                  const promise = preserve(reference.path, text, ctx)
                  const work: Capture = { promise, submitted: false }
                  void promise.then((outcome) => {
                    work.outcome = outcome
                  })
                  captures.set(reference.path, work)
                  capture = work
                }
                if (!destinations.has(reference.destination.from)) {
                  destinations.add(reference.destination.from)
                  const edit = ctx.ui.captureEditorEdit(
                    reference.destination.from,
                    reference.destination.to,
                  )
                  const work = capture
                  void work.promise.then((outcome) => {
                    if (!outcome || !("saved" in outcome) || signal.aborted)
                      return
                    if (
                      !edit.replace(
                        replacement(reference, outcome.saved.paths[0]!),
                      ) &&
                      !work.submitted
                    )
                      ctx.ui.notify(
                        `The requesting draft changed. Snapshot retained: ${outcome.saved.reference}\nRequest saved: ${outcome.saved.recovery}`,
                        "warning",
                      )
                  })
                }
              }
              draft.references.push({
                reference,
                ...(capture ? { capture } : {}),
              })
            }
            drafts.set(identity, draft)
          }
          previous = draft
        },
        addToHistory(
          text: string,
          identity: object | undefined,
          add: (text: string) => void,
        ) {
          if (signal.aborted) {
            add(text)
            return
          }
          const draft = identity ? drafts.get(identity) : undefined
          if (
            draft?.sessionId !== ctx.sessionManager.getSessionId() ||
            !draft.references.some(({ capture }) => capture)
          ) {
            if (history) history = history.then(() => add(text))
            else add(text)
            return
          }
          const prepared = prepare(draft)
          const pending = (history ?? Promise.resolve()).then(async () =>
            add((await prepared).text),
          )
          history = pending
          void pending.finally(() => {
            if (history === pending) history = undefined
          })
        },
      }
    },
    references(text: string, ctx: ExtensionContext) {
      const draft = drafts.get(ctx.ui.getEditorTextIdentity())
      if (!draft || draft.text !== text)
        return attachmentReferences(text, storage, ctx.cwd)
      return draft.references.flatMap(({ reference, capture }) => {
        const outcome = capture?.outcome
        if (reference.legacyPath && (!outcome || "error" in outcome)) return []
        const path =
          outcome && "saved" in outcome
            ? outcome.saved.paths[0]!
            : outcome && "retainedPath" in outcome
              ? outcome.retainedPath
              : reference.path
        return path.startsWith(storage + sep) ? [{ ...reference, path }] : []
      })
    },
  }
}
