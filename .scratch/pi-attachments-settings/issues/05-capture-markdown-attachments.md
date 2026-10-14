# 05: Capture attachments expressed through Markdown

**What to build:** Ordinary local-file Markdown controls draft membership and captures source contents once when a valid reference enters the draft.

**Blocked by:** 04: Preserve draft editing during asynchronous destination changes.

**Status:** complete

**Specification:** [Pi Attachments](../../../docs/specs/pi-attachments.md). Use the existing public editor/session test boundary and applicable architecture decisions.

- [x] Recognize inline and reference-style links, local file autolinks, and image syntax using normal Markdown semantics. Exclude code, escaped examples, unused definitions, remote URLs, and bare paths.
- [x] Capture a new valid source-file reference, then rewrite its destination before its first preview. Reuse that snapshot for later previews and submission, independently of image visibility.
- [x] Restore links to retained files without recapture. Redraw, resize, settings changes, and ordinary bare-path edits never initiate capture.
- [x] Keep insertion at the caret or selection. A generated reference inside code remains literal text, with its snapshot retained for later use.
- [x] Keep file-level management: read-only Preview text; Restore Inline inserts contents once and removes corresponding references; Remove from draft removes references while retaining contents.
- [x] Preserve incomplete surrounding Markdown, exact text, combined composer undo, durable recovery, existing references, and retention with --no-session.
- [x] Verify membership, destination replacement, source changes, snapshot reuse, stale capture, repeated references, and delivery through the public host.

**Verification (2026-10-14):** All 726 attachment and composer tests passed against the coherent host artifact from `a24f95c44`, using `node --test --test-concurrency=4 packages/pi-attachments/test/*.test.mjs packages/pi-composer/test/*.test.mjs packages/pi-composer/test/*.test.ts`. The 32 new public-host cases cover ordinary Markdown grammar, tables and nested images, exact destination ranges across native collapsed pastes, retained membership, repeated-reference management, undo, changed sources, pending Send, earlier input transformations and supplied images, compaction, identical steering/follow-up drafts completed out of order, session replacement, and recoverable failure without session files. Existing recovery tests reproduced and verified the resource-reload lifetime fix. TypeScript, scoped lint, formatting, and whitespace checks passed. Provider, filesystem, and terminal boundaries were controlled; physical terminal usability remains unobserved.

**Integration:** Capture annotations follow Pi's opaque editor text/history identity. `input_prepare` awaits only capture work already belonging to the submitted identity and supplies retained destinations before ordinary input transforms. Native prompt history receives those same destinations in submission order. Markdown parsing reuses Pi's exported Marked implementation; rendering never captures or changes the draft.
