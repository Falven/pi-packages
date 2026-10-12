import { mkdir, mkdtemp, readFile, realpath, writeFile } from "node:fs/promises"
import { basename, join, resolve, sep } from "node:path"
import {
  type ExtensionAPI,
  convertToPng,
  detectSupportedImageMimeTypeFromFile,
  formatDimensionNote,
  resizeImage,
  truncateToVisualLines,
} from "@earendil-works/pi-coding-agent"
import { Image } from "@earendil-works/pi-tui"

function attachmentPaths(text: string, storage: string): string[] {
  const paths = new Set<string>()
  for (const match of text.matchAll(/\[Attachment: [^\]]+\]\(<([^>]+)>\)/g)) {
    const path = match[1] && resolve(match[1])
    if (path?.startsWith(storage + sep)) paths.add(path)
  }
  return [...paths]
}

async function readImage(path: string, storage: string) {
  const [file, root] = await Promise.all([realpath(path), realpath(storage)])
  if (!file.startsWith(root + sep))
    throw new Error(`Snapshot is outside retained storage: ${path}`)
  const mimeType = await detectSupportedImageMimeTypeFromFile(file)
  if (!mimeType) return undefined
  const contents = await readFile(file)
  if (mimeType === "image/bmp") {
    const png = await convertToPng(contents.toString("base64"), mimeType)
    if (!png) throw new Error(`Could not convert image: ${path}`)
    return { type: "image" as const, ...png }
  }
  return { type: "image" as const, data: contents.toString("base64"), mimeType }
}

export function registerImages(
  pi: ExtensionAPI,
  storage: string,
  signal: AbortSignal,
): void {
  pi.on("input", async (event, ctx) => {
    const paths = attachmentPaths(event.text, storage)
    if (paths.length === 0) return undefined
    const sessionId = ctx.sessionManager.getSessionId()
    const resizeOptions = ctx.model?.inputLimits?.images?.resize
    let recovery: Promise<string> | undefined
    async function saveRequest() {
      await mkdir(storage, { recursive: true, mode: 0o700 })
      const directory = await mkdtemp(join(storage, "request-"))
      const references = await Promise.all(
        (event.images ?? []).map(async (image, index) => {
          const name = `input-image-${index + 1}`
          const path = join(directory, name)
          await writeFile(path, Buffer.from(image.data, "base64"), {
            flag: "wx",
            mode: 0o600,
          })
          return `[Attachment: ${name}](<${path}>)`
        }),
      )
      const path = join(directory, "request.draft.md")
      await writeFile(
        path,
        `# Attachment request\n\nSession: ${sessionId}\nDelivery: ${event.streamingBehavior ?? "normal"}\n\n${event.text}\n\n${references.join("\n")}\n`,
        { flag: "wx", mode: 0o600 },
      )
      return path
    }
    const retain = () => (recovery ??= saveRequest())
    try {
      const captured = await Promise.all(
        paths.map((path) => readImage(path, storage)),
      )
      const images = captured.filter((image) => image !== undefined)
      if (images.length === 0) return undefined
      // Native clears and queued sends have no delivery acknowledgement; keep a recovery copy.
      await retain()
      const attachments = await Promise.all(
        images.map(async (image) => {
          const resized = await resizeImage(
            Buffer.from(image.data, "base64"),
            image.mimeType,
            resizeOptions,
          )
          if (!resized)
            throw new Error("Could not prepare the captured image for delivery")
          return {
            image: {
              type: "image" as const,
              data: resized.data,
              mimeType: resized.mimeType,
            },
            note: formatDimensionNote(resized),
          }
        }),
      )
      if (signal.aborted) return { action: "handled" }
      const notes = attachments.flatMap(({ note }) => (note ? [note] : []))
      return {
        action: "transform",
        text: [event.text, ...notes].join("\n\n"),
        images: [
          ...(event.images ?? []),
          ...attachments.map(({ image }) => image),
        ],
      }
    } catch (error) {
      let message = `Image request not sent: ${String(error)}`
      try {
        message += `\nRequest saved: ${await retain()}`
      } catch (recoveryError) {
        message += `\nCould not save recovery: ${String(recoveryError)}`
        if (!signal.aborted) {
          try {
            pi.appendEntry("pi-attachments-request", { ...event, sessionId })
            message += "\nRequest retained in session memory."
          } catch (sessionError) {
            message += `\nCould not checkpoint the request: ${String(sessionError)}`
          }
        }
      }
      if (!signal.aborted) ctx.ui.notify(message, "error")
      return { action: "handled" }
    }
  })

  pi.on("session_start", (_event, ctx) => {
    ctx.ui.setWidget("pi-attachments", (tui, theme) => {
      const previews = new Map<string, Image | string | null>()
      async function loadPreview(path: string) {
        try {
          const image = await readImage(path, storage)
          if (image) {
            const thumbnail = await resizeImage(
              Buffer.from(image.data, "base64"),
              image.mimeType,
              {
                maxWidth: 320,
                maxHeight: 160,
              },
            )
            if (!thumbnail)
              throw new Error("Could not decode the image for preview")
            const png = await convertToPng(thumbnail.data, thumbnail.mimeType)
            if (!png) throw new Error("Could not convert the image for preview")
            previews.set(
              path,
              new Image(
                png.data,
                png.mimeType,
                { fallbackColor: (text) => theme.fg("dim", text) },
                {
                  filename: basename(path),
                  maxWidthCells: 24,
                  maxHeightCells: 4,
                },
              ),
            )
          }
        } catch (error) {
          previews.set(
            path,
            `Preview unavailable: ${basename(path)}: ${String(error)}`,
          )
        } finally {
          if (!signal.aborted) tui.requestRender()
        }
      }
      return {
        render(width) {
          if (signal.aborted) return []
          const paths = attachmentPaths(ctx.ui.getEditorText(), storage)
          if (paths.length === 0) return []
          const names = paths.map((path) => basename(path)).join(", ")
          const lines = truncateToVisualLines(
            theme.fg("muted", `Attachments (${paths.length}): ${names}`),
            5,
            width,
          ).visualLines
          for (const path of paths) {
            if (!previews.has(path)) {
              previews.set(path, null)
              void loadPreview(path)
            }
            const preview = previews.get(path)
            if (typeof preview === "string") {
              lines.push(
                ...truncateToVisualLines(theme.fg("error", preview), 2, width)
                  .visualLines,
              )
            } else if (preview) {
              lines.push(...preview.render(width))
            }
          }
          return lines
        },
        invalidate() {
          for (const preview of previews.values()) {
            if (preview instanceof Image) preview.invalidate()
          }
        },
      }
    })
  })
}
