import { stripTerminalSequences } from "@earendil-works/pi-tui";
import { activityConfig } from "./config.ts";
import type { ActivityItem } from "./tool-adapters/types.ts";

const clean = (text: string) => stripTerminalSequences(text).replace(/\s+/g, " ").trim();

export function itemSummary(item: ActivityItem, expanded: boolean) {
  const words = activityConfig.labels;
  const running = item.status === "running";
  const tense = running ? "running" : "completed";
  const target = item.target ? ` ${clean(item.target)}` : "";
  const outcome =
    item.status === "failed" ? words.failed : item.status === "unknown" ? words.unknown : "";
  if (item.kind === "command")
    return `${words.command[tense]} ${expanded ? words.command.expanded : clean(item.command ?? words.command.expanded)}${outcome}`;
  if (item.kind === "edit") {
    if (item.status === "unattempted")
      return `${words.edit.unattempted}${target}${words.unattempted}`;
    const verb = running
      ? words.edit.running
      : item.status === "failed"
        ? words.edit.failed
        : item.status === "unknown"
          ? words.edit.unknown
          : words.edit.completed;
    return `${verb}${target}${item.changes ? ` +${item.changes.added} -${item.changes.removed}` : ""}`;
  }
  if (item.kind === "loaded") return `${words.read[tense]}${target} ${words.skill}${outcome}`;
  if (item.kind === "read") {
    if (item.action === "list")
      return `${words.list[tense]} ${words.files}${target ? ` ${words.in}${target}` : ""}${outcome}`;
    if (item.action === "search")
      return `${words.search[tense]}${target ? ` ${words.for}${target}` : ` ${words.files}`}${item.searchPath ? ` ${words.in} ${clean(item.searchPath)}` : ""}${outcome}`;
    return `${words.read[tense]}${target}${outcome}`;
  }
  if (item.kind === "image") return `${words.image[tense]} ${words.imageNoun}${target}${outcome}`;
  if (item.kind === "output")
    return item.status === "failed" ? words.error : `${words.output}${outcome}`;
  return `${words.tool[tense]}${target}${outcome}`;
}
