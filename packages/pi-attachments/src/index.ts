import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises"
import { basename, join, resolve } from "node:path"
import { stripVTControlCharacters } from "node:util"
import {
  type ExtensionAPI,
  type ExtensionContext,
  CustomEditor,
  detectSupportedImageMimeTypeFromFile,
  getAgentDir,
  getSelectListTheme,
  keyHint,
  truncateToVisualLines,
} from "@earendil-works/pi-coding-agent"
import { type Editor, ScrollView, Text } from "@earendil-works/pi-tui"
import {
  attachmentPaths,
  attachmentReferences,
  registerImages,
  snapshotFile,
} from "./images.ts"

type Snapshot = { name: string; contents: string | Buffer }
type AttachmentSource = Snapshot | { name: string; path: string }

export default function piAttachments(pi: ExtensionAPI): void {
  const storage = resolve(getAgentDir(), "pi-attachments")
  let submissions = 0
  let terminalInputs = 0
  let revision = 0
  let readObserved = false
  let restoreInline: ((path: string, contents: string) => void) | undefined
  const lifetime = new AbortController()
  registerImages(pi, storage, lifetime.signal)

  function withoutAttachment(text: string, path: string): string {
    for (const reference of attachmentReferences(text, storage).toReversed()) {
      if (reference.path === path)
        text = text.slice(0, reference.from) + text.slice(reference.to)
    }
    return text
  }

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
      let restoration: ((text: string) => void) | undefined
      let removingReferences = false
      restoreInline = (path, contents) => {
        if (!editor.insertTextAtCursor)
          throw new Error("The active editor cannot insert text")
        const getCursor = Reflect.get(editor, "getCursor") as
          | Editor["getCursor"]
          | undefined
        if (typeof getCursor !== "function")
          throw new Error("The active editor cannot report its native cursor")
        const before = editor.getText()
        const references = attachmentReferences(before, storage).filter(
          (reference) => reference.path === path,
        )
        restoration = (text) => {
          const cursor = getCursor.call(editor)
          const end =
            text
              .split("\n")
              .slice(0, cursor.line)
              .reduce((offset, line) => offset + line.length + 1, 0) +
            cursor.col
          const to = before.length - text.length + end
          const inline = contents.replace(/\r\n?/g, "\n")
          const inserted = [inline, inline.replaceAll("\t", "    ")].find(
            (candidate) => {
              const from = end - candidate.length
              return (
                from >= 0 &&
                to >= from &&
                text.slice(from, end) === candidate &&
                before.slice(0, from) === text.slice(0, from) &&
                before.slice(to) === text.slice(end)
              )
            },
          )
          if (inserted === undefined)
            throw new Error(
              "Could not map the editor insertion; attachment retained",
            )
          const from = end - inserted.length
          const delta = text.length - before.length
          const ranges = references
            .flatMap((reference) => [
              { from: reference.from, to: Math.min(reference.to, from) },
              {
                from: Math.max(reference.from, to) + delta,
                to: reference.to + delta,
              },
            ])
            .filter((range) => range.from < range.to)
          let expanded = editor.getExpandedText?.() ?? text
          if (expanded !== text) {
            // Keep native paste contents when setText retires their display markers.
            const left = ranges.find((range) => range.to === from)?.from ?? from
            const right = ranges.find((range) => range.from === end)?.to ?? end
            if (left !== from || right !== end) {
              const span = text.slice(left, right)
              const offset = expanded.indexOf(span)
              if (offset < 0 || expanded.indexOf(span, offset + 1) >= 0)
                throw new Error(
                  "Could not map the expanded reference; attachment retained",
                )
              expanded =
                expanded.slice(0, offset) +
                inserted +
                expanded.slice(offset + span.length)
            }
            editor.setText(withoutAttachment(expanded, path))
            return
          }
          for (const range of ranges.toReversed()) {
            text = text.slice(0, range.from) + text.slice(range.to)
            editor.setText(text)
          }
        }
        try {
          editor.insertTextAtCursor(contents)
          // Native empty insertion has no onChange callback.
          if (restoration && contents === "") {
            restoration = undefined
            editor.setText(
              withoutAttachment(editor.getExpandedText?.() ?? before, path),
            )
          }
        } finally {
          restoration = undefined
        }
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
          if (
            (property === "handleInput" || property === "handleMouse") &&
            typeof value === "function"
          ) {
            return (...args: unknown[]) => {
              revision++
              return value.apply(target, args)
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
              if (removingReferences) return
              if (restoration) {
                const apply = restoration
                restoration = undefined
                removingReferences = true
                try {
                  apply(text)
                } finally {
                  removingReferences = false
                }
                text = target.getText()
              }
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
    capture: () => Promise<AttachmentSource | undefined>,
  ): Promise<void> {
    readObserved = false
    const draft = ctx.ui.getEditorText()
    const observedDraft = readObserved
    const sessionId = ctx.sessionManager.getSessionId()
    const sessionFile = ctx.sessionManager.getSessionFile()
    const submission = submissions
    const draftRevision = revision
    let inputs = terminalInputs
    let changedDuringOperation = false
    let snapshot: Snapshot | undefined
    try {
      const source = await capture()
      if (!source) return
      inputs = terminalInputs
      snapshot =
        "path" in source
          ? { name: source.name, contents: await readFile(source.path) }
          : source
    } catch (error) {
      if (lifetime.signal.aborted) throw error
      ctx.ui.notify(`Could not attach: ${String(error)}`, "error")
      return
    }
    /* eslint-disable no-await-in-loop -- A retry follows the failed save and the user's recovery action. */
    while (snapshot) {
      try {
        await mkdir(storage, { recursive: true, mode: 0o700 })
        const directory = await mkdtemp(join(storage, "snapshot-"))
        const path = join(directory, snapshot.name)
        const reference = `[Attachment: ${snapshot.name}](<${path}>)`
        const recovery = `${path}.draft.md`
        // New native sessions can remain memory-only until the first assistant reply.
        await writeFile(
          recovery,
          `# Attachment request\n\nSession: ${sessionId}\n${sessionFile ? `\nSession file: ${sessionFile}\n` : ""}\n${draft}\n\n${reference}\n`,
          { flag: "wx", mode: 0o600 },
        )
        await writeFile(path, snapshot.contents, { flag: "wx", mode: 0o600 })
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
          revision === draftRevision
        ) {
          ctx.ui.pasteToEditor(`\n${reference}\n`)
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
        ctx.ui.notify(`Could not attach: ${String(error)}`, "error")
        changedDuringOperation ||= terminalInputs !== inputs
        if (typeof snapshot.contents === "string") {
          const contents = await editText(ctx, snapshot.contents)
          snapshot =
            contents === undefined ? undefined : { ...snapshot, contents }
        } else {
          const retry = await ctx.ui.select(
            `Save ${snapshot.name}`,
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
      return contents === undefined ? undefined : { name: "text.txt", contents }
    })
  }

  function attachFile(path: string, ctx: ExtensionContext): Promise<void> {
    return attach(ctx, async () => {
      const selected =
        path ||
        (await ctx.ui.input("Attach file", "File path", {
          signal: lifetime.signal,
        }))
      if (selected === undefined) return undefined
      if (!selected) throw new Error("A file path is required")
      const source = resolve(ctx.cwd, selected)
      return {
        name: basename(source).replaceAll(/[^\w.-]/g, "_"),
        path: source,
      }
    })
  }

  async function attachments(ctx: ExtensionContext): Promise<void> {
    readObserved = false
    const draft = ctx.ui.getEditorText()
    const observed = readObserved
    const requestedRevision = revision
    const sessionId = ctx.sessionManager.getSessionId()
    const submission = submissions
    const paths = attachmentPaths(draft, storage)
    if (paths.length === 0) {
      ctx.ui.notify("No attachments in this draft", "info")
      return
    }
    function unchanged(): boolean {
      if (lifetime.signal.aborted) return false
      readObserved = false
      const text = ctx.ui.getEditorText()
      if (
        observed &&
        readObserved &&
        requestedRevision === revision &&
        draft === text &&
        sessionId === ctx.sessionManager.getSessionId() &&
        submission === submissions
      )
        return true
      ctx.ui.notify(
        `The requesting draft changed. Attachments retained: ${paths.join(", ")}`,
        "warning",
      )
      return false
    }
    const choices = paths.map(
      (path, index) => `${index + 1}. ${basename(path)}`,
    )
    const choice = await ctx.ui.select("Choose attachment", choices, {
      signal: lifetime.signal,
    })
    if (choice === undefined || !unchanged()) return
    const path = paths[choices.indexOf(choice)]!
    const action = await ctx.ui.select(
      basename(path),
      ["Preview text", "Restore Inline", "Remove from draft"],
      {
        signal: lifetime.signal,
      },
    )
    if (action === undefined || !unchanged()) return
    const inputs = terminalInputs
    try {
      if (action === "Remove from draft") {
        ctx.ui.setEditorText(withoutAttachment(draft, path))
        return
      }
      const file = await snapshotFile(path, storage)
      if (await detectSupportedImageMimeTypeFromFile(file))
        throw new Error("Use the image preview above the editor")
      const contents = new TextDecoder("utf-8", {
        fatal: true,
        ignoreBOM: true,
      }).decode(await readFile(file))
      if (!unchanged()) return
      if (inputs !== terminalInputs) {
        ctx.ui.notify(
          `The requesting draft changed. Attachment retained: ${path}`,
          "warning",
        )
        return
      }
      if (action === "Restore Inline") {
        if (!restoreInline)
          throw new Error("Restore Inline requires an interactive editor")
        restoreInline(path, contents)
        return
      }
      await ctx.ui.custom<void>(
        (tui, theme, keybindings, done) => {
          const close = () => done()
          lifetime.signal.addEventListener("abort", close, { once: true })
          const body = new Text(
            stripVTControlCharacters(contents.replace(/\r\n?/g, "\n")),
            0,
            0,
          )
          const scroll = new ScrollView(body, { scrollbar: "hidden" })
          return {
            render(width) {
              try {
                const lines = scroll.render(width)
                scroll.updateLayout(
                  lines.length,
                  Math.max(1, tui.terminal.rows - 8),
                  () => tui.requestRender(),
                )
                return [
                  ...truncateToVisualLines(
                    theme.fg("accent", `Preview: ${basename(path)}`),
                    2,
                    width,
                  ).visualLines,
                  ...lines.slice(
                    scroll.scrollTop,
                    scroll.scrollTop + scroll.viewportHeight,
                  ),
                  ...truncateToVisualLines(
                    `${keyHint("tui.select.pageUp", "previous page")}  ${keyHint("tui.select.pageDown", "next page")}  ${keyHint("tui.select.cancel", "close")}`,
                    2,
                    width,
                  ).visualLines,
                ]
              } catch (error) {
                return truncateToVisualLines(
                  `Preview unavailable: ${String(error)}\n${keyHint("tui.select.cancel", "close")}`,
                  5,
                  width,
                ).visualLines
              }
            },
            handleInput(data) {
              if (keybindings.matches(data, "tui.select.cancel")) close()
              else if (keybindings.matches(data, "tui.select.up"))
                scroll.scrollBy(-1)
              else if (keybindings.matches(data, "tui.select.down"))
                scroll.scrollBy(1)
              else if (keybindings.matches(data, "tui.select.pageUp"))
                scroll.scrollBy(-scroll.viewportHeight)
              else if (keybindings.matches(data, "tui.select.pageDown"))
                scroll.scrollBy(scroll.viewportHeight)
            },
            invalidate() {
              body.invalidate()
            },
            dispose() {
              lifetime.signal.removeEventListener("abort", close)
            },
          }
        },
        { overlay: true },
      )
    } catch (error) {
      if (!lifetime.signal.aborted)
        ctx.ui.notify(
          `Could not ${action === "Restore Inline" ? "restore" : "preview"} ${basename(path)}: ${String(error)}`,
          "error",
        )
    }
  }

  pi.registerCommand("attachments", {
    description: "Preview, restore inline, or remove draft attachments",
    handler: (_args, ctx) => attachments(ctx),
  })
  pi.registerShortcut("ctrl+alt+a", {
    description: "Draft attachments",
    handler: attachments,
  })

  pi.registerCommand("attach-text", {
    description: "Attach text as a preserved file",
    handler: attachText,
  })

  pi.registerCommand("attach-file", {
    description: "Attach a snapshot of an existing file",
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
