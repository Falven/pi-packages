# 07: Preserve draft selection through previews and extension pickers

**What to build:** Preview redraws and focused native UI preserve the selected draft; choosing an action changes it exactly once through the active editor.

**Blocked by:** None.

**Status:** ready-for-agent

**Specifications:** [pi-attachments](../../../docs/specs/pi-attachments.md), [pi-skill-references](../../../docs/specs/pi-skill-references.md), [pi-composer](../../../docs/specs/pi-composer.md).

- [ ] Full and partial selections survive native image-widget loading, refresh, invalidation, errors, resize, scrolling, and view changes. Typing afterwards replaces precisely that range and undo restores it.
- [ ] Attachment management, text previews, and extension-owned skill pickers retain focus and native navigation/accept/cancel routing; their keys cause no background movement or submission.
- [ ] Cancelling a picker or closing a preview returns to the unchanged draft and selection. Accepting a canonical skill insertion uses public text APIs and one editor history entry; later provider updates remain effective.
- [ ] Restore Inline and removal preserve atomic text/membership history and retained snapshot bytes while native widgets and completion providers coexist.
- [ ] Reuse the existing native widget, Image, overlay, and provider contracts. Verify through public-host scenarios with both views and native-editor independence where applicable; change implementation only where acceptance reveals a gap.

Verify at the approved public Pi editor/session boundary. Record physical terminal checks separately from delivered-input behavior.
