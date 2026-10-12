# 05: Compose attachment pastes as one undoable edit

**What to build:** Replace a selected composer range with a text attachment and undo/redo the whole action once.

**Blocked by:** 01: pi-composer: edit and submit source drafts; 04: pi-paste: route text pastes and explicit overrides.

**Status:** complete

- [x] Load pi-composer, pi-paste, and pi-attachments as separate extensions and paste large text over a selected range.
- [x] Preserve the snapshot before discarding selected text; text replacement and attachment membership commit as one edit.
- [x] One undo restores the original text and membership; one redo reapplies the attachment without duplicating it or losing its contents.
- [x] Keep paste policy, editor mutation ownership, and stored contents within their specified packages.
- [x] Cover native extension paste as well as terminal paste and preserve unrelated edits when preparation finishes asynchronously.
- [x] Demonstrate handoff and capability availability through existing public Pi contracts without assuming shared dependency instances.
- [x] Verify visible text, membership, and readable files at the host boundary. An unavailable atomic handoff remains an explicit blocker, not a completed feature.

Integration evidence: `fc3e0da`; all 318 combined tests, formatting, lint, and root/composer typechecks pass. The 22 attachment scenarios cover capture before replacement, one-step undo/redo, retained bytes, native paste routes, late operations, and native decorators. Project terminal acceptance is tracked by [ticket 22](22-compose-and-resume-mixed-requests.md).

Final verification: [shared results](../verification.md).
