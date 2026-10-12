# 05: Compose attachment pastes as one undoable edit

**What to build:** Replace a selected composer range with a text attachment and undo/redo the whole action once.

**Blocked by:** 01: pi-composer: edit and submit source drafts; 04: pi-attachments: route text pastes and explicit overrides.

**Status:** complete

- [x] Load pi-composer and pi-attachments as separate extensions and paste large text over a selected range.
- [x] Preserve the snapshot before discarding selected text; text replacement and attachment membership commit as one edit.
- [x] One undo restores the original text and membership; one redo reapplies the attachment without duplicating it or losing its contents.
- [x] Keep paste policy, editor mutation ownership, and stored contents within their specified packages.
- [x] Cover native extension paste as well as terminal paste and preserve unrelated edits when preparation finishes asynchronously.
- [x] Demonstrate attachment insertion and combined history through existing public Pi editor contracts.
- [x] Verify visible text, membership, and readable files at the host boundary. Ordinary Markdown attachment references make text and membership share the same editor transaction.
