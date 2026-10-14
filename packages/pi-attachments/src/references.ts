import { basename, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"
import { Marked, type Token, type Tokens } from "@earendil-works/pi-tui"
import { decodeHTMLStrict } from "entities"

const parser = new Marked()
const destinationEscape = new RegExp(
  parser.Lexer.rules.inline.normal.escape.source.slice(1),
  "g",
)

function markdownDestination(raw: string): string {
  const href = raw.startsWith("<") ? raw.slice(1, -1) : raw
  let decoded = ""
  let offset = 0
  for (const match of href.matchAll(destinationEscape)) {
    decoded += decodeHTMLStrict(href.slice(offset, match.index)) + match[1]
    offset = match.index + match[0].length
  }
  return decoded + decodeHTMLStrict(href.slice(offset))
}
const linkRule = parser.Lexer.rules.inline.normal.link
const linkDestination = new RegExp(linkRule.source, `${linkRule.flags}d`)
const definitionRule = parser.Lexer.rules.block.normal.def
const definitionDestination = new RegExp(
  definitionRule.source,
  `${definitionRule.flags}d`,
)
const labelRules = [
  linkRule,
  parser.Lexer.rules.inline.normal.reflink,
  parser.Lexer.rules.inline.normal.nolink,
].map((rule) => new RegExp(rule.source, `${rule.flags}d`))
type Range = { from: number; to: number }
type SourceMap = {
  from: (offset: number) => number
  to: (offset: number) => number
}

function offsetMap(parent: SourceMap, offset: number): SourceMap {
  return {
    from: (position) => parent.from(offset + position),
    to: (position) => parent.to(offset + position),
  }
}

function unescapedMap(
  raw: string,
  content: string,
  parent: SourceMap,
): SourceMap | undefined {
  const positions: number[] = []
  let from = 0
  for (let offset = 0; offset < content.length; offset++) {
    if (raw[from] === "\\" && raw[from] !== content[offset]) from++
    if (raw[from] !== content[offset]) return undefined
    positions.push(from++)
  }
  if (from !== raw.length) return undefined
  return {
    from: (offset) => parent.from(positions[offset] ?? raw.length),
    to: (offset) => parent.to(offset ? positions[offset - 1]! + 1 : 0),
  }
}

// Marked trims table cells and unescapes their pipes before lexing inline content.
function tableCells(line: string) {
  const cells: Range[] = []
  let from = 0
  for (let offset = 0; offset < line.length; offset++) {
    if (line[offset] !== "|") continue
    let slashes = 0
    while (line[offset - slashes - 1] === "\\") slashes++
    if (slashes % 2) continue
    cells.push({ from, to: offset })
    from = offset + 1
  }
  cells.push({ from, to: line.length })
  if (!line.slice(cells[0]?.from, cells[0]?.to).trim()) cells.shift()
  if (!line.slice(cells.at(-1)?.from, cells.at(-1)?.to).trim()) cells.pop()
  return cells
}

function destination(
  raw: string,
  map: SourceMap,
  rule: RegExp,
): Range | undefined {
  const range = rule.exec(raw)?.indices?.[2]
  if (!range) return undefined
  const content = raw.slice(...range)
  return {
    from: map.from(range[0] + content.length - content.trimStart().length),
    to: map.to(range[1] - (content.length - content.trimEnd().length)),
  }
}

// Marked removes list and quote prefixes before lexing their children.
function containerMap(
  raw: string,
  content: string,
  parent: SourceMap,
): SourceMap | undefined {
  const positions: number[] = []
  const lines = content.split("\n")
  let offset = 0
  for (const [index, line] of raw.split("\n").entries()) {
    const text = lines[index]
    if (text === undefined) break
    let from = line.lastIndexOf(text)
    let columns: number[] | undefined
    if (from < 0 && line.includes("\t")) {
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
          for (let unit = 0; unit < character.length; unit++)
            columns.push(position + unit)
          column++
        }
        position += character.length
      }
      from = expanded.lastIndexOf(text)
    }
    if (from < 0) return undefined
    for (let column = 0; column < text.length; column++)
      positions.push(offset + (columns?.[from + column] ?? from + column))
    if (index < lines.length - 1) positions.push(offset + line.length)
    offset += line.length + 1
  }
  if (positions.length !== content.length) return undefined
  return {
    from: (position) => parent.from(positions[position] ?? raw.length),
    to: (position) =>
      parent.to(position ? positions[position - 1]! + 1 : (positions[0] ?? 0)),
  }
}

function localPath(href: string, cwd: string): string | undefined {
  if (/^file:/i.test(href)) {
    try {
      return fileURLToPath(href)
    } catch {
      return undefined
    }
  }
  if (!href || /^[a-z][a-z\d+.-]*:/i.test(href) || href.startsWith("//"))
    return undefined
  return resolve(cwd, href)
}

