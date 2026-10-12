import type { ExtensionAPI } from "@earendil-works/pi-coding-agent"
import { SourceEditor } from "./source-editor.ts"

export default function piComposer(pi: ExtensionAPI): void {
  pi.on("session_start", (_event, ctx) => {
    if (ctx.mode !== "tui") return
    ctx.ui.setEditorComponent(
      (tui, theme, keybindings) => new SourceEditor(tui, theme, keybindings),
    )
  })
}
