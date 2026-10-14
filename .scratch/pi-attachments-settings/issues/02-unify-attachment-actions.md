# 02: Unify attachment actions and native keybinding configuration

**What to build:** Attach… offers a file path or literal entered text, and Pi owns configurable Attach… and Manage attachments… actions.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

**Specification:** [Pi Attachments](../../../docs/specs/pi-attachments.md). Use the existing public editor/session test boundary and applicable architecture decisions.

- [ ] Provide Attach… with File path… selected by default and Create from text… secondary. Determine content type automatically and preserve supported path forms without shell evaluation.
- [ ] Capture entered text literally, including path-looking strings, empty content, and final newlines. Cancelling either source dialog closes the flow without changing the draft.
- [ ] Add the required public Pi support for named extension actions, user bindings, conflict handling, and standard-menu configuration; consume it without a separate attachment keybinding system.
- [ ] Default Attach… to Ctrl+Alt+F and Manage attachments… to Ctrl+Alt+A. Display the effective management binding.
- [ ] Retain /attach, /attachments, /attachments-recover, /attachments-cleanup, and /paste-recover. Retire /attach-file, /attach-text, /paste-inline, Ctrl+Alt+T, and Ctrl+Alt+V without aliases.
- [ ] Preserve native clipboard precedence and dispatch, ordinary paste classification at every caret location, existing draft transactions, and retained recovery data.
- [ ] Verify accepted source flows, cancellation, command retirement, remapped and cleared bindings, conflicts, and selection through the existing public host.
