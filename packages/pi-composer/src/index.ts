import type { ExtensionAPI } from "@earendil-works/pi-coding-agent"
import { Clipboard } from "./clipboard.ts"
import { SourceEditor } from "./source-editor.ts"

export default function piComposer(pi: ExtensionAPI): void {
  let clipboard: Clipboard | undefined
  pi.on("session_shutdown", () => clipboard?.deactivate())
  pi.on("session_start", (_event, ctx) => {
    if (ctx.mode !== "tui") return
    clipboard?.deactivate()
    const currentClipboard = new Clipboard(ctx)
    clipboard = currentClipboard
    ctx.ui.setEditorComponent(
      (tui, theme, keybindings) =>
        new SourceEditor(tui, theme, keybindings, currentClipboard),
    )
  })
}
