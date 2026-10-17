import { Text } from "@earendil-works/pi-tui";

const chunkSize = 2048;

/** Render only the text rows needed by the current preview viewport. */
export class TextPreview {
  private readonly text: string;
  private readonly chunks: { from: number; to: number }[] = [];
  private readonly graphemes: Intl.Segments;
  private cursor = 0;
  private lineEnd = -1;
  private topChunk = 0;
  private topRow = 0;
  private atEnd = false;
  private width = 1;
  private height = 1;

  constructor(text: string) {
    this.text = text;
    this.graphemes = new Intl.Segmenter(undefined, {
      granularity: "grapheme",
    }).segment(text);
  }

  private chunk(index: number) {
    while (this.chunks.length <= index && this.cursor <= this.text.length) {
      if (this.lineEnd < 0) {
        const newline = this.text.indexOf("\n", this.cursor);
        this.lineEnd = newline < 0 ? this.text.length : newline;
      }
      let to = Math.min(this.lineEnd, this.cursor + chunkSize);
      if (to < this.lineEnd) {
        // shortcut: chunk boundaries may wrap long lines; use native virtual text when available.
        const nearby = this.text.slice(this.cursor + chunkSize / 2, to);
        const space = nearby.lastIndexOf(" ");
        if (space >= 0) to = this.cursor + chunkSize / 2 + space + 1;
        else {
          const grapheme = this.graphemes.containing(to);
          if (grapheme && grapheme.index < to) to = grapheme.index;
        }
      }
      if (to <= this.cursor && this.cursor < this.lineEnd) {
        const grapheme = this.graphemes.containing(this.cursor);
        to = grapheme ? grapheme.index + grapheme.segment.length : this.cursor + 1;
      }
      this.chunks.push({ from: this.cursor, to });
      this.cursor = to === this.lineEnd ? to + 1 : to;
      if (to === this.lineEnd) this.lineEnd = -1;
    }
    return this.chunks[index];
  }

  private rows(index: number): string[] {
    const chunk = this.chunk(index);
    if (!chunk) return [];
    const lines = new Text(this.text.slice(chunk.from, chunk.to), 0, 0).render(this.width);
    return lines.length ? lines : [" ".repeat(this.width)];
  }

  scrollBy(lines: number): void {
    if (lines > 0) {
      this.atEnd = false;
      while (lines > 0) {
        const remaining = this.rows(this.topChunk).length - this.topRow;
        if (lines < remaining) {
          this.topRow += lines;
          break;
        }
        if (!this.chunk(this.topChunk + 1)) {
          this.topRow += Math.max(0, remaining - 1);
          this.atEnd = true;
          break;
        }
        lines -= remaining;
        this.topChunk++;
        this.topRow = 0;
      }
    } else {
      if (lines < 0) this.atEnd = false;
      while (lines < 0) {
        if (-lines <= this.topRow) {
          this.topRow += lines;
          break;
        }
        lines += this.topRow + 1;
        if (this.topChunk === 0) {
          this.topRow = 0;
          break;
        }
        this.topChunk--;
        this.topRow = this.rows(this.topChunk).length - 1;
      }
    }
  }

  render(width: number, height: number): string[] {
    const resized = width !== this.width || height !== this.height;
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    if (resized && this.atEnd) {
      this.topChunk = this.chunks.length - 1;
      this.topRow = this.rows(this.topChunk).length - 1;
    }
    this.topRow = Math.min(this.topRow, this.rows(this.topChunk).length - 1);
    let lines = this.visibleRows();
    if (lines.length < this.height) {
      const atEnd = this.atEnd;
      this.scrollBy(lines.length - this.height);
      this.atEnd = atEnd;
      lines = this.visibleRows();
    }
    return lines;
  }

  private visibleRows(): string[] {
    const visible: string[] = [];
    let index = this.topChunk;
    let row = this.topRow;
    while (visible.length < this.height) {
      const lines = this.rows(index);
      if (!lines.length) break;
      visible.push(...lines.slice(row, row + this.height - visible.length));
      index++;
      row = 0;
    }
    return visible;
  }

  get viewportHeight(): number {
    return this.height;
  }
}
