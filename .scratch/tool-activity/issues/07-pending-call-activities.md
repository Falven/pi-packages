# 07: Pending calls without premature activities

**What to build:** Calls whose arguments are still arriving do not flash a generic `Called … (status unknown)` activity. Real operations, generic dispatched tools, failures, and unknown historical outcomes retain their correct presentation.

**Blocked by:** None (can start immediately).

**Status:** done — implemented and verified at `100316f` on `codex/generic-tool-activity`, from integration base `a6280f9`.

- [x] A paused provider stream has no pending-call activity or group contribution.
- [x] Dispatch and completion reveal the correct operation or generic tool state.
- [x] Cancellation, failure before an operation, and unknown retained outcomes remain visible and inspectable.
- [x] The lifecycle rule is generic and uses no tool-name or provider-name checks.
- [x] Existing source Find, disclosure choices, continuation, and replay behavior remain intact.

**Resolution:** Live calls track whether dispatch has started separately from their outcome. Argument streaming creates no fallback item or group count. Execution, reliable facts, results, interruption, and reload resolve that state. The rule names no tool or provider; dispatched generic calls and unknown historical calls retain their existing presentation.

**Verification (2026-10-16, `100316f`):** Controlled provider streams establish the absence of a pending row and the later operation's placement across commentary boundaries. Real Pi cancellation before dispatch preserves the native aborted result through reload. Existing Find, disclosure, continuation, and retained-history checks pass in both supported host runs recorded in [Ticket 09](09-verify-activity-alignment.md).

**Limits:** This removes pending placeholders. It does not change the separate failed-input activity policy identified in the later `write_stdin` screenshot; Ticket 09 records that remaining app-parity gap.
