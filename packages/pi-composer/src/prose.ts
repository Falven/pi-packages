import { isAbsolute } from "node:path"
import { pathToFileURL } from "node:url"
import { Marked, type Token } from "@earendil-works/pi-tui"
import { projectCode } from "./code.ts"
import { projectStructure } from "./structures.ts"

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
  | "quote"
  | "quoteBorder"
  | "listBullet"
  | "hr"

export type ProseSpan = {
  from: number
  to: number
  styles: ProseStyle[]
  href?: string
  code?: { language: string | undefined }
  text?: string
}

export type ProseMark = {
  from: number
  to: number
  contentFrom: number
  contentTo: number
}

export type Prose = {
  spans: ProseSpan[]
  marks: ProseMark[]
}

export function projectProse(
  source: string,
  parsed: Token[] = parser.lexer(source),
): Prose {
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
      const structure = projectStructure(token, projectProse)
      if (structure) {
        spans.push(
          ...structure.spans.map((span) => ({
            ...span,
            from: offset + span.from,
            to: offset + span.to,
            styles: [...styles, ...span.styles],
          })),
        )
        marks.push(
          ...structure.marks.map((mark) => ({
            from: offset + mark.from,
            to: offset + mark.to,
            contentFrom: offset + mark.contentFrom,
            contentTo: offset + mark.contentTo,
          })),
        )
        offset = end
        continue
      }
      let contentStart = 0
      let added: ProseStyle[] = []
      let children: Token[] = "tokens" in token ? (token.tokens ?? []) : []
      switch (token.type) {
        case "paragraph":
        case "text":
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
        default:
          append(offset, end, styles)
          offset = end
          continue
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
        const firstSpan = spans.length
        visit(children, offset + start, [...styles, ...added])
        if (
          token.type === "link" &&
          token.href &&
          !/\p{Cc}/u.test(token.href)
        ) {
          const target = isAbsolute(token.href)
            ? pathToFileURL(token.href).href
            : token.href
          // Ghostty requires an explicit host even for local file hyperlinks.
          const href = target.replace(/^file:\/\/\//i, "file://localhost/")
          for (let index = firstSpan; index < spans.length; index++) {
            spans[index]!.href = href
          }
        }
        append(end - newlines, end, styles)
      }
      offset = end
    }
    return offset
  }
  const end = visit(parsed, 0, [])
  append(end, source.length, [])
  // Marked can append a newline to a container token at the end of the draft.
  for (const span of spans) span.to = Math.min(span.to, source.length)
  return {
    spans: spans.filter(
      (span) =>
        span.from < span.to || (span.text && span.from <= source.length),
    ),
    marks,
  }
}
