# 03: Align cell termination and execution failures

**What to build:** Terminating an execution stops its JavaScript while an already-running command can finish, and failed or continued executions return the reference's complete ordered diagnostics without losing cleanup ownership.

**Specification:** [Core toolset](../spec.md), especially implementation decisions 6–7, 11, 18, 30, and 33 and testing decisions 18, 20–21.

**Decision:** [Accepted behavior alignment](../../../docs/adr/0030-core-tool-behavior-parity.md).

**Blocked by:** None (can start immediately). The existing cell, process, output-storage, and public-dispatch implementations are complete.

**Status:** ready-for-agent

## Behavior alignment — 2026-10-18

This updates the existing approved execution-cell slice. Its prior cancellation policy is superseded. Keep the change within the extension and existing public APIs; Pi source, installed packages, private runtime behavior, global settings, and version requirements must remain unchanged.

- [ ] Prepare raw execution input and wait arguments before host coercion. Execution input remains nonempty raw source; wait requires a string cell identifier. Wait yield and terminate are defaulted/non-null, output budgets are optional/nullable, and unknown object keys are ignored under the reference rules.
- [ ] Match first-line pragma parsing: a JSON object with only the two supported numeric options, native null/default behavior, nonnegative safe integers, and following code. Remove the pragma before evaluation. Preserve native numeric ranges outside the pragma, zero versus omission, and pre-cell error paths without rewriting the frozen grammar or declarations.
- [ ] Reproduce the delayed-marker case in both runtimes. After explicit cell termination, the already-started awaited command writes its marker, while JavaScript after the await never executes. Ending the cell prevents new dispatch and stops its worker/timers without implicitly interrupting that command.
- [ ] Return termination promptly with only output already accepted into the cell. A command still running or a held result hook must not force a wait for completion or fabricate a killed-command result. Determine pending-operation behavior from actual reference observations.
- [ ] Retain surviving processes in the existing session ownership/cleanup registry, including any previously returned handle and their real late status. A terminated or collected cell must not prevent subsequent forced reload/shutdown cleanup. Preserve bounded cleanup and truthful incomplete-cleanup reporting; add no survival daemon or process-global registry.
- [ ] Late callbacks must not append to closed cell storage, resume JavaScript, commit terminated script work, duplicate operation rows, or start another model turn. Preserve the actual command outcome independently from the terminated cell's outcome.
- [ ] Probe pre-start commands, initial command collection, pending process input, queued patch work, and held result hooks separately against the reference. Match their observed lifetime rules; command survival alone does not authorize a queued file mutation. Keep the existing file queues and process registry.
- [ ] Preserve cancellation of initial execution, caller-only cancellation of a later wait, explicit process interruption, resource-failure cleanup, session replacement, and existing store/load commit/discard semantics. Ordinary script completion and a yielded process handle remain separate from cell termination.
- [ ] Failed execution results include the native failure header, timing, and output framing, then already accepted text/images and the genuine error in reference order. Preserve content-part boundaries, single-string versus multipart shapes, budgets, failure status, and independently successful child results.
- [ ] Preserve genuine stack strings, the reference module origin `exec_main.mjs`, and source positions after pragma removal. Match conversion of thrown non-Error values. Do not fabricate native frames, strip custom stacks with broad filters, or normalize Node/runtime-frame differences out of the comparison.
- [ ] Cover synchronous/asynchronous throws, nested frames, errors after yield, timer and syntax errors, thrown strings/undefined/objects, custom stack strings/accessors, child rejections, serialization errors, and exit. A stack accessor that invokes exit must not restart error processing.
- [ ] Keep failure results, standalone rendering, retained source, raw copy, and Find consistent without duplicated errors. Script text/errors and input/collection receipts create no invented operations; valid empty activity facts remain meaningful on failure.
- [ ] Verify cell start/yield/wait/termination/failure through the existing real-host seam with real command/file effects, authoritative hooks, final provider content, and cleanup of owned PIDs. Reuse existing cases and temporary diagnostics; add no new test cases, files, or harness. Report parser information or runtime-frame differences that existing public APIs cannot reproduce.

**Evidence to record:** Paired lifecycle timelines and ordered failure payloads, marker/PID outcomes, source-position checks, hook timing, late activity, and final cleanup. This ticket owns the cell/process lifetime boundary and raw exec/wait inputs; Core 02 owns process-input argument parity.

