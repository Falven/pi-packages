# 02: Configure attachment shortcuts through Pi's existing binding file

**What to build:** Attach… offers a file path or literal entered text. Users configure it and Manage attachments… by editing Pi's existing binding file and running /reload, while command access remains available.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

**Specification:** [Pi Attachments](../../../docs/specs/pi-attachments.md), including its applicable architecture decisions.

- [ ] Resolve only extension.attachments.attach and extension.attachments.manage from keybindings.json in Pi's active agent directory. An absent entry uses Ctrl+Alt+F or Ctrl+Alt+A respectively; a configured key or list replaces the default, and an empty list disables the shortcut.
- [ ] Validate the package's entries and report malformed configuration. Preserve already-saved attachment bindings, unrelated entries, and native clipboard configuration. Reread bindings on /reload without leaving stale registrations or handlers.
- [ ] Register concrete keys, descriptions, and handlers through pi.registerShortcut(). Remove dependencies on locally added named-action and action-key lookup APIs. The package owns resolution of its two entries; Pi handles registered shortcuts. This is the accepted community fallback, not official named-action registration.
- [ ] Preserve actual native conflict dispatch and verify it with remapped native actions and competing extension shortcuts. Supply descriptions for Pi's read-only /hotkeys display and keep attachment hints accurate after remapping, disabling, and conflicts; a handled key performs only one action.
- [ ] Preserve Attach… with File path… selected by default and Create from text… secondary. Detect content type automatically, accept established path forms without shell evaluation, and capture literal entered text exactly, including path-looking strings, empty content, and final newlines.
- [ ] Cancelling either source dialog closes the flow without changing the draft. Preserve caret or selection insertion, native clipboard precedence and dispatch, ordinary paste classification, and retained recovery.
- [ ] Keep /attach, /attachments, /attachments-recover, /attachments-cleanup, and /paste-recover usable, including when shortcuts are disabled. Retire /attach-file, /attach-text, /paste-inline, Ctrl+Alt+T, and Ctrl+Alt+V without aliases.
- [ ] Add no keybinding editing menu, second binding file, separate keybinding manager, shared configuration framework, or configurable action beyond the two accepted actions.
- [ ] Adapt existing checks for absent, single, multiple, empty, and malformed entries; alternate active agent directories; reload; native conflicts; /hotkeys; hints; commands; source flows; and cancellation. Verify actual runtime dispatch on unmodified Pi during ticket 07, without mocking the removed action APIs.

**Integration:** Use the shared contract-removal checkout described in ticket 01. Full-extension acceptance and installation restoration belong to ticket 07.

**Historical verification (2026-10-14):** The previous checks exercised source flows, cancellation, paste, recovery, retired commands, and modified-host action configuration through /settings. Attachment, composer, chat, and 31 composer viewport cases passed, with type, lint, and format checks. The modified host's configuration menu and action APIs are being removed; those results do not establish file-based remapping, reload, conflicts, or hints on unmodified Pi. Physical clipboard gestures and terminal rendering were not observed.
