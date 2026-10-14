# 02: Manage goal lifecycle

**What to build:** Manage a goal through model updates and native user controls, preserving its objective, ownership, usage, and effective status through edit, pause, resume, clear, and completion. Follow the approved [specification](../../../docs/specs/pi-goal.md).

**Blocked by:** 01: Create and inspect goals.

**Status:** in-progress — lifecycle implementation and controlled-session evidence are complete; actual-client user-origin provenance remains an acceptance gap.

- [x] Add `update_goal` with only the specified `complete`, `blocked`, and `paused` inputs. Use Pi's native schema validation, result delivery, and error handling; preserve goal values and the successful result envelope across direct and native programmatic calls.
- [x] State the explicit-pause, full-completion, three-turn blocked-audit, fresh-audit-after-resume, and returned-budget-reporting policies in independently written descriptions. These are model instructions; do not invent runtime proof checks or additional tool arguments.
- [x] Provide the native `/goal` surface and equivalent explicit command actions for inspect, create, edit, pause, resume, and clear. Preserve configured keys, native widgets, themes, overlays, and companion extension ownership.
- [x] Offer pause for active goals and resume for paused, blocked, and usage-limited goals. Preserve the absence of ordinary pause/resume actions for completed and budget-limited goals. Ordinary objective controls add no budget input or implicit budget increase.
- [x] Edit within the current generation, preserving creation time, budget, and recorded counters while requesting activation. An exhausted budget prevents activation. A new goal after completion receives a new generation and fresh counters.
- [x] Explicit pause stops future pursuit without requiring interruption of the current turn. Resume retains usage and revokes the earlier pause instruction. Keep model updates, user controls, and runtime-owned limit transitions distinct. Verify pause and clear state changes directly; queued-continuation suppression while loaded belongs to ticket 03, independently of extension removal.
- [x] Preserve effective-status precedence: pause or block cannot override budget exhaustion; activation cannot replenish an exhausted allowance; actual completion can supersede a budget-limited state. Verify through the state and user-facing result, then exercise live accounting boundaries with ticket 04.
- [x] Return completion guidance only when an update requests completion, the resulting status is complete, and a budget exists or elapsed time is positive. Reading an already completed goal returns no completion guidance.
- [x] Preserve a completion result's own snapshot even if interactive cleanup clears the current goal before delivery. Retain the completed display snapshot in the interactive interface; retain completed backend state in headless use until clear or replacement.
- [x] Clear current state and extension-owned accounting while retaining conversation history. Repeated clear remains well defined. Subsequent events must not change a different session or a replacement goal.
- [x] Inject an objective-edit message only for a changed objective in the same generation whose resulting status is active and whose turn is still running. Preserve role, provenance, escaping, fields, and placement. Creation and replacement are not edits; idle edits use the continuation path delivered in ticket 03.
- [ ] Establish user-control message provenance from actual-client captures. A locally displayed goal entry or backend support for `origin: user` does not prove a model-facing authorization message was sent. Preserve the conditional user-origin context contract without fabricating dedicated pause, blocked, or usage-limit templates.
- [x] Verify lifecycle transitions, invalid statuses, completion cleanup races, replacement, and direct/nested results through the real-session seam. Capture relevant user controls and model exchanges in Phoenix, retrieve them, and record evidence or pending gaps here.
- [x] Use public extension services, preserve Pi's installed files and unrelated behavior, retain neutral terminology, and complete the relevant checks without claiming unimplemented continuation or accounting behavior.

## Implementation evidence

The three tools use native registration, schemas, sequential tool execution, text and structured results, and ordinary errors. `update_goal` accepts only completion, blocking, or pause. Its independently written instructions preserve explicit-pause authority, evidence for the entire objective, the three-turn blocked audit, a fresh audit after resume, budget precedence, and reporting the returned usage. These remain model policies rather than invented runtime proof checks.

`/goal` opens a native selector and objective editor. Explicit `inspect`, `create <objective>`, `edit <objective>`, `pause`, `resume`, and `clear` actions use the same mutation path without a picker. The selector preserves configured confirm/cancel keys and uses the host's existing status and notification services. It does not replace the editor, footer, chat view, provider, or command infrastructure. Ordinary objective controls add no budget. Unicode whitespace is trimmed by the goal rule; format characters outside that class survive both direct commands and tool calls.

