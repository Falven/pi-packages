# 02: Command continuation without receipt rows

**What to build:** Command progress stays at its origin across prompts. Successful output polls and empty execution completions add no action. Submitted terminal commands remain associated with the original operation. See the [specification](../../../docs/specs/pi-activity.md).

**Blocked by:** 01: Generic operation presentation.

**Status:** resolved — implemented at `4e271b8` on `codex/generic-tool-activity`.

- [x] Repeated successful polls produce zero new activity items, including nested polls and later execution collections.
- [x] Process output and terminal outcomes update the originating operation without display polling or extra calls.
- [x] Meaningful terminal submissions update originating command actions; partial input remains buffered and collection failure remains inspectable.
- [x] Script-only output/errors remain visible and successful child outcomes remain independent.
- [x] Existing real-host workflows establish unchanged tool effects, model output collection, result hooks, and single-owner late images.

**Resolution:** Existing process observers publish output, submitted actions, and final outcomes at their origin. Successful collection supplies an explicit empty snapshot; independent script output and failures keep their own outcome. The real PTY case checks partial input, an empty poll, two submissions, original command completion, and no collection/execution receipt rows. Combined workflows pass in both extension load orders on Pi 1.0.2 and 1.1.0. [Ticket 03](03-retained-source-and-replay.md) records final validation and reference limits.
