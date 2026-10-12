# 08: pi-composer: copy, cut, and paste selections

**What to build:** Use familiar clipboard shortcuts on the selected Markdown text without losing edits.

**Blocked by:** 01: pi-composer: edit and submit source drafts.

**Status:** in-progress

- [ ] Cmd+C copies selected Markdown as plain text; Cmd+X copies before deleting; Cmd+V inserts at the caret or replaces the selected range.
- [ ] Clipboard failure leaves selected content intact and reports the failure.
- [ ] Cut and paste share grouped undo/redo; copied canonical references remain portable ordinary text.
- [ ] Paste enters the existing native paste route so independently installed paste policy can apply without a composer-specific interface.
- [ ] A delayed clipboard read stays associated with its original draft and range; preserve later unrelated edits and keep conflicting results recoverable.
- [ ] Verify observable selection, clipboard text, history, and native shortcut priority through public-boundary tests and real Ghostty/macOS clipboard checks.
