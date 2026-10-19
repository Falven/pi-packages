# 19: Honor render-group body eligibility

**What to build:** Keep unfinished ordinary reads, searches, and listings in progress summaries without redundant item rows or an unavailable accordion. Preserve inspection of eligible running commands, registered skill reads, finished work, and retained source, including mixed groups and lifecycle transitions.

**Blocked by:** None (behavior, existing real-Pi test seam, and single-ticket scope approved).

**Status:** resolved

**Task graph:** Retain the approved single vertical slice and its existing no-blocker relationship. It delivers body eligibility, disclosure interaction, source Find, state preservation, documentation, and real-host acceptance together. No prefactor, split, additional ticket, or remaining implementation frontier is needed; related earlier tickets remain closed. Main integration and pushing are outside this ticket's authorized delivery.

**Publication:** Initially `ready-for-agent` at `f928f14`, claimed during implementation, and resolved at `0fe3cac`. This to-spec/to-tickets follow-up reconciles the existing contracts and closeout record; it does not reclassify completed work as ready to implement.

- [x] Filter the render-group body independently of logical membership, boundaries, summaries, working labels, and singleton cardinality.
- [x] Suppress only authoritatively running ordinary read/search/list items; keep registered skill reads, empty-output general commands, other supported kinds, failures, and uncertain outcomes inspectable.
- [x] Retain status-only headers without chevrons, focus decoration, or keyboard/pointer disclosure access when no body is eligible, regardless of item count.
- [x] Expose only eligible rows in mixed groups; retain a running exploration label even when its own item is absent from the body.
- [x] Preserve group, item, and native-output choices through eligibility transitions, completion, failure, cancellation, settings reconstruction, and existing replay boundaries.
- [x] Keep configured global expansion and new-control inheritance without allowing global, pointer, or keyboard input to bypass body eligibility.
- [x] Preserve usable focus, reading position, valid selection/copy, native padding, and narrow-width label fitting as availability changes.
- [x] Let Find temporarily reveal only its selected suppressed item or retained source; remove the previous reveal when selection leaves its item or source occurrence, no match remains, or Find closes, without erasing disclosure choices.
- [x] Preserve provider requests, results, session content, execution, source identity, and generic fallback behavior.
- [x] Keep the original general-command screenshot expandable; introduce no item-count or stdout-presence threshold.
- [x] Document absent Codex visualization and summary-only dynamic-renderer inputs without adding settings, provider fields, dependencies, or host hooks.
- [x] Keep the companion operation contract aligned: publish full facts and retain working-label selection even when chat suppresses item rows.
- [x] Extend existing real-Pi host cases through red/green cycles and pass the combined presentation suite on installed Pi 1.1.0, typecheck, lint, task-file formatting, and whitespace checks.
- [x] Complete separate Standards and Spec self-review passes against the approved starting main revision and resolve actionable findings.
- [x] Deliver on the integration branch with main untouched, no push, and no temporary implementation worktree left behind.

**Contract:** The [chat specification](../../../docs/specs/pi-chat.md) is canonical, including its explicit body-eligibility presentation matrix. The [tool-activity specification](../../../docs/specs/tool-activity.md) records the unchanged operation-fact and working-label obligations. The activity-presentation, disclosure-interaction, source-Find, singleton, and native-flow ADRs carry the corresponding amendments. Existing glossary terms distinguish the logical render group from its render-group body.

**Authorization:** The user approved the existing real-Pi InteractiveMode / AgentSessionRuntime seam, installed Pi 1.1.0, one complete ticket with no blockers, and integration-branch delivery. The user accepted sequential implementation and separate self-performed review axes because subagent tools are unavailable. These are not independent reviews. No physical-terminal, live Codex, additional Pi-version matrix, remote issue, or PR is required.

**Baseline:** `3b3f19dfc82b6afb6154736b58fe4a78c864c288`. Integration branch: `codex/render-group-body-eligibility`. Earlier resolved tickets and verification results retain their original scope.

