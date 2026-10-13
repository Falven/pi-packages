# 09: Collapse work as a qualifying final response streams

**What to build:** Focus the chat on a qualifying streaming final response while earlier work collapses, preserving interruption and replay behavior.

**Blocked by:** 08: Restore work relationships across session lifecycles.

**Status:** done

- [x] Use actual provider phase evidence tied to exact normalized content occurrences, including several provider items in one assistant message.
- [x] Keep provider phase, selected final response, and settled outcome distinct; no text matching or prose-based phase inference.
- [x] Allow collapse when qualifying final text starts, without requiring successful completion; honor explicit expansion choices.
- [x] Cancellation leaves work expanded even after partial final text; a terminal error that disqualifies the final also expands work, without adding a blanket failure override.
- [x] Preserve the settled-message fallback when phase evidence is absent and persist only established phase relationships for replay.
- [x] Verify actual phase-bearing provider streams, duplicate text parts, early collapse, cancellation, errors, no-phase fallback, and reload using Pi provider parsing.
