# 21: pi-attachments: clean up unused snapshots safely

**What to build:** Explicitly reclaim proven-unused capture or staging data while retaining every snapshot added to a draft.

**Blocked by:** 20: Restore complete drafts with attachment membership.

**Status:** complete

- [x] Provide an explicit native cleanup action; do not introduce automatic expiry.
- [x] Retain every snapshot that has entered a draft, including contents potentially held in hidden undo/redo, saved drafts, submissions, and forks.
- [x] Reclaim only proven-unused capture or staging data, including abandoned data after retries or lifecycle changes; preserve pending writes, recoverable contents, and uncertain data.
- [x] Track cleanup eligibility within attachment-owned storage without relying on another editor's history or a complete global session inventory. Preserve native-editor and restored composer references.
- [x] Report cleanup failures without deleting required contents or concealing partial outcomes.
- [x] Verify retained bytes and successful subsequent restore/undo/read operations at the public host boundary using temporary storage.

Integration evidence: `89c6f21`; all 437 combined tests and all required checks pass. Native cleanup reclaims more than 132,768 proven-unused bytes while preserving snapshots, pending writes, recovery records and uncertain contents. Eleven additional public-command probes verify damaged/missing records and symlink handling. Restore Inline, native/composer undo, restart, recovery and saved/forked references stay usable. Project terminal acceptance is tracked by [ticket 22](22-compose-and-resume-mixed-requests.md).

Final verification: [shared results](../verification.md).
