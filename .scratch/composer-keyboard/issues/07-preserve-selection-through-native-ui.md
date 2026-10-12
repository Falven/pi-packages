# 07: Preserve draft selection through previews and extension pickers

**What to build:** Preview redraws and focused native UI preserve the selected draft; choosing an action changes it exactly once through the active editor.

**Blocked by:** None.

**Status:** complete

**Specifications:** [pi-attachments](../../../docs/specs/pi-attachments.md), [pi-skill-references](../../../docs/specs/pi-skill-references.md), [pi-composer](../../../docs/specs/pi-composer.md).

- [x] Full and partial selections survive native image-widget loading, refresh, invalidation, errors, resize, scrolling, and view changes. Typing afterwards replaces precisely that range and undo restores it.
- [x] Attachment management, text previews, and extension-owned skill pickers retain focus and native navigation/accept/cancel routing; their keys cause no background movement or submission.
- [x] Cancelling a picker or closing a preview returns to the unchanged draft and selection. Accepting a canonical skill insertion uses public text APIs and one editor history entry; later provider updates remain effective.
- [x] Restore Inline and removal preserve atomic text/membership history and retained snapshot bytes while native widgets and completion providers coexist.
- [x] Reuse the existing native widget, Image, overlay, and provider contracts. Verify through public-host scenarios with both views and native-editor independence where applicable; change implementation only where acceptance reveals a gap.

Verify at the approved public Pi editor/session boundary. Record physical terminal checks separately from delivered-input behavior.

## Verification

Twelve added public-host scenarios pass against the existing implementation; no runtime change was needed. Both views retain full and partial selection through delayed native image preview success/failure, invalidation, resize, scrolling, and view switches. Custom skill pickers, attachment selection, and text preview keep native focus; cancellation, insertion, Restore Inline, removal, and later provider updates retain the expected draft and history. Snapshot bytes remain unchanged.

- `node --test packages/pi-composer/test/native-ui-selection.test.mjs packages/pi-attachments/images.test.mjs packages/pi-attachments/text-actions.test.mjs packages/pi-composer/test/completions.test.ts packages/pi-composer/test/selection-scroll.test.ts`: 104 passed, including native-editor attachment coverage and native graphics output.
- `pnpm exec oxlint packages/pi-composer/test/native-ui-selection.test.mjs`: passed.
- Formatting checked for the added test and this ticket.

These checks observe delivered input and Pi rendering with a recording terminal. Physical Ghostty input and graphics remain the acceptance gate in ticket 08.
