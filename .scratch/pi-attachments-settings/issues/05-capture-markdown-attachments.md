# 05: Capture attachments expressed through Markdown

**What to build:** Ordinary local-file Markdown controls draft membership and captures source contents once when a valid reference enters the draft.

**Blocked by:** 04: Preserve draft editing during asynchronous destination changes.

**Status:** ready-for-agent

**Specification:** [Pi Attachments](../../../docs/specs/pi-attachments.md). Use the existing public editor/session test boundary and applicable architecture decisions.

- [ ] Recognize inline and reference-style links, local file autolinks, and image syntax using normal Markdown semantics. Exclude code, escaped examples, unused definitions, remote URLs, and bare paths.
- [ ] Capture a new valid source-file reference, then rewrite its destination before its first preview. Reuse that snapshot for later previews and submission, independently of image visibility.
- [ ] Restore links to retained files without recapture. Redraw, resize, settings changes, and ordinary bare-path edits never initiate capture.
- [ ] Keep insertion at the caret or selection. A generated reference inside code remains literal text, with its snapshot retained for later use.
- [ ] Keep file-level management: read-only Preview text; Restore Inline inserts contents once and removes corresponding references; Remove from draft removes references while retaining contents.
- [ ] Preserve incomplete surrounding Markdown, exact text, combined composer undo, durable recovery, existing references, and retention with --no-session.
- [ ] Verify membership, destination replacement, source changes, snapshot reuse, stale capture, repeated references, and delivery through the public host.
