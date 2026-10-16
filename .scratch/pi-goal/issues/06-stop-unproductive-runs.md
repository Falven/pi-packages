# 06: Stop unproductive runs

**What to build:** Stop goals for the correct runtime reason when continuations are empty, orchestration repeatedly fails, retries are exhausted, or provider usage is limited, while preserving explicit user control and accounting. Follow the approved [specification](../../../docs/specs/pi-goal.md).

**Blocked by:** 04: Account for usage and budgets.

**Status:** ready-for-agent — native session storage delta. Earlier unresolved feature gates remain open.

**Baseline status:** partial — supported public paths and captures verified; unavailable activity, execution, and provider classifications remain open.

## Native session storage delta

The accepted storage revision in the specification and ADR 0025 governs this delta. Each ticket retains its existing dependency edges; only these new criteria are being implemented in this revision.

- [ ] Adapt existing progress and failure-guard fixtures to native session storage, preserving supported empty-turn thresholds, resets, retry exhaustion, structured usage-limit precedence, ownership, and final accounting.
- [ ] Native custom state entries must not become model messages, human activity, or automatic-turn identity. Existing guard counters remain runtime-only and storage failures cannot launch another goal turn.
- [ ] Keep previously unavailable activity, execution, provider, and conditional-mode classifications visibly open. Do not broaden the migration into new runtime safeguards or private host integration.

## Historical acceptance

The checklist and evidence below describe the earlier implementation. They are not validation of native storage. Earlier database durability and atomic-write guarantees are superseded by the accepted native persistence limits; unchecked broader feature gates remain open.

- [x] Block a goal after the specified three consecutive automatic turns with an empty final and no qualifying activity. Record automatic-turn identity only after admission; a rejected or ordinary user turn is not an automatic empty attempt.
- [ ] Preserve the observed activity definition for text, reasoning summaries, questions, all delivered tool outcomes, and other completed turn items. A missing final is not an empty final; blank text needs a final or absent phase. Preserve latched activity and empty-final flags. Do not infer emptiness from visible chat rendering alone.
- [x] Reset automatic identity and the empty sequence at external mutation preparation, including a subsequent persistence failure, external activation/edit, abort, and clearing accounting. Ordinary user turns and activity reset the sequence. Reconstruct guard counters in memory rather than persisting them with the goal.
- [ ] Match the qualifying execution-failure predicate: an executed handler failure of the default-namespace `exec` orchestration tool. Verify the equivalent host outcome and active tool identity before counting it.
- [ ] Count three qualifying failure turns for the applicable goal when no successful tool resets the sequence. Any successfully completed tool resets it; a turn without a qualifying failure does not necessarily reset it.
- [ ] Exclude unsuccessful completed results, pre-handler validation failures, permission blocks, and aborted calls from that execution-failure count. Do not convert all tool errors into the same stop condition.
- [x] Keep the model's semantic blocked audit in the agent instructions: the same genuine impasse must recur for three consecutive goal turns, and explicit resume starts a fresh audit. Runtime empty/failure counters do not prove an impasse or authorize an early semantic block.
- [x] Preserve native retries. A terminal turn error can block the applicable goal after retry exhaustion; a confirmed provider usage limit produces `usageLimited`, including its specified precedence over an in-flight budget-limited state. Use verified host classification rather than guessed message substrings.
- [x] Resolve stop ownership from the current turn's accounting binding, then guard the persisted mutation by session and generation. Activation/replacement can rebind an ongoing turn; stale goal-bound writes cannot stop another generation. Do not infer planning or specialized child modes from prompt wording.
- [x] Stop future automatic continuation and expose the effective reason in stored state, model results, and native controls. Preserve eligible final accounting and the existing resume actions without fabricating separate goal pause, blocked, or usage-limit templates.
- [ ] Verify threshold boundaries, counter resets, nonqualifying outcomes, retry exhaustion, quota failures, budget precedence, explicit resume, and stale events through controlled responses in real Pi sessions. Do not deliberately exhaust a paid provider quota for a test.
- [x] Capture failure and recovery exchanges in Phoenix with explicit evidence origin. Scripted failure responses and bundled-runtime checks remain distinguishable from actual-client observations; retrieve captures and record any unsupported error or mode classification here.
- [x] Keep public extension integration, unchanged Pi files, neutral terminology, and relevant validation intact. Mark unsupported stop predicates or missing evidence as pending rather than broadening the behavior silently.

