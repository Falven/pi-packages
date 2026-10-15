import { builtInItems } from "./built-in.ts"
import { fallbackItems } from "./fallback.ts"
import type { CallFacts } from "./types.ts"

// Selection and required provenance are documented in the specification's operator catalog.
const adapters = [builtInItems, fallbackItems]

export function describeActivity(facts: CallFacts) {
  for (const adapt of adapters) {
    const items = adapt(facts)
    if (items) return items
  }
  throw new Error("pi-chat has no fallback tool adapter")
}
