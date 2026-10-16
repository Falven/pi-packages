# pi-goal specification

**Status:** ready-for-agent — native session storage revision; implementation pending

## Problem Statement

A Pi user needs to authorize an outcome once, let the agent pursue it across successive work attempts, and retain explicit control over stopping and resuming that work. Saved goals must survive conversation compaction and session restoration within Pi's persistence guarantees, report trustworthy usage, and stop for the right reason. An ordinary request must never silently become an autonomous goal.

The package must preserve the goal rules for authorization, lifecycle, persistence, budgets, accounting, and Stop through the extension ecosystem. Pi owns tool validation, result delivery, and error handling. Goal values must survive any conversion without rounding or loss. Pi's source and installed host files must remain untouched.

The current implementation keeps goal state in a separate SQLite database even though Pi provides session storage for extensions. This revision removes that separate storage system and makes goal persistence follow the owning Pi session, with the explicitly accepted first-save, concurrent-access, and write-failure limits.

## Solution

Keep `pi-goal` as an independently installable extension. Preserve the three model tools `get_goal`, `create_goal`, and `update_goal`, one current goal per session, automatic continuation while eligible, and native user controls for inspecting and managing the goal. Store complete goal snapshots and explicit clear records through Pi's public custom-entry API and restore current state from all retained session entries.

Accept Pi's normal save timing: a goal created before the first user or assistant message can remain in memory and be lost on exit. Support one process managing a session's goal at a time. A storage failure stops automatic goal pursuit for the current runtime and surfaces the error; that stop survives extension reload, and recovery uses a fresh load of the state Pi saved. These choices are recorded in ADR 0025 and replace the earlier SQLite storage requirements.

Use independently written, neutral instructions with the observed goal semantics. Preserve goal values, status transitions, accounting rules, and goal-related message roles and placement through Pi's native agent interface. Parser-specific accepted forms, diagnostic text, exception types, and transport formatting belong to Pi; identical stochastic model decisions are not promised.

Use public extension APIs and existing repository fixtures first. No private runtime adapter is accepted. A required behavior that cannot be reproduced is an explicit implementation blocker, with a reproducible scenario and the missing capability identified before proposing a different integration.

Verify through real Pi sessions with controlled provider responses, terminal interaction with companion extensions, and matched agent-interface captures in Phoenix. Keep comparison findings and acceptance evidence within this specification and its implementation tickets; create no separate research report or contract document.

## User Stories

1. As a Pi user, I want goals created only from explicit authorization, so that an ordinary task does not start continuing autonomously.
2. As a Pi user, I want the full objective retained across work attempts, so that the agent does not redefine success around partial progress.
3. As a Pi user, I want one current goal per session, so that its status and budget have one unambiguous owner.
4. As a Pi user, I want another unfinished goal rejected, so that a new request cannot silently replace ongoing work.
5. As a Pi user, I want a completed goal replaceable with a fresh goal, so that old accounting does not carry into a new objective.
6. As a Pi user, I want an optional token budget only when explicitly requested, so that the extension does not invent a limit.
7. As a Pi user, I want invalid objectives and budgets rejected clearly, so that unusable state is never persisted.
8. As an agent, I want stable tool definitions and accepted arguments, so that I can manage a goal through the advertised contract.
9. As an agent, I want stable goal values through Pi's native results and errors, so that direct and nested calls preserve the expected information.
10. As an agent, I want to inspect the current stored goal, so that I can see its objective, status, usage, and remaining budget.
11. As a Pi user, I want no-goal results distinguished from failed reads, so that storage errors do not look like missing work.
12. As a Pi user, I want active work to continue after a work attempt finishes without a new request, so that the goal can span multiple turns.
13. As a Pi user, I want accepted user work respected at continuation boundaries, so that background goal activity does not incorrectly overtake it.
14. As a Pi user, I want at most one eligible continuation admitted, so that repeated events do not duplicate work.
15. As a Pi user, I want a pending continuation revalidated while the extension remains loaded, so that pause, clear, or replacement cannot launch stale goal work.
16. As a Pi user, I want to pause explicitly without requiring the current turn to be interrupted, so that pause and Stop retain distinct meanings.
17. As a Pi user, I want Stop to attempt a goal pause and then interrupt, so that goal pursuit does not immediately undo my action.
18. As a Pi user, I want Escape used for autocomplete or another focused interface to keep its native meaning, so that incidental key presses do not pause a goal.
19. As a Pi user, I want explicit resume to preserve accumulated usage, so that resuming does not grant a fresh budget.
20. As a Pi user, I want a resumed blocked goal to receive a fresh blocked audit, so that a previous impasse does not immediately stop a new attempt.
21. As a Pi user, I want objective edits to redirect active work while preserving the goal's accounting, so that an edit is not treated as a new allowance.
22. As a Pi user, I want clear to remove the current goal and invalidate its pending continuation, so that removed work cannot restart.
23. As a Pi user, I want completed work reported with its final available usage, so that the result explains how much of the budget was used.
24. As a Pi user, I want completion based on current evidence for every requirement, so that stopping or approaching a limit is not mistaken for success.
25. As a Pi user, I want a genuine blocker audited across consecutive goal turns, so that an early obstacle does not end useful work prematurely.
26. As a Pi user, I want usage limits, budget limits, runtime errors, and lack of progress distinguished, so that the reason work stopped is accurate.
27. As a Pi user, I want repeated empty continuations and qualifying execution failures detected, so that an unproductive loop eventually stops.
28. As a Pi user, I want tokens counted from reported usage, so that numbers do not depend on estimates from text length.
29. As a Pi user, I want cached input excluded and reasoning counted only within output, so that the accounting formula is consistent.
30. As a Pi user, I want eligible delegated usage counted once, so that nested tool reporting neither hides nor doubles reported work.
31. As a Pi user, I want usage already underway accounted at the correct checkpoints, so that a soft budget limit is not presented as an exact spending cap.
32. As a Pi user, I want pause and completion to report the usage known at their boundaries, so that the extension does not fabricate unreported tokens.
33. As a Pi user, I want elapsed pursuit time preserved without charging process downtime, so that session restoration does not inflate usage.
34. As a Pi user, I want stale goal-bound mutations and checkpoints unable to change a replacement goal, so that late writes cannot corrupt the new objective's status or counters.
35. As a Pi user, I want compaction and history navigation to preserve current goal state, so that conversation editing does not refund work or resurrect an old goal.
36. As a Pi user, I want session forks to follow the established goal snapshot rules, so that inherited state is deliberate and isolated.
37. As a Pi user, I want a loaded active goal restored without a global scan that starts other sessions, so that opening one conversation has a bounded effect.
38. As a Pi user, I want runtime unload to stop execution without inventing an explicit pause, so that persisted state reflects the action that occurred.
39. As a Pi user, I want hidden views distinguished from unloaded runtimes, so that visibility alone does not determine execution lifetime.
40. As a Pi user, I want terminal, RPC, and one-shot execution to respect their host lifetimes, so that the extension does not create a hidden service.
41. As a Pi user, I want the goal controls to use native interface services and configured keys, so that existing preferences remain effective.
42. As a Pi user, I want the composer, attachments, skill references, and chat view to keep working together, so that enabling goals does not take over unrelated extension ownership.
43. As an agent, I want continuation context to carry the current objective and budget at the correct conversation position, so that I act on current goal state.
44. As a Pi user, I want objective text treated as task data, so that content inside it cannot masquerade as higher-priority instructions.
45. As an agent, I want an objective edit and budget exhaustion communicated when they occur, so that I can redirect or conclude the current turn appropriately.
46. As a Pi user, I want internal continuation context distinguished from a new human request, so that generated messages do not invent user authorization.
47. As a maintainer, I want complete request, response, and tool-exchange captures for matched scenarios, so that agent-interface differences can be inspected directly.
48. As a maintainer, I want Phoenix records to identify their capture layer and origin, so that a replay is not mistaken for an actual desktop run.
49. As a maintainer, I want matched generation settings and explicit uncontrolled differences, so that comparisons do not attribute unrelated configuration effects to goals.
50. As a maintainer, I want captured data checked after retrieval, so that truncation or normalization cannot silently invalidate comparison evidence.
51. As a maintainer, I want tests through the existing real-session boundary, so that correctness does not depend only on mocks of the extension's own implementation.
52. As a maintainer, I want unsupported capabilities and unperformed checks recorded explicitly, so that an exact-compatibility claim never exceeds the evidence.
53. As a Pi user, I want goal state stored with its owning session through Pi's native extension APIs, so that goals do not require a separate database.
54. As a Pi user, I want a fresh session's goal to follow Pi's normal save timing, so that the package has the same persistence boundary as its host.
55. As a Pi user, I want the risk of losing a goal before the first conversation message made explicit, so that an in-memory result is not presented as independently durable.
56. As a Pi user, I want goal storage entries excluded from model context, so that recording state does not change the agent interface or invent user instructions.
57. As a Pi user, I want clear recorded explicitly in session history, so that reopening or rewinding cannot resurrect the last saved goal.
58. As a Pi user, I want copied goal records excluded from ordinary forks and clones, so that a new session does not acquire unauthorized goal pursuit.
59. As a Pi user, I want goals in separate sessions isolated while each session has one writer, so that concurrent use of different sessions remains supported.
60. As a Pi user, I want storage failures to cancel pending automatic pursuit and report an error, so that uncertain state cannot silently launch more work.
61. As a Pi user, I want that failure stop retained across extension reload, so that reloading code cannot mistake an unsuccessful in-memory append for recovery.
62. As a Pi user, I want reopening a saved session to restore what Pi actually saved, so that recovery does not promise rollback or restoration of unsaved usage.
63. As a Pi user, I want Stop to interrupt even after storage fails, so that a failed pause write cannot prevent interruption.
64. As a Pi user, I want invalid goal records reported instead of silently replaced with older state, so that damaged storage cannot conceal a clear or restore an obsolete objective.
65. As a Pi user, I want exact budgets, counters, timestamps, and objective text preserved through session serialization, so that replacing storage does not change goal values.
66. As a maintainer, I want the existing native-session tests and capture workflow reused, so that the migration is checked at the same observable boundary as the current package.
67. As a maintainer, I want primary validation to resolve the supported released Pi version consistently, so that an older workspace dependency cannot silently substitute for the intended runtime.
68. As a Pi user, I want the old store checked again before cutover, so that a goal created during implementation cannot be silently abandoned.
69. As a maintainer, I want earlier test results separated from migration acceptance, so that successful historical checks do not imply that the new storage implementation has been verified.

