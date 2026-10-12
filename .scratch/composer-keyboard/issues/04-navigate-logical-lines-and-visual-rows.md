# 04: pi-composer: navigate lines, visual rows, and prompt history

**What to build:** Line shortcuts and vertical movement reach the intended positions while shifted movement remains anchored and native history remains usable.

**Blocked by:** [01: pi-composer: honor native bindings and picker priority](01-honor-native-bindings-and-picker-priority.md).

**Status:** ready-for-agent

**Specifications:** [pi-composer](../../../docs/specs/pi-composer.md).

- [ ] Native line-start/end actions and available Cmd+Left/Right and Cmd+Up/Down aliases reach the current logical line's boundaries in both views, even when the line wraps.
- [ ] Vertical movement follows visual rows, preserves the preferred display column where possible, and respects tabs, wide characters, combining characters, emoji, and hidden Markdown delimiters.
- [ ] An extra Up on the first visual row reaches its beginning; an extra Down on the last visual row reaches its end. Ordinary Up enters history only once the caret is already at the draft's beginning, with native empty-editor and active-history behavior preserved.
- [ ] Shift movement retains the original anchor and stays inside the draft at boundaries. Effective full-chord actions win before deriving shifted movement, and suppressed aliases generate no shifted fallback.
- [ ] Explicit prompt-history bindings and native Option+Up/Down application behavior remain effective. Verify observable caret/selection edits and history results through the public host.

Verify at the approved public Pi editor/session boundary. Record physical terminal checks separately from delivered-input behavior.
