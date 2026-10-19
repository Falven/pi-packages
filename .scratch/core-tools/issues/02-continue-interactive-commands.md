# 02: Align process input and collection

**What to build:** Input and polling reject the reference's invalid arguments without affecting a process, while valid pipe and terminal interactions return each new output segment and actual outcome once.

**Specification:** [Core toolset](../spec.md), especially implementation decisions 13, 25–28, 31, and 33.

**Decision:** [Accepted behavior alignment](../../../docs/adr/0030-core-tool-behavior-parity.md).

**Blocked by:** None (can start immediately). Existing command execution and retained process sessions already support this slice.

**Status:** claimed — Core 02 implementation in `codex/core-process-alignment`

## Behavior alignment — 2026-10-18

This updates the existing approved process slice. Earlier verification remains historical. Use the extension's existing public APIs and host seam; Pi source, installed packages, private runtime behavior, global settings, and version requirements must remain unchanged.

- [ ] Validate original `write_stdin` arguments before host coercion. Require a signed 32-bit integer process identifier; reject string identifiers, fractions, null, and out-of-range values. Keep a type/range failure distinct from an unknown, completed, or stale handle.
- [ ] Preserve native null/default behavior: chars defaults to empty and yield to 250 ms, with null rejected for both; the output budget is optional/nullable. Apply the native unsigned ranges, ignored unknown keys, and existing input/empty-poll wait clamps. Verify zero and omission independently, including the effective 5,000 ms empty-poll minimum/default.
- [ ] Reject invalid input before sending bytes, signalling a process, consuming unread output, or changing a collection cursor. Verify absence of those effects as well as the exact processed error in the next model request.
- [ ] Preserve serialized input delivery and collection, incremental UTF-8 output, token budgets, running versus completed result fields, final-handle retirement, and concurrent-poll behavior. Use real pipe and PTY processes; do not introduce a second process registry or change the captured tool declarations.
- [ ] Retain the existing exact Ctrl+C exception for non-terminal processes and normal terminal input behavior. Other nonempty pipe input still fails as observed. Report the actual interrupt/exit result; sending a signal alone does not establish that the process stopped.
- [ ] Keep later output and status attached to the originating command across prompts and cells. Successful empty polls add no activity action; meaningful terminal input and failed collection retain their applicable facts. Public hooks and processed-result edits remain authoritative, with no duplicate output, display-driven collection, or unsolicited model turn.
- [ ] Preserve initial-call cancellation, bounded output storage, capacity recovery, and session cleanup for independently returned handles. Cell termination's effect on a still-awaited command is owned by [Core 03](03-yield-and-resume-execution-cells.md); do not preserve the superseded kill-on-cell-termination rule.
- [ ] Verify the full input/poll → actual process effect → processed result → next request path using existing process, command, and presentation cases and temporary diagnostics. Cover current-parent hooks, late completion, malformed arguments, interruption, and cleanup. Add no new test cases, files, or harness.

**Evidence to record:** Paired argument/error cases, incremental returned bytes and fields, actual process outcomes, retained activity facts, and relevant existing checks with runtime/source identities. Coordinate shared validation with Core 01 without creating an artificial implementation prerequisite.

**Current verification:** Implementation is complete in the claimed worktree; current acceptance stays open for root's fresh paired reference and combined gates. The branch started at `6c775356361cf89bf247f7eb9f1dc31a16cb912e`, matching `codex/core-tool-behavior-parity`. The latest integration `1d39dda08b938681b0cda7b55970509390fdd143` is merged without conflicts. It includes Core 04's implementation at `3c4a6c9` and its later evidence-only update. Historical evidence below is unchanged.

**Implementation:** `createStdin` uses public `prepareArguments` and non-coercing TypeBox checks before Pi validation. It rejects invalid signed IDs, chars, yield, and budgets, accepts native nullable budgets and unsigned values above the safe-integer boundary, and removes ignored keys. Its 250 ms yield default feeds the existing input/empty-poll clamps. Frozen declarations, command launch/shell selection, process storage and collection, cell lifetime, and presentation ownership remain unchanged. No Pi, dependency, version, setting, or private-runtime change was made.

