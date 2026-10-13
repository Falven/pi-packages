import { AsyncLocalStorage } from "node:async_hooks"
import { createHash, randomUUID } from "node:crypto"
import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import {
  copyToClipboard,
  getAgentDir,
  type ExtensionContext,
  type ExtensionUIContext,
} from "@earendil-works/pi-coding-agent"

type ClipboardDraft = { text: string; anchor: number; head: number }
type ClipboardRecovery = {
  sessionId: string
  sessionFile: string | undefined
  cwd: string
  revision: number
  draft: ClipboardDraft
  clipboard: string
}

// Pi reloads extension modules when the cwd or resources change.
const unsavedKey = Symbol.for("pi-composer:unsaved-clipboard")
const processState = globalThis as typeof globalThis & {
  [unsavedKey]?: Map<string, Set<ClipboardRecovery>>
}
const unsavedByStorage = (processState[unsavedKey] ??= new Map())
type PendingPaste = (text: string, insert: () => void) => void
// Pi's void clipboard callback can deliver to a replacement editor after reload.
const pendingKey = Symbol.for("pi-composer:pending-clipboard")
const pendingState = globalThis as typeof globalThis & {
  [pendingKey]?: AsyncLocalStorage<PendingPaste>
}
const pendingPaste = (pendingState[pendingKey] ??=
  new AsyncLocalStorage<PendingPaste>())

export class Clipboard {
  private ui: ExtensionUIContext | undefined
  private readonly sessionId: string
  private readonly sessionFile: string | undefined
  private readonly cwd: string
  private readonly directory: string
  private readonly unsaved: Set<ClipboardRecovery>

  constructor(ctx: ExtensionContext) {
    this.ui = ctx.ui
    this.sessionId = ctx.sessionManager.getSessionId()
    this.sessionFile = ctx.sessionManager.getSessionFile()
    this.cwd = ctx.cwd
    this.directory = join(getAgentDir(), "pi-composer", "clipboard-recovery")
    this.unsaved = unsavedByStorage.get(this.directory) ?? new Set()
    unsavedByStorage.set(this.directory, this.unsaved)
  }

  deactivate(): void {
    this.ui = undefined
  }

  private notify(message: string, type: "warning" | "error"): void {
    if (this.ui) this.ui.notify(message, type)
    else process.stderr.write(`Clipboard (${this.sessionId}): ${message}\n`)
  }

  async copy(text: string): Promise<boolean> {
    if (!text) return false
    try {
      await copyToClipboard(text)
      return this.ui !== undefined
    } catch (error) {
      this.notify(`Copy failed: ${String(error)}`, "error")
      return false
    }
  }

  static insert(text: string, insert: () => void): boolean {
    // shortcut: guard composer insertions until Pi exposes request-scoped clipboard delivery.
    const pending = pendingPaste.getStore()
    if (!pending) return false
    pending(text, insert)
    return true
  }

  paste(
    draft: ClipboardDraft,
    revision: number,
    applyToRequest: (insert: () => void) => boolean,
    handler: () => void,
  ): void {
    // A later decorator can call a saved handler after its own asynchronous work.
    if (pendingPaste.getStore()) {
      handler()
      return
    }
    const original = {
      sessionId: this.sessionId,
      sessionFile: this.sessionFile,
      cwd: this.cwd,
      revision,
      draft: { ...draft },
    }
    const receive: PendingPaste = (text, insert) => {
      let reason = "Draft changed."
      if (this.ui) {
        try {
          if (pendingPaste.exit(() => applyToRequest(insert))) return
        } catch (error) {
          reason = `Paste failed: ${String(error)}`
        }
      }
      void this.preserve({ ...original, clipboard: text }, reason)
    }
    try {
      pendingPaste.run(receive, handler)
    } catch (error) {
      this.notify(`Paste failed: ${String(error)}`, "error")
    }
  }

  async retry(): Promise<void> {
    await Promise.all(
      [...this.unsaved].map((recovery) =>
        this.preserve(recovery, "Recovered clipboard paste."),
      ),
    )
  }

  private async preserve(
    recovery: ClipboardRecovery,
    reason: string,
  ): Promise<void> {
    const contents = JSON.stringify(recovery, null, 2)
    try {
      const sessionName = createHash("sha256")
        .update(recovery.sessionId)
        .digest("hex")
      const directory = join(this.directory, sessionName)
      await mkdir(directory, { recursive: true, mode: 0o700 })
      const path = join(directory, `${randomUUID()}.json`)
      await writeFile(path, contents, { flag: "wx", mode: 0o600, flush: true })
      this.unsaved.delete(recovery)
      this.notify(`Clipboard paste saved to ${path}\n${reason}`, "warning")
    } catch (error) {
      this.unsaved.add(recovery)
      this.notify(
        `${reason} Clipboard recovery could not be saved: ${String(error)}\nText retained in memory until Pi exits; use /composer-recover.\n${contents}`,
        "error",
      )
    }
  }
}
