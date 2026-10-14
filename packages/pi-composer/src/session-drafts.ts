import { existsSync } from "node:fs"
import { join } from "node:path"
import {
  getAgentDir,
  getSelectListTheme,
  keyHint,
  type ExtensionAPI,
} from "@earendil-works/pi-coding-agent"
import { Container, SelectList, Text } from "@earendil-works/pi-tui"
import { Clipboard } from "./clipboard.ts"
import { SourceEditor, type DraftHistory } from "./source-editor.ts"
import {
  clearedDraftType,
  checkpointType,
  isClearedDraft,
  isCheckpoint,
  readDrafts,
  writeDraft,
  type DraftCheckpoint,
} from "./session-draft-storage.ts"

type SessionHistory = DraftHistory & {
  clearedDrafts?: string[]
  nativeClearedDrafts?: string[]
  pendingDraft?: DraftCheckpoint
}

// Pi reloads extension modules when the cwd or resources change.
const historiesKey = Symbol.for("pi-composer:histories")
const processState = globalThis as typeof globalThis & {
  [historiesKey]?: Map<string, SessionHistory>
}
const histories = (processState[historiesKey] ??= new Map())

function retainClearedDrafts(native: string[], recovered: string[]): string[] {
  let shared = 0
  while (
    shared < native.length &&
    shared < recovered.length &&
    native[shared] === recovered[shared]
  ) {
    shared++
  }
  return [...native, ...recovered.slice(shared)]
}