**Red/green evidence:** Existing identifier assertions first reproduced all four captured validation differences (`red-identifiers.log`), then passed with exact reference errors (`green-identifiers.log`). Expanded existing assertions exposed the missing unsigned upper bounds (`red-unsigned-ranges.log`) and passed after correction (`green-raw-arguments.log`). The current process tests also verify rejected PTY bytes and Ctrl+C, unread completed output after malformed collection, nullable/zero budgets, defaults, ignored keys, and authoritative parent/child result edits. No permanent test case, file, or harness was added.

**Host evidence:** `/tmp/pi-core-alignment-20261018-a7r6fk0i/process/public-host-diagnostic.ts` reuses the existing public-host/model-loop fixture. Six stored reference error strings and rejection types match in the next model request. Its real pipe ignores SIGINT and correctly returns a running handle; release then returns exit 7 and new output once, followed by an unknown-handle error. Its PTY accepts input and returns the actual exit 23. Public updates confirm the 30,000/300,000 ms upper clamps. `public-host-capture.json` retains requests, effects, returned results and public events; `public-host-diagnostic.log` records the passing diagnostic. This is a fresh extension replay against immutable captures, not a fresh paired reference run or live inference.

**Public-hook boundary:** Pi 1.1.0 preparation failures bypass the nested `tool_call`/`tool_result` hooks. The first expanded hook assertion exposed that behavior in `focused-effects.log`; the corrected existing case verifies authoritative parent-result redaction for that error, and normal blocking, argument edits and nested-result redaction for valid input (`green-public-hooks.log`). The extension uses that existing public behavior without synthesizing hooks.

**Fixture corrections:** The first full package run passed 222/223 (`core-suite.log`); the next passed 221/223 (`core-suite-final.log`). The shell Ctrl+C fixture intermittently continued with exit 0 / `AFTER` instead of its expected 23 / `STOPPED`. A standalone OS diagnostic reproduced that behavior without Pi: 6 of 40 `/bin/sh` trials continued (`shell-interrupt-capture.json`). The existing process and companion fixtures now register an explicit Node signal handler before reporting readiness. Process execution and truthful exit reporting are unchanged. The second package run also showed a shell cancellation message displacing `LARGE-END` from the 32-token tail; that existing fixture now requests 64 tokens and retains the same large-output, truncation, child-cleanup and stale-handle assertions. All four affected checks pass (`green-interruption-effects.log`). Earlier failing logs remain intact.

**Checks and runtime:** Node 26.8.1, Pi host/TUI 1.1.0, TypeBox 1.3.27 and node-pty 1.2.0-beta.15 use the existing read-only symlinks. `start-identity.json` records paths, versions, base and frozen hashes. The complete package run passes 223/223 before the latest merge (`core-suite-verified.log`). After merging Core 04, patch/combined workflows pass 74/74, focused process checks pass 8/8, and TypeScript passes (`post-merge-patch-workflow.log`, `post-merge-process.log`, `post-merge-typecheck.log`). Scoped lint, formatting and whitespace checks pass. `pnpm typecheck` instead entered automatic dependency setup and stopped at the symlinked hoist directory before running the script (`typecheck-final.log`); it was not retried, and the installed TypeScript binary ran directly. Dependency manifest hashes, symlinks, the frozen declaration and historical ticket body remain unchanged. Exact commands and remaining gates are in `/tmp/pi-core-alignment-20261018-a7r6fk0i/process/evidence.md`.

**Remaining gates and reference requests:** Root must run the fresh paired input cases, full matrix, matched live tasks, combined acceptance and final Phoenix publication. Additional native probes are requested for per-field null/default/zero behavior; unsigned limits and floating-point error spelling; multi-key/Unicode diagnostic positions and ignored keys; top-level non-object/no-argument calls; malformed writes/polls with pending bytes and invalid Ctrl+C; ignored and handled SIGINT with actual late exits; and repeated competing final polls. Preserve the audited concurrent-poll winner/order difference rather than normalizing it away, and compare actual shell-interrupt outcomes without assuming a sent signal forces the shell trap to run. Raw JSON spelling and duplicate keys are unavailable at the public preparation boundary; broader parser equivalence is not claimed. Pending-command survival on cell termination remains Core 03's scope. The shared runners and final Phoenix publication were not run here.

## Historical revisions

Everything below records prior requirements and verification. It remains historical where it conflicts with the current revision above.

**Previous title:** 02: Continue interactive commands across prompts

**What to build:** Keep live command progress, input, and late process outcomes in their originating independently disclosed activity item.

**Specification:** [Core toolset](../spec.md).

**Blocked by:** Core 01: completed commands and execution-owned content.

