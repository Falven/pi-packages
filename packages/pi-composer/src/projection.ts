import { getMarkdownTheme } from "@earendil-works/pi-coding-agent"
import {
  CURSOR_MARKER,
  sliceByColumn,
  truncateToWidth,
  visibleWidth,
} from "@earendil-works/pi-tui"
import { highlightCodeSpans } from "./code.ts"
import { projectProse, type ProseMark, type ProseStyle } from "./prose.ts"

const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" })
const words = new Intl.Segmenter(undefined, { granularity: "word" })

type Cell = {
  from: number
  to: number
  text: string
  display: string
  width: number
  styles: ProseStyle[]
  highlight: { line: string; column: number; width: number } | undefined
  ranges: { from: number; to: number }[]
}

type Row = { from: number; to: number; cells: Cell[]; prefix: Cell[] }

export class Projection {
  readonly rows: Row[] = []
  private readonly cells: Cell[] = []
  private readonly length: number
  private readonly source: string
  private readonly marks: ProseMark[]

  constructor(source: string, width: number, formatted: boolean) {
    this.length = source.length
    this.source = source
    let row: Row = { from: 0, to: 0, cells: [], prefix: [] }
    let column = 0
    let prefix: Cell[] = []
    let inPrefix = true
    const { spans, marks }: ReturnType<typeof projectProse> = formatted
      ? projectProse(source)
      : { spans: [{ from: 0, to: source.length, styles: [] }], marks: [] }
    this.marks = marks
    const highlights = highlightCodeSpans(source, spans)
    const visible = spans
      .map((span) => span.text ?? source.slice(span.from, span.to))
      .join("")
    let spanIndex = 0
    let spanOffset = 0
    let spanColumn = 0
    for (const { segment, index } of graphemes.segment(visible)) {
      const currentSpan = spanIndex
      const { styles } = spans[spanIndex]!
      const color = highlights.get(spans[spanIndex]!)
      const ranges: { from: number; to: number }[] = []
      let offset = index
      while (offset < index + segment.length) {
        const span = spans[spanIndex]!
        const end = spanOffset + (span.text?.length ?? span.to - span.from)
        const next = Math.min(index + segment.length, end)
        ranges.push({
          from:
            span.text === undefined
              ? span.from + offset - spanOffset
              : span.from,
          to: span.text === undefined ? span.from + next - spanOffset : span.to,
        })
        offset = next
        if (offset === end) {
          spanIndex++
          spanOffset = end
        }
      }
      const from = ranges[0]!.from
      const to = ranges.at(-1)!.to
      const plain =
        segment === "\n"
          ? segment
          : segment.replace(/\t/g, "    ").replace(/\p{Cc}/gu, "�")
      const fullWidth = visibleWidth(plain)
      const display =
        segment === "\n"
          ? segment
          : styles.includes("hr")
            ? "─".repeat(Math.min(80, Math.max(1, width - column)))
            : truncateToWidth(plain, width, "�")
      const cells = visibleWidth(display)
      const highlight =
        color !== undefined && segment !== "\n" && fullWidth > 0
          ? {
              line: color.line,
              column: color.column + spanColumn,
              width: fullWidth,
            }
          : undefined
      spanColumn = spanIndex === currentSpan ? spanColumn + fullWidth : 0
      const cell = {
        from,
        to,
        text: segment,
        display,
        width: cells,
        styles,
        highlight,
        ranges,
      }
      if (from < to) this.cells.push(cell)
      if (segment === "\n") {
        row.to = from
        this.rows.push(row)
        row = { from: to, to, cells: [], prefix: [] }
        column = 0
        prefix = []
        inPrefix = true
        continue
      }
      inPrefix &&=
        styles.includes("quoteBorder") || styles.includes("listBullet")
      if (column > 0 && column + cells > width) {
        row.to = from
        this.rows.push(row)
        const continued: Cell[] = []
        column = 0
        if (!inPrefix) {
          for (const part of prefix) {
            if (column + part.width + cells > width) break
            continued.push(part)
            column += part.width
          }
        }
        row = { from, to, cells: [], prefix: continued }
      }
      row.cells.push(cell)
      column += cells
      if (inPrefix) {
        prefix.push(cell)
      }
    }
    row.to = source.length
    this.rows.push(row)
  }

