# 05: pi-composer: restore character jumps and editor paging

**What to build:** Configured native character jumps and editor paging navigate the shared draft without taking keys owned by Pi's fullscreen viewport.

**Blocked by:** [04: pi-composer: navigate drafts, lines, visual rows, and prompt history](04-navigate-logical-lines-and-visual-rows.md).

**Status:** complete

**Specifications:** [pi-composer](../../../docs/specs/pi-composer.md).

- [x] Forward/backward jump awaits a printable target and reaches its next/previous occurrence across logical lines. No match leaves the caret unchanged; repeating a jump key cancels; control input cancels and resumes native dispatch.
- [x] Formatted jumps target visible text and preserve grapheme boundaries; source-view jumps use editable source. Navigation does not introduce a content edit or damage undo history.
- [x] Editor page actions delivered by the host move by the visible editor page with appropriate preferred-column and boundary behavior, including wrapped and Unicode rows.
- [x] Fullscreen PageUp/Down and other viewport-owned input retain native ownership. Remapped editor page actions work when delivered to the composer.
- [x] Verify default and configured actions through the existing public host, in both views and across editor heights, wrapping, empty drafts, and draft boundaries.
