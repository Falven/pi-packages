import {
  CustomEditor,
  type KeybindingsManager,
} from "@earendil-works/pi-coding-agent"
import {
  decodeKittyPrintable,
  matchesKey,
  parseKey,
  ScrollView,
  type AutocompleteProvider,
  type EditorTheme,
  type Keybinding,
  type KeyId,
  type TUI,
  type TuiMouseEvent,
  type TuiMouseEventResult,
} from "@earendil-works/pi-tui"
import { Clipboard } from "./clipboard.ts"
import { codeNewline } from "./code.ts"
import { createCompletions } from "./completions.ts"
import { Projection, type SourceRange } from "./projection.ts"
import { projectProse } from "./prose.ts"
import { continueList } from "./structures.ts"

const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" })

const textIdentity = Symbol("textIdentity")
type Draft = {
  text: string
  anchor: number
  head: number
  [textIdentity]?: object
}
function identityOf(draft: Draft): object {
  if (!draft[textIdentity])
    Object.defineProperty(draft, textIdentity, { value: {} })
  return draft[textIdentity]!
}

function withIdentity(draft: Draft, identity: object): Draft {
  Object.defineProperty(draft, textIdentity, { value: identity })
  return draft
}

type PendingEdit = { from: number; to: number; expected: string }
export type DraftHistory = { draft: Draft; past: Draft[]; future: Draft[] }
type EditKind = "typing" | "backspace" | "delete"
type YankSource = Draft & { formatted: boolean }

export class SourceEditor extends CustomEditor {
  onDraftChange: ((text: string) => void) | undefined
  onDraftClear: ((text: string) => void) | undefined
  private draft: Draft = { text: "", anchor: 0, head: 0 }
  private observedSource = ""
  private readonly pendingSourceEdits = new Set<PendingEdit>()
  private readonly nativeKeys: KeybindingsManager
  private readonly completions: ReturnType<typeof createCompletions>
  private readonly clipboard: Clipboard
  private revision = 0
  private sourceWidth = 60
  private formatted = true
  private projection:
    | {
        text: string
        width: number
        formatted: boolean
        value: Projection
      }
    | undefined
  private preferredCell: number | undefined
  private jumpDirection: -1 | 1 | undefined
  private past: Draft[] = []
  private future: Draft[] = []
  private editGroup: { kind: EditKind; time: number } | undefined
  private transaction: { draft: Draft; recorded: boolean } | undefined
  private pendingPaste: string | undefined
  private retained: string[] = []
  private deletionSource: { text: string; removed: SourceRange[] } | undefined
  private yankSource: YankSource | undefined
  private prompts: string[] = []
  private promptIndex = -1
  private promptDraft: Draft | undefined
  private dragging = false
  private visibleTop = 0
  private visibleRowCount = 0
  private renderedPadding = 0
  // Pi owns the scroll offset; the editor renders only visible mapped rows.
  private readonly viewport = new ScrollView(this)
  private revealCaret = true

  constructor(
    tui: TUI,
    theme: EditorTheme,
    keybindings: KeybindingsManager,
    clipboard: Clipboard,
  ) {
    super(tui, theme, keybindings)
    this.nativeKeys = keybindings
    this.clipboard = clipboard
    const pasteClipboard = this.pasteClipboard.bind(this)
    let paste: CustomEditor["onPasteImage"]
    Object.defineProperty(this, "onPasteImage", {
      configurable: true,
      get: () => paste,
      set: (handler: CustomEditor["onPasteImage"]) => {
        // Other editor decorators can invoke this public callback directly.
        paste = handler
          ? function (this: unknown) {
              pasteClipboard(() => handler.call(this))
            }
          : undefined
      },
    })
    this.completions = createCompletions(
      tui,
      theme,
      keybindings,
      () => this.draft,
      (from, to) => this.project().replace(from, to, ""),
      (text, cursor) => this.commit({ text, anchor: cursor, head: cursor }),
      () => this.getAutocompleteMaxVisible(),
    )
  }

