# 13: pi-attachments: preview, restore, and remove text

**What to build:** Inspect attached text, restore it at the caret/selection, and remove draft membership with recoverable history.

**Blocked by:** 05: Compose attachment pastes as one undoable edit.

**Status:** ready-for-agent

- [ ] Preview preserved text through native UI with both the native editor and pi-composer.
- [ ] Restore Inline inserts complete preserved text at the caret or over the selection, including code and content above the paste cutoff.
- [ ] Restoration bypasses automatic attachment conversion and removes the restored item's draft membership.
- [ ] With pi-composer, restoration and removal each undo/redo as one coherent action including text and membership.
- [ ] Removing an item or failing to render a preview does not delete contents needed by undo, another draft, or an earlier submission.
- [ ] Pending previews/restores remain associated with the requesting draft and preserve unrelated edits; read failures leave recoverable content.
- [ ] Verify displayed/restored text, membership, and retained files at the public Pi boundary and keyboard access in Ghostty.
