# 10: Process input without extra activities

**What to build:** Match the pinned app's process-input behavior. Ctrl+C interrupts a non-terminal process. Input/collection calls and script results add no operation merely because they fail; their exact errors remain available to the model and through source Find. Actual command failures remain visible under their original identity.

**Blocked by:** None. Tickets 06–08 are implemented at `100316f`.

**Status:** done — implemented at `6499536` and verified at `fbc8030` on `codex/generic-tool-activity`, following the user's explicit authorization to fix the screenshot gaps and update all documents.

- [x] An exact Ctrl+C input sends SIGINT to a non-terminal process group; terminal input and ordinary closed-stdin rejection remain intact.
- [x] Output collection preserves trailing output, serialization, actual process outcomes, and original command ownership.
- [x] Successful and failed input/collection calls publish no operation; script errors do not create replacement Error rows or duplicate error context.
- [x] Caught/uncaught input failures, distinct script errors, and empty script errors remain unchanged in model results and inspectable through Find and reload.
- [x] Actual failed commands remain visible, and unrelated providers retain their generic behavior.
- [x] The existing zero-operation format is sufficient; no consumer tool-name rules, cross-package imports, new package, prompt additions, or rejection-value changes are introduced.
- [x] ADRs/specs reflect the corrected failure rule, and final checks are recorded in Ticket 09.

**Reference:** Codex `0.162.0-alpha.17.2`, commit `740e5af33c71225640e0c1c1555c514c2c93ab74`. The [process manager](https://github.com/openai/codex/blob/740e5af33c71225640e0c1c1555c514c2c93ab74/codex-rs/core/src/unified_exec/process_manager.rs) special-cases exact Ctrl+C for non-terminal input and sends interaction events using the original command identity. The [input handler](https://github.com/openai/codex/blob/740e5af33c71225640e0c1c1555c514c2c93ab74/codex-rs/core/src/tools/handlers/unified_exec/write_stdin.rs) returns failures to the model. The installed app applies interaction events to the original command; raw function results do not become normal operation rows. The [reference plan](../../../docs/plans/core-tool-activity-alignment.md) records the inspected bundle and source pin.

**Decisions:** Publish only actual operation facts from the core producer. Retain raw script errors in results and private standalone presentation instead of trying to infer whether a primitive rejection came from a tool. The chat's existing valid empty snapshot behavior already supports this. This supersedes automatic script-failure activity publication; old stored facts retain their historical interpretation.

**Resolution:** Reused process-group signaling for exact non-terminal Ctrl+C. The producer no longer turns its own input calls or script errors into operations. Actual operation facts, original process identity, model results, and standalone rendering remain intact. No chat implementation change was needed for this slice.

**Verification (2026-10-16, `fbc8030`):** Five focused cases reproduced the gaps before the repair and pass afterward. Existing mixed-operation checks now find late script errors through retained source after reload while preserving native images and disclosure controls. The full affected suites pass 351/351 on Pi 1.0.2; chat and combined workflows pass 141/141 on Pi 1.1.0. Both typechecks and repository lint/format checks pass. [Ticket 09](09-verify-activity-alignment.md) records commands, logs, direct reviews, queued cleanup, and limits.

**Limits:** Exact Ctrl+C sends a signal; a process may handle or ignore it. Status follows the observed outcome. Existing historical error facts are not migrated. Physical-app comparison and Windows behavior were not verified.
