# 03: Verify setup and page selection in Ghostty

**What to build:** Establish that the installed forwarding rules deliver the requested editing behavior in real Ghostty on local macOS, coexist with native Pi behavior, and can be removed without losing other terminal settings.

**Blocked by:** 01: pi-composer: extend selection by a visible page; 02: pi-composer: set up and remove Ghostty keybindings.

**Status:** automated acceptance complete; physical acceptance pending

**Specification:** Composer specification, “Setup and page-selection acceptance”; the terminal acceptance procedure; ADR 0010.

- [x] Verify the combined behavior through the approved public Pi host with the four composition packages, including forwarded identities, custom native bindings, accepted extension shortcuts, focused native UI, shared history, and attachment-preview coexistence. Reuse passing coverage and add checks only for new or unresolved behavior.
- [ ] Record an unchanged-configuration baseline before setup. Record macOS, Ghostty, and Pi versions, tested revision, configuration phase, physical gesture, observed input route, and result; retain the distinction between terminal interception and incorrect editing after delivery.
- [ ] Explicitly install through the verified setup command and reload Ghostty. Exercise all eight physical gestures in source and formatted views: select-all, explicit submit, logical-line start/end, undo/redo, and selection by a visible composer page.
- [ ] Check that selected text remains selected across redraws and view changes, page selection extends and contracts correctly, and replacement followed by undo restores source and selection. Include a draft with wrapping, Unicode, and attachment-preview refresh.
- [ ] Recheck working Cmd+C and Cmd+Shift+Up/Down, useful native movement/deletion translations, configured binding ownership, focused pickers, and one-operation dispatch. Exercise conditional copy and terminal undo/redo states where available.
- [ ] Confirm that forwarding remains installed outside Pi and across pane changes, external editing, suspension/resumption, resource reload, terminal configuration reload, and Pi exit. Evaluate each result against the installed configuration phase rather than assuming Pi-only scoping.
- [ ] Remove the block through the command and reload Ghostty. Confirm restoration of the pre-existing binding configuration and preservation of unrelated edits; repeating removal makes no write.
- [x] Record delivered-input checks, Ghostty validation, configuration writes, and physical forwarding separately. If verification is unavailable or physical access is blocked, leave the dependent checks pending and do not claim successful terminal acceptance.
- [x] Publish the acceptance evidence and update delivered-feature documentation to match tested support and remaining limitations.

This ticket depends on both implementation slices. It does not require reopening completed original composer tickets or repeating unrelated feature acceptance.

## Verification

The [acceptance record](../verification.md) reports 677 passing tests on Node 24.13.1, required static checks, and a separate successful source-loading check through local Pi 1.1.0 at runtime revision `ff58984d`. Two public-host cases cover setup confirmation, page selection, preview refresh, shared history, and retained snapshot bytes with all four packages loaded. Setup regressions cover the root-owned macOS login intermediary, terminal-generic help, physical-binding precedence, keyboard layout, and permission preservation. Existing suites supply delivered-identity, custom-binding, extension-ownership, wrapping, Unicode, and submission coverage.

Physical access remains blocked by the computer-use tool's explicit denial of Ghostty. The user's unchanged-configuration reports are recorded as reported results. Actual Pi-to-Ghostty ancestry, live setup and reload, physical gestures and lifecycle behavior, and removal remain unobserved. No live terminal settings were changed. This ticket stays open for the unchecked physical acceptance items.
