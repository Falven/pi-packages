# 04: Preserve draft editing during asynchronous destination changes

**What to build:** A completed attachment capture can replace its Markdown destination without moving the caret, losing selection, overwriting later edits, or corrupting undo.

**Blocked by:** None (can start immediately).

**Status:** complete

**Specification:** [Pi Attachments](../../../docs/specs/pi-attachments.md). Use the existing public editor/session test boundary and applicable architecture decisions.

- [x] Add the smallest public Pi editor contract needed to apply a targeted destination change to the requesting draft and preserve native edit history.
- [x] Integrate the same public contract with the composer, preserving source selections, focus, unrelated edits, and the single active editor.
- [x] Distinguish ordinary edits from history restoration sufficiently to avoid capture loops during undo and redo. Reject stale edits after draft or session changes.
- [x] Verify pending capture with typing, selection, undo, redo, session switching, and submission through both real editors before enabling the combined flow.
- [x] Use no renderer-owned edits, asynchronous whole-draft replacement, private host hooks, or parallel attachment history.

**Verification (2026-10-14):** Public editor tests cover expanded paste offsets, replacements inside and across collapsed pastes, later typing, composer selection and undo/redo, native undo, session changes, and submission. The editor's opaque text identity survives undo and prompt-history recall; replacing a draft with identical text creates a distinct identity without a phantom undo or autosave step. Focused identity, recovery, composition, and cleanup checks passed (76 tests), followed by 28 chat relationship tests. Typecheck, lint, and formatting checks passed. Final combined verification is recorded in the specification. Native Pi has no selection or redo; those behaviors are verified with the composer. Physical terminal interaction remains unobserved.
