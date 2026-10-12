import { Marked, type Token } from "@earendil-works/pi-tui"
import { projectCode, projectNestedCode } from "./code.ts"

const parser = new Marked()

export type ProseStyle =
  | "heading"
  | "bold"
  | "italic"
  | "strikethrough"
  | "link"
  | "underline"
  | "code"
  | "codeBlockBorder"

export type ProseSpan = {
  from: number
  to: number
  styles: ProseStyle[]
  highlight?: string
}

export type ProseMark = {
  from: number
  to: number
  contentFrom: number
  contentTo: number
}

export function projectProse(source: string): {
  spans: ProseSpan[]
  marks: ProseMark[]
} {
  const spans: ProseSpan[] = []
  const marks: ProseMark[] = []
  const append = (from: number, to: number, styles: ProseStyle[]) => {
    if (from < to) spans.push({ from, to, styles })
  }
  const visit = (tokens: Token[], from: number, styles: ProseStyle[]) => {
    let offset = from
    for (const token of tokens) {
      const end = offset + token.raw.length
      const code = projectCode(token, offset, styles)
      if (code) {
        spans.push(...code.spans)
        marks.push(...code.marks)
        offset = end
        continue
      }
      let contentStart = 0
      let added: ProseStyle[] = []
      let children: Token[] = "tokens" in token ? (token.tokens ?? []) : []
      switch (token.type) {
        case "paragraph":
          break
        case "heading":
          contentStart =
            /^ {0,3}#{1,6}(?:[ \t]+|$)/.exec(token.raw)?.[0].length ?? 0
          added =
            token.depth === 1
              ? ["heading", "bold", "underline"]
              : ["heading", "bold"]
          break
        case "strong":
          contentStart = 2
          added = ["bold"]
          break
        case "em":
          contentStart = 1
          added = ["italic"]
          break
        case "del":
          contentStart = token.raw.startsWith("~~") ? 2 : 1
          added = ["strikethrough"]
          break
        case "link": {
          contentStart =
            token.raw.startsWith("[") || token.raw.startsWith("<") ? 1 : 0
          added = ["link", "underline"]
          // Marked unescapes brackets in link.text; locate and tokenize the source label.
          if (token.raw.startsWith("[")) {
            let depth = 1
            for (let index = 1; index < token.raw.length; index++) {
              if (token.raw[index] === "\\") index++
              else if (token.raw[index] === "[") depth++
              else if (token.raw[index] === "]" && --depth === 0) {
                children = parser.Lexer.lexInline(token.raw.slice(1, index))
                break
              }
            }
          }
          break
        }
        default: {
          const nested = projectNestedCode(token, offset, styles)
          if (nested) {
            spans.push(...nested.spans)
            marks.push(...nested.marks)
          } else append(offset, end, styles)
          offset = end
          continue
        }
      }
      const content = children.map((child) => child.raw).join("")
      const start = content ? token.raw.indexOf(content, contentStart) : -1
      if (start < 0) {
        append(offset, end, styles)
      } else {
        const newlines = /\n+$/.exec(token.raw)?.[0].length ?? 0
        if (added.length) {
          marks.push({
            from: offset,
            to: end - newlines,
            contentFrom: offset + start,
            contentTo: offset + start + content.length,
          })
        }
        visit(children, offset + start, [...styles, ...added])
        append(end - newlines, end, styles)
      }
      offset = end
    }
    return offset
  }
  const end = visit(parser.lexer(source), 0, [])
  append(end, source.length, [])
  return { spans, marks }
}