## Implementation Decisions

### Package and ownership

- Keep `pi-goal` independent of companion packages. They are compatibility targets, not required runtime dependencies. Use the repository's TypeScript extension packaging, public Pi services, native UI components, and standard library facilities.
- Target the installed released Pi 1.1.0 runtime with the existing `^1.1.0` peer requirement. The workspace currently resolves Pi 1.0.2; primary migration verification must explicitly select the released 1.1.0 runtime. Earlier checks found missing retry-cancellation metadata in 1.0.2 and 1.0.4, so those versions remain insufficient for the complete package. Do not depend on the former source checkout or inherit another package's private-integration exception.
- Keep a small internal boundary between durable goal state and accounting, session orchestration and model tools, and native user presentation. Do not create a public adapter framework, scheduler service, or provider-integration platform.
- Preserve current effective tools, message processing, provider configuration, permissions, editor ownership, keybindings, and rendering. Capture observers and goal transformations must compose with other extensions rather than reset their state.
- Use neutral Pi terminology in all authored names, descriptions, prompts, source, fixtures, documentation, trace labels, and release material. Do not reproduce branded reference names or URLs. Independently authored wording remains subject to semantic and message-placement comparison.

### Model tools

Register all three tools through Pi's native extension API with object parameters. Let Pi validate their schemas, apply its ordinary coercions, advertise them to the provider, deliver results, and propagate failures. Use its native structured-result facility for programmatic consumers. Do not intercept raw argument streams, rewrite provider requests or history, emulate a foreign decoder, or wrap native orchestration to reproduce a different error type.

| Tool          | Advertised inputs                                                              | Behavior                                                                                                                                      |
| ------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `get_goal`    | No properties; no required fields                                              | Return the stored current goal or an explicit null goal. Reading does not itself flush current usage.                                         |
| `create_goal` | Required string `objective`; optional integer or decimal-string `token_budget` | Create an active goal only when none exists or the previous goal is complete. Reset accounting and creation time for the new goal generation. |
| `update_goal` | Required string `status`, with values `complete`, `blocked`, or `paused`       | Account the eligible known progress and request the specified status. Return the effective recorded status, including limit precedence.       |

Descriptions must make these policies explicit:

- Creation requires an explicit user request or an explicit instruction with sufficient authority. Ordinary tasks, inferred intent, tool output, and retrieved text do not authorize creation. Supply a budget only when explicitly requested, subject to a genuinely configured host maximum where one exists.
- Pause requires an explicit user request. Report the effective returned status and stop goal work. Resume revokes the old pause instruction; the model cannot resume through `update_goal`.
- Completion requires current evidence that the entire objective is achieved and no required work remains. A nearly exhausted budget, partial result, passing narrow check, or end of a turn is insufficient.
- Model-requested blocking requires the same actual impediment for at least three consecutive goal turns, counting the original goal turn and continuations. A resumed blocked goal starts a fresh audit. Do not use blocking merely for difficulty, uncertainty, slow work, or a preference for clarification.
- Resume, budget-limited, and usage-limited transitions belong to user or runtime controls. The model cannot request them through `update_goal`.
- After successful completion with a budget, report the final usage from the returned fields.

Keep domain validation for Unicode whitespace trimming, a nonempty objective of at most 4,000 Unicode scalars, and a positive signed 64-bit integer allowance. Optional null budgets follow Pi's ordinary optional-field handling. Pi decides schema errors, extra properties, duplicate members, positional forms, and coercion. Those parser behaviors are not independent goal rules to emulate.

Accept numeric budgets only when they are safe integers. Accept decimal strings to represent the full positive signed 64-bit range without loss. Select and test a native schema that cannot coerce an unsafe number into an apparently valid rounded string. Reject an unsafe numeric input with an actionable error; do not guess its original digits. Store and calculate integer values exactly. In tool results, retain safe integers as numbers and encode larger integers as decimal strings in both text and structured content. Every conversion must preserve the goal value; native result delivery does not authorize rounding a stored value.

