# 06: pi-paste: preserve configured clipboard routes

**What to build:** Native clipboard bindings control paste with either editor, while terminal text and extension paste retain their own routes and policy.

**Blocked by:** [01: pi-composer: honor native bindings and picker priority](01-honor-native-bindings-and-picker-priority.md).

**Status:** complete (automated acceptance; physical delivery tracked in 08)

**Specifications:** [pi-paste](../../../docs/specs/pi-paste.md), [pi-composer](../../../docs/specs/pi-composer.md).

- [x] Use the supplied native clipboard action and handler. Remapping, clearing, or explicitly repeating its default suppresses raw Cmd+V convenience handling in pi-paste and pi-composer.
- [x] Effective native actions, accepted extension shortcuts, listeners, and focused components retain their input. A consumed key causes no additional clipboard read, insertion, or attachment.
- [x] Bracketed paste and public extension paste process only their supplied text. Suppressing a raw Cmd+V alias does not disable terminal-generated paste or cause clipboard metadata to be reread.
- [x] Native copied-file identities take precedence over images and text on the metadata-aware clipboard route. Path-shaped terminal text remains text.
- [x] Verify unchanged cutoff, explicit inline/attachment actions, one-action undo, and failure recovery through the actual routes with the native editor and composer, including supported decorator orders.

Verify at the approved public Pi editor/session boundary. Record physical terminal checks separately from delivered-input behavior.

## Evidence

Six native/composer override cases first failed because raw Cmd+V still pasted after a clear, remap, or repeated default. The supplied-handler case first inserted unrelated clipboard text. A further regression showed pi-paste replacing a later custom clipboard handler during editor construction. All now pass through public host input.

The affected clipboard, attachment-paste, native-action, and mixed-composition suites pass 210 tests on Node 26.8.1 with locked Pi 1.0.2. Coverage includes the native editor, composer, both supported paste/attachment decorator orders, focused input, terminal listeners, native and extension collisions, metadata precedence, direct insertion, staged custom handlers, unchanged cutoff and explicit actions, undo, storage failure, late reads, session replacement, and recovery after reload. Clipboard metadata and text readers are substituted at the external boundary; image cases use controlled bytes.

The composer invokes the supplied handler for native clipboard input and its available alias. Its asynchronous request guard retains late results delivered to a composer without converting a handler's deliberate direct insertion into public paste. Public-paste decoration and failure checks use their own route. pi-paste installs its default handler only when absent, preserving both earlier handlers and later assignments.

## Public-contract limits

- Pi's default clipboard handler suppresses text-read errors and represents unavailable text as an empty result. Standalone composer checks preserve draft and selection; read-error diagnostics remain verified through pi-paste's owned reader.
- That default handler delivers copied-file paths and temporary image paths as strings. The composer retains delivered strings, not image bytes or immutable copied-file snapshots. pi-paste and pi-attachments provide captured-content recovery and stable snapshots.
- A result reaching an unrelated replacement editor cannot be guarded by the composer. A handler that throws or consumes data before reaching the composer owns that outcome; the public void callback exposes no payload or completion acknowledgement for recovery.
- Physical shortcuts, menu paste, right-click, and image delivery in Ghostty remain the acceptance work of ticket 08. No terminal settings were changed.
