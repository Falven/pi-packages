# 08: pi-composer: copy, cut, and paste selections

**What to build:** Use familiar clipboard shortcuts on the selected Markdown text without losing edits.

**Blocked by:** 01: pi-composer: edit and submit source drafts.

**Status:** implemented; final acceptance pending

- [x] Cmd+C copies selected Markdown as plain text; Cmd+X copies before deleting; Cmd+V inserts at the caret or replaces the selected range.
- [x] Clipboard failure leaves selected content intact and reports the failure.
- [x] Cut and paste share grouped undo/redo; copied canonical references remain portable ordinary text.
- [x] Paste enters the existing native paste route so independently installed paste policy can apply without a composer-specific interface.
- [x] A delayed clipboard read stays associated with its original draft and range; preserve later unrelated edits and keep conflicting results recoverable.
- [ ] Verify observable selection, clipboard text, history, and native shortcut priority through public-boundary tests and real Ghostty/macOS clipboard checks.

Automated acceptance: integration `a22accf`; formatting, lint, type checks, and 143 public-boundary tests pass. Final combined and terminal acceptance remain pending.
