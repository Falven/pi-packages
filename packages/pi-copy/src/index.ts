import type { ExtensionAPI } from "@earendil-works/pi-coding-agent"
import type { CopyProvider } from "./copy-contract.ts"
import { createCopyControls } from "./integration.ts"

export default function piCopy(pi: ExtensionAPI) {
  pi.events.on("pi.copy.provider", (value) => {
    const request = value as { version?: unknown; use?: unknown } | undefined
    if (request?.version === 1 && typeof request.use === "function")
      (request.use as (provider: CopyProvider) => void)(createCopyControls)
  })
}
