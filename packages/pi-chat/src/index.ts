import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent"
import {
  armHistoryBootstrap,
  captureHost,
  NativeChatHost,
} from "./native-host.ts"

const relationshipRenderer = () => undefined

export default function piChat(pi: ExtensionAPI) {
  pi.registerEntryRenderer("pi-chat.relationship", relationshipRenderer)
  let adapter: NativeChatHost | undefined
  const install = (host: Parameters<typeof NativeChatHost.install>[0]) => {
    adapter?.dispose()
    adapter = undefined
    adapter = NativeChatHost.install(host)
  }
  const disarm = armHistoryBootstrap(relationshipRenderer, install)

  pi.registerShortcut("alt+g", {
    description: "Focus chat disclosures",
    handler: () => adapter?.focusNearestDisclosure(),
  })

  pi.on("session_start", (_event, context: ExtensionContext) => {
    disarm()
    try {
      const host = captureHost(context)
      if (!adapter || NativeChatHost.current(host) !== adapter) install(host)
    } catch (error) {
      adapter?.dispose()
      adapter = undefined
      context.ui.notify(
        error instanceof Error ? error.message : String(error),
        "error",
      )
    }
  })
  pi.on("session_shutdown", () => {
    disarm()
    adapter?.dispose()
    adapter = undefined
  })
  pi.on("session_tree", () => adapter?.rebaseRelationships())
}
