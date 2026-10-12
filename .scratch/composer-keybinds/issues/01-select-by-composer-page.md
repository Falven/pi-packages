# 01: pi-composer: extend selection by a visible page

**What to build:** Delivered Shift+PageUp/PageDown gestures extend or contract a selection by one visible composer page in source and formatted views. On the target Mac keyboard, these gestures are Shift+Fn+Up/Down.

**Blocked by:** None (can start immediately).

**Status:** complete

**Specification:** [Composer page selection](../../../docs/specs/pi-composer.md#page-selection), stories 65–70; [ADR 0009](../../../docs/adr/0009-pi-composer-native-editing-actions.md).

- [x] Derive selection gestures from effective native page-action bindings only after resolving any action that owns the full chord. Remapping or clearing an action removes its old derived gestures. An explicitly assigned shifted chord performs its native action's ordinary behavior.
- [x] Move the head by the current visible composer's editable visual rows, keeping the original anchor and preferred display column. Short rows, wrapping, hidden Markdown syntax, tabs, emoji, combining marks, and wide characters produce valid source positions and whole-grapheme selections.
- [x] Repeated gestures extend the same range; reversing direction contracts it before extending past the anchor. At draft boundaries, clamp to an available row and valid text position without entering prompt history.
- [x] Redraw, resize, view changes, and attachment-preview refresh preserve the source range and anchor. The next page gesture uses the current visible composer height.
- [x] Page movement makes no content edit. Typing, cut, and paste replace the selected range through the existing draft history; undo restores source, selection, and affected attachment membership.
- [x] Pi's fullscreen viewport, focused native UI, autocomplete, and accepted extension shortcuts retain their input. Unmodified native page movement continues to work, and each delivered chord causes at most one operation.
- [x] Reproduce the specified nine-line regression through the public Pi editor/session boundary: from column three of row0 with a seven-row composer viewport, Shift+PageDown followed by X produces rowX7 followed by row8. Undo restores the original source and selection. Cover upward movement and both views.
- [x] Extend existing public-host coverage for remapped and cleared page actions, explicit shifted-chord owners, visual mapping, boundaries, changing viewport sizes, and selection survival. Record delivered-input results separately from physical terminal acceptance.
- [x] Update delivered-feature documentation with page-selection behavior and its native binding ownership.