## Historical Public runtime classification evidence

Read-only review of the pinned accounting and runtime implementation establishes the empty guard independently of chat rendering. Nonblank agent text in any phase and nonblank reasoning summaries count as activity; raw reasoning alone does not. Presence of a questions field counts even for an empty list. Other completed turn items count regardless of payload, and every delivered tool outcome resets the empty streak before checking whether its turn is still tracked. This broad activity rule is separate from the narrower checkpoint and execution-failure predicates below. Goal-generated hidden continuation context is not a human turn item.

External mutation preparation clears the automatic marker and streak before its write, including failed writes; same-generation edits and activation clear them again. Rebinding preserves that turn's existing activity and final flags while changing its accounting owner. Ordinary turn completion removes the turn but preserves a qualifying empty streak across automatic runs. Reconstructed runtimes start with fresh counters. The package checks below verify the supported public mappings; unavailable classifications remain open.

Six isolated real-session probes passed on Pi 1.1.0, revision `6fb2e781`, and Node 24.13.1. The reproducer is `/tmp/pi-goal-public-failure.M8XFIf/probe.mjs`, using the existing native-host fixture and localhost responses. Independent verification reproduced all six results. No Pi or repository files changed.

- Native retry recovery and exhaustion each make two requests with one configured retry. Only the final `agent_before_settle` outcome distinguishes `completed` from `error`; `agent_settled` follows once with `aborted: false`. An intermediate failed assistant response must not block a recovering run.
- The effective built-in scripting tool identifies itself through `sourceInfo.path`, `sourceInfo.source`, and absent namespace. A returned script failure retains `result.isError: true`; an executed handler throw lacks that property; pre-handler schema rejection lacks `durationMs`.
- Those clean-path fields are insufficient after supported result transformations. An earlier `tool_result` hook can turn a successful result into the same error shape as a handler throw, both in a later hook and in the final execution event. Exact failure counting needs immutable execution provenance before result hooks and normalization. Ordinary throwing result hooks are caught by Pi and do not establish this collision.
- A structured failed response stream preserves the `insufficient_quota` code in `provider_stream_event`. The tested adapter's HTTP 429 path loses the same structured code before public response events and exposes only error text. Universal quota classification needs a terminal structured error category; status codes and text heuristics cannot supply it.

Terminal-error handling can use the verified final boundary. Exact handler-failure counting and quota classification on transports that lose structured errors remain pending capabilities. The reference failure captures and their retrieved payload checks are recorded in ticket 07.

Three additional real-session probes in `/tmp/pi-goal-public-failure.M8XFIf/correlation.mjs` were independently reproduced. A structured quota can be attributed when its nonempty response ID and provider/API/model tuple match the terminal outer assistant message from `turn_end`, with `stopReason: error`. Apply that classification only after final settlement and retry exhaustion. Native cache warming copies the outer request's callbacks: its quota event can overlap an unrelated outer failure with the same provider/API/model, but a different response ID. The overlap tests cover both identified and ID-less background errors. Events or terminal messages without a response ID remain unclassifiable through this join; a per-turn quota flag would produce a false positive.

## Historical Activity and outer-run boundaries

Public source inspection establishes several integration constraints. Native retries and before-settle continuations emit another `agent_start` before the single outer `agent_settled`. Reuse the current accounting binding and retain its activity, empty-final latch, automatic identity, and baselines across those starts. Neither `turnIndex` nor one provider request identifies an outer run. Evaluate the guard once at final settlement, using the latest before-settle outcome.

