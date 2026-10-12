# 06: pi-attachments: preserve configured clipboard routes

**What to build:** Native clipboard bindings control paste with either editor, while terminal text and extension paste retain their own routes and policy.

**Blocked by:** [01: pi-composer: honor native bindings and picker priority](01-honor-native-bindings-and-picker-priority.md).

**Status:** complete

**Specifications:** [pi-attachments](../../../docs/specs/pi-attachments.md), [pi-composer](../../../docs/specs/pi-composer.md).

- [x] Use the supplied native clipboard action and handler. Remapping, clearing, or explicitly repeating its default suppresses raw Cmd+V convenience handling in pi-attachments and pi-composer.
- [x] Effective native actions, accepted extension shortcuts, listeners, and focused components retain their input. A consumed key causes no additional clipboard read, insertion, or attachment.
- [x] Bracketed paste and public extension paste process only their supplied text. Suppressing a raw Cmd+V alias does not disable terminal-generated paste or cause clipboard metadata to be reread.
- [x] Native copied-file identities take precedence over images and text on the metadata-aware clipboard route. Path-shaped terminal text remains text.
- [x] Verify unchanged cutoff, explicit inline/attachment actions, one-action undo, and failure recovery through the actual routes with the native editor and composer, including supported decorator orders.
- [x] Preserve supplied-handler insertion choices and recovery limits documented in the [composer specification](../../../docs/specs/pi-composer.md#implementation-decisions): the standalone composer retains delivered strings, while paste and attachment handling provide captured bytes and read-error diagnostics.
