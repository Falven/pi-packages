import {
  InteractiveMode,
  UserMessageComponent,
  parseSkillBlock,
  type AgentSession,
  type ExtensionContext,
  type SessionEntry,
} from "@earendil-works/pi-coding-agent";
import { Container, Spacer, type Component } from "@earendil-works/pi-tui";
import { skillPresentation } from "./presentation.ts";
import type { SourcePresentation, SourceRange, SourceSelection } from "./source-presentation.ts";

type NativeHost = {
  sessionManager: unknown;
  session: { extensionRunner?: { getEntryRenderer(name: string): unknown } };
  editor: { addToHistory?(text: string): void };
  chatContainer: Container;
  outputPad: number;
  getMarkdownThemeWithSettings(): ConstructorParameters<typeof UserMessageComponent>[1];
  getMarkdownTransformers(): ConstructorParameters<typeof UserMessageComponent>[3];
  getUserMessageText(message: AgentSession["messages"][number]): string;
  addMessageToChat(
    message: AgentSession["messages"][number],
    options?: { populateHistory?: boolean },
  ): void;
  renderSessionEntries(entries: SessionEntry[], options?: unknown): void;
  showError?(text: string): void;
};

function replace<T extends object, K extends keyof T>(target: T, key: K, value: T[K]) {
  const descriptor = Object.getOwnPropertyDescriptor(target, key);
  Object.defineProperty(target, key, { configurable: true, writable: true, value });
  return () => {
    if (target[key] !== value) return;
    if (descriptor) Object.defineProperty(target, key, descriptor);
    else delete target[key];
  };
}

function contentRange(
  message: AgentSession["messages"][number],
  index: number | undefined,
): SourceRange | undefined {
  if (message.role !== "user" || index === undefined) return undefined;
  if (typeof message.content === "string")
    return index === 0 ? { from: 0, to: message.content.length } : undefined;
  let from = 0;
  for (const [position, part] of message.content.entries()) {
    if (part.type !== "text") continue;
    if (index === position) return { from, to: from + part.text.length };
    from += part.text.length;
  }
  return undefined;
}

type NativeUser = Component & { text: string; rebuild(): void };

