import { statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  getNativeClipboard,
  isFocusable,
  matchesKey,
  type EditorComponent,
  type KeybindingsManager,
  type TUI,
  type TuiMouseEvent,
} from "@earendil-works/pi-tui";
import { readRegularFile, type Snapshot } from "./recovery.ts";

export function sourcePath(text: string, cwd: string): string {
  if (!text || /\p{Cc}/u.test(text)) throw new Error("Invalid file path");
  const literal = resolve(cwd, text);
  try {
    if (statSync(literal, { throwIfNoEntry: false })?.isFile()) return literal;
  } catch {
    // A quoted or URL spelling can still resolve after decoding.
  }
  let path = text;
  if (text.startsWith("'") && text.endsWith("'")) {
    path = text.slice(1, -1);
  } else if (text.startsWith('"') && text.endsWith('"')) {
    path = text.slice(1, -1).replace(/\\(["\\$`])/gu, "$1");
  } else {
    path = text.replace(/\\(.)/gu, "$1");
  }
  if (!path || /\p{Cc}/u.test(path)) throw new Error("Invalid file path");
  if (/^file:/iu.test(path)) {
    const url = new URL(path);
    if (url.hostname && url.hostname !== "localhost") throw new Error("Invalid local file URL");
    path = fileURLToPath(url);
  } else if (path.startsWith("~/")) {
    path = resolve(homedir(), path.slice(2));
  }
  return resolve(cwd, path);
}

function content(text: string, cwd: string): string | Snapshot[] | Promise<string | Snapshot[]> {
  const fallback = text.length < 5000 ? text : [{ name: "paste.txt", contents: Buffer.from(text) }];
  if (text && !/\p{Cc}/u.test(text)) {
    try {
      const path = sourcePath(text, cwd);
      // Keep ordinary text insertion synchronous without reading file bytes on the UI thread.
      if (statSync(path).isFile()) {
        return readRegularFile(path).then(
          (contents) => [
            {
              name: basename(path).replaceAll(/[<>[\]\\\p{Cc}]/gu, "_"),
              contents,
            },
          ],
          () => fallback,
        );
      }
    } catch {
      // Unmatched paths follow ordinary text-paste policy.
    }
  }
  return fallback;
}

export function registerPaste(
  attach: (
    ctx: ExtensionContext,
    capture: () => Promise<Snapshot[] | string | undefined>,
    interactive?: boolean,
  ) => Promise<void>,
  signal: AbortSignal,
  changed: () => void,
) {
  return function withPaste(
    editor: EditorComponent,
    ctx: ExtensionContext,
    tui: TUI,
    keybindings: KeybindingsManager,
  ): () => void {
    let pendingPaste: string | undefined;

    function paste(text: string): void {
      const captured = content(text, ctx.cwd);
      if (typeof captured === "string" && editor.insertTextAtCursor) {
        editor.insertTextAtCursor(captured);
      } else {
        void attach(ctx, async () => captured, false);
      }
      if (!signal.aborted) tui.requestRender();
    }

    function clipboardPaste(): Promise<void> {
      const cwd = ctx.cwd;
      // Capture the requesting draft before the first clipboard read.
      return attach(
        ctx,
        async () => {
          const clipboard = getNativeClipboard();
          if (!clipboard) throw new Error("Native clipboard is unavailable");
          const paths = await clipboard.getFilePaths?.();
          if (paths?.length) {
            return paths.map((path) => {
              if (!path || /\p{Cc}/u.test(path))
                throw new Error("Clipboard file path contains control characters");
              const source = resolve(cwd, path);
              return {
                name: basename(source).replaceAll(/[<>[\]\\\p{Cc}]/gu, "_"),
                path: source,
              };
            });
          }
          const image = await clipboard.getImage();
          if (image) {
            return [{ name: "clipboard-image", contents: image, image: true }];
          }
          const text = await clipboard.getText();
          if (text === undefined) throw new Error("Clipboard text is unavailable");
          return text ? content(text, cwd) : undefined;
        },
        false,
      );
    }

    const restorations: (() => void)[] = [];
    function wrap(property: string, value: unknown) {
      const descriptor = Object.getOwnPropertyDescriptor(editor, property);
      Object.defineProperty(editor, property, {
        value,
        configurable: true,
        writable: true,
      });
      restorations.push(() => {
        if (Reflect.get(editor, property, editor) !== value) return;
        if (descriptor) Object.defineProperty(editor, property, descriptor);
        else Reflect.deleteProperty(editor, property);
      });
    }
    const clipboardAction = () => void clipboardPaste();
    const replaceDefaultPaste = Reflect.get(editor, "replaceDefaultPaste", editor);
    if (typeof replaceDefaultPaste === "function") {
      const restore = replaceDefaultPaste.call(editor, clipboardAction);
      if (restore) restorations.push(restore);
    } else if (!ctx.ui.getEditorComponent() || !Reflect.get(editor, "onPasteImage", editor)) {
      wrap("onPasteImage", clipboardAction);
    }

    const mouse = editor.handleMouse;
    wrap("handleMouse", (event: TuiMouseEvent) => {
      if (event.button !== "right" || event.type === "press") changed();
      const result = mouse?.call(editor, event);
      if (result?.handled || result?.capture || result?.focus) return result;
      if (
        event.button === "right" &&
        !event.shift &&
        !event.alt &&
        !event.ctrl &&
        isFocusable(editor) &&
        editor.focused
      ) {
        if (event.type === "click") void clipboardPaste();
        return { handled: true };
      }
      return result;
    });

    const input = editor.handleInput;
    function handleInput(data: string) {
      changed();
      if (pendingPaste !== undefined || data.startsWith("\x1b[200~")) {
        pendingPaste = (pendingPaste ?? "") + (pendingPaste === undefined ? data.slice(6) : data);
        const end = pendingPaste.indexOf("\x1b[201~");
        if (end < 0) return;
        const text = pendingPaste
          .slice(0, end)
          // eslint-disable-next-line no-control-regex -- Native CSI-u paste encoding carries literal control bytes.
          .replace(/\x1b\[(\d+);5u/g, (sequence, code: string) => {
            const point = Number(code);
            return (point >= 65 && point <= 90) || (point >= 97 && point <= 122)
              ? String.fromCharCode(point & 31)
              : sequence;
          });
        const rest = pendingPaste.slice(end + 6);
        pendingPaste = undefined;
        paste(text);
        if (rest) handleInput(rest);
      } else {
        const pasteAction = Reflect.get(editor, "onPasteImage", editor);
        if (
          matchesKey(data, "super+v") &&
          !Object.hasOwn(keybindings.getUserBindings(), "app.clipboard.pasteImage") &&
          typeof pasteAction === "function" &&
          !Object.values(keybindings.getResolvedBindings())
            .flat()
            .some((key) => key && matchesKey(data, key))
        ) {
          const shortcut = Reflect.get(editor, "onExtensionShortcut", editor);
          if (typeof shortcut !== "function" || !shortcut.call(editor, data))
            pasteAction.call(editor);
        } else {
          input.call(editor, data);
        }
      }
    }
    wrap("handleInput", handleInput);
    return () => {
      for (const restore of restorations.toReversed()) restore();
    };
  };
}
