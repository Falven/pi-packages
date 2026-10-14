import { constants } from "node:fs"
import { mkdir, mkdtemp, open, rename, writeFile } from "node:fs/promises"
import { basename, dirname, join } from "node:path"
import {
  detectSupportedImageMimeTypeFromFile,
  type ExtensionAPI,
  type ExtensionContext,
  type InputEvent,
} from "@earendil-works/pi-coding-agent"
import { markUnused, type UnpublishedCapture } from "./cleanup.ts"

const unpublishedKey = Symbol.for("pi-attachments:unpublished-captures")
type RequestContext = {
  sessionId: string
  sessionFile?: string | undefined
  cwd?: string
  text: string
  [unpublishedKey]?: UnpublishedCapture[]
}
type ImageRequest = Pick<
  InputEvent,
  "submissionId" | "text" | "images" | "streamingBehavior"
> &
  RequestContext
export type Snapshot =
  | { name: string; contents: string | Uint8Array; image?: true }
  | { name: string; path: string; contents?: Uint8Array | undefined }
type SnapshotRequest = RequestContext & { snapshots: Snapshot[] }
type RetainedRequest = ImageRequest | SnapshotRequest
type LegacyPaste = (
  | { text: string }
  | {
      files: (
        | { path: string; contents?: Uint8Array }
        | { name: string; contents: Uint8Array; image: true }
      )[]
    }
) & { request: { sessionId: string; draft: string } }

// Pi reloads extension modules when the cwd or resources change.
const unsavedKey = Symbol.for("pi-attachments:unsaved")
const legacyKey = Symbol.for("pi-paste:unsaved")
const processState = globalThis as typeof globalThis & {
  [unsavedKey]?: Map<string, Set<RetainedRequest>>
  [legacyKey]?: Map<string, LegacyPaste[]>
}
const unsavedByStorage = (processState[unsavedKey] ??= new Map())

export async function readRegularFile(path: string): Promise<Uint8Array> {
  const source = await open(path, constants.O_RDONLY | constants.O_NONBLOCK)
  try {
    if (!(await source.stat()).isFile())
      throw new Error(`Not a regular file: ${path}`)
    return await source.readFile()
  } finally {
    await source.close()
  }
}

export async function saveSnapshot(storage: string, request: SnapshotRequest) {
  const unsaved = unsavedByStorage.get(storage) ?? new Set()
  unsavedByStorage.set(storage, unsaved)
  try {
    const reads = await Promise.allSettled(
      request.snapshots.map(async (snapshot) => {
        if ("path" in snapshot && snapshot.contents === undefined) {
          snapshot.contents = await readRegularFile(snapshot.path)
        }
      }),
    )
    const failed = reads.find((read) => read.status === "rejected")
    await mkdir(storage, { recursive: true, mode: 0o700 })
    const directory = await mkdtemp(join(storage, "snapshot-"))
    const captured = await Promise.all(
      request.snapshots.map(async (snapshot, index, all) => {
        if (snapshot.contents === undefined) return undefined
        const parent =
          all.length === 1 ? directory : join(directory, String(index + 1))
        await mkdir(parent, { recursive: true, mode: 0o700 })
        return { ...snapshot, path: join(parent, snapshot.name) }
      }),
    )
    const files = captured.filter((file) => file !== undefined)
    const images = await Promise.allSettled(
      files.map(async (file) => {
        if (!("image" in file && file.image)) return false
        await writeFile(file.path, file.contents!, {
          flag: "wx",
          mode: 0o600,
          flush: true,
        })
        const mimeType = await detectSupportedImageMimeTypeFromFile(file.path)
        if (!mimeType) return true
        const extension = `.${mimeType.slice("image/".length)}`
        await rename(file.path, file.path + extension)
        file.path += extension
        file.name += extension
        return false
      }),
    )
    const missing = request.snapshots.flatMap((snapshot) =>
      "path" in snapshot && snapshot.contents === undefined
        ? [`Uncaptured file: ${snapshot.path}`]
        : [],
    )
    const reference = files
      .map(({ name, path }) => `[Attachment: ${name}](<${path}>)`)
      .join("\n")
    const recovery = files[0]
      ? `${files[0].path}.draft.md`
      : join(directory, "request.draft.md")
    await writeFile(
      recovery,
      `# Attachment request\n\nSession: ${request.sessionId}\n${request.sessionFile ? `Session file: ${request.sessionFile}\n` : ""}${request.cwd === undefined ? "" : `Working directory: ${request.cwd}\n`}\n${request.text}\n\n${reference}\n${missing.length ? `\n${missing.join("\n")}\n` : ""}`,
      { flag: "wx", mode: 0o600, flush: true },
    )
    await Promise.all(
      files
        .filter((file) => !("image" in file && file.image))
        .map(({ path, contents }) =>
          writeFile(path, contents!, {
            flag: "wx",
            mode: 0o600,
            flush: true,
          }),
        ),
    )
    const imageFailure = images.find((image) => image.status === "rejected")
    if (failed || imageFailure) {
      throw new Error(
        `${String((failed ?? imageFailure)!.reason)}\nCaptured contents saved: ${recovery}`,
      )
    }
    unsaved.delete(request)
    return {
      reference,
      recovery,
      problem: images.some(
        (image) => image.status === "fulfilled" && image.value,
      )
        ? "Clipboard image format is unsupported"
        : undefined,
    }
  } catch (error) {
    unsaved.add(request)
    throw error
  }
}

