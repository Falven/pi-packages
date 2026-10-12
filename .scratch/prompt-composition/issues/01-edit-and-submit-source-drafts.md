# 01: pi-composer: edit and submit source drafts

**What to build:** Edit a multiline Markdown source draft with keyboard selection, grouped undo/redo, and native submission.

**Blocked by:** None (can start immediately).

**Status:** implemented; real-terminal acceptance pending

- [x] Load pi-composer through Pi and edit one authoritative Markdown text document through the public editor contract.
- [x] Move by character, word, line, and document; select ranges, select all, replace selections, and delete text without splitting graphemes or corrupting wrapped wide characters.
- [x] Cmd+Z and Cmd+Shift+Z undo and redo coherent edits; a fresh edit after undo abandons the old redo branch.
- [x] Enter submits ordinary prose, Shift+Enter inserts a newline, and Cmd+Enter submits explicitly; native application shortcut priority and follow-up actions remain effective.
- [x] Native text reads and replacements reach the same draft. Replacing or typing a long document keeps it inline.
- [ ] Verify observable draft and submitted content through Pi's public editor/session boundary using the existing Node test runner; verify required Command-key forwarding in real Ghostty on local macOS in fullscreen mode.
- [x] Reuse Pi services and public runtime APIs. Any state/history dependency must run without a browser view and preserve the authoritative text model.
