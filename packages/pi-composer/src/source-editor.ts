import {
  CustomEditor,
  type KeybindingsManager,
} from "@earendil-works/pi-coding-agent"
import {
  decodeKittyPrintable,
  matchesKey,
  parseKey,
  type AutocompleteProvider,
  type EditorTheme,
  type Keybinding,
  type KeyId,
  type TUI,
  type TuiMouseEvent,
  type TuiMouseEventResult,
} from "@earendil-works/pi-tui"
import { createCompletions } from "./completions.ts"
import { Projection } from "./projection.ts"

const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" })

type Draft = { text: string; anchor: number; head: number }
type EditKind = "typing" | "backspace" | "delete"

export class SourceEditor extends CustomEditor {
  private draft: Draft = { text: "", anchor: 0, head: 0 }
  private readonly nativeKeys: KeybindingsManager
  private readonly completions: ReturnType<typeof createCompletions>
  private sourceWidth = 60
  private formatted = true
  private preferredCell: number | undefined
  private past: Draft[] = []
  private future: Draft[] = []
  private editGroup: { kind: EditKind; time: number } | undefined
  private pendingPaste: string | undefined
  private prompts: string[] = []
  private promptIndex = -1
  private promptDraft: Draft | undefined

  constructor(tui: TUI, theme: EditorTheme, keybindings: KeybindingsManager) {
    super(tui, theme, keybindings)
    this.nativeKeys = keybindings
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
    return this.completions.handleMouse(event)
  }

  override getText(): string {
    return this.draft.text
  }

  override getExpandedText(): string {
    return this.getText()
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
    text = text.replace(/\r\n?/g, "\n")
    if (text === this.getText()) return
    this.commit({ text, anchor: text.length, head: text.length })
  }

  override insertTextAtCursor(text: string): void {
    const { anchor, head } = this.draft
    this.replaceRange(Math.min(anchor, head), Math.max(anchor, head), text)
  }

