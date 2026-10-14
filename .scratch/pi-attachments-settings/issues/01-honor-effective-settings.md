# 01: Honor effective Pi settings through public input handling

**What to build:** Attachment images, previews, and text entry follow effective Pi preferences on an unmodified installation. Image preparation failures stop the requesting input before queue acceptance and leave its contents recoverable.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

**Specification:** [Pi Attachments](../../../docs/specs/pi-attachments.md), including its applicable architecture decisions.

- [ ] Read native preferences through pi.getSettings(), preserving Pi's defaults and global, project, and runtime overrides. Do not reconstruct native settings from files or retain dependencies on locally added host interfaces.
- [ ] Honor images.autoResize during image preparation, retain required format conversion, preserve captured originals, and append attachment images without discarding images supplied by other handlers.
- [ ] Honor terminal.showImages and terminal.imageWidthCells in previews, preserve aspect ratio, and apply editorPaddingX to Create from text… through public editor services. Visibility, width, and padding changes never initiate capture. Medium remains 24 columns by four rows; preference selection belongs to ticket 03.
- [ ] Replace delivery-hook image preparation with the public input event before queue acceptance. Preserve native normal, steering, and follow-up routing; do not introduce a separate queue or substitute custom messages.
- [ ] On preparation failure, notify the user, retain requesting-draft recovery, and return the input event's handled result. Throwing alone does not prevent submission. Do not silently omit a failed image, overwrite later edits, or stop unrelated active or queued work.
- [ ] Prepare images even when images.blockImages is currently enabled, since a queued request may become allowed. Preserve Pi's final blocking enforcement. Record that resize settings are applied before queueing and that preparation can still fail for a request whose images would ultimately be blocked; ticket 06 remains deferred.
- [ ] Remove required type dependencies on locally added native submission fields while preserving existing recovery metadata, retained files, and pending recovery across reload and session changes, including --no-session. Editor association and pending Markdown capture use the integration established by tickets 04 and 05.
- [ ] Adapt the existing focused image and text-entry checks to unmodified public host interfaces. Exercise effective overrides, conversion with resizing disabled, retained bytes, supplied images, all three submission routes, and recoverable failures. Confirm native-editor and composer results separately during ticket 07.

**Integration:** Tickets 01–05 remove coupled host contracts in one integration checkout. Focused checks accompany each slice; complete unmodified-Pi startup and regression acceptance belong to ticket 07. Do not invent host shims to make intermediate checks pass.

**Historical verification (2026-10-14):** The previous implementation passed 68 image and text-action tests against the modified host, plus focused type, lint, formatting, and whitespace checks. Those results covered settings overrides, original bytes, conversion, supplied images, recovery, and submission routes. They do not verify this public-input migration. Physical Ghostty interaction was not observed.
