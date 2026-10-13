# 02: Preserve empty edits and limit projection work

**What to build:** Native empty insertion and boundary deletion leave the draft intact, and ordinary edits avoid work on unrelated Markdown.

**Blocked by:** None (can start immediately).

**Status:** complete

**Specification:** [pi-composer](../../../docs/specs/pi-composer.md).

- [x] Empty insertion and public paste preserve selected text, selection, history, and native callback behavior. Cut still deletes the selected source after successful copying.
- [x] Boundary Backspace/Delete does not commit an unchanged draft or divert a pending clipboard paste into recovery.
- [x] Formatted replacement skips Markdown elements outside the selection while preserving nested formatting, delimiters, and undo/redo.
- [x] Character deletion uses source grapheme boundaries without building a second whole-document projection.
- [x] Verify through existing public-host editing and clipboard checks; repeat selected-character, deletion, and caret-movement measurements.

**Verification:** The full suite passes all 708 tests, including empty clipboard input, delayed paste after boundary deletion, cut, Unicode, formatted replacement, and undo. An assert-based comparison matched the previous replacement behavior across 4,008 sampled ranges and source deletion across 202 positions. Local public-host probes measured selected-character replacement in a 26 KB formatted draft at about 17 ms, compared with about 150 ms before the change; Backspace in a 52 KB draft took about 29–30 ms. Cached caret movement averaged under 2 ms across the measured drafts. These measurements are diagnostic, not timing guarantees.
