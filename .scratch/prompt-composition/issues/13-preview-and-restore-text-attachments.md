# 13: pi-attachments: preview, restore, and remove text

**What to build:** Inspect attached text, restore it at the caret/selection, and remove draft membership with recoverable history.

**Blocked by:** 05: Compose attachment pastes as one undoable edit.

**Status:** implemented; real-terminal acceptance pending

- [x] Preview preserved text through native UI with both the native editor and pi-composer.
- [x] Show Manage attachments beside Ctrl+Alt+A in the widget. The shortcut opens the current draft's manager without submission; cancellation preserves the draft and selection. Document that `/attachments` uses native leading command dispatch and is not an inline command.
- [x] Restore Inline inserts complete preserved text at the caret or over the selection, including code and content above the paste cutoff. The native editor retains its tab expansion and LF normalization; pi-composer preserves tabs, and snapshot bytes remain unchanged.
- [x] Restoration bypasses automatic attachment conversion and removes the restored item's draft membership.
- [x] With pi-composer, restoration and removal each undo/redo as one coherent action including text and membership.
- [x] Removing an item or failing to render a preview does not delete contents needed by undo, another draft, or an earlier submission.
- [x] Pending previews/restores remain associated with the requesting draft and preserve unrelated edits; read failures leave recoverable content.
- [x] Verify displayed/restored text, membership, one-action history, delayed operations, and retained files at the public Pi boundary.
- [ ] Verify keyboard access to text preview, Restore Inline, and removal in Ghostty.

**Verification (2026-10-12):** All 712 workspace tests pass on Node 26.8.1, together with formatting, lint, and typechecking. Existing public-host checks verify the native command route, shortcut opening, cancellation, preserved selection, and subsequent editing with the compact action hint. Physical Ghostty keyboard checks remain pending.
