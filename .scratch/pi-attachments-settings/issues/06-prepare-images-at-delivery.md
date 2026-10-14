# 06: Prepare attachment images using delivery-time policy

**What to build:** Queued attachment images follow current Pi policy at delivery, and a preparation failure rejects only the affected submission.

**Blocked by:** 01: Honor effective Pi settings through public input handling; an official public per-submission delivery boundary in a supported, unmodified Pi release that permits isolated rejection.

**Status:** deferred

**Specification:** [Pi Attachments](../../../docs/specs/pi-attachments.md), including its applicable architecture decisions.

- [ ] Establish that the released public boundary supports preparation and rejection of one normal, steering, or follow-up submission without aborting unrelated active or queued work. An inspected interface and runtime evidence must establish this before implementation.
- [ ] Use delivery-time images.blockImages and images.autoResize. A blocked image skips attachment preparation; an image newly allowed after queueing is prepared from retained contents.
- [ ] Preserve Pi's final image-policy enforcement, required format conversion, original snapshots, images from other handlers, and correct message association.
- [ ] Preserve requesting-draft recovery and history. Do not silently omit failed images, overwrite a newer draft, infer delivery success from editor clearing, or produce an empty provider request after rejection.
- [ ] Verify policy changes in both directions, delivery-time resizing, preparation failure isolation, continued unrelated work, existing image composition, and recovery through the public session and provider boundary.
- [ ] Supply none of the missing capability through Pi source changes, replacement host builds, global patches, private queue hooks, whole-conversation context replacement, or cancellation of an unrelated run. Conditional private editor access from ticket 04 grants no queue access.

**Deferral:** Released Pi has no public boundary satisfying these requirements in the inspected evidence. This ticket blocks none of tickets 01–05 or 07. Ticket 01's public-input preparation is the portable baseline and must not be reported as delivery-time isolation. Reassess this ticket only when an appropriate official interface becomes available; the migration does not include adding that interface to Pi.

**Deferred acceptance:** [Deferred image delivery tests](../../../packages/pi-attachments/test/deferred-image-delivery.test.mjs) preserve nine original public editor/session/provider cases: blocked unreadable-image bypass, blocking changes in both directions while queued, delivery-time resizing, and preparation failure after queue acceptance with unrelated work, history, and recovery preserved. They require no custom submission IDs or private rejection records. `node --test packages/pi-attachments/test/deferred-image-delivery.test.mjs` reports all nine as skipped because the official per-submission delivery boundary with isolated rejection is unavailable. These assertions remain unverified on released Pi and do not count as passes in ticket 01's 11-case public-input baseline.

**Historical verification (2026-10-14):** The modified host supplied input_delivery and submissionId. Its 78 agent tests, 36 session/input tests, root check, and 63 focused consumer checks verified that custom implementation, with type, lint, formatting, and whitespace checks. Those APIs are absent from released Pi and the prior completion claim does not apply to this deferred milestone. No live provider or physical terminal interaction was used.
