import { readFile, realpath } from "node:fs/promises"
import { basename, sep } from "node:path"
import { pathToFileURL } from "node:url"
import {
  type ExtensionAPI,
  type ExtensionContext,
  type InputDeliveryEvent,
  type InputEvent,
  convertToPng,
  detectSupportedImageMimeTypeFromFile,
  formatDimensionNote,
  rawKeyHint,
  resizeImage,
  truncateToVisualLines,
} from "@earendil-works/pi-coding-agent"
import {
  getCapabilities,
  getImageDimensions,
  hyperlink,
  imageFallback,
  Image,
} from "@earendil-works/pi-tui"
import { registerRecovery, saveRequest } from "./recovery.ts"
import { attachmentPaths } from "./references.ts"

const THUMBNAIL_SETTING = "pi-attachments.thumbnailSize"
const THUMBNAIL_BOUNDS = {
  small: { columns: 12, rows: 2 },
  medium: { columns: 24, rows: 4 },
  large: { columns: 48, rows: 8 },
}

export async function snapshotFile(
  path: string,
  storage: string,
): Promise<string> {
  const [file, root] = await Promise.all([realpath(path), realpath(storage)])
  if (!file.startsWith(root + sep))
    throw new Error(`Snapshot is outside retained storage: ${path}`)
  return file
}

