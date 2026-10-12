import type { ExtensionAPI } from "@earendil-works/pi-coding-agent"
import { sessionDrafts } from "./session-drafts.ts"
import { setupKeybinds } from "./setup-keybinds.ts"

export default function piComposer(pi: ExtensionAPI): void {
  sessionDrafts(pi)
  setupKeybinds(pi)
}