  adjacent(position: number, direction: -1 | 1): number {
    if (direction < 0) {
      return this.boundary(
        this.cells.findLast((cell) => cell.from < position)?.from ??
          Math.min(position, this.documentBoundary(-1)),
      )
    }
    return this.boundary(
      this.cells.find((cell) => cell.to > position)?.to ??
        Math.max(position, this.documentBoundary(1)),
    )
  }

  private boundary(position: number): number {
    if (!this.marks.length) return position
    const previous = this.cells.findLast((cell) => cell.to <= position)
    const next = this.cells.find((cell) => cell.from >= position)
    if (!previous || !next || previous.to === next.from) return position
    // Pick one side of hidden delimiters for every movement direction.
    const closesMark =
      previous.text !== "\n" &&
      this.marks.some(
        (mark) =>
          mark.contentTo >= previous.to &&
          mark.to <= next.from &&
          mark.contentTo < mark.to,
      )
    return closesMark ? previous.to : next.from
  }

  documentBoundary(direction: -1 | 1): number {
    return direction < 0
      ? (this.cells[0]?.from ?? 0)
      : (this.cells.at(-1)?.to ?? this.length)
  }

  jump(position: number, target: string, direction: -1 | 1): number {
    const current = this.cells.findIndex((cell) => cell.to > position)
    const index = current < 0 ? this.cells.length : current
    const match = (cell: Cell) => cell.text.includes(target)
    return (
      (direction < 0
        ? this.cells.slice(0, index).findLast(match)
        : this.cells.slice(index + 1).find(match)
      )?.from ?? position
    )
  }

  lineBoundary(position: number, direction: -1 | 1): number {
    if (direction < 0) {
      const newline = this.cells.findLastIndex(
        (cell) => cell.text === "\n" && cell.to <= position,
      )
      return this.cells[newline + 1]?.from ?? this.length
    }
    const newline = this.cells.findIndex(
      (cell) => cell.text === "\n" && cell.from >= position,
    )
    if (newline < 0) return this.documentBoundary(1)
    return this.cells[newline - 1]?.to ?? this.cells[newline]!.from
  }

