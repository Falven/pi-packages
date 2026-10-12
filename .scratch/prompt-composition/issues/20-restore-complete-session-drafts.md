# 20: Restore complete drafts with attachment membership

**What to build:** Resume a composer draft with its matching text, attachments, and recoverable pending work.

**Blocked by:** 05: Compose attachment pastes as one undoable edit; 18: pi-composer: autosave session text drafts; 19: pi-attachments: retain snapshots across sessions.

**Status:** in-progress

- [ ] Switch sessions or restart and restore matching text, reference text, attachment membership, and readable retained snapshots.
- [ ] Keep session undo histories isolated; restarting clears history without deleting attachment contents.
- [ ] Pending clipboard, attachment, or persistence work remains with the requesting draft and preserves later edits.
- [ ] When an original insertion is no longer safe, retain its contents and report recovery context instead of applying it to another draft.
- [ ] Failed restoration or submission cannot destroy the saved draft, retained files, or unrelated current work.
- [ ] Drive real host lifecycle transitions with the loaded packages and assert visible drafts, membership, and readable files.

Integration follow-up: preserve already captured members if a later read in an explicit multi-file attachment fails, including when an earlier original disappears. Verify retrieval through the native recovery action after reload. Resolve the compaction test’s intermittent input-observer ordering assertion while retaining model-delivery ordering checks.
