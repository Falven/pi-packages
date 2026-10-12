# 01: pi-composer: honor native bindings and picker priority

**What to build:** Configured Pi actions and accepted extension shortcuts control editing, and composer conveniences cannot override them or handle a key twice.

**Blocked by:** None.

**Status:** complete

**Specifications:** [pi-composer](../../../docs/specs/pi-composer.md).

- [x] Resolve existing editing actions through Pi's supplied manager and apply them to the authoritative Markdown draft. Keep any necessary dispatch cleanup local to this working behavior.
- [x] Any explicit override of a native action, including an empty list or a repeated default, suppresses that action's extra Cmd aliases and their shifted variants. Fixed select-all, cut, redo, and source-view shortcuts remain fallbacks.
- [x] Effective native bindings and accepted extension shortcuts win collisions with fixed or convenience shortcuts. Prove a collision using an already implemented native action, without depending on future word-deletion work.
- [x] Preserve application, clipboard, explicit history, viewport, listener, and focused-UI dispatch. Copy retains parent interrupt/clear behavior, and each event produces at most one operation.
- [x] Native undo runs before in-editor completion, including when remapped to a picker navigation or confirmation key. Picker acceptance must not also submit the draft; native commands and contextual submit/newline behavior remain effective.
- [x] Verify default, remapped, cleared, and colliding bindings through the existing public Pi editor/session boundary, including effective skill/path providers and extension shortcuts. Add no configuration reader, action registry, or terminal-settings mutation.

Verify at the approved public Pi editor/session boundary. Record physical terminal checks separately from delivered-input behavior.

**Verification:** The public host regressions first reproduced completion taking native undo, native character deletion losing to Cmd+A, and explicit undo, line, copy, and submit overrides retaining composer aliases. All 172 composer TypeScript host tests pass on Node 26.8.1 with Pi 1.0.2. Targeted lint, formatting, root types, and composer test/fixture types pass. Physical shortcut delivery remains ticket 08's acceptance check.
