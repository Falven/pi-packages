import { highlightCode } from "@earendil-works/pi-coding-agent";
import { Marked, visibleWidth, wrapTextWithAnsi, type Token } from "@earendil-works/pi-tui";
import type { Prose, ProseSpan, ProseStyle } from "./prose.ts";
import { containerSource } from "./structures.ts";

const parser = new Marked();

function codeLines(raw: string, text: string) {
  const lines = raw.split("\n");
  const fence = /^ {0,3}(`{3,}|~{3,})/.exec(lines[0]!)?.[1];
  const first = fence ? 1 : 0;
  const last = lines.at(-1) === "" ? lines.length - 2 : lines.length - 1;
  // Native body lines distinguish closing fences from literal fence-like code.
  const closed =
    fence &&
    last > 0 &&
    (text ? text.split("\n").length : 0) <= last - first &&
    new RegExp(`^ {0,3}${fence[0]}{${fence.length},}[ \\t]*$`).test(lines[last]!);
  return { lines, fence, first, end: closed ? last : lines.length };
}

function codeTokens(tokens: Token[], positions: number[], end = positions.at(-1)! + 1) {
  const result: { token: Token; positions: number[]; end: number }[] = [];
  let offset = 0;
  for (const [index, token] of tokens.entries()) {
    const mapped = positions.slice(offset, offset + token.raw.length);
    const extent = tokens.slice(index + 1).every((next) => next.type === "space")
      ? end
      : mapped.at(-1)! + 1;
    if (token.type === "code") {
      result.push({ token, positions: mapped, end: extent });
    } else if (token.type === "list") {
      result.push(...codeTokens(token.items, mapped, extent));
    } else if (token.type === "blockquote" || token.type === "list_item") {
      const child = containerSource(token.raw, token.text);
      if (child)
        result.push(
          ...codeTokens(
            (token.tokens ?? []).filter((part: Token) => part.type !== "checkbox"),
            child.positions.map((position) => mapped[position]!),
            extent,
          ),
        );
    }
    offset += token.raw.length;
  }
  return result;
}

export function codeNewline(source: string, position: number): string | undefined {
  const tokens = codeTokens(
    parser.lexer(source),
    Array.from({ length: source.length }, (_, index) => index),
  );
  for (const { token, positions, end } of tokens) {
    if (token.type === "code" && position >= positions[0]! && position <= end) {
      const block = codeLines(token.raw, token.text);
      const closed = block.end < block.lines.length;
      const closingOffset = block.lines.slice(0, block.end).join("\n").length + (closed ? 1 : 0);
      const closing = closed ? source.lastIndexOf("\n", positions[closingOffset]! - 1) + 1 : end;
      if (block.fence && (position < closing || (!closed && position === closing))) {
        const start = source.lastIndexOf("\n", position - 1) + 1;
        const content = positions.find((offset) => offset >= start) ?? position;
        const prefix = source
          .slice(start, Math.min(content, position))
          .replace(/(?:[*+-]|\d+[.)])(?=[ \t])/g, (marker) => " ".repeat(marker.length));
        const indent = /^[ \t]*/.exec(source.slice(content, position))![0];
        return "\n" + prefix + indent;
      }
    }
  }
  return undefined;
}

export function projectCode(token: Token, from: number, styles: ProseStyle[]): Prose | undefined {
  if (token.type === "code") {
    const { lines, first, end } = codeLines(token.raw, token.text);
    const code = { language: token.lang?.split(/\s+/)[0] };
    const spans: ProseSpan[] = [];
    let offset = from;
    for (const [index, line] of lines.entries()) {
      const to = offset + line.length + (index < lines.length - 1 ? 1 : 0);
      if (to > offset) {
        spans.push(
          index < first || index >= end
            ? { from: offset, to, styles: [...styles, "codeBlockBorder"] }
            : {
                from: offset,
                to,
                styles,
                code,
              },
        );
      }
      offset = to;
    }
    return { spans, marks: [] };
  }
  if (token.type !== "codespan") return undefined;
  const delimiter = /^`+/.exec(token.raw)![0].length;
  const to = from + token.raw.length;
  const contentFrom = from + delimiter;
  const contentTo = to - delimiter;
  return {
    spans: [{ from: contentFrom, to: contentTo, styles: [...styles, "code"] }],
    marks: [{ from, to, contentFrom, contentTo }],
  };
}

export function highlightCodeSpans(source: string, spans: ProseSpan[]) {
  const blocks = new Map<NonNullable<ProseSpan["code"]>, ProseSpan[]>();
  const result = new Map<ProseSpan, { line: string; column: number }>();
  for (const span of spans) {
    if (!span.code) continue;
    const block = blocks.get(span.code) ?? [];
    block.push(span);
    blocks.set(span.code, block);
  }
  for (const [code, parts] of blocks) {
    const raw = parts.map((span) => source.slice(span.from, span.to));
    const display = raw.map((text) =>
      text
        .split("\n")
        .map((line) => line.replace(/\t/g, "    ").replace(/\p{Cc}/gu, "�"))
        .join("\n"),
    );
    // Highlight original source after container mapping and carry multiline colors.
    const lines = wrapTextWithAnsi(
      highlightCode(display.join(""), code.language).join("\n"),
      Number.MAX_SAFE_INTEGER,
    );
    let line = 0;
    let column = 0;
    for (const [index, part] of parts.entries()) {
      result.set(part, { line: lines[line]!, column });
      const content = display[index]!.split("\n");
      line += content.length - 1;
      column =
        content.length > 1 ? visibleWidth(content.at(-1)!) : column + visibleWidth(content[0]!);
    }
  }
  return result;
}
