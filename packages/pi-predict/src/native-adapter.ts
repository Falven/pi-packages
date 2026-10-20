import type { Message } from "@earendil-works/pi-ai";
import {
  InteractiveMode,
  type AgentSession,
  type ExtensionContext,
  type ExtensionUIContext,
} from "@earendil-works/pi-coding-agent";
import {
  CURSOR_MARKER,
  compositeTuiLine,
  isKeyRelease,
  matchesKey,
  stripTerminalSequences,
  truncateToWidth,
  visibleWidth,
  type EditorComponent,
  type TUI,
} from "@earendil-works/pi-tui";

type Composer = EditorComponent & {
  focused?: boolean;
  getPaddingX?(): number;
  isShowingAutocomplete?(): boolean;
};
type NativeHost = {
  editor: Composer;
  ui: TUI;
  session: AgentSession;
  sessionManager: ExtensionContext["sessionManager"];
  setCustomEditorComponent: ExtensionUIContext["setEditorComponent"];
};

function replace<T extends object, K extends keyof T>(target: T, key: K, value: T[K]): () => void {
  const prior = Object.getOwnPropertyDescriptor(target, key);
  target[key] = value;
  return () => {
    if (target[key] !== value) return;
    if (prior) Object.defineProperty(target, key, prior);
    else Reflect.deleteProperty(target, key);
  };
}

function captureHost(ctx: ExtensionContext): NativeHost {
  const prior = Object.getOwnPropertyDescriptor(InteractiveMode.prototype, "setExtensionWidget");
  if (!prior || typeof prior.value !== "function")
    throw new Error("pi-predict cannot observe Pi's widget host.");
  let host: NativeHost | undefined;
  Object.defineProperty(InteractiveMode.prototype, "setExtensionWidget", {
    ...prior,
    value: function (this: NativeHost, ...args: unknown[]) {
      // oxlint-disable-next-line typescript/no-this-alias -- Observe the native receiver without changing widget behavior.
      host = this;
      return prior.value.apply(this, args);
    },
  });
  try {
    ctx.ui.setWidget("pi-predict.host", undefined);
  } finally {
    Object.defineProperty(InteractiveMode.prototype, "setExtensionWidget", prior);
  }
  if (
    !host ||
    host.sessionManager !== ctx.sessionManager ||
    typeof host.setCustomEditorComponent !== "function" ||
    typeof host.ui?.requestRender !== "function" ||
    typeof host.session?.agent?.streamFunction !== "function" ||
    typeof host.session?.agent?.convertToLlm !== "function"
  )
    throw new Error("pi-predict cannot attach to this Pi host.");
  return host;
}

export class PredictionAdapter {
  private readonly ctx: ExtensionContext;
  private readonly host: NativeHost;
  private readonly restore: (() => void)[] = [];
  private restoreEditor: (() => void) | undefined;
  private lastRequest: { leafId: string | null; messages: Message[] } | undefined;
  private active = true;
  private text: string | undefined;
  private painted: { editor: Composer; text: string } | undefined;
  private readonly warned = new WeakSet<Composer>();
  private prompts = 0;

  constructor(ctx: ExtensionContext) {
    this.ctx = ctx;
    this.host = captureHost(ctx);
    const agent = this.host.session.agent;
    const stream = agent.streamFunction;
    try {
      this.restore.push(
        replace(agent, "streamFunction", (model, context, options) => {
          // Pi clears temporary system-prompt overrides before agent_settled.
          if (this.active)
            this.lastRequest = {
              leafId: ctx.sessionManager.getLeafId(),
              messages: context.messages.slice(),
            };
          return stream.call(agent, model, context, options);
        }),
      );
      const original = this.host.setCustomEditorComponent;
      this.restore.push(
        replace(this.host, "setCustomEditorComponent", (factory) => {
          original.call(this.host, factory);
          if (this.active) this.attach();
        }),
      );
      this.attach();
    } catch (error) {
      this.dispose();
      throw error;
    }
  }

