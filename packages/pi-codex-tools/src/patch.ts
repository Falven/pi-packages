/* eslint-disable no-await-in-loop -- Validation and mutations preserve patch order while holding native file queues. */
import { mkdir, readFile, realpath, unlink, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { getSystemErrorMessage } from "node:util"
import {
  withFileMutationQueue,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent"
import { Type } from "typebox"

const parameters = Type.Object(
  { input: Type.String() },
  { additionalProperties: false },
)
type PatchLine = { kind: " " | "-" | "+"; text: string }
type Hunk = { anchor?: string; eof: boolean; lines: PatchLine[] }
type Operation =
  | { kind: "add"; path: string; content: string }
  | { kind: "delete"; path: string }
  | { kind: "update"; path: string; destination?: string; hunks: Hunk[] }
type SourceLine = { text: string; ending: string }

function parse(input: string, cwd: string): Operation[] {
  const lines = input.trim().split(/\r?\n/)
  if (lines[0] !== "*** Begin Patch" || lines.at(-1) !== "*** End Patch")
    throw new Error("apply_patch verification failed: invalid patch")
  const operations: Operation[] = []
  let index = 1
  while (index < lines.length - 1) {
    const header = lines[index++]!
    if (header.startsWith("*** Add File: ")) {
      const added: string[] = []
      while (lines[index]?.startsWith("+")) added.push(lines[index++]!.slice(1))
      operations.push({
        kind: "add",
        path: resolve(cwd, header.slice(14)),
        content: added.length ? added.join("\n") + "\n" : "",
      })
    } else if (header.startsWith("*** Delete File: ")) {
      operations.push({ kind: "delete", path: resolve(cwd, header.slice(17)) })
    } else if (header.startsWith("*** Update File: ")) {
      const headerLine = index
      const operation: Extract<Operation, { kind: "update" }> = {
        kind: "update",
        path: resolve(cwd, header.slice(17)),
        hunks: [],
      }
      if (lines[index]?.startsWith("*** Move to: "))
        operation.destination = resolve(cwd, lines[index++]!.slice(13))
      while (
        lines[index] === "@@" ||
        lines[index]?.startsWith("@@ ") ||
        (!operation.hunks.length && /^[ +-]/.test(lines[index] ?? ""))
      ) {
        const marker = lines[index]!.startsWith("@@")
          ? lines[index++]
          : undefined
        const hunk: Hunk = {
          eof: false,
          lines: [],
          ...(marker === undefined || marker === "@@"
            ? {}
            : { anchor: marker.slice(3) }),
        }
        while (index < lines.length - 1) {
          const line = lines[index]!
          const kind = line[0]
          if (kind !== " " && kind !== "-" && kind !== "+") break
          hunk.lines.push({ kind, text: line.slice(1) })
          index++
        }
        if (!hunk.lines.length)
          throw new Error(
            `apply_patch verification failed: invalid hunk at line ${index + 1}, Update hunk does not contain any lines`,
          )
        if (lines[index] === "*** End of File") {
          hunk.eof = true
          index++
        }
        operation.hunks.push(hunk)
      }
      if (!operation.hunks.length)
        throw new Error(
          `apply_patch verification failed: invalid hunk at line ${headerLine}, Update file hunk for path '${operation.path}' is empty`,
        )
      operations.push(operation)
    } else {
      throw new Error(
        `apply_patch verification failed: invalid hunk at line ${index}, '${header}' is not a valid hunk header. Valid hunk headers: '*** Add File: {path}', '*** Delete File: {path}', '*** Update File: {path}'`,
      )
    }
  }
  if (!operations.length) throw new Error("patch rejected: empty patch")
  const seen = new Set<string>()
  for (const operation of operations) {
    if (seen.has(operation.path))
      throw new Error(
        `apply_patch verification failed: invalid patch: multiple operations target ${operation.path}`,
      )
    seen.add(operation.path)
  }
  return operations
}

function decode(bytes: Buffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
      bytes,
    )
  } catch {
    // Native decoding validates the bytes; this locates its error for the patch diagnostic.
    for (let index = 0; index < bytes.length;) {
      const first = bytes[index]!
      if (first < 0x80) {
        index++
        continue
      }
      const width =
        first >= 0xc2 && first <= 0xdf
          ? 2
          : first >= 0xe0 && first <= 0xef
            ? 3
            : first >= 0xf0 && first <= 0xf4
              ? 4
              : 0
      if (!width)
        throw new Error(`invalid utf-8 sequence of 1 bytes from index ${index}`)
      for (let offset = 1; offset < width; offset++) {
        const byte = bytes[index + offset]
        if (byte === undefined)
          throw new Error(`incomplete utf-8 byte sequence from index ${index}`)
        const minimum =
          offset === 1 && first === 0xe0
            ? 0xa0
            : offset === 1 && first === 0xf0
              ? 0x90
              : 0x80
        const maximum =
          offset === 1 && first === 0xed
            ? 0x9f
            : offset === 1 && first === 0xf4
              ? 0x8f
              : 0xbf
        if (byte < minimum || byte > maximum)
          throw new Error(
            `invalid utf-8 sequence of ${offset} bytes from index ${index}`,
          )
      }
      index += width
    }
    throw new Error("Invalid UTF-8 content")
  }
}

function readError(error: unknown): string {
  const errno = (error as NodeJS.ErrnoException).errno
  if (typeof errno === "number" && errno < 0) {
    const message = getSystemErrorMessage(errno)
    return `${message[0]!.toUpperCase()}${message.slice(1)} (os error ${-errno})`
  }
  return error instanceof Error ? error.message : String(error)
}

