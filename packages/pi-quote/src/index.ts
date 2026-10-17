import type { ExtensionAPI } from "@earendil-works/pi-coding-agent"
import { getKeybindings, isKeyRelease } from "@earendil-works/pi-tui"
import { QuoteAdapter } from "./native-adapter.ts"

export default function piQuote(pi: ExtensionAPI): void {
  let adapter: QuoteAdapter | undefined
  let unlisten: (() => void) | undefined
  const dispose = () => {
    unlisten?.()
    unlisten = undefined
    adapter?.dispose()
    adapter = undefined
  }

  pi.registerShortcut("alt+shift+q", {
    description: "Quote selected chat text into the draft",
    handler: () => adapter?.quote(),
  })
  pi.on("session_start", (_event, ctx) => {
    dispose()
    if (ctx.mode !== "tui") return
    ctx.ui.setWidget("pi-quote", (tui) => {
      adapter = new QuoteAdapter(tui, ctx)
      return adapter.widget
    })
    unlisten = ctx.ui.onTerminalInput((data) => {
      if (
        !isKeyRelease(data) &&
        getKeybindings().matches(data, "tui.select.cancel") &&
        adapter?.dismiss()
      )
        return { consume: true }
      return undefined
    })
  })
  pi.on("ui_prompt_start", () => {
    adapter?.dismiss()
  })
  pi.on("session_shutdown", dispose)
}
