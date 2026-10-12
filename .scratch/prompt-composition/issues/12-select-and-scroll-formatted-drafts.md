# 12: pi-composer: select and scroll formatted drafts

**What to build:** Use the mouse and keyboard across wrapped formatted content in Pi's fullscreen layout.

**Blocked by:** 10: pi-composer: edit lists, quotes, and rules; 11: pi-composer: edit inline and fenced code.

**Status:** implemented; final acceptance pending

- [x] Mouse and keyboard selection identify the same source ranges across formatted prose, lists, quotes, and code.
- [x] Replace selected text accurately across wrapped lines, combining characters, emoji, and wide characters.
- [x] Keep caret and selection usable while scrolling or resizing the terminal.
- [x] Use Pi's fullscreen mouse routing and scrolling facilities while preserving surrounding widgets, overlays, header/footer content, and native controls.
- [ ] Test visible selection and resulting Markdown at the public host boundary; verify mouse behavior and fullscreen coexistence in real Ghostty/macOS.

Integration evidence: `b8b9b03`; 13 selection/scrolling scenarios and all 387 combined tests pass on Pi 1.0.2, with formatting, lint, and root/composer typechecks. Mouse and keyboard source ranges, graphemes, wrapping, native capture/focus/scrolling, resizing, surrounding UI, completion priority, and theme invalidation are covered. Real Ghostty/macOS mouse acceptance remains pending.
