import type { ExtensionAPI } from "@earendil-works/pi-coding-agent"
import { sessionDrafts } from "./session-drafts.ts"

export default function piComposer(pi: ExtensionAPI): void {
  sessionDrafts(pi)
}
