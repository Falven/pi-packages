# 11: pi-composer: edit inline and fenced code

**What to build:** Read and edit code inside the draft while preserving its contents and contextual Enter behavior.

**Blocked by:** 09: pi-composer: edit formatted prose and source.

**Status:** implemented; final acceptance pending

- [x] Inline and fenced code have readable live presentation while their complete contents remain editable.
- [x] Preserve indentation, whitespace, delimiters, and example text when editing, wrapping, or changing views.
- [x] Enter within fenced code continues the block; Shift+Enter inserts a newline and Cmd+Enter submits explicitly.
- [x] Code examples containing file/skill-like text remain ordinary source for editing; formatting does not create hidden references.
- [x] Selection replacement and undo/redo restore accurate code contents.
- [ ] Use public Pi highlighting/rendering services and verify exported source, visible output, and Enter behavior through the host boundary and Ghostty.

Integration evidence: `96648f8`; all 318 combined tests, formatting, lint, and root/composer typechecks pass. The 26 code scenarios cover inline/fenced highlighting, whitespace and Unicode mapping, selection/history, contextual Enter, and native shortcut/completion priority. Real Ghostty/macOS acceptance remains pending.