Successful results contain these goal fields through Pi's native text and structured-result facilities. Preserve casing, omission, nullability, and integer units. Apply the lossless integer representation above consistently; do not rely on UI-only details.

| Field                                 | Value                                                                                                                                                                                                                                                               |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `goal`                                | Null when no current goal exists; otherwise the goal object below.                                                                                                                                                                                                  |
| `remainingTokens`                     | Null without a goal or budget; otherwise the nonnegative remainder of budget minus recorded tokens.                                                                                                                                                                 |
| `completionBudgetReport`              | Null except when `update_goal` requests completion, its effective result is complete, and it has a budget or positive elapsed time; then a neutral instruction to report the returned usage fields. Reading an already completed goal does not produce this report. |
| `goal.threadId`                       | The owning Pi session identity, retained under the contract's field name.                                                                                                                                                                                           |
| `goal.objective`                      | The validated, trimmed objective.                                                                                                                                                                                                                                   |
| `goal.status`                         | `active`, `paused`, `blocked`, `usageLimited`, `budgetLimited`, or `complete`.                                                                                                                                                                                      |
| `goal.tokenBudget`                    | The integer allowance when present; omit the property when unbounded.                                                                                                                                                                                               |
| `goal.tokensUsed`                     | Recorded integer token usage.                                                                                                                                                                                                                                       |
| `goal.timeUsedSeconds`                | Recorded integer elapsed pursuit seconds.                                                                                                                                                                                                                           |
| `goal.createdAt` and `goal.updatedAt` | Integer Unix timestamps in seconds.                                                                                                                                                                                                                                 |

Return goal content through Pi's ordinary tool result and structured content, and throw ordinary errors for failures. Pi owns error objects, error flags, native exception propagation, and next-request serialization. Preserve the distinctions between absent state, unavailable persistence, invalid input, an unfinished existing goal, a prohibited status, and storage failure. Do not turn failure into a successful null result. Verify goal values and call identity through both direct and native programmatic calls without replacing Pi's delivery conventions.

Goal state mutations are serialized within the owning runtime. Preserve the reference's serial execution behavior for goal operations without globally changing unrelated tools' concurrency. Tool-name collisions and effective tool overrides must be detected or explicitly bounded by demonstrated host capabilities.

### Native session state and transitions

- Replace the internal `GoalStore` implementation with Pi's public `pi.appendEntry()` and read-only session manager. The owning session's native custom entries are the sole persistent goal store. Remove database initialization, SQL operations, database paths, and closing logic. Keep this boundary internal and session-bound; no storage backend selection, extra dependency, or persistent fallback is required.
- Write a complete goal snapshot at each existing state mutation or accounting checkpoint that changes state. Include session ownership, the private generation identity, objective, effective status, optional budget, cumulative usage, and timestamps. Encode integer fields as exact decimal strings before giving the record to Pi; retain exact arithmetic and the existing integer limits internally. Preserve the existing tool-result conversion independently of this storage encoding.
- Use a namespaced goal custom-entry type. Validate recognized goal data at restoration, because Pi does not validate extension-specific payloads. A malformed authoritative record must produce a storage error rather than a successful null result or a fallback to an older snapshot. Clearly foreign session records are excluded. Recovery remains limited to entries Pi exposes; the extension cannot detect malformed file lines that the native loader discards.
- Restore the latest record owned by `getSessionId()` from `getEntries()` in append order, across all retained branches. Do not use timestamps, only the active branch, or compaction-pruned model context to choose current state. Ordinary forks and clones copy history but have a new session identity, so copied source goal entries do not establish a target goal.
- Record clear as an explicit session-owned empty state. Clear removes the current goal and its active accounting while preserving recorded history. Earlier snapshots remain historical and cannot become current through rewind, compaction, or reopening. Interactive completion cleanup uses the same clear operation while retaining the completed result snapshot for delivery.
- Serialize mutations and accounting checkpoints within the single owning process. Re-read current state and check session and generation before applying each mutation; a captured older goal must not overwrite newer counters or status. Late writes for another session or a replaced generation remain ineffective. Simultaneous writers to the same session from multiple processes are unsupported; different sessions remain independent.
- Advance the accounting baseline only after `pi.appendEntry()` returns successfully. Pi can accept an entry into memory before it creates the session file, so a successful append is subject to native persistence timing and is not a separate durability guarantee. Validate and encode the complete record before appending, including when no conversation message has yet been saved.
- Follow Pi's first-save behavior: custom entries in a fresh persistent session remain in memory until the first user or assistant message permits a file write. Exiting earlier can lose the goal. Do not manufacture conversation messages or add a second store to force an earlier save. Goals continue to require a persistent session; ephemeral sessions remain unsupported.

### Storage failure and recovery

- A storage read or append failure must remain visible through Pi's ordinary error delivery and available user notification. Do not report failure as a missing goal or claim that the requested status was saved. Ordinary domain-validation rejections do not constitute a storage failure.
- Cancel owned pending continuations and prevent new automatic goal pursuit for the failed live session manager. Preserve the check at continuation admission, including after asynchronous settlement. Pi may already have appended the failed record to its in-memory history; no rollback or recovery of unsaved usage is promised.
- Retain only the failure flag across retaining extension reload, using the repository's established process-memory pattern keyed to the public session manager identity. The flag holds no second durable goal state and modifies no host methods or private fields. A newly loaded extension must not clear this flag merely because it can read the failed in-memory entry.
- Recovery requires a fresh native load of the saved session. Reopening gets a new session manager and restores only the records Pi supplies from disk. Extension reload alone retains the existing manager and is not recovery. Unsaved progress can be lost; elapsed downtime must not be charged or reconstructed from wall-clock time.
- Do not retry accounting against a failed in-memory snapshot and charge the same pending delta again. Keep the failure stop effective for that manager even if another operation appears to succeed. Preserve native Stop's interruption path when a pause or cleanup write fails, and make failure notifications describe reopening rather than promise that retrying an unchanged command repairs storage.

### Goal transitions

| Operation or event                                      | Required outcome                                                                                                                                                                                                                  |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create with no goal or a completed goal                 | New generation, zero counters, fresh creation time, active unless an applicable limit prevents activation.                                                                                                                        |
| Create with another unfinished status                   | Reject without replacing the goal.                                                                                                                                                                                                |
| Edit objective                                          | Preserve generation, creation time, budget, and usage. The ordinary user edit control also requests activation.                                                                                                                   |
| Explicit pause                                          | Checkpoint eligible progress and stop future pursuit; do not require interrupting an already running turn.                                                                                                                        |
| Explicit resume                                         | Request activation without resetting usage. Reset the semantic blocked audit. An already exhausted budget prevents activation.                                                                                                    |
| Complete                                                | Preserve final available counters and return the completed snapshot. Actual completion can supersede a budget-limited state.                                                                                                      |
| Budget exhaustion                                       | Set `budgetLimited` at the applicable checkpoint and preserve eligible in-flight accounting. A qualifying tool-finish checkpoint can inject a budget notice once per generation; other checkpoints do not guarantee that message. |
| Pause or block after budget exhaustion                  | Preserve `budgetLimited`.                                                                                                                                                                                                         |
| Provider usage limit                                    | Stop the applicable current goal as `usageLimited`, including the observed precedence over an in-flight budget-limited state.                                                                                                     |
| Clear                                                   | Remove current goal state, clear its active accounting, and invalidate pending continuation. Preserve conversation history.                                                                                                       |
| Stale mutation or checkpoint bound to an old generation | Leave the replacement goal unchanged.                                                                                                                                                                                             |

