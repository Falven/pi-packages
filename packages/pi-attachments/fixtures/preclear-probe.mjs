import { AsyncLocalStorage } from "node:async_hooks"
import { randomUUID } from "node:crypto"
import { stat } from "node:fs/promises"
import { basename, join, sep } from "node:path"
import { getAgentDir } from "@earendil-works/pi-coding-agent"
import { registerImages } from "../src/images.ts"
import {
  attachmentPaths,
  fileDestination,
  fileReferences,
} from "../src/references.ts"
import { saveRequest, saveSnapshot } from "../src/recovery.ts"

function isPromptEditor(component) {
  return (
    typeof component.getText === "function" &&
    typeof component.insertTextAtCursor === "function" &&
    typeof component.getExpandedText === "function" &&
    typeof component.onSubmit === "function" &&
    component.actionHandlers instanceof Map &&
    component.actionHandlers.has("app.message.followUp")
  )
}

function findEditorParent(component) {
  for (const child of component.children ?? []) {
    if (isPromptEditor(child)) return { editor: child, parent: component }
    const found = findEditorParent(child)
    if (found) return found
  }
}

export function findEditor(component) {
  return findEditorParent(component)?.editor
}

function movedRange(before, after, range) {
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
  if (range.from >= oldEnd)
    return {
      from: range.from + newEnd - oldEnd,
      to: range.to + newEnd - oldEnd,
    }
}

