import type { ExtensionAPI } from "@earendil-works/pi-coding-agent"

export default function imageInput(pi: ExtensionAPI): void {
  pi.on("input", (event, ctx) => {
    if (!event.text.includes("[Attachment:")) return undefined
    if (event.text.startsWith("Handled here")) {
      ctx.ui.notify("Earlier input handler handled the request", "info")
      return { action: "handled" }
    }
    return {
      action: "transform",
      text: `Before attachments\n${event.text}`,
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
