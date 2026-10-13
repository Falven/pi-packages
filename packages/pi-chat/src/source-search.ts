import { Marked, type Token } from "@earendil-works/pi-tui"

export type SearchField<Owner extends object> = {
  owner: Owner
  key: string
  sourceRef: { entryId?: string; contentIndex?: number; itemOrdinal?: number }
  callRef?: { entryId: string; contentIndex: number }
  source: string
  markdown: boolean
  tool: boolean
}

export type SourceHit<Owner extends object> = {
  field: SearchField<Owner>
  from: number
  to: number
  ordinal: number
  query: string
}

type Piece = { text: string; from: number; to: number }
type Corpus = { text: string; positions: { from: number; to: number }[] }

const parser = new Marked()
const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" })

function readablePieces(source: string): Piece[] {
  const pieces: Piece[] = []
  const append = (text: string, from: number, to: number) => {
    if (text) pieces.push({ text, from, to })
  }
  const visit = (tokens: Token[], raw: string, base: number) => {
    let cursor = 0
    for (const token of tokens) {
      const found = raw.indexOf(token.raw, cursor)
      if (found < 0) continue
      const at = base + found
      cursor = found + token.raw.length
      if (token.type === "space" || token.type === "br") {
        append(" ", at, at + token.raw.length)
      } else if (token.type === "list") {
        let itemCursor = 0
        for (const item of token.items) {
          const itemAt = token.raw.indexOf(item.raw, itemCursor)
          if (itemAt < 0) continue
          visit(item.tokens, item.raw, at + itemAt)
          append(
            " ",
            at + itemAt + item.raw.length,
            at + itemAt + item.raw.length,
          )
          itemCursor = itemAt + item.raw.length
        }
      } else if (token.type === "table") {
        let cellCursor = 0
        for (const row of [token.header, ...token.rows]) {
          for (const cell of row) {
            const cellAt = token.raw.indexOf(cell.text, cellCursor)
            if (cellAt < 0) continue
            visit(cell.tokens, cell.text, at + cellAt)
            append(
              " ",
              at + cellAt + cell.text.length,
              at + cellAt + cell.text.length,
            )
            cellCursor = cellAt + cell.text.length
          }
        }
      } else if (token.type === "blockquote") {
        let lineAt = 0
        for (const line of token.raw.split("\n")) {
          const prefix = /^[ \t]*(?:>[ \t]?)+/.exec(line)?.[0].length ?? 0
          const content = line.slice(prefix)
          if (content)
            visit(
              parser.Lexer.lexInline(content),
              content,
              at + lineAt + prefix,
            )
          append(" ", at + lineAt + line.length, at + lineAt + line.length)
          lineAt += line.length + 1
        }
      } else if (token.type === "code") {
        const opening = /^[ \t]*(?:`{3,}|~{3,})/.test(token.raw)
          ? token.raw.indexOf("\n") + 1
          : 0
        const content = token.raw.indexOf(token.text, opening)
        if (content >= 0)
          append(token.text, at + content, at + content + token.text.length)
      } else if (token.type === "link") {
        // Only the label is readable; the destination remains out of the corpus.
        let close = 0
        if (token.raw.startsWith("[")) {
          let depth = 1
          for (let index = 1; index < token.raw.length; index++) {
            if (token.raw[index] === "\\") index++
            else if (token.raw[index] === "[") depth++
            else if (token.raw[index] === "]" && --depth === 0) {
              close = index
              break
            }
          }
        }
        const label = close ? token.raw.slice(1, close) : token.text
        const offset = token.raw.indexOf(label)
        if (offset >= 0) {
          const children = close ? parser.Lexer.lexInline(label) : token.tokens
          if (children?.length) visit(children, label, at + offset)
          else append(label, at + offset, at + offset + label.length)
        }
      } else if ("tokens" in token && token.tokens?.length) {
        visit(token.tokens, token.raw, at)
      } else if (
        token.type === "text" ||
        token.type === "escape" ||
        token.type === "codespan"
      ) {
        const content = token.raw.indexOf(token.text)
        append(
          token.text,
          at + (content < 0 ? 0 : content),
          at + (content < 0 ? token.raw.length : content + token.text.length),
        )
      }
    }
  }
  visit(parser.lexer(source), source, 0)
  return pieces
}

function corpus(pieces: Piece[]): Corpus {
  let text = ""
  const positions: Corpus["positions"] = []
  let separator: { from: number; to: number } | undefined
  for (const piece of pieces) {
    for (const item of segmenter.segment(piece.text)) {
      const from = piece.from + item.index
      const to = piece.from + item.index + item.segment.length
      if (/^\s+$/u.test(item.segment)) {
        if (text) separator = { from, to }
        continue
      }
      if (separator) {
        text += " "
        positions.push(separator)
        separator = undefined
      }
      text += item.segment
      for (let index = 0; index < item.segment.length; index++)
        positions.push({ from, to })
    }
  }
  return { text, positions }
}

export class SourceSearch<Owner extends object> {
  private readonly cache = new WeakMap<
    Owner,
    Map<string, { source: string; markdown: boolean; corpus: Corpus }>
  >()

  find(fields: SearchField<Owner>[], query: string): SourceHit<Owner>[] {
    const normalized = query.replace(/\s+/gu, " ").trim()
    if (!normalized) return []
    const expression = new RegExp(
      normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      "giu",
    )
    const hits: SourceHit<Owner>[] = []
    const ordinals = new Map<Owner, number>()
    for (const field of fields) {
      let ownerCache = this.cache.get(field.owner)
      if (!ownerCache) {
        ownerCache = new Map()
        this.cache.set(field.owner, ownerCache)
      }
      let cached = ownerCache.get(field.key)
      if (
        !cached ||
        cached.source !== field.source ||
        cached.markdown !== field.markdown
      ) {
        cached = {
          source: field.source,
          markdown: field.markdown,
          corpus: corpus(
            field.markdown
              ? readablePieces(field.source)
              : [{ text: field.source, from: 0, to: field.source.length }],
          ),
        }
        ownerCache.set(field.key, cached)
      }
      for (const match of cached.corpus.text.matchAll(expression)) {
        const first = cached.corpus.positions[match.index]
        const last = cached.corpus.positions[match.index + match[0].length - 1]
        if (!first || !last) continue
        const ordinal = ordinals.get(field.owner) ?? 0
        hits.push({
          field,
          from: first.from,
          to: last.to,
          ordinal,
          query: normalized,
        })
        ordinals.set(field.owner, ordinal + 1)
      }
    }
    return hits
  }
}
