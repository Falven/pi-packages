# 06: Prepare attachment images using delivery-time policy

**What to build:** Queued attachment images follow current Pi policy at delivery, and a preparation failure rejects only the affected submission.

**Blocked by:** 01: Honor effective Pi settings.

**Status:** ready-for-agent

**Specification:** [Pi Attachments](../../../docs/specs/pi-attachments.md). Use the existing public editor/session test boundary and applicable architecture decisions.

- [ ] Add a public Pi delivery boundary that prepares one submission and can reject that submission without aborting unrelated active or queued work.
- [ ] Use delivery-time images.blockImages and images.autoResize. A blocked image skips attachment preparation; an image newly allowed after queueing is prepared from retained contents.
- [ ] Keep Pi final image-policy enforcement, required format conversion, original snapshots, other handlers image content, and normal, steering, and follow-up message association.
- [ ] Retain requesting-draft recovery and history. Do not silently omit failed images, overwrite a newer draft, or infer delivery success from editor clearing.
- [ ] Verify blocking changes in both directions, preparation failure isolation, existing image composition, and recovery through the public session and provider boundary.
