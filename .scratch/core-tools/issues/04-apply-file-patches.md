# 04: Apply file patches through native dispatch

**What to build:** Preserve earlier operations in the same patch by recomputing each update from current file contents, and record the actual contents changed or deleted.

**Specification:** [Core toolset](../spec.md).

**Blocked by:** None for the patch-state correction; earlier prerequisites are resolved.

**Status:** resolved — patch-state correction verified; combined verification and review are recorded in ticket 07

## Patch-state correction — 2026-10-15

- [x] Keep whole-patch validation before writes and the existing public file mutation queues, including initial no-mutation failures and repeated-source-path validation.
- [x] Reread and recompute each update when it is applied. Preserve both changes through same-patch symlink aliases and move-then-update operations without rejecting supported overlaps.
- [x] On application-time read or match failure, retain earlier effects, report the current operation as failed and later operations as unattempted, and return the measured runtime error shape. Preserve cancellation around reads and writes.
- [x] Derive update, move, and delete facts from application-time contents. Refresh delete facts best-effort without preventing unlink of a now-dangling or unreadable target; omit unverifiable counts.
- [x] Reproduce the bug before the fix and verify final bytes, model results, and per-file facts through focused cases in the existing real-host test file. Preserve existing hook, redaction, queue, encoding, and partial-failure checks.
- [x] Keep public schemas, frozen fixtures, dependencies, presentation interfaces, and unrelated comparison findings outside this delta.

**Acceptance examples:** Given `left\nright\n`, an update of `left` to `LEFT` through the real path followed by `right` to `RIGHT` through its alias must leave `LEFT\nRIGHT\n`. Given source `from-a\ncommon\n` and destination `from-b\ncommon\n`, moving the source while changing `from-a` to `A`, then changing destination `common` to `B`, must leave `A\nB\n`. If the second operation instead requires text removed by the first, it fails after preserving the first operation; it must not write cached contents.

**Historical scope:** The preflight evidence below still establishes initial validation before writes. It does not establish that preflight snapshots are safe to write after another operation changes the same file. New evidence belongs to this delta and must retain the tested revision and runtime.

**Correction evidence (2026-10-15, `1c12b6a`, Node 26.8.1, installed Pi host 1.0.2):** The same-patch symlink regression failed before the fix with `left\nRIGHT\n`; it now leaves `LEFT\nRIGHT\n`. A move followed by an update leaves `A\nB\n`, and both successful cases return `{}` with actual per-file diffs. An application-time alias match failure retains the first edit, returns the measured runtime error string, and records completed/failed/unattempted operations. Deleting the source before an alias update exercises the measured read-error shape. A delete after an alias update records the current bytes; deleting a newly dangling alias succeeds without invented counts.

All 68 focused patch and patch-presentation checks pass at that revision. Root `tsc --noEmit`, changed-file `oxlint` and `oxfmt --check`, and `git diff --check` pass. The focused suite retains initial validation, hooks, redaction, queue, cancellation, encoding, and earlier partial-failure coverage. [Ticket 07](07-verify-contract-and-matched-trials.md) records the later full package run and independent combined review. The current native reference fails a delete of a newly dangling alias; this package follows the specified best-effort unlink behavior rather than claiming parity for that case.

## Activity-item delta — approved 2026-10-15

- [x] Capture per-file facts at mutation time, including stable identity, actual action/target, applicable detail content, and verified additions/deletions when available.
- [x] One patch can produce several independently disclosed edit items through the pi-chat adapter. Never repeat the full patch body in every file row.
- [x] Preserve completed files before a later failure and distinguish failed or unattempted changes from successful edits.
- [x] Retain all compact file descriptions beyond the previous sixteen-file window, with bounded bodies and unchanged mutation/model contracts.

**Revision evidence (2026-10-15, `f6004ab`):** Mutation-time patch facts retain stable per-file identity, actual action/target, individual status, and applicable content. Pi-chat projects separate file items with generic default expanded bodies. Completed files remain completed after later failure; failed and unattempted changes remain distinct. Counts come from verified prior/written content and bounded comparison; unavailable counts are omitted.

All compact file records survive the sixteen-body window. Omission belongs only to the affected file, not every sibling in the patch. Existing patch, patch-presentation, workflow, and chat cases passed; temporary probes covered 10,000-file bounded retention and per-file omission. The closing spec review verified the omission repair. Mutation and model-facing patch contracts are unchanged. Exact checks are in [ticket 07](07-verify-contract-and-matched-trials.md).

## Earlier revision

**Recorded status:** resolved — approved presentation delta verified through the native host; completed baseline retained below

**Original delivery:** Show readable patch actions, affected files, and actual success or failure inside the originating execution card while preserving real file effects and the existing returned patch contract.

## Presentation delta

- [x] Show compact patch action/status and expanded readable file-change outcomes within the parent card, using effective input after argument hooks and actual execution outcomes. Do not display JavaScript orchestration or raw result framing.
- [x] Represent creation, update, move, deletion, blocking, validation failure, and partial runtime failure accurately; never infer a successful file change merely from requested patch text.
- [x] Retain bounded presentation details through the existing public history mechanism while preserving raw input, result hooks, file coordination, cancellation, and exact model-visible patch results. Do not add a new diff viewer or parse arbitrary shell commands.
- [x] Use red-before-green real-host cases with temporary files to verify visible outcomes alongside actual file contents and the subsequent model request, including an argument replacement and a redacted result. Keep changes limited to this package.

## Presentation implementation evidence

- A real-host red check first reproduced generic patch names and repeated `{}` results without affected files. The green checks now show completed Add, Update, Move, and Delete outcomes inside the originating execution card, beside actual temporary-file contents and unchanged subsequent model results.
- Presentation records changes only after successful writes or deletions. A later failed write retains the earlier successful file outcome and omits unexecuted requests. A separate red-to-green self-move check preserves the measured write-then-delete behavior and presents both actual effects rather than implying that a destination remains.
- Public argument replacement determines the displayed effective path. Blocking and validation failures show their processed errors without claiming changes. Success-result and partial-failure redaction checks suppress stale file metadata while preserving actual file effects and the processed next request.
- Each patch retains at most sixteen bounded file-change previews and marks omitted earlier details. A real eighteen-file patch verifies the marker and unchanged file effects. Returned success remains `{}`; native dispatch, mutation queues, errors, cancellation, and model conversion remain unchanged.
- Verification on the workspace's Pi 1.0.2 host: all 69 checks in the focused patch, patch-presentation, and parent-presentation suites pass, including existing queued cancellation, permission, overlap, and symlink coordination cases. Package type checking, package lint, changed-file formatting, and whitespace checks pass. Live configured-terminal and restored-history integration remain ticket 06/07 verification work.

## Completed baseline

**Historical status:** resolved — patch slice; runtime evidence limits recorded below

The following criteria and evidence describe the previously completed core contract. This revision supersedes its visible routine-journal presentation; it does not authorize changes to Pi or the chat package.

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

This slice initially verified completed awaited calls. [Ticket 03](03-yield-and-resume-execution-cells.md) now implements retained execution, and [ticket 06](06-verify-mixed-native-workflows.md) verifies patch work after a yield with configured companions.