**Status:** resolved — approved activity-item delta; earlier evidence retained below

## Activity-item delta — approved 2026-10-15

- [x] Publish live pipe/PTY output and process status before calls return, including when the custom execution renderer has never subscribed.
- [x] Input or collection from another execution updates the original command and retains its own meaningful outcome without replaying command output.
- [x] Preserve command, cell, and process-session distinctions, initial order, and manual disclosure choices through later prompts and failures.
- [x] Display observation does not consume collection cursors, dispatch calls, poll, change result hooks, or create notifications or model turns.

**Revision evidence (2026-10-15, `f6004ab`):** Live pipe/PTY process facts update their originating operation before the outer call returns and after later input, collection, or prompts. Initial operation order and disclosure choices remain stable. Input/collection actions retain their own outcome; a returned live process handle keeps the command running without incorrectly leaving a completed `write_stdin` action running. Command, process-session, and execution-cell status stay distinct.

Presentation observes existing events without polling, consuming collection cursors, dispatching extra tools, or creating notifications/model turns. Existing process, command, presentation, and mixed-workflow checks passed, including final status-repair checks. See [ticket 07](07-verify-contract-and-matched-trials.md) for exact versions and totals.

## Earlier revision

**Recorded status:** resolved — live command presentation belongs to its originating execution

**Original delivery:** Stream a command’s output into its originating execution card before command or input calls return, and keep that command’s status and accumulated output there across later input and collection calls.

## Presentation delta

- [x] Observe existing pipe and PTY output and lifecycle events to update command presentation while a tool call is pending and after it returns a process handle. A handle means running; later completion, cancellation, launch failure, and nonzero exit update the originating command without another tool call.
- [x] Preserve the command’s stable originating operation and effective directory across prompts and cells. Input and collection from another execution may describe their own action but must not duplicate or move the command output.
- [x] Keep live display independent of process and cell collection cursors, token budgets, cutoff boundaries, return timing, and errors. Later model calls must still receive the expected new output exactly once under the existing contract.
- [x] Reuse native refresh batching with no display-driven polling, hidden collection, extra tool dispatch, or model-context messages. Live output may precede result hooks; normal returned results remain hook-processed and must not restore removed content.
- [x] Bound retained display output and incremental history writes, preserve output order and trailing output, show omissions, and release session-owned presentation observers on cleanup without prematurely stopping independent process sessions.
- [x] Demonstrate early output with synchronized real pipe and PTY producers at the approved host seam, then completion without polling, later input from another execution, redaction timing, and unchanged model collection. Cover large output and cancellation without introducing a second harness.

## Presentation implementation evidence

The first real-host tracers failed for both pipe and PTY commands: the command and directory appeared, but output was absent while collection was pending. Both now show the synchronized early output before release, while the model call remains pending. Pipe and PTY producers are real owned processes; temporary release files control their output phases.

The public nested-update callback stops accepting updates after the nested invocation returns. A separate late-completion tracer reproduced that cutoff. The first public command update now binds the package-owned process observer to the originating operation. Process output and lifecycle events update its bounded presentation reference and invalidate the native parent component, including after the command returns a process handle. The actual invocation, arguments, result processing, and model result still pass through public dispatch. No display collection, timer, hidden tool call, or model message is added.

The originating card retains its effective command and working directory. Later input from another execution shows its own action while output and terminal status remain in the original card. A late exit 7 updates that card without another provider request. A later collection receives only its new output; the screen retains both earlier and later output without duplicating the latter in the input card.

Display storage keeps at most 8 KiB of raw leading output and 8 KiB of raw trailing output, preserving grapheme boundaries and marking omitted middle output. It is independent of process and cell collection cursors and model token budgets. Snapshots and native invalidation update presentation incrementally; once the native row is bound, output events mutate the bounded reference and use native refresh batching instead of generating complete parent result snapshots for every event. Terminal observers are released, and session cleanup clears presentation ownership. Late terminal activity writes one bounded operation snapshot to retained custom history, without displaying a journal row. Latest-status recovery after reload remains ticket 03's delta.

Post-hook command output replaces an earlier live preview when hooks remove or edit the returned content, including explicitly replaced structured output. A retained hash distinguishes unchanged collected output from a processed replacement, without storing another copy of command output. If a running command's returned output is replaced, only its owned display buffer is reset to that processed prefix; later output still streams without restoring the removed earlier bytes. This reset does not touch model collection storage. The parent-content fingerprint still rejects stale activity bodies after parent result redaction. Earlier live visibility remains the explicitly accepted transport difference. A later input-result hook controls the input action's returned model result; it does not erase the originating command's prior live observation. A dedicated host check verifies that retained observation appears once in the origin while the model receives only the processed input result.

