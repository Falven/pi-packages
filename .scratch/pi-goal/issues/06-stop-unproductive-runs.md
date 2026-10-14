# 06: Stop unproductive runs

**What to build:** Stop goals for the correct runtime reason when continuations are empty, orchestration repeatedly fails, retries are exhausted, or provider usage is limited, while preserving explicit user control and accounting. Follow the approved [specification](../../../docs/specs/pi-goal.md).

**Blocked by:** 04: Account for usage and budgets.

**Status:** ready-for-agent

- [ ] Block a goal after the specified three consecutive automatic turns with an empty final and no qualifying activity. Record automatic-turn identity only after admission; a rejected or ordinary user turn is not an automatic empty attempt.
- [ ] Preserve the observed activity definition for text, surfaced reasoning, questions, tool outcomes, and other turn items. Qualifying activity and user-driven attempts reset the relevant empty-response sequence. Do not infer emptiness from visible chat rendering alone.
- [ ] Match the qualifying execution-failure predicate: an executed handler failure of the default-namespace `exec` orchestration tool. Verify the equivalent host outcome and active tool identity before counting it.
- [ ] Count three qualifying failure turns for the applicable goal when no successful tool resets the sequence. Any successfully completed tool resets it; a turn without a qualifying failure does not necessarily reset it.
- [ ] Exclude unsuccessful completed results, pre-handler validation failures, permission blocks, and aborted calls from that execution-failure count. Do not convert all tool errors into the same stop condition.
- [ ] Keep the model's semantic blocked audit in the agent instructions: the same genuine impasse must recur for three consecutive goal turns, and explicit resume starts a fresh audit. Runtime empty/failure counters do not prove an impasse or authorize an early semantic block.
- [ ] Preserve native retries. A terminal turn error can block the applicable goal after retry exhaustion; a confirmed provider usage limit produces `usageLimited`, including its specified precedence over an in-flight budget-limited state. Use verified host classification rather than guessed message substrings.
- [ ] Apply stop effects only to the relevant current goal generation and accounting turn. Stale failures and old descendants cannot stop a replacement goal or mutate another session; do not infer planning or specialized child modes from prompt wording.
- [ ] Stop future automatic continuation and expose the effective reason in stored state, model results, and native controls. Preserve eligible final accounting and the existing resume actions without fabricating separate goal pause, blocked, or usage-limit templates.
- [ ] Verify threshold boundaries, counter resets, nonqualifying outcomes, retry exhaustion, quota failures, budget precedence, explicit resume, and stale events through controlled responses in real Pi sessions. Do not deliberately exhaust a paid provider quota for a test.
- [ ] Capture failure and recovery exchanges in Phoenix with explicit evidence origin. Scripted failure responses and bundled-runtime checks remain distinguishable from actual-client observations; retrieve captures and record any unsupported error or mode classification here.
- [ ] Keep public extension integration, unchanged Pi files, neutral terminology, and relevant validation intact. Mark unsupported stop predicates or missing evidence as pending rather than broadening the behavior silently.
