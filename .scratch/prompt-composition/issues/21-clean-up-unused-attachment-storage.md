# 21: pi-attachments: clean up unused snapshots safely

**What to build:** Explicitly reclaim eligible unused attachment storage while keeping every needed snapshot readable.

**Blocked by:** 20: Restore complete drafts with attachment membership.

**Status:** ready-for-agent

- [ ] Provide an explicit native cleanup action; do not introduce automatic expiry.
- [ ] Preserve contents referenced by saved drafts, in-memory undo/redo, retained submissions, and forks.
- [ ] Reclaim only eligible unused storage, including data that becomes unused after lifecycle changes.
- [ ] Keep reference accounting accurate for native-editor use and restored composer drafts.
- [ ] Report cleanup failures without deleting required contents or concealing partial outcomes.
- [ ] Verify retained bytes and successful subsequent restore/undo/read operations at the public host boundary using temporary storage.
