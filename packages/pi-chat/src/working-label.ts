import type { ExtensionUIContext, MessageUpdateEvent } from "@earendil-works/pi-coding-agent";
import { truncateToWidth } from "@earendil-works/pi-tui";
import { activityConfig } from "./config.ts";
import { thoughtPresentation } from "./thought.ts";
import type { ActivityItem } from "./tool-adapters/types.ts";

type Assistant = Extract<MessageUpdateEvent["message"], { role: "assistant" }>;
type WorkingUI = Pick<ExtensionUIContext, "setWorkingMessage" | "setWorkingVisible">;
type Step =
  | { kind: "reasoning"; label: string | undefined }
  | { kind: "text" }
  | { kind: "call"; id: string };

const exploration = (item: ActivityItem) => item.kind === "read" || item.kind === "loaded";
const displayPath = (path: string) =>
  path
    .trim()
    .replace(/^\.\/+/, "")
    .replaceAll("\\", "/");
const withValue = (label: string, value: string) => label.replaceAll("{value}", () => value);

function operationLabel(item: ActivityItem): string | undefined {
  const labels = activityConfig.working;
  switch (item.kind) {
    case "loaded":
      return withValue(labels.skill, item.target ?? "");
    case "read":
      if (item.action === "list")
        return item.target
          ? withValue(labels.listFolder, displayPath(item.target))
          : labels.listFiles;
      if (item.action === "search")
        return item.searchPath
          ? withValue(labels.searchFolder, displayPath(item.searchPath))
          : item.target
            ? withValue(labels.search, item.target)
            : labels.searchFiles;
      return withValue(
        labels.read,
        displayPath(item.targetKey ?? item.target ?? "")
          .replace(/\/+$/, "")
          .split("/")
          .at(-1) ?? "",
      );
    case "edit":
      return labels.edit;
    case "command":
      return item.command?.trim()
        ? withValue(labels.command, item.command.trim())
        : labels.emptyCommand;
    case "tool":
      return withValue(labels.tool, item.target ?? item.body.name);
    case "image":
    case "output":
      return undefined;
  }
}

export class WorkingLabel {
  private readonly steps: Step[] = [];
  private readonly message = new Map<number, Step>();
  private ui: WorkingUI | undefined;
  private selected: string | undefined;
  private width: number | undefined;
  private hidden = false;

  constructor(
    private readonly items: (id: string) => readonly ActivityItem[],
    private readonly hasFinalResponse: () => boolean,
  ) {}

  start(ui: WorkingUI) {
    this.ui = ui;
    this.reset();
  }

  reset() {
    this.steps.length = 0;
    this.message.clear();
    this.refresh();
  }

  startMessage() {
    this.message.clear();
  }

  update(message: Assistant, index?: number) {
    if (!this.ui) return;
    const content = message.content;
    for (const [at, part] of content.entries()) {
      if (index !== undefined && at !== index) continue;
      let step = this.message.get(at);
      if (!step) {
        if (part.type === "thinking") step = { kind: "reasoning", label: undefined };
        else if (part.type === "text" && part.text.trim()) step = { kind: "text" };
        else if (part.type === "toolCall" && part.id) step = { kind: "call", id: part.id };
        else continue;
        this.message.set(at, step);
        this.steps.push(step);
      }
      if (step.kind === "reasoning" && part.type === "thinking")
        step.label = thoughtPresentation(part.thinking).heading;
    }
    this.refresh();
  }

  dispatch(id: string) {
    if (![...this.message.values()].some((step) => step.kind === "call" && step.id === id))
      this.steps.push({ kind: "call", id });
    this.refresh();
  }

  currentOperation() {
    if (!this.ui) return;
    const boundary = this.steps.findLastIndex((step) => step.kind === "text");
    const items = this.steps
      .slice(boundary + 1)
      .flatMap((step) => (step.kind === "call" ? this.items(step.id) : []));
    const lastOther = items.findLastIndex((item) => !exploration(item));
    const reads = items.slice(lastOther + 1);
    const active =
      reads.findLast((item) => item.status === "running") ??
      reads.at(-1) ??
      items.findLast(
        (item) => item.status === "running" && item.kind !== "image" && item.kind !== "output",
      );
    return (
      active && {
        item: active,
        label: operationLabel(active)?.replace(/\s+/gu, " ").trim(),
      }
    );
  }

  refresh(width = this.width) {
    this.width = width;
    if (!this.ui) return;
    const active = this.currentOperation();
    const hidden = !active && this.hasFinalResponse();
    if (hidden !== this.hidden) {
      this.hidden = hidden;
      this.ui.setWorkingVisible(!hidden);
    }
    if (hidden) return;
    const thought = this.steps.findLast((step) => step.kind === "reasoning" && step.label);
    const label = (
      active?.label ??
      (thought?.kind === "reasoning" ? thought.label : undefined) ??
      activityConfig.working.thinking
    )
      .replace(/\s+/gu, " ")
      .trim();
    const displayed = width === undefined ? label : truncateToWidth(label, width, "…");
    if (displayed === this.selected) return;
    this.selected = displayed;
    this.ui.setWorkingMessage(displayed);
  }

  stop() {
    if (this.selected !== undefined) this.ui?.setWorkingMessage(undefined);
    if (this.hidden) this.ui?.setWorkingVisible(true);
    this.ui = undefined;
    this.selected = undefined;
    this.width = undefined;
    this.hidden = false;
    this.steps.length = 0;
    this.message.clear();
  }
}
