import type { ExtensionAPI } from "@earendil-works/pi-coding-agent"
import type { CopyProvider } from "./copy-contract.ts"
import { createCopyControls } from "./integration.ts"
import { captureNativeHost, NativeCopyHost } from "./native-host.ts"

export default function piCopy(pi: ExtensionAPI) {
  let adapter: NativeCopyHost | undefined
  pi.events.on("pi.copy.provider", (value) => {
    const request = value as { version?: unknown; use?: unknown } | undefined
    if (request?.version === 1 && typeof request.use === "function")
      (request.use as (provider: CopyProvider) => void)(createCopyControls)
  })
  pi.on("session_start", (_event, context) => {
    adapter?.dispose()
    adapter = undefined
    if (context.mode !== "tui") return
    let claimed = false
    pi.events.emit("pi.copy.host", {
      version: 1,
      claim() {
        claimed = true
      },
    })
    if (claimed) return
    try {
      adapter = new NativeCopyHost(captureNativeHost(context), context)
    } catch (error) {
      context.ui.notify(
        error instanceof Error ? error.message : String(error),
        "error",
      )
    }
  })
  pi.on("agent_end", () => adapter?.requestRender())
  pi.on("session_shutdown", () => {
    adapter?.dispose()
    adapter = undefined
  })
}