  private replaceRange(
    from: number,
    to: number,
    text: string,
    kind?: EditKind,
  ): void {
    const current = this.getText()
    text = text.replace(/\r\n?/g, "\n")
    let nextText = current.slice(0, from) + text + current.slice(to)
    let position = from + text.length
    if (this.formatted && from !== to) {
      const edit = this.project().replace(from, to, text)
      nextText = edit.text
      position = edit.position
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
  }

  private commit(next: Draft, kind?: EditKind): void {
    this.promptIndex = -1
    this.promptDraft = undefined
    const time = Date.now()
    if (next.text !== this.getText()) {
      if (
        !kind ||
        this.editGroup?.kind !== kind ||
        time - this.editGroup.time > 500 ||
        this.draft.anchor !== this.draft.head
      ) {
        this.past.push(this.draft)
      }
      this.future = []
    }
    this.editGroup = kind ? { kind, time } : undefined
    this.draft = next
    this.changed(kind !== undefined)
  }

  private restoreEdit(from: Draft[], to: Draft[]): void {
    const previous = from.pop()
    if (!previous) return
    to.push(this.draft)
    this.draft = previous
    this.promptIndex = -1
    this.promptDraft = undefined
    this.editGroup = undefined
    this.changed()
  }

  private changed(autocomplete = false): void {
    this.preferredCell = undefined
    this.completions.update(autocomplete)
    this.onChange?.(this.getText())
    this.tui.requestRender()
  }

  private moveTo(position: number, select: boolean): void {
    this.preferredCell = undefined
    this.editGroup = undefined
    this.draft = {
      ...this.draft,
      head: position,
      anchor: select ? this.draft.anchor : position,
    }
    this.completions.update()
    this.tui.requestRender()
  }

  private adjacent(direction: -1 | 1): number {
    return this.project().adjacent(this.draft.head, direction)
  }

  private wordBoundary(direction: -1 | 1): number {
    return this.project().wordBoundary(this.draft.head, direction)
  }

  private movementMatches(data: string, action: Keybinding): boolean {
    return (
      this.nativeKeys.matches(data, action) ||
      this.nativeKeys
        .getKeys(action)
        .some((key) => matchesKey(data, `shift+${key}` as KeyId))
    )
  }

  private moveVertically(direction: -1 | 1, select: boolean): void {
    const target = this.project().vertical(
      this.draft.head,
      direction,
      this.preferredCell,
    )
    this.moveTo(target.position, select)
    this.preferredCell = target.column
  }

  override handleInput(data: string): void {
    if (this.onExtensionShortcut?.(data)) return
    const keys = this.nativeKeys
    const previousPrompt = keys.matches(data, "tui.editor.historyPrevious")
    const nextPrompt = keys.matches(data, "tui.editor.historyNext")
    const appAction =
      !previousPrompt &&
      !nextPrompt &&
      [...this.actionHandlers.keys()].some(
        (action) =>
          action !== "app.interrupt" &&
          action !== "app.exit" &&
          keys.matches(data, action),
      )
    if (
      keys.matches(data, "app.clipboard.pasteImage") ||
      (keys.matches(data, "app.interrupt") && !this.isShowingAutocomplete()) ||
      (keys.matches(data, "app.exit") && !this.getText()) ||
      appAction
    ) {
      if (keys.matches(data, "app.interrupt")) this.completions.update()
      super.handleInput(data)
      return
    }
    if (
      this.pendingPaste === undefined &&
      !data.startsWith("\x1b[200~") &&
      this.completions.handleInput(data)
    )
      return
    if (previousPrompt || nextPrompt) {
      this.browsePrompt(previousPrompt ? -1 : 1)
      return
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
    if (matchesKey(data, "super+shift+m")) {
      this.formatted = !this.formatted
      this.preferredCell = undefined
      this.tui.requestRender()
      return
    }
    if (matchesKey(data, "super+z") || keys.matches(data, "tui.editor.undo")) {
      this.restoreEdit(this.past, this.future)
      return
    }
    if (matchesKey(data, "super+shift+z")) {
      this.restoreEdit(this.future, this.past)
      return
    }
    if (matchesKey(data, "super+a")) {
      this.editGroup = undefined
      this.preferredCell = undefined
      this.draft = { ...this.draft, anchor: 0, head: this.getText().length }
      this.completions.update()
      this.tui.requestRender()
      return
    }
    const select = parseKey(data)?.includes("shift+") ?? false
    if (matchesKey(data, "super+up") || matchesKey(data, "super+shift+up")) {
      this.moveTo(this.project().documentBoundary(-1), select)
      return
    }
    if (
      matchesKey(data, "super+down") ||
      matchesKey(data, "super+shift+down")
    ) {
      this.moveTo(this.project().documentBoundary(1), select)
      return
    }
    if (this.movementMatches(data, "tui.editor.cursorWordLeft")) {
      this.moveTo(this.wordBoundary(-1), select)
      return
    }
    if (this.movementMatches(data, "tui.editor.cursorWordRight")) {
      this.moveTo(this.wordBoundary(1), select)
      return
    }
    if (this.movementMatches(data, "tui.editor.cursorUp")) {
      if (!select && this.draft.head <= this.project().documentBoundary(-1)) {
        this.browsePrompt(-1)
        return
      }
      this.moveVertically(-1, select)
      return
    }
    if (this.movementMatches(data, "tui.editor.cursorDown")) {
      const lastRow = this.project().rows.at(-1)!
      if (!select && this.promptIndex >= 0 && this.draft.head >= lastRow.from) {
        this.browsePrompt(1)
        return
      }
      this.moveVertically(1, select)
      return
    }
    if (
      this.movementMatches(data, "tui.editor.cursorLineStart") ||
      matchesKey(data, "super+left") ||
      matchesKey(data, "super+shift+left")
    ) {
      this.moveTo(this.project().lineBoundary(this.draft.head, -1), select)
      return
    }
    if (
      this.movementMatches(data, "tui.editor.cursorLineEnd") ||
      matchesKey(data, "super+right") ||
      matchesKey(data, "super+shift+right")
    ) {
      this.moveTo(this.project().lineBoundary(this.draft.head, 1), select)
      return
    }
    if (this.movementMatches(data, "tui.editor.cursorLeft")) {
      const { anchor, head } = this.draft
      this.moveTo(
        !select && anchor !== head ? Math.min(anchor, head) : this.adjacent(-1),
        select,
      )
      return
    }
    if (this.movementMatches(data, "tui.editor.cursorRight")) {
      const { anchor, head } = this.draft
      this.moveTo(
        !select && anchor !== head ? Math.max(anchor, head) : this.adjacent(1),
        select,
      )
      return
    }
    const backward = keys.matches(data, "tui.editor.deleteCharBackward")
    if (backward || keys.matches(data, "tui.editor.deleteCharForward")) {
      const { anchor, head } = this.draft
      const end = anchor === head ? this.adjacent(backward ? -1 : 1) : anchor
      this.replaceRange(
        Math.min(head, end),
        Math.max(head, end),
        "",
        backward ? "backspace" : "delete",
      )
      return
    }
    if (keys.matches(data, "tui.input.newLine")) {
      this.insertTextAtCursor("\n")
      return
    }
    if (
      keys.matches(data, "tui.input.submit") ||
      matchesKey(data, "super+enter")
    ) {
      if (this.disableSubmit || !this.getText().trim()) return
      const text = this.getText()
      this.setText("")
      this.onSubmit?.(text)
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

  private project(): Projection {
    return new Projection(this.getText(), this.sourceWidth, this.formatted)
  }

  override render(width: number): string[] {
    const padding = this.getPaddingX()
    this.sourceWidth = Math.max(1, width - padding * 2 - 1)
    const projection = this.project()
    const rows = projection.rows
    const { anchor, head } = this.draft
    const cursorRow = rows.findLastIndex((row) => row.from <= head)
    const height = Math.max(1, Math.floor(this.tui.terminal.rows * 0.3))
    const top = Math.max(0, cursorRow - height + 1)
    const visibleRows = rows.slice(top, top + height)
    const lines = visibleRows.map((_row, rowIndex) => {
      return (
        " ".repeat(padding) +
        projection.renderRow(rowIndex + top, anchor, head, this.focused)
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
