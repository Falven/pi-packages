# 19: Honor render-group body eligibility

**What to build:** Keep unfinished ordinary reads, searches, and listings in progress summaries without redundant item rows or an unavailable accordion. Preserve inspection of eligible running commands, registered skill reads, finished work, and retained source, including mixed groups and lifecycle transitions.

**Blocked by:** None (behavior, existing real-Pi test seam, and single-ticket scope approved).

**Status:** ready-for-agent

- [ ] Filter the render-group body independently of logical membership, boundaries, summaries, working labels, and singleton cardinality.
- [ ] Suppress only authoritatively running ordinary read/search/list items; keep registered skill reads, empty-output general commands, other supported kinds, failures, and uncertain outcomes inspectable.
- [ ] Retain status-only headers without chevrons, focus decoration, or keyboard/pointer disclosure access when no body is eligible, regardless of item count.
- [ ] Expose only eligible rows in mixed groups; retain a running exploration label even when its own item is absent from the body.
- [ ] Preserve group, item, and native-output choices through eligibility transitions, completion, failure, cancellation, settings reconstruction, and existing replay boundaries.
- [ ] Keep configured global expansion and new-control inheritance without allowing global, pointer, or keyboard input to bypass body eligibility.
- [ ] Preserve usable focus, reading position, valid selection/copy, native padding, and narrow-width label fitting as availability changes.
- [ ] Let Find temporarily reveal only its selected suppressed item or retained source; remove temporary visibility on navigation/query change/close without erasing disclosure choices.
- [ ] Preserve provider requests, results, session content, execution, source identity, and generic fallback behavior.
- [ ] Keep the original general-command screenshot expandable; introduce no item-count or stdout-presence threshold.
- [ ] Document absent Codex visualization and summary-only dynamic-renderer inputs without adding settings, provider fields, dependencies, or host hooks.
- [ ] Extend existing real-Pi host cases through red/green cycles and pass the combined presentation suite on installed Pi 1.1.0, typecheck, lint, task-file formatting, and whitespace checks.
- [ ] Complete separate Standards and Spec self-review passes against the approved starting main revision and resolve actionable findings.
- [ ] Deliver on the integration branch with main untouched, no push, and no temporary implementation worktree left behind.

**Contract:** The [chat specification](../../../docs/specs/pi-chat.md) is canonical. The activity-presentation, disclosure-interaction, source-Find, singleton, and native-flow ADRs carry the corresponding amendments. Existing glossary terms distinguish the logical render group from its render-group body.

**Authorization:** The user approved the existing real-Pi InteractiveMode / AgentSessionRuntime seam, installed Pi 1.1.0, one complete ticket with no blockers, and integration-branch delivery. The user accepted sequential implementation and separate self-performed review axes because subagent tools are unavailable. These are not independent reviews. No physical-terminal, live Codex, additional Pi-version matrix, remote issue, or PR is required.

**Baseline:** `3b3f19dfc82b6afb6154736b58fe4a78c864c288`. Integration branch: `codex/render-group-body-eligibility`. Earlier resolved tickets and verification results retain their original scope.

**Reference evidence:** Codex `26.1013.31256`, build `20586`. The inspected group renderer filters body items before computing expandability; it does not use logical item count or stdout presence. The execution-body predicate omits unfinished ordinary reads/searches/listings, retaining recognized skill-definition reads. The same renderer separately excludes an all-summary-only dynamic-tool body and applies empty-patch visualization guards, for which supported Pi facts have no counterpart. The command filter and singleton predicate are independent. The reference source hashes match the pinned manifest: group renderer `04fce56bf10f81e0acff4e297b878a2a76ff8e4f191e17a87a0a518116c948c8`, skill predicate `6d6c95160d0b3902aafc525ad0819f60cc4c701d51c6b7ed463a6cc980c185bc`, dynamic renderer metadata `0727b79f79d94cbb4070a84abe28ec161c6d9e9cd3ec0c706c28b68871426c12`.

**Pre-implementation evidence:** Eight extracted source-predicate checks and five command-classification controls passed. Read-only real-Pi probes reproduced five mismatches: running read, search, listing, two running exploration items, and a mixed finished-read/running-search body. General-command and finished-read controls passed. Those probes establish the targeted gap, not acceptance of an implementation; live Codex was not exercised.
