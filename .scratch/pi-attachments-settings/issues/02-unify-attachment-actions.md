# 02: Unify attachment actions and native keybinding configuration

**What to build:** Attach… offers a file path or literal entered text, and Pi owns configurable Attach… and Manage attachments… actions.

**Blocked by:** None (can start immediately).

**Status:** complete

**Specification:** [Pi Attachments](../../../docs/specs/pi-attachments.md). Use the existing public editor/session test boundary and applicable architecture decisions.

- [x] Provide Attach… with File path… selected by default and Create from text… secondary. Determine content type automatically and preserve supported path forms without shell evaluation.
- [x] Capture entered text literally, including path-looking strings, empty content, and final newlines. Cancelling either source dialog closes the flow without changing the draft.
- [x] Add the required public Pi support for named extension actions, user bindings, conflict handling, and standard-menu configuration; consume it without a separate attachment keybinding system.
- [x] Default Attach… to Ctrl+Alt+F and Manage attachments… to Ctrl+Alt+A. Display the effective management binding.
- [x] Retain /attach, /attachments, /attachments-recover, /attachments-cleanup, and /paste-recover. Retire /attach-file, /attach-text, /paste-inline, Ctrl+Alt+T, and Ctrl+Alt+V without aliases.
- [x] Preserve native clipboard precedence and dispatch, ordinary paste classification at every caret location, existing draft transactions, and retained recovery data.
- [x] Verify accepted source flows, cancellation, command retirement, remapped and cleared bindings, conflicts, and selection through the existing public host.

**Evidence:** The public Pi editor/session host exercises chooser defaults, exact entered bytes, cancellation, quoted and literal file names, action remapping and clearing in `/settings`, native conflicts, effective widget hints, retired commands, paste selection, undo, and recovery. The attachment package suite and affected composer and chat suites pass against the coherent local Pi build. Typecheck, lint, and format checks pass. The composer viewport fixture follows Pi's Ctrl+Home/End defaults and passes all 31 cases. Final combined verification is recorded in the specification. These Pi APIs remain unreleased. Physical clipboard gestures and terminal rendering remain unobserved.
