# pi-goal specification

**Status:** in-progress

## Problem Statement

A Pi user needs to authorize an outcome once, let the agent pursue it across successive work attempts, and retain explicit control over stopping and resuming that work. The goal must survive conversation compaction and session restoration, report trustworthy usage, and stop for the right reason. An ordinary request must never silently become an autonomous goal.

The package must preserve the goal rules for authorization, lifecycle, persistence, budgets, accounting, and Stop through the extension ecosystem. Pi owns tool validation, result delivery, and error handling. Goal values must survive any conversion without rounding or loss. Pi's source and installed host files must remain untouched.

## Solution

Build `pi-goal` as an independently installable extension. Provide the three model tools `get_goal`, `create_goal`, and `update_goal`, durable state for one current goal per session, automatic continuation while eligible, and native user controls for inspecting and managing the goal.

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
34. As a Pi user, I want old events unable to change a replacement goal, so that late work cannot corrupt the new objective's status or counters.
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

## Implementation Decisions

### Package and ownership

- Keep `pi-goal` independent of companion packages. They are compatibility targets, not required runtime dependencies. Use the repository's TypeScript extension packaging, public Pi services, native UI components, and standard library facilities.
- Target the inspected Pi 1.1.0 runtime. The workspace currently resolves Pi 1.0.2; verify the chosen runtime explicitly instead of assuming the workspace dependency is the installed application. Set the supported peer range from demonstrated capabilities and behavior. Do not inherit another package's private-integration exception.
- Keep a small internal boundary between durable goal state and accounting, session orchestration and model tools, and native user presentation. Do not create a public adapter framework, scheduler service, or provider-integration platform.
- Preserve current effective tools, message processing, provider configuration, permissions, editor ownership, keybindings, and rendering. Capture observers and goal transformations must compose with other extensions rather than reset their state.
- Use neutral Pi terminology in all authored names, descriptions, prompts, source, fixtures, documentation, trace labels, and release material. Do not reproduce branded reference names or URLs. Independently authored wording remains subject to semantic and message-placement comparison.

### Model tools

Register all three tools through Pi's native extension API with object parameters. Let Pi validate their schemas, apply its ordinary coercions, advertise them to the provider, deliver results, and propagate failures. Use its native structured-result facility for programmatic consumers. Do not intercept raw argument streams, rewrite provider requests or history, emulate a foreign decoder, or wrap native orchestration to reproduce a different error type.

| Tool          | Advertised inputs                                                              | Behavior                                                                                                                                      |
| ------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `get_goal`    | No properties; no required fields                                              | Return the stored current goal or an explicit null goal. Reading does not itself flush current usage.                                         |
| `create_goal` | Required string `objective`; optional integer or decimal-string `token_budget` | Create an active goal only when none exists or the previous goal is complete. Reset accounting and creation time for the new goal generation. |
| `update_goal` | Required string `status`, with values `complete`, `blocked`, or `paused`       | Account the eligible known progress and request the specified status. Return the effective persisted status, including limit precedence.      |

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

Goal state mutations are serialized. Preserve the reference's serial execution behavior for goal operations without globally changing unrelated tools' concurrency. Tool-name collisions and effective tool overrides must be detected or explicitly bounded by demonstrated host capabilities.

### Durable state and transitions

Use one extension-owned durable store keyed by Pi session identity, independent of the active transcript branch. Prefer the standard library's SQLite support on the repository's Node baseline for atomic partial updates and integer storage. Keep storage access internal; do not patch Pi's database or session files. Pair session ownership with a private generation identity so late accounting and status updates cannot affect a replacement goal or another session's inherited snapshot.

Persist the objective, effective status, optional budget, cumulative usage, and timestamps. Serialize state mutations and accounting checkpoints; commit usage baselines only after a successful write. Concurrent independent updates must not overwrite one another. Do not derive current goal state by replaying only the selected conversation branch.

