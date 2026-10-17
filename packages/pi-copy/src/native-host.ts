import {
  AssistantMessageComponent,
  InteractiveMode,
  ToolExecutionComponent,
  UserMessageComponent,
  type ExtensionContext,
  type ToolRenderers,
} from "@earendil-works/pi-coding-agent";
import {
  Container,
  Spacer,
  getKeybindings,
  matchesKey,
  sliceByColumn,
  stripTerminalSequences,
  type Component,
  type ScrollView,
  type TUI,
} from "@earendil-works/pi-tui";
import type { LayoutFrame } from "@earendil-works/pi-tui/dist/layout.js";
import type { CopyControl, CopySource } from "./copy-contract.ts";
import { CopyHeading } from "./controls.ts";
import { createCopyControls } from "./integration.ts";

const { getScrollViewBox } = (await import(
  new URL("./layout.js", import.meta.resolve("@earendil-works/pi-tui")).href
)) as typeof import("@earendil-works/pi-tui/dist/layout.js");

type NativeHost = {
  chatContainer: Container;
  documentContainer: Container;
  transcriptScrollView: ScrollView;
  renderer: TUI & {
    mode: string;
    isOverlayFocused(): boolean;
    getFocusedComponent(): Component | null;
  };
  editor: Component;
  outputPad: number;
  session: { isStreaming: boolean };
  sessionManager: unknown;
  keybindings: { matches(data: string, action: string): boolean };
  toggleToolOutputExpansion(): void;
  handleCopyCommand(options: {
    flashConfirmation: boolean;
    preferSelection: boolean;
  }): Promise<void>;
};
type NativeAssistant = {
  contentContainer: Container;
  isStreaming: boolean;
  lastMessage?: {
    stopReason: string;
    content: {
      type: string;
      text?: string;
      textSignature?: string;
    }[];
  };
};
type NativeTool = {
  toolName: string;
  args: unknown;
  result: CopySource["body"]["result"];
  isPartial: boolean;
  toolDefinition: ToolRenderers | undefined;
  callRendererComponent?: Component;
};
type MouseLayout = {
  paddingX?: number;
  paddingY?: number;
  mouseLayout?: { children: { component: Component; height: number }[] };
};
type Decoration = {
  geometry(): {
    columns: ReadonlyMap<number, number>;
    positions: { action: CopyControl; row: number }[];
  };
  dispose(): void;
};
type SelectionPoint = {
  row: number;
  col: number;
  boundary?: boolean;
  scrollView?: ScrollView;
};
type Selection = { start: SelectionPoint; end: SelectionPoint };
type NativeSelection = {
  currentLayout?: LayoutFrame;
  activeSearch?: {
    index: { search(lines: readonly string[], query: string): unknown };
  };
  getSelectionBounds(): Selection | undefined;
  getSelectionColumns(
    line: string,
    row: number,
    selection: Selection,
    minColumn?: number,
    maxColumn?: number,
  ): { start: number; end: number };
  getSelectionSourceLine(point: SelectionPoint): string;
  getActiveSelectionText(): string | undefined;
  refreshSearch(layout: LayoutFrame): boolean;
  applySelection(screen: string[], layout?: LayoutFrame): string[];
};

function replace<T extends object, K extends keyof T>(target: T, key: K, value: T[K]) {
  const descriptor = Object.getOwnPropertyDescriptor(target, key);
  target[key] = value;
  return () => {
    if (target[key] !== value) return;
    if (descriptor) Object.defineProperty(target, key, descriptor);
    else delete target[key];
  };
}

function responseParts(component: AssistantMessageComponent) {
  const { lastMessage: message, isStreaming } = component as unknown as NativeAssistant;
  if (!message || isStreaming || message.stopReason === "error" || message.stopReason === "aborted")
    return undefined;
  const parts = message.content.filter((part) => part.type === "text");
  const phases = parts.map((part) => {
    if (!part.textSignature?.startsWith("{")) return undefined;
    try {
      const signature: unknown = JSON.parse(part.textSignature);
      if (signature && typeof signature === "object") {
        const value = signature as { v?: unknown; phase?: unknown };
        if (value.v === 1) return value.phase;
      }
    } catch {
      // Other providers' opaque signatures are not phase evidence.
    }
    return undefined;
  });
  if (phases.some((phase) => phase !== undefined)) {
    const final = parts.filter((_, index) => phases[index] === "final_answer");
    return final.length ? final.map((part) => part.text ?? "") : undefined;
  }
  return !message.content.some((part) => part.type === "toolCall") &&
    parts.some((part) => part.text?.trim())
    ? parts.map((part) => part.text ?? "")
    : undefined;
}

