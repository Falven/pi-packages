import { copyToClipboard } from "@earendil-works/pi-coding-agent";
import {
  Text,
  compositeTuiLine,
  sliceByColumn,
  stripTerminalSequences,
  visibleWidth,
  type Component,
} from "@earendil-works/pi-tui";
import type { CopyPayload } from "./payloads.ts";
import type { CopyEnvironment } from "./copy-contract.ts";

const { dispatchMouseEvent } = (await import(
  new URL("./tui.js", import.meta.resolve("@earendil-works/pi-tui")).href
)) as typeof import("@earendil-works/pi-tui/dist/tui.js");

export class CopyActions {
  private statusOwner: CopyAction | undefined;

  constructor(readonly host: CopyEnvironment) {}

  status(action: CopyAction, text?: string, error = false) {
    if (text) {
      this.statusOwner = action;
      this.host.setStatus(this.host.theme().fg(error ? "error" : "warning", text));
    } else if (this.statusOwner === action) {
      this.statusOwner = undefined;
      this.host.setStatus(undefined);
    }
  }
}

export class CopyAction implements Component {
  focused = false;
  row = 0;
  column = 0;
  height = 1;
  width = 0;
  private active = true;
  private pending = false;
  private copied = false;
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly actions: CopyActions,
    private readonly payload: () => CopyPayload,
    private readonly inset: boolean,
    readonly owner?: Component,
  ) {}

  get enabled() {
    return Boolean(this.payload().text);
  }

  invalidate() {}

  render(width: number) {
    const { label, text } = this.payload();
    const padding = this.inset
      ? Math.min(this.actions.host.outputPad(), Math.floor((width - 1) / 2))
      : 0;
    const available = Math.max(1, width - padding * 2);
    const original = `[${label}]`;
    this.width = Math.min(available, original.length);
    this.column = padding + (this.owner ? available - this.width : 0);
    const plain = new Text(original, 0, 0).render(this.width);
    const value = this.copied ? "[Copied]".padEnd(original.length) : original;
    const theme = this.actions.host.theme();
    const styled = theme.fg(text ? "muted" : "dim", value);
    const rows = new Text(this.focused ? theme.bg("selectedBg", styled) : styled, 0, 0).render(
      this.width,
    );
    this.height = plain.length;
    return plain.map((_, row) => " ".repeat(this.column) + (rows[row] ?? ""));
  }

  handleInput(data: string) {
    this.actions.host.handleInput(data, () => void this.copy());
  }

  handleMouse(event: Parameters<NonNullable<Component["handleMouse"]>>[0]) {
    // Pi captures a handled press through release. Drags from text selection pass through.
    if (
      event.button !== "left" ||
      (event.type !== "press" && event.type !== "click") ||
      (!this.owner && (event.y < this.row || event.y >= this.row + this.height)) ||
      event.x < this.column ||
      event.x >= this.column + this.width
    )
      return undefined;
    if (event.type === "click") void this.copy();
    return { handled: true, focus: this.enabled };
  }

  private async copy() {
    if (!this.active || this.pending) return;
    const payload = this.payload();
    if (!payload.text) return;
    this.pending = true;
    clearTimeout(this.timer);
    this.copied = false;
    this.actions.status(this);
    try {
      await copyToClipboard(payload.text);
      if (!this.active) return;
      this.copied = true;
      if (payload.partial)
        this.actions.status(this, "Only retained output copied; some output was omitted.");
    } catch (error) {
      if (!this.active) return;
      this.actions.status(this, `Copy failed: ${String(error)}`, true);
    } finally {
      this.pending = false;
      if (this.active) {
        this.actions.host.requestRender();
        this.timer = setTimeout(() => {
          this.copied = false;
          this.actions.status(this);
          this.actions.host.requestRender();
        }, 1_500);
        this.timer.unref();
      }
    }
  }

  dispose() {
    this.active = false;
    clearTimeout(this.timer);
    this.actions.status(this);
  }
}

export class CopyHeading implements Component {
  actionRow = 0;

  constructor(
    readonly component: Component,
    readonly action: CopyAction,
  ) {}

  invalidate() {
    this.component.invalidate();
  }

  render(width: number) {
    const rows = this.component.render(width);
    const action = this.action.render(width);
    if (
      action.length === 1 &&
      visibleWidth(stripTerminalSequences(rows[0] ?? "").trimEnd()) < this.action.column
    ) {
      this.actionRow = 0;
      return [
        compositeTuiLine(
          rows[0] ?? "",
          sliceByColumn(action[0]!, this.action.column, this.action.width, true),
          this.action.column,
          this.action.width,
          width,
        ),
        ...rows.slice(1),
      ];
    }
    this.actionRow = rows.length;
    return [...rows, ...action];
  }

  handleMouse(event: Parameters<NonNullable<Component["handleMouse"]>>[0]) {
    if (event.y >= this.actionRow && event.y < this.actionRow + this.action.height) {
      const result = dispatchMouseEvent(this.action, {
        ...event,
        y: event.y - this.actionRow,
        height: this.action.height,
      });
      if (result) return result;
    }
    return dispatchMouseEvent(this.component, event);
  }
}
