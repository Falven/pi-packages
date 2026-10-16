import type { ActivityItem } from "./tool-adapters/types.ts"
import { activityConfig } from "./config.ts"

type SummaryGroup = { items: readonly { activityItem?: ActivityItem }[] }

export class GroupSummaries {
  private readonly cache = new WeakMap<
    SummaryGroup,
    { items: (ActivityItem | undefined)[]; text: string }
  >()

  summary(group: SummaryGroup) {
    const cached = this.cache.get(group)
    if (
      cached &&
      cached.items.length === group.items.length &&
      group.items.every(
        (row, index) => row.activityItem === cached.items[index],
      )
    )
      return cached.text
    const counts = new Map<
      ActivityItem["kind"],
      { identities: Set<object | string>; running: boolean }
    >()
    for (const row of group.items) {
      const item = row.activityItem
      if (!item) continue
      const count = counts.get(item.kind) ?? {
        identities: new Set<object | string>(),
        running: false,
      }
      count.identities.add(
        (item.kind === "edit" || item.kind === "loaded") && item.targetKey
          ? item.targetKey
          : item,
      )
      count.running ||= item.status === "running"
      counts.set(item.kind, count)
    }
    const segments = Object.entries(activityConfig.groups).flatMap(
      ([kind, words]) => {
        const count = counts.get(kind as ActivityItem["kind"])
        return count
          ? [
              words[count.running ? "running" : "completed"][
                count.identities.size > 1 ? "plural" : "singular"
              ],
            ]
          : []
      },
    )
    const summary = segments.join(", ")
    const text = summary
      ? summary[0]!.toUpperCase() + summary.slice(1)
      : activityConfig.emptyGroup
    this.cache.set(group, {
      items: group.items.map((row) => row.activityItem),
      text,
    })
    return text
  }
}
