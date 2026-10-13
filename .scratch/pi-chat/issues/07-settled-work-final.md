# 07: Fold settled work while keeping the final response visible

**What to build:** Fold the work for an actually delivered request while its final response remains visible, including identical progress and final text.

**Blocked by:** 04: Group and toggle consecutive tool calls.

**Status:** done

- [x] Observe actual initial prompt and steering/follow-up drain objects without changing calls/returns; certify delivery only at message start and join committed entries after native persistence.
- [x] Delivered steering continues the current work and separates activity groups; a delivered follow-up starts new work and a new answer relationship.
- [x] For providers without final-phase evidence, select the qualifying terminal assistant message text as one final response only after work settles; do not infer prose boundaries.
- [x] Keep the selected final occurrence outside folded earlier work, including duplicate strings, while preserving native content and source order.
- [x] Honor explicit expansion choices; work folding is independent of group/tool state, and selection or scroll position does not defer automatic collapse.
- [x] Cancellation or absence of a qualifying final leaves work expanded; do not invent boundaries for uncertain historical relationships.
- [x] Verify ordinary, identical queued, steering, follow-up, cleared/consumed input, partial/error/cancellation, and duplicate-answer scenarios through real provider requests and visible frames.

Real-host tests cover identical progress and final text, native user-message replacement, steering and follow-up delivery, cleared or consumed input, batched follow-ups, cancellation before and after agent-end, empty/error/length outcomes, explicit tool inspection, independent work and tool choices, and automatic folding while selecting scrollback. Terminal text parts form one final answer; thoughts remain in work, native trailing notices remain visible, and native prompt navigation is retained. Historical work without observed relationships stays unfolded.

Relationship persistence and provider-phase evidence remain tickets 08 and 09. Physical-terminal acceptance is pending; this ticket verifies recorded native frames, input, provider bodies, persisted content, and clipboard boundaries.