**Current verification:** Pending. Ticket publication changes no runtime behavior.

### Additional lifetime and stack evidence — 2026-10-19

The queued-input cases under `delta-queued-stdin-before-20261018-a7r6fk0i` and `delta-queued-stdin-late-exit-before-20261018-a7r6fk0i` separate an active poll from an input write queued behind it. Native termination prevents the queued write while the existing reader remains alive until its own bounded late exit. The earlier pending-input probes establish survival after a write has already begun. Preserve those distinct effects; do not infer that every queued operation continues.

A temporary [persistent-worker formatter probe](/tmp/pi-core-alignment-20261018-a7r6fk0i/persistent-worker-stack-probe.mjs) demonstrates that the default formatter in our own Node worker can filter structured implementation frames before a script first reads its stack. This preserves cached default stacks as well as custom cached strings and script-provided formatters, while the VM's `typeof Error.prepareStackTrace` remains `undefined`. It changes no Pi code or settings. A formatter used only when collecting failure cannot correct a default stack that the script already read and cached. Fresh reference cases are retained under `delta-cached-stack-before-20261018-a7r6fk0i`; compare those outputs before final acceptance. Do not rewrite arbitrary cached strings or widen comparison allowances.

## Historical revisions

Everything below records prior requirements and verification. It remains historical where it conflicts with the current revision above.

**Previous title:** 03: Yield and resume execution cells

**What to build:** Inspect yielded executions and late outcomes at their origin, then recover the same reliable operations after reload or branch changes.

**Specification:** [Core toolset](../spec.md).

**Blocked by:** Core 02: live command ownership.

**Status:** resolved — approved activity-item delta; earlier evidence retained below

## Activity-item delta — approved 2026-10-15

- [x] Preserve independent operation and execution entries through yields, waits, termination, and late failures; successful children retain their outcomes.
- [x] Reconcile latest active-branch facts without restoring workers or processes, rerunning tools, or assigning work to a later request.
- [x] Retain compact operation descriptions and known outcomes beyond existing body windows; unavailable bodies have an explicit notice only when opened.
- [x] Honor authoritative processed results and context edits during replay, while preserving exact continuation collection behavior.

**Revision evidence (2026-10-15, `f6004ab`):** Revisioned activity records reconcile late progress and terminal outcomes with the initiating cell and operation across yields, waits, later prompts, and active-branch replay. A later script failure leaves completed children successful. Replay restores descriptions and outcomes without workers, processes, or tool execution; authoritative processed results and context edits remain the source of body content.

The eight-settled-operation body window no longer deletes compact operation records. An unavailable body exposes an omission notice only inside its opened item. Existing execution, presentation, continuation, workflow, reload, and branch checks passed; [ticket 07](07-verify-contract-and-matched-trials.md) records the final verification. Primitive output attribution retains the explicit limit in [ticket 01](01-execute-command-through-model-loop.md).

## Earlier revision

**Recorded status:** resolved — approved presentation delta verified through the native host; completed baseline retained below

**Original delivery:** Keep execution progress, accumulated readable output, and late failures in the originating card across yields and waits, and recover the latest recorded outcome after reload or branch changes.

## Presentation delta

- [x] Use public renderer invalidation to update an originating execution card after its initial result returns. Waiting reports its own collection, termination, cancellation, or error status without duplicating operation text. Under the approved native-image exception, an image appears once in the result that collects it, including a later wait, while its operation path and status stay in the origin. Model-facing waiting behavior is unchanged.
- [x] Distinguish cell settlement, process lifecycle, child tool completion, and final collection. Cell removal must not turn an already recorded terminal result into interrupted or unknown.
- [x] Reconcile ordered retained records on the active branch by originating session, call, and operation. Later terminal records override earlier running records; ordinary journal entries remain invisible. Restore available details after reload, resume, and branch changes without recreating live resources or attributing older work to a newer request.
- [x] Show late script and command failures in their original card and retain them even without a later wait. Display must not consume results available for later continuation or create automatic failure notifications or unsolicited turns; keep explicitly invoked notifications unchanged.
- [x] Handle older or incomplete records honestly using available data and interrupted or unknown status only when no terminal outcome or live state establishes the result. Do not fabricate missing output or rerun historical operations.
- [x] Verify yield → later operation → wait, cancelled waits, explicit termination, interleaved cells, later prompts, live independent processes, late failure without waiting, successful collection, and retained restoration through the approved host seam. Keep bounded state and unchanged provider results.