Verification at the approved native-host/provider seam covers synchronized early pipe/PTY output, late nonzero completion without another model request, input from another execution, exact incremental model collection, a 256 KiB output preview with a separate 32-token model budget, early-visible then returned-redacted output, explicit structured-result replacement, and command cancellation. The combined command, patch, and image presentation suites pass all 32 checks after merging the independent file and image slices. Package type checking, lint, formatting, and whitespace checks pass.

An earlier full package run passed 163 of 164 checks; the 8 MiB PTY cancellation producer exceeded its five-second readiness deadline while every output event still rebuilt parent detail snapshots. Native reference invalidation and the ASCII preview path removed that overhead. The affected existing cancellation check then passed in about 1.08 seconds, together with the overflow regression and all presentation checks. The final full package rerun at `1c16120` passed all 181 checks, including the existing large-output and wait-boundary checks. The subsequent continued-command redaction correction passes its focused tracer alongside content and structured-result redaction; all 82 affected presentation, command, and cell checks passed after that correction, along with the three existing process regressions for 80 MiB incremental Unicode output, unread overflow, and large PTY cancellation. The additional input-result redaction boundary check also passed. Final static and formatting checks remain clean. Physical-terminal and configured companion integration are tracked by tickets 06 and 07, not claimed by these controlled-host results.

## Completed baseline

**Historical status:** resolved — process continuation uses shared asynchronous output storage

The following criteria and evidence describe the previously completed core contract. This revision supersedes its visible routine-journal presentation; it does not authorize changes to Pi or the chat package.

- [x] Expose and execute the captured `write_stdin` contract through the existing orchestration and public dispatch path.
- [x] Support both pipes and an explicitly requested PTY, with accurate input delivery, output, completion status, and process session identifier behavior.
- [x] Verify a command that yields while still running, receives input, produces several output chunks, and completes. Its yield deadline must not kill it.
- [x] Poll with omitted or empty input and return incremental output without replaying chunks. Preserve the command APIs' optional fields and token-count meaning.
- [x] Establish the exact empty-poll default and out-of-range wait behavior against the fixed baseline. The declared 5,000–300,000 ms range alone is not an exact default or clamp algorithm.
- [x] Preserve effective shell settings, prefix, current context, environment, hooks, result processing, and native execution events on the complete interaction.
- [x] Bound output, preserve UTF-8 decoding and trailing output, and retain captured truncation behavior. Keep any necessary spill files private.
- [x] Keep process handles available across ordinary prompts in the same active extension session. Treat invalid, completed, and stale identifiers according to the verified contract.
- [x] Exercise cancellation and normal session shutdown/reload, including owned child cleanup and retained partial output. Do not restore live handles from history or create a survival daemon.
- [x] Verify the full request/tool/next-request interaction with real controlled processes through the existing host fixture, including nonzero completion and a failed input/poll call.
- [x] Replace synchronous spill I/O with shared asynchronous storage, retaining small output in memory and using private bounded spill files for larger output.
- [x] Apply producer backpressure and finite queued/unread limits, preserve incremental UTF-8/truncation behavior, and collect only required new ranges with a stable cutoff.
- [x] Verify large continued output, failure, cancellation, cleanup, private file modes, and concurrent collection through the existing real-host seam. Keep existing command arguments, timings, results, and process ownership.
- [x] Bound inherited pipe draining during shutdown, preserve accepted output through active collection, release local readers and spill files, and report incomplete cleanup without claiming detached descendants were killed.

## Approved continuation revision

The prior process slice remains implemented. It was reopened only for the shared storage needed by ticket 03. The verified internal limits are 64 KiB retained in memory, 256 KiB asynchronous batches/high-water, 1 MiB queued storage, and 64 MiB unread bytes per process. Spill is lazy and private; a circular file bounds retained disk use to 64 MiB across repeated collections. Overflow or I/O failure stops the producer and produces an explicit collected error with cleanup. Accepted queued bytes remain available when a spill write fails. A failure to read persisted bytes is reported directly; storage corruption cannot be reconstructed.

