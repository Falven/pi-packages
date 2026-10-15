import { stripTerminalSequences } from "@earendil-works/pi-tui"
import type { ActivityItem } from "./tool-adapters/types.ts"

const clean = (text: string) =>
  stripTerminalSequences(text).replace(/\s+/g, " ").trim()

export function itemSummary(item: ActivityItem, expanded: boolean) {
  const running = item.status === "running"
  const target = item.target ? ` ${clean(item.target)}` : ""
  const outcome =
    item.status === "failed"
      ? " (failed)"
      : item.status === "unknown"
        ? " (status unknown)"
        : ""
  if (item.kind === "command")
    return `${running ? "Running" : "Ran"} ${expanded ? "command" : clean(item.command ?? "command")}${outcome}`
  if (item.kind === "edit") {
    if (item.status === "unattempted")
      return `Not edited${target} (not attempted)`
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
    return `${running ? "Loading" : "Loaded"}${target} skill${outcome}`
  if (item.kind === "read") {
    if (item.action === "list")
      return `${running ? "Listing" : "Listed"} files${target ? ` in${target}` : ""}${outcome}`
    if (item.action === "search")
      return `${running ? "Searching" : "Searched"}${target ? ` for${target}` : " files"}${outcome}`
    return `${running ? "Reading" : "Read"}${target}${outcome}`
  }
  if (item.kind === "image")
    return `${running ? "Viewing" : "Viewed"} image${target}${outcome}`
  if (item.kind === "input")
    return `${running ? "Sending" : "Sent"} input${target ? ` to${target}` : ""}${outcome}`
  if (item.kind === "collection")
    return `${running ? "Collecting" : "Collected"} output${target ? ` from${target}` : ""}${outcome}`
  if (item.kind === "execution") return `Execution ${item.status}`
  return `${running ? "Calling" : "Called"}${target}${outcome}`
}
