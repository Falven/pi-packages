# 07: Preserve draft selection through previews and extension pickers

**What to build:** Preview redraws and focused native UI preserve the selected draft; choosing an action changes it exactly once through the active editor.

**Blocked by:** None.

**Status:** complete

**Specifications:** [pi-attachments](../../../docs/specs/pi-attachments.md), [pi-skill-references](../../../docs/specs/pi-skill-references.md), [pi-composer](../../../docs/specs/pi-composer.md).

- [x] Full and partial selections survive native image-widget loading, refresh, invalidation, errors, resize, scrolling, and view changes. Typing afterwards replaces precisely that range and undo restores it.
- [x] Attachment management, text previews, and extension-owned skill pickers retain focus and native navigation/accept/cancel routing; their keys cause no background movement or submission.
- [x] Cancelling a picker or closing a preview returns to the unchanged draft and selection. Accepting a canonical skill insertion uses public text APIs and one editor history entry; later provider updates remain effective.
- [x] Restore Inline and removal preserve atomic text/membership history and retained snapshot bytes while native widgets and completion providers coexist.
- [x] Reuse the existing native widget, Image, overlay, and provider contracts. Verify through public-host scenarios with both views and native-editor independence where applicable.
