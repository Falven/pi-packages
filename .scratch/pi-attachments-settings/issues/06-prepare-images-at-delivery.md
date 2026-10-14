# 06: Prepare attachment images using delivery-time policy

**What to build:** Queued attachment images follow current Pi policy at delivery, and a preparation failure rejects only the affected submission.

**Blocked by:** 01: Honor effective Pi settings.

**Status:** complete

**Specification:** [Pi Attachments](../../../docs/specs/pi-attachments.md). Use the existing public editor/session test boundary and applicable architecture decisions.

- [x] Add a public Pi delivery boundary that prepares one submission and can reject that submission without aborting unrelated active or queued work.
- [x] Use delivery-time images.blockImages and images.autoResize. A blocked image skips attachment preparation; an image newly allowed after queueing is prepared from retained contents.
- [x] Keep Pi final image-policy enforcement, required format conversion, original snapshots, other handlers image content, and normal, steering, and follow-up message association.
- [x] Retain requesting-draft recovery and history. Do not silently omit failed images, overwrite a newer draft, or infer delivery success from editor clearing.
- [x] Verify blocking changes in both directions, preparation failure isolation, existing image composition, and recovery through the public session and provider boundary.

**Verification (2026-10-14):** Pi exposes `input_delivery` with a stable `submissionId`, composable text/image transforms, and per-submission rejection. Upstream focused checks passed: 78 agent tests, 36 session/input tests, and the required root check. They cover both queue modes, rejection without an empty provider request, independent continuation, and the next valid queued submission. Consumer tests reproduced blocked-image preparation before the fix, then passed 63 focused image, retention, and composer recovery tests against the coherent host artifact. They verify policy changes in both directions, delivery-time resizing, conversion, original bytes, other handlers' images, session-switch history identity, durable recovery without session files, and unchanged newer drafts. TypeScript, lint, formatting, and whitespace checks passed. No live provider or physical terminal interaction was used.
