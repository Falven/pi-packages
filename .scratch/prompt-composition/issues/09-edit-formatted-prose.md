# 09: pi-composer: edit formatted prose and source

**What to build:** Edit live paragraph, heading, emphasis, strikethrough, and link formatting with a shared source-view toggle.

**Blocked by:** 01: pi-composer: edit and submit source drafts.

**Status:** in-progress

- [ ] Render supported prose formatting inside the editable draft using Pi's parser, themes, and terminal layout services.
- [ ] Formatted and source views share one document, selection, and history; changing views does not create a content edit.
- [ ] Map caret movement, selections, and edits to the correct source positions across graphemes, terminal widths, and wrapping.
- [ ] Equivalent Markdown normalization may occur without changing meaning, code contents, reference text, or constructs displayed as source.
- [ ] Typing over formatted selections changes the intended Markdown range, and undo/redo works across view switches.
- [ ] Verify visible formatted output and exported Markdown at the public host boundary; inspect editing in real Ghostty fullscreen mode.