The process manager retains at most 32 handles, including completed processes with unread output and failures awaiting collection. Exhaustion rejects a new command explicitly without evicting an existing handle. Collecting a terminal result or failure retires its handle and releases storage. Session cleanup signals each original process group once and allows 1,500 ms for output draining. Inherited pipe readers still open at that deadline are released with an explicit incomplete-cleanup error. Active collectors settle before their stores close. This nested budget leaves time for public result processing and collection within the cell's 2,000 ms cleanup budget.

`OutputStore` accepts and counts bytes and line endings on arrival, gives each collection an absolute cutoff, and reads only the required head/tail ranges for a truncated result. Later arrivals remain unread for the next collection, including completion during an asynchronous read. Small output requires no file. Larger output is written in asynchronous batches from bounded 64 KiB slabs. Pipes pause both output streams, and PTYs pause their output; both resume when the queue drains. A producer resumed during flush completion cannot strand a new queue. There is no polling loop or synchronous output I/O. Cells consume the same store through ticket 03, with ordered part metadata owned by the cell manager.

## Implementation evidence

The process manager owns independent pipe or native PTY processes and private output spill files. It retains no execution context. Each input or poll uses the current parent call's public dispatch, hooks, result processing, and events. Input delivery and collection serialize together per process. Concurrent final polls drain once; the next queued poll sees an unknown handle.

Running results contain a signed 32-bit process identifier and omit `exit_code`. Completed results contain `exit_code` and omit `session_id`; collecting completion retires the handle. Pipe input is closed. A failed nonempty write to a completed pipe preserves unread output for a later empty poll. A completed PTY ignores late input and returns its unread final output. The measured interrupt result is exit code 1 with `^C` output.

The frozen declarations remain unchanged. Supplemental public-interface observations establish these timing rules:

| Call                                      | Default wait | Effective range  |
| ----------------------------------------- | ------------ | ---------------- |
| `exec_command`                            | 10,000 ms    | 250–30,000 ms    |
| `write_stdin` with nonempty input         | 250 ms       | 250–30,000 ms    |
| `write_stdin` with omitted or empty input | 5,000 ms     | 5,000–300,000 ms |

Values clamp to the stated bounds. Negative waits and budgets, and fractional numeric arguments, fail validation; number schemas with `multipleOf: 1` prevent the native integer converter from rounding fractional input. Each call has the declared 10,000-token output default. New output is counted and truncated using the established UTF-8 behavior. Changing the budget between polls does not discard unread bytes. Spill directories are mode 0700 and their files mode 0600.

The real-host checks cover repeated input across ordinary prompts, empty polling, concurrent input and polling, nonzero completion, invalid and stale identifiers, output budgets, split UTF-8, private spill files, policy blocking and edits, redaction, current-parent events, selection and exclusion, active-poll cancellation, reload, and normal shutdown. Cleanup awaits owned shells and their waiting children. The installed-package check also launches a PTY from `node_modules`.

After merging the completed command, patch, and image slices, all 114 package tests pass. The package type check, lint, formatting check, and `git diff --check` pass. Timing tests directly exercise the 10-second command default, 250 ms input minimum, 5-second empty default/minimum, and 30-second command/input maximum. The 300-second empty-poll maximum is directly measured in the reference evidence; it is not repeated as a five-minute host test.

A later full repository run at `0d80487` exposed three test setup races: startup output was assumed to arrive within the initial 250 ms. A temporary 600 ms startup delay reproduced all three failures. The tests now collect pending startup output through a real poll, wait for valid child PIDs, control output phases with release files, and compare complete output across incidental collection boundaries. Exact input ordering, token counts, truncation, UTF-8, private permissions, cleanup, and measured wait assertions remain covered. Runtime code is unchanged.

The same delayed-startup probe passed all three cases after the test fixes. After removing that temporary delay, all 117 package tests passed, as did package type checking, targeted lint, formatting, and whitespace checks. The full repository rerun remains separate from this focused verification.

The asynchronous revision began with a failing real-host tracer: small output incorrectly created a spill file. That tracer now passes while preserving exact budgets, private modes, later output, and split UTF-8. Additional real-host regressions pass for 80 MiB across four collections with bounded disk and no replay, 64 MiB unread overflow with retained accepted output and an explicit collected error, a real asynchronous filesystem failure, completed-unread handle exhaustion and capacity recovery, and cancellation after 8 MiB of PTY output. Existing native hooks, redaction, cancellation, child cleanup, concurrent polls, and wait semantics remain covered.

