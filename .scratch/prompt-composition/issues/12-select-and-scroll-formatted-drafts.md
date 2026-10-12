# 12: pi-composer: select and scroll formatted drafts

**What to build:** Use the mouse and keyboard across wrapped formatted content in Pi's fullscreen layout.

**Blocked by:** 10: pi-composer: edit lists, quotes, and rules; 11: pi-composer: edit inline and fenced code.

**Status:** implemented; real-terminal acceptance pending

- [x] Mouse and keyboard selection identify the same source ranges across formatted prose, lists, quotes, and code.
- [x] Replace selected text accurately across wrapped lines, combining characters, emoji, and wide characters.
- [x] Keep caret and selection usable while scrolling or resizing the terminal.
- [x] Use Pi's fullscreen mouse routing and scrolling facilities while preserving surrounding widgets, overlays, header/footer content, and native controls.
- [x] Test visible selection, resulting Markdown, native focus, capture, scrolling, resizing, and surrounding UI at the public host boundary.
- [ ] Verify mouse behavior and fullscreen coexistence in real Ghostty/macOS.
