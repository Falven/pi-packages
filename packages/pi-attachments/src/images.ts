import { readFile, realpath } from "node:fs/promises"
import { basename, sep } from "node:path"
import { pathToFileURL } from "node:url"
import {
  type ExtensionAPI,
  type ExtensionContext,
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
import type { ThumbnailSize } from "./settings.ts"

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
  thumbnailSize: () => ThumbnailSize,
) {
  registerRecovery(pi, storage, signal)
  type PreparedImage = NonNullable<Awaited<ReturnType<typeof prepareImage>>>
  const prepared = new Map<string, WeakRef<PreparedImage>>()
  const preparing = new Map<string, ReturnType<typeof prepareImage>>()
  const collected = new FinalizationRegistry<{
    key: string
    reference: WeakRef<PreparedImage>
  }>(({ key, reference }) => {
    if (prepared.get(key) === reference) prepared.delete(key)
  })
  signal.addEventListener(
    "abort",
    () => {
      for (const reference of prepared.values()) collected.unregister(reference)
      prepared.clear()
      preparing.clear()
    },
    { once: true },
  )

  async function retain(request: Parameters<typeof saveRequest>[1]) {
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

  async function prepareImage(
    path: string,
    autoResize: boolean,
    resizeOptions: Parameters<typeof resizeImage>[2],
  ) {
    const image = await readImage(path, storage)
    signal.throwIfAborted()
    if (!image) return undefined
    if (!autoResize) return { image, note: undefined }
    const resized = await resizeImage(
      Buffer.from(image.data, "base64"),
      image.mimeType,
      resizeOptions,
    )
    signal.throwIfAborted()
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
  }

  async function prepare(
    event: Pick<InputEvent, "text" | "images" | "streamingBehavior">,
    ctx: ExtensionContext,
    context: {
      sessionId: string
      sessionFile?: string | undefined
      cwd: string
    } = {
      sessionId: ctx.sessionManager.getSessionId(),
      sessionFile: ctx.sessionManager.getSessionFile(),
      cwd: ctx.cwd,
    },
  ) {
    const request = {
      ...event,
      ...(event.images
        ? { images: event.images.map((image) => ({ ...image })) }
        : {}),
      sessionId: context.sessionId,
      sessionFile: context.sessionFile,
      cwd: context.cwd,
    }
    const paths = attachmentPaths(request.text, storage, request.cwd)
    if (paths.length === 0) return undefined
    signal.throwIfAborted()
    let recovery: string | undefined
    try {
      // Save the requesting draft before authentication, queueing, or editor clearing.
      recovery = await retain(request)
      signal.throwIfAborted()
      // shortcut: Resize before queueing until Pi supports isolated delivery-time rejection.
      const resizeOptions = { ...ctx.model?.inputLimits?.images?.resize }
      const autoResize = pi.getSettings().images?.autoResize ?? true
      // Queued images can become allowed later; Pi applies final image blocking.
      const captured = await Promise.all(
        paths.map((path) => {
          const key = JSON.stringify([path, autoResize, resizeOptions])
          const retained = prepared.get(key)?.deref()
          if (retained) return retained
          let pending = preparing.get(key)
          if (!pending) {
            pending = prepareImage(path, autoResize, resizeOptions)
              .then((image) => {
                if (image && !signal.aborted) {
                  const previous = prepared.get(key)
                  if (previous) collected.unregister(previous)
                  const reference = new WeakRef(image)
                  prepared.set(key, reference)
                  collected.register(image, { key, reference }, reference)
                }
                return image
              })
              .finally(() => preparing.delete(key))
            preparing.set(key, pending)
          }
          return pending
        }),
      )
      signal.throwIfAborted()
      const attachments = captured.filter((image) => image !== undefined)
      if (attachments.length === 0) return undefined
      const notes = attachments.flatMap(({ note }) => (note ? [note] : []))
      return {
        text: [request.text, ...notes].join("\n\n"),
        images: [
          ...(request.images ?? []),
          ...attachments.map(({ image }) => Object.assign({}, image)),
        ],
      }
    } catch (error) {
      if (recovery)
        throw new Error(`${String(error)}\nRequest saved: ${recovery}`, {
          cause: error,
        })
      throw error
    }
  }

  pi.on("input", async (event, ctx) => {
    try {
      const result = await prepare(event, ctx)
      return result ? { action: "transform", ...result } : undefined
    } catch (error) {
      if (!signal.aborted)
        ctx.ui.notify(`Image request not sent: ${String(error)}`, "error")
      return { action: "handled" }
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
          const size = thumbnailSize()
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
            rawKeyHint("/attachments", "Manage attachments"),
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
  return { prepare }
}