Backend state and presentation cleanup are distinct. A headless runtime retains a completed goal until explicitly cleared or replaced. Interactive presentation retains the completed snapshot for its completion display and applies the observed clear-after-completion behavior. The successful completion result retains its own snapshot even when presentation cleanup removes the current goal before that result reaches the model; there is no result-delivery-before-clear guarantee. A failed cleanup append reports its own storage error and inhibits future automatic pursuit without changing the completed result already obtained.

### Integration and cutover

- Keep the existing boundaries between goal state, accounting, orchestration, and Stop. Change the state module and its callers to use the owning native session; remove the old global database lifecycle. Preserve the public goal tools, controls, messages, and successful result values.
- Restore through the existing session-start lifecycle and checkpoint at the existing mutation, settlement, and shutdown boundaries. Session changes and teardown still invalidate owned callbacks. A retaining reload preserves healthy state and the separate failure stop; a fresh reopen applies native saved-state recovery. Do not add polling or new checkpoint frequencies merely because entries are append-only.
- Reuse the existing tests, shared native-host fixture, and capture workflow. Adapt database-specific setup and fault injection to native session storage while retaining external assertions. No companion package changes, broad dependency upgrades, or new storage abstraction are required for the migration.
- Validate the candidate before switching the editable installation. Recheck the old store immediately before cutover: the inspected installation had zero goal rows, so no importer is needed for that observed state. If goals have appeared, preserve them and resolve migration before activation; never infer that the earlier zero-row observation still holds.
- Remove active SQLite usage after acceptance. Do not dual-write, maintain a permanent legacy reader, or silently delete the old store. Update the existing specification and affected implementation tickets, with earlier verification retained as historical evidence rather than migration acceptance.

### Accounting and limits

- Charge uncached input plus output. In Pi's normalized usage this is input plus cache-write tokens plus output; exclude cache-read tokens, and do not add reasoning tokens again when they are already included in output. Retain original provider usage in test evidence to verify the mapping.
- Establish the usage baseline when a goal becomes active. Creation partway through a turn must not charge earlier reported work. A replacement establishes a fresh baseline and excludes descendant usage already reported at activation. Descendant reports enter a shared counter without an originating goal generation: a child started earlier can report later and contribute to the current active goal. Reject stale goal-bound checkpoint writes without discarding those newly arriving reports.
- Count each reported delegated contribution once. Observe each final tool's own usage through its public execution-end event, including nested calls. Pi subsequently adds descendant usage to the root result message; do not charge that aggregate again. This provides accounting for reported usage, not a universal guarantee for subprocesses, custom providers, or tools that omit usage. Preserve known descendant attribution and verify its reporting time before claiming parity for delegated scenarios. Opaque programmatic model calls expose their combined usage only at the outer result, so finer internal cutoffs remain unavailable.
- Receiving provider usage updates pending accounting; it does not by itself flush usage to storage. Record the observed tool-completion, turn-stop, and external-mutation checkpoints through native custom entries. A read exposes the last accepted checkpoint under Pi's persistence guarantees; its tool-finish hook can subsequently account more usage. `update_goal` performs its own checkpoint and is excluded from the generic tool-finish checkpoint. Known usage at a pause or completion boundary is final for that returned snapshot; unavailable later provider reports must not be guessed or silently charged after the goal's accounting has been cleared.
- Include publicly reported local compaction usage for the eligible goal. A completed standalone manual compaction checkpoints its reported usage; compaction inside an outer run leaves usage pending until that run's applicable checkpoints. Pi supplies a combined successful-summary report, so partial, aborted, or internal multi-request cutoffs remain unavailable at that boundary. Do not estimate missing reports or claim that every provider's remote compaction route uses the same accounting path.
- A budget is soft. A request or already admitted turn can exceed the remaining allowance. Budget exhaustion prevents new substantive goal work and new continuations; it does not imply hard token truncation or immediate cancellation of every in-flight operation. Continue accounting the eligible in-flight work until its stop boundary.
- Use nonnegative deltas, exact integer arithmetic, and one committed accounting baseline. Concurrent tool completions must not charge the same model usage twice. No estimated tokens, duplicate child charges, fabricated refunds, or implicit budget resets.
- Measure elapsed pursuit with a monotonic live-runtime clock, accumulating integer seconds at checkpoints without repeatedly losing fractional remainder. Active waiting can consume time. Paused and unloaded periods do not accrue live pursuit time. Raw backend interruption leaves an active goal's clock live: an idle read does not flush it, but a later external mutation can record that elapsed time. Reopening a saved goal does not charge process downtime. Wall-clock timestamps remain Unix seconds.
- A configured host maximum may cap or supply the allowance according to the source contract. Do not invent a default allowance or new configuration setting merely to emulate a deployment policy that this host does not supply.

Recorded status and live accounting are separate. A model `update_goal` clears its current-turn accounting after obtaining the effective result, even when a requested pause returns `budgetLimited`. External mutation preparation clears exhausted accounting only when it has nonzero token or whole-second progress to checkpoint; an empty snapshot does not clear it. During an existing turn, the resulting `budgetLimited` status alone does not clear the remaining ledger. Preserve these cutoffs instead of deriving accounting eligibility solely from stored status. A failed checkpoint must not advance the accounting baseline; the storage-failure stop prevents an automatic retry from adding that same delta to an unconfirmed in-memory snapshot.

### Continuation and execution lifetime

Use a fresh outer session run for an automatic goal continuation. Pi supports requesting this through `sendMessage` with `triggerTurn` from `agent_settled`; an `agent_before_settle` continuation remains inside the existing outer run and is not an interchangeable boundary.

Keep only the minimum pending continuation state needed to coordinate the current goal and session. Recheck generation, active status, runtime ownership, shutdown state, the storage-failure flag, accepted user work, and applicable limits at admission. Serialize user goal mutations with continuation admission. Do not reorder native queue internals or claim that a copied pending-message preview is the queue itself.

The reference dispatches already queued backend user work before goal idle work when that dispatch starts a turn. This does not establish a universal priority guarantee for every frontend draft, local queue, or input arriving after the idle check. Reproduce the observed admission cutoff and compare race scenarios explicitly rather than promising a stronger ordering rule.

While the extension remains loaded, a pending continuation command can recheck the current recorded goal and storage-failure flag when its handler runs. Pending commands for paused, cleared, replaced, or otherwise ineligible goals, or for a session with a storage failure, must exit without model work; physical removal of the queued command is unnecessary. Prove this with direct runtime tests for deferred pause and clear during asynchronous settlement, accepted user work, replacement, and storage failure. `isIdle`, `hasPendingMessages`, and `waitForIdle` alone do not establish that guarantee.

