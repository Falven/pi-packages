import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { getSystemErrorMessage } from "node:util";
import {
  convertToPng,
  detectSupportedImageMimeTypeFromFile,
  type ExtensionAPI,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { argumentError, invalidArgument, objectArguments } from "./arguments.ts";

const parameters = Type.Object(
  {
    detail: Type.Optional(Type.Union([Type.Literal("high"), Type.Literal("original")])),
    path: Type.String(),
  },
  { additionalProperties: false },
);

function prepareArguments(value: unknown): { path: string; detail?: "high" | "original" } {
  const args = objectArguments("view_image", value);
  for (const [key, field] of Object.entries(args)) {
    if (field === undefined) continue;
    if ((key === "path" || (key === "detail" && field !== null)) && typeof field !== "string")
      throw invalidArgument(args, key, "a string");
  }
  if (args["path"] === undefined) throw argumentError(args, "missing field `path`");
  const detail = args["detail"];
  if (detail != null && detail !== "high" && detail !== "original")
    throw new Error(
      `view_image.detail only supports \`high\` or \`original\`; omit \`detail\` for default high resized behavior, got \`${String(args["detail"])}\``,
    );
  return { path: args["path"] as string, ...(detail == null ? {} : { detail }) };
}

function fileError(action: string, path: string, error: unknown): Error {
  const errno = (error as NodeJS.ErrnoException).errno;
  if (errno === undefined) throw error;
  const message = getSystemErrorMessage(errno);
  return new Error(
    `unable to ${action} image at \`${path}\`: ${message[0]!.toUpperCase()}${message.slice(1)} (os error ${Math.abs(errno)})`,
  );
}

export function createImage(
  pi: ExtensionAPI,
  available: () => boolean,
): ToolDefinition<typeof parameters, { path: string }> {
  const checkBlocking = () => {
    if (pi.getSettings().images?.blockImages) throw new Error("Image reading is disabled.");
  };
  return {
    name: "view_image",
    label: "Image",
    description:
      "View a local image file from the filesystem when visual inspection is needed. Use this for images already available on disk.",
    parameters,
    prepareArguments,
    exposure: "codemode",
    async execute(_id, args, signal, onUpdate, ctx) {
      signal?.throwIfAborted();
      if (!available()) throw new Error("Image reading is not available in the active tool scope");
      // Permission hooks can edit arguments after the host's preparation step.
      args = prepareArguments(args);
      const path = resolve(ctx.cwd, args.path);
      onUpdate?.({ content: [], details: { path } });
      checkBlocking();
      const file = await stat(path).catch((error: unknown) => {
        throw fileError("locate", path, error);
      });
      if (!file.isFile()) throw new Error(`image path \`${path}\` is not a file`);
      checkBlocking();
      const mimeType = await detectSupportedImageMimeTypeFromFile(path).catch((error: unknown) => {
        throw fileError("read", path, error);
      });
      if (!mimeType || mimeType === "image/bmp")
        throw new Error("unable to process image: invalid or unsupported image data");
      checkBlocking();
      const bytes = await readFile(path, { signal }).catch((error: unknown) => {
        throw fileError("read", path, error);
      });
      const data = bytes.toString("base64");
      // Decode for validity without resizing or replacing the returned bytes.
      if (!(await convertToPng(data, "application/octet-stream")))
        throw new Error("unable to process image: invalid or unsupported image data");
      signal?.throwIfAborted();
      checkBlocking();
      const result = {
        image_url: `data:application/octet-stream;base64,${data}`,
        detail: args.detail ?? "high",
      };
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
        structuredContent: result,
        details: { path },
      };
    },
  };
}