A completed `text_end` event establishes completed assistant text; a partial block retained in an error message does not. Blank text latches an empty final only when its phase is final or absent. Inspect Pi's public text signature without treating an explicit unknown phase as absent. An empty content array or `stopReason: stop` alone does not establish an empty final. Nonblank text counts in every phase.

Reasoning signatures are provider-specific. The inspected structured-response adapter retains a completed reasoning item's summaries in its signature, while its visible thinking text may instead contain raw reasoning. Raw or opaque thinking cannot prove a summary, and the public assistant message has no equivalent structured-questions field. Keep those classification limits explicit rather than guessing from visible text, question marks, UI prompts, or arbitrary tool arguments.

Every delivered `tool_execution_end` resets the empty streak, including nested and non-executed outcomes. Newly delivered user items, non-internal custom messages, and successful compaction also count as activity. Context-only custom messages and committed boundary drafts can bypass extension message callbacks; inspect newly committed entries through the public read-only session manager where needed. Historical projections, state-only custom entries, and goal-owned hidden context are not new activity. Do not use `display: false` as an activity filter.

Later message hooks can replace assistant messages. Use the persisted `turn_end.message` for the terminal outer response and quota correlation while retaining separate completion evidence for partial or retried blocks.

## Historical Implemented public paths

The guard reuses the accounting module's current goal binding. It retains activity and completion evidence across retries and before-settle continuations, evaluates once at outer settlement, and updates only the matching persisted session and generation. A terminal ordinary error can stop an active goal; a matching structured usage-limit error can also replace an in-flight budget limit. Pause, clear, completion, and an unrelated generation remain protected.

Completed text events distinguish missing, partial, commentary, and final content. The retained structured reasoning signature supplies summary text separately from raw reasoning. Opaque reasoning prevents certifying an empty turn; it is not inferred to contain a summary. Delivered tool outcomes reset the sequence even when validation, permission, or execution failed. Public message events and newly committed session entries cover delivered user items, hidden custom messages, boundary drafts, and compaction without counting retained history or internal goal context. Standalone successful compaction resets the sequence immediately because it has no outer settlement event.

Terminal usage-limit attribution requires the final persisted error message's nonempty response ID and provider/API/model tuple to match a structured failed response. Recovery and exhausted retries keep their native behavior. Mismatched, background, or ID-less events do not establish this classification.

Three preservation fixes share this production slice. A successful manual compaction can queue the owned continuation command, wait through public `waitForIdle`, and recheck lifetime, revision, session, generation, status, pending user work, and compaction cancellation before admission. Its public combined usage report is charged once; standalone completion checkpoints immediately, while in-run compaction leaves usage for existing checkpoints. An objective editor races its public promise against extension lifetime cancellation so a session switch can settle the old command without input in the new session.

## Historical Remaining capability and evidence limits

The immutable executed-handler provenance needed for the separate orchestration-failure counter is unavailable through the verified public outcomes. That counter is not implemented. Structured questions, opaque reasoning summaries, and specialized host modes are also unclassified. No text, question-mark, tool-name, or timing heuristic substitutes for those fields.

Transports that discard structured quota codes or response identities cannot produce a confirmed usage-limit classification. Successful compaction exposes combined usage only at completion; partial or aborted summary requests and activation between internal summary requests lack the required public reporting granularity. No synthetic report fills those gaps.

The five package captures below verify the supported failure and recovery paths against the frozen implementation. They do not establish unavailable classifications or actual-client behavior.

## Historical Native guard captures

The evidence root is `/private/tmp/pi-goal-guard-capture-i6ox7ajy/20261014T072705813Z-c8859e53`, at frozen production revision `f89f03aecb18736432c1cc3f81e76390993b7106`. Five scenarios make 27 requests across 32 Phoenix spans. Independent retrieval verified all 64 full fields, totaling 5,029,679 bytes, against saved strings, SHA-256 hashes, and byte counts. Request wire bytes and the 27 saved response bodies were also checked; 14 reference response bodies were replayed byte-for-byte.

