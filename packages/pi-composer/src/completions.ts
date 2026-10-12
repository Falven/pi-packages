import type { KeybindingsManager } from "@earendil-works/pi-coding-agent"
import {
  SelectList,
  matchesKey,
  truncateToWidth,
  type AutocompleteItem,
  type AutocompleteProvider,
  type EditorTheme,
  type TUI,
  type TuiMouseEvent,
} from "@earendil-works/pi-tui"

// Pi also treats CJK punctuation as completion boundaries.
const separator =
  /(?:\s|(?=\p{Punctuation})[\p{Script_Extensions=Han}\p{Script_Extensions=Hiragana}\p{Script_Extensions=Katakana}\p{Script_Extensions=Hangul}\p{Script_Extensions=Bopomofo}]|[，．：；！？（）［］｛｝“”‘’…—])/u

export function createCompletions(
  tui: TUI,
  theme: EditorTheme,
  keys: KeybindingsManager,
  read: () => { text: string; anchor: number; head: number },
  withoutSelection: (
    from: number,
    to: number,
  ) => { text: string; position: number },
  commit: (text: string, cursor: number) => void,
  maxVisible: () => number,
) {
  let provider: AutocompleteProvider | undefined
  let list: SelectList | undefined
  let controller: AbortController | undefined
  let error: string | undefined
  let command = false
  let forceMode: boolean | undefined
  let bounds = { x: 0, y: 0, width: 0, height: 0 }

  function cancel() {
    controller?.abort()
    controller = undefined
    list = undefined
    error = undefined
    command = false
    forceMode = undefined
  }

  function reportError(cause: unknown) {
    cancel()
    error = `Autocomplete failed: ${cause instanceof Error ? cause.message : String(cause)}`
    tui.requestRender()
  }

  async function suggest(force = false, explicitTab = false) {
    const effective = provider
    if (!effective) return
    const draft = read()
    const from = Math.min(draft.anchor, draft.head)
    const to = Math.max(draft.anchor, draft.head)
    const { text, position } =
      from === to
        ? { text: draft.text, position: from }
        : withoutSelection(from, to)
    const before = text.slice(0, position).split("\n")
    const line = before.length - 1
    const col = before.at(-1)!.length
    const triggers = ["@", "#", ...(effective.triggerCharacters ?? [])]
      .map((character) => character.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("|")
    if (
      !force &&
      !explicitTab &&
      !(line === 0 && before[0]!.startsWith("/")) &&
      !new RegExp(
        `(?:^|${separator.source})(?:@"[^"]*|(?:${triggers})(?:(?!${separator.source}).)*)$`,
        "u",
      ).test(before.at(-1)!)
    ) {
      cancel()
      return
    }
    const request = new AbortController()
    controller = request
    forceMode = force
    const lines = text.split("\n")
    try {
      await Promise.resolve()
      if (request.signal.aborted) return
      if (
        force &&
        effective.shouldTriggerFileCompletion &&
        !effective.shouldTriggerFileCompletion(lines, line, col)
      ) {
        cancel()
        return
      }
      const suggestions = await effective.getSuggestions(lines, line, col, {
        signal: request.signal,
        force,
      })
      if (request.signal.aborted || read() !== draft) return
      controller = undefined
      if (!suggestions?.items.length) {
        cancel()
        tui.requestRender()
        return
      }
      const apply = (item: AutocompleteItem) => {
        if (read() !== draft) return
        let result: ReturnType<AutocompleteProvider["applyCompletion"]>
        try {
          result = effective.applyCompletion(
            lines,
            line,
            col,
            item,
            suggestions.prefix,
          )
        } catch (cause) {
          reportError(cause)
          return
        }
        const cursor =
          result.lines
            .slice(0, result.cursorLine)
            .reduce(
              (offset, completedLine) => offset + completedLine.length + 1,
              0,
            ) + result.cursorCol
        cancel()
        commit(result.lines.join("\n"), cursor)
      }
      if (force && explicitTab && suggestions.items.length === 1) {
        apply(suggestions.items[0]!)
        return
      }
      command =
        line === 0 &&
        /^\/\S*$/.test(before[0]!) &&
        suggestions.prefix.startsWith("/")
      list = new SelectList(
        suggestions.items,
        maxVisible(),
        theme.selectList,
        command
          ? { minPrimaryColumnWidth: 12, maxPrimaryColumnWidth: 32 }
          : undefined,
      )
      const exact = suggestions.items.findIndex(
        (item) => item.value === suggestions.prefix,
      )
      const best =
        exact >= 0
          ? exact
          : suggestions.items.findIndex((item) =>
              item.value.startsWith(suggestions.prefix),
            )
      if (best >= 0) list.setSelectedIndex(best)
      list.onSelect = apply
      list.onCancel = () => {
        cancel()
        tui.requestRender()
      }
      tui.requestRender()
    } catch (cause) {
      if (request.signal.aborted || read() !== draft) return
      reportError(cause)
    }
  }

  return {
    setProvider(next: AutocompleteProvider) {
      cancel()
      provider = next
      tui.requestRender()
    },
    update(automatic = false) {
      if (automatic) {
        controller?.abort()
        controller = undefined
        error = undefined
        void suggest(forceMode ?? false)
      } else {
        cancel()
      }
    },
    isShowing() {
      return list !== undefined
    },
    handleInput(data: string) {
      if (
        list &&
        controller &&
        (keys.matches(data, "tui.input.tab") ||
          keys.matches(data, "tui.select.confirm") ||
          keys.matches(data, "tui.input.submit") ||
          matchesKey(data, "super+enter"))
      ) {
        return true
      }
      if (
        list &&
        (keys.matches(data, "tui.input.tab") ||
          matchesKey(data, "super+enter") ||
          (keys.matches(data, "tui.input.submit") &&
            !keys.matches(data, "tui.select.confirm")))
      ) {
        const selected = list.getSelectedItem()
        if (selected) list.onSelect?.(selected)
        return true
      }
      if (keys.matches(data, "tui.input.tab")) {
        const draft = read()
        const before = draft.text.slice(0, draft.head)
        cancel()
        void suggest(!/^\s*\/\S*$/.test(before), true)
        return true
      }
      if (
        list &&
        (keys.matches(data, "tui.select.up") ||
          keys.matches(data, "tui.select.down") ||
          keys.matches(data, "tui.select.confirm") ||
          keys.matches(data, "tui.select.cancel"))
      ) {
        const dispatchCommand =
          command && keys.matches(data, "tui.select.confirm")
        list.handleInput(data)
        tui.requestRender()
        return !dispatchCommand || error !== undefined
      }
      return false
    },
    handleMouse(event: TuiMouseEvent) {
      if (!list || event.y < bounds.y || event.y >= bounds.y + bounds.height) {
        return undefined
      }
      if (controller) return { handled: true, focus: true }
      const result = list.handleMouse({
        ...event,
        x: event.x - bounds.x,
        y: event.y - bounds.y,
        width: bounds.width,
        height: bounds.height,
      })
      return result ? { ...result, focus: true } : undefined
    },
    render(width: number, top: number, padding: number) {
      const lines = error
        ? [theme.selectList.noMatch(truncateToWidth(error, width))]
        : (list?.render(width) ?? [])
      bounds = { x: padding, y: top, width, height: lines.length }
      return lines
    },
  }
}