  override setAutocompleteProvider(provider: AutocompleteProvider): void {
    this.completions.setProvider(provider)
  }

  override isShowingAutocomplete(): boolean {
    return this.completions.isShowing()
  }

  override handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined {
    if (event.type === "press") this.dragging = false
    if (!this.dragging) {
      const completion = this.completions.handleMouse(event)
      if (completion) return completion
    }
    if (event.type === "wheel") {
      const delta = event.wheelDelta ?? 0
      if (this.viewport.scrollBy(delta) === delta) return undefined
      this.revealCaret = false
      return { handled: true }
    }
    if (event.button !== "left") return undefined
    const inside = event.y > 0 && event.y <= this.visibleRowCount
    if (event.type === "press" && inside) {
      this.dragging = true
    } else if (
      !this.dragging ||
      (event.type !== "drag" && event.type !== "release")
    ) {
      return event.type === "press" || event.type === "click"
        ? { handled: true, focus: true }
        : undefined
    }
    let top = this.visibleTop
    if (event.type === "drag" && !inside) {
      this.viewport.scrollBy(event.y <= 0 ? -1 : 1)
      top = this.viewport.scrollTop
    }
    const row = Math.max(0, Math.min(this.visibleRowCount - 1, event.y - 1))
    this.moveTo(
      this.project().positionAt(top + row, event.x - this.renderedPadding),
      event.type !== "press" || event.shift,
    )
    this.dragging = event.type !== "release"
    return { handled: true, focus: true, capture: this.dragging, render: true }
  }

  override getText(): string {
    return this.draft.text
  }

  override getEditorTextIdentity(): object {
    return identityOf(this.draft)
  }

  override invalidate(): void {
    super.invalidate()
    this.projection = undefined
  }

  getDraftHistory(): DraftHistory {
    return { draft: this.draft, past: [...this.past], future: [...this.future] }
  }

  restoreDraft(text: string, history?: DraftHistory): void {
    this.pendingSourceEdits.clear()
    this.draft = history?.draft ?? {
      text,
      anchor: text.length,
      head: text.length,
    }
    this.past = [...(history?.past ?? [])]
    this.future = [...(history?.future ?? [])]
    this.editGroup = undefined
    this.promptIndex = -1
    this.promptDraft = undefined
    this.changed()
  }

  override getExpandedText(): string {
    return this.getText()
  }

  override captureEditorEdit(
    from: number,
    to: number,
  ): { replace(text: string): boolean } {
    const current = this.getExpandedText()
    if (
      !Number.isInteger(from) ||
      !Number.isInteger(to) ||
      from < 0 ||
      to <= from ||
      to > current.length
    )
      throw new RangeError("Invalid editor edit range")
    const edit = { from, to, expected: current.slice(from, to) }
    this.pendingSourceEdits.add(edit)
    return {
      replace: (text) => {
        if (
          !this.pendingSourceEdits.delete(edit) ||
          this.getText().slice(edit.from, edit.to) !== edit.expected
        )
          return false
        text = text.replace(/\r\n?/g, "\n")
        const map = (position: number) =>
          position <= edit.from
            ? position
            : position >= edit.to
              ? position + text.length - (edit.to - edit.from)
              : edit.from + text.length
        const draft = this.draft
        this.commit(
          {
            text:
              draft.text.slice(0, edit.from) + text + draft.text.slice(edit.to),
            anchor: map(draft.anchor),
            head: map(draft.head),
          },
          undefined,
          "replacement",
        )
        return true
      },
    }
  }

  override getLines(): string[] {
    return this.getText().split("\n")
  }

  override getCursor(): { line: number; col: number } {
    const before = this.getText().slice(0, this.draft.head).split("\n")
    return { line: before.length - 1, col: before.at(-1)!.length }
  }

