# 04: Apply file patches through native dispatch

**What to build:** Let the model submit a patch through JavaScript orchestration, apply the requested local file changes, and receive the verified patch result in the next request while preserving Pi's file coordination and interception.

**Specification:** [Core toolset](../spec.md).

**Blocked by:** 01 — Execute a command through the complete model loop.

**Status:** ready-for-agent

- [ ] Expose the captured raw-string `apply_patch` interface through the selected nested tools and preserve the model-facing declaration.
- [ ] Establish patch grammar, matching, returned change information, errors, validation order, and partial-failure behavior from the fixed baseline; the captured declaration alone does not supply these details.
- [ ] Demonstrate file creation, updates, moves, and deletion through a complete model request, real filesystem effect, and next-request result.
- [ ] Resolve paths in the owning execution context. Preserve ordinary filesystem permissions and report actual errors without claiming workspace confinement or elevated authority.
- [ ] Preserve unrelated contents and applicable BOM, encoding, and newline behavior. Do not substitute native fuzzy replacement or convenience path rewriting for the selected patch contract.
- [ ] Reuse public `withFileMutationQueue` for local mutations and verify coordination with native mutations, including an existing symlink alias. Add no second lock manager.
- [ ] Exercise overlapping calls, missing files, malformed or nonmatching patches, and cancellation with actual content checks. Do not promise rollback, atomic multi-file transactions, or cross-process locking.
- [ ] Preserve argument changes, blocking, result redaction, and native events through public dispatch. A policy fixture must recognize the new patch operation and its affected paths.
- [ ] Verify returned success/error content and changed-file evidence together through the existing host seam, including the next model request after a failure.
