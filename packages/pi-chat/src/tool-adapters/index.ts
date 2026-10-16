import { builtInItems } from "./built-in.ts"
import { ActivityAdapter } from "./activity.ts"
import { fallbackItems } from "./fallback.ts"
import type { CallFacts } from "./types.ts"

// Selection and required provenance are documented in the specification's operator catalog.
export class ActivityAdapters {
  private readonly activity = new ActivityAdapter()

  describe(facts: CallFacts) {
    return (
      this.activity.describe(facts) ??
      builtInItems(facts) ??
      fallbackItems(facts)
    )
  }

  observe(type: string, data: unknown, live: boolean) {
    return this.activity.observe(type, data, live)
  }

  clear() {
    this.activity.clear()
  }
}
