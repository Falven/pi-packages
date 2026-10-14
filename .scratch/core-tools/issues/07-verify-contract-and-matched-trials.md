# 07: Verify the complete contract and matched model trials

**What to build:** Establish the selected core toolset's conformance through complete request/result evidence, then compare task behavior in matched live-model trials with explicit controls and limitations.

**Specification:** [Core toolset](../spec.md).

**Blocked by:** 06 — Preserve complete workflows in mixed Pi sessions.

**Status:** blocked by 06 — mixed workflows remain incomplete

- [ ] Run the accumulated slice checks and close any missing selected-contract cases. Preserve the source capture identity and the separate scoped fixture identity.
- [ ] Compare actual outgoing names, namespaces, descriptions, grammar, schemas, defaults, optional fields, argument encoding, results, errors, truncation, and image content. Assert the absence of excluded tools and helper overloads.
- [ ] Verify real command, patch, image, continuation, cancellation, and lifecycle effects alongside their model-bound results. Similar text alone is insufficient.
- [ ] Classify each difference as a verified mismatch, an approved host constraint, or an unverified behavior. Resolve mismatches or report them plainly; do not label unmeasured cases as parity.
- [ ] Verify revised continuation rules and distinguish package-owned history, native hook ID/context limits, notification timing, termination cleanup, and unobserved wait arbitration/cancellation from verified reference matches.
- [ ] Record completed-call baseline and revised median/tail latency, repeated waits, large/concurrent output, peak memory, main-thread delay, and cleanup time without model latency. Confirm no workers on waits, no polling, bounded queues, incremental writes, and proportional collection; explain short-call regressions.
- [ ] Use identical prompts, starting conversation conditions, repository snapshots, model identity, and supported generation settings for live trials. Align host preferences and relevant guidance where possible.
- [ ] Control temperature, reasoning effort, limits, and seeds only when exposed by the selected provider/model. Record unavailable controls and remaining harness differences rather than pretending they match.
- [ ] Measure task success, tool-selection/argument mistakes, unnecessary calls, elapsed time, and tokens. Use paired or repeated trials where useful; do not require identical assistant prose or claim undocumented training advantages.
- [ ] Keep raw comparison evidence sufficient to inspect inputs and outputs, with only incidental identifiers or measurements normalized in deterministic assertions. Exclude credentials, unrelated conversations, and prohibited source-product names from repository fixtures.
- [ ] Record verification results in the approved spec/tickets and normal test artifacts. Create no additional research report, general design document, application dependency, or automatic baseline-update mechanism.
- [ ] State remaining public-API or behavioral limits and the exact checks performed before declaring the package complete.

## Retained evidence

The [command observations](../../../packages/pi-codex-tools/test/fixtures/observed/commands/index.json) and [file observations](../../../packages/pi-codex-tools/test/fixtures/observed/files/index.json) preserve supplemental inputs and outcomes separately from the frozen contract. Their runtime identity, formatting, hash validation, and observation limits are recorded in the specification.

Final repository validation at integration commit `17c4c58` passed: `pnpm test --test-timeout=120000` completed 951 tests in one suite, with no failures, cancellations, skips, or todos, in 73.409 seconds. Full formatting checked 310 files; lint and type checking passed. The separate four-check configured-companion probe at `0d80487` and six-check [native-host process lifecycle probe](../../../packages/pi-codex-tools/test/fixtures/observed/commands/session-replacement.json) at `5507b77` are recorded in ticket 06 and are outside that test count.

An earlier default run at `17c4c58` passed 950 of 951 tests. The unchanged [chat grouping test](../../../packages/pi-chat/test/bounded-groups.test.ts) expected the first command in an action summary but rendered the second, then stalled during teardown; only that test child was stopped. The isolated file subsequently passed all six checks, and the final full run passed. This unrelated timing flake remains unfixed.

Review follow-up reproduced and fixed relative command directories in pipe and PTY calls, then consolidated the repeated nested-tool registration logic. Both independent reviewers confirmed their findings resolved at `0d80487`. After correcting process-test startup synchronization, all 117 package tests passed, including the regression and existing selection, ownership, hook, settings, and lifecycle checks. Package type checking, targeted lint, formatting, and whitespace checks passed.

Validation at `0d80487` confirmed 94 stored JSON observations preserve their source values, 88 indexed hashes match, and 67 evidence links resolve. Naming and frozen-contract identity checks passed. The packed package includes all runtime files, including `worker.mjs` and `contract.json`. The subsequent test-only change leaves runtime code, the frozen contract, and retained observations unchanged.

These are partial accumulated checks. They do not complete full conformance or matched live-model trials. [Ticket 06](06-verify-mixed-native-workflows.md) remains blocked by ticket 03, and this ticket remains blocked by 06.
