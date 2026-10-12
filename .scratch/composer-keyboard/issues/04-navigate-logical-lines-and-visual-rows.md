# 04: pi-composer: navigate drafts, lines, visual rows, and prompt history

**What to build:** Draft and line shortcuts reach their respective boundaries, while vertical movement follows visual rows, selection remains anchored, and native history stays usable.

**Blocked by:** [01: pi-composer: honor native bindings and picker priority](01-honor-native-bindings-and-picker-priority.md).

**Status:** complete

**Specifications:** [pi-composer](../../../docs/specs/pi-composer.md).

- [x] Native line-start/end actions and available Cmd+Left/Right aliases reach the current logical line's boundaries in both views, even when the line wraps.
- [x] Cmd+Up/Down reach the draft's beginning/end in both views; Shift extends selection to that boundary. These fixed actions yield to effective native bindings and accepted extension shortcuts, independently of line-action alias suppression.
- [x] Vertical movement follows visual rows, preserves the preferred display column where possible, and respects tabs, wide characters, combining characters, emoji, and hidden Markdown delimiters.
- [x] An extra Up on the first visual row reaches its beginning; an extra Down on the last visual row reaches its end. Ordinary Up enters history only once the caret is already at the draft's beginning, with native empty-editor and active-history behavior preserved.
- [x] Shift movement retains the original anchor and stays inside the draft at boundaries. Effective full-chord actions win before deriving shifted movement, and suppressed aliases generate no shifted fallback.
- [x] Explicit prompt-history bindings and native Option+Up/Down application behavior remain effective. Verify observable caret/selection edits and history results through the public host.