export async function saveRequest(
  storage: string,
  request: ImageRequest,
): Promise<string> {
  const unsaved = unsavedByStorage.get(storage) ?? new Set()
  unsavedByStorage.set(storage, unsaved)
  let unpublished: UnpublishedCapture | undefined
  try {
    await mkdir(storage, { recursive: true, mode: 0o700 })
    const directory = await mkdtemp(join(storage, "request-"))
    const images = (request.images ?? []).map((image, index) => {
      const extension = /^image\/(png|jpeg|gif|webp|bmp)$/.exec(
        image.mimeType,
      )?.[1]
      return {
        name: `input-image-${index + 1}${extension ? `.${extension}` : ""}`,
        data: image.data,
      }
    })
    unpublished = {
      directory,
      files: images,
    }
    const writes = await Promise.allSettled(
      images.map(async ({ name, data }) => {
        const path = join(directory, name)
        await writeFile(path, Buffer.from(data, "base64"), {
          flag: "wx",
          mode: 0o600,
          flush: true,
        })
        return `[Attachment: ${name}](<${path}>)`
      }),
    )
    const references = writes.map((write) => {
      if (write.status === "rejected") throw write.reason
      return write.value
    })
    const path = join(directory, "request.draft.md")
    // Even a failed metadata write may expose a usable recovery reference.
    unpublished = undefined
    await writeFile(
      path,
      `# Attachment request\n\nSession: ${request.sessionId}\n${request.sessionFile ? `Session file: ${request.sessionFile}\n` : ""}${request.cwd === undefined ? "" : `Working directory: ${request.cwd}\n`}${request.submissionId ? `Submission: ${request.submissionId}\n` : ""}Delivery: ${request.streamingBehavior ?? "normal"}\n\n${request.text}\n\n${references.join("\n")}\n`,
      { flag: "wx", mode: 0o600, flush: true },
    )
    try {
      for (const capture of request[unpublishedKey]?.slice() ?? []) {
        markUnused(storage, capture, directory)
        request[unpublishedKey]!.shift()
      }
    } catch (error) {
      throw new Error(
        `Request saved: ${path}\nCould not record cleanup eligibility: ${String(error)}`,
        { cause: error },
      )
    }
    unsaved.delete(request)
    return path
  } catch (error) {
    if (unpublished) (request[unpublishedKey] ??= []).push(unpublished)
    unsaved.add(request)
    throw error
  }
}

export function registerRecovery(
  pi: ExtensionAPI,
  storage: string,
  signal: AbortSignal,
): void {
  async function retry(
    ctx: ExtensionContext,
    reportEmpty = false,
  ): Promise<void> {
    const legacy = processState[legacyKey]?.get(
      join(dirname(storage), "pi-paste"),
    )
    if (legacy?.length) {
      const unsaved = unsavedByStorage.get(storage) ?? new Set()
      unsavedByStorage.set(storage, unsaved)
      for (const retained of legacy.splice(0)) {
        unsaved.add({
          sessionId: retained.request.sessionId,
          text: retained.request.draft,
          snapshots:
            "text" in retained
              ? [{ name: "paste.txt", contents: retained.text }]
              : retained.files.map((file) =>
                  "path" in file
                    ? {
                        name: basename(file.path).replaceAll(
                          /[<>[\]\\\p{Cc}]/gu,
                          "_",
                        ),
                        path: file.path,
                        contents: file.contents,
                      }
                    : {
                        name: file.name,
                        contents: file.contents,
                        image: true,
                      },
                ),
        })
      }
    }
    const requests = [...(unsavedByStorage.get(storage) ?? [])]
    if (reportEmpty && requests.length === 0) {
      ctx.ui.notify("No unsaved attachment requests.", "info")
      return
    }
    await Promise.all(
      requests.map(async (request) => {
        try {
          const result =
            "snapshots" in request
              ? await saveSnapshot(storage, request)
              : {
                  recovery: await saveRequest(storage, request),
                  problem: undefined,
                }
          if (!signal.aborted) {
            ctx.ui.notify(
              `${result.problem ? `${result.problem}. ` : ""}Request saved: ${result.recovery}`,
              result.problem ? "error" : "info",
            )
          }
        } catch (error) {
          if (!signal.aborted) {
            ctx.ui.notify(
              `Attachment recovery incomplete for session ${request.sessionId}: ${String(error)}\nContents retained in memory until Pi exits; use /attachments-recover.`,
              "error",
            )
          }
        }
      }),
    )
  }

  pi.on("session_start", (_event, ctx) => retry(ctx))
  pi.on("agent_settled", (_event, ctx) => retry(ctx))
  for (const name of ["attachments-recover", "paste-recover"]) {
    pi.registerCommand(name, {
      description:
        "Save attachment requests retained after a read or storage failure",
      handler: (_args, ctx) => retry(ctx, true),
    })
  }
}
