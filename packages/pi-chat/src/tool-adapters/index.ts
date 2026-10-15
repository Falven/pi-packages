import { builtInItems } from "./built-in.ts"
import { CoreToolAdapter } from "./core-tools.ts"
import { fallbackItems } from "./fallback.ts"
import type { CallFacts } from "./types.ts"

// Selection and required provenance are documented in the specification's operator catalog.
export class ActivityAdapters {
  private readonly core = new CoreToolAdapter()

  describe(facts: CallFacts) {
    return (
      this.core.describe(facts) ?? builtInItems(facts) ?? fallbackItems(facts)
    )
  }

  observe(type: string, data: unknown, live: boolean) {
    return this.core.observe(type, data, live)
  }

  clear() {
    this.core.clear()
  }
}
