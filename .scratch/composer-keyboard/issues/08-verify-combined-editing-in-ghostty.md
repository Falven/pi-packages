# 08: Verify combined keyboard editing in Ghostty

**What to build:** A mixed draft can be edited, recovered, completed, pasted, and submitted with all four packages, with real terminal delivery limits recorded accurately.

**Blocked by:** [03: pi-composer: recover deletions with yank and yank-pop](03-recover-deletions-with-yank.md); [05: pi-composer: restore character jumps and editor paging](05-restore-character-jumps-and-editor-paging.md); [06: pi-paste: preserve configured clipboard routes](06-preserve-configured-clipboard-routes.md); [07: Preserve draft selection through previews and extension pickers](07-preserve-selection-through-native-ui.md).

**Status:** automated acceptance complete; physical acceptance pending

**Specifications:** [pi-composer](../../../docs/specs/pi-composer.md), [pi-paste](../../../docs/specs/pi-paste.md), [pi-attachments](../../../docs/specs/pi-attachments.md), [pi-skill-references](../../../docs/specs/pi-skill-references.md).

- [x] Run a combined public-host workflow covering configured bindings, formatted/source selection, deletion and yank, undo/redo, native/custom completion, text/file/image paste, snapshot membership, and submission.
- [x] Verify one-operation dispatch with native overrides and accepted extension shortcuts; preserve canonical skill instructions, images, retained files, and session-associated draft history. Exercise companion packages with the native editor and supported decorator orders.
- [ ] Run the documented Ghostty/macOS fullscreen acceptance procedure against unchanged effective terminal settings after automated behavior passes. Record host/terminal versions, relevant bindings, physical gestures, observed routes, and results.
- [ ] Check conditional Cmd+C and terminal undo/redo states; logical/visual boundaries and shifted movement; native clipboard metadata separately from terminal text; and selection through real image-preview redraws.
- [ ] Verify ordinary terminal behavior across pane changes, external editing, suspension/resumption, resource and terminal reload, and exit. Add no launcher or terminal configuration takeover.
- [x] Distinguish terminal-consumed keys from incorrect delivered-input behavior and unobserved cases. Retain concrete evidence, keep unrun checks pending, and update implementation/acceptance status without claiming unverified shortcut support.

Verify at the approved public Pi editor/session boundary. Record physical terminal checks separately from delivered-input behavior.

## Evidence

The [verification record](../verification.md) maps automated coverage to the public-host suites. One combined regression exercises configured deletion and yank, alias suppression, source/formatted round trips, attachment retention, native completion, and deduplicated skill/image submission. Two existing attachment-restoration setups now reach the draft beginning with select-all and Left, preserving their original assertions under the logical-line Cmd+Up contract.

The full repository suite passes 606 tests on Node 24.13.1 with locked Pi 1.0.2, with no skipped or pending tests. The [review corrections](../review.md) cover native binding collisions, delayed clipboard handlers, and retained Markdown source order. The affected attachment-actions suite passes all 35 checks. Formatting, lint, root typechecking, and composer typechecking pass. Physical acceptance remains separate and open.

After automated checks passed, the computer-use tool refused Ghostty access: `Computer Use is not allowed to use the app 'com.mitchellh.ghostty' for safety reasons.` No physical gesture, UI inspection, or alternate control route was performed. The unchecked terminal requirements remain unobserved; terminal settings were unchanged.
