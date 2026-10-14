# 01: Honor effective Pi settings

**What to build:** Attachment images, thumbnails, and text entry follow the effective Pi preferences while retaining captured originals.

**Blocked by:** None (can start immediately).

**Status:** complete

**Specification:** [Pi Attachments](../../../docs/specs/pi-attachments.md). Use the existing public editor/session test boundary and applicable architecture decisions.

- [x] Honor images.autoResize for delivered attachment images while preserving required format conversion and images supplied by other input handlers.
- [x] Honor terminal.showImages and terminal.imageWidthCells for native attachment previews. Preserve the current 24-column by four-row default and aspect ratio; visibility and width changes do not capture contents.
- [x] Apply editorPaddingX to Create from text through the public editor API. Read effective settings through Pi public services with native defaults and overrides.
- [x] Keep draft identity, exact captured text, original bytes, recovery, and normal, steering, and follow-up behavior.
- [x] Use the agreed public editor/session host to reproduce the setting failures and verify their fixes with native Pi and the composer.

**Verification (2026-10-14):** The public Pi host reproduced auto-resize, hidden-preview, width, and text-dialog padding failures before their fixes. The image and text-action suites passed (68 tests), including native and composer previews, effective overrides, original snapshot bytes, existing input images, BMP conversion, recovery, and normal, steering, and follow-up delivery. Focused TypeScript, lint, formatting, and whitespace checks passed. Terminal graphics and editor placement were checked through the controlled host; no physical Ghostty interaction was performed.
