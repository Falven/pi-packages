# 03: Verify setup and page selection in Ghostty

**What to build:** Establish that the installed forwarding rules deliver the requested editing behavior in real Ghostty on local macOS, coexist with native Pi behavior, and can be removed without losing other terminal settings.

**Blocked by:** 01: pi-composer: extend selection by a visible page; 02: pi-composer: set up and remove Ghostty keybindings.

**Status:** automated acceptance complete; reported keyboard tests passed; remaining physical acceptance pending

**Specification:** [Setup and page-selection acceptance](../../../docs/specs/pi-composer.md#setup-and-page-selection-acceptance); [ADR 0010](../../../docs/adr/0010-explicit-terminal-keybinding-setup.md).

- [x] Verify the combined behavior through the approved public Pi host with the composition packages, including forwarded identities, custom native bindings, accepted extension shortcuts, focused native UI, shared history, and attachment-preview coexistence. Reuse passing coverage and add checks only for new or unresolved behavior.
- [ ] Record an unchanged-configuration baseline before setup. Record macOS, Ghostty, and Pi versions, tested revision, configuration phase, physical gesture, observed input route, and result; retain the distinction between terminal interception and incorrect editing after delivery.
- [ ] Explicitly install through the verified setup command and reload Ghostty. Exercise all eight physical gestures in source and formatted views: select-all, explicit submit, draft start/end, undo/redo, and selection by a visible composer page.
- [ ] Check that selected text remains selected across redraws and view changes, page selection extends and contracts correctly, and replacement followed by undo restores source and selection. Include a draft with wrapping, Unicode, and attachment-preview refresh.
- [ ] Recheck working Cmd+C and Cmd+Shift+Up/Down, useful native movement/deletion translations, configured binding ownership, focused pickers, and one-operation dispatch. Exercise conditional copy and terminal undo/redo states where available.
- [ ] Confirm that forwarding remains installed outside Pi and across pane changes, external editing, suspension/resumption, resource reload, terminal configuration reload, and Pi exit. Evaluate each result against the installed configuration phase rather than assuming Pi-only scoping.
- [ ] Remove the block through the command and reload Ghostty. Confirm restoration of the pre-existing binding configuration and preservation of unrelated edits; repeating removal makes no write.
- [x] Record delivered-input checks, Ghostty validation, configuration writes, and physical forwarding separately. If verification is unavailable or physical access is blocked, leave the dependent checks pending and do not claim successful terminal acceptance.
- [x] Publish the acceptance evidence and update delivered-feature documentation to match tested support and remaining limitations.
- [x] On 2026-10-12, the user confirmed that the shortcut tests worked, including corrected Cmd+Up/Down movement to the draft's beginning/end. This records the reported keyboard result; both-view coverage, conditional terminal states, clipboard metadata, image graphics, and the complete install/remove lifecycle remain unreported.
- [x] The recorded runtime checkpoint, d909ea17, passed all 684 tests on Node 24.13.1 with locked Pi 1.0.2, with no failures, skips, or todos. Formatting, lint, root types, and composer types passed. Public-host coverage includes the composition packages, draft navigation, configured ownership, shared history, previews, and setup lifecycle.
- [x] A separate installed-Pi 1.1.0 resource-loading check loaded the four local source packages configured at that revision without errors. Native Ghostty 1.3.1 checks used read-only inspection and temporary configurations; they establish configuration verification independently of physical gestures.
