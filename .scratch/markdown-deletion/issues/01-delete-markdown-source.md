# 01: delete Markdown source through native editing actions

**What to build:** Character, word, line, and selection deletion edit the underlying Markdown using Pi's ordinary text behavior in both composer views. The existing parser renders the resulting source immediately, and recovery restores the actual removed text.

**Blocked by:** None (can start immediately).

**Status:** implemented; manual acceptance pending

**Specification:** [pi-composer](../../../docs/specs/pi-composer.md); [live Markdown editing](../../../docs/adr/0004-pi-composer-live-markdown-editing.md); [one Markdown text state](../../../docs/adr/0005-pi-composer-one-markdown-text-state.md); [native editing actions](../../../docs/adr/0009-pi-composer-native-editing-actions.md).

- [x] Delete literal source ranges, including hidden syntax, with native character, word, line, and selection behavior in both views. Preserve configured bindings, graphemes, tabs, and newline joins.
- [x] Reach actual source boundaries through logical-line and document-boundary navigation before deleting.
- [x] Let the existing parser render remaining and repaired syntax immediately for prose, nested Markdown, links, attachment references, and code.
- [x] Preserve exact deleted source in yank and yank-pop, cut/copy consistency, grouped undo/redo, and attachment membership recovery without changing retained files.
- [x] Preserve formatted typing, insertion, paste, completion, and surrounding Pi dispatch through the existing public host checks.
- [x] Verify the specified examples and recovery through the public Pi editor/session boundary, using native editing behavior as the oracle.
- [ ] Manually check deletion and syntax repair in Ghostty after package reload.

**Failure evidence:** Backspace at the end of `**bold**` produced `**bol**`, deleting visible content while preserving hidden delimiters. The public-host regression now produces `**bold*`, and typing the missing marker restores the original source and formatting. Word-deletion and endpoint-navigation regressions also failed before their fixes.

**Validation:** On 2026-10-12, all 698 repository tests passed on Node 24.13.1, along with formatting, lint, typechecking, and diff checks. The public Pi host checks cover immediate parser output, literal selection deletion, native bindings, cut/copy, yank, undo/redo, attachment membership, unchanged image bytes, and the submitted image payload. The repository fixtures use Pi 1.0.2; seven source-deletion examples also matched the installed local Pi 1.1.0 native editor. Independent standards and specification reviews reported no findings. Physical Ghostty deletion and repair remain pending.
