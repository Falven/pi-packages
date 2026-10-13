# 11: Find and reveal retained pre-compaction content

**What to build:** Find original retained content that Pi omitted from its current compaction-aware display and inspect it in source order.

**Blocked by:** 10: Find and reveal content inside closed folds.

**Status:** done

- [x] Extend source search to retained pre-compaction entries in the active branch and ancestry, without loading sibling branches or discarded content.
- [x] Materialize absent rows through native historical presenters at their source-ordered positions without changing Pi session projection or model context.
- [x] Historical tool presentation must not execute tools, start speculative previews, clear live pending tools, or populate editor history.
- [x] Keep hidden-thought rendering and current effective renderer/theme environments correct for materialized rows.
- [x] Apply live native output-padding changes to detached historical presenters through their available setters. Preserve Pi's native rebuild behavior where used and materialize search hits with current settings after a rebuild.
- [x] Verify retained/pre-compaction reasoning follows native Hide thinking and only the selected Find occurrence is temporarily revealed, with reveal cleanup and canonical preservation.
- [x] Reuse source references and cached presenters with proper invalidation/cleanup; do not keep another conversation buffer.
- [x] Verify original hidden message/thought/tool hits, live work during reveal, source ordering, owning-call highlighting, and absence of execution side effects through the native host.

After the scrollbar and padding corrections, `node --test packages/pi-chat/test/*.test.ts` passed 116/116 against each of Pi 1.1.0 and 1.0.2, with no failures, cancellations, or skips. Modified retained-user, thought, and tool cases verify live padding changes alongside native Markdown transformations, temporary Find reveal and cleanup, unchanged editor history, and no extra provider requests. Pi 1.0.2 retains its own fixed tool inset; Pi 1.1.0's native tool padding follows the setting.
