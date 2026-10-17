import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import type { CustomEditor, ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { Component, Container, EditorComponent, TUI } from "@earendil-works/pi-tui";

type Range = { from: number; to: number };
type Insertion = Range & {
  insert(text: string): (Range & { text: string })[];
};
export type AttachmentDraftSnapshot = {
  identity: object;
  text: string;
  range: Range;
};
export type AttachmentSubmission = AttachmentDraftSnapshot & {
  sessionId: string;
  sessionFile?: string;
  cwd: string;
  streamingBehavior?: "steer" | "followUp";
};
export type AttachmentEditorEdit = {
  snapshot(): Insertion | undefined;
  cancel(): void;
  replace(text: string): boolean;
};
export type AttachmentEditorAccess = {
  snapshot(): AttachmentDraftSnapshot;
  captureEdit(from: number, to: number): AttachmentEditorEdit;
  mutate<T>(change: () => T): T;
};
type Handlers = {
  attach(
    editor: EditorComponent,
    access: AttachmentEditorAccess,
    ctx: ExtensionContext,
    tui: TUI,
  ): void | (() => void);
  change(
    access: AttachmentEditorAccess,
    ctx: ExtensionContext,
    origin?: string,
    replaced?: boolean,
  ): void;
  prepare(request: AttachmentSubmission, ctx: ExtensionContext): Promise<string>;
  hasPending(identity: object): boolean;
};
type PromptEditor = EditorComponent & {
  getExpandedText(): string;
  actionHandlers: CustomEditor["actionHandlers"];
};
type ComposerEditor = PromptEditor & {
  getEditorTextIdentity(): object;
  getEditorSelection(): Range;
  captureEditorEdit(from: number, to: number): { cancel(): void; replace(text: string): boolean };
  captureInsertion(from: number, to: number): Insertion["insert"];
  submitDraft(): void;
  onDraftChange: ((text: string, origin?: string) => void) | undefined;
};
type NativeState = {
  lines: string[];
  cursorLine: number;
  cursorCol: number;
  piAttachmentsDraftId?: string;
};
type NativeEditor = PromptEditor & {
  state: NativeState;
  pastes: Map<number, string>;
  undoStack: {
    stack: { state: NativeState }[];
    pop(): { state: NativeState } | undefined;
  };
  historyIndex: number;
  historyDraft: NativeState | null;
  lastAction: unknown;
  undo(): void;
  navigateHistory(direction: number): void;
  submitValue(): void;
  expandPasteMarkers(text: string): string;
  normalizeText(text: string): string;
  cancelAutocomplete(): void;
  exitHistoryBrowsing(): void;
  pushUndoSnapshot(): void;
  setCursorCol(column: number): void;
};
type NativePiece = {
  text: string;
  rawStart: number;
  expandedStart: number;
  marker?: string;
  pasteId?: number;
};
type PendingEdit = Range & {
  expected: string;
  pasteIds?: number[];
  operation?: { cancel(): void; replace(text: string): boolean };
};

function isPromptEditor(component: Component): component is PromptEditor {
  return (
    typeof Reflect.get(component, "getText") === "function" &&
    typeof Reflect.get(component, "insertTextAtCursor") === "function" &&
    typeof Reflect.get(component, "getExpandedText") === "function" &&
    typeof Reflect.get(component, "onSubmit") === "function" &&
    Reflect.get(component, "actionHandlers") instanceof Map &&
    Reflect.get(component, "actionHandlers").has("app.message.followUp")
  );
}

function findEditorParent(
  component: Component,
): { editor: PromptEditor; parent: Container } | undefined {
  const children = Reflect.get(component, "children") as Component[] | undefined;
  for (const child of children ?? []) {
    if (isPromptEditor(child)) return { editor: child, parent: component as Container };
    const found = findEditorParent(child);
    if (found) return found;
  }
  return undefined;
}

function movedRange(before: string, after: string, range: Range): Range | undefined {
  if (before === after) return { ...range };
  let from = 0;
  while (from < before.length && from < after.length && before[from] === after[from]) from++;
  let oldEnd = before.length;
  let newEnd = after.length;
  while (oldEnd > from && newEnd > from && before[oldEnd - 1] === after[newEnd - 1]) {
    oldEnd--;
    newEnd--;
  }
  let suffix = 0;
  while (
    suffix < before.length &&
    suffix < after.length &&
    before[before.length - suffix - 1] === after[after.length - suffix - 1]
  )
    suffix++;
  const leftFrom = Math.min(before.length, after.length) - suffix;
  if (leftFrom < from && leftFrom < range.to && oldEnd >= range.from) return undefined;
  if (range.from >= oldEnd)
    return {
      from: range.from + newEnd - oldEnd,
      to: range.to + newEnd - oldEnd,
    };
  if (range.to <= from) return { ...range };
  return undefined;
}

function nativePieces(editor: NativeEditor): NativePiece[] {
  const raw = editor.getText();
  const pieces: NativePiece[] = [];
  let rawStart = 0;
  let expandedStart = 0;
  for (const marker of raw.matchAll(/\[paste #(\d+)( (?:\+\d+ lines|\d+ chars))?\]/g)) {
    const pasteId = Number(marker[1]);
    const paste = editor.pastes.get(pasteId);
    if (paste === undefined) continue;
    const ordinary = raw.slice(rawStart, marker.index);
    pieces.push({ text: ordinary, rawStart, expandedStart });
    expandedStart += ordinary.length;
    pieces.push({
      text: paste,
      marker: marker[0],
      pasteId,
      rawStart: marker.index,
      expandedStart,
    });
    expandedStart += paste.length;
    rawStart = marker.index + marker[0].length;
  }
  pieces.push({ text: raw.slice(rawStart), rawStart, expandedStart });
  return pieces;
}

function nativePasteIds(pieces: NativePiece[], range: Range): number[] {
  return pieces.flatMap((piece) =>
    piece.pasteId !== undefined &&
    range.from < piece.expandedStart + piece.text.length &&
    range.to > piece.expandedStart
      ? [piece.pasteId]
      : [],
  );
}

function unambiguousPieces(editor: NativeEditor): NativePiece[] | undefined {
  const pieces = nativePieces(editor);
  const ids = pieces.flatMap((piece) => (piece.pasteId === undefined ? [] : [piece.pasteId]));
  return new Set(ids).size === ids.length &&
    pieces.map((piece) => piece.text).join("") === editor.getExpandedText()
    ? pieces
    : undefined;
}

function nativeCursor(editor: NativeEditor): number {
  const raw = editor.getText();
  const cursor =
    editor.state.lines
      .slice(0, editor.state.cursorLine)
      .reduce((length, line) => length + line.length + 1, 0) + editor.state.cursorCol;
  const marker = nativePieces(editor).find(
    (piece) =>
      piece.marker && cursor > piece.rawStart && cursor < piece.rawStart + piece.marker.length,
  );
  // The public cursor is in raw display coordinates, which omit collapsed paste contents.
  return editor.expandPasteMarkers(
    raw.slice(0, marker ? marker.rawStart + marker.marker!.length : cursor),
  ).length;
}

function replaceNativeRange(editor: NativeEditor, edit: PendingEdit, replacement: string): boolean {
  const pieces = unambiguousPieces(editor);
  if (!pieces || JSON.stringify(nativePasteIds(pieces, edit)) !== JSON.stringify(edit.pasteIds))
    return false;
  const cursor = nativeCursor(editor);
  const nextExpandedCursor =
    cursor < edit.from || (cursor === edit.from && edit.from !== edit.to)
      ? cursor
      : cursor >= edit.to
        ? cursor + replacement.length - (edit.to - edit.from)
        : edit.from + replacement.length;
  let inserted = false;
  for (const piece of pieces) {
    const end = piece.expandedStart + piece.text.length;
    if (
      edit.from === edit.to &&
      !inserted &&
      edit.from >= piece.expandedStart &&
      edit.from <= end &&
      (!piece.marker || edit.from < end)
    ) {
      const at = edit.from - piece.expandedStart;
      piece.text = piece.text.slice(0, at) + replacement + piece.text.slice(at);
      inserted = true;
      continue;
    }
    if (edit.from >= end || edit.to <= piece.expandedStart) continue;
    const from = Math.max(0, edit.from - piece.expandedStart);
    const to = Math.min(piece.text.length, edit.to - piece.expandedStart);
    piece.text = piece.text.slice(0, from) + (inserted ? "" : replacement) + piece.text.slice(to);
    inserted = true;
  }
  if (!inserted) return false;
  let raw = "";
  let expanded = 0;
  let nextCursor: number | undefined;
  const pastes = new Map(editor.pastes);
  for (const piece of pieces) {
    if (piece.marker && !piece.text) continue;
    const part = piece.marker ?? piece.text;
    if (nextCursor === undefined && nextExpandedCursor <= expanded + piece.text.length) {
      nextCursor =
        raw.length +
        (piece.marker
          ? nextExpandedCursor === expanded
            ? 0
            : part.length
          : nextExpandedCursor - expanded);
    }
    if (piece.pasteId !== undefined) pastes.set(piece.pasteId, piece.text);
    raw += part;
    expanded += piece.text.length;
  }
  // Public insertion cannot replace a range while retaining native paste storage and undo.
  editor.cancelAutocomplete();
  editor.lastAction = null;
  editor.exitHistoryBrowsing();
  editor.pushUndoSnapshot();
  editor.state.lines = raw.split("\n");
  editor.pastes = pastes;
  const prefix = raw.slice(0, nextCursor).split("\n");
  editor.state.cursorLine = prefix.length - 1;
  editor.setCursorCol(prefix.at(-1)!.length);
  editor.onChange?.(editor.getText());
  return true;
}

export function registerEditor(pi: ExtensionAPI, signal: AbortSignal, handlers: Handlers): void {
  let dispose: (() => void) | undefined;
  const originals = new WeakMap<object, unknown>();
  const nativeIdentities = new WeakMap<NativeEditor, Map<string, object>>();
  const unwrap = <T>(value: T): T =>
    typeof value === "function" ? ((originals.get(value) as T | undefined) ?? value) : value;
  signal.addEventListener("abort", () => dispose?.(), { once: true });
  pi.on("session_shutdown", () => dispose?.());
  pi.on("session_start", (_event, ctx) => {
    dispose?.();
    if (ctx.mode !== "tui" || signal.aborted) return;
    ctx.ui.setWidget("attachment-editor", (tui) => {
      let selected: PromptEditor | undefined;
      let installed: ReturnType<typeof install> | undefined;
      let parent: Container | undefined;
      let detachParent: (() => void) | undefined;
      let ended = false;
      let scheduled = false;
      let customPrompt:
        | {
            editor: PromptEditor;
            state: ReturnType<ReturnType<typeof install>["prompt"]>;
          }
        | undefined;

      function install(editor: PromptEditor) {
        const dispatch = new AsyncLocalStorage<{
          preserve: boolean;
          text: string;
          readOnce: boolean;
        }>();
        const restorations: (() => void)[] = [];
        let stopped = false;
        let applying = false;
        let replaced = false;
        let restoring = false;
        let revision = 0;
        let observed = editor.getExpandedText();
        let returnedPrompt:
          | { snapshot: AttachmentDraftSnapshot; raw: string; revision: number }
          | undefined;
        let restoredIdentity: object | undefined;
        const aliases = new WeakMap<object, object>();
        const submissions = new Map<string, Promise<void>>();
        const idleWaits = new Set<() => void>();
        const pendingEdits = new Set<PendingEdit>();
        const composer =
          typeof Reflect.get(editor, "submitDraft") === "function"
            ? (editor as ComposerEditor)
            : undefined;
        const native = composer ? undefined : (editor as NativeEditor);
        const identities = native
          ? (nativeIdentities.get(native) ?? new Map<string, object>())
          : undefined;
        if (native) nativeIdentities.set(native, identities!);
        const originalChange = unwrap(editor.onChange);
        const originalDraftChange = composer ? unwrap(composer.onDraftChange) : undefined;
        const originalSetText = unwrap(editor.setText);
        const originalSubmit = unwrap(editor.onSubmit);
        const originalExpandedText = unwrap(editor.getExpandedText);
        const originalFollowUp = unwrap(editor.actionHandlers.get("app.message.followUp"))!;
        const submitName = composer ? "submitDraft" : "submitValue";
        const originalSubmitValue = unwrap(Reflect.get(editor, submitName)) as () => void;
        if (typeof originalSubmitValue !== "function")
          throw new Error("The selected editor cannot delay attachment submission before clearing");

        function wrap(target: object, name: PropertyKey, value: object) {
          const descriptor = Object.getOwnPropertyDescriptor(target, name);
          if (descriptor && "value" in descriptor && typeof descriptor.value === "function")
            descriptor.value = unwrap(descriptor.value);
          originals.set(value, unwrap(Reflect.get(target, name)));
          Object.defineProperty(target, name, {
            value,
            writable: true,
            configurable: true,
          });
          restorations.push(() => {
            if (Reflect.get(target, name) !== value) return;
            if (descriptor) Object.defineProperty(target, name, descriptor);
            else Reflect.deleteProperty(target, name);
          });
        }
        function identity(): object {
          if (composer) {
            const token = composer.getEditorTextIdentity();
            return aliases.get(token) ?? token;
          }
          const token = (native!.state.piAttachmentsDraftId ??= randomUUID());
          let value = identities!.get(token);
          if (!value) identities!.set(token, (value = {}));
          return value;
        }

        function pruneIdentities() {
          if (!native) return;
          // Public callbacks do not reveal which drafts native undo/history still own.
          const retained = new Set(
            native.undoStack.stack.map(({ state }) => state.piAttachmentsDraftId),
          );
          retained.add(native.state.piAttachmentsDraftId);
          retained.add(native.historyDraft?.piAttachmentsDraftId);
          for (const token of identities!.keys())
            if (!retained.has(token)) identities!.delete(token);
        }

        if (native) {
          // Cloneable metadata follows the editor's existing undo and prompt-history snapshots.
          identity();
          pruneIdentities();
          const pop = unwrap(native.undoStack.pop);
          wrap(native.undoStack, "pop", function (this: NativeEditor["undoStack"]) {
            const snapshot = pop.call(this);
            if (snapshot) snapshot.state.piAttachmentsDraftId ??= randomUUID();
            return snapshot;
          });
          const undo = unwrap(native.undo);
          wrap(native, "undo", function () {
            restoring = true;
            try {
              return undo.call(native);
            } finally {
              restoring = false;
            }
          });
          const navigate = unwrap(native.navigateHistory);
          wrap(native, "navigateHistory", function (direction: number) {
            restoring = native.historyIndex - direction === -1;
            replaced = !restoring;
            try {
              return navigate.call(native, direction);
            } finally {
              restoring = false;
              replaced = false;
            }
          });
        }

        const access: AttachmentEditorAccess = {
          snapshot() {
            const cursor = native ? nativeCursor(native) : undefined;
            return {
              identity: identity(),
              text: originalExpandedText.call(editor),
              range: composer ? composer.getEditorSelection() : { from: cursor!, to: cursor! },
            };
          },
          captureEdit(from, to) {
            const text = originalExpandedText.call(editor);
            if (
              !Number.isInteger(from) ||
              !Number.isInteger(to) ||
              from < 0 ||
              to < from ||
              to > text.length
            )
              throw new RangeError("Invalid attachment edit range");
            const edit: PendingEdit = {
              from,
              to,
              expected: text.slice(from, to),
            };
            if (composer) edit.operation = composer.captureEditorEdit(from, to);
            else {
              const pieces = unambiguousPieces(native!);
              if (!pieces)
                return {
                  snapshot: () => undefined,
                  cancel() {},
                  replace: () => false,
                };
              edit.pasteIds = nativePasteIds(pieces, edit);
            }
            pendingEdits.add(edit);
            return {
              cancel() {
                pendingEdits.delete(edit);
                edit.operation?.cancel();
              },
              snapshot() {
                if (stopped || !pendingEdits.has(edit)) return undefined;
                const { from: start, to: end } = edit;
                return {
                  from: start,
                  to: end,
                  insert: composer
                    ? composer.captureInsertion(start, end)
                    : (replacement) =>
                        replacement
                          ? [
                              {
                                from: start,
                                to: end,
                                // Public insertion normalizes text but would mutate the live draft.
                                text: native!.normalizeText(replacement),
                              },
                            ]
                          : [],
                };
              },
              replace(replacement) {
                if (
                  !pendingEdits.delete(edit) ||
                  stopped ||
                  originalExpandedText.call(editor).slice(edit.from, edit.to) !== edit.expected
                )
                  return false;
                return access.mutate(() => {
                  const didChange = edit.operation
                    ? edit.operation.replace(replacement)
                    : replaceNativeRange(native!, edit, replacement);
                  if (didChange) tui.requestRender();
                  return didChange;
                });
              },
            };
          },
          mutate(change) {
            const previous = applying;
            applying = true;
            try {
              return change();
            } finally {
              applying = previous;
            }
          },
        };

        function changed(origin = "edit") {
          if (stopped) return;
          if (!applying) revision++;
          if (native && !restoring) {
            native.state.piAttachmentsDraftId = randomUUID();
            if (restoredIdentity)
              identities!.set(native.state.piAttachmentsDraftId, restoredIdentity);
          } else if (composer && restoredIdentity)
            aliases.set(composer.getEditorTextIdentity(), restoredIdentity);
          const text = originalExpandedText.call(editor);
          for (const edit of pendingEdits) {
            const moved =
              !replaced &&
              !restoring &&
              origin !== "undo" &&
              origin !== "redo" &&
              movedRange(observed, text, edit);
            if (moved) Object.assign(edit, moved);
            else {
              pendingEdits.delete(edit);
              edit.operation?.cancel();
            }
          }
          observed = text;
          handlers.change(
            access,
            ctx,
            restoredIdentity ? "restore" : restoring ? "undo" : origin,
            replaced,
          );
          pruneIdentities();
        }
        if (composer) {
          wrap(composer, "onDraftChange", function (_text: string, origin?: string) {
            changed(origin);
            originalDraftChange?.call(composer, originalExpandedText.call(editor), origin);
          });
        } else {
          wrap(editor, "onChange", function (text: string) {
            changed();
            originalChange?.call(editor, text);
          });
        }
        wrap(editor, "setText", function (text: string) {
          if (dispatch.getStore()?.preserve && text === "") return;
          const prompt = returnedPrompt;
          returnedPrompt = undefined;
          if (prompt && text === prompt.raw) {
            // Native custom dialogs restore their saved text in this same reinsertion stack.
            if (revision === prompt.revision) return;
            restoredIdentity = prompt.snapshot.identity;
            try {
              originalSetText.call(editor, text);
            } finally {
              restoredIdentity = undefined;
            }
            return;
          }
          replaced = true;
          try {
            originalSetText.call(editor, text);
          } finally {
            replaced = false;
          }
        });
        wrap(editor, "getExpandedText", function () {
          const request = dispatch.getStore();
          if (request?.readOnce) {
            request.readOnce = false;
            return request.text;
          }
          return originalExpandedText.call(editor);
        });

        function submit(followUp = false) {
          const snapshot = access.snapshot();
          if (!snapshot.text.trim() && !handlers.hasPending(snapshot.identity)) return;
          if (snapshot.text.trim() === "/reload" && (!followUp || ctx.isIdle()))
            return followUp ? originalFollowUp() : originalSubmitValue.call(editor);
          const requestedRevision = revision;
          const route = ctx.isIdle() ? "normal" : followUp ? "followUp" : "steer";
          if (!handlers.hasPending(snapshot.identity) && !submissions.has(route))
            return followUp ? originalFollowUp() : originalSubmitValue.call(editor);
          const sessionFile = ctx.sessionManager.getSessionFile();
          const request: AttachmentSubmission = {
            ...snapshot,
            sessionId: ctx.sessionManager.getSessionId(),
            ...(sessionFile ? { sessionFile } : {}),
            cwd: ctx.cwd,
            ...(route === "normal" ? {} : { streamingBehavior: route }),
          };
          let preparation: Promise<string>;
          try {
            preparation = handlers.prepare(request, ctx);
          } catch (error) {
            preparation = Promise.reject(error);
          }
          // Claim pending insertions at Send and observe failure while an earlier request still waits.
          const prepared = preparation.then(
            (text) => ({ text }),
            (error: unknown) => ({ error }),
          );
          ctx.ui.setStatus("attachment-send", "Preparing attachments…");
          const submitted = (submissions.get(route) ?? Promise.resolve()).then(async () => {
            try {
              const result = await prepared;
              if ("error" in result) throw result.error;
              const text = result.text;
              if (
                stopped ||
                signal.aborted ||
                ctx.sessionManager.getSessionId() !== request.sessionId
              )
                return;
              if (route === "normal") {
                while (!ctx.isIdle()) {
                  if (stopped) break;
                  ctx.ui.setStatus("attachment-send", "Waiting for Pi to finish…");
                  // eslint-disable-next-line no-await-in-loop -- Recheck public idle state after a lifecycle wake or manual compaction.
                  await new Promise<void>((resolve) => {
                    const finish = () => {
                      clearTimeout(timer);
                      unsubscribe();
                      idleWaits.delete(finish);
                      resolve();
                    };
                    const unsubscribe = pi.on("agent_settled", finish);
                    const timer = setTimeout(finish, 50);
                    idleWaits.add(finish);
                  });
                }
              }
              if (
                stopped ||
                signal.aborted ||
                ctx.sessionManager.getSessionId() !== request.sessionId
              )
                return;
              const preserve = revision !== requestedRevision;
              if (!preserve && !followUp) {
                delete editor.onSubmit;
                try {
                  originalSubmitValue.call(editor);
                } finally {
                  if (originalSubmit) editor.onSubmit = originalSubmit;
                }
              }
              await dispatch.run({ preserve, text, readOnce: followUp }, () =>
                followUp ? originalFollowUp() : originalSubmit?.call(editor, text),
              );
            } catch (error) {
              if (!stopped && !signal.aborted)
                ctx.ui.notify(`Attachment request not sent: ${String(error)}`, "error");
            } finally {
              if (!stopped) ctx.ui.setStatus("attachment-send", undefined);
              if (submissions.get(route) === submitted) submissions.delete(route);
            }
          });
          submissions.set(route, submitted);
        }
        wrap(editor, submitName, () => submit());
        const followUp = () => submit(true);
        originals.set(followUp, originalFollowUp);
        editor.actionHandlers.set("app.message.followUp", followUp);
        restorations.push(() => {
          if (editor.actionHandlers.get("app.message.followUp") === followUp)
            editor.actionHandlers.set("app.message.followUp", originalFollowUp);
        });
        const detach = handlers.attach(editor, access, ctx, tui);
        if (detach) restorations.push(detach);
        // Native dialog restoration may still copy its saved text in this stack.
        queueMicrotask(() => {
          if (!stopped) handlers.change(access, ctx);
        });
        const change = editor.onChange;
        const draftChange = composer?.onDraftChange;
        const submitValue = Reflect.get(editor, submitName);
        return {
          attached: () =>
            editor.onChange === change &&
            composer?.onDraftChange === draftChange &&
            Reflect.get(editor, submitName) === submitValue &&
            editor.actionHandlers.get("app.message.followUp") === followUp &&
            editor.onSubmit === originalSubmit,
          prompt: () => ({
            snapshot: access.snapshot(),
            raw: editor.getText(),
            revision,
          }),
          reinsert(prompt: { snapshot: AttachmentDraftSnapshot; raw: string; revision: number }) {
            returnedPrompt = prompt;
            queueMicrotask(() => {
              returnedPrompt = undefined;
            });
          },
          dispose() {
            stopped = true;
            if (signal.aborted) identities?.clear();
            else pruneIdentities();
            for (const edit of pendingEdits) edit.operation?.cancel();
            pendingEdits.clear();
            for (const finish of idleWaits) finish();
            for (const restore of restorations.toReversed()) restore();
            ctx.ui.setStatus("attachment-send", undefined);
          },
        };
      }

      function attach(editor: PromptEditor) {
        if (ended || (selected === editor && installed?.attached())) return;
        installed?.dispose();
        selected = editor;
        installed = install(editor);
      }
      function discover() {
        if (ended) return;
        const found = findEditorParent(tui);
        if (!found) return;
        if (parent !== found.parent) {
          detachParent?.();
          parent = found.parent;
          const original = parent.addChild;
          const descriptor = Object.getOwnPropertyDescriptor(parent, "addChild");
          const observed = parent;
          const addChild = function (this: Container, component: Component) {
            const result = original.call(this, component);
            if (isPromptEditor(component)) {
              if (
                customPrompt?.editor === component &&
                selected === component &&
                installed?.attached()
              )
                installed.reinsert(customPrompt.state);
              // Wiring is complete here; input may follow setEditorComponent synchronously.
              if (!ended && observed.children.includes(component)) attach(component);
            }
            return result;
          };
          parent.addChild = addChild;
          detachParent = () => {
            if (observed.addChild !== addChild) return;
            if (descriptor) Object.defineProperty(observed, "addChild", descriptor);
            else Reflect.deleteProperty(observed, "addChild");
          };
        }
        attach(found.editor);
      }
      const stopPromptStart = pi.on("ui_prompt_start", (event) => {
        if (event.kind === "custom" && selected && installed)
          customPrompt = { editor: selected, state: installed.prompt() };
      });
      const stopPromptEnd = pi.on("ui_prompt_end", () => {
        customPrompt = undefined;
        discover();
      });
      const cleanup = () => {
        if (ended) return;
        ended = true;
        stopPromptEnd();
        stopPromptStart();
        detachParent?.();
        installed?.dispose();
      };
      dispose = cleanup;
      discover();
      return {
        render() {
          if (!selected && !scheduled && !ended) {
            scheduled = true;
            queueMicrotask(() => {
              scheduled = false;
              discover();
            });
          }
          return [];
        },
        invalidate() {},
        dispose: cleanup,
      };
    });
  });
}
