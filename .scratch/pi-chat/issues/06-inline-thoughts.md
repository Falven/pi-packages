# 06: Show temporary thoughts inline

**What to build:** Follow a live thought at its own conversation position and reopen its content after the preview collapses.

**Blocked by:** 05: Scroll expanded tool groups within bounded bodies.

**Status:** done

- [x] Show a bounded following preview inline, never in a docked widget.
- [x] Use native thought/Markdown presentation and original source references, including adjacent thinking-block aggregation and otherwise-hidden native bodies.
- [x] Collapse the body to its disclosure when thinking ends and permit reopening in place.
- [x] Reuse disclosure keyboard/pointer controls, selection geometry, and bounded viewport routing.
- [x] Retain exact occurrence ownership through stream updates, resize, native invalidation, and replay.
- [x] Verify thought growth, completion, reopening, scrollback, selection, and native renderer transformations through the real host.

**Evidence:** Eight real-host cases in `packages/pi-chat/test/inline-thoughts.test.ts` cover native hidden-body materialization, bounded following and scrolled anchors, unchanged Markdown transforms while scrolling, adjacent-run aggregation, separate thought occurrences, pointer and keyboard reopening, cancellation/reload, Unicode copy through offscreen body rows, automatic fold selection clearing, scrollback placement, streaming prompt navigation, and native message replacement splitting a thinking run without losing final text. Responses scripts exercise Pi's actual early `thinking_end`; interleaved Completions text remains live until its parser reports completion.

Merged ticket 07 before verification. Native semantic markers now attach to split activity rows without replacing focusable controls; final text retains its native trailing notices. Group, tool, thought, and work disclosures share the existing selector/copy/page dispatch. Hidden thought presenters are materialized only when their body is shown. No conversation content, model controls, dependencies, or native Pi source changed.

**Validation:** `node --test packages/pi-chat/test/*.test.ts test/native-host.test.ts` passed 66/66. Direct repository TypeScript checking, scoped oxlint, oxfmt checking, and `git diff --check` passed. Physical terminal acceptance remains pending under ticket 12; recording-terminal checks do not establish real terminal rendering or OS clipboard behavior.
