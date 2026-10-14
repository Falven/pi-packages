# 02: Manage goal lifecycle

**What to build:** Manage a goal through model updates and native user controls, preserving its objective, ownership, usage, and effective status through edit, pause, resume, clear, and completion. Follow the approved [specification](../../../docs/specs/pi-goal.md).

**Blocked by:** 01: Create and inspect goals.

**Status:** ready-for-agent

- [ ] Add `update_goal` with only the specified `complete`, `blocked`, and `paused` inputs. Use Pi's native schema validation, result delivery, and error handling; preserve goal values and the successful result envelope across direct and native programmatic calls.
- [ ] State the explicit-pause, full-completion, three-turn blocked-audit, fresh-audit-after-resume, and returned-budget-reporting policies in independently written descriptions. These are model instructions; do not invent runtime proof checks or additional tool arguments.
- [ ] Provide the native `/goal` surface and equivalent explicit command actions for inspect, create, edit, pause, resume, and clear. Preserve configured keys, native widgets, themes, overlays, and companion extension ownership.
- [ ] Offer pause for active goals and resume for paused, blocked, and usage-limited goals. Preserve the absence of ordinary pause/resume actions for completed and budget-limited goals. Ordinary objective controls add no budget input or implicit budget increase.
- [ ] Edit within the current generation, preserving creation time, budget, and recorded counters while requesting activation. An exhausted budget prevents activation. A new goal after completion receives a new generation and fresh counters.
- [ ] Explicit pause stops future pursuit without requiring interruption of the current turn. Resume retains usage and revokes the earlier pause instruction. Keep model updates, user controls, and runtime-owned limit transitions distinct. Verify pause and clear state changes directly; queued-continuation suppression while loaded belongs to ticket 03, independently of extension removal.
- [ ] Preserve effective-status precedence: pause or block cannot override budget exhaustion; activation cannot replenish an exhausted allowance; actual completion can supersede a budget-limited state. Verify through the state and user-facing result, then exercise live accounting boundaries with ticket 04.
- [ ] Return completion guidance only when an update requests completion, the resulting status is complete, and a budget exists or elapsed time is positive. Reading an already completed goal returns no completion guidance.
- [ ] Preserve a completion result's own snapshot even if interactive cleanup clears the current goal before delivery. Retain the completed display snapshot in the interactive interface; retain completed backend state in headless use until clear or replacement.
- [ ] Clear current state and extension-owned accounting while retaining conversation history. Repeated clear remains well defined. Subsequent events must not change a different session or a replacement goal.
- [ ] Inject an objective-edit message only for a changed objective in the same generation whose resulting status is active and whose turn is still running. Preserve role, provenance, escaping, fields, and placement. Creation and replacement are not edits; idle edits use the continuation path delivered in ticket 03.
- [ ] Establish user-control message provenance from actual-client captures. A locally displayed goal entry or backend support for `origin: user` does not prove a model-facing authorization message was sent. Preserve the conditional user-origin context contract without fabricating dedicated pause, blocked, or usage-limit templates.
- [ ] Verify lifecycle transitions, invalid statuses, completion cleanup races, replacement, and direct/nested results through the real-session seam. Capture relevant user controls and model exchanges in Phoenix, retrieve them, and record evidence or pending gaps here.
- [ ] Use public extension services, preserve Pi's installed files and unrelated behavior, retain neutral terminology, and complete the relevant checks without claiming unimplemented continuation or accounting behavior.
