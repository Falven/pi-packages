import { stripTerminalSequences } from "@earendil-works/pi-tui"
import type { ActivityItem } from "./tool-adapters/types.ts"

const clean = (text: string) =>
  stripTerminalSequences(text).replace(/\s+/g, " ").trim()

export function itemSummary(item: ActivityItem, expanded: boolean) {
  const running = item.status === "running"
  const target = item.target ? ` ${clean(item.target)}` : ""
  if (item.kind === "command")
    return `${running ? "Running" : "Ran"} ${expanded ? "command" : clean(item.command ?? "command")}${item.status === "failed" ? " (failed)" : ""}`
  if (item.kind === "edit") {
    const verb = running
      ? "Editing"
      : item.status === "failed"
        ? "Edit failed:"
        : item.status === "unknown"
          ? "Edit"
          : "Edited"
    return `${verb}${target}${item.changes ? ` +${item.changes.added} -${item.changes.removed}` : ""}`
  }
  if (item.kind === "loaded")
    return `${running ? "Loading" : "Loaded"}${target} skill`
  if (item.kind === "read") {
    if (item.action === "list")
      return `${running ? "Listing" : "Listed"} files${target ? ` in${target}` : ""}`
    if (item.action === "search")
      return `${running ? "Searching" : "Searched"}${target ? ` for${target}` : " files"}`
    return `${running ? "Reading" : "Read"}${target}`
  }
  if (item.kind === "image")
    return `${running ? "Viewing" : "Viewed"} image${target}`
  if (item.kind === "execution") return `Execution ${item.status}`
  return `${running ? "Calling" : "Called"}${target}`
}
