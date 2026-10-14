# 07: Verify the complete contract and matched model trials

**What to build:** Establish the selected core toolset's conformance through complete request/result evidence, then compare task behavior in matched live-model trials with explicit controls and limitations.

**Specification:** [Core toolset](../spec.md).

**Blocked by:** 06 — Preserve complete workflows in mixed Pi sessions.

**Status:** ready-for-agent

- [ ] Run the accumulated slice checks and close any missing selected-contract cases. Preserve the source capture identity and the separate scoped fixture identity.
- [ ] Compare actual outgoing names, namespaces, descriptions, grammar, schemas, defaults, optional fields, argument encoding, results, errors, truncation, and image content. Assert the absence of excluded tools and helper overloads.
- [ ] Verify real command, patch, image, continuation, cancellation, and lifecycle effects alongside their model-bound results. Similar text alone is insufficient.
- [ ] Classify each difference as a verified mismatch, an approved host constraint, or an unverified behavior. Resolve mismatches or report them plainly; do not label unmeasured cases as parity.
- [ ] Use identical prompts, starting conversation conditions, repository snapshots, model identity, and supported generation settings for live trials. Align host preferences and relevant guidance where possible.
- [ ] Control temperature, reasoning effort, limits, and seeds only when exposed by the selected provider/model. Record unavailable controls and remaining harness differences rather than pretending they match.
- [ ] Measure task success, tool-selection/argument mistakes, unnecessary calls, elapsed time, and tokens. Use paired or repeated trials where useful; do not require identical assistant prose or claim undocumented training advantages.
- [ ] Keep raw comparison evidence sufficient to inspect inputs and outputs, with only incidental identifiers or measurements normalized in deterministic assertions. Exclude credentials, unrelated conversations, and prohibited source-product names from repository fixtures.
- [ ] Record verification results in the approved spec/tickets and normal test artifacts. Create no additional research report, general design document, application dependency, or automatic baseline-update mechanism.
- [ ] State remaining public-API or behavioral limits and the exact checks performed before declaring the package complete.