| Scenario                   | Phoenix trace                      | Verified result                                                                                                             |
| -------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Empty finals and resume    | `dc0261504e091a2b183c1de505324881` | Three empty automatic attempts block at 276 tokens. Explicit resume starts a fresh three-attempt sequence, blocking at 552. |
| Retry exhaustion           | `5023ea22e5c64e82b19eb917c8c5e2d1` | Three failed requests exhaust native retries inside one outer run; the goal becomes blocked with zero charged tokens.       |
| Retry recovery             | `7250c19c72a11fa8725b1288b8ebadc9` | The third request succeeds; the goal remains active at 92 tokens until explicit pause.                                      |
| Quota after budget         | `76521cc826e3e29bace7299663c39d92` | A matching structured quota changes `budgetLimited` to `usageLimited`, preserving 184 tokens against a 100-token allowance. |
| Unrelated background quota | `71ee464f98a0e996c483de4908c300f1` | A different response ID prevents quota attribution. The ordinary foreground terminal error blocks the goal with zero usage. |

All 27 requests have public request observations. The captures retain 22 response-metadata events, 63 stream events, 26 persisted turn-end messages, seven tool exchanges, 19 agent starts, and 15 outer settlements. Five HTTP failures have no public stream events; their exact bodies remain recorded without invented usage. Parsed replay events match structurally; object-key order is not treated as byte equality.

The reference scenarios create goals through backend controls. Native captures add an explicit authorization prompt and two zero-usage setup responses. Resume repetition, retry recovery, and the background-quota negative control are labeled additions. Model, maximum output, reasoning and service settings, instruction stacks, policy wording, and native tool/result framing differ. Retry delays are controlled at one millisecond. Both hosts send continuation context with user role, and recorded counters advance at the corresponding boundaries. All isolated goals were cleared; shared files, production sources, and previous evidence retained their hashes. The earlier key-order-sensitive recorder failure remains separate and is excluded from acceptance.

## Historical Package validation

Checks ran on the primary source runtime at `6fb2e7815167e6b19006fc526d1a5d0f5f998787`, version `1.1.0`, with Node `24.13.1`. The package's secondary workspace dependency is not the full-runtime acceptance target.

The final integrated package command passed all 177 checks, including all 37 guard cases, 20 preservation cases, and 13 current Stop cases. Its complete output is `/tmp/pi-goal-final-integrated-tests.log`.

The superseded `stop-probe.test.ts` was removed after production Stop acquired persisted-state, bounded-callback, and actual-terminal coverage. Its historical feasibility evidence remains identified in ticket 03. The current tests cover controls, companions, retries, compaction, failure handling, and teardown. No host or companion source changed.

```sh
/Users/fran/.nvm/versions/node/v24.13.1/bin/node --import /Users/fran/Source/pi/packages/coding-agent/src/experimental/source-resolver.ts --experimental-transform-types --test --test-concurrency=1 --test-timeout=10000 packages/pi-goal/test/*.test.ts
```

The final guard cases passed within that run. Their focused command is:

```sh
/Users/fran/.nvm/versions/node/v24.13.1/bin/node --import /Users/fran/Source/pi/packages/coding-agent/src/experimental/source-resolver.ts --experimental-transform-types --test --test-timeout=10000 packages/pi-goal/test/guards.test.ts
```

The integrated preservation suite includes activation during manual compaction, pause/clear/Stop cancellation of its wait, reported compaction usage, continuation after raw abort, and pending-editor cancellation on session switch. Ticket 07 adds physical terminal and RPC checks against the same production files.

Type checking, targeted lint and formatting, and whitespace checks passed:

```sh
/Users/fran/.nvm/versions/node/v24.13.1/bin/node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json
node_modules/.bin/oxlint packages/pi-goal/src/index.ts packages/pi-goal/src/state.ts packages/pi-goal/src/guards.ts packages/pi-goal/test/guards.test.ts
node_modules/.bin/oxfmt --check packages/pi-goal/src/index.ts packages/pi-goal/src/state.ts packages/pi-goal/src/guards.ts packages/pi-goal/test/guards.test.ts .scratch/pi-goal/issues/06-stop-unproductive-runs.md
git diff --check
```
