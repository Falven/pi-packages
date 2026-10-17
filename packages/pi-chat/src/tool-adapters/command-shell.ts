// Adapted from OpenAI Codex and Rust shlex; see ../../NOTICE.
import { basename, extname } from "node:path";
import Parser from "tree-sitter";
import Bash from "tree-sitter-bash";

const parser = new Parser();
parser.setLanguage(Bash);
const nodeKinds = new Set([
  "program",
  "list",
  "pipeline",
  "command",
  "command_name",
  "word",
  "string",
  "string_content",
  "raw_string",
  "number",
  "concatenation",
]);
const punctuation = new Set(["&&", "||", ";", "|", '"', "'"]);

export function plainCommands(script: string): string[][] | undefined {
  const root = parser.parse(script).rootNode;
  if (root.hasError) return;
  const stack = [root];
  const commands: Parser.SyntaxNode[] = [];
  while (stack.length) {
    const node = stack.pop()!;
    if (node.isNamed ? !nodeKinds.has(node.type) : !punctuation.has(node.type) && node.type.trim())
      return;
    if (
      (node.type === "word" || node.type === "number") &&
      (node.namedChildCount ||
        node.text.startsWith("=") ||
        Array.from("{}*?[]\\~^#$`").some((char) => node.text.includes(char)))
    )
      return;
    if (node.type === "command") commands.push(node);
    for (const child of node.children) stack.push(child);
  }
  commands.sort((a, b) => a.startIndex - b.startIndex);
  const result: string[][] = [];
  for (const command of commands) {
    const words: string[] = [];
    for (const child of command.namedChildren) {
      switch (child.type) {
        case "command_name": {
          const word = child.namedChildren[0];
          if (word?.type !== "word") return;
          words.push(word.text);
          break;
        }
        case "word":
        case "number":
          words.push(child.text);
          break;
        case "string":
        case "raw_string": {
          const value = quotedWord(child);
          if (value === undefined) return;
          words.push(value);
          break;
        }
        case "concatenation": {
          let value = "";
          for (const part of child.namedChildren) {
            const text =
              part.type === "word" || part.type === "number" ? part.text : quotedWord(part);
            if (text === undefined) return;
            value += text;
          }
          if (!value) return;
          words.push(value);
          break;
        }
        default:
          return;
      }
    }
    result.push(words);
  }
  return result;
}

function quotedWord(node: Parser.SyntaxNode): string | undefined {
  if (node.type !== "string" && node.type !== "raw_string") return;
  const quote = node.type === "string" ? '"' : "'";
  if (!node.text.startsWith(quote) || !node.text.endsWith(quote)) return;
  const value = node.text.slice(1, -1);
  if (
    node.type === "string" &&
    (node.namedChildren.some((part) => part.type !== "string_content") || /\\[$`"\\\n]/.test(value))
  )
    return;
  return value;
}

export function shellType(path: string): string | undefined {
  if (["bash", "zsh", "sh", "pwsh", "powershell", "cmd"].includes(path)) return path;
  const file = basename(path);
  const stem = file.slice(0, file.length - extname(file).length);
  return stem && stem !== path && stem !== "." && stem !== ".." ? shellType(stem) : undefined;
}

export function splitWords(source: string): string[] | undefined {
  const words: string[] = [];
  let index = 0;
  while (index < source.length) {
    while (/[ \t\n]/.test(source[index] ?? "")) index++;
    if (source[index] === "#") {
      while (index < source.length && source[index] !== "\n") index++;
      continue;
    }
    if (index === source.length) break;
    let word = "";
    while (index < source.length) {
      const char = source[index++]!;
      if (/[ \t\n]/.test(char)) break;
      if (char === "\\") {
        const next = source[index++];
        if (next === undefined) return;
        if (next !== "\n") word += next;
      } else if (char === "'" || char === '"') {
        let closed = false;
        while (index < source.length) {
          const next = source[index++]!;
          if (next === char) {
            closed = true;
            break;
          }
          if (char === '"' && next === "\\") {
            const escaped = source[index++];
            if (escaped === undefined) return;
            if (escaped !== "\n") word += '$`"\\'.includes(escaped) ? escaped : `\\${escaped}`;
          } else word += next;
        }
        if (!closed) return;
      } else word += char;
    }
    words.push(word);
  }
  return words;
}

function quoteWord(word: string): string {
  if (!word) return "''";
  const chars = Array.from(word);
  let result = "";
  let start = 0;
  while (start < chars.length) {
    let modes = 7; // unquoted, single quoted, double quoted
    let end = start;
    if (chars[start] === "^") {
      modes = 2;
      end++;
    }
    while (end < chars.length) {
      const char = chars[end]!;
      const allowed =
        (/[A-Za-z0-9]/.test(char) || "+-./:@]_".includes(char) ? 1 : 0) |
        (!"'^\\".includes(char) ? 2 : 0) |
        (!"`$!^".includes(char) ? 4 : 0);
      if (!(modes & allowed)) break;
      modes &= allowed;
      end++;
    }
    const chunk = chars.slice(start, end).join("");
    result +=
      modes & 1 ? chunk : modes & 2 ? `'${chunk}'` : `"${chunk.replace(/[$`"\\]/g, "\\$&")}"`;
    start = end;
  }
  return result;
}

export function joinWords(words: readonly string[]): string {
  return words.some((word) => word.includes("\0"))
    ? "<command included NUL byte>"
    : words.map(quoteWord).join(" ");
}
