# 03: Continue safely and honor Stop

**What to build:** Continue an eligible goal in a fresh work attempt, respect accepted user work at the observed admission boundary, and make the terminal's actual Stop action pause goal pursuit before interruption. Follow the approved [specification](../../../docs/specs/pi-goal.md).

**Blocked by:** 02: Manage goal lifecycle.

**Status:** ready-for-agent — native session storage delta. Earlier unresolved feature gates remain open.

**Baseline status:** complete for the verified Pi 1.1.0 runtime; inherited provenance and registry distribution remain open outside this ticket

## Native session storage delta

The accepted storage revision in the specification and ADR 0025 governs this delta. Each ticket retains its existing dependency edges; only these new criteria are being implemented in this revision.

- [ ] On a native goal read or append failure, cancel owned pending continuation and reject later automatic admission for that live session manager, including admission after asynchronous settlement. Domain-validation rejections alone do not trigger this stop.
- [ ] Retain only a process-memory failure flag across extension reload, keyed to the public session manager identity using the existing repository pattern. Do not patch host methods, use private fields, or retain a second goal state. A later successful operation must not clear the flag.
- [ ] Prevent accounting retries against a failed in-memory snapshot. Retaining reload remains stopped; reopening the saved session through a fresh native manager recovers only saved state. An independent manager remains usable.
- [ ] Keep native Stop interruption working when pause or cleanup storage fails. Error notifications explain reopening and do not claim a status was saved or that retrying the unchanged command repairs storage.
- [ ] Adapt Stop fault injection to the native storage boundary. Directly verify pending admission suppression, retaining reload, fresh saved-state recovery, native interruption, and independent-session isolation through the approved seam.
- [ ] Preserve healthy continuation placement, queued-user-work ordering, pause and clear admission checks, editor ownership, and the separately recorded extension-removal limitation.

## Historical acceptance

The checklist and evidence below describe the earlier implementation. They are not validation of native storage. Earlier database durability and atomic-write guarantees are superseded by the accepted native persistence limits; unchecked broader feature gates remain open.

- [x] Use the public settled-session boundary to request a fresh outer run. Demonstrate that the continuation is a new run; an in-run continuation before settlement is not equivalent.
- [x] Admit at most one continuation for the current session and generation while the extension remains loaded. Revalidate active status, ownership, limits, shutdown state, and accepted user work when the pending command handler runs. Rejected admission creates neither a model input nor an automatic-turn identity.
- [x] Reproduce the observed ordering of already queued backend user work and idle goal work. Bound the claim at the verified admission cutoff; do not promise priority for every draft or input arriving later.
- [x] Directly test asynchronous settlement with deferred pause and clear commands before pending continuations while the extension stays loaded. Each command must recheck the goal and exit without model work when ineligible; physical queue removal is unnecessary. Cover simultaneous user input, replacement, and retaining reload separately. Public idle snapshots and source inspection alone are insufficient evidence.
- [x] Keep continuation scheduling and goal mutation consistent without rearranging native queue internals or adding private hooks. A failing public approach requires a reproducible missing-capability report before any alternative integration decision.
- [x] Send hidden user-role goal context with neutral wrapping, current objective, recorded usage, budget, remainder, and the approved persistence, evidence, progress, verified-wait, completion, and blocked-audit guidance. Preserve escaping, delimiters, absent-value placeholders, and message boundaries.
- [x] Include plan guidance only when its capability is available. Do not add a permanent goal system/developer prefix or inject reminders into every provider request. A timeout while observing a live external handle must not be described as proof that the process ended.
- [x] Handle externally activated idle goals and idle objective edits through the same admission path with the latest objective. Preserve active-turn edit behavior and pending-message order without duplicate context.
- [x] Observe the actual native Stop action after editor dispatch resolves autocomplete and focus handling. Attempt an active-goal pause with the observed 500 ms bound, then perform native interruption even when pausing fails or times out. Raw backend abort is not automatically an explicit pause.
- [x] Preserve default and remapped Stop, autocomplete Escape, overlay dismissal, retry and compaction controls, and the single active editor. Demonstrate public editor composition with native Pi and the composer, attachments, skill references, and chat companions in supported load orders.
- [x] Remove only extension-owned observers and presentation during reload or teardown; preserve later owners' replacements. Invalidate owned scheduling and callbacks. Record Pi-retained commands after extension removal as a separate host-lifecycle limitation for ticket 05; do not conflate it with loaded pause/clear or claim host queue cancellation.
- [x] Verify run boundaries, request counts, pending inputs, tool results, and persisted state through the real-session fixture. Do not equate a non-streaming snapshot with completion of all deferred actions. Perform the relevant actual-terminal Stop checks and leave any unperformed checks pending.
- [x] Capture continuation, objective editing, queue races, pause, and Stop exchanges in Phoenix. Separate actual-client observations from scripted runs and replays, verify retrieved records, and record supported behavior and unresolved differences here.
- [x] Leave Pi source and installed files untouched, preserve neutral terminology, run the relevant checks, and keep this ticket incomplete if required admission or Stop behavior remains unproven.

