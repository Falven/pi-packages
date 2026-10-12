import { Marked, type AutocompleteProvider } from "@earendil-works/pi-tui"

export function withInlineSkills(
  current: AutocompleteProvider,
): AutocompleteProvider {
  const markdown = new Marked()
  const completions = new Map<string, { token: string; prefix: string }>()

  function getSkillPrefix(
    lines: string[],
    cursorLine: number,
    cursorCol: number,
  ) {
    const line = lines[cursorLine] ?? ""
    const beforeCursor = line.slice(0, cursorCol)
    const command = lines[0]?.trimStart().match(/^\/\S*/)?.[0]
    if (
      (command &&
        (!command.startsWith("/skill:") ||
          (cursorLine === 0 &&
            beforeCursor.trimStart().length <= command.length))) ||
      /@"[^"]*$/.test(beforeCursor)
    ) {
      return undefined
    }
    const prefix = beforeCursor.match(/(?:^|[\s([{"'“‘])([$/][^\s/]*)$/)?.[1]
    if (!prefix) return undefined
    let marker = "%skill-completion%"
    while (lines.some((text) => text.includes(marker))) marker += "%"
    const source = lines
      .with(
        cursorLine,
        line.slice(0, cursorCol - prefix.length) +
          marker +
          line.slice(cursorCol),
      )
      .join("\n")
    let prose = false
    markdown.walkTokens(markdown.lexer(source), (token) => {
      if (
        token.type === "text" &&
        !token.tokens &&
        token.raw.includes(marker)
      ) {
        prose = true
      }
    })
    return prose ? prefix : undefined
  }

  return {
    triggerCharacters: [...(current.triggerCharacters ?? []), "$", "/"],
    async getSuggestions(lines, cursorLine, cursorCol, options) {
      const line = lines[cursorLine] ?? ""
      const prefix = getSkillPrefix(lines, cursorLine, cursorCol)
      if (!prefix) {
        return current.getSuggestions(lines, cursorLine, cursorCol, options)
      }
      if (lines[0]?.trimStart().startsWith("/")) {
        const suggestions = await current.getSuggestions(
          lines,
          cursorLine,
          cursorCol,
          options,
        )
        if (options.signal.aborted) return null
        if (suggestions) return suggestions
      }
      const nativeLines = lines.with(
        cursorLine,
        `/${prefix.slice(1)}${line.slice(cursorCol)}`,
      )
      const suggestions = await current.getSuggestions(
        nativeLines,
        cursorLine,
        prefix.length,
        { ...options, force: false },
      )
      if (options.signal.aborted) return null
      const items = suggestions?.items.filter((item) =>
        item.value.startsWith("skill:"),
      )
      if (!suggestions || !items?.length) {
        return current.getSuggestions(lines, cursorLine, cursorCol, options)
      }
      for (const item of items) {
        completions.set(item.value, {
          token: prefix,
          prefix: suggestions.prefix,
        })
      }
      return {
        items,
        // A slash prefix makes native Enter dispatch; inline skills only insert text.
        prefix: prefix.slice(1),
      }
    },
    applyCompletion(lines, cursorLine, cursorCol, item, prefix) {
      const completion = completions.get(item.value)
      if (
        !completion ||
        completion.token.slice(1) !== prefix ||
        !getSkillPrefix(lines, cursorLine, cursorCol)
      ) {
        return current.applyCompletion(
          lines,
          cursorLine,
          cursorCol,
          item,
          prefix,
        )
      }
      const line = lines[cursorLine] ?? ""
      const before = line.slice(0, cursorCol - completion.token.length)
      const result = current.applyCompletion(
        lines.with(
          cursorLine,
          `/${completion.token.slice(1)}${line.slice(cursorCol)}`,
        ),
        cursorLine,
        completion.token.length,
        item,
        completion.prefix,
      )
      if (!before) return result
      const reference = `/${item.value}`
      const precedingReferences =
        lines.slice(0, cursorLine).join("\n").split(reference).length - 1
      const text = result.lines.join("\n")
      let position = -1
      for (let index = 0; index <= precedingReferences; index += 1) {
        position = text.indexOf(reference, position + 1)
        if (position < 0)
          throw new Error("Could not locate completed skill reference")
      }
      const precedingLines = text.slice(0, position).split("\n")
      const completedLine = precedingLines.length - 1
      const completedCol = precedingLines.at(-1)!.length
      const completed = result.lines[completedLine]!
      result.lines[completedLine] =
        completed.slice(0, completedCol) +
        before +
        completed.slice(completedCol)
      if (
        result.cursorLine === completedLine &&
        result.cursorCol >= completedCol
      ) {
        result.cursorCol += before.length
      }
      return result
    },
    shouldTriggerFileCompletion(lines, cursorLine, cursorCol) {
      return (
        !!getSkillPrefix(lines, cursorLine, cursorCol) ||
        (current.shouldTriggerFileCompletion?.(lines, cursorLine, cursorCol) ??
          true)
      )
    },
  }
}
