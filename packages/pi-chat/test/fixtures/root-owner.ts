import {
  InteractiveMode,
  type ExtensionAPI,
} from "@earendil-works/pi-coding-agent"
import { Text, VStack, type Component } from "@earendil-works/pi-tui"

type RootHost = {
  fullscreenLayoutRoot: VStack
  renderer: { setLayoutRoot(root: Component): void }
}

export const observed: {
  host?: RootHost
  previousRoot?: VStack
  replacement?: Component
  notifications: string[]
  errors: string[]
} = { notifications: [], errors: [] }

export function installReplacement(interactive: InteractiveMode) {
  const host = interactive as unknown as RootHost
  const oldRoot = host.fullscreenLayoutRoot
  const replacement = new VStack([
    {
      component: new Text("Other owner active", 0, 0),
      basis: 0,
      grow: 1,
      shrink: 1,
      minSize: 1,
    },
    {
      component: oldRoot.children[1]!,
      basis: "auto",
      grow: 0,
      shrink: 1,
      minSize: 1,
    },
  ])
  host.fullscreenLayoutRoot = replacement
  host.renderer.setLayoutRoot(replacement)
  observed.host = host
  observed.previousRoot = oldRoot
  observed.replacement = replacement
}

export default function rootOwner(pi: ExtensionAPI) {
  pi.on("session_start", (_event, context) => {
    const notify = context.ui.notify
    context.ui.notify = (message, type) => {
      observed.notifications.push(message)
      notify(message, type)
    }
    const previous = Object.getOwnPropertyDescriptor(
      InteractiveMode.prototype,
      "setExtensionWidget",
    )!
    let host: RootHost | undefined
    Object.defineProperty(InteractiveMode.prototype, "setExtensionWidget", {
      ...previous,
      value: function (this: InteractiveMode, ...args: unknown[]) {
        host = this as unknown as RootHost
        return previous.value.apply(this, args)
      },
    })
    try {
      context.ui.setWidget("root-owner.fixture", undefined)
    } finally {
      Object.defineProperty(
        InteractiveMode.prototype,
        "setExtensionWidget",
        previous,
      )
    }
    if (!host) throw new Error("fixture could not capture Pi host")
    installReplacement(host as unknown as InteractiveMode)
  })
}