## Historical Admission feasibility evidence

The six real-session probes in `packages/pi-goal/test/admission-boundaries.test.ts` passed against Pi 1.0.2 and 1.1.0. Retaining reload and ordinary disposal reject a stale nonce command without a second provider request. Removing the extension leaves the queued command without its handler: `/goal admission-1` becomes user input and starts a second request.

An extension-owned `setImmediate` action can be cancelled before synchronous removal. An asynchronous settlement observer lets that action enter the host's deferred queue before shutdown, reproducing the same second request. `waitForIdle()` also resolves before asynchronous settlement ends and does not prevent this outcome.

The missing public guarantee concerns a deferred prompt after extension removal, when its command handler is gone. It does not prove that pausing or clearing a goal fails while the handler remains loaded. The 2026-10-14 clarification separates those boundaries: loaded handlers may recheck and discard stale continuations without physically removing commands. The removal probes and timer/idle alternatives remain valid evidence of the separate host-lifecycle limitation; no private integration is approved. The package checks below now establish loaded pause and clear behavior separately.

## Historical Stop feasibility evidence

The 17 feasibility cases in the former `packages/pi-goal/test/stop-probe.test.ts`, retained at commit `268f5f44417a373f36c8ab853e8d50b8adbb4913`, passed against Pi 1.0.2 and 1.1.0. A public editor composition installed at `before_agent_start` preserves native dispatch, autocomplete and overlays, default and remapped interruption, retry and compaction cancellation, and both companion load orders, including packaged loading. Controlled pause rejection, synchronous failure, and a 500 ms timeout still delegate to native interruption; the timer is not a hard wall-clock bound. Raw backend abort does not request pause. Shutdown preserves a later editor owner and suppresses a delayed Stop callback.

These historical tests use the recording terminal fixture and controlled pause callbacks. Their copied feasibility implementation was retired after the production implementation acquired persisted-state, bounded-callback, and actual-terminal coverage. The checks below exercise that production code.

## Historical Implemented admission and context

The package owns one pending nonce and one cancellable `setImmediate` action for the current session, generation, and local revision. The deferred `/goal --continue` handler rechecks the latest stored goal, session, revision, idle state, accepted pending work, and extension lifetime. It sends the hidden custom message with `triggerTurn: true` synchronously after those checks. The continuation identity appears only in the accepted custom message. User mutations invalidate the old nonce; they do not edit Pi's queue.

Thirteen real-session cases in `packages/pi-goal/test/continuation.test.ts` verify fresh `agent_start`/`agent_settled` boundaries, one accepted continuation, idle activation and objective editing, conditional plan guidance, accepted input awaiting an asynchronous start hook, deferred pause and clear during asynchronous settlement, replacement, pause/resume, restoring the current active session, already queued user work, retaining reload, disposal, and raw abort. The run identities in capture records are observer ordinals from public events, not opaque host identifiers. The public input hook conservatively invalidates a candidate before prompt processing finishes; the verified ordering claim ends at the tested admission cutoff.

The paused and cleared asynchronous cases finish with two initial provider requests and no automatic context. A subsequent explicit inspection produces the expected paused goal or null. Replacement and pause/resume each admit one fresh attempt using the latest goal. A normal continuation has four requests across two outer attempts and one hidden context; an active objective edit has four requests in one attempt, with its hidden edit context after tool output. An idle edit supplies only the current continuation context.

