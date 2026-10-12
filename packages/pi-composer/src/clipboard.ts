import { randomUUID } from "node:crypto"
import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import {
  copyToClipboard,
  getAgentDir,
  type ExtensionContext,
  type ExtensionUIContext,
} from "@earendil-works/pi-coding-agent"
import { getNativeClipboard } from "@earendil-works/pi-tui"

type ClipboardDraft = { text: string; anchor: number; head: number }

export class Clipboard {
  private ui: ExtensionUIContext | undefined
  private readonly sessionId: string
  private readonly directory: string

  constructor(ctx: ExtensionContext) {
    this.ui = ctx.ui
    this.sessionId = ctx.sessionManager.getSessionId()
    this.directory = join(
      getAgentDir(),
      "pi-composer",
      "clipboard-recovery",
      this.sessionId,
    )
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

  async paste(draft: ClipboardDraft, isCurrent: () => boolean): Promise<void> {
    let text: string | null | undefined
    try {
      text = await getNativeClipboard()?.getText()
      if (text === undefined) throw new Error("Text clipboard unavailable")
    } catch (error) {
      this.notify(`Paste failed: ${String(error)}`, "error")
      return
    }
    if (!text) return
    let reason = "Draft changed."
    if (this.ui && isCurrent()) {
      try {
        this.ui.pasteToEditor(text)
        return
      } catch (error) {
        reason = `Paste failed: ${String(error)}`
      }
    }
    const recovery = JSON.stringify(
      { sessionId: this.sessionId, draft, clipboard: text },
      null,
      2,
    )
    try {
      await mkdir(this.directory, { recursive: true, mode: 0o700 })
      const path = join(this.directory, `${randomUUID()}.json`)
      await writeFile(path, recovery, { flag: "wx", mode: 0o600 })
      this.notify(`Clipboard paste saved to ${path}\n${reason}`, "warning")
    } catch (error) {
      this.notify(
        `${reason} Clipboard recovery could not be saved: ${String(error)}\n${recovery}`,
        "error",
      )
    }
  }
}