  wordBoundary(position: number, direction: -1 | 1): number {
    const text = this.cells.map((cell) => cell.text).join("")
    const head = this.cells
      .filter((cell) => cell.to <= position)
      .reduce((sum, cell) => sum + cell.text.length, 0)
    if (
      (direction < 0 && head === 0) ||
      (direction > 0 && head === text.length)
    )
      return position
    const newline = text.indexOf("\n", head)
    const fragment =
      direction < 0
        ? text.slice(text.lastIndexOf("\n", head - 1) + 1, head)
        : text.slice(head, newline < 0 ? text.length : newline)
    if (!fragment) return this.adjacent(position, direction)
    const segments = [...words.segment(fragment)]
    if (direction < 0) segments.reverse()
    let distance = 0
    let index = 0
    while (segments[index] && !/\S/u.test(segments[index]!.segment)) {
      distance += segments[index++]!.segment.length
    }
    const word = segments[index]
    if (word?.isWordLike) {
      // Pi stops at ASCII punctuation within an Intl word, such as foo.bar.
      const punctuation = [
        ...word.segment.matchAll(/[(){}[\]<>.,;:'"!?+\-=*/\\|&%^$#@~`]/g),
      ]
      distance +=
        direction < 0
          ? word.segment.length -
            (punctuation.at(-1) ? punctuation.at(-1)!.index + 1 : 0)
          : (punctuation[0]?.index ?? word.segment.length)
    } else {
      while (
        segments[index] &&
        !segments[index]!.isWordLike &&
        /\S/u.test(segments[index]!.segment)
      ) {
        distance += segments[index++]!.segment.length
      }
    }
    const target = head + direction * distance
    let offset = 0
    for (const cell of this.cells) {
      const end = offset + cell.text.length
      if (direction < 0 ? target < end : target <= end) {
        return this.boundary(target <= offset ? cell.from : cell.to)
      }
      offset = end
    }
    return this.documentBoundary(1)
  }

  replace(
    from: number,
    to: number,
    text: string,
  ): { text: string; position: number } {
    const selected = this.cells.filter(
      (cell) => cell.to > from && cell.from < to,
    )
    const insideSyntax = this.marks.some((mark) =>
      [from, to].some(
        (position) =>
          (position > mark.from && position < mark.contentFrom) ||
          (position > mark.contentTo && position < mark.to),
      ),
    )
    if (
      insideSyntax ||
      !selected.length ||
      (from === 0 && to === this.length)
    ) {
      return {
        text: this.source.slice(0, from) + text + this.source.slice(to),
        position: from + text.length,
      }
    }
    const cuts = selected.flatMap((cell) => cell.ranges)
    for (const mark of this.marks) {
      const content = this.cells.filter((cell) =>
        cell.ranges.some(
          (range) => range.to > mark.contentFrom && range.from < mark.contentTo,
        ),
      )
      const covered =
        content.length > 0 &&
        content.every((cell) => cell.to > from && cell.from < to)
      const replacingInside =
        text.length > 0 &&
        !text.startsWith("\n") &&
        !text.endsWith("\n") &&
        selected[0]!.from >= mark.contentFrom &&
        selected.at(-1)!.from < mark.contentTo
      if (
        (from <= mark.from && to >= mark.to) ||
        (covered && !replacingInside)
      ) {
        cuts.push(mark)
      }
    }
    cuts.sort((a, b) => a.from - b.from)
    let result = ""
    let offset = 0
    let position: number | undefined
    // Keep delimiters around surviving text, including across a selection boundary.
    for (const cut of cuts) {
      if (cut.from > offset) result += this.source.slice(offset, cut.from)
      if (position === undefined) {
        result += text
        position = result.length
      }
      offset = Math.max(offset, cut.to)
    }
    return { text: result + this.source.slice(offset), position: position! }
  }

  rowAt(position: number): number {
    return this.rows.findLastIndex((row) => row.from <= position)
  }

  vertical(
    position: number,
    distance: number,
    preferred?: number,
  ): { position: number; column: number } {
    const currentIndex = this.rowAt(position)
    const current = this.rows[currentIndex]!
    const column =
      preferred ??
      current.prefix.reduce((sum, cell) => sum + cell.width, 0) +
        current.cells
          .filter((cell) => cell.to <= position)
          .reduce((sum, cell) => sum + cell.width, 0)
    return {
      position: this.positionAt(currentIndex + distance, column),
      column,
    }
  }

  positionAt(row: number, column: number): number {
    const targetIndex = Math.max(0, Math.min(this.rows.length - 1, row))
    const target = this.rows[targetIndex]!
    let next = target.cells[0]?.from ?? target.from
    let cells = target.prefix.reduce((sum, cell) => sum + cell.width, 0)
    for (const cell of target.cells) {
      if (
        cells + cell.width > column ||
        cell.to === this.rows[targetIndex + 1]?.from
      )
        break
      next = cell.to
      cells += cell.width
    }
    return this.boundary(next)
  }

  renderRow(
    index: number,
    anchor: number,
    head: number,
    focused: boolean,
  ): string {
    const theme = getMarkdownTheme()
    const row = this.rows[index]!
    const caretRow = focused && this.rowAt(head) === index
    const caret = row.cells.findIndex((cell) => cell.to > head)
    let output = row.prefix
      .map((cell) => {
        let display = cell.styles.includes("quoteBorder")
          ? cell.display.replace(/>/g, "│")
          : " ".repeat(cell.width)
        for (const style of cell.styles) display = theme[style](display)
        return display
      })
      .join("")
    let highlighted:
      | { source: string; line: string; column: number }
      | undefined
    for (const [i, cell] of row.cells.entries()) {
      let display = cell.styles.includes("quoteBorder")
        ? cell.display.replace(/>/g, "│")
        : cell.display
      if (cell.highlight) {
        const { line, column, width } = cell.highlight
        if (highlighted?.source !== line) {
          // Slice the row once so each cell does not rescan offscreen code.
          const rowWidth = row.cells.reduce(
            (sum, item) => sum + (item.highlight?.width ?? item.width),
            0,
          )
          highlighted = {
            source: line,
            line: sliceByColumn(line, column, rowWidth),
            column,
          }
        }
        display =
          truncateToWidth(
            sliceByColumn(highlighted.line, column - highlighted.column, width),
            cell.width,
            "�",
          ) + "\x1b[0m"
      }
      for (const style of cell.styles) display = theme[style](display)
      if (caretRow && caret === i) output += CURSOR_MARKER
      output +=
        (caretRow && caret === i) ||
        (cell.to > Math.min(anchor, head) && cell.from < Math.max(anchor, head))
          ? `\x1b[7m${display}\x1b[27m`
          : display
    }
    if (caretRow && caret < 0) {
      output += `${CURSOR_MARKER}\x1b[7m \x1b[27m`
    }
    return output
  }
}
