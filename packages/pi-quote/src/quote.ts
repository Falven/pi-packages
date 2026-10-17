import { stripTerminalSequences } from "@earendil-works/pi-tui";

export function quoteText(text: string): string {
  return stripTerminalSequences(text)
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => (line ? `> ${line}` : ">"))
    .join("\n");
}

export function quoteSelection(
  text: string,
  firstRow: number,
  lastRow: number,
  lineAt: (row: number) => string,
): string {
  // shortcut: infer code context from visible fences until Pi exposes selection source metadata.
  let fence: { prefix: string; marker: string; language: string } | undefined;
  let opening: typeof fence;
  for (let row = 0; row <= lastRow; row++) {
    if (row === firstRow) opening = fence;
    const match = /^([ \t]*(?:│[ \t]*)*)(`{3,}|~{3,})(.*)$/.exec(
      stripTerminalSequences(lineAt(row)),
    );
    if (!match) continue;
    const prefix = match[1]!;
    const marker = match[2]!;
    const language = match[3]!;
    if (!fence) fence = { prefix, marker, language: language.trim() };
    else if (
      prefix === fence.prefix &&
      marker[0] === fence.marker[0] &&
      marker.length >= fence.marker.length &&
      !language.trim()
    )
      fence = undefined;
  }
  if (opening && opening === fence) {
    const marker = "`".repeat(
      (text.match(/`+/g) ?? []).reduce((length, run) => Math.max(length, run.length + 1), 3),
    );
    return quoteText(`${marker}${opening.language}\n${text}\n${marker}`);
  }
  if (opening) text = `${opening.marker}${opening.language}\n${text}`;
  if (fence) text += `\n${fence.marker}`;
  return quoteText(text);
}

export function quoteInsertion(quote: string, before: string): string {
  const separator = !before || before.endsWith("\n\n") ? "" : before.endsWith("\n") ? "\n" : "\n\n";
  return `${separator}${quote}\n\n`;
}
