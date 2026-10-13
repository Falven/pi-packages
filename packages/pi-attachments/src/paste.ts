import { statSync } from "node:fs"
import { homedir } from "node:os"
import { basename, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import type {
  ExtensionAPI,
  ExtensionContext,
  KeybindingsManager,
} from "@earendil-works/pi-coding-agent"
import {
  getNativeClipboard,
  isFocusable,
  matchesKey,
  type EditorComponent,
  type TUI,
  type TuiMouseEvent,
} from "@earendil-works/pi-tui"
import { readRegularFile, type Snapshot } from "./recovery.ts"

function content(
  text: string,
  cwd: string,
  forceInline = false,
): string | Snapshot[] | Promise<string | Snapshot[]> {
  const fallback =
    forceInline || text.length < 5000
      ? text
      : [{ name: "paste.txt", contents: Buffer.from(text) }]
  if (!forceInline && text && !/\p{Cc}/u.test(text)) {
    let unquoted = text
    if (text.startsWith("'") && text.endsWith("'")) {
      unquoted = text.slice(1, -1)
    } else if (text.startsWith('"') && text.endsWith('"')) {
      unquoted = text.slice(1, -1).replace(/\\(["\\$`])/gu, "$1")
    } else {
      unquoted = text.replace(/\\(.)/gu, "$1")
    }
    for (let path of new Set([text, unquoted])) {
      try {
        if (/^file:/iu.test(path)) {
          const url = new URL(path)
          if (url.hostname && url.hostname !== "localhost") continue
          path = fileURLToPath(url)
        } else if (path.startsWith("~/")) {
          path = resolve(homedir(), path.slice(2))
        }
        if (!path || /\p{Cc}/u.test(path)) continue
        path = resolve(cwd, path)
        // Keep ordinary text insertion synchronous without reading file bytes on the UI thread.
        if (statSync(path).isFile()) {
          return readRegularFile(path).then(
            (contents) => [
              {
                name: basename(path).replaceAll(/[<>[\]\\\p{Cc}]/gu, "_"),
                contents,
              },
            ],
            () => fallback,
          )
        }
      } catch {
        // Unmatched paths follow ordinary text-paste policy.
      }
    }
  }
  return fallback
}

export function registerPaste(
  pi: ExtensionAPI,
  attach: (
    ctx: ExtensionContext,
    capture: () => Promise<Snapshot[] | string | undefined>,
    interactive?: boolean,
  ) => Promise<void>,
  signal: AbortSignal,
  changed: () => void,
) {
  let pasteInline: (() => Promise<void>) | undefined

  async function inline(ctx: ExtensionContext): Promise<void> {
    if (pasteInline) await pasteInline()
    else ctx.ui.notify("Paste Inline requires an interactive editor", "error")
  }

  pi.registerCommand("paste-inline", {
    description: "Paste clipboard text without attachment conversion",
    handler: (_args, ctx) => inline(ctx),
  })
  pi.registerShortcut("ctrl+alt+v", {
    description: "Paste Inline",
    handler: inline,
  })

  return function withPaste(
    editor: EditorComponent,
    ctx: ExtensionContext,
    tui: TUI,
    keybindings: KeybindingsManager,
  ): EditorComponent {
    let pendingPaste: string | undefined

    function paste(text: string): void {
      const captured = content(text, ctx.cwd)
      if (typeof captured === "string" && editor.insertTextAtCursor) {
        editor.insertTextAtCursor(captured)
      } else {
        void attach(ctx, async () => captured, false)
      }
      if (!signal.aborted) tui.requestRender()
    }

    function clipboardPaste(forceInline = false): Promise<void> {
      const cwd = ctx.cwd
      // Capture the requesting draft before the first clipboard read.
      return attach(
        ctx,
        async () => {
          try {
            const clipboard = getNativeClipboard()
            if (!clipboard) throw new Error("Native clipboard is unavailable")
            const paths = forceInline ? null : await clipboard.getFilePaths?.()
            if (paths?.length) {
              return paths.map((path) => {
                if (!path || /\p{Cc}/u.test(path))
                  throw new Error(
                    "Clipboard file path contains control characters",
                  )
                const source = resolve(cwd, path)
                return {
                  name: basename(source).replaceAll(/[<>[\]\\\p{Cc}]/gu, "_"),
                  path: source,
                }
              })
            }
            const image = forceInline ? null : await clipboard.getImage()
            if (image) {
              return [{ name: "clipboard-image", contents: image, image: true }]
            }
            const text = await clipboard.getText()
            if (text === undefined)
              throw new Error("Clipboard text is unavailable")
            return text ? content(text, cwd, forceInline) : undefined
          } catch (error) {
            if (!signal.aborted)
              ctx.ui.notify(`Could not paste: ${String(error)}`, "error")
            return undefined
          }
        },
        false,
      )
    }

    pasteInline = () => clipboardPaste(true)
    if (!Reflect.get(editor, "onPasteImage", editor)) {
      Reflect.set(editor, "onPasteImage", () => void clipboardPaste(), editor)
    }

    return new Proxy(editor, {
      get(target, property) {
        const value = Reflect.get(target, property, target)
        if (property === "handleMouse") {
          return (event: TuiMouseEvent) => {
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
              if (rest) {
                changed()
                handleInput(rest)
              }
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
        return typeof value === "function" ? value.bind(target) : value
      },
      set(target, property, value) {
        return Reflect.set(target, property, value, target)
      },
    })
  }
}