Each stored mutation retains its session and private generation. Objective edits preserve creation time, budget, and recorded counters, request activation, and respect an exhausted allowance. Pause/block cannot replace `budgetLimited`; completion can. Resume preserves the allowance and counters, and is available only for paused, blocked, or usage-limited state. SQLite updates and deletes compare the owning session and generation, protecting replacements. Pending UI controls also capture a revision and session identity; stale editors cannot overwrite a cleared/replaced goal. Shutdown invalidates owned callbacks and cancels an open selector before disposal.

Pause and clear mutate state without aborting a running turn or appending a fabricated human message. Repeated clear removes current state and its stored counters while preserving conversation history. This slice owns no active accounting cache; accounting checkpoint integration belongs to ticket 04. Queued-continuation suppression and the fresh blocked-audit continuation instruction belong to ticket 03.

A changed objective in an active, still-running goal sends one hidden custom message through the public message API. The provider receives user-role context after the relevant tool output. Local metadata records source `goal` and kind `goal.internal_context`; the objective is escaped inside `untrusted_objective`, and the message includes recorded usage, allowance, and remaining tokens. Idle edits, unchanged objectives, and creation/replacement do not generate that edit context. The independently written wrapper ends without a trailing newline. No user-origin authorization context is synthesized.

A successful completion result owns its snapshot. Terminal presentation retains the completed status while clearing current backend state, including a completed headless goal first opened in the terminal. A cleanup failure leaves that successful snapshot deliverable and displays an actionable `/goal clear` retry notice. Headless completion remains stored and readable until explicit clear or replacement. Completion guidance appears only on the completion update, when an allowance exists or elapsed time is positive; a subsequent read has no guidance. Exact large integer values survive both direct and nested results.

The shared fixture gained a small headless option that binds the real runtime in `print` mode without constructing an interactive renderer. The lifecycle checks use this public binding and the existing recording terminal; they do not reproduce the agent loop or patch host internals. Stored-usage and deletion-failure fixtures are explicit system inputs to real sessions, not claims that live accounting is implemented.

## Validation

TDD slices first reproduced missing `update_goal`, missing completion guidance, deletion failure replacing a successful completion, exhaustion becoming paused, missing picker/control behavior, missing running-edit context, retained current state on terminal restore, and command trimming that lost format characters. The implemented behavior then passed through the real-session seam. Generation replacement and session-switch tests observe public tool results and native UI outcomes.

Both affected suites passed **65/65** on Node 24.13.1. The first command uses workspace Pi 1.0.2; the second resolves primary Pi 1.1.0:

```sh
/Users/fran/.nvm/versions/node/v24.13.1/bin/node --experimental-transform-types --test packages/pi-goal/test/goals.test.ts packages/pi-goal/test/lifecycle.test.ts packages/pi-goal/test/protocols.test.ts test/native-host.test.ts
/Users/fran/.nvm/versions/node/v24.13.1/bin/node --experimental-transform-types --import /Users/fran/Source/pi/packages/coding-agent/src/experimental/source-resolver.ts --test packages/pi-goal/test/goals.test.ts packages/pi-goal/test/lifecycle.test.ts packages/pi-goal/test/protocols.test.ts test/native-host.test.ts
```

Type checking, scoped lint/format checks, and `git diff --check` passed. Existing dependency binaries were reused through this worktree's ignored links; no installation or host modification was performed. The tests cover native status validation, counter-preserving controls, both completion lifetimes, cleanup failure, replacement, late controls, remapped selector keys, running pause/clear without interruption, hidden edit context, and direct/nested result delivery. Broader unrelated suites were not rerun.

Integration tip `d5bff91` was merged before implementation. Tip `d48c58a99a07dfd01b93c35d758f9b88860e371f` was merged before committing this slice; its additional changes affect evidence and specification text only.

## Agent-interface captures

Three fresh scripted Pi 1.1.0 sessions produced **16 request spans and 32 matching full input/output hashes**. The last public request observer equals the endpoint's received decoded request-body string. Captured output includes host context, parsed provider events, tool starts/results with their call identities, and final messages. Complete fields were retrieved from Phoenix and checked by SHA-256 and byte length, correlated by span identity. This establishes fidelity at that capture layer; it does not establish compressed transport-byte identity.