**Presentation evidence:** Originating cards now retain their live execution object across idle gaps between operations, update script output and terminal state after a yield, and reconcile ordered active-branch records after reload. Recovery matches the package cell identity, originating call, and recorded originating session; forked histories retain that original identity. Rendering checks the returned content and presentation fingerprints before consulting either live or recorded presentation, preserving hook-edited or removed details. Older results without presentation details disclose that limitation. Known terminal results survive collection. A process without a recorded exit remains interrupted or unknown after its live resources disappear; it is not reported as a known failure or successful exit.

Script presentation retains a bounded readable preview, separate from output collection. Updates accumulate as deltas and flush at existing yield, collection, and terminal boundaries; clipping that rewrites the omission suffix records an explicit bounded replacement. Existing command and image envelope decoding happens before preview retention, avoiding duplicated transport and encoded image bytes. Process-terminal records remain admissible at the ordinary activity ceiling. Waiting shows collection, termination, cancellation, or failure without replaying originating text. Actual images remain in their collecting native result; the late-image host check verifies one image in `wait`, no image in the earlier `exec`, and the completed image operation in its original card. Native cancellation can produce `Operation aborted` before the package returns; its wait card reports cancellation and the cell remains collectable.

The first tracer reproduced a yielded script remaining visibly running after its late failure. A later check reproduced stale running presentation after reload; renderer-instance ownership and deferred public invalidation repair recovery when native rows render before session initialization finishes. Focused checks also cover a later operation during another prompt, late independent process failure after cell collection, explicit termination, cancelled waiting followed by collection, active-branch selection, persisted resume and fork, legacy missing details, and clipped incremental output with identical restored preview. All 43 command, image, patch, and continuation presentation checks passed before the final recovery-copy check was added. The subsequent full package run passed 192/192 in 82.338 seconds after replacing one timing-sensitive fixed-delay assertion with an observation of actual rendered completion. After that run started, recovery was corrected to clone retained operation data before marking an unfinished process unknown; three affected recovery checks and the new retained-entry immutability check passed separately. An additional four focused checks cover the final disclosure for older presentation data. The final integrated run remains ticket 07's responsibility. Package type checking, lint, formatting, and whitespace checks pass. Physical-terminal and configured-runtime verification remain with tickets 06 and 07; these checks use the dependency's native host with a controlled provider.

## Completed baseline

**Historical status:** resolved — focused and configured lifecycle checks verified; diagnostic performance comparison recorded for ticket 07

The following criteria and evidence describe the previously completed core contract. This revision supersedes its visible routine-journal presentation; it does not authorize changes to Pi or the chat package.