Removing the extension is a separate boundary: its command handler disappears while Pi may retain a pending command. The tested public API offers no cancellation handle for that retained command. Record and test this unload limitation separately; it is not evidence that pause or clear fails while the extension remains loaded. Stop owned scheduling and invalidate owned callbacks on teardown, but do not claim withdrawal of work already retained by the host without runtime evidence. No private adapter or host patch is authorized by this limitation.

Execution belongs to the live loaded runtime. Merely hiding its view does not stop work. Actual runtime unload stops execution and accounting without automatically changing a recorded active goal to paused. Restoring that individual active session may resume eligible pursuit only when the owning manager has no storage-failure flag; do not scan every saved session and start work globally. Preserve the host's terminal, RPC, and one-shot disposal rules. Do not create a daemon, process keep-alive loop, recurring automation, or background executor to extend them.

Compaction and history rewind retain the current recorded goal and already consumed usage. Replacing conversation history must not reset counters or replay an older objective into current state. Successful manual compaction can admit eligible continuation after the host becomes idle, including a goal activated during compaction and an already active goal. Pausing, clearing, replacement, storage failure, native Stop, or runtime teardown must invalidate a pending admission. Aborted compaction does not authorize a restart.

Fork inheritance is conditional in the observed contract: it requires explicit continuation deferral, an enabled goal capability, and a persisted target. A generic fork does not imply inheritance, and an ephemeral target cannot request this mode. Flush known source accounting at the fork cutoff, then copy the objective, status, budget, counters, both timestamps, and the same private generation identity, changing only the owning session identity. Subsequent mutations remain isolated by session. Persist continuation deferral and clear it when the target starts its next turn with an available token baseline. Verify how the actual client requests this mode and how Pi's public fork lifecycle exposes the equivalent before implementing it; transcript inheritance alone is insufficient.

Goal records share the owning session file's lifecycle. Native deletion of that saved file removes its saved goal records without leaving an external row to clean up; this does not establish a notification that stops a separately loaded runtime. Clear appends an empty current-state record and clears runtime accounting while preserving conversation history. Conditional continuation deferral remains subject to the public-capability gate above.

### Agent-facing goal context

The inspected goal extension does not add a separate permanent goal system or developer prompt. Its runtime messages are hidden internal context carried in a user-role message, with source `goal` and kind `goal.internal_context`. Preserve that role and provenance, using a neutral wrapper and keeping it distinct from a fresh human request in the interface and authorization logic. Do not promote objective text to a higher instruction priority.

| Message                             | Contents and behavior                                                                                                                                                                                                                                                                                                                                |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Automatic continuation              | Current objective, recorded usage, optional allowance, remaining tokens, persistence of scope, evidence-based progress and completion audits, verified-wait guidance, and the three-turn blocked audit. Host admission establishes the new goal-triggered turn; rejected admission creates no model input or automatic-turn identity.                |
| Objective update during active work | A changed objective in the same generation, with resulting active status, supersedes the previous objective and redirects ongoing work. Retain usage, budget, and remainder. A newly created or replacement goal is not an edit. If no turn is active, discard the edit injection and use ordinary continuation admission with the latest objective. |
| Budget exhaustion                   | A qualifying tool-finish checkpoint can supply objective, recorded elapsed time and tokens, allowance, and instructions to wrap up without starting more substantive work. It does not itself cancel the turn. Other exhaustion checkpoints do not guarantee this message.                                                                           |
| Successful completion result        | Effective completed state and, when applicable, an instruction to report its returned usage.                                                                                                                                                                                                                                                         |

Escape `&`, `<`, and `>` in that order within objective data. Continuation and budget notices use an `objective` delimiter; edits use `untrusted_objective`. An absent allowance renders as `none`; absent remaining tokens render as `unbounded` in continuation and `unknown` in an edit. Preserve message boundaries and template trailing newlines. Budget guidance uses `budget_limited` in prose while the serialized status remains `budgetLimited`. Edit guidance permits a completion call or an explicitly requested pause without repeating continuation's blocked allowance.

An agent-created goal initially supplies its ordinary tool result. An externally activated idle goal can start through continuation admission. Do not fabricate dedicated pause, blocked, or usage-limit messages: the observed runtime has no such templates.

Include plan-management guidance only when the corresponding capability is available. Retain the current evidence requirements for completion and the meaning of progress, a verified wait, and no progress. These completion and blocker audits are model instructions, not runtime proofs of achievement or an impasse. A polling timeout alone does not establish that an external process ended.

Preserve message timing, order, visibility, and history persistence across subsequent requests and compaction. Previously injected context is subject to ordinary history replacement; there is no goal-specific reinjection after every compaction. User-origin goal edits arriving after the compaction snapshot must retain the observed preservation behavior. Do not inject repeated reminders into every request or remove context merely because it is hidden from ordinary chat display.

Explicit user-origin control context is a separate conditional path. In the inspected backend, objective or status requests carrying `origin: user` can record user-role context with source `user_goal` and kind `user.goal` or `user.goal.omitted`; budget-only changes do not. This path JSON-escapes the objective and omits the whole objective when its evidence exceeds the observed 700-byte threshold. A provenance-bearing clear can record authorization even without an existing goal. The inspected desktop control calls omit the origin field, and its initial visible goal entry is locally synthesized. Actual-client captures must settle that behavior before reproducing any authorization message; backend capability or a visible transcript entry alone is insufficient evidence.

### User controls and extension compatibility

Provide one native `/goal` control surface with inspection, objective creation/editing, pause, resume, and clear, plus equivalent explicit command actions usable without an interactive picker. Use the observed action availability: pause while active; resume for paused, blocked, and usage-limited states; no ordinary pause/resume action for complete or budget-limited states. Ordinary objective controls do not invent a budget input or silently raise an exhausted allowance.

Use native widgets or status facilities without replacing the footer or taking over the chat view. Preserve themes, configured bindings, overlays, autocomplete, attachments, skill expansion, and the current editor. Do not require companion packages for basic operation.

For the actual terminal Stop action, attempt an active-goal pause with the observed 500 ms bound, then invoke native interruption even if pausing fails. Native interruption uses the current host state after the pause attempt; do not add an original-turn fence to this path. Raw backend abort is not itself an explicit user pause. A public editor composition is a candidate for observing native Stop after dispatch has resolved autocomplete and shortcut handling; it must preserve the single active editor and be verified with `pi-composer`, `pi-attachments`, and `pi-chat` in both load orders. Raw key observation alone is insufficient. Do not claim compatibility with arbitrary replacement editors without evidence.

Reload and teardown must invalidate extension-owned pending work and remove only extension-owned observers and presentation. A later extension's replacement remains its own. Commands already retained by Pi are subject to the separately recorded unload limitation. Initialization and cleanup failure must leave an actionable error, not silently partial goal control.

### Runtime stop conditions

