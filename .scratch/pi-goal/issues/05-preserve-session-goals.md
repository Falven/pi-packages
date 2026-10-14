# 05: Preserve goals across session changes

**What to build:** Keep current goal state and consumed usage correct through compaction, history navigation, conditional forks, session restoration, and runtime disposal. Follow the approved [specification](../../../docs/specs/pi-goal.md).

**Blocked by:** 04: Account for usage and budgets.

**Status:** ready-for-agent

- [ ] Reopen each saved goal with its objective, effective status, allowance, counters, timestamps, ownership, and generation intact. Restoring an active loaded session can admit eligible continuation; inactive statuses remain inactive and downtime adds no elapsed usage.
- [ ] Preserve the current durable goal through compaction and history rewind. Do not replay a historical goal event into current state, reset accounting, refund consumed tokens, or resurrect a cleared objective from transcript history.
- [ ] Preserve ordinary goal-context history behavior through compaction. There is no unconditional goal reinjection after every compaction; previously injected context remains subject to normal history replacement. Retain the conditional preservation of user-origin edits arriving after the compaction snapshot.
- [ ] Establish from actual-client evidence which fork operation requests goal inheritance and how the public Pi lifecycle exposes an equivalent. A generic transcript fork does not automatically inherit a goal.
- [ ] Support the specified conditional fork only for an enabled goal capability, explicit continuation deferral, and a persisted target. Reject the incompatible ephemeral-target combination without inventing a persistent session.
- [ ] Flush eligible source accounting at the fork cutoff. Copy objective, status, allowance, counters, both timestamps, and the same private generation identity, changing only the owning session identity. Preserve independent subsequent updates and late-event isolation between source and target.
- [ ] Persist the target's continuation deferral and clear it when its next turn begins with an available token baseline. Reopening the deferred target alone must not prematurely launch an automatic continuation.
- [ ] Keep execution within the live loaded runtime. Hiding a view does not itself stop work; actual runtime unload stops execution and accounting without inventing a user pause. Do not scan saved sessions or create a daemon, timer keep-alive, or background executor.
- [ ] Respect terminal, RPC, and one-shot execution lifetimes during exit, session switch, reload, and disposal. Repeated initialization must not leave duplicate observers, ownership, continuations, or presentation behind.
- [ ] Verify extension removal separately from pausing or clearing a goal while loaded. Removing a command handler can leave a host-retained continuation command without a cancellation handle. Preserve the reproduced limitation unless a public solution is demonstrated; do not describe loaded pause/clear tests as proof of removal safety.
- [ ] Clear or delete current goal and deferral records at supported lifecycle boundaries while retaining the required conversation history. Verify the host's deletion notification before claiming automatic orphan cleanup.
- [ ] Verify active and inactive restoration, compaction, rewind, source/target fork races, missing baselines, hidden versus unloaded runtimes, and all supported disposal modes through real sessions. A public capability gap remains an explicit blocker for the affected behavior.
- [ ] Capture lifecycle-related instructions, persisted counters, continuation admission, and subsequent provider requests in Phoenix. Distinguish actual-client, scripted, and replay evidence, verify retrieval, and record the material results here.
- [ ] Preserve Pi source and installed files, native ownership, neutral terminology, and the chosen public integration boundary; complete the relevant checks without claiming unsupported lifecycle coverage.