- [x] Probe public dispatch after the parent returns and during a later prompt with configured companions. Verify hook blocking, argument changes, result redaction, explicit cancellation, dynamic callable selection, custom-entry rendering/model exclusion, and notification timing. Record native identity/history limitations as accepted differences.
- [x] Expose the captured `functions.wait` declaration, schema, defaults, and string cell identifier in the actual provider request. Preserve the distinction from numeric command-process identifiers.
- [x] Implement the execution pragma's yield behavior, explicit `yield_control`, incremental waiting, final completion, and explicit termination against the fixed baseline.
- [x] Keep one fresh worker per execution and retain it across yields. Release it promptly when the script settles; retain only unread output, terminal results, and necessary pending-operation cleanup metadata. Never create a worker during a wait.
- [x] Deliver only newly accumulated output using serialized collection and a sequence cutoff. Preserve text/image order and limits; retain a running cell ID and retire a collected terminal result once. Use events and one active-wait deadline timer, with no periodic polling.
- [x] Complete the selected helper behavior: text, notifications, successful early exit, timers, and serializable store/load. A missing stored key returns `undefined`; timers alone do not keep an execution alive.
- [x] Keep fresh JavaScript globals for each execution, with no direct Node, filesystem, network, or console APIs. Do not misrepresent this as operating-system isolation.
- [x] Restrict callable tools and their metadata listing to the selected operations actually available under Pi's active policy. Preserve public dispatch even when scripts coordinate independent calls.
- [x] Verify notifications through public messages with no unsolicited turn, documenting delivery at Pi's safe boundary instead of promising an immediate extra tool-output event. Verify output and late nested calls after a yield, including redaction that is never reconstructed from backend content.
- [x] Verify failed scripts, invalid/stale cells, repeated waiting, and termination while work is pending. Distinguish declared behavior from cases still requiring baseline measurement.
- [x] Commit only each cell's changed stored keys on normal completion, early exit, and ordinary exceptions; discard them on termination. Verify copy isolation and overlapping snapshots without overwriting unrelated committed keys.
- [x] Keep cell and caller cancellation separate: cancel initial execution before yield, preserve the cell on later wait cancellation, and abort pending operations on explicit termination. Preserve independent returned process handles. Stop intake before cleanup and report cleanup that does not finish within its bound.
- [x] Preserve live cells and stored values across ordinary prompts, and clear them with the agreed native session lifecycle while keeping file effects and retained history.
- [x] Record compact, bounded incremental activity through public custom entries with package child identities. Flush full batches and lifecycle boundaries; render interrupted retained records without recreating resources or adding them to model context.
- [x] Bound worker messages before posting, pending calls, workers, retained cells, unread output, serialized values, and activity metadata. Reuse shared asynchronous storage, fail clearly on overflow, and record concrete limits.
- [x] Compare completed-call latency to `6bac1a2` and measure wait, output-heavy, concurrent-cell, memory, event-loop, and cleanup behavior separately from model latency. Explain any short-call regression.
- [x] Demonstrate the complete behavior through the existing host seam using short commands and controlled asynchronous scripts, without requiring the interactive-process slice.

**Implementation evidence:** The session-owned manager now starts a fresh worker, keeps it across yields, and collects output through structured waiting without creating another worker. Native-host checks cover late argument mutation and result redaction, snapshots and changed-key commits, timers and early exit, ordinary failures, CPU termination, cancelled active and queued waits, serialized concurrent collection, independent returned process handles, and commands that finish after their script returns. Notifications use a non-triggering public message and appear at the host's safe boundary.

`node --test packages/pi-codex-tools/test/*.test.ts` passes 141 tests with no failures, cancellations, skips, or todos in 77.936 seconds. The subsequent cleanup-diagnostic change passes two focused shutdown checks: the public error callback receives the underlying cleanup reason, and ordinary shutdown retains command output. `pnpm typecheck`, package `oxlint`, targeted `oxfmt --check`, and `git diff --check` pass. The first yield/wait tracer, queued-caller cancellation, invalid wait-budget ordering, mixed-image order, and active shutdown output each have reproduced failures before their fixes.

The gated output check collects one 2.4 MB UTF-8 item while an asynchronous spill is pending, then collects its remaining bytes and 2,048 later text items exactly once and in order. Collection removes delivered parts in one linear pass. Image checks preserve duplicate image positions and later context redaction in both execution and waiting results; restoration uses the provider's converted image objects only when every processed text and image still matches. Native image-detail processing remains the limitation recorded in ticket 05.

Reload checks retain completed patch effects and compact activity while clearing workers and stored values. Retained unfinished activity renders as interrupted or unknown and is excluded from model context. New, resume, fork, quit, and configured-companion continuation checks remain part of the integrated [ticket 06 verification](06-verify-mixed-native-workflows.md). A pending public result hook demonstrates the two-second operation-cleanup diagnostic. The existing shutdown regression initially lost partial command output; shutdown now lets its active collector settle before closing the stores, and the focused check passes.

Internal limits are fixed, with explicit overflow errors:

- Eight live workers and 32 retained cells; 32 pending calls and 32 waiting collectors per cell.
- One MiB source, eight MiB per worker message, and 16 MiB queued in each message direction. Worker credits are reserved before posting. Shared output storage accepts bounded chunks under its pressure signal.
- 4,096 unread output items, with separate 64 MiB unread text and image stores. Each store keeps 64 KiB in memory before spilling, writes batches up to 256 KiB, and caps its write queue at one MiB.
- 128 stored keys, 256 KiB per key/value pair, and one MiB total serialized state. Each worker has a 128 MiB old-generation heap and four MiB stack limit.
- 256 timers, one MiB of notification text, and 4,096 activity events per cell plus its terminal event. Activity flushes at 16 events or 8,192 summarized-event bytes; argument/error summaries are limited to 256 characters.
- Yield and wait deadlines use one Node timer, capped at 2,147,483,647 ms. The reference upper duration range remains unmeasured.

