import {
  Marked,
  visibleWidth,
  type Token,
  type Tokens,
} from "@earendil-works/pi-tui"
import type { Prose, ProseSpan, ProseStyle } from "./prose.ts"

const parser = new Marked()

const textWidth = (text: string) => visibleWidth(text.replace(/\t/g, "    "))

export function continueList(
  source: string,
  position: number,
  project: (source: string, tokens: Token[]) => Prose,
): { text: string; position: number } | undefined {
  type ListContext = { from: number; contentFrom: number; prefix: string }
  let active: ListContext | undefined
  const lineEnd = (from: number) => {
    const end = source.indexOf("\n", from)
    return end < 0 ? source.length : end
  }
  const visit = (
    tokens: Token[],
    map: {
      from: (position: number) => number
      to: (position: number) => number
    },
    list?: ListContext,
  ) => {
    const nested = (raw: string, text: string, offset: number) => {
      const child = containerSource(raw, text)
      return (
        child && {
          from: (index: number) => map.from(offset + child.from(index)),
          to: (index: number) => map.to(offset + child.to(index)),
        }
      )
    }
    let offset = 0
    for (const token of tokens) {
      if (token.type === "blockquote") {
        const child = nested(token.raw, token.text, offset)
        if (child) visit(token.tokens ?? [], child, list)
      } else if (token.type === "list") {
        let start = offset
        for (const item of (token as Tokens.List).items) {
          const prefix =
            /^( *)([*+-]|\d{1,9}[.)])([ \t]*)(\[[ xX]\][ \t]*)?/.exec(item.raw)!
          const from = map.from(start + prefix[1]!.length)
          const contentFrom = map.to(start + prefix[0].length)
          const first = source.lastIndexOf("\n", from - 1) + 1
          const before = source
            .slice(first, from)
            .replace(
              /(?:[*+-]|\d{1,9}[.)])(?:[ \t]*\[[ xX]\])?[ \t]+/g,
              (marker) => " ".repeat(textWidth(marker)),
            )
          const marker = prefix[2]!
          const next = /^\d/.test(marker)
            ? `${Number.parseInt(marker) + 1}${marker.at(-1)}`
            : marker
          const context = {
            from,
            contentFrom,
            prefix: `${before}${next}${prefix[3] || " "}${prefix[4]?.replace(/[xX]/, " ") ?? ""}`,
          }
          if (
            position >= from &&
            position <= lineEnd(contentFrom) &&
            (position <= contentFrom ||
              !source.slice(contentFrom, lineEnd(contentFrom)).trim())
          ) {
            active = context
          }
          const child = nested(item.raw, item.text, start)
          if (child)
            visit(
              item.tokens.filter((itemToken) => itemToken.type !== "checkbox"),
              child,
              context,
            )
          start += item.raw.length
        }
      } else if (
        list &&
        (token.type === "paragraph" ||
          token.type === "text" ||
          token.type === "heading")
      ) {
        const end = map.to(offset + token.raw.trimEnd().length)
        if (position >= map.from(offset) && position <= lineEnd(end))
          active = list
      }
      offset += token.raw.length
    }
  }
  const tokens = parser.lexer(source)
  visit(tokens, { from: (index) => index, to: (index) => index })
  if (!active) return undefined
  const first = source.lastIndexOf("\n", position - 1) + 1
  const empty =
    /^((?:[ \t]*>[ \t]?)*[ \t]*)(?:[*+-]|\d{1,9}[.)])(?:[ \t]+(?:\[[ xX]\][ \t]*)?)?$/.exec(
      source.slice(first, lineEnd(position)),
    )
  if (empty) {
    const from = first + empty[1]!.length
    return {
      text: source.slice(0, from) + source.slice(lineEnd(position)),
      position: from,
    }
  }
  const end = lineEnd(active.contentFrom)
  if (position <= end && !source.slice(active.contentFrom, end).trim()) {
    return {
      text: source.slice(0, active.from) + source.slice(end),
      position: active.from,
    }
  }
  position = Math.max(position, active.contentFrom)
  const marks = project(source, tokens).marks
  for (const mark of marks.toReversed()) {
    if (position >= mark.contentTo && position < mark.to) position = mark.to
    else if (position > mark.from && position <= mark.contentFrom)
      position = mark.from
  }
  const enclosing = marks.filter(
    (mark) => mark.contentFrom < position && position < mark.contentTo,
  )
  const close = enclosing
    .toReversed()
    .map((mark) => source.slice(mark.contentTo, mark.to))
    .join("")
  const open = enclosing
    .map((mark) => source.slice(mark.from, mark.contentFrom))
    .join("")
  const insertion = `${close}\n${active.prefix}${open}`
  return {
    text: source.slice(0, position) + insertion + source.slice(position),
    position: position + insertion.length,
  }
}

