import { readFile } from "node:fs/promises"
import { basename, resolve } from "node:path"
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
import { getKeybindings, type Editor } from "@earendil-works/pi-tui"
import {
  registerEditor,
  type AttachmentEditorAccess,
  type AttachmentEditorEdit,
} from "./editor.ts"
import { registerImages, snapshotFile } from "./images.ts"
import { registerMarkdown } from "./markdown.ts"
import { saveSnapshot, type Snapshot } from "./recovery.ts"
import { registerCleanup } from "./cleanup.ts"
import { registerPaste, sourcePath } from "./paste.ts"
import { TextPreview } from "./preview.ts"
import { registerShortcuts } from "./shortcuts.ts"
import { thumbnailSettings } from "./settings.ts"

function mergeRanges(ranges: { from: number; to: number }[]) {
  const merged: { from: number; to: number }[] = []
  for (const range of ranges.toSorted((a, b) => a.from - b.from)) {
    const previous = merged.at(-1)
    if (previous && range.from <= previous.to)
      previous.to = Math.max(previous.to, range.to)
    else merged.push({ ...range })
  }
  return merged
}

export default function piAttachments(pi: ExtensionAPI): void {
  const storage = resolve(getAgentDir(), "pi-attachments")
  let submissions = 0
  let terminalInputs = 0
  let revision = 0
  let focusRevision = 0
  let access: AttachmentEditorAccess | undefined
  let editorContext: ExtensionContext | undefined
  let observedMarkdown:
    | ReturnType<ReturnType<typeof registerMarkdown>["observe"]>
    | undefined
  let restoration: ((text: string) => void) | undefined
  let removingReferences = false
  const captures = new Set<{
    access: AttachmentEditorAccess
    edit: AttachmentEditorEdit
    result: Promise<string | undefined>
    submitted: boolean
  }>()
  let restoreInline: ((path: string, contents: string) => void) | undefined
  let insertText: ((text: string) => void) | undefined
  const lifetime = new AbortController()
  const thumbnails = thumbnailSettings(storage, lifetime.signal)
  const withPaste = registerPaste(attach, lifetime.signal, () => {
    revision++
  })
  const markdown = registerMarkdown(storage, lifetime.signal)
  const paths = (text: string, ctx: ExtensionContext) => [
    ...new Set(
      markdown
        .references(text, ctx.cwd, access?.snapshot().identity)
        .map(({ path }) => path),
    ),
  ]
  const images = registerImages(
    pi,
    storage,
    lifetime.signal,
    (ctx) => paths(ctx.ui.getEditorText(), ctx),
    () => thumbnails.size,
  )
  registerCleanup(pi, storage)

  function withoutAttachment(
    text: string,
    path: string,
    ctx: ExtensionContext,
  ): string {
    const references = mergeRanges(
      markdown
        .references(text, ctx.cwd, access?.snapshot().identity)
        .filter((reference) => reference.path === path),
    )
    for (const reference of references.toReversed())
      text = text.slice(0, reference.from) + text.slice(reference.to)
    return text
  }

  pi.on("input", () => {
    submissions++
  })
  pi.on("session_shutdown", () => {
    lifetime.abort()
  })

  registerEditor(pi, lifetime.signal, {
    attach(editor, editorAccess, ctx, tui) {
      access = editorAccess
      editorContext = ctx
      observedMarkdown = markdown.observe(ctx, editorAccess)
      insertText = editor.insertTextAtCursor?.bind(editor)
      const disposePaste = withPaste(editor, ctx, tui, getKeybindings())
      revision++
      const focused = Object.getOwnPropertyDescriptor(editor, "focused")
      let focus = Reflect.get(editor, "focused", editor)
      const readFocus = () => focus
      if (focused && "value" in focused) {
        Object.defineProperty(editor, "focused", {
          configurable: true,
          get: readFocus,
          set(value) {
            if (value !== focus) focusRevision++
            focus = value
          },
        })
      }
      restoreInline = (path, contents) =>
        editorAccess.mutate(() => {
          if (!editor.insertTextAtCursor)
            throw new Error("The active editor cannot insert text")
          const getCursor = Reflect.get(editor, "getCursor") as
            | Editor["getCursor"]
            | undefined
          if (typeof getCursor !== "function")
            throw new Error("The active editor cannot report its native cursor")
          const before = editor.getText()
          const references = markdown
            .references(before, ctx.cwd, editorAccess.snapshot().identity)
            .filter((reference) => reference.path === path)
          restoration = (text) => {
            const cursor = getCursor.call(editor)
            const end =
              text
                .split("\n")
                .slice(0, cursor.line)
                .reduce((offset, line) => offset + line.length + 1, 0) +
              cursor.col
            const inline = contents.replace(/\r\n?/g, "\n")
            const inserted = [inline, inline.replaceAll("\t", "    ")].find(
              (candidate) => {
                const from = end - candidate.length
                return (
                  from >= 0 &&
                  text.slice(from, end) === candidate &&
                  before.slice(0, from) === text.slice(0, from)
                )
              },
            )
            if (inserted === undefined)
              throw new Error(
                "Could not map the editor insertion; attachment retained",
              )
            const from = end - inserted.length
            const retained = [{ from: 0, to: from, delta: 0 }]
            let original = before.length
            let remaining = text.length
            // Formatted replacements can retain delimiters between deleted source ranges.
            while (remaining > end && original > from) {
              if (before[original - 1] !== text[remaining - 1]) {
                original--
                continue
              }
              const to = original
              while (
                original > from &&
                remaining > end &&
                before[original - 1] === text[remaining - 1]
              ) {
                original--
                remaining--
              }
              retained.push({ from: original, to, delta: remaining - original })
            }
            if (remaining > end)
              throw new Error(
                "Could not map the editor insertion; attachment retained",
              )
            const ranges = mergeRanges(
              references
                .flatMap((reference) =>
                  retained.map((range) => ({
                    from: Math.max(reference.from, range.from) + range.delta,
                    to: Math.min(reference.to, range.to) + range.delta,
                  })),
                )
                .filter((range) => range.from < range.to),
            )
            let expanded = editor.getExpandedText?.() ?? text
            if (expanded !== text) {
              // Keep native paste contents when setText retires their display markers.
              const left =
                ranges.find((range) => range.to === from)?.from ?? from
              const right =
                ranges.find((range) => range.from === end)?.to ?? end
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
              editor.setText(withoutAttachment(expanded, path, ctx))
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
                withoutAttachment(
                  editor.getExpandedText?.() ?? before,
                  path,
                  ctx,
                ),
              )
            }
          } finally {
            restoration = undefined
          }
        })
      return () => {
        disposePaste()
        if (
          Object.getOwnPropertyDescriptor(editor, "focused")?.get === readFocus
        )
          Object.defineProperty(editor, "focused", { ...focused, value: focus })
        if (access !== editorAccess) return
        access = undefined
        editorContext = undefined
        observedMarkdown = undefined
        insertText = undefined
        restoreInline = undefined
        restoration = undefined
        revision++
      }
    },
    change(editorAccess, _ctx, origin, replaced) {
      if (access !== editorAccess || removingReferences) return
      revision++
      if (restoration) {
        const apply = restoration
        restoration = undefined
        removingReferences = true
        try {
          apply(editorAccess.snapshot().text)
        } finally {
          removingReferences = false
        }
      }
      observedMarkdown?.change(origin, replaced)
    },
    hasPending(identity) {
      return (
        markdown.hasCaptures(identity) ||
        Boolean(
          access &&
          editorContext &&
          access.snapshot().identity === identity &&
          ([...captures].some(
            (capture) => capture.access === access && capture.edit.snapshot(),
          ) ||
            markdown.references(
              access.snapshot().text,
              editorContext.cwd,
              identity,
            ).length > 0),
        )
      )
    },
    async prepare(request, ctx) {
      const insertions = [...captures].flatMap((capture) => {
        if (capture.access !== access || capture.submitted) return []
        const range = capture.edit.snapshot()
        if (!range) return []
        capture.submitted = true
        return [{ ...range, result: capture.result }]
      })
      const preparation = markdown.prepare(request)
      const [prepared, additions] = await Promise.all([
        preparation,
        Promise.all(
          insertions.map(async ({ result, ...range }) =>
            Object.assign(range, { text: await result }),
          ),
        ),
      ])
      const edits = [
        ...prepared.replacements,
        ...additions.flatMap((addition) =>
          addition.text === undefined
            ? []
            : [{ ...addition, text: addition.text }],
        ),
      ].toSorted((left, right) => right.from - left.from)
      let text = request.text
      for (const edit of edits)
        text = text.slice(0, edit.from) + edit.text + text.slice(edit.to)
      lifetime.signal.throwIfAborted()
      await images.prepare({ ...request, text }, ctx, request)
      return text
    },
  })

  let stopTerminalInput: (() => void) | undefined
  pi.on("session_start", (_event, ctx) => {
    stopTerminalInput?.()
    stopTerminalInput = ctx.ui.onTerminalInput(() => {
      terminalInputs++
      return undefined
    })
  })
  lifetime.signal.addEventListener("abort", () => stopTerminalInput?.(), {
    once: true,
  })

  async function attach(
    ctx: ExtensionContext,
    capture: () => Promise<Snapshot[] | string | undefined>,
    interactive = true,
  ): Promise<void> {
    const editorAccess = access
    if (!editorAccess)
      throw new Error("Attachments require an interactive editor")
    const requested = editorAccess.snapshot()
    const draft = requested.text
    const result = Promise.withResolvers<string | undefined>()
    // Ordinary capture has no Send waiting to observe a rejected result.
    void result.promise.catch(() => {})
    const operation = {
      access: editorAccess,
      edit: editorAccess.captureEdit(requested.range.from, requested.range.to),
      result: result.promise,
      submitted: false,
    }
    captures.add(operation)
    const sessionId = ctx.sessionManager.getSessionId()
    const sessionFile = ctx.sessionManager.getSessionFile()
    const cwd = ctx.cwd
    const submission = submissions
    const draftRevision = revision
    let draftFocus = focusRevision
    const insert = insertText
    let inputs = terminalInputs
    let changedDuringOperation = false
    let snapshots: Snapshot[]
    function unchanged(): boolean {
      return (
        !lifetime.signal.aborted &&
        !changedDuringOperation &&
        terminalInputs === inputs &&
        access === editorAccess &&
        access?.snapshot().identity === requested.identity &&
        submissions === submission &&
        ctx.sessionManager.getSessionId() === sessionId &&
        access?.snapshot().text === draft &&
        revision === draftRevision &&
        (interactive || focusRevision === draftFocus) &&
        insert !== undefined &&
        insertText === insert
      )
    }
    try {
      try {
        const sources = await capture()
        if (sources === undefined) return
        if (interactive) inputs = terminalInputs
        if (
          typeof sources === "string" &&
          (operation.submitted || unchanged())
        ) {
          result.resolve(sources)
          if (!operation.submitted) insert!(sources)
          return
        }
        snapshots =
          typeof sources === "string"
            ? [{ name: "paste.txt", contents: Buffer.from(sources) }]
            : sources
      } catch (error) {
        result.reject(error)
        if (lifetime.signal.aborted) {
          if (interactive) throw error
          return
        }
        ctx.ui.notify(
          `${interactive ? "Could not attach" : "Could not paste"}: ${String(error)}`,
          "error",
        )
        return
      }
      let request = { sessionId, sessionFile, cwd, text: draft, snapshots }
      /* eslint-disable no-await-in-loop -- A retry follows the failed save and the user's recovery action. */
      while (true) {
        try {
          const { reference, recovery, problem } = await saveSnapshot(
            storage,
            request,
          )
          changedDuringOperation ||=
            terminalInputs !== inputs ||
            (!interactive && focusRevision !== draftFocus)
          if (problem) {
            result.reject(new Error(problem))
            if (!lifetime.signal.aborted)
              ctx.ui.notify(
                `${problem}. Snapshot retained: ${reference}\nRequest saved: ${recovery}`,
                "error",
              )
          } else {
            const text = `\n${reference}\n`
            result.resolve(text)
            if (!operation.submitted && unchanged()) {
              insert!(text)
            } else if (!operation.submitted && !lifetime.signal.aborted) {
              ctx.ui.notify(
                `Could not confirm the requesting draft. Snapshot retained: ${reference}\nRequest saved: ${recovery}`,
                "warning",
              )
            }
          }
          return
        } catch (error) {
          if (lifetime.signal.aborted) {
            if (interactive) throw error
            return
          }
          ctx.ui.notify(
            `Could not attach: ${String(error)}\nContents retained in memory until Pi exits; use /attachments-recover.`,
            "error",
          )
          changedDuringOperation ||=
            terminalInputs !== inputs ||
            (!interactive && focusRevision !== draftFocus)
          if (snapshots.some((snapshot) => snapshot.contents === undefined)) {
            result.reject(error)
            return
          }
          if (
            snapshots.length === 1 &&
            typeof snapshots[0]!.contents === "string"
          ) {
            const contents = await editText(ctx, snapshots[0]!.contents)
            if (contents === undefined) {
              result.reject(error)
              return
            }
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
            if (retry !== "Retry save") {
              result.reject(error)
              return
            }
          }
          inputs = terminalInputs
          draftFocus = focusRevision
        }
      }
      /* eslint-enable no-await-in-loop */
    } finally {
      result.resolve(undefined)
      captures.delete(operation)
      operation.edit.cancel()
    }
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
          { paddingX: pi.getSettings().editorPaddingX ?? 0 },
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

  function attachText(ctx: ExtensionContext): Promise<void> {
    return attach(ctx, async () => {
      const contents = await editText(ctx)
      return contents === undefined
        ? undefined
        : [{ name: "text.txt", contents }]
    })
  }

  function attachFile(ctx: ExtensionContext): Promise<void> {
    const cwd = ctx.cwd
    return attach(ctx, async () => {
      const selected = await ctx.ui.input("Attach file", "File path", {
        signal: lifetime.signal,
      })
      if (selected === undefined) return undefined
      if (!selected) throw new Error("A file path is required")
      const source = sourcePath(selected, cwd)
      return [
        {
          name: basename(source).replaceAll(/[<>[\]\\\p{Cc}]/gu, "_"),
          path: source,
        },
      ]
    })
  }

  async function attachChoice(ctx: ExtensionContext): Promise<void> {
    const choice = await ctx.ui.select(
      "Attach",
      ["File path…", "Create from text…"],
      {
        signal: lifetime.signal,
      },
    )
    if (choice === "File path…") await attachFile(ctx)
    else if (choice === "Create from text…") await attachText(ctx)
  }

  async function attachments(ctx: ExtensionContext): Promise<void> {
    const requestedAccess = access
    const requested = requestedAccess?.snapshot()
    const draft = requested?.text ?? ctx.ui.getEditorText()
    const requestedRevision = revision
    const sessionId = ctx.sessionManager.getSessionId()
    const submission = submissions
    const attached = paths(draft, ctx)
    function unchanged(): boolean {
      if (lifetime.signal.aborted) return false
      const current = access?.snapshot()
      if (
        requested &&
        current?.identity === requested.identity &&
        access === requestedAccess &&
        requestedRevision === revision &&
        draft === current.text &&
        sessionId === ctx.sessionManager.getSessionId() &&
        submission === submissions
      )
        return true
      ctx.ui.notify(
        `The requesting draft changed. Attachments retained: ${attached.join(", ")}`,
        "warning",
      )
      return false
    }
    const choices = attached.map(
      (path, index) => `${index + 1}. ${basename(path)}`,
    )
    const choice = await ctx.ui.select(
      attached.length ? "Choose attachment" : "Manage attachments",
      [...choices, "Settings"],
      { signal: lifetime.signal },
    )
    if (choice === undefined || lifetime.signal.aborted) return
    if (choice === "Settings") return thumbnails.show(ctx)
    if (!unchanged()) return
    const path = attached[choices.indexOf(choice)]!
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
        ctx.ui.setEditorText(withoutAttachment(draft, path, ctx))
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
          const preview = new TextPreview(
            stripVTControlCharacters(contents.replace(/\r\n?/g, "\n")),
          )
          return {
            render(width) {
              try {
                const lines = preview.render(
                  width,
                  Math.max(1, tui.terminal.rows - 8),
                )
                return [
                  ...truncateToVisualLines(
                    theme.fg("accent", `Preview: ${basename(path)}`),
                    2,
                    width,
                  ).visualLines,
                  ...lines,
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
              else if (keybindings.matches(data, "tui.select.up")) {
                preview.scrollBy(-1)
                tui.requestRender()
              } else if (keybindings.matches(data, "tui.select.down")) {
                preview.scrollBy(1)
                tui.requestRender()
              } else if (keybindings.matches(data, "tui.select.pageUp")) {
                preview.scrollBy(-preview.viewportHeight)
                tui.requestRender()
              } else if (keybindings.matches(data, "tui.select.pageDown")) {
                preview.scrollBy(preview.viewportHeight)
                tui.requestRender()
              }
            },
            invalidate() {},
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
    description:
      "Preview, restore inline, remove attachments, or change settings",
    handler: (_args, ctx) => attachments(ctx),
  })
  pi.registerCommand("attach", {
    description: "Attach a file path or entered text",
    handler: (_args, ctx) => attachChoice(ctx),
  })

  registerShortcuts(pi, {
    attach: attachChoice,
    manage: attachments,
  })
}
