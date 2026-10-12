# 10: pi-composer: edit lists, quotes, and rules

**What to build:** Edit structured Markdown and continue lists without accidentally submitting the draft.

**Blocked by:** 09: pi-composer: edit formatted prose and source.

**Status:** implemented; real-terminal acceptance pending

- [x] Quotes, lists, task lists, and horizontal rules display their structure while their source remains editable.
- [x] Nested and wrapped structures preserve correct caret/selection mapping and surrounding Markdown.
- [x] Enter continues the list being edited; Shift+Enter inserts a newline and Cmd+Enter submits explicitly.
- [x] Structural edits and source-view changes share existing undo history and preserve constructs outside the formatted subset.
- [ ] Verify user-visible structured editing and Enter behavior through the public Pi boundary and real Ghostty.

Integration evidence: `dd2e5fb`; 17 structured Markdown scenarios and all 254 combined tests pass, with formatting, lint, and root/composer typechecks. Real terminal structured editing and selection/Enter checks remain pending.

Final verification: [shared results](../verification.md).
