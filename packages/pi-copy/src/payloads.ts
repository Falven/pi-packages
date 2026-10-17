import type { AgentToolResult } from "@earendil-works/pi-coding-agent";
import { stripTerminalSequences } from "@earendil-works/pi-tui";

export type CopyPayload = {
  label: "Copy command" | "Copy output" | "Copy diff" | "Copy response";
  text: string;
  partial?: boolean;
};

type CopyResult = Pick<AgentToolResult<unknown>, "content" | "structuredContent"> & {
  details?: unknown;
  isError: boolean;
};

type CopyOutputSource = {
  kind: string;
  status: string;
  changes?: { added: number; removed: number };
  body: {
    result: CopyResult | undefined;
    name?: string;
    copyContent?: CopyResult["content"];
    copyOmitted?: boolean;
    availability?: "omitted";
  };
};

function argumentsOf(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function commandPayload(command: unknown): CopyPayload {
  return {
    label: "Copy command",
    text: typeof command === "string" ? command : "",
  };
}

export function responsePayload(parts: readonly string[]): CopyPayload {
  return { label: "Copy response", text: parts.join("") };
}

export function outputPayload(item: CopyOutputSource): CopyPayload {
  const { result, availability } = item.body;
  const normalized =
    item.body.name === "bash" && result && item.body.copyContent === undefined
      ? bashCopy(result)
      : {};
  const copyContent = item.body.copyContent ?? normalized.copyContent;
  const copyOmitted = item.body.copyOmitted ?? normalized.copyOmitted;
  const output = stripTerminalSequences(
    (copyContent ?? result?.content ?? [])
      .flatMap((part) => (part.type === "text" ? [part.text] : []))
      .join("\n"),
  );
  const details = argumentsOf(result?.details);
  const raw = [details["patch"], details["diff"]].find(
    (value): value is string => typeof value === "string" && value.length > 0,
  );
  const lines = output.split(/\r?\n/).filter(Boolean);
  const hasChanges =
    (lines.some((line) => line.startsWith("+")) && lines.some((line) => line.startsWith("-"))) ||
    (((item.status === "completed" && item.changes) ||
      lines.some((line) => /^@@ -\d+(?:,\d+)? \+\d+(?:,\d+)? @@/.test(line))) &&
      lines.some((line) => /^[+-]/.test(line)));
  const diff =
    item.kind === "edit" &&
    (raw ||
      (hasChanges &&
      lines.every(
        (line) =>
          /^[ +\-@]/.test(line) ||
          line === "\\ No newline at end of file" ||
          /^(?:diff --git |index )/.test(line),
      )
        ? output
        : undefined));
  return {
    label: diff ? "Copy diff" : "Copy output",
    text: diff || output,
    partial:
      availability === "omitted" ||
      (copyOmitted ?? argumentsOf(details["truncation"])["truncated"] === true),
  };
}

export function bashCopy(
  result: CopyResult,
): Pick<CopyOutputSource["body"], "copyContent" | "copyOmitted"> {
  const part = result.content.length === 1 ? result.content[0] : undefined;
  if (part?.type !== "text") return {};
  const details = argumentsOf(result.details);
  const truncation = argumentsOf(details["truncation"]);
  const tail = truncation["content"];
  const path = details["fullOutputPath"];
  let text = part.text;
  let normalized = false;
  let partial = false;
  let retainedTail: string | undefined;
  if (
    truncation["truncated"] === true &&
    typeof tail === "string" &&
    typeof path === "string" &&
    text.startsWith(`${tail}\n\n[Showing `)
  ) {
    const ending = `. Full output: ${path}]`;
    const end = text.indexOf(ending, tail.length);
    // The retained tail and native path prove this appended notice's ownership.
    if (end >= 0 && !text.slice(tail.length + 2, end).includes("\n")) {
      text = tail + text.slice(end + ending.length);
      retainedTail = tail;
      normalized = true;
      partial = true;
    }
  }
  const structured = argumentsOf(result.structuredContent);
  const output = structured["output"];
  const code = structured["exit_code"];
  if (typeof output === "string" && typeof code === "number" && result.isError === (code !== 0)) {
    let retained = structured["truncated"] === false ? output : undefined;
    const totalBytes = truncation["totalBytes"];
    if (
      structured["truncated"] === true &&
      structured["full_output_path"] === path &&
      typeof totalBytes === "number"
    ) {
      for (const match of output.matchAll(/\n\n\[\.\.\. (\d+) bytes omitted \.\.\.\]\n\n/g)) {
        const before = output.slice(0, match.index);
        const after = output.slice(match.index + match[0].length);
        const headBytes = Buffer.byteLength(before);
        const tailBytes = Buffer.byteLength(after);
        const missing = totalBytes - headBytes - tailBytes - Number(match[1]);
        // Native structured output retains equal-sized head/tail byte windows,
        // minus up to three bytes each to preserve UTF-8 character boundaries.
        if (Math.abs(headBytes - tailBytes) <= 3 && missing >= 0 && missing <= 6) {
          retained = before + after;
          break;
        }
      }
    }
    const failure = code ? `\n\nCommand exited with code ${code}` : "";
    if (
      retained !== undefined &&
      text === (retainedTail ?? (output || "(no output)")) + failure &&
      (retainedTail === undefined ||
        output.endsWith(retainedTail) ||
        output.endsWith(`${retainedTail}\n`))
    ) {
      text = retained + (retained ? failure : failure.slice(2));
      normalized = true;
      partial = structured["truncated"] === true;
    }
  }
  return normalized ? { copyContent: [{ type: "text", text }], copyOmitted: partial } : {};
}
