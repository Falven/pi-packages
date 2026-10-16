# 05: Preserve goals across session changes

**What to build:** Keep current goal state and consumed usage correct through compaction, history navigation, conditional forks, session restoration, and runtime disposal. Follow the approved [specification](../../../docs/specs/pi-goal.md).

**Blocked by:** 04: Account for usage and budgets.

**Status:** ready-for-agent — native session storage delta. Earlier unresolved feature gates remain open.

**Baseline status:** partial — public preservation behavior and captures verified; conditional inheritance, deletion notifications, actual-client provenance, and the native active-EOF limit remain open.

## Native session storage delta

The accepted storage revision in the specification and ADR 0025 governs this delta. Each ticket retains its existing dependency edges; only these new criteria are being implemented in this revision.

- [ ] Produce and reopen all six goal statuses through the existing native controls and runtime outcomes, preserving exact objective, ownership, generation, allowance, counters, and timestamps without charging downtime.
- [ ] Keep the latest current-session snapshot or clear record authoritative across compaction, rewind, reload, and reopening, including records outside the active branch. Replacement and interactive completion must not resurrect historical goals.
- [ ] Verify ordinary forks and clones copy history without acquiring the source goal; newly authorized target goals and healthy session switches remain independent. Conditional inheritance retains its existing capability gate.
- [ ] Verify retaining reload preserves both healthy state and a prior storage-failure stop, while a fresh manager restores saved state only. Session disposal invalidates owned callbacks and does not fabricate an explicit pause.
- [ ] Adapt preservation fixtures to native session entries and observable controls. Goal records share saved-session deletion without an external row; do not claim a deletion notification interrupts another loaded runtime.

## Historical acceptance

The checklist and evidence below describe the earlier implementation. They are not validation of native storage. Earlier database durability and atomic-write guarantees are superseded by the accepted native persistence limits; unchecked broader feature gates remain open.

- [x] Reopen each saved goal with its objective, effective status, allowance, counters, timestamps, ownership, and generation intact. Restoring an active loaded session can admit eligible continuation; inactive statuses remain inactive and downtime adds no elapsed usage.
- [x] Preserve the current durable goal through compaction and history rewind. Do not replay a historical goal event into current state, reset accounting, refund consumed tokens, or resurrect a cleared objective from transcript history.
- [ ] Preserve ordinary goal-context history behavior through compaction. There is no unconditional goal reinjection after every compaction; previously injected context remains subject to normal history replacement. Retain the conditional preservation of user-origin edits arriving after the compaction snapshot.
- [ ] Establish from actual-client evidence which fork operation requests goal inheritance and how the public Pi lifecycle exposes an equivalent. A generic transcript fork does not automatically inherit a goal.
- [ ] Support the specified conditional fork only for an enabled goal capability, explicit continuation deferral, and a persisted target. Reject the incompatible ephemeral-target combination without inventing a persistent session.
- [ ] Flush eligible source accounting at the fork cutoff. Copy objective, status, allowance, counters, both timestamps, and the same private generation identity, changing only the owning session identity. Preserve independent subsequent updates and late-event isolation between source and target.
- [ ] Persist the target's continuation deferral and clear it when its next turn begins with an available token baseline. Reopening the deferred target alone must not prematurely launch an automatic continuation.
- [x] Keep execution within the live loaded runtime. Hiding a view does not itself stop work; actual runtime unload stops execution and accounting without inventing a user pause. Do not scan saved sessions or create a daemon, timer keep-alive, or background executor.
- [ ] Respect terminal, RPC, and one-shot execution lifetimes during exit, session switch, reload, and disposal. Repeated initialization must not leave duplicate observers, ownership, continuations, or presentation behind.
- [x] Verify extension removal separately from pausing or clearing a goal while loaded. Removing a command handler can leave a host-retained continuation command without a cancellation handle. Preserve the reproduced limitation unless a public solution is demonstrated; do not describe loaded pause/clear tests as proof of removal safety.
- [ ] Clear or delete current goal and deferral records at supported lifecycle boundaries while retaining the required conversation history. Verify the host's deletion notification before claiming automatic orphan cleanup.
- [ ] Verify active and inactive restoration, compaction, rewind, source/target fork races, missing baselines, hidden versus unloaded runtimes, and all supported disposal modes through real sessions. A public capability gap remains an explicit blocker for the affected behavior.
- [x] Capture lifecycle-related instructions, persisted counters, continuation admission, and subsequent provider requests in Phoenix. Distinguish actual-client, scripted, and replay evidence, verify retrieval, and record the material results here.
- [x] Preserve Pi source and installed files, native ownership, neutral terminology, and the chosen public integration boundary; complete the relevant checks without claiming unsupported lifecycle coverage.

