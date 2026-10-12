# 01: Document and verify native clipboard paste

**What to build:** A user can follow the package guidance to copy a file or image in a clipboard manager and attach it through Pi's configured native clipboard action, with either editor. Copying the characters of a path keeps their text meaning, and Ghostty's ordinary Cmd+V paste remains unchanged.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

**Specifications:** [Paste](../../../docs/specs/pi-paste.md), [composer](../../../docs/specs/pi-composer.md), [attachments](../../../docs/specs/pi-attachments.md), and [native clipboard identity](../../../docs/adr/0011-preserve-native-clipboard-identity.md).

- [ ] Correct the package guidance to distinguish a physical Cmd+V from Pi's native clipboard action. Explain the PastePal workflow: choose Copy for the selected clip, return focus to Pi, then invoke the effective clipboard action. Identify Ctrl+V as the macOS default and use Pi's native shortcut information for remapped bindings.
- [ ] Explain that native file/image capture requires paste and attachment handling, with Pi's native editor or the composer. A clipboard manager's one-step Paste and Ghostty's terminal paste are separate routes; text insertion alone does not establish file or image support.
- [ ] Use the existing public Pi editor/session checks to verify copied-file precedence, native image capture, literal path text, configured bindings, custom handlers, selection replacement, and recoverable errors with both editors. Reuse the implemented handlers and host fixtures.
- [ ] In real Ghostty/macOS, copy the reported image-file item through PastePal's Copy action, then invoke Pi's effective clipboard action. Verify an image attachment, the native preview widget, unchanged snapshot bytes and filename, and image delivery through native submission. Repeat with image-only clipboard data and a non-image file.
- [ ] Copy the characters of the same readable file's path as plain text and invoke the native clipboard action. The short path appears literally and does not capture the named file. Repeat through terminal text paste and public extension paste, including a clipboard that independently names that same file; only the supplied text is classified.
- [ ] With the composer, replace a selection with an attachment and undo/redo once. The selected text and attachment membership move together while the stored snapshot remains readable. Verify the native editor's supported insertion behavior separately.
- [ ] Record Pi, macOS, Ghostty, and clipboard-manager versions, the tested revision, effective bindings, physical action, observed input route, clipboard representation at native invocation, and visible result. Keep synthetic host evidence separate from physical acceptance. A clipboard read after an earlier paste cannot establish that paste's input type.
- [ ] Verify that Ghostty's Cmd+V and menu paste bindings remain unchanged and ordinary paste still works outside Pi. Follow the existing eight-rule setup contract without adding a paste-forwarding rule.
- [ ] Record observed outcomes in this ticket. Keep unavailable physical checks pending and link remaining combined-workflow coverage to the existing [composition acceptance ticket](../../prompt-composition/issues/22-compose-and-resume-mixed-requests.md).

**Research evidence:** On 2026-10-12, PastePal 2.20.3's Copy action for the reported image-file entry exposed one matching file path, no image bytes, and no text through Pi's public native clipboard API. This establishes the copied item's file identity; it does not establish physical Pi paste delivery. Ghostty 1.3.1's [clipboard conversion](https://github.com/ghostty-org/ghostty/blob/v1.3.1/macos/Sources/Helpers/Extensions/NSPasteboard%2BExtension.swift) turns file URLs into shell-escaped path text, and the inspected Cmd+V binding invokes that terminal paste action. PastePal's [documented paste actions](https://docs.indiegoodies.com/pastepal/Mac/quick-start) do not establish the exact terminal handoff or clipboard lifetime for its one-step Paste action.
