# 03: Continue safely and honor Stop

**What to build:** Continue an eligible goal in a fresh work attempt, respect accepted user work at the observed admission boundary, and make the terminal's actual Stop action pause goal pursuit before interruption. Follow the approved [specification](../../../docs/specs/pi-goal.md).

**Blocked by:** 02: Manage goal lifecycle.

**Status:** ready-for-agent

- [ ] Use the public settled-session boundary to request a fresh outer run. Demonstrate that the continuation is a new run; an in-run continuation before settlement is not equivalent.
- [ ] Admit at most one continuation for the current session and generation. Revalidate active status, ownership, limits, shutdown state, and accepted user work at the actual admission point. Rejected admission creates neither a model input nor an automatic-turn identity.
- [ ] Reproduce the observed ordering of already queued backend user work and idle goal work. Bound the claim at the verified admission cutoff; do not promise priority for every draft or input arriving later.
- [ ] Exercise asynchronous settlement with a deferred pause or clear command followed by a queued continuation, simultaneous user input, replacement, reload, and teardown. Prove that a not-yet-admitted stale continuation is cancelled or suppressed. Public idle and pending-message snapshots alone are insufficient evidence.
- [ ] Keep continuation scheduling and goal mutation consistent without rearranging native queue internals or adding private hooks. A failing public approach requires a reproducible missing-capability report before any alternative integration decision.
- [ ] Send hidden user-role goal context with neutral wrapping, current objective, recorded usage, budget, remainder, and the approved persistence, evidence, progress, verified-wait, completion, and blocked-audit guidance. Preserve escaping, delimiters, absent-value placeholders, and message boundaries.
- [ ] Include plan guidance only when its capability is available. Do not add a permanent goal system/developer prefix or inject reminders into every provider request. A timeout while observing a live external handle must not be described as proof that the process ended.
- [ ] Handle externally activated idle goals and idle objective edits through the same admission path with the latest objective. Preserve active-turn edit behavior and pending-message order without duplicate context.
- [ ] Observe the actual native Stop action after editor dispatch resolves autocomplete and focus handling. Attempt an active-goal pause with the observed 500 ms bound, then perform native interruption even when pausing fails or times out. Raw backend abort is not automatically an explicit pause.
- [ ] Preserve default and remapped Stop, autocomplete Escape, overlay dismissal, retry and compaction controls, and the single active editor. Demonstrate public editor composition with native Pi and the composer, attachments, skill references, and chat companions in supported load orders.
- [ ] Remove only extension-owned observers and presentation during reload or teardown; preserve later owners' replacements. No stale callback may start another run after disposal or affect a different loaded session.
- [ ] Verify run boundaries, request counts, pending inputs, tool results, and persisted state through the real-session fixture. Do not equate a non-streaming snapshot with completion of all deferred actions. Perform the relevant actual-terminal Stop checks and leave any unperformed checks pending.
- [ ] Capture continuation, objective editing, queue races, pause, and Stop exchanges in Phoenix. Separate actual-client observations from scripted runs and replays, verify retrieved records, and record supported behavior and unresolved differences here.
- [ ] Leave Pi source and installed files untouched, preserve neutral terminology, run the relevant checks, and keep this ticket incomplete if required admission or Stop behavior remains unproven.

## Admission feasibility evidence

The six real-session probes in `packages/pi-goal/test/admission-boundaries.test.ts` passed against Pi 1.0.2 and 1.1.0. Retaining reload and ordinary disposal reject a stale nonce command without a second provider request. Removing the extension leaves the queued command without its handler: `/goal admission-1` becomes user input and starts a second request.

An extension-owned `setImmediate` action can be cancelled before synchronous removal. An asynchronous settlement observer lets that action enter the host's deferred queue before shutdown, reproducing the same second request. `waitForIdle()` also resolves before asynchronous settlement ends and does not prevent this outcome.

The missing public guarantee is cancellation or revalidation of a deferred prompt at admission after extension removal. These probes establish the failure of the queued-command approach and the tested timer and idle alternatives; they do not establish that every public design is impossible. No private integration is approved. Pause, clear, replacement, actual Stop, companion composition, and Phoenix captures remain unverified here. All acceptance criteria and ticket status remain pending.
