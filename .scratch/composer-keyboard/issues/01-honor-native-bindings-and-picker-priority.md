# 01: pi-composer: honor native bindings and picker priority

**What to build:** Configured Pi actions and accepted extension shortcuts control editing, and composer conveniences cannot override them or handle a key twice.

**Blocked by:** None.

**Status:** ready-for-agent

**Specifications:** [pi-composer](../../../docs/specs/pi-composer.md).

- [ ] Resolve existing editing actions through Pi's supplied manager and apply them to the authoritative Markdown draft. Keep any necessary dispatch cleanup local to this working behavior.
- [ ] Any explicit override of a native action, including an empty list or a repeated default, suppresses that action's extra Cmd aliases and their shifted variants. Fixed select-all, cut, redo, and source-view shortcuts remain fallbacks.
- [ ] Effective native bindings and accepted extension shortcuts win collisions with fixed or convenience shortcuts. Prove a collision using an already implemented native action, without depending on future word-deletion work.
- [ ] Preserve application, clipboard, explicit history, viewport, listener, and focused-UI dispatch. Copy retains parent interrupt/clear behavior, and each event produces at most one operation.
- [ ] Native undo runs before in-editor completion, including when remapped to a picker navigation or confirmation key. Picker acceptance must not also submit the draft; native commands and contextual submit/newline behavior remain effective.
- [ ] Verify default, remapped, cleared, and colliding bindings through the existing public Pi editor/session boundary, including effective skill/path providers and extension shortcuts. Add no configuration reader, action registry, or terminal-settings mutation.

Verify at the approved public Pi editor/session boundary. Record physical terminal checks separately from delivered-input behavior.
