# 07: pi-composer: preserve native completions and editor actions

**What to build:** Use native/custom pickers and external editing without splitting the draft or its undo history.

**Blocked by:** 01: pi-composer: edit and submit source drafts.

**Status:** implemented; real-terminal acceptance pending

- [x] Native file/directory completion retains filtering, quoting, navigation, completion edits, and cursor placement.
- [x] Consume effective autocomplete providers registered before and after composer activation; preserve wrapper order, cancellation, and later updates.
- [x] Custom pickers insert ordinary editable reference text through native APIs and can be undone as a coherent action.
- [x] An open picker accepts its selection before Enter can submit; leading commands, argument completion, and application actions retain native behavior.
- [x] Native insertion, replacement, extension paste, and external-editor results reach the same draft and appropriate history. Replacement is distinct from paste policy.
- [x] Verify provider and external-editor actions through the public Pi host boundary.
- [ ] Verify real Ghostty picker interaction and external-editor return.