  override addToHistory(text: string): void {
    text = text.trim()
    if (!text || this.prompts[0] === text) return
    this.prompts.unshift(text)
    if (this.prompts.length > 100) this.prompts.pop()
  }

  private browsePrompt(direction: -1 | 1): void {
    const index = this.promptIndex - direction
    if (index < -1 || index >= this.prompts.length) return
    this.pendingSourceEdits.clear()
    if (this.promptIndex < 0) {
      this.promptDraft = this.draft
      this.past.push(this.draft)
      this.future = []
    }
    if (index < 0) {
      this.draft = this.promptDraft!
      this.promptDraft = undefined
    } else {
      const text = this.prompts[index]!
      const position = direction < 0 ? 0 : text.length
      this.draft = { text, head: position, anchor: position }
    }
    this.promptIndex = index
    this.editGroup = undefined
    this.changed()
  }

  override setText(text: string): void {
    this.pendingSourceEdits.clear()
    text = text.replace(/\r\n?/g, "\n")
    const current = this.getText()
    if (text === current) {
      this.draft = withIdentity({ ...this.draft }, {})
      this.onChange?.(current, "replacement")
      return
    }
    if (!text) this.onDraftClear?.(current)
    let anchor = text.length
    let head = text.length
    if (this.transaction) {
      // A synchronous onChange replacement maps the active selection through its text edit.
      let from = 0
      while (
        from < current.length &&
        from < text.length &&
        current[from] === text[from]
      )
        from++
      let to = current.length
      let nextTo = text.length
      while (
        to > from &&
        nextTo > from &&
        current[to - 1] === text[nextTo - 1]
      ) {
        to--
        nextTo--
      }
      const map = (position: number) =>
        position <= from
          ? position
          : position >= to
            ? position + text.length - current.length
            : nextTo
      anchor = map(this.draft.anchor)
      head = map(this.draft.head)
    }
    this.commit({ text, anchor, head })
  }

  override insertTextAtCursor(text: string): void {
    if (!text) return
    const insert = () => {
      const { anchor, head } = this.draft
      this.replaceRange(Math.min(anchor, head), Math.max(anchor, head), text)
    }
    if (!Clipboard.insert(text, insert)) insert()
  }

  private pasteClipboard(handler: () => void): void {
    let selection = this.draft
    let revision = this.revision
    this.clipboard.paste(
      selection,
      revision,
      (insert) => {
        if (
          !this.focused ||
          this.draft !== selection ||
          this.revision !== revision
        )
          return false
        insert()
        selection = this.draft
        revision = this.revision
        return true
      },
      handler,
    )
  }

  private copySelection(cut: boolean): void {
    const selection = this.draft
    const revision = this.revision
    const { text, anchor, head } = selection
    void this.clipboard
      .copy(text.slice(Math.min(anchor, head), Math.max(anchor, head)))
      .then((copied) => {
        if (
          copied &&
          cut &&
          this.focused &&
          this.draft === selection &&
          this.revision === revision
        ) {
          this.replaceRange(Math.min(anchor, head), Math.max(anchor, head), "")
        }
      })
  }

  private replaceRange(
    from: number,
    to: number,
    text: string,
    kind?: EditKind,
    source?: YankSource,
  ): { text: string; removed: SourceRange[] } {
    const current = source?.text ?? this.getText()
    text = text.replace(/\r\n?/g, "\n")
    let nextText = current.slice(0, from) + text + current.slice(to)
    let position = from + text.length
    let removed = from === to ? [] : [{ from, to }]
    if (text && (source?.formatted ?? this.formatted) && from !== to) {
      const projection = source
        ? new Projection(current, this.sourceWidth, source.formatted)
        : this.project()
      const edit = projection.replace(from, to, text)
      nextText = edit.text
      position = edit.position
      removed = edit.removed
    }
    const joined = graphemes.segment(nextText).containing(position)
    if (joined && joined.index < position) {
      position = joined.index + joined.segment.length
    }
    this.commit(
      {
        text: nextText,
        anchor: position,
        head: position,
      },
      kind,
    )
    return { text: nextText, removed }
  }