Distinguish the model's semantic blocked audit from runtime safeguards. Three consecutive automatic empty finals with no qualifying activity can block a goal. A final is empty when its text is blank and its phase is final or absent; a missing final alone does not count. Nonblank agent text in any phase, nonblank reasoning summaries, a present questions field even when empty, other completed turn items, and every delivered tool outcome count as activity. Raw reasoning and token counts alone do not. Activity and the empty-final flag remain latched within a turn. Hidden continuation context must not count as a human turn item.

Automatic identity belongs to an admitted run. Ordinary user turns, activity, abort, clearing active accounting, and external mutation preparation reset the empty sequence; preparation resets it even if persistence later fails. External edits or activation invalidate automatic identity even when the goal generation is unchanged. Runtime reconstruction starts with fresh guard counters. Resolve the goal from the turn's current accounting binding, which can change during that run, then fence the persisted stop by session and generation. Do not substitute immutable admission-time ownership for that binding.

Three qualifying orchestration execution-failure turns can also block a goal when no successful tool resets that sequence. The observed predicate is an executed handler failure of the default-namespace `exec` tool. Any successfully completed tool resets the sequence; a turn with no qualifying failure does not necessarily reset it. A completed tool with an unsuccessful result, validation rejection before execution, permission denial, or interruption does not qualify. Verify the equivalent host outcome and orchestration identity rather than treating every tool error alike. Terminal turn errors can block immediately after native retries are exhausted; confirmed provider usage limits produce `usageLimited`. Do not classify failures by unverified message-text heuristics.

Apply these effects only to the relevant current goal generation and accounting turn. Do not let stale errors stop a replacement goal. Planning-only and specialized child-session modes require explicit host support and source-backed classification; do not invent such modes or infer them from prompt wording.

## Testing Decisions

### Primary test boundary

The approved primary seam is a real Pi session with the extension loaded. Reuse the repository's native-host fixture, real session runtime, extension loader, provider parsing, and tool execution. Script model responses and time at the highest practical boundary. Extend that fixture only where a required observable cannot already be driven. Avoid a second fake agent loop or tests that merely repeat internal implementation branches.

Assert the actual next provider request, model-visible tool result, persisted goal, and lifecycle events. The fixture's current `settled()` convenience check observes streaming state; it does not prove that every continuation and deferred action has finished. Use expected run boundaries and request counts for goal scenarios.

Test each implemented slice through this seam. Add lower-level cases only where required input precision, clock control, storage failure, or concurrency cannot be exercised clearly at that boundary. Runtime integration evidence must use the selected Pi version; existing tests on a different workspace version are secondary compatibility evidence.

### Native storage migration coverage

The previously approved real-session seam remains the primary boundary; no new production test seam is proposed. Adapt the seven existing suites that use SQLite fixtures or probes: creation and inspection, lifecycle, accounting, accounting boundaries, progress guards, preservation, and Stop. Retain the other goal suites as regression coverage. Test observable state, requests, results, and recovery rather than SQL statements, private maps, or internal entry counts.

- Create and mutate goals through native tools and controls, reopen the saved session, and verify all six statuses, ownership, generation, exact large integers, objective text, and returned result values. Verify the first-message save separately from a session that already has conversation history.
- Exercise clear, replacement, and completion cleanup through their existing interfaces. Rewind, compact, reload, and reopen afterward; the latest current state must remain authoritative and a cleared goal must stay absent. Preserve the completed tool result even when presentation cleanup follows it.
- Verify ordinary forks and clones start without a goal despite copied source entries, new target goals have independent ownership, and switching between healthy sessions preserves their separate usage. Keep conditional inheritance behind its existing capability gate.
- Exercise serialized same-process mutations and late callbacks so counters are not overwritten or double charged and replacement generations remain protected. A failure in one live session manager must not disable an independent session.
- In an otherwise empty persistent session, show that a goal can be available in memory before any session file exists, that the first user or assistant message can save its state, and that exiting before that boundary provides no durability guarantee. Retain the existing rejection of ephemeral sessions; do not force a save with synthetic conversation content.
- Induce a native storage failure at the existing fixture's storage boundary. Observe the surfaced error, pending-continuation cancellation, no further automatic model requests, unchanged accounting baselines after a failed checkpoint, and native Stop interruption despite a failed pause write. Verify the same failed manager remains stopped after retaining reload, while fresh saved-session reopening recovers only the state Pi supplies.
- Supply malformed recognized goal records through the existing native fixture and verify an error rather than null or an older goal. Do not assert detection of malformed file lines that Pi itself omits when loading. Validate JSON-compatible snapshot values before first-message persistence can expose a delayed serialization error.
- Verify that custom storage entries never enter the provider conversation. Compare the affected tool declarations, results, continuation context, edits, budget messages, and final usage reporting through the existing capture workflow; goal values and agent behavior must remain unchanged except for the explicitly accepted storage limits.

### Released runtime validation

The former source checkout is unavailable and ordinary workspace imports currently resolve Pi 1.0.2. Primary verification must use the installed released Pi 1.1.0 with the supported Node baseline. Use a temporary Node module-resolution preload for test execution to resolve the public Pi and terminal-UI package imports consistently to that release; Pi's own extension loader continues to load the package through its normal public lifecycle. This does not require changes to companion manifests or the shared native-host fixture.

Verify actual package versions and resolutions in the test process, workers, and companion module-resolution paths before accepting results. Keep the release's internal imports intact and the temporary resolver out of the production extension. Run the relevant goal and companion integration checks, then scoped formatting, lint, and type checks. A test pass against the workspace's older runtime is secondary evidence and cannot satisfy migration acceptance.

### Scenario coverage

| Scenario family                  | Required observations                                                                                                                                                                                                           |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No goal and explicit creation    | No unsolicited goal; stable read shape; trimmed objective; one goal; absent/complete replacement; no replacement of unfinished states; persistent-session requirements.                                                         |
| Native arguments and goal values | Native validation and errors; null/absent budget; Unicode scalar length; positive/zero/negative/fractional/overflow values; safe numeric and exact decimal-string budgets; direct and nested value preservation.                |
| User controls                    | Create, edit, pause, resume, clear, completion display and cleanup; headless completed-state retention; budget-limit precedence; known usage in returned snapshots.                                                             |
| Continuation                     | Fresh run boundaries; one continuation; accepted user work; asynchronous settlement; deferred pause/clear and replacement while loaded; request failure; separate extension-removal behavior.                                   |
| Accounting                       | Cache reads/writes, reasoning, pre-creation baseline, known descendants, nested aggregation, concurrent completions, repeated events, remaining-token clamp, soft overshoot, failed persistence, and late usage after stopping. |
| Time                             | Fractional accumulation, live waits, pause/resume, host shutdown/reopen, no downtime charge, and monotonic timing independent of displayed timestamps.                                                                          |
| Progress and failures            | Three empty automatic attempts; activity resets; qualifying execution failures; successful-tool reset; semantic blocked audits and resume; retry exhaustion; usage limits; stale-turn errors.                                   |
| History and lifetime             | Compaction, rewind, fork cutoff and inheritance, active restoration, inactive status restoration, hidden versus unloaded runtime, session switch, reload, terminal/RPC/one-shot disposal.                                       |
| Native terminal interaction      | Default and remapped Stop; autocomplete Escape; retry and compaction controls; overlays; companion editor and chat composition in both load orders; cleanup and late callbacks.                                                 |
| Agent context                    | Tool advertising, roles, provenance, content placement, continuation/update/limit context, objective escaping, history replay, duplicate suppression, and final usage guidance.                                                 |

