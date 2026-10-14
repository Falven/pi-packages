import type { ExtensionAPI } from "@earendil-works/pi-coding-agent"

export default function expandedInput(pi: ExtensionAPI): void {
  pi.on("input", (event) => {
    if (!event.text.includes("$review")) return undefined
    return {
      action: "transform",
      text: event.text.replace("$review", "Use the review instructions"),
      images: [
        ...(event.images ?? []),
        {
          type: "image",
          mimeType: "image/png",
          data: "iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAADUlEQVR4nGP4zwAE/wEHAAH/4iOeWQAAAABJRU5ErkJggg==",
        },
      ],
    }
  })
}