  private retainDeletion(from: number, to: number): void {
    if (from === to) return
    const accumulate = this.deletionSource !== undefined
    const source = this.deletionSource ?? { text: this.getText(), removed: [] }
    const { text, removed } = this.replaceRange(from, to, "")
    if (!removed.length) return
    const originalPosition = (position: number) => {
      for (const range of source.removed) {
        if (range.from > position) break
        position += range.to - range.from
      }
      return position
    }
    // Keep retained source in order when consecutive deletions change direction.
    const ranges = [
      ...source.removed,
      ...removed.map((range) => ({
        from: originalPosition(range.from),
        to: originalPosition(range.to),
      })),
    ].toSorted((a, b) => a.from - b.from)
    const merged: SourceRange[] = []
    for (const range of ranges) {
      const previous = merged.at(-1)
      if (previous && range.from <= previous.to) {
        previous.to = Math.max(previous.to, range.to)
      } else merged.push({ ...range })
    }
    if (accumulate) this.retained.pop()
    this.retained.push(
      merged.map((range) => source.text.slice(range.from, range.to)).join(""),
    )
    this.deletionSource =
      this.getText() === text
        ? { text: source.text, removed: merged }
        : undefined
  }

  private yankRetained(pop: boolean): void {
    const source = pop
      ? this.yankSource
      : { ...this.draft, formatted: this.formatted }
    if (!source || !this.retained.length || (pop && this.retained.length < 2))
      return
    if (pop) this.retained.unshift(this.retained.pop()!)
    // Replay the original selection without removing surviving Markdown delimiters.
    this.replaceRange(
      Math.min(source.anchor, source.head),
      Math.max(source.anchor, source.head),
      this.retained.at(-1)!,
      undefined,
      source,
    )
    this.yankSource = source
  }

  private commit(
    next: Draft,
    kind?: EditKind,
    origin: "edit" | "replacement" = "edit",
  ): void {
    const outer = this.transaction === undefined
    const transaction = (this.transaction ??= {
      draft: this.draft,
      recorded: false,
    })
    this.promptIndex = -1
    this.promptDraft = undefined
    const time = Date.now()
    if (
      (next.text !== this.getText() || origin === "replacement") &&
      !transaction.recorded
    ) {
      if (
        !kind ||
        this.editGroup?.kind !== kind ||
        time - this.editGroup.time > 500 ||
        transaction.draft.anchor !== transaction.draft.head
      ) {
        this.past.push(transaction.draft)
      }
      this.future = []
      transaction.recorded = true
    }
    this.editGroup = kind ? { kind, time } : undefined
    this.draft = withIdentity(
      next,
      next.text === this.draft.text && origin !== "replacement"
        ? identityOf(this.draft)
        : {},
    )
    try {
      this.changed(kind !== undefined, origin)
    } finally {
      if (outer) this.transaction = undefined
    }
  }

  private restoreEdit(from: Draft[], to: Draft[]): void {
    const previous = from.pop()
    if (!previous) return
    to.push(this.draft)
    this.draft = previous
    this.promptIndex = -1
    this.promptDraft = undefined
    this.editGroup = undefined
    this.changed(false, from === this.past ? "undo" : "redo")
  }