| Operation or event                      | Required outcome                                                                                                                                                                                                                  |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create with no goal or a completed goal | New generation, zero counters, fresh creation time, active unless an applicable limit prevents activation.                                                                                                                        |
| Create with another unfinished status   | Reject without replacing the goal.                                                                                                                                                                                                |
| Edit objective                          | Preserve generation, creation time, budget, and usage. The ordinary user edit control also requests activation.                                                                                                                   |
| Explicit pause                          | Checkpoint eligible progress and stop future pursuit; do not require interrupting an already running turn.                                                                                                                        |
| Explicit resume                         | Request activation without resetting usage. Reset the semantic blocked audit. An already exhausted budget prevents activation.                                                                                                    |
| Complete                                | Preserve final available counters and return the completed snapshot. Actual completion can supersede a budget-limited state.                                                                                                      |
| Budget exhaustion                       | Set `budgetLimited` at the applicable checkpoint and preserve eligible in-flight accounting. A qualifying tool-finish checkpoint can inject a budget notice once per generation; other checkpoints do not guarantee that message. |
| Pause or block after budget exhaustion  | Preserve `budgetLimited`.                                                                                                                                                                                                         |
| Provider usage limit                    | Stop the applicable current goal as `usageLimited`, including the observed precedence over an in-flight budget-limited state.                                                                                                     |
| Clear                                   | Remove current goal state, clear its active accounting, and invalidate pending continuation. Preserve conversation history.                                                                                                       |
| Late event from an old generation       | Leave the replacement goal unchanged.                                                                                                                                                                                             |

Backend state and presentation cleanup are distinct. A headless runtime retains a completed goal until explicitly cleared or replaced. Interactive presentation retains the completed snapshot for its completion display and applies the observed clear-after-completion behavior. The successful completion result retains its own snapshot even when presentation cleanup removes the current goal before that result reaches the model; there is no result-delivery-before-clear guarantee.

### Accounting and limits

- Charge uncached input plus output. In Pi's normalized usage this is input plus cache-write tokens plus output; exclude cache-read tokens, and do not add reasoning tokens again when they are already included in output. Retain original provider usage in test evidence to verify the mapping.
- Establish the usage baseline when a goal becomes active. Creation partway through a turn must not charge earlier reported work. A replacement establishes a fresh baseline and excludes old descendant deltas.
- Count each reported delegated contribution once. Pi can aggregate nested tool usage onto a finalized top-level tool result; do not also charge nested events. This provides accounting for reported usage, not a universal guarantee for subprocesses, custom providers, or subagent tools that omit usage. Preserve known descendant attribution and verify its timing before claiming parity for delegated scenarios.
- Account at the observed token, tool-completion, turn-stop, and external-mutation boundaries. A read exposes the last stored checkpoint; its tool-finish hook can subsequently account more usage. `update_goal` performs its own checkpoint and is excluded from the generic tool-finish checkpoint. Known usage at a pause or completion boundary is final for that returned snapshot; unavailable later provider reports must not be guessed or silently charged after the goal's accounting has been cleared.
- A budget is soft. A request or already admitted turn can exceed the remaining allowance. Budget exhaustion prevents new substantive goal work and new continuations; it does not imply hard token truncation or immediate cancellation of every in-flight operation. Continue accounting the eligible in-flight work until its stop boundary.
- Use nonnegative deltas, exact integer arithmetic, and one committed accounting baseline. Concurrent tool completions must not charge the same model usage twice. No estimated tokens, duplicate child charges, fabricated refunds, or implicit budget resets.
- Measure elapsed pursuit with a monotonic live-runtime clock, accumulating integer seconds at checkpoints without repeatedly losing fractional remainder. Active waiting can consume time. Paused, stopped, and unloaded periods do not accrue live pursuit time. Reopening a saved goal does not charge process downtime. Wall-clock timestamps remain Unix seconds.
- A configured host maximum may cap or supply the allowance according to the source contract. Do not invent a default allowance or new configuration setting merely to emulate a deployment policy that this host does not supply.

### Continuation and execution lifetime

Use a fresh outer session run for an automatic goal continuation. Pi supports requesting this through `sendMessage` with `triggerTurn` from `agent_settled`; an `agent_before_settle` continuation remains inside the existing outer run and is not an interchangeable boundary.

Keep only the minimum pending continuation state needed to coordinate the current goal and session. Recheck generation, active status, runtime ownership, shutdown state, accepted user work, and applicable limits at admission. Serialize user goal mutations with continuation admission. Do not reorder native queue internals or claim that a copied pending-message preview is the queue itself.

The reference dispatches already queued backend user work before goal idle work when that dispatch starts a turn. This does not establish a universal priority guarantee for every frontend draft, local queue, or input arriving after the idle check. Reproduce the observed admission cutoff and compare race scenarios explicitly rather than promising a stronger ordering rule.

While the extension remains loaded, a pending continuation command can recheck the persisted goal when its handler runs. Paused, cleared, replaced, or otherwise ineligible goals must exit without model work; physical removal of the queued command is unnecessary. Prove this with direct runtime tests for deferred pause and clear during asynchronous settlement, accepted user work, and replacement. `isIdle`, `hasPendingMessages`, and `waitForIdle` alone do not establish that guarantee.

