import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent"
import { activityType } from "./tool-adapters/activity-contract.ts"
import {
  armHistoryBootstrap,
  captureHost,
  NativeChatHost,
} from "./native-host.ts"
import { thoughtPresentation } from "./thought.ts"
import { ActivityItems, nativeToolType } from "./activity-items.ts"
import { WorkingLabel } from "./working-label.ts"

const relationshipRenderer = () => undefined

export default function piChat(pi: ExtensionAPI) {
  pi.registerEntryRenderer("pi-chat.relationship", relationshipRenderer)
  pi.registerEntryRenderer(nativeToolType, relationshipRenderer)
  let adapter: NativeChatHost | undefined
  const working = new WorkingLabel(
    (id) => adapter?.activityItems.forCall(id) ?? [],
    () => adapter?.agentActivity.hasFinalResponse() ?? false,
  )
  let unlistenActivity: (() => void) | undefined
  const listenActivity = () => {
    unlistenActivity ??= pi.events.on(activityType, (data) => {
      adapter?.observeActivity(activityType, data)
      working.refresh()
    })
  }
  listenActivity()
  pi.registerMarkdownTransformer((markdown, context) =>
    context.messageType === "assistant-thinking"
      ? thoughtPresentation(markdown).body
      : markdown,
  )
  pi.on("agent_start", (_event, context) => working.start(context.ui))
  pi.on("message_start", ({ message }) => {
    if (message.role === "user") working.reset()
    else if (message.role === "assistant") working.startMessage()
  })
  pi.on("message_update", ({ message, assistantMessageEvent: event }) => {
    if (message.role === "assistant" && "contentIndex" in event)
      working.update(message, event.contentIndex)
  })
  pi.on("message_end", ({ message }) => {
    if (message.role === "assistant") working.update(message)
  })
  pi.on("tool_execution_start", (event, context) => {
    adapter?.activityItems.start(event, context.cwd)
    if (!event.parentToolCallId) working.dispatch(event.toolCallId)
  })
  pi.on("tool_execution_update", (event) => {
    adapter?.activityItems.update(event)
    working.refresh()
  })
  pi.on("tool_execution_end", (event) => {
    adapter?.activityItems.end(event)
    working.refresh()
  })
  pi.on("agent_end", () => {
    working.stop()
    adapter?.activityItems.stop()
  })
  const install = (host: Parameters<typeof NativeChatHost.install>[0]) => {
    adapter?.dispose()
    adapter = undefined
    adapter = NativeChatHost.install(host, new ActivityItems(pi), working)
  }
  const disarm = armHistoryBootstrap(relationshipRenderer, install)

  pi.registerShortcut("alt+g", {
    description: "Focus chat disclosures",
    handler: () => adapter?.focusNearestDisclosure(),
  })

  pi.on("session_start", (_event, context: ExtensionContext) => {
    disarm()
    listenActivity()
    working.stop()
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
    unlistenActivity?.()
    unlistenActivity = undefined
    working.stop()
    adapter?.dispose()
    adapter = undefined
  })
  pi.on("session_tree", () => {
    working.stop()
    adapter?.rebaseRelationships()
  })
  pi.on("turn_start", () => adapter?.beginProviderRequest())
  pi.on("provider_stream_event", (event) =>
    adapter?.observeProviderEvent(event.data),
  )
}