  private changed(
    autocomplete = false,
    origin: "edit" | "replacement" | "undo" | "redo" = "edit",
  ): void {
    const current = this.getText()
    const previous = this.observedSource
    this.observedSource = current
    if (origin === "undo" || origin === "redo") this.pendingSourceEdits.clear()
    else if (current !== previous) {
      let from = 0
      while (
        from < previous.length &&
        from < current.length &&
        previous[from] === current[from]
      )
        from++
      let oldEnd = previous.length
      let newEnd = current.length
      while (
        oldEnd > from &&
        newEnd > from &&
        previous[oldEnd - 1] === current[newEnd - 1]
      ) {
        oldEnd--
        newEnd--
      }
      let suffix = 0
      while (
        suffix < previous.length &&
        suffix < current.length &&
        previous[previous.length - suffix - 1] ===
          current[current.length - suffix - 1]
      )
        suffix++
      const leftFrom = Math.min(previous.length, current.length) - suffix
      for (const edit of this.pendingSourceEdits) {
        if (leftFrom < from && leftFrom < edit.to && oldEnd >= edit.from)
          this.pendingSourceEdits.delete(edit)
        else if (oldEnd <= edit.from) {
          const shift = newEnd - oldEnd
          edit.from += shift
          edit.to += shift
        } else if (from < edit.to) this.pendingSourceEdits.delete(edit)
      }
    }
    this.deletionSource = undefined
    this.yankSource = undefined
    this.revision++
    this.jumpDirection = undefined
    this.dragging = false
    this.revealCaret = true
    this.preferredCell = undefined
    this.completions.update(autocomplete)
    this.onChange?.(current, origin)
    this.onDraftChange?.(this.getText())
    this.tui.requestRender()
  }

  private moveTo(position: number, select: boolean): void {
    this.jumpDirection = undefined
    this.deletionSource = undefined
    this.yankSource = undefined
    this.revealCaret = true
    this.preferredCell = undefined
    this.editGroup = undefined
    this.draft = withIdentity(
      {
        ...this.draft,
        head: position,
        anchor: select ? this.draft.anchor : position,
      },
      identityOf(this.draft),
    )
    this.completions.update()
    this.tui.requestRender()
  }

  private adjacent(direction: -1 | 1): number {
    return this.project().adjacent(this.draft.head, direction)
  }

  private wordBoundary(direction: -1 | 1): number {
    return this.project().wordBoundary(this.draft.head, direction)
  }

  submitDraft(): void {
    const text = this.getText()
    const identity = this.getEditorTextIdentity()
    this.setText("")
    this.onSubmit?.(text, identity)
  }

  private moveVertically(direction: -1 | 1, select: boolean): void {
    const projection = this.project()
    const row = projection.rowAt(this.draft.head) + direction
    if (row < 0 || row >= projection.rows.length) {
      this.moveTo(
        this.project(false).lineBoundary(this.draft.head, direction),
        select,
      )
      return
    }
    const target = projection.vertical(
      this.draft.head,
      direction,
      this.preferredCell,
    )
    this.moveTo(target.position, select)
    this.preferredCell = target.column
  }