Removing the extension is a separate boundary: its command handler disappears while Pi may retain a pending command. The tested public API offers no cancellation handle for that retained command. Record and test this unload limitation separately; it is not evidence that pause or clear fails while the extension remains loaded. Stop owned scheduling and invalidate owned callbacks on teardown, but do not claim withdrawal of work already retained by the host without runtime evidence. No private adapter or host patch is authorized by this limitation.

Execution belongs to the live loaded runtime. Merely hiding its view does not stop work. Actual runtime unload stops execution and accounting without automatically changing a persisted active goal to paused. Restoring that individual active session may resume eligible pursuit; do not scan every saved session and start work globally. Preserve the host's terminal, RPC, and one-shot disposal rules. Do not create a daemon, process keep-alive loop, recurring automation, or background executor to extend them.

Compaction and history rewind retain the current durable goal and already consumed usage. Replacing conversation history must not reset counters or replay an older objective into current state.

Fork inheritance is conditional in the observed contract: it requires explicit continuation deferral, an enabled goal capability, and a persisted target. A generic fork does not imply inheritance, and an ephemeral target cannot request this mode. Flush known source accounting at the fork cutoff, then copy the objective, status, budget, counters, both timestamps, and the same private generation identity, changing only the owning session identity. Subsequent mutations remain isolated by session. Persist continuation deferral and clear it when the target starts its next turn with an available token baseline. Verify how the actual client requests this mode and how Pi's public fork lifecycle exposes the equivalent before implementing it; transcript inheritance alone is insufficient.

Session deletion removes its goal and continuation deferral where the host supplies a reliable deletion lifecycle. Clear removes those current records and runtime accounting while preserving conversation history.

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

For the actual terminal Stop action, attempt an active-goal pause with the observed 500 ms bound, then invoke native interruption even if pausing fails. Raw backend abort is not itself an explicit user pause. A public editor composition is a candidate for observing native Stop after dispatch has resolved autocomplete and shortcut handling; it must preserve the single active editor and be verified with `pi-composer`, `pi-attachments`, and `pi-chat` in both load orders. Raw key observation alone is insufficient. Do not claim compatibility with arbitrary replacement editors without evidence.

Reload and teardown must invalidate extension-owned pending work and remove only extension-owned observers and presentation. A later extension's replacement remains its own. Commands already retained by Pi are subject to the separately recorded unload limitation. Initialization and cleanup failure must leave an actionable error, not silently partial goal control.

### Runtime stop conditions

Distinguish the model's semantic blocked audit from runtime safeguards. Three consecutive automatic empty finals with no qualifying activity can block a goal. Count text, surfaced reasoning, questions, tools, and other qualifying activity according to the observed runtime definition. User-driven turns and substantive activity reset the relevant empty-continuation sequence.

Three qualifying orchestration execution-failure turns can also block a goal when no successful tool resets that sequence. The observed predicate is an executed handler failure of the default-namespace `exec` tool. Any successfully completed tool resets the sequence; a turn with no qualifying failure does not necessarily reset it. A completed tool with an unsuccessful result, validation rejection before execution, permission denial, or interruption does not qualify. Verify the equivalent host outcome and orchestration identity rather than treating every tool error alike. Terminal turn errors can block immediately after native retries are exhausted; confirmed provider usage limits produce `usageLimited`. Do not classify failures by unverified message-text heuristics.

Apply these effects only to the relevant current goal generation and accounting turn. Do not let stale errors stop a replacement goal. Planning-only and specialized child-session modes require explicit host support and source-backed classification; do not invent such modes or infer them from prompt wording.

## Testing Decisions

### Primary test boundary

The approved primary seam is a real Pi session with the extension loaded. Reuse the repository's native-host fixture, real session runtime, extension loader, provider parsing, and tool execution. Script model responses and time at the highest practical boundary. Extend that fixture only where a required observable cannot already be driven. Avoid a second fake agent loop or tests that merely repeat internal implementation branches.

Assert the actual next provider request, model-visible tool result, persisted goal, and lifecycle events. The fixture's current `settled()` convenience check observes streaming state; it does not prove that every continuation and deferred action has finished. Use expected run boundaries and request counts for goal scenarios.

Test each implemented slice through this seam. Add lower-level cases only where required input precision, clock control, storage failure, or concurrency cannot be exercised clearly at that boundary. Runtime integration evidence must use the selected Pi version; existing tests on a different workspace version are secondary compatibility evidence.

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

### Acceptance gates

