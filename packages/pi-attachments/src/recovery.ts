import { mkdir, mkdtemp, writeFile } from "node:fs/promises"
import { join } from "node:path"
import type {
  ExtensionAPI,
  ExtensionContext,
  InputEvent,
} from "@earendil-works/pi-coding-agent"

type RequestContext = {
  sessionId: string
  sessionFile: string | undefined
  cwd: string
  text: string
}
type ImageRequest = InputEvent & RequestContext
export type Snapshot = { name: string; contents: string | Buffer }
type SnapshotRequest = RequestContext & { snapshot: Snapshot }
type RetainedRequest = ImageRequest | SnapshotRequest

// Pi reloads extension modules when the cwd or resources change.
const unsavedKey = Symbol.for("pi-attachments:unsaved")
const processState = globalThis as typeof globalThis & {
  [unsavedKey]?: Map<string, Set<RetainedRequest>>
}
const unsavedByStorage = (processState[unsavedKey] ??= new Map())

export async function saveSnapshot(storage: string, request: SnapshotRequest) {
  const unsaved = unsavedByStorage.get(storage) ?? new Set()
  unsavedByStorage.set(storage, unsaved)
  try {
    await mkdir(storage, { recursive: true, mode: 0o700 })
    const directory = await mkdtemp(join(storage, "snapshot-"))
    const path = join(directory, request.snapshot.name)
    const reference = `[Attachment: ${request.snapshot.name}](<${path}>)`
    const recovery = `${path}.draft.md`
    await writeFile(
      recovery,
      `# Attachment request\n\nSession: ${request.sessionId}\n${request.sessionFile ? `Session file: ${request.sessionFile}\n` : ""}Working directory: ${request.cwd}\n\n${request.text}\n\n${reference}\n`,
      { flag: "wx", mode: 0o600, flush: true },
    )
    await writeFile(path, request.snapshot.contents, {
      flag: "wx",
      mode: 0o600,
      flush: true,
    })
    unsaved.delete(request)
    return { path, reference, recovery }
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
  try {
    await mkdir(storage, { recursive: true, mode: 0o700 })
    const directory = await mkdtemp(join(storage, "request-"))
    const references = await Promise.all(
      (request.images ?? []).map(async (image, index) => {
        const name = `input-image-${index + 1}`
        const path = join(directory, name)
        await writeFile(path, Buffer.from(image.data, "base64"), {
          flag: "wx",
          mode: 0o600,
          flush: true,
        })
        return `[Attachment: ${name}](<${path}>)`
      }),
    )
    const path = join(directory, "request.draft.md")
    await writeFile(
      path,
      `# Attachment request\n\nSession: ${request.sessionId}\n${request.sessionFile ? `Session file: ${request.sessionFile}\n` : ""}Working directory: ${request.cwd}\nDelivery: ${request.streamingBehavior ?? "normal"}\n\n${request.text}\n\n${references.join("\n")}\n`,
      { flag: "wx", mode: 0o600, flush: true },
    )
    unsaved.delete(request)
    return path
  } catch (error) {
    unsaved.add(request)
    throw error
  }
}

export function registerRecovery(
  pi: ExtensionAPI,
  storage: string,
  signal: AbortSignal,
): void {
  async function retry(ctx: ExtensionContext): Promise<void> {
    const requests = [...(unsavedByStorage.get(storage) ?? [])]
    await Promise.all(
      requests.map(async (request) => {
        try {
          const path =
            "snapshot" in request
              ? (await saveSnapshot(storage, request)).recovery
              : await saveRequest(storage, request)
          if (!signal.aborted) ctx.ui.notify(`Request saved: ${path}`, "info")
        } catch (error) {
          if (!signal.aborted) {
            ctx.ui.notify(
              `Could not save recovery for session ${request.sessionId}: ${String(error)}\nContents retained in memory until Pi exits; use /attachments-recover.`,
              "error",
            )
          }
        }
      }),
    )
  }

  pi.on("session_start", (_event, ctx) => retry(ctx))
  pi.on("agent_settled", (_event, ctx) => retry(ctx))
  pi.registerCommand("attachments-recover", {
    description: "Save attachment requests retained after a storage failure",
    handler: (_args, ctx) => retry(ctx),
  })
}