  override handleInput(data: string): void {
    this.dragging = false
    const jumpDirection = this.jumpDirection
    this.jumpDirection = undefined
    if (this.onExtensionShortcut?.(data)) return
    const keys = this.nativeKeys
    const previousPrompt = keys.matches(data, "tui.editor.historyPrevious")
    const nextPrompt = keys.matches(data, "tui.editor.historyNext")
    if (keys.matches(data, "app.clipboard.pasteImage")) {
      this.onPasteImage?.()
      return
    }
    const interrupt = keys.matches(data, "app.interrupt")
    if (interrupt && !this.isShowingAutocomplete()) {
      this.completions.update()
      const handler = this.onEscape ?? this.actionHandlers.get("app.interrupt")
      if (handler) {
        handler()
        return
      }
    }
    if (keys.matches(data, "app.exit") && !this.getText()) {
      const handler = this.onCtrlD ?? this.actionHandlers.get("app.exit")
      handler?.()
      return
    }
    if (!interrupt && !previousPrompt && !nextPrompt) {
      for (const [action, handler] of this.actionHandlers) {
        if (
          action !== "app.interrupt" &&
          action !== "app.exit" &&
          keys.matches(data, action)
        ) {
          handler()
          return
        }
      }
    }
    if (jumpDirection !== undefined) {
      if (
        keys.matches(data, "tui.editor.jumpForward") ||
        keys.matches(data, "tui.editor.jumpBackward")
      )
        return
      const printable = decodeKittyPrintable(data) ?? data
      if (printable && !/\p{Cc}/u.test(printable)) {
        this.moveTo(
          this.project().jump(this.draft.head, printable, jumpDirection),
          false,
        )
        return
      }
    }
    if (this.pendingPaste !== undefined || data.startsWith("\x1b[200~")) {
      this.pendingPaste =
        (this.pendingPaste ?? "") +
        (this.pendingPaste === undefined ? data.slice(6) : data)
      const end = this.pendingPaste.indexOf("\x1b[201~")
      if (end < 0) return
      const text = this.pendingPaste.slice(0, end)
      const rest = this.pendingPaste.slice(end + 6)
      this.pendingPaste = undefined
      this.insertTextAtCursor(text)
      if (rest) this.handleInput(rest)
      return
    }
    if (keys.matches(data, "tui.input.copy")) {
      this.copySelection(false)
      return
    }
    if (keys.matches(data, "tui.editor.undo")) {
      this.restoreEdit(this.past, this.future)
      return
    }
    const nativeEditingKey = Object.entries(keys.getEffectiveConfig()).some(
      ([action, bindings]) =>
        (action.startsWith("tui.editor.") || action.startsWith("tui.input.")) &&
        (Array.isArray(bindings) ? bindings : [bindings]).some(
          (key) => key !== undefined && matchesKey(data, key),
        ),
    )
    const fallbackMatches = (...bindings: KeyId[]) =>
      !nativeEditingKey && bindings.some((key) => matchesKey(data, key))
    const userBindings = keys.getUserBindings()
    const aliasMatches = (action: Keybinding, ...bindings: KeyId[]) =>
      !Object.hasOwn(userBindings, action) && fallbackMatches(...bindings)
    const movementMatches = (action: Keybinding) =>
      keys.matches(data, action) ||
      (!nativeEditingKey &&
        keys
          .getKeys(action)
          .some((key) => matchesKey(data, `shift+${key}` as KeyId)))
    const submitAlias = aliasMatches("tui.input.submit", "super+enter")
    if (this.completions.handleInput(data, submitAlias)) return

    const cut = fallbackMatches("super+x")
    if (aliasMatches("tui.input.copy", "super+c") || cut) {
      this.copySelection(cut)
      return
    }

    if (aliasMatches("app.clipboard.pasteImage", "super+v")) {
      this.onPasteImage?.()
      return
    }

    if (fallbackMatches("super+shift+m")) {
      this.formatted = !this.formatted
      this.revealCaret = true
      this.preferredCell = undefined
      this.tui.requestRender()
      return
    }
    if (aliasMatches("tui.editor.undo", "super+z")) {
      this.restoreEdit(this.past, this.future)
      return
    }
    if (fallbackMatches("super+shift+z")) {
      this.restoreEdit(this.future, this.past)
      return
    }
    if (fallbackMatches("super+a")) {
      this.deletionSource = undefined
      this.yankSource = undefined
      this.revealCaret = true
      this.editGroup = undefined
      this.preferredCell = undefined
      this.draft = withIdentity(
        { ...this.draft, anchor: 0, head: this.getText().length },
        identityOf(this.draft),
      )
      this.completions.update()
      this.tui.requestRender()
      return
    }
    const lineEnd = keys.matches(data, "tui.editor.deleteToLineEnd")
    if (lineEnd || keys.matches(data, "tui.editor.deleteToLineStart")) {
      const { anchor, head } = this.draft
      const direction = lineEnd ? 1 : -1
      let end = anchor
      if (anchor === head) {
        const source = this.project(false)
        end = source.lineBoundary(head, direction)
        if (lineEnd ? end <= head : end >= head)
          end = source.adjacent(head, direction)
      }
      this.retainDeletion(Math.min(head, end), Math.max(head, end))
      return
    }
    const wordBackward = keys.matches(data, "tui.editor.deleteWordBackward")
    if (wordBackward || keys.matches(data, "tui.editor.deleteWordForward")) {
      const { anchor, head } = this.draft
      const end =
        anchor === head
          ? this.project(false).wordBoundary(head, wordBackward ? -1 : 1)
          : anchor
      this.retainDeletion(Math.min(head, end), Math.max(head, end))
      return
    }
    const backward = keys.matches(data, "tui.editor.deleteCharBackward")
    if (backward || keys.matches(data, "tui.editor.deleteCharForward")) {
      const { anchor, head } = this.draft
      let end = anchor
      if (anchor === head) {
        const segment = graphemes
          .segment(this.getText())
          .containing(backward ? head - 1 : head)
        if (segment)
          end = backward
            ? segment.index
            : segment.index + segment.segment.length
      }
      if (head === end) {
        this.deletionSource = undefined
        this.yankSource = undefined
        this.editGroup = undefined
        return
      }
      this.replaceRange(
        Math.min(head, end),
        Math.max(head, end),
        "",
        backward ? "backspace" : "delete",
      )
      return
    }
    if (keys.matches(data, "tui.editor.yank")) {
      this.yankRetained(false)
      return
    }
    if (keys.matches(data, "tui.editor.yankPop")) {
      this.yankRetained(true)
      return
    }
    if (previousPrompt || nextPrompt) {
      this.browsePrompt(previousPrompt ? -1 : 1)
      return
    }
    const select =
      !nativeEditingKey && (parseKey(data)?.includes("shift+") ?? false)
    if (
      movementMatches("tui.editor.cursorLineStart") ||
      aliasMatches(
        "tui.editor.cursorLineStart",
        "super+left",
        "super+shift+left",
      )
    ) {
      this.moveTo(this.project(false).lineBoundary(this.draft.head, -1), select)
      return
    }
    if (
      movementMatches("tui.editor.cursorLineEnd") ||
      aliasMatches(
        "tui.editor.cursorLineEnd",
        "super+right",
        "super+shift+right",
      )
    ) {
      this.moveTo(this.project(false).lineBoundary(this.draft.head, 1), select)
      return
    }
    if (movementMatches("tui.editor.cursorWordLeft")) {
      this.moveTo(this.wordBoundary(-1), select)
      return
    }
    if (movementMatches("tui.editor.cursorWordRight")) {
      this.moveTo(this.wordBoundary(1), select)
      return
    }
    if (keys.matches(data, "tui.input.newLine")) {
      this.insertTextAtCursor("\n")
      return
    }
    if (matchesKey(data, "enter") && keys.matches(data, "tui.input.submit")) {
      const { anchor, head } = this.draft
      const newline = codeNewline(this.getText(), head)
      if (newline !== undefined) {
        this.insertTextAtCursor(newline)
        return
      }
      let edit = continueList(this.getText(), head, projectProse)
      if (edit && anchor !== head) {
        const selection = this.project().replace(
          Math.min(anchor, head),
          Math.max(anchor, head),
          "",
        )
        edit =
          continueList(selection.text, selection.position, projectProse) ??
          selection
      }
      if (edit) {
        this.commit({
          text: edit.text,
          anchor: edit.position,
          head: edit.position,
        })
        return
      }
    }
    if (keys.matches(data, "tui.input.submit") || submitAlias) {
      if (this.disableSubmit || !this.getText().trim()) return
      this.submitDraft()
      return
    }
    if (movementMatches("tui.editor.cursorUp")) {
      const projection = this.project()
      if (
        !select &&
        projection.rowAt(this.draft.head) === 0 &&
        (this.promptIndex >= 0 || this.draft.head === 0)
      ) {
        this.browsePrompt(-1)
        return
      }
      this.moveVertically(-1, select)
      return
    }
    if (movementMatches("tui.editor.cursorDown")) {
      const lastRow = this.project().rows.at(-1)!
      if (!select && this.promptIndex >= 0 && this.draft.head >= lastRow.from) {
        this.browsePrompt(1)
        return
      }
      this.moveVertically(1, select)
      return
    }
    if (movementMatches("tui.editor.cursorRight")) {
      const { anchor, head } = this.draft
      this.moveTo(
        !select && anchor !== head ? Math.max(anchor, head) : this.adjacent(1),
        select,
      )
      return
    }
    if (movementMatches("tui.editor.cursorLeft")) {
      const { anchor, head } = this.draft
      this.moveTo(
        !select && anchor !== head ? Math.min(anchor, head) : this.adjacent(-1),
        select,
      )
      return
    }
    const pageUp = movementMatches("tui.editor.pageUp")
    if (pageUp || movementMatches("tui.editor.pageDown")) {
      const target = this.project().vertical(
        this.draft.head,
        (pageUp ? -1 : 1) * Math.max(1, this.viewport.viewportHeight),
        this.preferredCell,
      )
      this.moveTo(target.position, select)
      this.preferredCell = target.column
      return
    }
    if (keys.matches(data, "tui.editor.jumpForward")) {
      this.jumpDirection = 1
      return
    }
    if (keys.matches(data, "tui.editor.jumpBackward")) {
      this.jumpDirection = -1
      return
    }
    if (fallbackMatches("super+up", "super+shift+up")) {
      this.moveTo(0, select)
      return
    }
    if (fallbackMatches("super+down", "super+shift+down")) {
      this.moveTo(this.getText().length, select)
      return
    }
    const printable = decodeKittyPrintable(data) ?? data
    if (!/\p{Cc}/u.test(printable)) {
      const { anchor, head } = this.draft
      this.replaceRange(
        Math.min(anchor, head),
        Math.max(anchor, head),
        printable,
        "typing",
      )
    }
  }

