import type { ToolExecutionComponent, ToolRenderers } from "@earendil-works/pi-coding-agent";
import { Box, Container, MouseRegion, Spacer, type Component } from "@earendil-works/pi-tui";
import { CopyAction, CopyActions, CopyHeading } from "./controls.ts";
import { commandPayload, outputPayload } from "./payloads.ts";
import type { CopySource, ItemCopyControls } from "./copy-contract.ts";

type NativeToolLayout = {
  contentBox: Box;
  selfRenderContainer: Container;
  callRendererComponent?: Component;
  resultRendererComponent?: Component;
};

type NativeComponentLayout = {
  paddingX?: number;
  paddingY?: number;
  bgFn?: (text: string) => string;
  child?: Component;
  mouseLayout?: {
    children: { component: Component; height: number }[];
  };
};

export class ItemControls implements ItemCopyControls {
  private readonly commandAction: CopyAction | undefined;
  private readonly outputAction: CopyAction | undefined;
  private body: ToolExecutionComponent | undefined;
  private outputContinuation: Box | undefined;
  private copyColumns = new Map<number, number>();

  constructor(actions: CopyActions, source: () => CopySource, owner: Component) {
    const kind = source().kind;
    if (kind === "command")
      this.commandAction = new CopyAction(
        actions,
        () => {
          const args = source().body.args;
          return commandPayload(
            args && typeof args === "object"
              ? (args as Record<string, unknown>)["command"]
              : undefined,
          );
        },
        false,
        owner,
      );
    if (kind === "command" || kind === "edit")
      this.outputAction = new CopyAction(actions, () => outputPayload(source()), false, owner);
  }

  get actions() {
    return [this.commandAction, this.outputAction].filter((action): action is CopyAction =>
      Boolean(action?.enabled),
    );
  }

  wrap(definition: ToolRenderers): ToolRenderers {
    const renderCall = definition.renderCall;
    const action = this.commandAction;
    if (!renderCall || !action) return definition;
    return {
      ...definition,
      renderCall: (args, theme, context) => {
        const previous =
          context.lastComponent instanceof CopyHeading
            ? context.lastComponent.component
            : undefined;
        const component = renderCall(args, theme, {
          ...context,
          lastComponent: previous,
        });
        return new CopyHeading(component, action);
      },
    };
  }

  measure(root: Component) {
    this.copyColumns = new Map();
    if (this.outputAction) this.recordCopyGeometry(root);
    return this.copyColumns;
  }

  dispose() {
    this.commandAction?.dispose();
    this.outputAction?.dispose();
  }

  mount(tool: ToolExecutionComponent) {
    if (this.body !== tool) {
      this.outputContinuation = undefined;
      this.body = tool;
    }
    const action = this.outputAction;
    if (!action || !this.body) return;
    const body = this.body as unknown as NativeToolLayout;
    if (this.body.children.includes(body.contentBox)) {
      if (!body.contentBox.children.includes(action)) body.contentBox.addChild(action);
      return;
    }
    const panel = body.callRendererComponent;
    if (!(panel instanceof Box)) return;
    const container = body.selfRenderContainer;
    if (this.outputContinuation && container.children.includes(this.outputContinuation)) return;
    const result = body.resultRendererComponent;
    const resultIndex = container.children.findIndex(
      (component) => (component as unknown as NativeComponentLayout).child === result,
    );
    if (result instanceof Container && result.children.length && resultIndex >= 0) {
      // Native edits can render error text after their own panel. Continue that
      // panel with the original result component, preserving its native inset.
      const { paddingX, paddingY, bgFn } = panel as unknown as NativeComponentLayout;
      const footer = new Box(paddingX, 0);
      footer.addChild(action);
      const continuation = new Box(0, 0, bgFn);
      continuation.addChild(container.children[resultIndex]!);
      continuation.addChild(footer);
      continuation.addChild(new Spacer(paddingY ?? 0));
      container.children[resultIndex] = continuation;
      this.outputContinuation = continuation;
    } else if (!panel.children.includes(action)) panel.addChild(action);
  }

  private recordCopyGeometry(component: Component, row = 0, column = 0) {
    const layout = component as unknown as NativeComponentLayout;
    if (component instanceof CopyAction || component instanceof CopyHeading) {
      const action = component instanceof CopyAction ? component : component.action;
      const headingRow = component instanceof CopyHeading ? component.actionRow : 0;
      action.row = row + headingRow;
      for (let offset = 0; offset < action.height; offset++)
        this.copyColumns.set(
          action.row + offset,
          component instanceof CopyAction || headingRow ? 0 : column + action.column,
        );
    } else if (component instanceof MouseRegion && layout.child) {
      this.recordCopyGeometry(layout.child, row, column);
    } else {
      if (component === this.body) {
        const body = component as unknown as NativeToolLayout;
        if (!this.body.children.includes(body.contentBox)) {
          this.recordCopyGeometry(body.selfRenderContainer, row + 1, column);
          return;
        }
      }
      row += layout.paddingY ?? 0;
      column += layout.paddingX ?? 0;
      for (const child of layout.mouseLayout?.children ?? []) {
        this.recordCopyGeometry(child.component, row, column);
        row += child.height;
      }
    }
  }
}