### Phoenix comparison

Phoenix comparison is an acceptance requirement, not optional diagnostics. Use the existing local collector where practical. Capture actual reference-client goal scenarios and the corresponding `pi-goal` scenarios, with a stable scenario identifier and explicit source kind. The existing general comparison collection demonstrates that capture is available; it is not proof of goal behavior.

For the storage revision, compare new captures of affected scenarios with the existing behavior and agent-interface evidence. In particular, verify that native state entries add no model-facing messages and preserve tool values, continuation context, and accounting under the unchanged rules. A before-and-after storage regression does not establish previously missing actual-client provenance or close the separate capability gates below. Label the accepted persistence differences explicitly.

Keep three evidence layers identifiable:

1. **Host context:** the complete effective conversation, instruction sections, and tool declarations after extension transformations. This precedes provider conversion and is not proof of final message roles.
2. **Provider exchange:** final constructed requests, parsed response-stream events before normalization, tool-call argument strings where available, final messages, and original provider usage. Capture Pi through public context, request, and stream-event hooks. In controlled runs, place the request observer last and verify against what the endpoint actually receives.
3. **Transport and gateway:** received request bodies and response stream data at the relevant endpoint, including gateway changes and repeated transport attempts. A parsed payload is not a byte-for-byte capture. When raw bytes are needed, retain them through the test endpoint or existing capture transport without patching Pi.

For every case, record runtime versions, scenario and session identities, outer run and request ordinals, tool-call and parent-call identities, capture layer, actual-client versus replay origin, effective generation settings, emitted goal context, returned values, status transitions, provider usage, normalized usage, and goal accounting. Give concurrent or background requests reliable correlation; request-hook ordinals alone are insufficient when cache warming, retries, or independently invoked providers share the route.

Compare these agent-interface dimensions:

- Message roles, channels where supplied, order, delimiters, objective data, internal versus human provenance, and when context first appears or is repeated.
- Goal tool names, availability, policy descriptions, domain constraints, and direct versus native programmatic exposure. Record Pi-owned validation and advertising conventions as intentional interface differences.
- Goal values, null versus omitted fields, call/result correspondence, lossless integer conversion, programmatic results, and subsequent history. Record native result/error formatting without treating it as a behavioral compatibility failure.
- Continuation, edited-objective, budget-limit, pause/resume, blocked, and completion exchanges; idle admission, compaction, reload, and stale-event cases.
- Reasoning and final-output handling where observable, opaque continuation data without claiming it can be decoded, response-item ordering, stream versus terminal-response differences, and replayed history.
- Original usage, cache treatment, goal-derived counters, checkpoint timing, and the distinction between observed usage and unreported work.

Use the same scenario prompt, initial goal and repository state, model, supported reasoning settings, sampling settings, limits, and provider route when comparing behavior. Record both actual configured defaults and a controlled comparison where alignment is possible. Preserve omitted settings as omitted; do not silently replace them with assumed defaults. Record unsupported controls and unrelated instruction/tool differences as comparison limits.

Keep live desktop observations, bundled-runtime checks, deterministic scripted runs, and payload replays labeled separately. A replay cannot establish desktop control behavior. Neutral wording, dynamic identities, and Pi-owned validation/result/error conventions may differ by explicit contract. Classify those separately from lost goal values or differences in authority, ordering, accounting, or state. Never normalize away a meaningful goal discrepancy to obtain a passing comparison. Identical natural-language answers or reasoning are not the compatibility criterion.

Retrieve Phoenix records after ingestion and verify complete capture using canonical payload hashes or byte hashes appropriate to the evidence layer. Detect truncation, missing stream events, absent usage, and unsupported provider hooks. Check both request and response records. Do not collect credential values; keep authorization headers out of saved evidence. New fixture content and trace labels use neutral terminology, and required documents link to neutral trace identifiers rather than copying branded reference material.

The final matrix covers create, inspect, continue, edit, pause, resume, clear, complete, block, budget exhaustion, usage exhaustion, and relevant lifecycle transitions. Collect actual-client evidence for the ordinary goal controls and work cycle. Use controlled responses and bundled-runtime checks for failure and quota conditions that cannot responsibly be forced through a live provider, with their evidence layer explicit. Every unperformed scenario remains visibly pending, with the reason and its effect on the compatibility claim.

### Native storage acceptance

- Demonstrate the native storage scenarios above on released Pi 1.1.0, including failure across retaining reload and fresh-file recovery. Source inspection alone does not prove those behaviors.
- Confirm production goal storage uses public custom entries and has no active SQLite import, database initialization, database path, database close operation, or parallel persistent fallback. No package dependency is added for storage.
- Preserve the approved tool contracts, goal rules, exact values, and Stop behavior, and verify the affected agent interface through retrieved capture evidence. Record native persistence differences as accepted boundaries rather than claim unchanged database guarantees.
- Recheck the old database before activating the editable installation. An unexpected remaining goal prevents cutover until its migration is resolved; a prior zero-row observation is insufficient.
- Run relevant existing behavior and integration checks plus formatting, lint, and type checks. Record current results separately from the historical verification below.

### Existing feature acceptance gates

These broader gates remain in force for claims about the complete goal feature. The storage revision does not implement or claim completion of previously unavailable capabilities.

- Demonstrate suppression of a not-yet-admitted continuation after pause, clear, and replacement while the extension remains loaded. Verify extension removal separately and retain its unsupported host-queue boundary explicitly; no physical queue removal or private adapter is required for the loaded-extension cases.
- Demonstrate native Stop composition with configured editor behavior, including the 500 ms pause attempt and interruption despite pause failure.
- Establish native validation, native error propagation, and lossless goal values through the real provider and orchestration paths. Do not recreate foreign parser or error semantics.
- Establish delegated accounting attribution and timing for the reported-usage paths being claimed. Optional tool usage cannot establish universal child-session coverage.
- Establish fork snapshot and continuation-deferral semantics before shipping fork support. History-only approximations are insufficient.
- Run the relevant repository formatting, type, lint, and behavior checks for implemented changes. A terminal simulation does not replace the required actual-terminal acceptance.
- Complete the Phoenix scenario matrix and record material differences in the required spec or ticket. No exact-compatibility claim while a required observable remains unexplained or unverified.

## Out of Scope

- Modifying Pi source or installed host files; accepting a private runtime adapter without a demonstrated need and a separate decision.
- Retaining SQLite or adding another database, sidecar state file, dual writer, permanent legacy importer, configurable storage backend, or cross-process locking service for goals.
- Stronger-than-native first-save durability, transactional rollback, recovery of unsaved usage, or simultaneous writers to the same session from multiple processes. Broad companion dependency upgrades are not part of this storage revision.
- Building a new agent loop, replacing the normal composer or chat view, providing a daemon, scanning and starting all saved goals, or adding scheduled work.
- Additional goal tools, multiple simultaneous goals per session, automatic goal inference, invented default budgets, hard spending guarantees, or a time-budget feature.
- Universal accounting of unreported subprocess/model work, arbitrary provider internals, or unsupported editor and session-mode integrations.
- Copying the surrounding application's complete instruction stack, tools, branding, or hidden internals; guaranteeing identical stochastic model output.
- New research notes, duplicate plans, separate API contracts, comparison reports, or documentation beyond the required glossary, justified ADRs, specification, and approved tickets.
- Package publication or changes to the user's persistent tracing and provider settings. The working name is `pi-goal`; a publishable registry identity must be settled before any release.

