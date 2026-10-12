# 01: delete Markdown source through native editing actions

**What to build:** Character, word, line, and selection deletion edit the underlying Markdown using Pi's ordinary text behavior in both composer views. The existing parser renders the resulting source immediately, and recovery restores the actual removed text.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

**Specification:** [pi-composer](../../../docs/specs/pi-composer.md); [live Markdown editing](../../../docs/adr/0004-pi-composer-live-markdown-editing.md); [one Markdown text state](../../../docs/adr/0005-pi-composer-one-markdown-text-state.md); [native editing actions](../../../docs/adr/0009-pi-composer-native-editing-actions.md).

- [ ] Delete literal source ranges, including hidden syntax, with native character, word, line, and selection behavior in both views. Preserve configured bindings, graphemes, tabs, and newline joins.
- [ ] Reach actual source boundaries through logical-line and document-boundary navigation before deleting.
- [ ] Let the existing parser render remaining and repaired syntax immediately for prose, nested Markdown, links, attachment references, and code.
- [ ] Preserve exact deleted source in yank and yank-pop, cut/copy consistency, grouped undo/redo, and attachment membership recovery without changing retained files.
- [ ] Preserve formatted typing, insertion, paste, completion, and surrounding Pi dispatch through the existing public host checks.
- [ ] Verify the specified examples and recovery through the public Pi editor/session boundary, using native editing behavior as the oracle.
- [ ] Manually check deletion and syntax repair in Ghostty after package reload.