async function readImage(path: string, storage: string) {
  const file = await snapshotFile(path, storage)
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
  draftPaths: (ctx: ExtensionContext) => string[],
): void {
  pi.registerSetting({
    id: THUMBNAIL_SETTING,
    label: "Attachment thumbnail size",
    description: "Maximum width and height of attachment previews",
    defaultValue: "medium",
    values: [
      { value: "small", label: "Small" },
      { value: "medium", label: "Medium" },
      { value: "large", label: "Large" },
    ],
  })
  registerRecovery(pi, storage, signal)

  async function retain(
    event: InputEvent | InputDeliveryEvent,
    ctx: ExtensionContext,
  ) {
    const request = {
      ...event,
      ...(event.images
        ? { images: event.images.map((image) => ({ ...image })) }
        : {}),
      sessionId: ctx.sessionManager.getSessionId(),
      sessionFile: ctx.sessionManager.getSessionFile(),
      cwd: ctx.cwd,
    }
    try {
      return await saveRequest(storage, request)
    } catch (error) {
      let message = `Could not save recovery: ${String(error)}`
      message +=
        "\nContents retained in memory until Pi exits; use /attachments-recover."
      if (!signal.aborted) {
        try {
          pi.appendEntry("pi-attachments-request", request)
          message += "\nRequest retained in session memory."
        } catch (sessionError) {
          message += `\nCould not checkpoint the request: ${String(sessionError)}`
        }
      }
      throw new Error(message, { cause: error })
    }
  }

  pi.on("input", async (event, ctx) => {
    if (attachmentPaths(event.text, storage, ctx.cwd).length === 0)
      return undefined
    try {
      // Save the requesting draft before authentication, queueing, or editor clearing.
      await retain(event, ctx)
      return signal.aborted ? { action: "handled" } : undefined
    } catch (error) {
      if (!signal.aborted)
        ctx.ui.notify(`Image request not sent: ${String(error)}`, "error")
      return { action: "handled" }
    }
  })

  pi.on("input_delivery", async (event, ctx) => {
    const settings = pi.getSettings().images
    if (settings?.blockImages) return undefined
    const paths = attachmentPaths(event.text, storage, ctx.cwd)
    if (paths.length === 0) return undefined
    const resizeOptions = ctx.model?.inputLimits?.images?.resize
    const autoResize = settings?.autoResize ?? true
    try {
      const captured = await Promise.all(
        paths.map((path) => readImage(path, storage)),
      )
      const images = captured.filter((image) => image !== undefined)
      if (images.length === 0) return undefined
      const attachments = await Promise.all(
        images.map(async (image) => {
          if (!autoResize) return { image, note: undefined }
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
      if (signal.aborted)
        throw new Error("The attachment session ended during image preparation")
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
      let reason = `Image request not sent: ${String(error)}`
      try {
        reason += `\nRequest saved: ${await retain(event, ctx)}`
      } catch (recoveryError) {
        reason += `\n${String(recoveryError)}`
      }
      return { action: "reject", reason }
    }
  })

  pi.on("session_start", (_event, ctx) => {
    ctx.ui.setWidget("pi-attachments", (tui, theme) => {
      const previews = new Map<
        string,
        | {
            data: string
            mimeType: string
            image?: Image
            size?: string
            fallback: string
          }
        | string
        | null
      >()
      async function loadPreview(path: string) {
        try {
          const image = await readImage(path, storage)
          if (image) {
            const thumbnail = await resizeImage(
              Buffer.from(image.data, "base64"),
              image.mimeType,
              {
                maxWidth: 640,
                maxHeight: 320,
              },
            )
            if (!thumbnail)
              throw new Error("Could not decode the image for preview")
            const png = await convertToPng(thumbnail.data, thumbnail.mimeType)
            if (!png) throw new Error("Could not convert the image for preview")
            previews.set(path, {
              data: png.data,
              mimeType: png.mimeType,
              fallback: imageFallback(
                png.mimeType,
                getImageDimensions(png.data, png.mimeType) ?? undefined,
                basename(path),
              ),
            })
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
          const paths = draftPaths(ctx)
          if (paths.length === 0) return []
          const capabilities = getCapabilities()
          const settings = pi.getSettings()
          const selectedSize = pi.getSetting(THUMBNAIL_SETTING)
          const size: keyof typeof THUMBNAIL_BOUNDS =
            selectedSize === "small" || selectedSize === "large"
              ? selectedSize
              : "medium"
          const bounds = THUMBNAIL_BOUNDS[size]
          const showImages = settings.terminal?.showImages ?? true
          const configuredWidth = settings.terminal?.imageWidthCells
          const imageWidth = Math.min(
            bounds.columns,
            typeof configuredWidth === "number" &&
              Number.isFinite(configuredWidth)
              ? Math.max(1, Math.floor(configuredWidth))
              : 60,
          )
          const link = (text: string, path: string) =>
            capabilities.hyperlinks
              ? hyperlink(
                  text,
                  pathToFileURL(path).href.replace(
                    /^file:\/\/\//,
                    "file://localhost/",
                  ),
                )
              : text
          const lines = truncateToVisualLines(
            rawKeyHint(
              ctx.ui.getActionKeys("extension.attachments.manage").join("/"),
              "Manage attachments",
            ),
            2,
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
              let image = preview.image
              if (!image || preview.size !== size) {
                const imageId = image?.getImageId()
                image = new Image(
                  preview.data,
                  preview.mimeType,
                  { fallbackColor: (text) => theme.fg("dim", text) },
                  {
                    filename: basename(path),
                    maxWidthCells: bounds.columns,
                    maxHeightCells: bounds.rows,
                    ...(imageId === undefined ? {} : { imageId }),
                  },
                )
                preview.image = image
                preview.size = size
              }
              // Native hyperlinks need text cells beneath the image graphics.
              const graphics = showImages && capabilities.images
              const cells = graphics
                ? " ".repeat(Math.max(1, Math.min(width - 2, imageWidth)))
                : ""
              lines.push(
                ...(graphics
                  ? image.render(Math.min(width, imageWidth + 2))
                  : truncateToVisualLines(
                      theme.fg("dim", preview.fallback),
                      1,
                      width,
                    ).visualLines
                ).map((line) => link(line + cells, path)),
              )
            }
          }
          return lines
        },
        invalidate() {
          for (const preview of previews.values()) {
            if (preview && typeof preview !== "string")
              preview.image?.invalidate()
          }
        },
      }
    })
  })
}
