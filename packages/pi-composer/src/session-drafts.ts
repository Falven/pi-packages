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

// shortcut: Pi clears this module on cwd changes/reload; retain history only while its loader keeps the module.
const histories = new Map<string, DraftHistory>()

export function sessionDrafts(pi: ExtensionAPI): void {
  const directory = join(getAgentDir(), "pi-composer", "drafts")
  let editor: SourceEditor | undefined
  let clipboard: Clipboard | undefined
  let historyKey: string | undefined
  let active = false
  let revision = 0
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
            draft.text &&
            !existsSync(draft.sessionFile),
        )
      ) {
        ctx.ui.notify(
          "Saved drafts are available. Use /composer-recover to recover a draft.",
        )
      }
    }
    const text = checkpoint?.text ?? ""
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
      return next
    })
    const history = histories.get(historyKey)
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
  pi.on("session_shutdown", async (event) => {
    clipboard?.deactivate()
    await flush?.()
    active = false
    recoveryAbort.abort()
    if (!editor || !historyKey) return
    if (event.reason === "quit" || event.reason === "reload") histories.clear()
    else histories.set(historyKey, editor.getDraftHistory())
    editor.onDraftChange = undefined
  })

  pi.registerCommand("composer-recover", {
    description: "Recover a saved draft from an unsaved session",
    handler: async (_args, ctx) => {
      if (!active || !editor) return
      const requestedRevision = revision
      const recovery = readDrafts(directory)
      for (const error of recovery.errors) ctx.ui.notify(error, "error")
      const drafts = recovery.drafts.filter(
        (draft) =>
          draft.text &&
          draft.sessionId !== ctx.sessionManager.getSessionId() &&
          !existsSync(draft.sessionFile),
      )
      if (!drafts.length) {
        ctx.ui.notify("No drafts from unsaved sessions are available.")
        return
      }
      const labels = drafts.map(
        (draft) => `${draft.sessionId}: ${draft.text.split("\n")[0]}`,
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
