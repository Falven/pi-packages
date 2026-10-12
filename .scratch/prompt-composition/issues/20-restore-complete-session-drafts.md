# 20: Restore complete drafts with attachment membership

**What to build:** Resume a composer draft with its matching text, attachments, and recoverable pending work.

**Blocked by:** 05: Compose attachment pastes as one undoable edit; 18: pi-composer: autosave session text drafts; 19: pi-attachments: retain snapshots across sessions.

**Status:** complete

- [x] Switch sessions or restart and restore matching text, reference text, attachment membership, and readable retained snapshots.
- [x] Keep session undo histories isolated; restarting clears history without deleting attachment contents.
- [x] Pending clipboard, attachment, or persistence work remains with the requesting draft and preserves later edits.
- [x] When an original insertion is no longer safe, retain its contents and report recovery context instead of applying it to another draft.
- [x] Failed restoration or submission cannot destroy the saved draft, retained files, or unrelated current work.
- [x] Drive real host lifecycle transitions with the loaded packages and assert visible drafts, membership, and readable files.

Integration evidence: `11c623c`; 393 combined tests and the external partial-file-capture probe pass on Pi 1.0.2, with formatting, lint, and root/composer typechecks. Complete mixed drafts survive switches, cwd changes, reload, forks and fresh processes. Captured members survive later read failures and source deletion; native recovery retrieves the group after reload. Model delivery order stays asserted independently of concurrent input preprocessing. Project terminal acceptance is tracked by [ticket 22](22-compose-and-resume-mixed-requests.md).

Final verification: [shared results](../verification.md).