  private project(formatted = this.formatted): Projection {
    const text = this.getText()
    if (
      this.projection?.text !== text ||
      this.projection.width !== this.sourceWidth ||
      this.projection.formatted !== formatted
    ) {
      this.projection = {
        text,
        width: this.sourceWidth,
        formatted,
        value: new Projection(text, this.sourceWidth, formatted),
      }
    }
    return this.projection.value
  }

  override render(width: number): string[] {
    const padding = this.getPaddingX()
    const sourceWidth = Math.max(1, width - padding * 2 - 1)
    const height = Math.max(1, Math.floor(this.tui.terminal.rows * 0.3))
    this.revealCaret ||=
      this.sourceWidth !== sourceWidth ||
      this.viewport.viewportHeight !== height
    this.sourceWidth = sourceWidth
    const projection = this.project()
    const rows = projection.rows
    const { anchor, head } = this.draft
    const cursorRow = rows.findLastIndex((row) => row.from <= head)
    this.viewport.updateLayout(rows.length, height, () =>
      this.tui.requestRender(),
    )
    if (this.revealCaret) {
      this.viewport.scrollTo(
        Math.min(
          cursorRow,
          Math.max(this.viewport.scrollTop, cursorRow - height + 1),
        ),
      )
      this.revealCaret = false
    }
    const top = this.viewport.scrollTop
    const visibleRows = rows.slice(top, top + height)
    this.visibleTop = top
    this.visibleRowCount = visibleRows.length
    this.renderedPadding = padding
    const lines = visibleRows.map((_row, rowIndex) => {
      return (
        " ".repeat(padding) +
        projection.renderRow(
          rowIndex + top,
          anchor,
          head,
          this.focused,
          this.tui.getShowHardwareCursor(),
        )
      )
    })
    return [
      this.renderTopBorder(width, top),
      ...lines,
      this.renderBottomBorder(width, Math.max(0, rows.length - top - height)),
      ...this.completions
        .render(Math.max(1, width - padding * 2), lines.length + 2, padding)
        .map((line) => " ".repeat(padding) + line),
    ]
  }
}