const trimEnd = (text: string) => text.replace(/\p{White_Space}+$/u, "")
const trim = (text: string) => trimEnd(text).replace(/^\p{White_Space}+/u, "")
const normalize = (text: string) =>
  trim(text)
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[‐‑‒–—−]/g, "-")
    .replace(/[\u00a0\u2000-\u200a\u202f\u205f\u3000]/g, " ")

function match(
  source: SourceLine[],
  expected: string[],
  start: number,
  eof = false,
): number {
  const last = source.length - expected.length
  if (start > last) return -1
  for (const transform of [(text: string) => text, trimEnd, trim, normalize]) {
    for (let index = eof ? last : start; index <= last; index++) {
      if (
        expected.every(
          (text, offset) =>
            transform(source[index + offset]!.text) === transform(text),
        )
      )
        return index
    }
  }
  return -1
}

function update(
  content: string,
  operation: Extract<Operation, { kind: "update" }>,
): string {
  const source: SourceLine[] = content.split("\n").map((text, index, parts) => {
    const ending =
      index === parts.length - 1 ? "" : text.endsWith("\r") ? "\r\n" : "\n"
    return { text: ending === "\r\n" ? text.slice(0, -1) : text, ending }
  })
  if (source.at(-1)?.text === "" && source.at(-1)?.ending === "") source.pop()
  const ending = source.find((line) => line.ending)?.ending ?? "\n"
  const result: SourceLine[] = []
  let cursor = 0
  for (const hunk of operation.hunks) {
    let start = cursor
    if (hunk.anchor !== undefined) {
      const anchor = match(source, [hunk.anchor], start)
      if (anchor < 0)
        throw new Error(
          `apply_patch verification failed: Failed to find context '${hunk.anchor}' in ${operation.path}`,
        )
      start = anchor + 1
    }
    const expected = hunk.lines
      .filter((line) => line.kind !== "+")
      .map((line) => line.text)
    let index = expected.length
      ? match(source, expected, start, hunk.eof)
      : source.length
    if (index < 0)
      throw new Error(
        `apply_patch verification failed: Failed to find expected lines in ${operation.path}:\n${expected.join("\n")}`,
      )
    result.push(...source.slice(cursor, index))
    for (const line of hunk.lines) {
      if (line.kind === "+") result.push({ text: line.text, ending })
      else {
        if (line.kind === " ") result.push(source[index]!)
        index++
      }
    }
    cursor = index
  }
  result.push(...source.slice(cursor))
  return result.map((line) => line.text + (line.ending || ending)).join("")
}

async function coordinated<T>(
  paths: string[],
  action: () => Promise<T>,
): Promise<T> {
  const keys = [
    ...new Set(
      await Promise.all(
        paths.map(async (path) => {
          try {
            return await realpath(path)
          } catch (error) {
            if (
              ["ENOENT", "ENOTDIR"].includes(
                (error as NodeJS.ErrnoException).code ?? "",
              )
            )
              return path
            throw error
          }
        }),
      ),
    ),
  ].toSorted()
  const acquire = (index: number): Promise<T> =>
    index === keys.length
      ? action()
      : withFileMutationQueue(keys[index]!, () => acquire(index + 1))
  return acquire(0)
}

export function createPatch(
  available: () => boolean,
  lifetime: AbortSignal,
): ToolDefinition<typeof parameters, undefined> {
  return {
    name: "apply_patch",
    label: "Patch",
    description:
      "The `apply_patch` tool can be used to edit files. This is a FREEFORM tool, so do not wrap the patch in JSON.",
    parameters,
    exposure: "codemode",
    async execute(_id, args, signal, _onUpdate, ctx) {
      const abort = signal ? AbortSignal.any([signal, lifetime]) : lifetime
      abort.throwIfAborted()
      if (!available())
        throw new Error(
          "File patches are not available in the active tool scope",
        )
      const operations = parse(args.input, ctx.cwd)
      await coordinated(
        operations.flatMap((operation) =>
          operation.kind === "update" && operation.destination
            ? [operation.path, operation.destination]
            : [operation.path],
        ),
        async () => {
          const plans: { operation: Operation; content?: string }[] = []
          for (const operation of operations) {
            abort.throwIfAborted()
            if (operation.kind === "add")
              plans.push({ operation, content: operation.content })
            else {
              let content: string
              try {
                content = decode(await readFile(operation.path))
              } catch (error) {
                throw new Error(
                  `apply_patch verification failed: Failed to read${operation.kind === "update" ? " file to update" : ""} ${operation.path}: ${readError(error)}`,
                  { cause: error },
                )
              }
              abort.throwIfAborted()
              plans.push({
                operation,
                ...(operation.kind === "update"
                  ? { content: update(content, operation) }
                  : {}),
              })
            }
          }
          const started = performance.now()
          const failure = (message: string) =>
            new Error(
              `Exit code: 1\nWall time: ${Math.floor((performance.now() - started) / 1000)} seconds\nOutput:\n${message}`,
            )
          for (const { operation, content } of plans) {
            abort.throwIfAborted()
            if (operation.kind !== "delete") {
              const path =
                operation.kind === "update"
                  ? (operation.destination ?? operation.path)
                  : operation.path
              try {
                await mkdir(dirname(path), { recursive: true })
                abort.throwIfAborted()
                await writeFile(path, content!)
              } catch {
                abort.throwIfAborted()
                throw failure(`Failed to write file ${path}`)
              }
              abort.throwIfAborted()
            }
            if (
              operation.kind === "delete" ||
              (operation.kind === "update" && operation.destination)
            ) {
              try {
                await unlink(operation.path)
              } catch {
                abort.throwIfAborted()
                throw failure(`Failed to delete file ${operation.path}`)
              }
              abort.throwIfAborted()
            }
          }
        },
      )
      return {
        content: [{ type: "text", text: "{}" }],
        structuredContent: {},
        details: undefined,
      }
    },
  }
}
