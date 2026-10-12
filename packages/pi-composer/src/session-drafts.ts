import { existsSync } from "node:fs"
import { join } from "node:path"
import { getAgentDir, type ExtensionAPI } from "@earendil-works/pi-coding-agent"
import { Clipboard } from "./clipboard.ts"
import { SourceEditor, type DraftHistory } from "./source-editor.ts"
import {
  checkpointType,
  isCheckpoint,
  readDrafts,
  writeDraft,
  type DraftCheckpoint,
} from "./session-draft-storage.ts"

// Pi reloads extension modules when the cwd or resources change.
const historiesKey = Symbol.for("pi-composer:histories")
const processState = globalThis as typeof globalThis & {
  [historiesKey]?: Map<string, DraftHistory>
}
const histories = (processState[historiesKey] ??= new Map())

export function sessionDrafts(pi: ExtensionAPI): void {
  const directory = join(getAgentDir(), "pi-composer", "drafts")
  let editor: SourceEditor | undefined
  let clipboard: Clipboard | undefined
  let historyKey: string | undefined
  let active = false
  let revision = 0
  let clearedDrafts: string[] = []
  let flush: (() => Promise<boolean>) | undefined
  const recoveryAbort = new AbortController()
  pi.on("session_start", (_event, ctx) => {
    if (ctx.mode !== "tui") return
    clipboard?.deactivate()
    const currentClipboard = new Clipboard(ctx)
    clipboard = currentClipboard
    const sessionId = ctx.sessionManager.getSessionId()
    const sessionFile = ctx.sessionManager.getSessionFile()
    const cwd = ctx.cwd
    historyKey = `${directory}\0${sessionId}`
    let checkpoint: DraftCheckpoint | undefined
    for (const entry of ctx.sessionManager.getEntries()) {
      if (
        entry.type === "custom" &&
        entry.customType === checkpointType &&
        isCheckpoint(entry.data) &&
        entry.data.sessionId === sessionId
      ) {
        checkpoint = entry.data
      }
    }
    if (sessionFile) {
      const recovery = readDrafts(directory)
      for (const error of recovery.errors) ctx.ui.notify(error, "error")
      const saved = recovery.drafts.find(
        (draft) => draft.sessionId === sessionId,
      )
      if (saved && (!checkpoint || saved.revision > checkpoint.revision)) {
        checkpoint = saved
      }
      if (
        recovery.drafts.some(
          (draft) =>
            draft.sessionId !== sessionId &&
            (draft.text || draft.clearedDrafts?.length) &&
            !existsSync(draft.sessionFile),
        )
      ) {
        ctx.ui.notify(
          "Saved drafts are available. Use /composer-recover to recover a draft.",
        )
      }
    }
    const history = histories.get(historyKey)
    const text = checkpoint?.text ?? history?.draft.text ?? ""
    clearedDrafts = checkpoint?.clearedDrafts ?? []
    revision = checkpoint?.revision ?? 0
    let latest: DraftCheckpoint | undefined
    let savedRevision = revision
    let timer: NodeJS.Timeout | undefined
    let saving: Promise<boolean> | undefined
    flush = () => {
      clearTimeout(timer)
      if (saving) return saving
      saving = (async () => {
        let saved = true
        for (
          let draft = latest;
          draft && draft.revision !== savedRevision;
          draft = latest
        ) {
          saved = true
          try {
            // oxlint-disable-next-line no-await-in-loop -- Keep each session's writes in revision order.
            await writeDraft(directory, draft)
          } catch (error) {
            saved = false
            ctx.ui.notify(
              `Could not save draft recovery in ${directory}: ${String(error)}`,
              "error",
            )
          }
          try {
            pi.appendEntry(checkpointType, draft)
          } catch (error) {
            saved = false
            ctx.ui.notify(
              `Could not save session draft: ${String(error)}`,
              "error",
            )
          }
          if (saved) savedRevision = draft.revision
          else if (latest === draft) break
        }
        return saved
      })().finally(() => {
        saving = undefined
      })
      return saving
    }
    const changed = (draft: string) => {
      if (!active) return
      revision++
      if (!sessionFile) return
      latest = {
        version: 1,
        sessionId,
        sessionFile,
        cwd,
        revision,
        text: draft,
        clearedDrafts: [...clearedDrafts],
      }
      clearTimeout(timer)
      timer = setTimeout(() => {
        void flush?.()
      }, 150)
      timer.unref()
    }
    ctx.ui.setEditorComponent((tui, theme, keybindings) => {
      const previous = editor?.getDraftHistory()
      const next = new SourceEditor(tui, theme, keybindings, currentClipboard)
      if (previous) next.restoreDraft(previous.draft.text, previous)
      editor = next
      next.onDraftChange = (draft) => {
        if (editor === next) changed(draft)
      }
      next.onDraftClear = (draft) => {
        // shortcut: Pi cannot acknowledge each submission; keep cleared drafts for explicit recovery.
        if (active && editor === next) clearedDrafts.push(draft)
      }
      return next
    })
    editor!.restoreDraft(
      text,
      history?.draft.text === text ? history : undefined,
    )
    active = true
  })

  pi.on("session_before_switch", async () => ({
    cancel: (await flush?.()) === false,
  }))
  pi.on("session_before_fork", async () => ({
    cancel: (await flush?.()) === false,
  }))
  pi.on("session_shutdown", async () => {
    clipboard?.deactivate()
    await flush?.()
    active = false
    recoveryAbort.abort()
    if (!editor || !historyKey) return
    histories.set(historyKey, editor.getDraftHistory())
    editor.onDraftChange = undefined
    editor.onDraftClear = undefined
  })

  pi.registerCommand("composer-recover", {
    description: "Recover a cleared draft or a draft from an unsaved session",
    handler: async (_args, ctx) => {
      if (!active || !editor) return
      const requestedRevision = revision
      const recovery = readDrafts(directory)
      for (const error of recovery.errors) ctx.ui.notify(error, "error")
      const sessionId = ctx.sessionManager.getSessionId()
      const drafts = [
        ...clearedDrafts.toReversed().map((text) => ({ sessionId, text })),
        ...recovery.drafts
          .filter(
            (draft) =>
              draft.sessionId !== sessionId && !existsSync(draft.sessionFile),
          )
          .flatMap((draft) => [
            ...(draft.text
              ? [{ sessionId: draft.sessionId, text: draft.text }]
              : []),
            ...(draft.clearedDrafts ?? [])
              .toReversed()
              .map((text) => ({ sessionId: draft.sessionId, text })),
          ]),
      ]
      if (!drafts.length) {
        ctx.ui.notify(
          "No cleared drafts or drafts from unsaved sessions are available.",
        )
        return
      }
      const labels = drafts.map(
        (draft, index) =>
          `${index + 1}. ${draft.sessionId}: ${draft.text.split("\n")[0]}`,
      )
      const selected = await ctx.ui.select("Recover draft", labels, {
        signal: recoveryAbort.signal,
      })
      if (!active || !selected) return
      if (revision !== requestedRevision) {
        ctx.ui.notify(
          "The draft changed. Run /composer-recover again to recover the saved text.",
          "warning",
        )
        return
      }
      ctx.ui.setEditorText(drafts[labels.indexOf(selected)]!.text)
    },
  })
}
