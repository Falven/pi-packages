import { highlightCode } from "@earendil-works/pi-coding-agent"
import { Marked, wrapTextWithAnsi, type Token } from "@earendil-works/pi-tui"
import type { ProseMark, ProseSpan, ProseStyle } from "./prose.ts"

const parser = new Marked()

function codeLines(raw: string, text: string) {
  const lines = raw.split("\n")
  const fence = /^ {0,3}(`{3,}|~{3,})/.exec(lines[0]!)?.[1]
  const first = fence ? 1 : 0
  const last = lines.at(-1) === "" ? lines.length - 2 : lines.length - 1
  // Native body lines distinguish closing fences from literal fence-like code.
  const closed =
    fence &&
    last > 0 &&
    (text ? text.split("\n").length : 0) <= last - first &&
    new RegExp(`^ {0,3}${fence[0]}{${fence.length},}[ \\t]*$`).test(
      lines[last]!,
    )
  return { lines, fence, first, end: closed ? last : lines.length }
}

function childPositions(raw: string, content: string, positions: number[]) {
  const start = raw.indexOf(content)
  if (start >= 0) return positions.slice(start, start + content.length)
  const lines = raw.split("\n")
  const children = content.split("\n")
  const result: number[] = []
  let offset = 0
  for (const [index, child] of children.entries()) {
    const line = lines[index]
    if (line === undefined) return undefined
    let matched: number[] | undefined
    // Marked expands list tabs, but the mapped characters remain original source.
    for (const tabs of ["literal", "fixed", "stops"]) {
      let expanded = ""
      const columns: number[] = []
      for (let column = 0; column < line.length; column++) {
        const character = line[column]!
        const text =
          character === "\t" && tabs !== "literal"
            ? " ".repeat(tabs === "fixed" ? 4 : 4 - (expanded.length % 4))
            : character
        expanded += text
        columns.push(
          ...Array<number>(text.length).fill(positions[offset + column]!),
        )
      }
      if (expanded.endsWith(child)) {
        matched = columns.slice(expanded.length - child.length)
        break
      }
    }
    if (!matched) return undefined
    result.push(...matched)
    if (index < children.length - 1)
      result.push(positions[offset + line.length]!)
    offset += line.length + 1
  }
  return result
}

function codeTokens(
  tokens: Token[],
  positions: number[],
  end = positions.at(-1)! + 1,
) {
  const result: { token: Token; positions: number[]; end: number }[] = []
  let offset = 0
  for (const [index, token] of tokens.entries()) {
    const mapped = positions.slice(offset, offset + token.raw.length)
    const extent = tokens
      .slice(index + 1)
      .every((next) => next.type === "space")
      ? end
      : mapped.at(-1)! + 1
    if (token.type === "code" || token.type === "codespan") {
      result.push({ token, positions: mapped, end: extent })
    } else if (token.type === "list") {
      result.push(...codeTokens(token.items, mapped, extent))
    } else if ("tokens" in token && token.tokens) {
      const content = token.tokens.map((child) => child.raw).join("")
      const children = childPositions(token.raw, content, mapped)
      if (children) result.push(...codeTokens(token.tokens, children, extent))
    }
    offset += token.raw.length
  }
  return result
}

export function projectNestedCode(
  token: Token,
  from: number,
  styles: ProseStyle[],
): { spans: ProseSpan[]; marks: ProseMark[] } | undefined {
  if (token.type !== "list" && token.type !== "blockquote") return undefined
  const code = codeTokens(
    [token],
    Array.from({ length: token.raw.length }, (_, index) => index),
  )
  if (!code.length) return undefined
  const spans: ProseSpan[] = []
  const marks: ProseMark[] = []
  let offset = 0
  for (const leaf of code) {
    const positions = [...new Set(leaf.positions)]
    const raw = positions.map((position) => token.raw[position]).join("")
    const projected = projectCode({ ...leaf.token, raw }, 0, styles)!
    const start = positions[0]!
    const end = positions.at(-1)! + 1
    if (offset < start)
      spans.push({ from: from + offset, to: from + start, styles })
    for (const span of projected.spans) {
      let begin = span.from
      for (let index = begin + 1; index <= span.to; index++) {
        if (
          index === span.to ||
          positions[index] !== positions[index - 1]! + 1
        ) {
          spans.push({
            ...span,
            from: from + positions[begin]!,
            to: from + positions[index - 1]! + 1,
          })
          begin = index
        }
      }
    }
    for (let index = 1; index < positions.length; index++) {
      const gapStart = positions[index - 1]! + 1
      if (gapStart < positions[index]!)
        spans.push({
          from: from + gapStart,
          to: from + positions[index]!,
          styles,
        })
    }
    for (const mark of projected.marks) {
      marks.push({
        from: from + positions[mark.from]!,
        to: from + positions[mark.to - 1]! + 1,
        contentFrom: from + positions[mark.contentFrom]!,
        contentTo: from + positions[mark.contentTo - 1]! + 1,
      })
    }
    offset = end
  }
  if (offset < token.raw.length)
    spans.push({ from: from + offset, to: from + token.raw.length, styles })
  spans.sort((a, b) => a.from - b.from)
  return { spans, marks }
}

export function codeNewline(
  source: string,
  position: number,
): string | undefined {
  const tokens = codeTokens(
    parser.lexer(source),
    Array.from({ length: source.length }, (_, index) => index),
  )
  for (const { token, positions, end } of tokens) {
    if (token.type === "code" && position >= positions[0]! && position <= end) {
      const block = codeLines(token.raw, token.text)
      const closed = block.end < block.lines.length
      const closingOffset =
        block.lines.slice(0, block.end).join("\n").length + (closed ? 1 : 0)
      const closing = closed
        ? source.lastIndexOf("\n", positions[closingOffset]! - 1) + 1
        : end
      if (
        block.fence &&
        (position < closing || (!closed && position === closing))
      ) {
        const start = source.lastIndexOf("\n", position - 1) + 1
        const content = positions.find((offset) => offset >= start) ?? position
        const prefix = source
          .slice(start, Math.min(content, position))
          .replace(/(?:[*+-]|\d+[.)])(?=[ \t])/g, (marker) =>
            " ".repeat(marker.length),
          )
        const indent = /^[ \t]*/.exec(source.slice(content, position))![0]
        return "\n" + prefix + indent
      }
    }
  }
  return undefined
}

export function projectCode(
  token: Token,
  from: number,
  styles: ProseStyle[],
): { spans: ProseSpan[]; marks: ProseMark[] } | undefined {
  if (token.type === "code") {
    const { lines, first, end } = codeLines(token.raw, token.text)
    const code = lines
      .slice(first, end)
      .map((line) => line.replace(/\t/g, "    ").replace(/\p{Cc}/gu, "�"))
      .join("\n")
    // Carry multiline token colors without changing the projection's wrapping.
    const highlighted = wrapTextWithAnsi(
      highlightCode(code, token.lang?.split(/\s+/)[0]).join("\n"),
      Number.MAX_SAFE_INTEGER,
    )
    const spans: ProseSpan[] = []
    let offset = from
    for (const [index, line] of lines.entries()) {
      const to = offset + line.length + (index < lines.length - 1 ? 1 : 0)
      if (to > offset) {
        spans.push(
          index < first || index >= end
            ? { from: offset, to, styles: [...styles, "codeBlockBorder"] }
            : {
                from: offset,
                to,
                styles,
                highlight: highlighted[index - first]!,
              },
        )
      }
      offset = to
    }
    return { spans, marks: [] }
  }
  if (token.type !== "codespan") return undefined
  const delimiter = /^`+/.exec(token.raw)![0].length
  const to = from + token.raw.length
  const contentFrom = from + delimiter
  const contentTo = to - delimiter
  return {
    spans: [{ from: contentFrom, to: contentTo, styles: [...styles, "code"] }],
    marks: [{ from, to, contentFrom, contentTo }],
  }
}