export function projectStructure(
  token: Token,
  project: (source: string, tokens: Token[]) => Prose,
): Prose | undefined {
  if (token.type === "hr") {
    const end = token.raw.replace(/\n+$/, "").length
    return {
      spans: [
        { from: 0, to: end, styles: ["hr"], text: "─" },
        ...(end < token.raw.length
          ? [{ from: end, to: token.raw.length, styles: [] }]
          : []),
      ],
      marks: [{ from: 0, to: end, contentFrom: end, contentTo: end }],
    }
  }
  if (token.type === "blockquote") {
    return projectContainer(
      token.raw,
      token.text,
      token.tokens ?? [],
      "quoteBorder",
      project,
    )
  }
  if (token.type !== "list") return
  const result: Prose = { spans: [], marks: [] }
  let offset = 0
  for (const item of (token as Tokens.List).items) {
    const prose = projectContainer(
      item.raw,
      item.text,
      item.tokens.filter((child) => child.type !== "checkbox"),
      "listBullet",
      project,
    )
    if (!prose) return
    result.spans.push(
      ...prose.spans.map((span) => ({
        ...span,
        from: offset + span.from,
        to: offset + span.to,
      })),
    )
    result.marks.push(
      ...prose.marks.map((mark) => ({
        from: offset + mark.from,
        to: offset + mark.to,
        contentFrom: offset + mark.contentFrom,
        contentTo: offset + mark.contentTo,
      })),
    )
    offset += item.raw.length
  }
  if (offset < token.raw.length) {
    result.spans.push({ from: offset, to: token.raw.length, styles: [] })
  }
  return result
}

function projectContainer(
  raw: string,
  text: string,
  tokens: Token[],
  prefixStyle: "quoteBorder" | "listBullet",
  project: (source: string, tokens: Token[]) => Prose,
): Prose | undefined {
  const mapped = containerSource(raw, text)
  if (!mapped) return
  const { positions, from, to } = mapped
  const styles: ProseStyle[] =
    prefixStyle === "quoteBorder" ? ["quote", "italic"] : []
  const spans: ProseSpan[] = mapped.suffixes.map((range) => ({
    from: range.from,
    to: range.to,
    styles,
  }))
  const firstWidth = textWidth(raw.slice(0, mapped.prefixes[0]?.to ?? 0))
  for (const [index, range] of mapped.prefixes.entries()) {
    const prefix = raw.slice(range.from, range.to)
    if (range.from < range.to) spans.push({ ...range, styles: [prefixStyle] })
    const extra =
      prefixStyle === "quoteBorder"
        ? prefix.includes(">")
          ? prefix.endsWith(">")
            ? " "
            : ""
          : "│ "
        : index > 0 && !/[ \t]/.test(raw[range.to] ?? "")
          ? " ".repeat(Math.max(0, firstWidth - textWidth(prefix)))
          : ""
    if (extra)
      spans.push({
        from: range.to,
        to: range.to,
        styles: [prefixStyle],
        text: extra,
      })
  }
  const prose = project(text, tokens)
  const boundaries = new Set(mapped.prefixes.map((range) => range.to))
  for (const span of prose.spans) {
    if (span.from === span.to) {
      spans.push({
        ...span,
        from: from(span.from),
        to: from(span.to),
        styles: [...styles, ...span.styles],
      })
      continue
    }
    let start = span.from
    for (let i = start + 1; i <= span.to; i++) {
      if (
        i < span.to &&
        positions[i]! >= positions[i - 1]! &&
        positions[i]! <= positions[i - 1]! + 1 &&
        (!boundaries.has(positions[i]!) || positions[i] === positions[i - 1])
      )
        continue
      spans.push({
        ...span,
        from: from(start),
        to: to(i),
        styles: [...styles, ...span.styles],
      })
      start = i
    }
  }
  spans.sort((a, b) => a.from - b.from)
  return {
    spans,
    marks: prose.marks.map((mark) => ({
      from: from(mark.from),
      to: to(mark.to),
      contentFrom: from(mark.contentFrom),
      contentTo: to(mark.contentTo),
    })),
  }
}

// Marked removes container prefixes; keep their positions in the original source.
function containerSource(raw: string, text: string) {
  const positions: number[] = []
  const prefixes: { from: number; to: number }[] = []
  const suffixes: { from: number; to: number }[] = []
  const contentLines = text.split("\n")
  let offset = 0
  for (const [index, line] of raw.split("\n").entries()) {
    const content = contentLines[index] ?? ""
    let start = line.lastIndexOf(content)
    let columns: number[] | undefined
    if (start < 0 && line.includes("\t")) {
      let expanded = ""
      let column = 0
      let position = 0
      columns = []
      for (const character of line) {
        if (character === "\t") {
          const width = index === 0 ? 4 - (column % 4) : 4
          expanded += " ".repeat(width)
          columns.push(...Array<number>(width).fill(position))
          column += width
        } else {
          expanded += character
          for (let i = 0; i < character.length; i++) columns.push(position + i)
          column++
        }
        position += character.length
      }
      start = expanded.lastIndexOf(content)
    }
    if (start < 0) return
    const contentStart = columns?.[start] ?? start
    if (contentStart > 0 || index < contentLines.length) {
      prefixes.push({ from: offset, to: offset + contentStart })
    }
    for (let i = 0; i < content.length; i++)
      positions.push(offset + (columns?.[start + i] ?? start + i))
    if (index < contentLines.length - 1) positions.push(offset + line.length)
    const suffix = content.length
      ? offset +
        (columns?.[start + content.length - 1] ?? start + content.length - 1) +
        1
      : offset + contentStart
    const end = offset + line.length + Number(offset + line.length < raw.length)
    if (suffix < end && index >= contentLines.length - 1) {
      suffixes.push({ from: suffix, to: end })
    }
    offset = end
  }
  const from = (position: number) => positions[position] ?? raw.length
  const to = (position: number) =>
    position ? positions[position - 1]! + 1 : from(0)
  return { positions, prefixes, suffixes, from, to }
}
