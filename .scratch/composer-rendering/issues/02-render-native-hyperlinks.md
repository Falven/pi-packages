# 02: pi-composer: render native hyperlinks

**What to build:** Recognized URLs and Markdown link text open through the terminal's native gesture while remaining editable in the shared Markdown draft.

**Blocked by:** None (can start immediately).

**Status:** implemented; manual acceptance pending

**Specification:** [pi-composer](../../../docs/specs/pi-composer.md); [native contracts](../../../docs/adr/0001-preserve-pi-extension-contracts.md); [live Markdown editing](../../../docs/adr/0004-pi-composer-live-markdown-editing.md).

- [x] Preserve parser destinations for plain URLs, autolinks, inline links, and reference-style labels, including nested formatting, lists, quotes, and wrapped Unicode text.
- [x] Use Pi's hyperlink helper and effective capability detection. Source view retains literal Markdown, and formatted view links the rendered label.
- [x] Keep hyperlink sequences out of draft text, clipboard text, history, persistence, and submitted Markdown; code retains literal presentation.
- [x] Close hyperlinks before unrelated text and row ends. Destination edits, undo, and view changes update the clickable cells without changing selection.
- [x] Empty destinations and destinations containing control characters remain editable without hyperlink output; disabling native hyperlink capability preserves visible text.
- [x] Verify terminal hyperlink output and resulting Markdown through the existing public Pi host boundary, including ordinary mouse editing and selection.
- [ ] Manually verify Shift+Cmd+click opening plain URLs and rendered Markdown links in real Ghostty; record physical results separately from automated rendering checks.

**Automated validation:** On 2026-10-12, all 687 workspace tests passed on Node 24.13.1, together with formatting, lint, and typechecking. Public-host checks inspect link destinations at rendered cells in both views, wrapped Unicode labels, ordinary mouse edits, clipboard and submitted Markdown, destination changes and undo, capability-disabled output, literal code, and control-bearing destinations. Physical activation and hover feedback await user testing.