- Demonstrate suppression of a not-yet-admitted continuation after pause, clear, and replacement while the extension remains loaded. Verify extension removal separately and retain its unsupported host-queue boundary explicitly; no physical queue removal or private adapter is required for the loaded-extension cases.
- Demonstrate native Stop composition with configured editor behavior, including the 500 ms pause attempt and interruption despite pause failure.
- Establish native validation, native error propagation, and lossless goal values through the real provider and orchestration paths. Do not recreate foreign parser or error semantics.
- Establish delegated accounting attribution and timing for the reported-usage paths being claimed. Optional tool usage cannot establish universal child-session coverage.
- Establish fork snapshot and continuation-deferral semantics before shipping fork support. History-only approximations are insufficient.
- Run the relevant repository formatting, type, lint, and behavior checks for implemented changes. A terminal simulation does not replace the required actual-terminal acceptance.
- Complete the Phoenix scenario matrix and record material differences in the required spec or ticket. No exact-compatibility claim while a required observable remains unexplained or unverified.

## Out of Scope

- Modifying Pi source or installed host files; accepting a private runtime adapter without a demonstrated need and a separate decision.
- Building a new agent loop, replacing the normal composer or chat view, providing a daemon, scanning and starting all saved goals, or adding scheduled work.
- Additional goal tools, multiple simultaneous goals per session, automatic goal inference, invented default budgets, hard spending guarantees, or a time-budget feature.
- Universal accounting of unreported subprocess/model work, arbitrary provider internals, or unsupported editor and session-mode integrations.
- Copying the surrounding application's complete instruction stack, tools, branding, or hidden internals; guaranteeing identical stochastic model output.
- New research notes, duplicate plans, separate API contracts, comparison reports, or documentation beyond the required glossary, justified ADRs, specification, and approved tickets.
- Package publication or changes to the user's persistent tracing and provider settings. The working name is `pi-goal`; a publishable registry identity must be settled before any release.

## Further Notes

The specification, real-session test boundary, Phoenix comparison, and seven-ticket delivery sequence are approved. The interface decision was revised on 2026-10-14: preserve goal behavior and values through Pi's native validation, result delivery, and errors. [Ticket 01](../../.scratch/pi-goal/issues/01-create-inspect-goals.md) must remove the obsolete decoder and transport emulation and verify lossless native values before closing. The approved order remains create and inspect, lifecycle controls, safe continuation and Stop, accounting and budgets, session preservation, runtime stop safeguards, and final acceptance. Session preservation and runtime stop safeguards both depend on accounting and may proceed independently; final acceptance depends on both.

The behavior baseline was inspected on 2026-10-13: desktop version 26.1007.30912 (build 20156), engine 0.162.0-alpha.17.2, source revision `740e5af33c71225640e0c1c1555c514c2c93ab74`. The Pi source baseline is 1.1.0 at `6fb2e7815167e6b19006fc526d1a5d0f5f998787`; the workspace dependency is 1.0.2. These identify evidence, not a promise that future releases retain the same behavior.

The test boundary was approved, with Phoenix agent-interface comparison added explicitly. Read-only inspection confirmed the [local capture collection](http://127.0.0.1:6006/projects/UHJvamVjdDoz) and an existing actual-desktop observation containing parsed request data and response events. That observation comes from an ongoing conversation and includes goal tool definitions; it is not a matched fresh goal trial or evidence of goal behavior. The create/read implementation now has real-session checks and retrieved Phoenix captures recorded in ticket 01. Public admission and Stop feasibility probes are recorded in [ticket 03](../../.scratch/pi-goal/issues/03-continue-safely-honor-stop.md). Full lifecycle implementation, actual-terminal acceptance, and the complete agent-interface comparison remain pending.

The native `Error` result observed in ticket 01 is now accepted host behavior, not an implementation blocker. Goal value loss remains prohibited. Ticket 03's reproduced stale request occurs when the extension itself is removed, leaving its queued command without a handler. This does not establish a failure of pause or clear while the handler remains loaded; those operations need their own direct runtime tests. The tested queued-command, timer, and idle-wait approaches do not withdraw host-retained commands after removal. Keep that lifecycle limitation explicit and separate from the loaded-extension acceptance. The Stop composition probe succeeds within its recording-terminal and controlled-pause scope.

[Ticket 07](../../.scratch/pi-goal/issues/07-phoenix-terminal-acceptance.md) records seven additional scripted reference-runtime scenarios: continuation, running edit, two exhaustion checkpoints, pause/resume/clear, resumed blocking, and empty automatic finals. Their 45 Phoenix spans were retrieved with 90 matching full-payload hashes. They establish runtime message and accounting boundaries, while actual desktop controls and the corresponding Pi scenarios remain distinct acceptance requirements.

Unperformed runtime scenarios and unsupported lifecycle behavior remain explicit evidence limits. They do not authorize losing goal values, changing goal rules, adding private hooks, or claiming that source inspection proves runtime behavior.