The hidden continuation message preserves objective escaping, the `objective` delimiter, `none` and `unbounded` placeholders, the blank line before the closing wrapper, and no trailing newline after that wrapper. Running edits retain `untrusted_objective` and the `unknown` remainder placeholder. Plan guidance appears only for an effective `update_plan` capability. Context includes the whole-objective evidence audit, live-handle wait rule, and three-turn blocked audit; it is not a permanent system prefix or a repeated reminder injected into each request. Recorded accounting is still zero in these fresh scenarios because accounting belongs to ticket 04.

## Historical Persisted Stop and terminal evidence

`packages/pi-goal/src/stop.ts` composes the public editor factory and wraps the native interruption callback after the host assigns it. It preserves native key dispatch, autocomplete and focus handling. Its 500 ms pause attempt is followed by native interruption using the current host state even after a pause failure. The timer is an event-loop bound, not a hard wall-clock guarantee. Stored callback descriptors preserve ownership when a companion proxy binds function reads. Teardown invalidates owned callbacks and preserves later factory or callback replacements.

Thirteen package cases in `packages/pi-goal/test/stop.test.ts` passed on primary Pi 1.1.0 using Node 24.13.1. They cover default and remapped Stop for native Pi and both companion load orders, file autocomplete Escape, overlays, composer undo/redo, persistent paused status, a real SQLite pause-write failure followed by interruption, later editor owners, and native retry and compaction cancellation with persisted pause. The loaded companions are `pi-composer`, `pi-attachments`, `pi-chat`, and `pi-skill-references`.

Seven additional real-session cases in `/tmp/pi-goal-stop-module-5aHYwX/check.mjs` import the actual production `createGoalStop` module. All passed after the companion descriptor fix. They cover successful pause, synchronous throw, rejection, timeout, interruption of the current run after a delayed pause, suppressed late callbacks after disposal, and preservation of later editor owners. The timeout case observed at least 490 ms; interruption in each case occurred within an 800 ms scheduling tolerance. These controlled callback checks are distinct from both the older embedded feasibility implementation and the package's persisted-state tests. The command was `node --experimental-transform-types --import /Users/fran/Source/pi/packages/coding-agent/src/experimental/source-resolver.ts --test /tmp/pi-goal-stop-module-5aHYwX/check.mjs` using Node 24.13.1.

The actual-terminal harness is `/tmp/pi-goal-stop-pty-QCCiyU`, with verified results in `verification.json`. It creates an OS PTY and runs native `ProcessTerminal`, `InteractiveMode`, the public extension loader, isolated session state, and a local scripted model server. Six successful cases cover native Pi and both companion load orders with default and remapped Stop. Every case retained paused goal state, exited zero, and entered and restored native raw mode. The native/default case also reproduced a real pause-write failure before recovering through an explicit pause. Observed Stop delivery was approximately 24–54 ms; these measurements do not replace the separate 500 ms deadline test.

Each successful case retains exact `transcript.bin`, control inputs, runtime/source hashes, provider exchanges, and retrieved Phoenix data. Two failed harness setup attempts are listed separately in `verification.json`; neither is counted as acceptance evidence. This batch exercised command autocomplete and overlays in the PTY. [Ticket 07](07-phoenix-terminal-acceptance.md) adds integrated physical file-completion, retry, compaction, companion, and lifecycle checks. These are actual process-terminal observations with scripted responses; they do not establish reference desktop behavior or live-model outcomes.

The PTY runs use the same final `stop.ts` and `state.ts` bytes. Their index capture predates only the six added teardown guards in `576ef3f`; the provider captures and 74-case run include those guards. Every capture records its own revision and source hashes rather than claiming all recordings used identical package bytes.

## Historical Phoenix evidence

Six scripted provider scenarios in `/tmp/pi-goal-admission-capture.99jO4N` produced 22 spans with 44 matching complete input/output SHA256 values after retrieval. `final-report.json` records every hash; scenario JSON files retain full requests, stream events, tool events, messages, public run boundaries, controls, source hashes, and settings. The public request observer exactly matched each endpoint's decoded request-body string after decompression; no claim is made about compressed transport bytes.