| Scenario                                                                     | Trace                                                                                                                                                   | Verified records          |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| Running edit and replacement, headless retention                             | [69e1850b18b6a33775666ec2d232a842](http://127.0.0.1:6006/v1/projects/UHJvamVjdDoz/spans?trace_id=69e1850b18b6a33775666ec2d232a842&limit=1000&order=asc) | Eight requests; 16 hashes |
| Pause, explicit resume, and clear through native commands                    | [0999921bc39af4ef961deb2431eeaa95](http://127.0.0.1:6006/v1/projects/UHJvamVjdDoz/spans?trace_id=0999921bc39af4ef961deb2431eeaa95&limit=1000&order=asc) | Six requests; 12 hashes   |
| Native nested updates, invalid status, completion snapshot, and cleared read | [5e4c3af4fad63de958f9092369a48f8a](http://127.0.0.1:6006/v1/projects/UHJvamVjdDoz/spans?trace_id=5e4c3af4fad63de958f9092369a48f8a&limit=1000&order=asc) | Two requests; four hashes |

The running-edit capture uses the same prompt, call identities, arguments, response usage, edit objective, and replacement objective as [the comparison trace](http://127.0.0.1:6006/v1/projects/UHJvamVjdDoz/spans?trace_id=db1131d37ed34b4ab5f7addca2084531&limit=1000&order=asc). All seven goal results match objective, status, allowance, and presence of completion guidance. Both requests first carry the escaped edit context as user-role content immediately after `call_edited-read`; replacement emits no edit message. Wording and wrapper names are independently written. Dynamic identities/timestamps and native advertising/results differ by design.

Live accounting is an explicit unmatched dimension: the edited read, first completion, and replacement completion report zero recorded tokens here, versus 92, 276, and 184 in the comparison. Corresponding remaining amounts differ. Those differences are retained in the evidence and belong to ticket 04; they are not normalized into a passing usage comparison.

The pause/resume/clear capture preserves the initial prompt and scripted call sequence from [its comparison trace](http://127.0.0.1:6006/v1/projects/UHJvamVjdDoz/spans?trace_id=731c9b92f9a64a8b9c1d55e09de953c8&limit=1000&order=asc). It demonstrates native command mutation while the current run continues. Its second run is explicitly prompted by the fixture after resume: automatic admission and the continuation message remain ticket 03 work. That additional user prompt is labeled in the capture and is not claimed to match an automatic continuation.

Captures record Pi 1.1.0 at `6fb2e7815167e6b19006fc526d1a5d0f5f998787`, Node 24.13.1, the fixture model with reasoning disabled, 128,000 context capacity, a 100-token output maximum, and disabled compaction/retry. Scripted responses report 100 input tokens, 20 cached tokens, 12 output tokens, and 4 reasoning tokens. The nested scenario's final default answer omits usage and is explicitly marked missing. Configured models, provider routes, generation controls, instructions, and full tool sets differ from the comparison runtime. These are controlled real sessions, not live-model or physical-terminal observations.

The final capture source hashes are `768251ec47307f2b13e9bffa4430377e6c921edb278acf136a95f34d0583de4b` for `index.ts` and `c089bb8d7bed42daebcae4852809e795ab864b53cb6bd80dfaf44729adb2ccbf` for `state.ts`. The [full capture manifest](/tmp/pi-goal-lifecycle-AwBnZl/final/final-report.json), per-scenario source/retrieved records, and verification files remain in `/tmp/pi-goal-lifecycle-AwBnZl/final/`. Earlier captures under its parent directory and the previous ticket captures remain intact. Reproduction:

```sh
PI_GOAL_CHECKOUT=/Users/fran/.codex/worktrees/pi-goal-lifecycle/pi-packages /Users/fran/.nvm/versions/node/v24.13.1/bin/node --experimental-transform-types --import /Users/fran/Source/pi/packages/coding-agent/src/experimental/source-resolver.ts --test /tmp/pi-goal-lifecycle-AwBnZl/final/capture.mjs
```

Actual-client user-origin authorization is still unverified. Neither native commands nor a visible goal entry establish that conditional message path. This implementation does not invent it. Actual terminal Stop/companion compatibility, RPC transport behavior, live accounting, continuation, fork inheritance, and compaction boundaries retain their own acceptance gates in tickets 03–07.

## Retrieved field hashes

Every row below matched the complete posted and retrieved input/output strings and byte lengths. Request ordinals are local to the named scenario.

| Scenario / request     | Input SHA-256                                                      | Output SHA-256                                                     |
| ---------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| running-edit / 1       | `e5771020c0a386a352b5a533139596b0539b35575867a612961108850a6ded5f` | `ef38a64ec468f30738b9af49e12bc424c51f7dfb8013acac8c23b8540d3d2eab` |
| running-edit / 2       | `e287fac1d0ed1df1d1e3efaaf605c6ccbf2efae591dce96eee0c926f85f1e082` | `3b52a3978f0d7dcc32fa13e8891e489e85ea40f3bf81cc5d6702fb9e2956e091` |
| running-edit / 3       | `12d0684572dfdc2279a7f45bb5328e231477891cde7dcf99ee4d7f300aede6a8` | `9bc6ebadad15652c6c09c3a51c885df7b93b29cd7b4ce9b36d886049110de8bd` |
| running-edit / 4       | `59d90cadc32559e1bd1085b6c74256da8165491cbc836265ef938ea7dbd981ff` | `d6d766d74140419b303fedbdc06ef236d4d5f5a38ddba4889e5e12c27639be55` |
| running-edit / 5       | `5bba569cb72ea3dca4114a9548abb094f130f91cdcb04d0817ed8c44dc34fe52` | `25470038ec1b07ccec3eaa4a57538d8f6d8d02a10ad20c261f3af29bab61d936` |
| running-edit / 6       | `d1e86a3bfa5db19f0c63bc5c1ce149d9c4351f1709eb4b93d20f148a2dfcb901` | `abbb5989ccd0995e61ae6a1e17571e853601e03243a0be91f34c0afc9afc6175` |
| running-edit / 7       | `c4f8e68dffd67e6110f00f70233747235251b88b4e967b4ce81e73cd0ebe42bf` | `07d307d0aa19fe0f3dad77e7562503c6ba43e6a199d9cd3110828338ad9f7792` |
| running-edit / 8       | `3e8c19a98baed0410ec2cf51490464fb326617511664b7b1e94d4456db2ab144` | `4f2c95da6c625cb39d051c89bcf8730d0d446029ab6591afd0a386a9db527a86` |
| pause-resume-clear / 1 | `9678fa5e90e33b710c229a80969bbe6a3962d97fc4ac1f8706e1487c05376f2f` | `8e3f09f88f13700dd9f58a7f85433609ae3f88451a24b3371c9bd99d8ff88985` |
| pause-resume-clear / 2 | `90b2a248819ac82cc9127188c3dc74108e659545e0a8a53be68552c9f10b6e76` | `9d0b52ae70c09b7b5ede511945c7a92800a0f5a3af869d2cdbbb55ad21941579` |
| pause-resume-clear / 3 | `722420391a81842f20543e228cf9852bb079b83e3e544ab632a3315fcea71d5f` | `759e983d6ccdcb2b6b1fbcdd97112e1a5f14f92dc9972de53423deb6350c9475` |
| pause-resume-clear / 4 | `f3af143b15094b361a9299646a21bee8632d3df99a52f972a81f0c99341d194e` | `e0d6b8003cc1127e6ee14aa69007e21dd7e78118a2d142be9b4e88b0120b7c7d` |
| pause-resume-clear / 5 | `5478b68fded43de7e487aab7400b9ffd56a11958627c602d6dd253d62ad6d0c6` | `cbb8ee29ba0081491ec270ebf893ef816840f74d0a68d5d7e32b8635d0131765` |
| pause-resume-clear / 6 | `1e74a2609ca9b6ce67b9d45bd05b66fc95ead7b203b09e98a0a271bd987e49f6` | `57d55904fbd4e97ff8673e01ea387b3a4dbb33a17d3ee3ec7f365ae2922e3a34` |
| native-nested / 1      | `815efb5bda2aac6b036c0cb917de0a7994bd4650731e4dd135307ab4c4904e06` | `493d9eade3049f9887edd35f239dc846a6bc5ad428657ab80ebde011fd9ec05a` |
| native-nested / 2      | `bd67f6b71ca0c904f766b9eee10cc7ea1cd90681f38906b749fd6962d7eed8ba` | `eefe175894dd3605492a234599787770ca8bad814cf4fe8f85acbb2ddffb3d64` |