## Historical Real-session preservation coverage

The [preservation suite](../../../packages/pi-goal/test/preservation.test.ts) adds 20 native-session checks. It uses the existing public loader, session runtime, tools, commands, compactor, history navigation, and terminal dispatch with a local scripted provider. It changes no production source. The compaction and pending-editor fixes discovered by this suite are owned by [ticket 06](06-stop-unproductive-runs.md).

All six saved statuses reopen with the exact objective, allowance, counters, timestamps, session ownership, and private generation. Only an active goal admits a continuation on restoration. These cases create and pause through native tools, close the runtime, then seed the closed saved row to distinguish restoration coverage from status-producer coverage. They include a maximum signed 64-bit allowance and its exact remaining value. Completed state is retained in the headless case; interactive completion cleanup remains covered by ticket 02.

A separate active shutdown case reports 92 tokens, accumulates four whole seconds across raw interruption and disposal, then advances the controlled monotonic clock by an unloaded hour. The reopened native read remains active at 92 tokens and four seconds with the original generation. Session switching flushes the outgoing active goal without pausing it, opens an independent empty session, and restores only the selected session. The inactive session remains unchanged. Retaining reload checkpoints once and produces one fresh continuation through the native command lifecycle.

Manual compaction covers an objective activated while the summary is held, an active objective edited during the summary, and an already active goal resumed after raw interruption without any edit. The two active-summary cases preserve the generation and charge 92 prior tokens plus 92 reported summary tokens exactly once. Pause, clear, and actual native Stop invalidate a continuation waiting for manual compaction. Those checks observe the idle boundary and scheduler turns before making a diagnostic model read, so the read cannot hide an erroneous automatic request.

Compacting a paused goal preserves its full 184-token snapshot while ordinary history replacement removes earlier hidden context. No unconditional goal-context reinjection is observed. Rewinding to history from before goal creation retains the current edited objective and consumed usage. Clearing the goal and revisiting old goal results returns no current goal; transcript history does not resurrect it.

A generic persisted fork copies conversation history but starts without a goal. A newly authorized target goal has independent ownership and generation; returning to the source preserves its recorded cutoff. A generic ephemeral fork remains ephemeral, and its native goal reads and writes reject the missing persistent owner. These cases do not claim the conditional inheritance mode described above. Switching sessions also cancels a pending objective editor and leaves both goals unchanged, preventing the old command promise from surviving runtime disposal.

## Historical Validation

All 20 cases pass on primary Pi 1.1 source `6fb2e7815167e6b19006fc526d1a5d0f5f998787` with Node `24.13.1`. The full suite ran from the actual preservation worktree against production commit `07a936b39912422eb406736472f07263440395df`, then incorporated its unchanged integration merge `06dd431e6558ae6afa0b4196ccaf36d2d10fe0c5`. There were no failures, cancellations, or skipped cases. Scoped lint, formatting, project type checking, and whitespace checks pass.

```sh
/Users/fran/.nvm/versions/node/v24.13.1/bin/node \
  --experimental-transform-types \
  --import /Users/fran/Source/pi/packages/coding-agent/src/experimental/source-resolver.ts \
  --test packages/pi-goal/test/preservation.test.ts
```