export class NativeCopyHost {
  private readonly host: NativeHost;
  private readonly controls;
  private readonly decorations = new Map<Component, Decoration>();
  private readonly finals = new Map<AssistantMessageComponent, string[]>();
  private readonly cleanup: (() => void)[] = [];
  private readonly rendererCleanup: (() => void)[] = [];
  private boundRenderer: TUI | undefined;
  private columns = new Map<number, number>();
  private positions: { action: CopyControl; row: number }[] = [];

  constructor(host: InteractiveMode, context: ExtensionContext) {
    this.host = host as unknown as NativeHost;
    this.controls = createCopyControls({
      theme: () => context.ui.theme,
      outputPad: () => this.host.outputPad,
      handleInput: (data, activate) => this.handleInput(data, activate),
      requestRender: () => this.requestRender(),
      setStatus: (text) => context.ui.setStatus("pi-copy", text),
    });
    const document = this.host.documentContainer;
    const render = document.render;
    this.bindRenderer();
    this.cleanup.push(
      replace(document, "render", (width) => {
        this.sync();
        const lines = render.call(document, width);
        this.columns = new Map();
        this.positions = [];
        this.measure(document);
        this.bindRenderer();
        return lines;
      }),
      context.ui.onTerminalInput((data) => {
        if (!matchesKey(data, "alt+g") || this.host.renderer.isOverlayFocused()) return undefined;
        const scroll = this.host.transcriptScrollView;
        const nearest =
          this.host.renderer.mode === "fullscreen"
            ? this.positions.findLast(
                ({ row }) =>
                  row >= scroll.scrollTop && row < scroll.scrollTop + scroll.viewportHeight,
              )
            : this.positions.at(-1);
        if (!nearest) return undefined;
        this.focus(nearest);
        return { consume: true };
      }),
    );
    this.requestRender();
  }

  requestRender() {
    this.host.renderer.requestRender();
  }

  dispose() {
    if (this.controls.isAction(this.host.renderer.getFocusedComponent()))
      this.host.renderer.setFocus(this.host.editor);
    for (const cleanup of this.cleanup.toReversed()) cleanup();
    for (const cleanup of this.rendererCleanup.splice(0).toReversed()) cleanup();
    for (const decoration of this.decorations.values()) decoration.dispose();
    this.decorations.clear();
    this.requestRender();
  }

  private sync() {
    const children = this.host.chatContainer.children;
    this.finals.clear();
    let candidate: AssistantMessageComponent | undefined;
    const finish = () => {
      const parts = candidate && responseParts(candidate);
      if (candidate && parts) this.finals.set(candidate, parts);
    };
    for (const child of children) {
      if (child instanceof UserMessageComponent) {
        finish();
        candidate = undefined;
      } else if (child instanceof AssistantMessageComponent) candidate = child;
      if (!this.decorations.has(child)) {
        if (child instanceof AssistantMessageComponent)
          this.decorations.set(child, this.decorateAssistant(child));
        else if (child instanceof ToolExecutionComponent) {
          const tool = child as unknown as NativeTool;
          if (["bash", "edit", "write"].includes(tool.toolName))
            this.decorations.set(child, this.decorateTool(child));
        }
      }
    }
    if (!this.host.session.isStreaming) finish();
    for (const [component, decoration] of this.decorations) {
      if (children.includes(component)) continue;
      decoration.dispose();
      this.decorations.delete(component);
    }
    const focused = this.host.renderer.getFocusedComponent();
    if (
      this.controls.isAction(focused) &&
      ![...this.decorations.values()].some((decoration) =>
        decoration.geometry().positions.some(({ action }) => action === focused),
      )
    )
      this.host.renderer.setFocus(this.host.editor);
  }

  private decorateAssistant(component: AssistantMessageComponent): Decoration {
    const native = component as unknown as NativeAssistant;
    const action = this.controls.response(() => this.finals.get(component) ?? []);
    const footer = new Container();
    const gap = new Spacer(1);
    let separated = false;
    let height = 0;
    const content = native.contentContainer;
    const renderContent = content.render;
    const undoContent = replace(content, "render", (width) => {
      const rows = renderContent.call(content, width);
      separated = Boolean(stripTerminalSequences(rows.at(-1) ?? "").trim());
      height = rows.length;
      return rows;
    });
    const renderFooter = footer.render;
    footer.render = (width) => {
      footer.children = this.finals.has(component) ? (separated ? [gap, action] : [action]) : [];
      return renderFooter.call(footer, width);
    };
    component.addChild(footer);
    return {
      geometry: () => {
        const visible = this.finals.has(component);
        const offset = height + Number(separated);
        return {
          columns: new Map(
            visible
              ? Array.from({ length: Number(separated) + action.height }, (_, row) => [
                  height + row,
                  0,
                ])
              : [],
          ),
          positions: visible && action.enabled ? [{ action, row: offset }] : [],
        };
      },
      dispose: () => {
        undoContent();
        component.removeChild(footer);
        action.dispose();
      },
    };
  }

