# 04: Apply file patches through native dispatch

**What to build:** Let the model submit a patch through JavaScript orchestration, apply the requested local file changes, and receive the verified patch result in the next request while preserving Pi's file coordination and interception.

**Specification:** [Core toolset](../spec.md).

**Blocked by:** 01 — Execute a command through the complete model loop.

**Status:** resolved — patch slice; runtime evidence limits recorded below

- [x] Expose the captured raw-string `apply_patch` interface through the selected nested tools and preserve the model-facing declaration.
- [x] Establish patch grammar, matching, returned change information, errors, validation order, and partial-failure behavior using the frozen declaration and supplemental runtime observations, with their different provenance recorded below.
- [x] Demonstrate file creation, updates, moves, and deletion through a complete model request, real filesystem effect, and next-request result.
- [x] Resolve paths in the owning execution context. Preserve ordinary filesystem permissions and report actual errors without claiming workspace confinement or elevated authority.
- [x] Preserve unrelated contents and applicable BOM, encoding, and newline behavior. Do not substitute native fuzzy replacement or convenience path rewriting for the selected patch contract.
- [x] Reuse public `withFileMutationQueue` for local mutations and verify coordination with native mutations, including an existing symlink alias. Add no second lock manager.
- [x] Exercise overlapping calls, missing files, malformed or nonmatching patches, and cancellation with actual content checks. Do not promise rollback, atomic multi-file transactions, or cross-process locking.
- [x] Preserve argument changes, blocking, result redaction, and native events through public dispatch. A policy fixture must recognize the new patch operation and its affected paths.
- [x] Verify returned success/error content and changed-file evidence together through the existing host seam, including the next model request after a failure.

## Implementation evidence

- `test/patch.test.ts` uses the existing native host and shared model-loop fixture. It observes the outgoing raw declaration, local file bytes and modes, and the next request after creation, update, move, deletion, and failure. The nested success result is `{}`; failures reject with the observed strings.
- Parsing happens after public native dispatch processes argument hooks. A fixture replaces invalid raw input with a valid patch, blocks affected paths, replaces success content, and checks native activity attribution. The script receives the processed result without restoring removed structured content.
- Validation covers the whole patch before writes. Repeated operation paths, unreadable or invalid UTF-8 source files, malformed hunks, and missing matches leave every file unchanged. A later runtime write failure retains completed earlier changes. Empty Add creates a zero-byte file; moving a file onto itself preserves the measured write-then-delete effect.
- Matching checks exact, trailing-whitespace, full-whitespace, and punctuation normalization priority, duplicate matches, anchors, multiple hunks, and end-of-file constraints. Content checks cover BOM significance, unrelated BOM preservation, mixed line endings, first-newline selection, missing final newlines, insertion-only hunks, removal of every line, and a 200,000-line unchanged prefix.
- All affected paths share public file mutation queues in a consistent order. Overlapping patches and a native write through an existing symlink alias retain both changes. Cancellation while queued leaves the file intact and permits a later prompt to use the same queue.
- Explicit native selections and exclusions remain authoritative. Default replacement requires both builtin-owned edit and write tools. An extension-owned mutation tool does not enable the replacement; an explicit native edit/write whitelist retains those tools unless the patch tool is also selected.
- Supplemental patch observations 01–47 are in the [file evidence index](../../../packages/pi-codex-tools/test/fixtures/observed/files/index.json), with exact inputs, results, and before/after bytes. The [declaration comparison](../../../packages/pi-codex-tools/test/fixtures/observed/files/declaration-check.json) records the match with the frozen capture. These observations supplement the source contract; they do not prove that the current runtime is the historical captured runtime. The frozen contract remains unchanged.
- Validation after merging the image slice and raw-history deselection fix: all 96 package tests pass on the installed host dependency at 1.0.2. Package type checking, targeted lint, formatting, and whitespace checks pass.

## Remaining contract limits

The measured cases establish the implemented patch behavior. Every malformed grammar, Unicode edge case, and operating-system error diagnostic was not exhaustively observed, so universal behavioral equivalence is not claimed. Coordination covers this process and existing resolved symlink aliases; it does not prevent external filesystem races or provide rollback, atomic multi-file transactions, or undo.

This slice supports completed awaited calls. Retained execution remains blocked as recorded in ticket 03.
