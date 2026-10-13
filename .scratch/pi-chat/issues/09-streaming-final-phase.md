# 09: Collapse work as a qualifying final response streams

**What to build:** Focus the chat on a qualifying streaming final response while earlier work collapses, preserving interruption and replay behavior.

**Blocked by:** 08: Restore work relationships across session lifecycles.

**Status:** ready-for-agent

- [ ] Use actual provider phase evidence tied to exact normalized content occurrences, including several provider items in one assistant message.
- [ ] Keep provider phase, selected final response, and settled outcome distinct; no text matching or prose-based phase inference.
- [ ] Allow collapse when qualifying final text starts, without requiring successful completion; honor explicit expansion choices.
- [ ] Cancellation leaves work expanded even after partial final text; a terminal error that disqualifies the final also expands work, without adding a blanket failure override.
- [ ] Preserve the settled-message fallback when phase evidence is absent and persist only established phase relationships for replay.
- [ ] Verify actual phase-bearing provider streams, duplicate text parts, early collapse, cancellation, errors, no-phase fallback, and reload using Pi provider parsing.