  private decorateTool(component: ToolExecutionComponent): Decoration {
    const native = component as unknown as NativeTool;
    const item = this.controls.item(
      () => ({
        kind: native.toolName === "bash" ? "command" : "edit",
        status: native.isPartial ? "running" : native.result?.isError ? "failed" : "completed",
        body: {
          name: native.toolName,
          args: native.args,
          result: native.result,
        },
      }),
      component,
    );
    const undoDefinition = replace(
      native,
      "toolDefinition",
      item.wrap(native.toolDefinition ?? {}),
    );
    const render = component.render;
    let columns: ReadonlyMap<number, number> = new Map();
    let visible = false;
    const undoRender = replace(component, "render", (width) => {
      item.mount(component);
      const rows = render.call(component, width);
      visible = rows.length > 0;
      columns = visible ? item.measure(component) : new Map();
      return rows;
    });
    component.invalidate();
    return {
      geometry: () => ({
        columns,
        positions: visible ? item.actions.map((action) => ({ action, row: action.row })) : [],
      }),
      dispose: () => {
        undoRender();
        undoDefinition();
        if (native.callRendererComponent instanceof CopyHeading)
          native.callRendererComponent = native.callRendererComponent.component;
        item.dispose();
        component.invalidate();
      },
    };
  }

  private measure(component: Component, row = 0, column = 0) {
    const decoration = this.decorations.get(component);
    if (decoration) {
      const geometry = decoration.geometry();
      for (const [offset, start] of geometry.columns)
        this.columns.set(row + offset, start ? column + start : 0);
      for (const position of geometry.positions)
        this.positions.push({
          action: position.action,
          row: row + position.row,
        });
      return;
    }
    const layout = component as unknown as MouseLayout;
    row += layout.paddingY ?? 0;
    column += layout.paddingX ?? 0;
    for (const child of layout.mouseLayout?.children ?? []) {
      this.measure(child.component, row, column);
      row += child.height;
    }
  }

  private handleInput(data: string, activate: () => void) {
    const keys = getKeybindings();
    const focused = this.host.renderer.getFocusedComponent();
    const index = this.positions.findIndex(({ action }) => action === focused);
    if (keys.matches(data, "tui.select.up") || keys.matches(data, "tui.select.down")) {
      const next = this.positions[index + (keys.matches(data, "tui.select.up") ? -1 : 1)];
      if (next) this.focus(next);
    } else if (keys.matches(data, "tui.select.confirm")) activate();
    else if (keys.matches(data, "tui.select.cancel")) {
      this.host.renderer.setFocus(this.host.editor);
      this.requestRender();
    } else if (this.host.keybindings.matches(data, "app.tools.expand"))
      this.host.toggleToolOutputExpansion();
    else if (this.host.keybindings.matches(data, "app.message.copy"))
      void this.host.handleCopyCommand({
        flashConfirmation: true,
        preferSelection: true,
      });
    else if (
      keys.matches(data, "tui.altScreen.pageUp") ||
      keys.matches(data, "tui.altScreen.pageDown")
    ) {
      this.host.transcriptScrollView.scrollBy(
        this.host.transcriptScrollView.viewportHeight *
          (keys.matches(data, "tui.altScreen.pageUp") ? -1 : 1),
      );
      this.requestRender();
    }
  }

  private focus(position: { action: CopyControl; row: number }) {
    const scroll = this.host.transcriptScrollView;
    this.host.renderer.setFocus(position.action);
    if (this.host.renderer.mode === "fullscreen") {
      if (position.row < scroll.scrollTop) scroll.scrollTo(position.row);
      else if (position.row + position.action.height > scroll.scrollTop + scroll.viewportHeight)
        scroll.scrollTo(position.row + position.action.height - scroll.viewportHeight);
    }
    this.requestRender();
  }

