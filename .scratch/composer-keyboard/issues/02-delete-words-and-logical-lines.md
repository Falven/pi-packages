# 02: pi-composer: delete words and logical lines

**What to build:** Backward/forward word deletion and deletion toward either logical line boundary edit the correct range and undo coherently in both views.

**Blocked by:** [01: pi-composer: honor native bindings and picker priority](01-honor-native-bindings-and-picker-priority.md).

**Status:** complete (software checks)

**Specifications:** [pi-composer](../../../docs/specs/pi-composer.md).

- [x] Execute effective native word and line deletion actions against the shared draft, including configured bindings and useful terminal translations that Pi receives.
- [x] A nonempty selection takes precedence over calculating an unselected word or line range. At the corresponding logical boundary, remove the adjacent newline and join lines; at an empty outer boundary, do nothing.
- [x] Preserve graphemes, punctuation/whitespace behavior, tabs, code contents, and surrounding Markdown in source and formatted views. Include whole-span, partial-span, and cross-span formatted deletion examples from the composer specification.
- [x] One coherent undo restores the deleted source, selection, and attachment membership; redo restores the edit without changing snapshot contents.
- [x] Verify the result through the existing public Pi boundary with native defaults and custom bindings. Preserve character deletion and application-owned empty-editor exit.

Verify at the approved public Pi editor/session boundary. Record physical terminal checks separately from delivered-input behavior.

## Verification

- Public-host regression tests first reproduced ignored backward/forward word and line deletion, newline over-deletion, and incorrect punctuation boundaries. Those checks now pass in formatted and source views.
- The composer TypeScript suite and attachment-deletion checks pass: 193 tests. This includes 21 new checks for native defaults, configured keys, selected Markdown, Unicode, code, boundary no-ops, shared undo, attachment membership, unchanged snapshot bytes, and empty-editor exit dispatch.
- Composer type checking, focused lint, formatting, and whitespace checks pass on Node 26.8.1 with the locked Pi 1.0.2 host.
- The combined attachment-paste, mixed-composition, and native-UI suites pass 55 of 57 checks. Two existing Cmd+V attachment-paste checks time out waiting for text capture; [ticket 06](06-preserve-configured-clipboard-routes.md) owns that clipboard route and its test substitutions. Integration acceptance must rerun them after that work.
- Physical terminal delivery remains part of [ticket 08](08-verify-combined-editing-in-ghostty.md).
