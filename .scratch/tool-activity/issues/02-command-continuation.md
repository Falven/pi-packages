# 02: Command continuation without receipt rows

**What to build:** Command progress stays at its origin across prompts. Successful output polls and empty execution completions add no action. Submitted terminal commands remain associated with the original operation. See the [specification](../../../docs/specs/pi-activity.md).

**Blocked by:** 01: Generic operation presentation.

**Status:** ready-for-agent

- [ ] Repeated successful polls produce zero new activity items, including nested polls and later execution collections.
- [ ] Process output and terminal outcomes update the originating operation without display polling or extra calls.
- [ ] Meaningful terminal submissions update originating command actions; partial input remains buffered and collection failure remains inspectable.
- [ ] Script-only output/errors remain visible and successful child outcomes remain independent.
- [ ] Existing real-host workflows establish unchanged tool effects, model output collection, result hooks, and single-owner late images.