export function sessionDrafts(pi: ExtensionAPI): void {
  const directory = join(getAgentDir(), "pi-composer", "drafts")
  let editor: SourceEditor | undefined
  let clipboard: Clipboard | undefined
  let historyKey: string | undefined
  let active = false
  let revision = 0
  let clearedDrafts: string[] = []
  let nativeClearedDrafts: string[] = []
  let pendingDraft: DraftCheckpoint | undefined
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
    const history = histories.get(historyKey)
    let checkpoint: DraftCheckpoint | undefined
    nativeClearedDrafts = []
    for (const entry of ctx.sessionManager.getEntries()) {
      if (entry.type !== "custom") continue
      if (
        entry.customType === clearedDraftType &&
        isClearedDraft(entry.data) &&
        entry.data.sessionId === sessionId
      ) {
        nativeClearedDrafts.push(entry.data.text)
      } else if (
        entry.customType === checkpointType &&
        isCheckpoint(entry.data) &&
        entry.data.sessionId === sessionId
      ) {
        checkpoint = entry.data
        if (entry.data.clearedDrafts)
          nativeClearedDrafts = retainClearedDrafts(
            nativeClearedDrafts,
            entry.data.clearedDrafts,
          )
      }
    }
    // Pi keeps failed appends in memory; reload must retain our last successful prefix.
    if (history?.nativeClearedDrafts)
      nativeClearedDrafts = [...history.nativeClearedDrafts]
    let restoredClearedDrafts = nativeClearedDrafts
    if (sessionFile) {
      const recovery = readDrafts(directory)
      for (const error of recovery.errors) ctx.ui.notify(error, "error")
      const saved = recovery.drafts.find(
        (draft) => draft.sessionId === sessionId,
      )
      if (saved && (!checkpoint || saved.revision > checkpoint.revision)) {
        checkpoint = saved
        restoredClearedDrafts = retainClearedDrafts(
          nativeClearedDrafts,
          saved.clearedDrafts ?? [],
        )
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
    if (
      history?.pendingDraft &&
      (!checkpoint || history.pendingDraft.revision >= checkpoint.revision)
    ) {
      checkpoint = history.pendingDraft
    }
    pendingDraft =
      checkpoint === history?.pendingDraft ? history?.pendingDraft : undefined
    const text = checkpoint?.text ?? history?.draft.text ?? ""
    clearedDrafts = retainClearedDrafts(
      nativeClearedDrafts,
      history?.clearedDrafts ?? restoredClearedDrafts,
    )
    if (pendingDraft)
      pendingDraft = { ...pendingDraft, clearedDrafts: [...clearedDrafts] }
    revision = checkpoint?.revision ?? 0
    let latest = pendingDraft
    let savedRevision = pendingDraft ? -1 : revision
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
            const clears = draft.clearedDrafts ?? []
            for (
              let index = nativeClearedDrafts.length;
              index < clears.length;
              index++
            ) {
              pi.appendEntry(clearedDraftType, {
                version: 1,
                sessionId,
                text: clears[index]!,
              })
              nativeClearedDrafts.push(clears[index]!)
            }
            const nativeDraft = { ...draft }
            delete nativeDraft.clearedDrafts
            pi.appendEntry(checkpointType, nativeDraft)
          } catch (error) {
            saved = false
            ctx.ui.notify(
              `Could not save session draft: ${String(error)}`,
              "error",
            )
          }
          if (saved) {
            savedRevision = draft.revision
            if (latest === draft) pendingDraft = undefined
          } else if (latest === draft) break
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
      pendingDraft = latest
      clearTimeout(timer)
      timer = setTimeout(() => {
        void flush?.()
      }, 150)
      timer.unref()
    }
    let defaultPaste: SourceEditor["onPasteImage"]
    ctx.ui.setEditorComponent((tui, theme, keybindings) => {
      const previous = editor?.getDraftHistory()
      const next = new SourceEditor(tui, theme, keybindings, currentClipboard)
      if (defaultPaste) {
        next.onPasteImage = defaultPaste
        next.markDefaultPaste()
      }
      if (previous) next.restoreDraft(previous.draft.text, previous)
      editor = next
      next.onDraftChange = (draft) => {
        if (editor === next) changed(draft)
      }
      next.onDraftClear = (draft) => {
        // shortcut: no per-submission acknowledgement, retain copies until Pi exposes correlated outcomes.
        if (active && editor === next && draft.trim() !== "/composer-recover") {
          clearedDrafts.push(draft)
        }
      }
      return next
    })
    // Pi has now supplied the fallback; later factory decorators keep their own handlers.
    defaultPaste = editor!.markDefaultPaste()
    editor!.restoreDraft(
      text,
      history?.draft.text === text ? history : undefined,
    )
    active = true
    if (pendingDraft) void flush()
    void currentClipboard.retry()
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
    histories.set(historyKey, {
      ...editor.getDraftHistory(),
      clearedDrafts,
      nativeClearedDrafts,
      ...(pendingDraft ? { pendingDraft } : {}),
    })
    editor.onDraftChange = undefined
    editor.onDraftClear = undefined
  })

  pi.registerCommand("composer-recover", {
    description: "Recover cleared or unsaved drafts and clipboard captures",
    handler: async (_args, ctx) => {
      if (!active || !editor) return
      const requestedRevision = revision
      const sessionId = ctx.sessionManager.getSessionId()
      await clipboard?.retry()
      if (!active) return
      const recovery = readDrafts(directory)
      for (const error of recovery.errors) ctx.ui.notify(error, "error")
      const pending = [...histories].flatMap(([key, history]) =>
        key.startsWith(`${directory}\0`) &&
        history.pendingDraft &&
        history.pendingDraft.sessionId !== sessionId
          ? [history.pendingDraft]
          : [],
      )
      const saved = new Map(
        recovery.drafts.map((draft) => [draft.sessionId, draft]),
      )
      await Promise.all(
        pending.map(async (draft) => {
          const previous = saved.get(draft.sessionId)
          saved.set(draft.sessionId, draft)
          if (previous && previous.revision >= draft.revision) return
          try {
            await writeDraft(directory, draft)
          } catch (error) {
            if (active)
              ctx.ui.notify(
                `Could not save draft recovery: ${String(error)}`,
                "error",
              )
          }
        }),
      )
      if (!active) return
      const drafts = clearedDrafts
        .toReversed()
        .map((text) => ({ sessionId, text }))
      for (const draft of saved.values()) {
        if (
          draft.sessionId === sessionId ||
          (existsSync(draft.sessionFile) && !pending.includes(draft))
        )
          continue
        if (draft.text)
          drafts.push({ sessionId: draft.sessionId, text: draft.text })
        for (const text of (draft.clearedDrafts ?? []).toReversed()) {
          drafts.push({ sessionId: draft.sessionId, text })
        }
      }
      if (!drafts.length) {
        ctx.ui.notify(
          "No cleared drafts or drafts from unsaved sessions are available.",
        )
        return
      }
      const labels = drafts.map(
        (draft, index) =>
          `${index + 1}. ${draft.text.trim().split("\n")[0]} (${draft.sessionId})`,
      )
      const selected = await ctx.ui.custom<string | undefined>(
        (tui, theme, _keybindings, done) => {
          const list = new SelectList(
            labels.map((label) => ({ value: label, label })),
            Math.max(1, Math.min(10, tui.terminal.rows - 8)),
            getSelectListTheme(),
          )
          const view = new Container()
          view.addChild(new Text(theme.fg("accent", "Recover draft"), 0, 1))
          view.addChild(list)
          view.addChild(
            new Text(
              `${keyHint("tui.select.confirm", "recover")}  ${keyHint("tui.select.cancel", "cancel")}`,
              0,
              1,
            ),
          )
          const cancel = () => done(undefined)
          recoveryAbort.signal.addEventListener("abort", cancel, { once: true })
          list.onSelect = ({ value }) => done(value)
          list.onCancel = cancel
          return {
            render(width) {
              return view.render(width)
            },
            handleInput(data) {
              list.handleInput(data)
              tui.requestRender()
            },
            handleMouse(event) {
              return view.handleMouse(event)
            },
            invalidate() {
              view.invalidate()
            },
            dispose() {
              recoveryAbort.signal.removeEventListener("abort", cancel)
            },
          }
        },
        // Non-overlay custom dialogs restore stale editor text when they close.
        { overlay: true },
      )
      if (!active || !selected) return
      if (revision !== requestedRevision) {
        ctx.ui.notify(
          "The draft changed. Run /composer-recover again to recover the saved text.",
          "warning",
        )
        return
      }
      const text = drafts[labels.indexOf(selected)]!.text
      const current = editor.getText()
      if (current && current !== text) clearedDrafts.push(current)
      ctx.ui.setEditorText(text)
    },
  })
}
