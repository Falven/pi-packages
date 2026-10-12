# 16: pi-skill-references: complete inline skill references

**What to build:** Select skills with $ or inline / while retaining native and custom picker behavior.

**Blocked by:** 03: pi-skill-references: invoke canonical inline skills.

**Status:** in-progress

- [ ] Prose-position triggers offer skills from Pi's effective catalog; inline / uses Tab in the native editor and opens automatically in pi-composer. Accepting a suggestion inserts canonical native skill text at the correct range and caret.
- [ ] Unaccepted shorthand stays literal and completed references remain character-editable and copyable.
- [ ] Reuse effective native provider/picker services and preserve custom picker text insertion, wrapper order, later updates, cancellation, and stale-result handling.
- [ ] A selected skill sharing a display name with a command retains its qualified skill identity; leading commands and argument completion retain native dispatch.
- [ ] Native file/directory completion remains effective, and catalog filtering, availability, and resource precedence stay native.
- [ ] Verify completion through submission with the native editor, including providers installed before and after the extension; use real Ghostty checks for picker and custom-insertion interaction.