## Further Notes

### Native session storage revision

The 2026-10-15 storage decision is accepted in [ADR 0025](../adr/0025-store-goals-in-native-session-entries.md). It preserves the goal behavior and native agent interface while replacing the independent SQLite store with session custom entries. The user explicitly accepted native first-save timing, one process managing each session's goal, and stopping automatic pursuit after storage failure with recovery limited to native saved state. The failure stop must survive retaining extension reload; a fresh reopen is the recovery boundary.

Read-only inspection of the current installation found zero goal rows in the old store. That observation supports an initial cutover without an importer, subject to a fresh check immediately before activation. The installed released host is Pi 1.1.0; the workspace's 1.0.2 dependency and the unavailable former source checkout must not determine primary migration validation.

This revision updates the specification only. The native storage implementation, its failure flag across reload, the temporary release-test resolver, and migration acceptance captures remain unimplemented or unverified. The approved real-session seam and existing capture workflow are retained. A subsequent ticket update must distinguish migration work from the earlier seven-ticket results instead of reusing their completion status as proof.

### Historical implementation evidence

The following evidence describes the earlier SQLite implementation and its known capability gaps. Its counts, captures, and ticket statuses do not establish acceptance of native session storage. The 2026-10-14 interface decision preserves goal behavior and exact values through Pi's native validation, result delivery, and errors. The approved public integration boundary remains in force; missing capabilities do not authorize private hooks, host patches, invented provenance, or changes beyond the accepted storage limits.

The behavior baseline was inspected on 2026-10-13: desktop version 26.1007.30912 (build 20156), engine 0.162.0-alpha.17.2, source revision `740e5af33c71225640e0c1c1555c514c2c93ab74`. The primary Pi runtime for those checks was 1.1.0 at `6fb2e7815167e6b19006fc526d1a5d0f5f998787`, with Node 24.13.1. The workspace dependency 1.0.2 was a secondary boundary check. Published 1.0.4 reproduced missing retry-cancellation metadata; the package requires `^1.1.0`. These versions identify historical evidence, not future compatibility or a published package release.

[Ticket 01](../../.scratch/pi-goal/issues/01-create-inspect-goals.md) completes creation and inspection with native schemas, errors, programmatic results, and lossless large values. [Ticket 02](../../.scratch/pi-goal/issues/02-manage-goal-lifecycle.md) implements controls and snapshot-safe completion cleanup; actual-client user-origin provenance remains open. [Ticket 03](../../.scratch/pi-goal/issues/03-continue-safely-honor-stop.md) verifies fresh automatic runs, current-goal context, accepted user work, loaded pause/clear/replacement, retaining reload, and native Stop. Deferred handlers recheck current state and discard ineligible work without editing the host queue.

The reproduced stale continuation concerns extension removal: Pi can retain a command after its handler disappears. It does not invalidate loaded pause and clear, which pass direct asynchronous-settlement tests. Stop uses public editor composition, a bounded pause attempt, and native interruption even after pause failure. Persisted tests, bounded production-module checks, and actual terminal processes verify its behavior. The 500 ms timer depends on event-loop scheduling; it is not a hard wall-clock guarantee.

[Ticket 04](../../.scratch/pi-goal/issues/04-account-usage-budgets.md) implements exact reported-usage accounting, monotonic active time, checkpoint-specific limits, and failure-safe persistence. Nine native accounting captures have 100 independently verified fields. Two matched budget replays add 18 fields and preserve the recorded prompts and response events. Public compaction usage is charged once, and final captures verify automatic continuation after successful manual compaction. Opaque programmatic calls and combined summary reports do not expose every internal cutoff; separately aborted child calls also lack immutable public qualification. No missing usage or configured host maximum is invented.

[Ticket 05](../../.scratch/pi-goal/issues/05-preserve-session-goals.md) verifies all six saved statuses, exact ownership and counters, downtime exclusion, compaction, rewind, clear, switching, retaining reload, and ordinary fork isolation. Its four final captures have 51 spans and 102 independently verified full fields. Conditional inheritance and durable continuation deferral lack an equivalent public request and actual-client identification. A reliable deletion notification is also unavailable, so automatic orphan cleanup remains unsupported.

[Ticket 06](../../.scratch/pi-goal/issues/06-stop-unproductive-runs.md) verifies the three-empty-attempt guard, fresh resume sequences, native retry recovery and exhaustion, and structured quota attribution with a response-identity join. Five final captures have 32 spans and 64 independently verified fields; 14 reference response bodies replay byte-for-byte. A background quota with a different identity cannot stop an unrelated foreground run as usage-limited. Immutable executed-handler failures, structured questions, opaque summaries, specialized modes, and quota transports that discard structured identity remain explicit gaps.

[Ticket 07](../../.scratch/pi-goal/issues/07-phoenix-terminal-acceptance.md) holds the complete scenario matrix. Twenty final print, JSON, RPC, and terminal process phases produce 69 spans with 138 independently verified full fields, 49 exact request bodies, and 20 exact process outputs. The terminal cases exercise controls, Stop, retry and compaction cancellation, restoration, exit, switching, reload, path completion, and the four companions. Both provider protocols pass the RPC compaction case. Final captures use production revision `f89f03aecb18736432c1cc3f81e76390993b7106`; the subsequent reviewed test cleanup does not change those production bytes.

The earlier active RPC EOF checks demonstrated a host persistence limit. The actual native CLI without this package could disconnect before an unfinished assistant settled, while the earlier package could retain a goal's SQLite row without a session JSONL. Explicit abort followed by settlement before EOF preserved the assistant. The seven diagnostic cases and source verification remain separate from Phoenix acceptance; no host fix or synthetic history was added. Native session storage intentionally removes that independent row's survival guarantee and requires fresh verification under the accepted first-save behavior.

The earlier final goal suite passed 177 cases, and affected fixture/chat regressions passed another 120. The test-only review cleanup passed all 38 affected cases. Type checking, scoped lint, formatting, whitespace, and neutral terminology checks passed for that implementation. Standards review had no unresolved finding. Spec review found no new actionable implementation defect beyond the recorded partial requirements. Tickets 01 and 03 were complete within their stated boundary; the remaining tickets retained their unavailable capability or evidence gates. These results must not be reported as tests of this storage revision.

Read-only inspection of the [local capture collection](http://127.0.0.1:6006/projects/UHJvamVjdDoz) includes an existing desktop observation with tool definitions, parsed request data, and response events. It comes from an ongoing conversation and does not establish a matched fresh goal trial. Actual reference-client controls, origin-sensitive edits, fork identification, and Stop remain unverified because desktop access was declined. Scripted runtime observations, payload replays, and native PTY evidence remain labeled separately. No exact-compatibility claim or package publication is made.
