# 01: pi-composer: honor native hardware-cursor display

**What to build:** The composer follows Pi's Show hardware cursor setting in source and formatted views, allowing the terminal's configured cursor shape and blinking while keeping draft selection visible.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

**Specification:** [pi-composer](../../../docs/specs/pi-composer.md); [native contracts](../../../docs/adr/0001-preserve-pi-extension-contracts.md); [live Markdown editing](../../../docs/adr/0004-pi-composer-live-markdown-editing.md).

- [ ] Use the supplied TUI's effective hardware-cursor setting and native positioning marker. A hardware cursor replaces the drawn caret; disabling it restores the drawn caret.
- [ ] Preserve selection highlighting, source text, and history when changing cursor display, switching views, scrolling, resizing, or moving through wrapped Unicode text.
- [ ] Preserve native focus ownership and keep a background composer from drawing an active caret.
- [ ] Verify emitted cursor positioning, selection, and editing through the existing public Pi host boundary.
- [ ] Manually verify blinking and terminal cursor shape in real Ghostty, including line ends, both views, resizing, and focus returning from native UI.