function nativePieces(editor) {
  const raw = editor.getText()
  const pieces = []
  let rawStart = 0
  let expandedStart = 0
  for (const marker of raw.matchAll(
    /\[paste #(\d+)( (?:\+\d+ lines|\d+ chars))?\]/g,
  )) {
    const pasteId = Number(marker[1])
    const paste = editor.pastes.get(pasteId)
    if (paste === undefined) continue
    const ordinary = raw.slice(rawStart, marker.index)
    pieces.push({ text: ordinary, rawStart, expandedStart })
    expandedStart += ordinary.length
    pieces.push({
      text: paste,
      marker: marker[0],
      pasteId,
      rawStart: marker.index,
      expandedStart,
    })
    expandedStart += paste.length
    rawStart = marker.index + marker[0].length
  }
  pieces.push({ text: raw.slice(rawStart), rawStart, expandedStart })
  const ids = pieces.flatMap((piece) =>
    piece.pasteId === undefined ? [] : [piece.pasteId],
  )
  if (
    new Set(ids).size !== ids.length ||
    pieces.map((piece) => piece.text).join("") !== editor.getExpandedText()
  ) {
    throw new Error("Ambiguous native paste markers")
  }
  return pieces
}

function nativePasteIds(pieces, range) {
  return pieces.flatMap((piece) =>
    piece.pasteId !== undefined &&
    range.from < piece.expandedStart + piece.text.length &&
    range.to > piece.expandedStart
      ? [piece.pasteId]
      : [],
  )
}

function replaceNativeRange(editor, edit, replacement) {
  const pieces = nativePieces(editor)
  if (
    JSON.stringify(nativePasteIds(pieces, edit)) !==
    JSON.stringify(edit.pasteIds)
  )
    return false
  const cursor =
    editor.state.lines
      .slice(0, editor.state.cursorLine)
      .reduce((length, line) => length + line.length + 1, 0) +
    editor.state.cursorCol
  const cursorPiece = pieces.find(
    (piece) => cursor <= piece.rawStart + (piece.marker ?? piece.text).length,
  )
  const expandedCursor =
    cursorPiece.expandedStart +
    (cursorPiece.marker
      ? cursor === cursorPiece.rawStart
        ? 0
        : cursorPiece.text.length
      : cursor - cursorPiece.rawStart)
  const nextExpandedCursor =
    expandedCursor <= edit.from
      ? expandedCursor
      : expandedCursor >= edit.to
        ? expandedCursor + replacement.length - (edit.to - edit.from)
        : edit.from + replacement.length
  let inserted = false
  for (const piece of pieces) {
    const end = piece.expandedStart + piece.text.length
    if (edit.from >= end || edit.to <= piece.expandedStart) continue
    const from = Math.max(0, edit.from - piece.expandedStart)
    const to = Math.min(piece.text.length, edit.to - piece.expandedStart)
    piece.text =
      piece.text.slice(0, from) +
      (inserted ? "" : replacement) +
      piece.text.slice(to)
    inserted = true
  }
  let raw = ""
  let expanded = 0
  let nextCursor
  const pastes = new Map(editor.pastes)
  for (const piece of pieces) {
    if (piece.marker && !piece.text) continue
    const part = piece.marker ?? piece.text
    if (
      nextCursor === undefined &&
      nextExpandedCursor <= expanded + piece.text.length
    ) {
      nextCursor =
        raw.length +
        (piece.marker
          ? nextExpandedCursor === expanded
            ? 0
            : part.length
          : nextExpandedCursor - expanded)
    }
    if (piece.marker) pastes.set(piece.pasteId, piece.text)
    raw += part
    expanded += piece.text.length
  }
  // Public insertion cannot replace an expanded range while retaining paste storage, caret, and undo.
  editor.cancelAutocomplete()
  editor.lastAction = null
  editor.exitHistoryBrowsing()
  editor.pushUndoSnapshot()
  editor.state.lines = raw.split("\n")
  editor.pastes = pastes
  const prefix = raw.slice(0, nextCursor).split("\n")
  editor.state.cursorLine = prefix.length - 1
  editor.setCursorCol(prefix.at(-1).length)
  editor.onChange?.(editor.getText())
  return true
}

function referenceReplacement(reference, path) {
  const destination = fileDestination(path)
  return reference.label === undefined
    ? destination
    : `[${reference.label.replace(/[\\[\]`*_]/g, "\\$&")}](${destination})`
}

export function preclearProbe({ waitForStreamingAtEnd = false } = {}) {
  return (pi) => {
    let dispose
    const originals = new WeakMap()
    const unwrap = (callback) => originals.get(callback) ?? callback
    const storage = join(getAgentDir(), "retained")
    const lifetime = new AbortController()
    const { prepare } = registerImages(
      pi,
      storage,
      lifetime.signal,
      (ctx) => attachmentPaths(ctx.ui.getEditorText(), storage, ctx.cwd),
      () => "medium",
    )
    pi.on("session_shutdown", () => {
      dispose?.()
      lifetime.abort()
    })
    pi.on("session_start", (_event, ctx) => {
      dispose?.()
      ctx.ui.setWidget("attachment-send-experiment", (tui) => {
        let selected
        let installed
        const draftRegistries = new WeakMap()
        let parent
        let detachParent
        let ended = false
        let scheduled = false
        let customPrompt

        function install(editor) {
          const dispatch = new AsyncLocalStorage()
          const restorations = []
          let stopped = false
          let applying = false
          let replaced = false
          let restoring = false
          let returnedPrompt
          let restoredDraft
          let revision = 0
          const drafts = draftRegistries.get(editor) ?? new Map()
          draftRegistries.set(editor, drafts)
          let current = { text: editor.getExpandedText(), references: [] }
          const submissions = new Map()
          const completions = new Map()
          const idleWaits = new Set()
          const pendingEdits = new Set()
          if (waitForStreamingAtEnd)
            restorations.push(
              pi.on("input", async () => {
                const request = dispatch.getStore()
                await request?.beforeInput
                if (stopped || request?.signal?.aborted)
                  return { action: "handled" }
                return undefined
              }),
            )
          if (waitForStreamingAtEnd)
            restorations.push(
              pi.on("agent_end", async (_endEvent, runContext) => {
                const signal = runContext.signal
                for (;;) {
                  if (stopped || signal?.aborted) return
                  const steering = submissions.get("steer")
                  const followUp = submissions.get("followUp")
                  if (!steering && !followUp) return
                  // Keep the native streaming route until already-requested Sends finish preparation.
                  // eslint-disable-next-line no-await-in-loop -- Newly requested Sends may join before this run settles.
                  await new Promise((resolve) => {
                    const finish = () => {
                      signal?.removeEventListener("abort", finish)
                      idleWaits.delete(finish)
                      resolve()
                    }
                    signal?.addEventListener("abort", finish, { once: true })
                    idleWaits.add(finish)
                    void Promise.all([steering, followUp]).then(finish)
                  })
                  if (
                    submissions.get("steer") === steering &&
                    submissions.get("followUp") === followUp
                  )
                    return
                }
              }),
            )
          function wrap(name, value, target = editor) {
            const descriptor = Object.getOwnPropertyDescriptor(target, name)
            if (
              descriptor &&
              "value" in descriptor &&
              typeof descriptor.value === "function"
            )
              descriptor.value = unwrap(descriptor.value)
            originals.set(value, unwrap(target[name]))
            Object.defineProperty(target, name, {
              value,
              writable: true,
              configurable: true,
            })
            restorations.push(() => {
              if (target[name] !== value) return
              if (descriptor) Object.defineProperty(target, name, descriptor)
              else Reflect.deleteProperty(target, name)
            })
          }
          const originalChange = unwrap(editor.onChange)
          const originalSetText = unwrap(editor.setText)
          const originalSubmit = unwrap(editor.onSubmit)
          const originalExpandedText = unwrap(editor.getExpandedText)
          const originalFollowUp = unwrap(
            editor.actionHandlers.get("app.message.followUp"),
          )
          const submitName =
            typeof editor.submitDraft === "function"
              ? "submitDraft"
              : "submitValue"
          const originalSubmitValue = unwrap(editor[submitName])
          const composer = submitName === "submitDraft"
          const identity = () =>
            composer
              ? editor.getEditorTextIdentity()
              : (editor.state.piAttachmentsDraftId ??= randomUUID())

          if (!composer) {
            // Cloneable metadata follows Pi's own undo snapshots without a parallel history.
            identity()
            const pop = editor.undoStack.pop
            wrap(
              "pop",
              function () {
                const snapshot = pop.call(this)
                if (snapshot)
                  snapshot.state.piAttachmentsDraftId ??= randomUUID()
                return snapshot
              },
              editor.undoStack,
            )
            const undo = editor.undo
            wrap("undo", function () {
              restoring = true
              try {
                return undo.call(this)
              } finally {
                restoring = false
              }
            })
            const navigate = editor.navigateHistory
            wrap("navigateHistory", function (direction) {
              restoring = this.historyIndex - direction === -1
              replaced = !restoring
              try {
                return navigate.call(this, direction)
              } finally {
                restoring = false
                replaced = false
              }
            })
          }

          function replace(edit, text) {
            if (!pendingEdits.delete(edit) || stopped) return false
            const before = editor.getExpandedText()
            if (before.slice(edit.from, edit.to) !== edit.expected) return false
            if (edit.operation) {
              applying = true
              try {
                return edit.operation.replace(text)
              } finally {
                applying = false
              }
            }
            applying = true
            try {
              const changed = replaceNativeRange(editor, edit, text)
              tui.requestRender()
              return changed
            } finally {
              applying = false
            }
          }

          function followCapture(reference, text, capture) {
            const edit = {
              ...reference.destination,
              expected: text.slice(
                reference.destination.from,
                reference.destination.to,
              ),
            }
            if (composer)
              edit.operation = editor.captureEditorEdit(edit.from, edit.to)
            else edit.pasteIds = nativePasteIds(nativePieces(editor), edit)
            pendingEdits.add(edit)
            void capture
              .then((saved) => {
                if (saved)
                  replace(edit, referenceReplacement(reference, saved.paths[0]))
              })
              .catch((error) => {
                if (!stopped)
                  ctx.ui.notify(
                    `Attachment capture failed: ${String(error)}`,
                    "error",
                  )
              })
          }

          function observe() {
            const text = editor.getExpandedText()
            const token = identity()
            const known = drafts.get(token)
            if (known) {
              pendingEdits.clear()
              current = known
              return
            }
            for (const edit of pendingEdits) {
              const moved = !replaced && movedRange(current.text, text, edit)
              if (moved) Object.assign(edit, moved)
              else pendingEdits.delete(edit)
            }
            const previous = current
            current = {
              text,
              references: fileReferences(text, ctx.cwd, storage).map(
                (reference) => {
                  const older =
                    !replaced &&
                    previous.references.find(({ reference: earlier }) => {
                      const moved = movedRange(
                        previous.text,
                        text,
                        earlier.destination,
                      )
                      return (
                        earlier.path === reference.path &&
                        moved?.from === reference.destination.from &&
                        moved.to === reference.destination.to
                      )
                    })
                  if (older) return { reference, capture: older.capture }
                  if (reference.path.startsWith(storage + sep) || restoring)
                    return { reference }
                  const captureRequest = {
                    sessionId: ctx.sessionManager.getSessionId(),
                    sessionFile: ctx.sessionManager.getSessionFile(),
                    cwd: ctx.cwd,
                    text,
                    snapshots: [
                      { name: basename(reference.path), path: reference.path },
                    ],
                  }
                  const capture = (async () => {
                    const file = await stat(reference.path).catch((error) => {
                      if (error.code === "ENOENT" || error.code === "ENOTDIR")
                        return undefined
                      throw error
                    })
                    if (!file?.isFile()) return undefined
                    return saveSnapshot(storage, captureRequest)
                  })()
                  followCapture(reference, text, capture)
                  return { reference, capture }
                },
              ),
            }
            drafts.set(token, current)
          }

          wrap("onChange", function (...args) {
            if (stopped || this !== editor)
              return originalChange?.apply(this, args)
            if (!applying) revision++
            if (!composer && !restoring)
              editor.state.piAttachmentsDraftId =
                restoredDraft?.token ?? randomUUID()
            if (restoredDraft) drafts.set(identity(), restoredDraft.draft)
            observe()
            return originalChange?.apply(this, args)
          })
          wrap("setText", function (text) {
            if (dispatch.getStore()?.preserve && text === "") return
            const prompt = returnedPrompt
            returnedPrompt = undefined
            if (
              prompt &&
              text === prompt.raw &&
              drafts.get(prompt.token) === prompt.draft
            ) {
              // A custom dialog restores its saved draft after reinserting this same editor.
              if (revision === prompt.revision) return
              restoredDraft = prompt
              try {
                originalSetText.call(this, text)
              } finally {
                restoredDraft = undefined
              }
              for (const { reference, capture } of prompt.draft.references) {
                if (capture)
                  followCapture(reference, prompt.draft.text, capture)
              }
              return
            }
            replaced = true
            try {
              return originalSetText.call(this, text)
            } finally {
              replaced = false
            }
          })
          wrap("getExpandedText", function () {
            const request = dispatch.getStore()
            if (request?.readOnce) {
              request.readOnce = false
              return request.text
            }
            return originalExpandedText.call(this)
          })
          function submit(followUp = false) {
            const request = current
            if (!request.text.trim()) return
            // Reload must reach native teardown even when an earlier model request is still preparing.
            if (
              request.text.trim() === "/reload" &&
              (!followUp || ctx.isIdle())
            ) {
              return followUp
                ? originalFollowUp()
                : originalSubmitValue.call(editor)
            }
            const requestedRevision = revision
            const route = ctx.isIdle()
              ? "normal"
              : followUp
                ? "followUp"
                : "steer"
            const requestSignal =
              waitForStreamingAtEnd && route !== "normal"
                ? ctx.signal
                : undefined
            const requestContext = {
              sessionId: ctx.sessionManager.getSessionId(),
              sessionFile: ctx.sessionManager.getSessionFile(),
              cwd: ctx.cwd,
              streamingBehavior: route === "normal" ? undefined : route,
            }
            ctx.ui.setStatus(
              "attachment-send-experiment",
              "Preparing attachments…",
            )
            const handoff = Promise.withResolvers()
            const beforeInput = completions.get(route)
            const submitted = (
              submissions.get(route) ?? Promise.resolve()
            ).then(async () => {
              try {
                let text = request.text
                const captures = await Promise.all(
                  request.references.map(async ({ reference, capture }) => ({
                    reference,
                    saved: await capture,
                  })),
                )
                for (const { reference, saved } of captures.toSorted(
                  (left, right) =>
                    right.reference.destination.from -
                    left.reference.destination.from,
                )) {
                  if (saved)
                    text =
                      text.slice(0, reference.destination.from) +
                      referenceReplacement(reference, saved.paths[0]) +
                      text.slice(reference.destination.to)
                }
                if (stopped || requestSignal?.aborted) return
                if (attachmentPaths(text, storage, ctx.cwd).length)
                  await prepare(
                    {
                      text,
                      streamingBehavior: requestContext.streamingBehavior,
                    },
                    ctx,
                  )
                else await saveRequest(storage, { ...requestContext, text })
                if (stopped || requestSignal?.aborted) return
                while (!ctx.isIdle()) {
                  if (route !== "normal" || stopped) break
                  ctx.ui.setStatus(
                    "attachment-send-experiment",
                    "Waiting for Pi to finish…",
                  )
                  // eslint-disable-next-line no-await-in-loop -- Recheck public idle state after each lifecycle wake.
                  await new Promise((resolve) => {
                    const finish = () => {
                      clearTimeout(timer)
                      unsubscribe()
                      idleWaits.delete(finish)
                      resolve()
                    }
                    const unsubscribe = pi.on("agent_settled", finish)
                    // Manual compaction can become idle without agent_settled.
                    const timer = setTimeout(finish, 50)
                    idleWaits.add(finish)
                  })
                }
                if (stopped || requestSignal?.aborted) return
                const preserve = revision !== requestedRevision
                if (!preserve && !followUp) {
                  editor.onSubmit = undefined
                  try {
                    originalSubmitValue.call(editor)
                  } finally {
                    editor.onSubmit = originalSubmit
                  }
                }
                const dispatched = dispatch.run(
                  {
                    preserve,
                    text,
                    readOnce: followUp,
                    beforeInput,
                    signal: requestSignal,
                  },
                  () =>
                    followUp
                      ? originalFollowUp()
                      : originalSubmit.call(editor, text),
                )
                handoff.resolve()
                await dispatched
              } catch (error) {
                if (!stopped)
                  ctx.ui.notify(
                    `Attachment request not sent: ${String(error)}`,
                    "error",
                  )
              } finally {
                handoff.resolve()
                if (!stopped)
                  ctx.ui.setStatus("attachment-send-experiment", undefined)
              }
            })
            if (waitForStreamingAtEnd && route !== "normal") {
              submissions.set(route, handoff.promise)
              completions.set(
                route,
                Promise.all([beforeInput, submitted]).then(() => {}),
              )
            } else submissions.set(route, submitted)
          }
          wrap(submitName, () => submit())
          const followUp = () => submit(true)
          originals.set(followUp, originalFollowUp)
          editor.actionHandlers.set("app.message.followUp", followUp)
          restorations.push(() => {
            if (editor.actionHandlers.get("app.message.followUp") === followUp)
              editor.actionHandlers.set(
                "app.message.followUp",
                originalFollowUp,
              )
          })
          observe()
          const change = editor.onChange
          const submitValue = editor[submitName]
          return {
            attached: () =>
              editor.onChange === change &&
              editor[submitName] === submitValue &&
              editor.actionHandlers.get("app.message.followUp") === followUp &&
              editor.onSubmit === originalSubmit,
            prompt: () => ({
              token: identity(),
              draft: current,
              raw: editor.getText(),
              revision,
            }),
            reinsert(prompt) {
              returnedPrompt = prompt
              queueMicrotask(() => {
                returnedPrompt = undefined
              })
            },
            dispose() {
              stopped = true
              for (const finish of idleWaits) finish()
              for (const restore of restorations.toReversed()) restore()
            },
          }
        }

        function attach(editor) {
          if (ended) return
          // A reused instance may have had native callbacks and actions rewired.
          if (selected === editor && installed?.attached()) return
          installed?.dispose()
          selected = editor
          installed = install(editor)
        }
        function discover() {
          if (ended) return
          const found = findEditorParent(tui)
          if (!found) return
          if (parent !== found.parent) {
            detachParent?.()
            parent = found.parent
            const original = parent.addChild
            const descriptor = Object.getOwnPropertyDescriptor(
              parent,
              "addChild",
            )
            const observed = parent
            const addChild = function (component) {
              const result = original.call(this, component)
              if (isPromptEditor(component)) {
                if (
                  customPrompt?.editor === component &&
                  selected === component &&
                  installed?.attached()
                )
                  installed.reinsert(customPrompt.state)
                // Native custom-dialog restoration sets its saved text after addChild.
                queueMicrotask(() => {
                  if (!ended && observed.children.includes(component))
                    attach(component)
                })
              }
              return result
            }
            parent.addChild = addChild
            detachParent = () => {
              if (observed.addChild !== addChild) return
              if (descriptor)
                Object.defineProperty(observed, "addChild", descriptor)
              else Reflect.deleteProperty(observed, "addChild")
            }
          }
          if (selected !== found.editor) attach(found.editor)
        }
        const stopPromptStart = pi.on("ui_prompt_start", (event) => {
          if (event.kind === "custom" && selected)
            customPrompt = { editor: selected, state: installed.prompt() }
        })
        const unsubscribe = pi.on("ui_prompt_end", () => {
          customPrompt = undefined
          discover()
        })
        const cleanup = () => {
          ended = true
          unsubscribe()
          stopPromptStart()
          detachParent?.()
          installed?.dispose()
        }
        dispose = cleanup
        discover()
        return {
          render() {
            if (!selected && !scheduled && !ended) {
              scheduled = true
              queueMicrotask(() => {
                scheduled = false
                discover()
              })
            }
            return []
          },
          invalidate() {},
          dispose: cleanup,
        }
      })
    })
  }
}

export default preclearProbe()
