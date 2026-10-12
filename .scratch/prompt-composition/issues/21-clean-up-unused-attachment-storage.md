# 21: pi-attachments: clean up unused snapshots safely

**What to build:** Explicitly reclaim proven-unused capture or staging data while retaining every snapshot added to a draft.

**Blocked by:** 20: Restore complete drafts with attachment membership.

**Status:** in-progress

- [ ] Provide an explicit native cleanup action; do not introduce automatic expiry.
- [ ] Retain every snapshot that has entered a draft, including contents potentially held in hidden undo/redo, saved drafts, submissions, and forks.
- [ ] Reclaim only proven-unused capture or staging data, including abandoned data after retries or lifecycle changes; preserve pending writes, recoverable contents, and uncertain data.
- [ ] Track cleanup eligibility within attachment-owned storage without relying on another editor's history or a complete global session inventory. Preserve native-editor and restored composer references.
- [ ] Report cleanup failures without deleting required contents or concealing partial outcomes.
- [ ] Verify retained bytes and successful subsequent restore/undo/read operations at the public host boundary using temporary storage.
