import { constants, unlinkSync } from "node:fs"
import { link, mkdir, mkdtemp, open, writeFile } from "node:fs/promises"
import { basename, dirname, join } from "node:path"
import {
  CustomEditor,
  detectSupportedImageMimeTypeFromFile,
  getAgentDir,
  type ExtensionAPI,
  type ExtensionContext,
} from "@earendil-works/pi-coding-agent"
import {
  getNativeClipboard,
  isFocusable,
  matchesKey,
  type TuiMouseEvent,
} from "@earendil-works/pi-tui"

type PasteRequest = {
  ctx: ExtensionContext
  draft: string
  sessionId: string
  revision: number
  observed: boolean
}

type PasteFile =
  | { path: string; contents?: Uint8Array }
  | { name: string; contents: Uint8Array; image: true }
type RetainedPaste = ({ text: string } | { files: PasteFile[] }) & {
  request: Omit<PasteRequest, "ctx">
}

// Pi reloads extension modules when the cwd or resources change.
const unsavedKey = Symbol.for("pi-paste:unsaved")
const processState = globalThis as typeof globalThis & {
  [unsavedKey]?: Map<string, RetainedPaste[]>
}
const unsavedByStorage = (processState[unsavedKey] ??= new Map())

export default function piPaste(pi: ExtensionAPI): void {
  const storage = join(getAgentDir(), "pi-paste")
  const unsaved = unsavedByStorage.get(storage) ?? []
  unsavedByStorage.set(storage, unsaved)
  const lifetime = new AbortController()
  let revision = 0
  let readObserved = false
  let pasteInline: (() => Promise<void>) | undefined
  const handoffs = new Set<string>()

  function changed(): void {
    revision++
    for (const path of handoffs) {
      try {
        unlinkSync(path)
      } catch (error) {
        if (
          !(
            error instanceof Error &&
            "code" in error &&
            error.code === "ENOENT"
          )
        )
          throw error
      }
      handoffs.delete(path)
    }
  }

  pi.on("input", () => {
    changed()
  })
  pi.on("session_shutdown", () => {
    lifetime.abort()
    changed()
  })

  async function inline(ctx: ExtensionContext): Promise<void> {
    if (pasteInline) await pasteInline()
    else ctx.ui.notify("Paste Inline requires an interactive editor", "error")
  }

  pi.registerCommand("paste-inline", {
    description: "Paste clipboard text inline regardless of size",
    handler: (_args, ctx) => inline(ctx),
  })
  pi.registerShortcut("ctrl+alt+v", {
    description: "Paste Inline",
    handler: inline,
  })
  pi.registerCommand("paste-recover", {
    description: "Save pastes retained after a read or storage failure",
    handler: async (_args, ctx) => {
      const pending = unsaved.splice(0)
      if (pending.length === 0) {
        ctx.ui.notify("No unsaved pastes", "info")
        return
      }
      await Promise.all(
        pending.map((retained) =>
          preserve(
            "text" in retained ? retained.text : retained.files,
            { ...retained.request, ctx },
            "Recovered paste",
          ),
        ),
      )
    },
  })

  function request(ctx: ExtensionContext): PasteRequest {
    readObserved = false
    const draft = ctx.ui.getEditorText()
    return {
      ctx,
      draft,
      sessionId: ctx.sessionManager.getSessionId(),
      revision,
      observed: readObserved,
    }
  }

  function unchanged(paste: PasteRequest): boolean {
    if (lifetime.signal.aborted) return false
    readObserved = false
    const draft = paste.ctx.ui.getEditorText()
    return (
      paste.observed &&
      readObserved &&
      revision === paste.revision &&
      draft === paste.draft &&
      paste.ctx.sessionManager.getSessionId() === paste.sessionId
    )
  }

  async function preserve(
    content: string | PasteFile[],
    paste: PasteRequest,
    problem?: string,
  ): Promise<void> {
    const { ctx, ...original } = paste
    const { draft, sessionId } = original
    try {
      const files =
        typeof content === "string"
          ? [{ name: "text.txt", contents: content }]
          : content
      const reads = await Promise.allSettled(
        files.map(async (file) => {
          if ("path" in file && file.contents === undefined) {
            // Reject non-files without blocking on FIFO paths.
            const source = await open(
              file.path,
              constants.O_RDONLY | constants.O_NONBLOCK,
            )
            try {
              if (!(await source.stat()).isFile())
                throw new Error(`Not a regular file: ${file.path}`)
              file.contents = await source.readFile()
            } finally {
              await source.close()
            }
          }
        }),
      )
      const failedRead = reads.find((read) => read.status === "rejected")
      if (failedRead) throw failedRead.reason
      await mkdir(storage, { recursive: true, mode: 0o700 })
      const directory = await mkdtemp(join(storage, "paste-"))
      const paths = files.map((file, index) =>
        join(
          directory,
          typeof content === "string" ? "" : String(index + 1),
          "path" in file ? basename(file.path) : file.name,
        ),
      )
      const saves = await Promise.allSettled(
        files.map(async (file, index) => {
          const path = paths[index]!
          await mkdir(dirname(path), { recursive: true, mode: 0o700 })
          await writeFile(path, file.contents!, { flag: "wx", mode: 0o600 })
        }),
      )
      const failed = saves.find((save) => save.status === "rejected")
      if (failed) throw failed.reason
      const details = [
        ...paths.map((path) => `Paste: ${path}`),
        ...files.flatMap((file) =>
          "path" in file ? [`Source: ${file.path}`] : [],
        ),
      ].join("\n")
      await writeFile(
        join(directory, "request.md"),
        `# Paste request\n\nSession: ${sessionId}\n\n${draft}\n\n${details}\n`,
        { flag: "wx", mode: 0o600 },
      )
      const invalidImages = await Promise.all(
        files.map(
          async (file, index) =>
            "image" in file &&
            !(await detectSupportedImageMimeTypeFromFile(paths[index]!)),
        ),
      )
      if (lifetime.signal.aborted) return
      if (invalidImages.some(Boolean)) {
        ctx.ui.notify(
          `Clipboard image format is unsupported. Paste retained: ${paths.join(", ")}`,
          "error",
        )
      } else if (problem || !unchanged(paste)) {
        ctx.ui.notify(
          `${problem ?? "The requesting draft changed"}. Paste retained: ${paths.join(", ")}`,
          "warning",
        )
      } else if (
        pi
          .getCommands()
          .some(
            (command) =>
              command.name === "attach-file" && command.source === "extension",
          )
      ) {
        const sources = paths.map((path, index) =>
          typeof content === "string"
            ? join(directory, "paste.txt")
            : join(directory, "handoff", String(index + 1), basename(path)),
        )
        await Promise.all(
          sources.map(async (source, index) => {
            await mkdir(dirname(source), { recursive: true, mode: 0o700 })
            await link(paths[index]!, source)
          }),
        )
        if (!unchanged(paste)) {
          for (const source of sources) unlinkSync(source)
          if (!lifetime.signal.aborted) {
            ctx.ui.notify(
              `The requesting draft changed. Paste retained: ${paths.join(", ")}`,
              "warning",
            )
          }
          return
        }
        // Native commands can be deferred; retire their source when the requesting target changes.
        for (const source of sources) handoffs.add(source)
        pi.sendUserMessage(`/attach-file ${sources.join("\n")}`, {
          expandPromptTemplates: true,
        })
      } else {
        ctx.ui.notify(
          `Attach File is unavailable. Paste retained: ${paths.join(", ")}`,
          "error",
        )
      }
    } catch (error) {
      unsaved.push({
        ...(typeof content === "string"
          ? { text: content }
          : { files: content }),
        request: original,
      })
      if (!lifetime.signal.aborted) {
        ctx.ui.notify(
          `Could not preserve paste: ${String(error)}. Paste retained in memory until Pi exits; use /paste-recover.`,
          "error",
        )
      }
    }
  }

  pi.on("session_start", (_event, ctx) => {
    if (ctx.mode !== "tui") return
    ctx.ui.onTerminalInput(() => {
      changed()
      return undefined
    })
    const previous = ctx.ui.getEditorComponent()
    ctx.ui.setEditorComponent((tui, theme, keybindings) => {
      const editor = previous
        ? previous(tui, theme, keybindings)
        : new CustomEditor(tui, theme, keybindings)
      let pendingPaste: string | undefined

      function paste(
        text: string,
        pending = request(ctx),
        forceInline = false,
      ): void {
        if (!unchanged(pending)) {
          void preserve(text, pending, "The requesting draft changed")
        } else if (!forceInline && text.length >= 5000) {
          void preserve(text, pending)
        } else if (editor.insertTextAtCursor) {
          editor.insertTextAtCursor(text)
        } else {
          void preserve(text, pending, "The active editor cannot insert text")
        }
        if (!lifetime.signal.aborted) tui.requestRender()
      }

      async function clipboardPaste(forceInline = false): Promise<void> {
        const pending = request(ctx)
        try {
          const clipboard = getNativeClipboard()
          if (!clipboard) throw new Error("Native clipboard is unavailable")
          const paths = forceInline ? null : await clipboard.getFilePaths?.()
          if (paths?.length) {
            if (paths.some((path) => /\p{Cc}/u.test(path)))
              throw new Error("Clipboard file path contains control characters")
            await preserve(
              paths.map((path) => ({ path })),
              pending,
            )
            return
          }
          const image = forceInline ? null : await clipboard.getImage()
          if (image) {
            await preserve(
              [{ name: "clipboard-image", contents: image, image: true }],
              pending,
            )
            return
          }
          const text = await clipboard.getText()
          if (text === undefined)
            throw new Error("Clipboard text is unavailable")
          if (text) paste(text, pending, forceInline)
        } catch (error) {
          if (!lifetime.signal.aborted) {
            ctx.ui.notify(`Could not paste: ${String(error)}`, "error")
          }
        }
      }
      pasteInline = () => clipboardPaste(true)
      if (!Reflect.get(editor, "onPasteImage", editor)) {
        Reflect.set(editor, "onPasteImage", () => void clipboardPaste(), editor)
      }

      return new Proxy(editor, {
        get(target, property) {
          const value = Reflect.get(target, property, target)
          if (
            (property === "getText" || property === "getExpandedText") &&
            typeof value === "function"
          ) {
            return () => {
              readObserved = true
              return value.call(target)
            }
          }
          if (property === "handleMouse") {
            return (event: TuiMouseEvent) => {
              if (event.button !== "right" || event.type === "press") changed()
              const result = target.handleMouse?.(event)
              if (result?.handled || result?.capture || result?.focus)
                return result
              if (
                event.button === "right" &&
                !event.shift &&
                !event.alt &&
                !event.ctrl &&
                isFocusable(target) &&
                target.focused
              ) {
                if (event.type === "click") void clipboardPaste()
                return { handled: true }
              }
              return result
            }
          }
          if (property === "handleInput") {
            return function handleInput(data: string) {
              changed()
              if (pendingPaste !== undefined || data.startsWith("\x1b[200~")) {
                pendingPaste =
                  (pendingPaste ?? "") +
                  (pendingPaste === undefined ? data.slice(6) : data)
                const end = pendingPaste.indexOf("\x1b[201~")
                if (end < 0) return
                const text = pendingPaste
                  .slice(0, end)
                  // eslint-disable-next-line no-control-regex -- Native CSI-u paste encoding carries literal control bytes.
                  .replace(/\x1b\[(\d+);5u/g, (sequence, code: string) => {
                    const point = Number(code)
                    return (point >= 65 && point <= 90) ||
                      (point >= 97 && point <= 122)
                      ? String.fromCharCode(point & 31)
                      : sequence
                  })
                const rest = pendingPaste.slice(end + 6)
                pendingPaste = undefined
                paste(text)
                if (rest) handleInput(rest)
              } else {
                const clipboardAction = Reflect.get(
                  target,
                  "onPasteImage",
                  target,
                )
                if (
                  matchesKey(data, "super+v") &&
                  !Object.hasOwn(
                    keybindings.getUserBindings(),
                    "app.clipboard.pasteImage",
                  ) &&
                  typeof clipboardAction === "function" &&
                  !Object.values(keybindings.getEffectiveConfig())
                    .flat()
                    .some((key) => key && matchesKey(data, key))
                ) {
                  const shortcut = Reflect.get(
                    target,
                    "onExtensionShortcut",
                    target,
                  )
                  if (
                    typeof shortcut !== "function" ||
                    !shortcut.call(target, data)
                  )
                    clipboardAction.call(target)
                } else {
                  target.handleInput(data)
                }
              }
            }
          }
          if (
            (property === "setText" || property === "insertTextAtCursor") &&
            typeof value === "function"
          ) {
            return (text: string) => {
              changed()
              value.call(target, text)
            }
          }
          return typeof value === "function" ? value.bind(target) : value
        },
        set(target, property, value) {
          if (property === "onChange") {
            changed()
            target.onChange = (text) => {
              changed()
              value?.(text)
            }
            return true
          }
          if (
            property === "focused" &&
            value !== Reflect.get(target, property, target)
          )
            changed()
          return Reflect.set(target, property, value, target)
        },
      })
    })
  })
}
