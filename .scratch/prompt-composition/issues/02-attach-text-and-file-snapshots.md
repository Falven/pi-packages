# 02: pi-attachments: attach text and file snapshots

**What to build:** Add explicit text/file attachments in native Pi, see their membership, and submit readable snapshots.

**Blocked by:** None (can start immediately).

**Status:** complete

- [x] Explicit native actions attach text or an existing file with pi-composer and pi-paste absent.
- [x] Preserve contents before inserting a usable attachment reference; editing or removing the original source cannot change the snapshot.
- [x] Show draft attachment membership through native UI facilities while preserving other registered widgets and actions.
- [x] Submit readable snapshot references without expanding text/file bodies into the prompt, including a request consisting entirely of attachments.
- [x] Ordinary file references continue to identify current source files and remain distinct from snapshot references.
- [x] Read/write failures preserve the draft and report recoverable errors; asynchronous results stay with their requesting draft and do not overwrite subsequent edits.
- [x] Test addition, source changes, visible membership, native submission, and retained bytes through Pi's public editor/session boundary with temporary storage and controlled model responses.
