import { dirname } from "node:path";
import { Marked } from "@earendil-works/pi-tui";
import type { SourceRange, SourceTextRange } from "./source-presentation.ts";

const markdown = new Marked({
  extensions: [
    {
      name: "skillBoundary",
      level: "block",
      start: (text) => /(?:^|\n)<\/?skill(?:[ >])/.exec(text)?.index,
      tokenizer(text) {
        const raw = text.match(/^(?:<\/skill>(?:\n\n|$)|<skill[^\n]*(?:\n|$))/)?.[0];
        return raw ? { type: "skillBoundary", raw } : undefined;
      },
    },
  ],
});

function originalOffset(text: string, normalized: number) {
  let offset = 0;
  for (let index = 0; index < normalized; index++, offset++)
    if (text[offset] === "\r" && text[offset + 1] === "\n") offset++;
  return offset;
}

export type SkillPresentation = {
  compact: string;
  blocks: SourceRange[];
  references: SourceTextRange[];
  request: SourceRange;
};

export function skillPresentation(text: string): SkillPresentation | undefined {
  let request = text;
  const references: (SourceTextRange & { text: string })[] = [];
  const blocks: SourceRange[] = [];
  let offset = 0;
  for (;;) {
    if (!request.startsWith("<skill")) break;
    const header = request.match(/^<skill name="([^"\r\n<>]+)" location="([^"\r\n<>]+)">\n/);
    if (!header) return undefined;
    const from = header[0].length;
    const body = request.slice(from);
    if (!body.startsWith(`References are relative to ${dirname(header[2]!)}.\n\n`))
      return undefined;
    let cursor = 0;
    let closing: number | undefined;
    for (const token of markdown.lexer(body)) {
      if (token.type === "skillBoundary") {
        if (token.raw.startsWith("</skill>")) closing = originalOffset(body, cursor);
        break;
      }
      cursor += token.raw.length;
    }
    if (closing === undefined || body[closing - 1] !== "\n") return undefined;
    const nameFrom = offset + '<skill name="'.length;
    references.push({
      from: nameFrom,
      to: nameFrom + header[1]!.length,
      text: `/skill:${header[1]}`,
    });
    const to = from + closing - 1;
    blocks.push({ from: offset + from, to: offset + to });
    const end = Math.min(request.length, from + closing + "</skill>\n\n".length);
    request = request.slice(end);
    offset += end;
  }
  if (!references.length) return undefined;
  const tokens = markdown.lexer(request);
  if (tokens.some((token) => token.type === "skillBoundary")) return undefined;
  const retained = new Set<string>();
  markdown.walkTokens(tokens, (token) => {
    if (token.type !== "text" || token.tokens?.length) return;
    for (const match of token.raw.matchAll(/(?:^|[\s([{"'“‘])(\/skill:[^\s)\]}"'”’]+)/g)) {
      const reference = match[1]!;
      retained.add(reference);
      retained.add(reference.replace(/[\p{Po}\p{Pe}\p{Pf}–—]+$/u, ""));
    }
  });
  const missing = references.filter((reference) => !retained.has(reference.text));
  return {
    compact: [missing.map((reference) => reference.text).join(" "), request]
      .filter(Boolean)
      .join("\n\n"),
    blocks,
    references: missing,
    request: { from: offset, to: text.length },
  };
}

export function compactSkillText(text: string): string {
  return skillPresentation(text)?.compact ?? text;
}
