# 11: pi-composer: edit inline and fenced code

**What to build:** Read and edit code inside the draft while preserving its contents and contextual Enter behavior.

**Blocked by:** 09: pi-composer: edit formatted prose and source.

**Status:** implemented; real-terminal acceptance pending

- [x] Inline and fenced code have readable live presentation while their complete contents remain editable.
- [x] Preserve indentation, whitespace, delimiters, and example text when editing, wrapping, or changing views.
- [x] Enter within fenced code continues the block; Shift+Enter inserts a newline and Cmd+Enter submits explicitly.
- [x] Code examples containing file/skill-like text remain ordinary source for editing; formatting does not create hidden references.
- [x] Selection replacement and undo/redo restore accurate code contents.
- [x] Use public Pi highlighting/rendering services and verify exported source, visible output, and contextual Enter through the host boundary.
- [ ] Verify code presentation, selection, and contextual Enter in real Ghostty.