The fixture uses native session behavior with a recording terminal or headless bindings. [Ticket 07](07-phoenix-terminal-acceptance.md) supplies separate actual-process evidence for terminal, RPC, print, and JSON lifetimes, including the native active-EOF limit. The native command reload is covered; a bare headless `session.reload()` with no UI, command, shutdown, or error bindings does not emit the same reinitialization events and is not treated as an equivalent lifecycle. The final integrated goal suite passes all 177 cases, including these 20 preservation cases.

## Historical Native preservation captures

Four scenarios at frozen production revision `f89f03aecb18736432c1cc3f81e76390993b7106` make 47 endpoint requests across 51 Phoenix spans. All 102 full input/output fields were independently retrieved and matched as strings, SHA-256 hashes, and byte counts: 6,777,686 bytes. The five production files and shared fixture match their committed hashes. The evidence root is `/tmp/pi-goal-preservation-capture.mPUNn8/20261014T072735014Z-b7cea3c1`.

| Scenario                               | Phoenix trace                      | Verified result                                                                                                                                              |
| -------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Shutdown and restoration               | `2418ed643a8608383e9579fbf62addc5` | Active state retains 92 tokens and four seconds. An unloaded hour adds no time. Reopening admits one continuation, then explicit pause preserves the cutoff. |
| Active manual compaction               | `882dd7be846a11a4aeab3c7114023c09` | Existing 92 tokens plus 92 reported summary tokens reach 184. An automatic read sees 184 without an edit or resume; pause retains it.                        |
| History rewind and clear               | `22e991688ab60435bb1d4632e51fb9fb` | Rewind preserves the current edited objective and paused 184-token record. Clear followed by older history returns no goal.                                  |
| Switch, retaining reload, generic fork | `44878ed79ca2fa505baa1faaabedc073` | Source and target remain independent; reload admits once, unloaded time is excluded, and a generic fork starts without a goal.                               |

Forty-six endpoint requests match public request observations and have parsed response events. One standalone summary bypasses both ordinary public hooks; its endpoint request, scripted response, and successful combined usage report are retained without inventing hook correlation. These captures use a local scripted provider and native sessions. They establish neither actual-client provenance nor conditional inheritance. Shared files remained unchanged. The earlier recorder attempt is retained separately with its observer-count failure and excluded from acceptance.

## Historical Remaining capability and evidence gates

- The inspected public fork operation exposes generic history forking, not the required continuation-deferral request. Actual-client evidence identifying the inheriting operation is still missing. No conditional copy, invented flag, or ephemeral inheritance approximation is implemented.
- There is no verified public session-deletion notification. Explicit clear preserves conversation history and removes current state; automatic orphan cleanup is not claimed.
- Ordinary compacted context is verified. The conditional preservation of user-origin edits after a compaction snapshot remains tied to the unverified actual-client origin path. The suite does not manufacture that provenance.
- Successful public compaction reports may aggregate multiple internal summary calls. This verifies the stable active-goal total, not creation or pause cutoffs inside that aggregate or missing usage from an aborted summary. Ticket 04 records the accounting limit.
- Loaded pause, clear, and Stop are verified separately from extension removal. Ticket 03 retains the reproduced host-command limitation after its handler is removed. This suite adds no private queue access or removal-safety claim.
- Source/target late-event accounting already has ownership and generation checks. Exact inherited-copy races and deferred targets cannot be accepted until the required conditional mode has a demonstrated public path.
- Native RPC EOF can disconnect before an unfinished assistant settles. A fresh command-created goal can therefore retain its SQLite row without a session JSONL file. Ticket 07 reproduces the lost assistant boundary through the unchanged native CLI with no goal extension. Settling an explicit abort before EOF preserves the assistant. This host limitation prevents claiming every active-EOF goal is reopenable.
