# 08: pi-composer: copy, cut, and paste selections

**What to build:** Use familiar clipboard shortcuts on the selected Markdown text without losing edits.

**Blocked by:** 01: pi-composer: edit and submit source drafts.

**Status:** implemented; real-terminal acceptance pending

- [x] Cmd+C copies selected Markdown as plain text; Cmd+X copies before deleting; Cmd+V inserts at the caret or replaces the selected range.
- [x] Clipboard failure leaves selected content intact and reports the failure.
- [x] Cut and paste share grouped undo/redo; copied canonical references remain portable ordinary text.
- [x] Paste enters the existing native paste route so independently installed paste policy can apply without a composer-specific interface.
- [x] A delayed clipboard read stays associated with its original draft and range; preserve later unrelated edits and keep conflicting results recoverable.
- [x] Public-boundary and combined-package checks verify selection, clipboard text, history, native priority, supplied handlers, and delayed-result recovery.
- [ ] Verify real Ghostty/macOS clipboard copy/cut/paste, including content readback and conditional terminal selection.
