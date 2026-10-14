# 04: Account for usage and budgets

**What to build:** Show trustworthy tokens and elapsed pursuit time, preserve those values through lifecycle changes, and stop future goal work when its soft token allowance is exhausted. Follow the approved [specification](../../../docs/specs/pi-goal.md).

**Blocked by:** 03: Continue safely and honor Stop.

**Status:** ready-for-agent

- [ ] Charge uncached input plus output using the provider's reported usage. Verify Pi's input-plus-cache-write-plus-output mapping against original provider counters; exclude cache reads and avoid counting reasoning again when included in output.
- [ ] Establish accounting when the goal becomes active. Creating a goal partway through a turn excludes previously reported work; replacing a completed goal establishes a fresh baseline and excludes old descendant deltas.
- [ ] Count eligible reported delegated usage once. Verify attribution and timing when Pi aggregates nested usage onto a finalized top-level tool result, including concurrent and repeated events. Do not also charge nested events or claim coverage of subprocesses and tools that omit usage.
- [ ] Persist nonnegative exact integer deltas and commit the accounting baseline only after a successful write. Serialize checkpoints so concurrent tool completions cannot charge the same provider usage twice; storage failure cannot silently consume a baseline.
- [ ] Record provider usage as pending accounting without flushing solely because usage arrived. Persist at the specified tool-finish, turn-stop, and external-mutation boundaries. A read returns the stored snapshot and can be followed by its own tool-finish accounting. `update_goal` performs its own checkpoint and is excluded from the generic tool-finish checkpoint.
- [ ] At pause, clear, or completion, retain only eligible usage known at the relevant boundary. Do not invent missing provider reports or silently charge later reports after active accounting is cleared. Preserve the completion snapshot across interactive cleanup.
- [ ] Maintain monotonic live pursuit time with fractional carry across checkpoints. Include active waits, exclude paused or unloaded periods, and avoid charging process downtime. Display integer seconds and keep wall-clock timestamps in their specified units.
- [ ] Clamp remaining tokens at zero and preserve the soft-limit behavior. Already admitted work can overshoot; exhaustion prevents new continuations and instructs the model to stop substantive work while eligible in-flight accounting continues until its boundary.
- [ ] Preserve budget-limited status across pause or block requests and reject activation with an already exhausted budget. Completion and confirmed provider usage limits retain their specified precedence. A genuinely configured host maximum follows the observed policy without adding an invented default setting.
- [ ] Inject the budget notice only at a qualifying tool-finish checkpoint and at most once for the applicable generation. Other exhaustion checkpoints do not guarantee a message, and the message does not itself cancel the turn. Preserve objective data, elapsed time, token values, wrap-up guidance, and the distinction between prose and serialized status spelling.
- [ ] Show current persisted usage and effective stop reason in native goal controls and all relevant model results. Emit completion reporting guidance only under the specified conditions, without adding final-response tokens that were unavailable to the completed snapshot.
- [ ] Protect replacement goals and other sessions from late token, child-usage, tool-completion, and time callbacks by both ownership and generation. Repeated events, resume, objective edits, and session restoration must not create refunds or fresh allowances.
- [ ] Verify cache variants, reasoning, large integers, pre-creation baselines, nested usage, concurrency, soft overshoot, failed persistence, time carry, pause/resume, and late reports through the agreed seam. Use narrower controlled checks only for precision, clock, or failure cases that the real-session boundary cannot express clearly.
- [ ] Capture original usage, normalized usage, checkpoints, budget messages, and final results in Phoenix. Correlate nested and background work, retrieve captures to verify completeness, and record any attribution or timing gap before claiming delegated parity.
- [ ] Preserve public extension boundaries and neutral terminology, complete relevant checks, and leave all unreported-usage and unsupported-provider limitations explicit.