export function attachPresentation(
  host: InteractiveMode,
): SourcePresentation & { dispose(): void } {
  const native = host as unknown as NativeHost;
  const original = native.getUserMessageText;
  if (typeof original !== "function")
    throw new Error("pi-skill-references cannot attach: Pi is missing getUserMessageText()");
  const addMessage = native.addMessageToChat;
  if (typeof addMessage !== "function")
    throw new Error("pi-skill-references cannot attach: Pi is missing addMessageToChat()");
  for (const name of ["getMarkdownThemeWithSettings", "getMarkdownTransformers"] as const)
    if (typeof native[name] !== "function")
      throw new Error(`pi-skill-references cannot attach: Pi is missing ${name}()`);
  if (
    !Array.isArray(native.chatContainer?.children) ||
    typeof native.chatContainer.addChild !== "function"
  )
    throw new Error("pi-skill-references cannot attach: Pi is missing chatContainer.addChild()");
  if (typeof (UserMessageComponent.prototype as unknown as NativeUser).rebuild !== "function")
    throw new Error(
      "pi-skill-references cannot attach: Pi is missing UserMessageComponent.rebuild()",
    );
  let active = true;
  const presentations = new WeakMap<object, ReturnType<typeof skillPresentation>>();
  const presentationFor = (message: SourceSelection["message"]) => {
    if (!presentations.has(message))
      presentations.set(message, skillPresentation(original.call(native, message)));
    return presentations.get(message);
  };
  let revealed:
    | {
        message: SourceSelection["message"];
        component: NativeUser;
        block: SourceRange;
        compact: string;
      }
    | undefined;
  const setText = (component: NativeUser, text: string) => {
    component.text = text;
    component.rebuild();
  };
  const select: SourcePresentation["select"] = (selection) => {
    if (!active) return false;
    const field = selection && contentRange(selection.message, selection.contentIndex);
    const text = field && selection ? original.call(native, selection.message) : "";
    const presentation = selection && presentationFor(selection.message);
    const block =
      selection &&
      field &&
      presentation?.blocks.find(
        (range) =>
          field.from + selection.from >= range.from && field.from + selection.to <= range.to,
      );
    const component =
      selection?.component instanceof UserMessageComponent
        ? (selection.component as unknown as NativeUser)
        : undefined;
    if (
      revealed?.component === component &&
      revealed?.message === selection?.message &&
      revealed?.block.from === block?.from
    )
      return false;
    const changed = Boolean(revealed);
    if (revealed) setText(revealed.component, revealed.compact);
    revealed = undefined;
    if (!block || !component || !presentation || !selection) return changed;
    revealed = { message: selection.message, component, block, compact: presentation.compact };
    setText(component, `${text.slice(block.from, block.to)}\n\n${presentation.compact}`);
    return true;
  };
  const rangesFor = (
    message: SourceSelection["message"],
    index: number | undefined,
    visible: boolean,
  ) => {
    if (!active) return undefined;
    const field = contentRange(message, index);
    if (!field) return undefined;
    const presentation = presentationFor(message);
    if (!presentation) return undefined;
    const ranges = [...presentation.references, presentation.request];
    ranges.unshift(
      ...(visible ? (revealed?.message === message ? [revealed.block] : []) : presentation.blocks),
    );
    return ranges.flatMap((range) => {
      const from = Math.max(field.from, range.from);
      const to = Math.min(field.to, range.to);
      if (to <= from || ("text" in range && range.from < field.from)) return [];
      return [{ ...range, from: from - field.from, to: to - field.from }];
    });
  };
  const cleanup: (() => void)[] = [];
  const dispose = () => {
    select(undefined);
    active = false;
    for (const undo of cleanup.splice(0).toReversed()) undo();
  };
  try {
    cleanup.push(
      replace(native, "addMessageToChat", function (this: NativeHost, message, options) {
        if (!active || message.role !== "user") return addMessage.call(this, message, options);
        const text = original.call(this, message);
        const compact = presentationFor(message)?.compact ?? text;
        if (compact === text && !parseSkillBlock(text))
          return addMessage.call(this, message, options);
        // Use Pi's normal user row before its leading-block detector can split it in two.
        if (this.chatContainer.children.length) this.chatContainer.addChild(new Spacer(1));
        this.chatContainer.addChild(
          new UserMessageComponent(
            compact,
            this.getMarkdownThemeWithSettings(),
            this.outputPad,
            this.getMarkdownTransformers(),
          ),
        );
        if (options?.populateHistory) this.editor.addToHistory?.(text);
      }),
    );
    return {
      select,
      searchRanges: (message, index) => rangesFor(message, index, false),
      visibleRanges: (message, index) => rangesFor(message, index, true),
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}

export function armHistoryBootstrap(renderer: unknown, install: (host: InteractiveMode) => void) {
  const prototype = InteractiveMode.prototype as unknown as NativeHost;
  const original = prototype.renderSessionEntries;
  if (typeof original !== "function")
    throw new Error("pi-skill-references cannot observe Pi history construction");
  let active = true;
  const disarm = () => {
    active = false;
    restore();
  };
  const restore = replace(
    prototype,
    "renderSessionEntries",
    function (this: NativeHost, entries, options) {
      if (!active) restore();
      if (
        active &&
        this.session?.extensionRunner?.getEntryRenderer("pi-skill-references.host") === renderer
      ) {
        disarm();
        try {
          install(this as unknown as InteractiveMode);
        } catch (error) {
          this.showError?.(error instanceof Error ? error.message : String(error));
        }
      }
      return original.call(this, entries, options);
    },
  );
  return disarm;
}

export function captureHost(context: ExtensionContext): InteractiveMode {
  const prior = Object.getOwnPropertyDescriptor(InteractiveMode.prototype, "setExtensionWidget");
  if (!prior || typeof prior.value !== "function")
    throw new Error("pi-skill-references cannot observe Pi widget host");
  let host: InteractiveMode | undefined;
  Object.defineProperty(InteractiveMode.prototype, "setExtensionWidget", {
    ...prior,
    value: function (this: InteractiveMode, ...args: unknown[]) {
      // oxlint-disable-next-line typescript/no-this-alias -- Observe only the receiver of this synchronous public UI call.
      host = this;
      return prior.value.apply(this, args);
    },
  });
  try {
    context.ui.setWidget("pi-skill-references.host", undefined);
  } finally {
    Object.defineProperty(InteractiveMode.prototype, "setExtensionWidget", prior);
  }
  if (
    !host ||
    (host as unknown as NativeHost).sessionManager !== (context.sessionManager as unknown)
  )
    throw new Error("pi-skill-references could not acquire this Pi session's host");
  return host;
}