**Reference evidence:** Codex `26.1013.31256`, build `20586`. The inspected group renderer filters body items before computing expandability; it does not use logical item count or stdout presence. The execution-body predicate omits unfinished ordinary reads/searches/listings, retaining recognized skill-definition reads. The same renderer separately excludes an all-summary-only dynamic-tool body and applies empty-patch visualization guards, for which supported Pi facts have no counterpart. The command filter and singleton predicate are independent. The reference source hashes match the pinned manifest: group renderer `04fce56bf10f81e0acff4e297b878a2a76ff8e4f191e17a87a0a518116c948c8`, skill predicate `6d6c95160d0b3902aafc525ad0819f60cc4c701d51c6b7ed463a6cc980c185bc`, dynamic renderer metadata `0727b79f79d94cbb4070a84abe28ec161c6d9e9cd3ec0c706c28b68871426c12`.

**Pre-implementation evidence:** Eight extracted source-predicate checks and five command-classification controls passed. Read-only real-Pi probes reproduced five mismatches: running read, search, listing, two running exploration items, and a mixed finished-read/running-search body. General-command and finished-read controls passed. Those probes establish the targeted gap, not acceptance of an implementation; live Codex was not exercised.

**Implementation:** `39263b9` retains logical group membership while deriving eligible body rows once per layout. Header rendering, width fitting, focus navigation, and pointer/keyboard toggles share that availability. Find temporarily includes its selected activity item and removes that exception on navigation or closure. Existing disclosure preferences, source indexing, provider facts, and singleton rules remain unchanged. The glossary, current spec, affected ADRs, and package guidance were updated in place; prior resolved tickets were not reopened.

**TDD and verification:** The existing semantic-provider case first failed on the unwanted running-read chevron, then passed after the shared body gate. The Find extension then failed because a retained partial-output hit was still hidden, and passed after adding the selected-item exception and refreshing its visibility before reveal. Existing native-read and skill-read cases verify their distinct in-progress behavior. All **147/147** combined presentation cases passed in 55.188 seconds on Pi/TUI **1.1.0**, Node **v26.8.1**, with zero failures, cancellations, or skips. All **7/7** additional real-host parity probes and **27/27** source-Find cases passed. Typecheck, repository lint, task-file formatting, and whitespace checks passed. No new test case, test file, or primary seam was added.

**Acceptance-fixture correction:** Twelve pre-existing Find cases assumed a literal palette color instead of Pi's current native theme. A focused unchanged-main run reproduced the same failure. The existing assertions now require the actual native search background before the same target text on the same line; no highlight assertion was skipped or removed. The disclosure-state setup uses keyboard navigation and explicitly verifies closure before testing loss and restoration of eligibility. Production search styling and native output behavior were not changed.

**Reviews:** Separate self-performed Standards and Spec passes reviewed `3b3f19d...39263b9`, including the connected rendering, lifecycle, source-search, adapters, and tests. Standards: no documented-standard violations or actionable smell findings. Spec: clarified that non-current aggregate headers have no spinner and no chevron when their body is unavailable; recheck found no remaining issue. The closing changes are documentation only. These are not independent subagent reviews.

**Evidence:** `/tmp/pi-chat-expandability.29O3O8/evidence/` retains focused red/green logs, the seven parity probes, unchanged-main palette evidence, the 147-case combined log, static-check results, runtime identity, the reviewed diff, and both review notes. Installed dependencies were copied into the isolated checkout without changing manifests, lockfiles, versions, or installed Pi source. Normal Git hooks passed.

**Delivery and limits:** The integration branch is the deliverable; main remains at the approved baseline and nothing is pushed. Delivery at `0fe3cac` and removal of the temporary implementation checkout were verified in the session completion output; only the unchanged main checkout remained. The later specification/ticket synchronization is documentation only and carries forward the same runtime/test evidence, rather than claiming a new behavioral run. No implementer subagents or independent review agents were available or used. Physical-terminal pixels/input, OS clipboard transport, live Codex, another Pi version, and the full repository behavioral suite were not checked. Codex-only unsupported inputs retain the documented applicability limits.
