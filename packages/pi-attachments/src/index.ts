import { readFile } from "node:fs/promises"
import { basename, resolve } from "node:path"
import {
  type ExtensionAPI,
  type ExtensionContext,
  CustomEditor,
  getAgentDir,
  getSelectListTheme,
  keyHint,
  truncateToVisualLines,
} from "@earendil-works/pi-coding-agent"
import { registerImages } from "./images.ts"
import { saveSnapshot, type Snapshot } from "./recovery.ts"

type AttachmentSource = Snapshot | { name: string; path: string }

export default function piAttachments(pi: ExtensionAPI): void {
  const storage = resolve(getAgentDir(), "pi-attachments")
  let submissions = 0
  let terminalInputs = 0
  let revision = 0
  let readObserved = false
  let insertText: ((text: string) => void) | undefined
  const lifetime = new AbortController()
  registerImages(pi, storage, lifetime.signal)

  pi.on("input", () => {
    submissions++
  })
  pi.on("session_shutdown", () => {
    lifetime.abort()
  })

  pi.on("session_start", (_event, ctx) => {
    const previous = ctx.ui.getEditorComponent()
    ctx.ui.setEditorComponent((tui, theme, keybindings) => {
      const editor = previous
        ? previous(tui, theme, keybindings)
        : new CustomEditor(tui, theme, keybindings)
      insertText = editor.insertTextAtCursor?.bind(editor)
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
          return typeof value === "function" ? value.bind(target) : value
        },
        set(target, property, value) {
          if (property === "onChange") {
            // Pi rewires callbacks on every installation, including reused editors.
            revision++
            target.onChange = (text) => {
              revision++
              value?.(text)
            }
            return true
          }
          return Reflect.set(target, property, value, target)
        },
      })
    })
    ctx.ui.onTerminalInput(() => {
      terminalInputs++
      return undefined
    })
  })

  async function attach(
    ctx: ExtensionContext,
    capture: () => Promise<AttachmentSource[] | undefined>,
  ): Promise<void> {
    readObserved = false
    const draft = ctx.ui.getEditorText()
    const observedDraft = readObserved
    const sessionId = ctx.sessionManager.getSessionId()
    const sessionFile = ctx.sessionManager.getSessionFile()
    const cwd = ctx.cwd
    const submission = submissions
    const draftRevision = revision
    const insert = insertText
    let inputs = terminalInputs
    let changedDuringOperation = false
    let snapshots: Snapshot[]
    try {
      const sources = await capture()
      if (!sources) return
      inputs = terminalInputs
      snapshots = await Promise.all(
        sources.map(async (source) =>
          "path" in source
            ? { name: source.name, contents: await readFile(source.path) }
            : source,
        ),
      )
    } catch (error) {
      if (lifetime.signal.aborted) throw error
      ctx.ui.notify(`Could not attach: ${String(error)}`, "error")
      return
    }
    let request = { sessionId, sessionFile, cwd, text: draft, snapshots }
    /* eslint-disable no-await-in-loop -- A retry follows the failed save and the user's recovery action. */
    while (true) {
      try {
        const { reference, recovery } = await saveSnapshot(storage, request)
        changedDuringOperation ||= terminalInputs !== inputs
        readObserved = false
        if (
          !lifetime.signal.aborted &&
          !changedDuringOperation &&
          observedDraft &&
          submissions === submission &&
          ctx.sessionManager.getSessionId() === sessionId &&
          ctx.ui.getEditorText() === draft &&
          readObserved &&
          revision === draftRevision &&
          insert
        ) {
          insert(`\n${reference}\n`)
        } else {
          if (!lifetime.signal.aborted) {
            ctx.ui.notify(
              `Could not confirm the requesting draft. Snapshot retained: ${reference}\nRequest saved: ${recovery}`,
              "warning",
            )
          }
        }
        return
      } catch (error) {
        if (lifetime.signal.aborted) throw error
        ctx.ui.notify(
          `Could not attach: ${String(error)}\nContents retained in memory until Pi exits; use /attachments-recover.`,
          "error",
        )
        changedDuringOperation ||= terminalInputs !== inputs
        if (
          snapshots.length === 1 &&
          typeof snapshots[0]!.contents === "string"
        ) {
          const contents = await editText(ctx, snapshots[0]!.contents)
          if (contents === undefined) return
          if (contents !== snapshots[0]!.contents) {
            snapshots = [{ name: snapshots[0]!.name, contents }]
            request = { sessionId, sessionFile, cwd, text: draft, snapshots }
          }
        } else {
          const retry = await ctx.ui.select(
            `Save ${snapshots.map(({ name }) => name).join(", ")}`,
            ["Retry save", "Cancel"],
            { signal: lifetime.signal },
          )
          if (retry !== "Retry save") return
        }
        inputs = terminalInputs
      }
    }
    /* eslint-enable no-await-in-loop */
  }

  function editText(
    ctx: ExtensionContext,
    prefill = "",
  ): Promise<string | undefined> {
    return ctx.ui.custom<string | undefined>(
      (tui, theme, keybindings, done) => {
        const cancel = () => done(undefined)
        lifetime.signal.addEventListener("abort", cancel, { once: true })
        const editor = new CustomEditor(
          tui,
          {
            borderColor: (value) => theme.fg("border", value),
            selectList: getSelectListTheme(),
          },
          keybindings,
        )
        editor.setText(prefill)
        return {
          get focused() {
            return editor.focused
          },
          set focused(value) {
            editor.focused = value
          },
          render(width) {
            return [
              theme.fg("accent", "Attach text"),
              ...editor.render(width),
              ...truncateToVisualLines(
                `${keyHint("tui.input.submit", "attach")}  ${keyHint("tui.select.cancel", "cancel")}`,
                2,
                width,
              ).visualLines,
            ]
          },
          handleInput(data) {
            if (keybindings.matches(data, "tui.select.cancel")) {
              done(undefined)
            } else if (keybindings.matches(data, "tui.input.submit")) {
              // Native dialog submission trims text; snapshot the editor before it clears.
              done(editor.getExpandedText())
            } else {
              editor.handleInput(data)
            }
          },
          invalidate() {
            editor.invalidate()
          },
          dispose() {
            lifetime.signal.removeEventListener("abort", cancel)
          },
        }
      },
      { overlay: true },
    )
  }

  function attachText(text: string, ctx: ExtensionContext): Promise<void> {
    return attach(ctx, async () => {
      const contents = text || (await editText(ctx))
      return contents === undefined
        ? undefined
        : [{ name: "text.txt", contents }]
    })
  }

  function attachFile(paths: string, ctx: ExtensionContext): Promise<void> {
    const cwd = ctx.cwd
    return attach(ctx, async () => {
      const selected =
        paths ||
        (await ctx.ui.input("Attach file", "File path", {
          signal: lifetime.signal,
        }))
      if (selected === undefined) return undefined
      if (!selected) throw new Error("A file path is required")
      return selected.split("\n").map((path) => {
        if (!path || /\p{Cc}/u.test(path)) throw new Error("Invalid file path")
        const source = resolve(cwd, path)
        return {
          name: basename(source).replaceAll(/[<>[\]\\\p{Cc}]/gu, "_"),
          path: source,
        }
      })
    })
  }

  pi.registerCommand("attach-text", {
    description: "Attach text as a preserved file",
    handler: attachText,
  })

  pi.registerCommand("attach-file", {
    description: "Attach file snapshots; one path per line",
    handler: attachFile,
  })
  pi.registerShortcut("ctrl+alt+t", {
    description: "Attach text",
    handler: (ctx) => attachText("", ctx),
  })
  pi.registerShortcut("ctrl+alt+f", {
    description: "Attach file",
    handler: (ctx) => attachFile("", ctx),
  })
}
