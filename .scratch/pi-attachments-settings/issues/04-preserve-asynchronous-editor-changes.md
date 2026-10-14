# 04: Preserve draft editing during asynchronous destination changes

**What to build:** A completed attachment capture can replace its Markdown destination without moving the caret, losing selection, overwriting later edits, or corrupting undo.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

**Specification:** [Pi Attachments](../../../docs/specs/pi-attachments.md). Use the existing public editor/session test boundary and applicable architecture decisions.

- [ ] Add the smallest public Pi editor contract needed to apply a targeted destination change to the requesting draft and preserve native edit history.
- [ ] Integrate the same public contract with the composer, preserving source selections, focus, unrelated edits, and the single active editor.
- [ ] Distinguish ordinary edits from history restoration sufficiently to avoid capture loops during undo and redo. Reject stale edits after draft or session changes.
- [ ] Verify pending capture with typing, selection, undo, redo, session switching, and submission through both real editors before enabling the combined flow.
- [ ] Use no renderer-owned edits, asynchronous whole-draft replacement, private host hooks, or parallel attachment history.