| Scenario              | Trace                              | Observed result                                                  |
| --------------------- | ---------------------------------- | ---------------------------------------------------------------- |
| Continuation          | `18f4c5f049c2585f1c94157fb7b22f36` | 4 requests, 2 attempts, 1 context                                |
| Active objective edit | `d3f2241fab01c3c2624ae4a3a2923075` | 4 requests, 1 attempt, 1 edit context                            |
| Deferred pause        | `8941e9870e510304c62c9510f389e298` | No automatic input; explicit inspection returns paused           |
| Deferred clear        | `859ec86bce45e3f1cbe828c529761255` | No automatic input; explicit inspection returns null             |
| Accepted user work    | `e6b5432c4067b7a13f8cf6610667c5e2` | Accepted user request starts the second attempt; no goal context |
| Idle objective edit   | `43aac09e5728ecc3a7aafc4dce51c77d` | 2 requests, latest objective, 1 continuation context             |

The six actual PTY scenarios produced seven provider requests plus six terminal transcript spans, for 13 spans and 26 retrieved input/output hash matches. Their traces are `af34587c7625433db1e5c1a4620ba8c3`, `f943f4186c2d4b49b3b012f42bcf1fc1`, `48a2456dde41474b9668082afeb225a8`, `a5937000efe84167a3d15ad4a2d9fffd`, `7e499aa953ef4debb6ce6fc3220a33d6`, and `162a0dec953042c3847c5f4f37ddaa5d`. All six raw terminal transcripts were retrieved byte-for-byte with matching base64 content, byte counts, and SHA256 values.

An independent integration review re-retrieved all 35 spans across the twelve scenarios and verified all 70 full input/output fields, their stored hashes and byte counts, and all six exact terminal transcripts. The reference-runtime scripted observations and the Pi scripted and PTY observations remain distinct evidence. The inherited actual-client provenance gate from ticket 02 and full comparison gate in ticket 07 remain open.

## Historical Checks and runtime limits

The supported primary runtime is Pi 1.1.0 at `6fb2e7815167e6b19006fc526d1a5d0f5f998787`, running Node 24.13.1. The first command passed 74 tests; the second passed the 13 package Stop cases:

```sh
node --import /Users/fran/Source/pi/packages/coding-agent/src/experimental/source-resolver.ts --experimental-transform-types --test --test-timeout=10000 packages/pi-goal/test/goals.test.ts packages/pi-goal/test/lifecycle.test.ts packages/pi-goal/test/protocols.test.ts packages/pi-goal/test/continuation.test.ts
node --import /Users/fran/Source/pi/packages/coding-agent/src/experimental/source-resolver.ts --experimental-transform-types --test packages/pi-goal/test/stop.test.ts
```

The secondary Pi 1.0.2 run passed the 74-case command without the source resolver, but one assertion deliberately reproduces an incompatibility. Raw backend abort while streaming leaves the goal active and suppresses immediate continuation on both runtimes. Raw abort during native retry delay suppresses continuation on 1.1.0, whose settled event has `aborted: true`. Version 1.0.2 emits no cancellation field and does not abort the earlier completed request's signal; it starts another goal attempt. Its core `AgentSession` exposes retry state and retry events, but the extension API does not expose that cancellation state. The test named `retry cancellation follows the host's public settled cancellation boundary` records both outcomes explicitly. Passing the incompatibility assertion is not support for that behavior. No timing inference, error-text inference, host patch, or private adapter was added.

An isolated install of published Pi 1.0.4 with scripts disabled reproduced the same retry-cancellation limit from unchanged copies of the test, fixture, and package source. An independent integration rerun confirmed the result. The command used the test-name filter `retry cancellation follows`; `/tmp/pi-goal-published.DVo7k9/retry-cancellation.tap` records the explicit incompatibility diagnostic. Version 1.0.4's settled event also omits cancellation metadata. The package peer requirement is therefore `^1.1.0`; 1.0.2 is retained only as a development dependency for secondary boundary checks. At the recorded registry check, the newest published version was 1.0.4. The verified source runtime is the supported development target; this work publishes neither runtime nor package.

`node_modules/.bin/tsc --noEmit -p tsconfig.json`, `node_modules/.bin/oxlint packages/pi-goal/src packages/pi-goal/test`, `node_modules/.bin/oxfmt --check packages/pi-goal/src packages/pi-goal/test`, and `git diff --check` passed. Pi source and installed host files remain untouched. The separate extension-removal limitation still belongs to ticket 05: a command already retained by Pi may become user input after its handler is removed. Loaded pause, clear, replacement, and retaining reload are verified without claiming host queue cancellation. Accounting, runtime safeguards, inherited actual-client provenance, and final release remain separate gates.
