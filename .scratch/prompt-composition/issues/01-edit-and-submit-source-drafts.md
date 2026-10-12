# 01: pi-composer: edit and submit source drafts

**What to build:** Edit a multiline Markdown source draft with keyboard selection, grouped undo/redo, and native submission.

**Blocked by:** None (can start immediately).

**Status:** complete

- [x] Load pi-composer through Pi and edit one authoritative Markdown text document through the public editor contract.
- [x] Move by character, word, line, and document; select ranges, select all, replace selections, and delete text without splitting graphemes or corrupting wrapped wide characters.
- [x] Cmd+Z and Cmd+Shift+Z undo and redo coherent edits; a fresh edit after undo abandons the old redo branch.
- [x] Enter submits ordinary prose, Shift+Enter inserts a newline, and Cmd+Enter submits explicitly; native application shortcut priority and follow-up actions remain effective.
- [x] Native text reads and replacements reach the same draft. Replacing or typing a long document keeps it inline.
- [x] Verify observable draft and submitted content through Pi's public editor/session boundary using the existing Node test runner.
- [x] The user reports successful shortcut testing in Ghostty, including corrected Cmd+Up/Down draft navigation, on 2026-10-12. The [terminal acceptance ticket](../../composer-keybinds/issues/03-verify-keybindings-in-ghostty.md) separates this result from the broader physical matrix.
- [x] Reuse Pi services and public runtime APIs while preserving one authoritative Markdown text state and history.
