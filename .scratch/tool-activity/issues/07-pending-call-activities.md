# 07: Pending calls without premature activities

**What to build:** Calls whose arguments are still arriving do not flash a generic `Called … (status unknown)` activity. Real operations, generic dispatched tools, failures, and unknown historical outcomes retain their correct presentation.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] A paused provider stream has no pending-call activity or group contribution.
- [ ] Dispatch and completion reveal the correct operation or generic tool state.
- [ ] Cancellation, failure before an operation, and unknown retained outcomes remain visible and inspectable.
- [ ] The lifecycle rule is generic and uses no tool-name or provider-name checks.
- [ ] Existing source Find, disclosure choices, continuation, and replay behavior remain intact.
