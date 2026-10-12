# 08: Verify combined keyboard editing in Ghostty

**What to build:** A mixed draft can be edited, recovered, completed, pasted, and submitted with all four packages, with real terminal delivery limits recorded accurately.

**Blocked by:** [03: pi-composer: recover deletions with yank and yank-pop](03-recover-deletions-with-yank.md); [05: pi-composer: restore character jumps and editor paging](05-restore-character-jumps-and-editor-paging.md); [06: pi-paste: preserve configured clipboard routes](06-preserve-configured-clipboard-routes.md); [07: Preserve draft selection through previews and extension pickers](07-preserve-selection-through-native-ui.md).

**Status:** automated acceptance complete; physical acceptance pending

**Specifications:** [pi-composer](../../../docs/specs/pi-composer.md), [pi-paste](../../../docs/specs/pi-paste.md), [pi-attachments](../../../docs/specs/pi-attachments.md), [pi-skill-references](../../../docs/specs/pi-skill-references.md).

- [x] Run a combined public-host workflow covering configured bindings, formatted/source selection, deletion and yank, undo/redo, native/custom completion, text/file/image paste, snapshot membership, and submission.
- [x] Verify one-operation dispatch with native overrides and accepted extension shortcuts; preserve canonical skill instructions, images, retained files, and session-associated draft history. Exercise companion packages with the native editor and supported decorator orders.
- [ ] Complete the specifications' Ghostty/macOS fullscreen matrix, recording host/terminal versions, relevant bindings, physical gestures, observed routes, and results for each configuration phase.
- [ ] Check conditional Cmd+C and terminal undo/redo states; logical/visual boundaries and shifted movement; native clipboard metadata separately from terminal text; and selection through real image-preview redraws.
- [ ] Verify terminal behavior across pane changes, external editing, suspension/resumption, resource and terminal reload, and exit. Distinguish unchanged configuration, explicitly installed forwarding, and explicit removal.
- [x] Distinguish terminal-consumed keys from incorrect delivered-input behavior and unobserved cases. Retain concrete evidence, keep unrun checks pending, and update implementation/acceptance status without claiming unverified shortcut support.
- [x] The user reports successful shortcut testing, including Cmd+Up/Down draft boundaries, on 2026-10-12. The [terminal acceptance ticket](../../composer-keybinds/issues/03-verify-keybindings-in-ghostty.md) records this result and the latest automated checkpoint; unreported physical cases above remain open.
