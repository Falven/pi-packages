# 07: Fold settled work while keeping the final response visible

**What to build:** Fold the work for an actually delivered request while its final response remains visible, including identical progress and final text.

**Blocked by:** 04: Group and toggle consecutive tool calls.

**Status:** ready-for-agent

- [ ] Observe actual initial prompt and steering/follow-up drain objects without changing calls/returns; certify delivery only at message start and join committed entries after native persistence.
- [ ] Delivered steering continues the current work and separates activity groups; a delivered follow-up starts new work and a new answer relationship.
- [ ] For providers without final-phase evidence, select the qualifying terminal assistant message text as one final response only after work settles; do not infer prose boundaries.
- [ ] Keep the selected final occurrence outside folded earlier work, including duplicate strings, while preserving native content and source order.
- [ ] Honor explicit expansion choices; work folding is independent of group/tool state, and selection or scroll position does not defer automatic collapse.
- [ ] Cancellation or absence of a qualifying final leaves work expanded; do not invent boundaries for uncertain historical relationships.
- [ ] Verify ordinary, identical queued, steering, follow-up, cleared/consumed input, partial/error/cancellation, and duplicate-answer scenarios through real provider requests and visible frames.