export function fileDestination(path: string): string {
  return `<${path.replace(/[\\&|]/g, "\\$&")}>`
}

export function attachmentLink(name: string, path: string): string {
  return `[Attachment: ${name.replace(/[\\[\]&]/g, "\\$&")}](${fileDestination(path)})`
}

export function fileReferences(text: string, cwd: string, storage?: string) {
  const references: {
    path: string
    from: number
    to: number
    destination: Range
    label?: string
    legacyPath?: string
  }[] = []
  const links: {
    token: Tokens.Link | Tokens.Image
    map: SourceMap
    from: number
    to: number
  }[] = []
  const definitions = new Map<string, Range>()
  function visit(tokens: Token[], source: string, parent: SourceMap) {
    let offset = 0
    for (const token of tokens) {
      const from = source.indexOf(token.raw, offset)
      if (from < 0) continue
      offset = from + token.raw.length
      const map = offsetMap(parent, from)
      if (token.type === "link" || token.type === "image") {
        links.push({
          token: token as Tokens.Link | Tokens.Image,
          map,
          from: map.from(0),
          to: map.to(token.raw.length),
        })
        if (token.type === "link") {
          const link = token as Tokens.Link
          const range = labelRules
            .map((rule) => rule.exec(token.raw)?.indices?.[1])
            .find(Boolean)
          if (range) {
            const child = unescapedMap(
              token.raw.slice(...range),
              link.text,
              offsetMap(map, range[0]),
            )
            if (child) visit(link.tokens, link.text, child)
          }
        }
      } else if (token.type === "def") {
        const definition = token as Tokens.Def
        const range = destination(token.raw, map, definitionDestination)
        if (range && !definitions.has(definition.tag))
          definitions.set(definition.tag, range)
      } else if (token.type === "list") {
        visit((token as Tokens.List).items, token.raw, map)
      } else if (token.type === "table") {
        const table = token as Tokens.Table
        let rowOffset = 0
        for (const [row, line] of token.raw.split("\n").entries()) {
          const cells = row === 0 ? table.header : table.rows[row - 2]
          if (cells) {
            for (const [column, range] of tableCells(line).entries()) {
              const cell = cells[column]
              if (!cell) break
              const raw = line.slice(range.from, range.to)
              const child = unescapedMap(
                raw.trim(),
                cell.text,
                offsetMap(
                  map,
                  rowOffset + range.from + raw.length - raw.trimStart().length,
                ),
              )
              if (child) visit(cell.tokens, cell.text, child)
            }
          }
          rowOffset += line.length + 1
        }
      } else if (
        "tokens" in token &&
        "text" in token &&
        token.tokens &&
        typeof token.text === "string"
      ) {
        const start = token.raw.indexOf(token.text)
        const child =
          start >= 0
            ? {
                from: (position: number) => map.from(start + position),
                to: (position: number) => map.to(start + position),
              }
            : containerMap(token.raw, token.text, map)
        if (child) visit(token.tokens, token.text, child)
      }
    }
  }
  visit(parser.lexer(text), text, {
    from: (offset) => offset,
    to: (offset) => offset,
  })
  for (const { token, map, from, to } of links) {
    if (token.raw.startsWith("<")) {
      const path = localPath(token.href, cwd)
      if (!path) continue
      references.push({
        path,
        from,
        to,
        destination: { from, to },
        label: token.text,
      })
      continue
    }
    let range = destination(token.raw, map, linkDestination)
    if (!range) {
      const rules = parser.Lexer.rules.inline.normal
      const match =
        rules.reflink.exec(token.raw) ?? rules.nolink.exec(token.raw)
      const tag = (match?.[2] || match?.[1])?.replace(/\s+/g, " ").toLowerCase()
      range = tag ? definitions.get(tag) : undefined
    }
    if (!range) continue
    const raw = text.slice(range.from, range.to)
    const path = localPath(markdownDestination(raw), cwd)
    const literal = raw.startsWith("<")
      ? localPath(raw.slice(1, -1), cwd)
      : undefined
    const legacyPath =
      storage &&
      literal?.startsWith(storage + sep) &&
      literal !== path &&
      !basename(literal).includes("\\") &&
      token.raw === `[Attachment: ${basename(literal)}](${raw})`
        ? literal
        : undefined
    if (path)
      references.push({
        path,
        from,
        to,
        destination: range,
        ...(legacyPath ? { legacyPath } : {}),
      })
  }
  return references
}

export function attachmentReferences(
  text: string,
  storage: string,
  cwd = process.cwd(),
) {
  return fileReferences(text, cwd, storage).filter(({ path }) =>
    path.startsWith(storage + sep),
  )
}

export function attachmentPaths(
  text: string,
  storage: string,
  cwd = process.cwd(),
): string[] {
  return [
    ...new Set(
      attachmentReferences(text, storage, cwd).map(({ path }) => path),
    ),
  ]
}
