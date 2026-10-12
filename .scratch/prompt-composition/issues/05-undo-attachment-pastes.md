# 05: Compose attachment pastes as one undoable edit

**What to build:** Replace a selected composer range with a text attachment and undo/redo the whole action once.

**Blocked by:** 01: pi-composer: edit and submit source drafts; 04: pi-paste: route text pastes and explicit overrides.

**Status:** ready-for-agent

- [ ] Load pi-composer, pi-paste, and pi-attachments as separate extensions and paste large text over a selected range.
- [ ] Preserve the snapshot before discarding selected text; text replacement and attachment membership commit as one edit.
- [ ] One undo restores the original text and membership; one redo reapplies the attachment without duplicating it or losing its contents.
- [ ] Keep paste policy, editor mutation ownership, and stored contents within their specified packages.
- [ ] Cover native extension paste as well as terminal paste and preserve unrelated edits when preparation finishes asynchronously.
- [ ] Demonstrate handoff and capability availability through existing public Pi contracts without assuming shared dependency instances.
- [ ] Verify visible text, membership, and readable files at the host boundary. An unavailable atomic handoff remains an explicit blocker, not a completed feature.
