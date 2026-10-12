# 03: pi-composer: recover deletions with yank and yank-pop

**What to build:** Native retained-text recovery brings back word/line deletions, including formatted Markdown, through the same draft and undo history.

**Blocked by:** [02: pi-composer: delete words and logical lines](02-delete-words-and-logical-lines.md).

**Status:** complete

**Specifications:** [pi-composer](../../../docs/specs/pi-composer.md).

- [x] Retain exactly the deleted source, including Markdown syntax within the deleted range, in both views.
- [x] Consecutive backward deletions prepend and forward deletions append using native accumulation semantics. Intervening editing or movement ends accumulation.
- [x] Yank inserts the current retained entry at the caret or over the selection. Yank-pop rotates entries by replacing the immediately preceding yank or yank-pop and becomes inactive after unrelated editing or movement.
- [x] Exercise the specified literal source ranges, insertion into another formatting context, consecutive deletions, newline joins, and Unicode content.
- [x] Yank and yank-pop share the draft's history, selection, and attachment-membership behavior. Verify through public Pi input and observed source/undo results, using effective native bindings.
