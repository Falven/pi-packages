# 02: pi-composer: render native hyperlinks

**What to build:** Recognized URLs and Markdown link text open through the terminal's native gesture while remaining editable in the shared Markdown draft.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

**Specification:** [pi-composer](../../../docs/specs/pi-composer.md); [native contracts](../../../docs/adr/0001-preserve-pi-extension-contracts.md); [live Markdown editing](../../../docs/adr/0004-pi-composer-live-markdown-editing.md).

- [ ] Preserve parser destinations for plain URLs, autolinks, inline links, and reference-style labels, including nested formatting, lists, quotes, and wrapped Unicode text.
- [ ] Use Pi's hyperlink helper and effective capability detection. Source view retains literal Markdown, and formatted view links the rendered label.
- [ ] Keep hyperlink sequences out of draft text, clipboard text, history, persistence, and submitted Markdown; code retains literal presentation.
- [ ] Close hyperlinks before unrelated text and row ends. Destination edits, undo, and view changes update the clickable cells without changing selection.
- [ ] Empty destinations and destinations containing control characters remain editable without hyperlink output; disabling native hyperlink capability preserves visible text.
- [ ] Verify terminal hyperlink output and resulting Markdown through the existing public Pi host boundary, including ordinary mouse editing and selection.
- [ ] Manually verify Shift+Cmd+click opening plain URLs and rendered Markdown links in real Ghostty; record physical results separately from automated rendering checks.
