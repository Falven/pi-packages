# 05: pi-composer: restore character jumps and editor paging

**What to build:** Configured native character jumps and editor paging navigate the shared draft without taking keys owned by Pi's fullscreen viewport.

**Blocked by:** [04: pi-composer: navigate lines, visual rows, and prompt history](04-navigate-logical-lines-and-visual-rows.md).

**Status:** complete

**Specifications:** [pi-composer](../../../docs/specs/pi-composer.md).

- [x] Forward/backward jump awaits a printable target and reaches its next/previous occurrence across logical lines. No match leaves the caret unchanged; repeating a jump key cancels; control input cancels and resumes native dispatch.
- [x] Formatted jumps target visible text and preserve grapheme boundaries; source-view jumps use editable source. Navigation does not introduce a content edit or damage undo history.
- [x] Editor page actions delivered by the host move by the visible editor page with appropriate preferred-column and boundary behavior, including wrapped and Unicode rows.
- [x] Fullscreen PageUp/Down and other viewport-owned input retain native ownership. Remapped editor page actions work when delivered to the composer.
- [x] Verify default and configured actions through the existing public host, in both views and across editor heights, wrapping, empty drafts, and draft boundaries.

Verify at the approved public Pi editor/session boundary. Record physical terminal checks separately from delivered-input behavior.

## Verification

Seventeen public-host scenarios cover default and configured character jumps, cross-line searches, misses and cancellation, draft replacement, grapheme-safe targets, hidden Markdown, page sizes at two terminal heights, wrapped rows, preferred columns, and empty/outer boundaries in both views. Initial jump tests inserted the target instead of navigating; initial page tests stayed on the same row; a pending jump survived draft replacement. Each regression now passes.

- `node --test packages/pi-composer/test/jump-page.test.ts packages/pi-composer/test/navigation.test.ts packages/pi-composer/test/native-keybindings.test.ts packages/pi-composer/test/native-editor-actions.test.ts packages/pi-composer/test/completions.test.ts`: 63 passed on Node 26.8.1 with the locked Pi 1.0.2 host.
- Composer type checking, lint, formatting, and `git diff --check`: passed.

Pi's fullscreen viewport retains PageUp/Down and Home/End. Delivered editor paging is verified through default Ctrl+PageUp/Down and configured Ctrl+Alt+P/N. Physical Ghostty delivery remains the acceptance gate in ticket 08.
