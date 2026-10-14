# 01: Honor effective Pi settings

**What to build:** Attachment images, thumbnails, and text entry follow the effective Pi preferences while retaining captured originals.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

**Specification:** [Pi Attachments](../../../docs/specs/pi-attachments.md). Use the existing public editor/session test boundary and applicable architecture decisions.

- [ ] Honor images.autoResize for delivered attachment images while preserving required format conversion and images supplied by other input handlers.
- [ ] Honor terminal.showImages and terminal.imageWidthCells for native attachment previews. Preserve the current 24-column by four-row default and aspect ratio; visibility and width changes do not capture contents.
- [ ] Apply editorPaddingX to Create from text through the public editor API. Read effective settings through Pi public services with native defaults and overrides.
- [ ] Keep draft identity, exact captured text, original bytes, recovery, and normal, steering, and follow-up behavior.
- [ ] Use the agreed public editor/session host to reproduce the setting failures and verify their fixes with native Pi and the composer.
