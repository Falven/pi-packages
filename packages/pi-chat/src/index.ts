import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent"
import {
  armHistoryBootstrap,
  captureHost,
  NativeChatHost,
} from "./native-host.ts"
import { thoughtPresentation } from "./thought.ts"
import { ActivityItems } from "./activity-items.ts"

const relationshipRenderer = () => undefined

export default function piChat(pi: ExtensionAPI) {
  pi.registerEntryRenderer("pi-chat.relationship", relationshipRenderer)
  let adapter: NativeChatHost | undefined
  let unlistenActivity: (() => void) | undefined
  const listenActivity = () => {
    unlistenActivity ??= pi.events.on(activityType, (data) =>
      adapter?.observeActivity(activityType, data),
    )
  }
  listenActivity()
  let workingHeading: string | undefined
  const setHeading = (
    heading: string | undefined,
    context: ExtensionContext,
  ) => {
    if (heading === workingHeading) return
    workingHeading = heading
    context.ui.setWorkingMessage(heading)
  }
  const clearHeading = (_event: unknown, context: ExtensionContext) =>
    setHeading(undefined, context)
  pi.registerMarkdownTransformer((markdown, context) =>
    context.messageType === "assistant-thinking"
      ? thoughtPresentation(markdown).body
      : markdown,
  )
  pi.on("message_update", ({ assistantMessageEvent: event }, context) => {
    if (event.type === "thinking_start" || event.type === "thinking_delta") {
      const block = event.partial.content[event.contentIndex]
      if (block?.type === "thinking")
        setHeading(thoughtPresentation(block.thinking.trim()).heading, context)
    } else if (event.type === "thinking_end") clearHeading(event, context)
  })
  pi.on("message_end", (event, context) => {
    if (event.message.role === "assistant") clearHeading(event, context)
  })
  pi.on("agent_end", clearHeading)
  pi.on("tool_execution_start", (event, context) =>
    adapter?.activityItems.start(event, context.cwd),
  )
  pi.on("tool_execution_update", (event) =>
    adapter?.activityItems.update(event),
  )
  pi.on("tool_execution_end", (event) => adapter?.activityItems.end(event))
  pi.on("agent_end", () => adapter?.activityItems.stop())
  const install = (host: Parameters<typeof NativeChatHost.install>[0]) => {
    adapter?.dispose()
    adapter = undefined
    adapter = NativeChatHost.install(host, new ActivityItems(pi))
  }
  const disarm = armHistoryBootstrap(relationshipRenderer, install)

  pi.registerShortcut("alt+g", {
    description: "Focus chat disclosures",
    handler: () => adapter?.focusNearestDisclosure(),
  })

  pi.on("session_start", (_event, context: ExtensionContext) => {
    disarm()
    listenActivity()
    clearHeading(_event, context)
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
  pi.on("session_shutdown", (event, context) => {
    disarm()
    unlistenActivity?.()
    unlistenActivity = undefined
    clearHeading(event, context)
    adapter?.dispose()
    adapter = undefined
  })
  pi.on("session_tree", () => adapter?.rebaseRelationships())
  pi.on("turn_start", () => adapter?.beginProviderRequest())
  pi.on("provider_stream_event", (event) =>
    adapter?.observeProviderEvent(event.data),
  )
}
import { activityType } from "pi-activity"
