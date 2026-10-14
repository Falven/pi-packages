import { readFile, stat } from "node:fs/promises"
import { resolve } from "node:path"
import { getSystemErrorMessage } from "node:util"
import {
  convertToPng,
  detectSupportedImageMimeTypeFromFile,
  type ExtensionAPI,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent"
import { Type } from "typebox"

const parameters = Type.Object(
  {
    detail: Type.Optional(
      Type.Union([Type.Literal("high"), Type.Literal("original")]),
    ),
    path: Type.String(),
  },
  { additionalProperties: false },
)

function fileError(action: string, path: string, error: unknown): Error {
  const errno = (error as NodeJS.ErrnoException).errno
  if (errno === undefined) throw error
  const message = getSystemErrorMessage(errno)
  return new Error(
    `unable to ${action} image at \`${path}\`: ${message[0]!.toUpperCase()}${message.slice(1)} (os error ${Math.abs(errno)})`,
  )
}

export function createImage(
  pi: ExtensionAPI,
  available: () => boolean,
): ToolDefinition<typeof parameters, undefined> {
  const checkBlocking = () => {
    if (pi.getSettings().images?.blockImages)
      throw new Error("Image reading is disabled.")
  }
  return {
    name: "view_image",
    label: "Image",
    description:
      "View a local image file from the filesystem when visual inspection is needed. Use this for images already available on disk.",
    parameters,
    exposure: "codemode",
    async execute(_id, args, signal, _onUpdate, ctx) {
      signal?.throwIfAborted()
      if (!available())
        throw new Error(
          "Image reading is not available in the active tool scope",
        )
      checkBlocking()
      const path = resolve(ctx.cwd, args.path)
      const file = await stat(path).catch((error: unknown) => {
        throw fileError("locate", path, error)
      })
      if (!file.isFile())
        throw new Error(`image path \`${path}\` is not a file`)
      checkBlocking()
      const mimeType = await detectSupportedImageMimeTypeFromFile(path).catch(
        (error: unknown) => {
          throw fileError("read", path, error)
        },
      )
      if (!mimeType || mimeType === "image/bmp")
        throw new Error(
          "unable to process image: invalid or unsupported image data",
        )
      checkBlocking()
      const bytes = await readFile(path, { signal }).catch((error: unknown) => {
        throw fileError("read", path, error)
      })
      const data = bytes.toString("base64")
      // Decode for validity without resizing or replacing the returned bytes.
      if (!(await convertToPng(data, "application/octet-stream")))
        throw new Error(
          "unable to process image: invalid or unsupported image data",
        )
      signal?.throwIfAborted()
      checkBlocking()
      const result = {
        image_url: `data:application/octet-stream;base64,${data}`,
        detail: args.detail ?? "high",
      }
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
        structuredContent: result,
        details: undefined,
      }
    },
  }
}
