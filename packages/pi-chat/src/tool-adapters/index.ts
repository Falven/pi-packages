import { resolve } from "node:path"
import { builtInItems } from "./built-in.ts"
import { ActivityAdapter } from "./activity.ts"
import { fallbackItems } from "./fallback.ts"
import type { CallFacts } from "./types.ts"

// Selection and required provenance are documented in the specification's operator catalog.
export class ActivityAdapters {
  private readonly activity = new ActivityAdapter()

  describe(facts: CallFacts) {
    const items =
      this.activity.describe(facts) ??
      builtInItems(facts) ??
      fallbackItems(facts)
    for (const item of items) {
      if (item.kind !== "read" || item.action !== "read" || !item.target)
        continue
      const targetKey = item.targetKey ?? resolve(item.body.cwd, item.target)
      const skill = facts.skills.find(
        (candidate) => candidate.path === targetKey,
      )
      if (skill) {
        item.kind = "loaded"
        item.target = skill.name.replace(/^skill:/, "")
        item.targetKey = targetKey
      }
    }
    return items
  }

  observe(type: string, data: unknown, live: boolean) {
    return this.activity.observe(type, data, live)
  }

  clear() {
    this.activity.clear()
  }
}