  private contentLine(line: string, row: number) {
    const column = this.columns.get(row);
    return column === undefined ? line : sliceByColumn(line, 0, column, true);
  }

  private bindRenderer() {
    const renderer = this.host.renderer;
    if (this.boundRenderer === renderer) return;
    for (const cleanup of this.rendererCleanup.splice(0).toReversed()) cleanup();
    this.boundRenderer = renderer;
    if (renderer.mode !== "fullscreen") return;
    const native = renderer as unknown as NativeSelection;
    const scroll = this.host.transcriptScrollView;
    for (const name of [
      "getActiveSelectionText",
      "getSelectionSourceLine",
      "getSelectionColumns",
      "getSelectionBounds",
      "refreshSearch",
      "applySelection",
    ] as const)
      if (typeof native[name] !== "function")
        throw new Error(`pi-copy requires Pi renderer.${name}`);
    const getText = native.getActiveSelectionText;
    const getLine = native.getSelectionSourceLine;
    const getColumns = native.getSelectionColumns;
    const applySelection = native.applySelection;
    const refreshSearch = native.refreshSearch;
    let selectionLayout: LayoutFrame | undefined;
    this.rendererCleanup.push(
      replace(native, "getActiveSelectionText", () => {
        const selection = native.getSelectionBounds();
        if (selection?.start.scrollView !== scroll || !native.currentLayout)
          return getText.call(native);
        const source = getScrollViewBox(native.currentLayout, scroll)?.scrollContentLines;
        if (!source) return undefined;
        const lines: string[] = [];
        for (let row = selection.start.row; row <= selection.end.row; row++) {
          if (this.columns.get(row) === 0) continue;
          const line = this.contentLine(source[row] ?? "", row);
          const { start, end } = getColumns.call(native, line, row, selection);
          lines.push(
            stripTerminalSequences(
              sliceByColumn(line, start, Math.max(0, end - start), true),
            ).trimEnd(),
          );
        }
        return lines.join("\n") || undefined;
      }),
      replace(native, "getSelectionSourceLine", (point) => {
        const line = getLine.call(native, point);
        return point.scrollView === scroll ? this.contentLine(line, point.row) : line;
      }),
      replace(native, "applySelection", (screen, layout) => {
        selectionLayout = layout ?? native.currentLayout;
        try {
          return applySelection.call(native, screen, layout);
        } finally {
          selectionLayout = undefined;
        }
      }),
      replace(native, "getSelectionColumns", (line, row, selection, min, max) => {
        const columns = getColumns.call(native, line, row, selection, min, max);
        if (selection.start.scrollView !== scroll) return columns;
        const box = selectionLayout && getScrollViewBox(selectionLayout, scroll);
        const sourceRow = box ? row - box.rect.y + scroll.scrollTop : row;
        const end = this.columns.get(sourceRow);
        return end === undefined
          ? columns
          : {
              start: columns.start,
              end: Math.min(columns.end, end + (box?.rect.x ?? 0)),
            };
      }),
      replace(native, "refreshSearch", (layout) => {
        const index = native.activeSearch?.index;
        if (!index || layout.primaryScrollView !== scroll)
          return refreshSearch.call(native, layout);
        const search = index.search;
        const undo = replace(index, "search", (lines, query) =>
          search.call(
            index,
            lines.map((line, row) => this.contentLine(line, row)),
            query,
          ),
        );
        try {
          return refreshSearch.call(native, layout);
        } finally {
          undo();
        }
      }),
    );
  }
}

export function captureNativeHost(context: ExtensionContext): InteractiveMode {
  const prior = Object.getOwnPropertyDescriptor(InteractiveMode.prototype, "setExtensionWidget");
  if (!prior || typeof prior.value !== "function")
    throw new Error("pi-copy cannot observe Pi widget host");
  let host: InteractiveMode | undefined;
  Object.defineProperty(InteractiveMode.prototype, "setExtensionWidget", {
    ...prior,
    value: function (this: InteractiveMode, ...args: unknown[]) {
      // oxlint-disable-next-line typescript/no-this-alias -- Observe Pi's receiver without replacing its widget behavior.
      host = this;
      return prior.value.apply(this, args);
    },
  });
  try {
    context.ui.setWidget("pi-copy.host", undefined);
  } finally {
    Object.defineProperty(InteractiveMode.prototype, "setExtensionWidget", prior);
  }
  if (
    !host ||
    (host as unknown as NativeHost).sessionManager !== (context.sessionManager as unknown)
  )
    throw new Error("pi-copy could not acquire this Pi session's host");
  return host;
}
