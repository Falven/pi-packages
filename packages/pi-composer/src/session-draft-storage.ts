import { createHash, randomUUID } from "node:crypto"
import { readFileSync, readdirSync } from "node:fs"
import { mkdir, rename, writeFile } from "node:fs/promises"
import { isAbsolute, join } from "node:path"

export const checkpointType = "pi-composer:draft"
export const clearedDraftType = "pi-composer:cleared-draft"

export type ClearedDraft = {
  version: 1
  sessionId: string
  text: string
}

export function isClearedDraft(data: unknown): data is ClearedDraft {
  return (
    typeof data === "object" &&
    data !== null &&
    "version" in data &&
    data.version === 1 &&
    "sessionId" in data &&
    typeof data.sessionId === "string" &&
    data.sessionId.length > 0 &&
    "text" in data &&
    typeof data.text === "string"
  )
}

export type DraftCheckpoint = {
  version: 1
  sessionId: string
  sessionFile: string
  cwd: string
  revision: number
  text: string
  clearedDrafts?: string[]
}

export function isCheckpoint(data: unknown): data is DraftCheckpoint {
  return (
    typeof data === "object" &&
    data !== null &&
    "version" in data &&
    data.version === 1 &&
    "sessionId" in data &&
    typeof data.sessionId === "string" &&
    data.sessionId.length > 0 &&
    "sessionFile" in data &&
    typeof data.sessionFile === "string" &&
    isAbsolute(data.sessionFile) &&
    "cwd" in data &&
    typeof data.cwd === "string" &&
    isAbsolute(data.cwd) &&
    "revision" in data &&
    typeof data.revision === "number" &&
    Number.isSafeInteger(data.revision) &&
    data.revision >= 0 &&
    "text" in data &&
    typeof data.text === "string" &&
    (!("clearedDrafts" in data) ||
      (Array.isArray(data.clearedDrafts) &&
        data.clearedDrafts.every((text) => typeof text === "string")))
  )
}

export function readDrafts(directory: string): {
  drafts: DraftCheckpoint[]
  errors: string[]
} {
  const drafts = new Map<string, DraftCheckpoint>()
  const errors: string[] = []
  let names: string[]
  try {
    names = readdirSync(directory)
  } catch (error) {
    if (
      !(error instanceof Error && "code" in error && error.code === "ENOENT")
    ) {
      errors.push(
        `Could not read draft recovery in ${directory}: ${String(error)}`,
      )
    }
    return { drafts: [], errors }
  }
  for (const name of names) {
    if (!name.endsWith(".json")) continue
    const path = join(directory, name)
    try {
      const draft: unknown = JSON.parse(readFileSync(path, "utf8"))
      if (!isCheckpoint(draft)) throw new Error("Invalid draft checkpoint")
      const previous = drafts.get(draft.sessionId)
      if (!previous || draft.revision > previous.revision) {
        drafts.set(draft.sessionId, draft)
      }
    } catch (error) {
      errors.push(`Could not read saved draft ${path}: ${String(error)}`)
    }
  }
  return { drafts: [...drafts.values()], errors }
}

export async function writeDraft(
  directory: string,
  draft: DraftCheckpoint,
): Promise<void> {
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const name = createHash("sha256").update(draft.sessionId).digest("hex")
  const destination = join(directory, `${name}.json`)
  const pending = join(directory, `${name}.${randomUUID()}.pending.json`)
  // Keep the previous checkpoint until the complete replacement is durable.
  await writeFile(pending, JSON.stringify(draft), {
    flag: "wx",
    mode: 0o600,
    flush: true,
  })
  await rename(pending, destination)
}
