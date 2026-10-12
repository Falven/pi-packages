# 04: pi-composer: navigate lines, visual rows, and prompt history

**What to build:** Line shortcuts and vertical movement reach the intended positions while shifted movement remains anchored and native history remains usable.

**Blocked by:** [01: pi-composer: honor native bindings and picker priority](01-honor-native-bindings-and-picker-priority.md).

**Status:** complete

**Specifications:** [pi-composer](../../../docs/specs/pi-composer.md).

- [x] Native line-start/end actions and available Cmd+Left/Right and Cmd+Up/Down aliases reach the current logical line's boundaries in both views, even when the line wraps.
- [x] Vertical movement follows visual rows, preserves the preferred display column where possible, and respects tabs, wide characters, combining characters, emoji, and hidden Markdown delimiters.
- [x] An extra Up on the first visual row reaches its beginning; an extra Down on the last visual row reaches its end. Ordinary Up enters history only once the caret is already at the draft's beginning, with native empty-editor and active-history behavior preserved.
- [x] Shift movement retains the original anchor and stays inside the draft at boundaries. Effective full-chord actions win before deriving shifted movement, and suppressed aliases generate no shifted fallback.
- [x] Explicit prompt-history bindings and native Option+Up/Down application behavior remain effective. Verify observable caret/selection edits and history results through the public host.

Verify at the approved public Pi editor/session boundary. Record physical terminal checks separately from delivered-input behavior.

## Verification

Eleven added public-host scenarios cover logical line aliases, wrapped lines, outer-row arrows, prompt history, anchored selection, configured actions, and preferred display columns through tabs and Unicode in both views. Four regressions failed before their fixes: Cmd+Up reached the draft's beginning, outer arrows kept the old column, Up failed to continue active history after horizontal movement, and a native movement binding containing Shift incorrectly selected text. Each now passes. Existing document-position test setup uses whole-draft selection and collapse.

- `node --test --test-timeout=20000 packages/pi-composer/test/navigation.test.ts packages/pi-composer/test/source-drafts.test.ts packages/pi-composer/test/selection-scroll.test.ts packages/pi-composer/test/structured-markdown.test.ts packages/pi-composer/test/code-markdown.test.ts packages/pi-composer/test/formatted-prose.test.ts packages/pi-composer/test/native-keybindings.test.ts packages/pi-composer/test/mixed-composition.test.mjs`: 132 passed on Node 26.8.1 with the locked Pi 1.0.2 host, including native Option+Up dequeue and explicit prompt-history bindings.
- Focused lint, composer type checking, formatting, and `git diff --check`: passed.

Pi's fullscreen viewport retains Home/End; delivered line-action checks use Ctrl+A/E and the applicable Cmd aliases. These tests establish delivered-input behavior. Physical Ghostty input remains the acceptance gate in ticket 08.