Configured [ticket 06 verification](06-verify-mixed-native-workflows.md) passed new, resume, fork, reload, quit, and shutdown with a live cell and owned shell. Stored values survived an ordinary prompt and cleared after replacement, while completed file changes and applicable saved history remained. A genuine unfinished activity record rendered as interrupted after abrupt exit and resume. The controlled-host cases passed 15/15 at `f415bae`; the neutral evidence index records the external probe and log hashes.

A fresh serialized comparison of 30 short-command calls per revision measured median/p95 completion at 26.15/29.02 ms for baseline `6bac1a2` and 24.36/27.53 ms for `f415bae`; no repeated short-command regression appeared. Separate controlled-host measurements passed 20 zero-deadline waits with no new workers (median/p95 native call 0.086/0.158 ms), three repetitions each of 8 MiB and 48 MiB output, three concurrent live producers, CPU-loop termination, and pending-command termination. The extended run left no owned workers or process IDs. It recorded whole-process RSS, CPU use, and main-thread delay separately from model latency; these local samples establish neither a capacity ceiling nor provider parity. Credential-free raw captures remain outside the repository: the baseline, revised, and extended JSON SHA-256 values are `40d945d2ff6d781cafd6bdd16305dfec1cf832f256e4ef2437ac9560d957eceb`, `60e1c414fc8de0961a80dedc6d47d62f87eac0049c7b3f6fbe042bebfad8994d`, and `c4ab54fa15da8eb9f131e249423c83ff4df2b090295e9109397e9d3d4057dfa5`. [Ticket 07](07-verify-contract-and-matched-trials.md) owns final performance evidence and matched live-model trials.

**Earlier host evidence:** A controlled real-host probe on the installed 1.0.2 dependency reproduced the lifetime problem. Returning the parent result snapshots and removes its nested-call scope. An in-flight child stays recorded as `unfinished` after it completes; a later call through the saved context reuses the parent's `/1` identifier and adds no record to retained history. Original result-update callbacks deliver no events after the parent returns. On a later prompt, native cancellation aborts the current signal but leaves the saved context's default signal active. Hooks still modify arguments and results, including dropping removed structured content.

Dispatch through an active waiting tool receives that waiting tool's attribution, but cannot account for work between waits. The public call options expose only a signal and an update callback, with no durable scope or reparenting operation. The inspected 1.1.0 source has the same scope-consumption behavior. The original probe passed its seven checks. The approved revision accepts these native limits, owns cell identifiers and activity records through public entries, and passes an explicit cell signal; it does not claim to repair native attribution.

Supplemental observations of the target behavior are retained for [yielding and waiting](../../../packages/pi-codex-tools/test/fixtures/observed/commands/script-yield-wait-and-store.json), [helper lifecycle](../../../packages/pi-codex-tools/test/fixtures/observed/commands/script-helper-lifecycle.json), and [stored-value serialization](../../../packages/pi-codex-tools/test/fixtures/observed/commands/store-serialization.json). Their runtime build identity is unverified. New probes distinguish ordinary text, which does not wake a pending wait, from explicit yielding, which does. Notification delivery is separate and does not wake that wait. Concurrent-wait arbitration and caller-only wait cancellation cannot be independently reached through the available reference controls; serialization and cancelled-wait preservation are accepted package rules, not verified matches.

The current reference allowed dispatched commands to survive both normal script completion and explicit cell termination; their discarded JavaScript callbacks did not run. The approved package contract instead aborts operations still pending at explicit termination and session cleanup. A command that has already returned its own process handle remains independent. Record this difference without changing the user's selected cancellation behavior.

The new [continuation observation index](../../../packages/pi-codex-tools/test/fixtures/observed/continuation/index.json) retains three JSON files and the bounded process helper. Their parsed observation values and helper bytes match the original set; formatting changes only copied artifact hashes. All three indexed artifact hashes and nine case pointers validate. These supplemental observations retain their unverified runtime identity and remain separate from the unchanged frozen contract.