  async prepare(signal: AbortSignal) {
    const agent = this.host.session.agent;
    const projection = this.ctx.sessionManager.buildSessionProjection();
    const previous = this.lastRequest;
    const boundary = previous
      ? projection.entries.findIndex((entry) => entry.sourceEntry.id === previous.leafId)
      : -1;
    if (previous && boundary >= 0) {
      const tail = projection.entries.slice(boundary + 1).flatMap((entry) => entry.messages);
      signal.throwIfAborted();
      return agent.convertToLlm(structuredClone([...previous.messages, ...tail]));
    }
    const snapshot = structuredClone(projection.messages);
    const transformed = agent.transformContext
      ? await agent.transformContext(snapshot, signal)
      : snapshot;
    signal.throwIfAborted();
    return agent.convertToLlm(transformed);
  }

  resetContext() {
    this.lastRequest = undefined;
  }

  setSuggestion(text: string | undefined) {
    this.text = text;
    this.painted = undefined;
    this.host.ui.requestRender();
  }

  prompt(open: boolean) {
    this.prompts = Math.max(0, this.prompts + (open ? 1 : -1));
    this.painted = undefined;
    this.host.ui.requestRender();
  }

  get ready(): boolean {
    const editor = this.host.editor;
    return (
      this.active &&
      this.prompts === 0 &&
      editor.focused === true &&
      !editor.isShowingAutocomplete?.() &&
      this.ctx.ui.getEditorText() === "" &&
      this.ctx.isIdle() &&
      !this.ctx.hasPendingMessages()
    );
  }

  input(data: string): boolean {
    if (isKeyRelease(data) || !this.ready) return false;
    const painted = this.painted;
    if (!painted || painted.editor !== this.host.editor || painted.text !== this.text) return false;
    if (matchesKey(data, "escape")) {
      this.setSuggestion(undefined);
      return true;
    }
    if (!matchesKey(data, "tab") || !painted.editor.insertTextAtCursor) return false;
    this.setSuggestion(undefined);
    painted.editor.insertTextAtCursor(painted.text);
    this.host.ui.requestRender();
    return true;
  }

  private warn(
    editor: Composer,
    reason = "needs a focused composer with Pi's cursor marker and insertTextAtCursor(). This composer cannot display suggestions.",
  ) {
    if (this.warned.has(editor)) return;
    this.warned.add(editor);
    queueMicrotask(() => {
      if (this.active) this.ctx.ui.notify(`pi-predict ${reason}`, "warning");
    });
  }

  private attach() {
    this.restoreEditor?.();
    this.restoreEditor = undefined;
    this.painted = undefined;
    const editor = this.host.editor;
    if (typeof editor.focused !== "boolean" || !editor.insertTextAtCursor) this.warn(editor);
    const render = editor.render;
    let attached = true;
    const decorate = (width: number) => {
      const lines = render.call(editor, width);
      if (!attached) return lines;
      this.painted = undefined;
      if (!this.active || this.host.editor !== editor || !this.text) return lines;
      if (typeof editor.focused !== "boolean" || !editor.insertTextAtCursor) {
        this.warn(editor);
        return lines;
      }
      if (!this.ready) return lines;
      const row = lines.findIndex((line) => line.includes(CURSOR_MARKER));
      const line = lines[row];
      if (line === undefined) {
        this.warn(editor);
        return lines;
      }
      const marker = line.indexOf(CURSOR_MARKER);
      const rest = line.slice(marker + CURSOR_MARKER.length);
      if (stripTerminalSequences(rest).trim() !== "") return lines;
      const start = visibleWidth(line.slice(0, marker)) + 1;
      const available = width - start - (editor.getPaddingX?.() ?? 0);
      if (available < 2) return lines;
      const preview = truncateToWidth(this.text.replace(/\s+/gu, " "), available);
      const decorated = [...lines];
      decorated[row] = compositeTuiLine(
        line,
        this.ctx.ui.theme.fg("dim", preview),
        start,
        available,
        width,
      );
      this.painted = { editor, text: this.text };
      return decorated;
    };
    try {
      const undo = replace(editor, "render", decorate);
      this.restoreEditor = () => {
        // Another extension may still forward through this wrapper after detachment.
        attached = false;
        undo();
      };
    } catch (error) {
      this.warn(editor, `cannot decorate this composer's render(): ${String(error)}`);
    }
    this.host.ui.requestRender();
  }

  dispose() {
    this.active = false;
    this.text = undefined;
    this.painted = undefined;
    this.restoreEditor?.();
    this.restoreEditor = undefined;
    for (const undo of this.restore.splice(0).toReversed()) undo();
    this.lastRequest = undefined;
    this.host.ui.requestRender();
  }
}
