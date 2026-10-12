# 01: pi-composer: extend selection by a visible page

**What to build:** Delivered Shift+PageUp/PageDown gestures extend or contract a selection by one visible composer page in source and formatted views. On the target Mac keyboard, these gestures are Shift+Fn+Up/Down.

**Blocked by:** None (can start immediately).

**Status:** implemented; integration documentation pending

**Specification:** Composer specification, “Page selection” and “Setup and page-selection acceptance,” stories 65–70; ADR 0009.

- [x] Derive selection gestures from effective native page-action bindings only after resolving any action that owns the full chord. Remapping or clearing an action removes its old derived gestures. An explicitly assigned shifted chord performs its native action's ordinary behavior.
- [x] Move the head by the current visible composer's editable visual rows, keeping the original anchor and preferred display column. Short rows, wrapping, hidden Markdown syntax, tabs, emoji, combining marks, and wide characters produce valid source positions and whole-grapheme selections.
- [x] Repeated gestures extend the same range; reversing direction contracts it before extending past the anchor. At draft boundaries, clamp to an available row and valid text position without entering prompt history.
- [x] Redraw, resize, view changes, and attachment-preview refresh preserve the source range and anchor. The next page gesture uses the current visible composer height.
- [x] Page movement makes no content edit. Typing, cut, and paste replace the selected range through the existing draft history; undo restores source, selection, and affected attachment membership.
- [x] Pi's fullscreen viewport, focused native UI, autocomplete, and accepted extension shortcuts retain their input. Unmodified native page movement continues to work, and each delivered chord causes at most one operation.
- [x] Reproduce the specified nine-line regression through the public Pi editor/session boundary: from column three of row0 with a seven-row composer viewport, Shift+PageDown followed by X produces rowX7 followed by row8. Undo restores the original source and selection. Cover upward movement and both views.
- [x] Extend existing public-host coverage for remapped and cleared page actions, explicit shifted-chord owners, visual mapping, boundaries, changing viewport sizes, and selection survival. Record delivered-input results separately from physical terminal acceptance.
- [ ] Update delivered-feature documentation with page-selection behavior and its native binding ownership.

Physical Ghostty forwarding is verified in ticket 03; this ticket can complete using delivered input through the approved native Pi boundary.

## Verification

The nine-line regression failed in both views before the page handler was changed: delivered Shift+PageDown left the caret at row0. It now selects to row7, replacement produces rowX7 followed by row8, and undo restores the original draft and source range. The handler reuses the existing movement binding resolution, projection, selection, and draft history.

- `node --test packages/pi-composer/test/jump-page.test.ts packages/pi-composer/test/navigation.test.ts packages/pi-composer/test/native-keybindings.test.ts packages/pi-composer/test/completions.test.ts packages/pi-composer/test/native-ui-selection.test.mjs packages/pi-composer/test/clipboard.test.ts`: 112 passed on Node 26.8.1 with the locked Pi 1.0.2 host. These are delivered-input checks through Pi's public editor/session boundary.
- `pnpm typecheck`: passed. Focused lint and formatting checks for changed composer source and tests, plus `git diff --check`: passed.

Coverage includes selection replacement and contraction, wrapped rows, grapheme-safe Unicode/tab mapping, hidden Markdown, remapped/cleared bindings, explicitly owned shifted chords, extension and picker priority, updated page height after resize, selection across view changes, native image-preview refresh, attachment membership restoration, and clipboard cut/paste history. Native fullscreen viewport input and unmodified editor page movement continue to pass.

The integration owner will add delivered-feature README documentation before closing this ticket. Physical Ghostty gestures were not checked here; ticket 03 retains that acceptance gate. No live terminal configuration was changed.