Supplementary in-process store probes completed 300 append/read/discard cycles totaling 75 MiB across ring wrap, and 200 pressure-release appends totaling 50 MiB without intervening collection. They check progress and byte accounting; their wall times are not comparative host performance measurements. The shared before/after performance evaluation belongs to ticket 03.

After incorporating integration commit `e8142e4`, all 121 package tests pass. Package type checking, targeted lint, formatting, and whitespace checks pass. This slice does not repeat the full repository suite or claim measured performance improvement from the diagnostic probes.

A later owned detached-child probe reproduced an inherited-pipe shutdown delay: stopping the original process group left its detached descendant holding stdout/stderr, delaying direct process cleanup by 3,319 ms and public session shutdown by 3,323 ms. The control with ignored child output closed in 3 ms. The real-host regression also caught a repeated group signal returning `EPERM` between parent termination and reaping; stopping a process is now idempotent without suppressing permission failures.

After merging the retained-cell implementation at `31e3ff4`, equal 2,000 ms process and cell deadlines lost the active command's accepted output. The 1,500 ms process deadline fixes that ordering: the regression settles in about 1,506 ms, retains both ends of 1 MiB of accepted output with the requested truncation, removes spill files, and exposes the incomplete-cleanup reason through the public session error callback. The detached descendant remains alive until the test explicitly cleans its owned PID. Separate process and public-session probes close in about 1,503 ms and 1,513 ms; the ignored-output control remains about 3 ms. Every probe verifies that its owned PIDs are gone after cleanup. Normal pipe shutdown and large-output PTY cancellation remain covered.

All 142 package tests pass after the shutdown fix and integration merge. Package type checking, targeted lint, formatting, and whitespace checks pass. A final stop-order review keeps reader resumption before the idempotent signal guard; the affected cancellation, overflow, spill-failure, and shutdown checks pass after that adjustment. This preserves draining if backpressure pauses a reader again after its original stop request.

Evidence is retained in the [command index](../../../packages/pi-codex-tools/test/fixtures/observed/commands/index.json). Relevant indexed cases are `command-long-waits.json`, `command-pty-boundaries.json`, `empty-poll-upper-bound.json`, `command-input-validation.json`, `post-exit-handles.json`, `concurrent-process-polls.json`, `concurrent-process-input.json`, and `pty-interrupt.json`. The [dependency probe](../../../packages/pi-codex-tools/test/fixtures/observed/commands/pty-dependency-gate.json) is a separate unindexed observation. These supplemental observations do not establish the runtime build identity of the frozen capture.

## Dependency and remaining limits

`node-pty` is pinned to 1.2.0-beta.15. The published 1.1.0 terminal helper lacks its executable bit on the tested platform. The pinned release ships it as 0755 and loads and spawns on Node 26.8.1, macOS arm64, without install scripts, runtime permission changes, or build-approval settings. Real input, EOF, terminal dimensions, and exit 7 pass the dependency gate. Source-build fallback and other platforms or runtime versions remain unverified.

Process continuation remains independently owned: a command that has yielded keeps its handle across ordinary prompts in the active extension session. Ticket 03 owns retained execution cells and the outer script's continuation. This revision changes shared output storage and process collection; it adds no daemon or history-based handle restoration.

Explicit cancellation retains processed partial output and complete native nested-call records. Normal quit also preserves the active call's partial output and awaits owned processes, but the installed host's direct runtime disposal omits that call's nested summary after invalidation. This native behavior is not repaired with synthetic history. Output produced while no call is collecting it is cleared during session cleanup; already returned results remain in history.

Detached descendants that escape their original process group may continue after shutdown. The bounded drain releases local pipe readers and reports that limitation; it performs no descendant scan. Public hooks or scheduling can still exceed the outer cell cleanup budget and produce its incomplete-cleanup diagnostic. Retained command output continues through native result processing and collection; cleanup adds no hook bypass.

The separate [native-host session replacement observations](../../../packages/pi-codex-tools/test/fixtures/observed/commands/session-replacement.json) passed six cases at `5507b77`: new, resume, and fork, each with an idle handle and an active poll. Owned shell and child processes stopped before replacement returned; stale handles failed, fresh commands worked, and completed files remained. Active polls retained their partial output and complete nested-call records. The evidence records native history behavior and the persistence comparison projection. It verifies process lifecycle only; ticket 06 owns integrated cell and mixed workflows.
