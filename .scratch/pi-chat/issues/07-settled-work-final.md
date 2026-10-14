# 07: Fold settled work while keeping the final response visible

**What to build:** Fold the agent's work for an actually delivered request while every user message, unrelated standalone extension notice, and final response remains visible in native order, including identical progress and final text.

**Blocked by:** 04: Group and toggle consecutive tool calls; the correction delta in 02: Display native conversations in the owned chat view.

**Status:** done

- [x] Observe actual initial prompt and steering/follow-up drain objects without changing calls/returns; certify delivery only at message start and join committed entries after native persistence.
- [x] Delivered steering continues the current work and separates activity groups; a delivered follow-up starts new work and a new answer relationship. Keep every user message visible in closed work, and restore agent activity around it in source order when expanded, including after reload.
- [x] Keep exactly one neutral blank line between the last retained user-message bar and the final response, including split final content and reload, without doubling native spacing.
- [x] For providers without final-phase evidence, select the qualifying terminal assistant message text as one final response only after work settles; do not infer prose boundaries.
- [x] Keep the selected final occurrence outside folded earlier work, including duplicate strings, while preserving native content and source order.
- [x] Honor explicit expansion choices; work folding is independent of group/tool state, and selection or scroll position does not defer automatic collapse.
- [x] Cancellation or absence of a qualifying final leaves work expanded; do not invent boundaries for uncertain historical relationships.
- [x] Show `Worked for <minutes>m <seconds>s` with a trailing `▶` when closed or `▼` when open at the normal terminal font size and line height, using native delivery and completion timestamps; retain the settled duration across reload.
- [x] Give the header a muted label and native thin bottom divider, with blank lines above and below and no background; underline only the focused label.
- [x] Verify ordinary, identical queued, steering, follow-up, cleared/consumed input, partial/error/cancellation, and duplicate-answer scenarios through real provider requests and visible frames.

Correction delta:

- [x] Compose known work with its selected final across positively identified standalone extension notices that have no established work membership; do not infer ownership from text, arrival time, or the current request.
- [x] Keep retained users and notices in one native-ordered sequence when work closes, restore activities around those same rows when it opens, and preserve visible notices as tool-group boundaries.
- [x] Avoid empty work accordions when only retained rows remain. Choose final-response spacing from the last retained visible row, preserving the neutral gap when that row is a user-message bar without adding a second gap after an intervening notice.
- [x] Preserve actual request, history, and compaction boundaries; stop at a different known work or unidentified message row, and leave notices after the selected final response in place.
- [x] Keep execution status owned by its native tool presenter and preserve that component's fold choices through updates. Do not add a reader for earlier standalone execution journals, new relationship metadata, or a cross-package ownership protocol.
- [x] Extend existing native-host cases for live insertion, replay/reload, interleaved steering/notices, notice-only content, trailing notices, and boundary preservation; retain existing cancellation, manual-fold, source-preservation, and lifecycle behavior.

Earlier completed criteria and verification below describe the baseline. This correction changes presentation composition only; persisted relationship semantics from ticket 08 remain unchanged. Combined acceptance with the separately revised native execution renderer belongs to ticket 12.

Real-host tests cover identical progress and final text, native user-message replacement, steering and follow-up delivery, cleared or consumed input, batched follow-ups, cancellation before and after agent-end, empty/error/length outcomes, explicit tool inspection, independent work and tool choices, and automatic folding while selecting scrollback. Terminal text parts form one final answer; thoughts remain in work, native trailing notices remain visible, and native prompt navigation is retained. Historical work without observed relationships stays unfolded.

After the header and user-visibility changes, all 116 chat tests passed on Pi 1.1.0 and 1.0.2. Updated existing cases verify elapsed time through reload, muted header and divider spacing, focus underline, visible steering in closed work, exactly one neutral gap before a split final response, expanded source order, and native image reservation rows. TypeScript, repository lint, formatting, and diff checks passed; no test cases or files were added.

Relationship persistence and provider-phase evidence remain tickets 08 and 09. Physical-terminal acceptance is pending; this ticket verifies recorded native frames, input, provider bodies, persisted content, and clipboard boundaries.

Correction verification (2026-10-14):

- Extended three existing native-host cases; no new test cases, files, fixtures, dependency, persisted metadata, or tool-package changes. The duplicate-answer case appends a native custom entry after both equal `Done` occurrences are visibly streaming. It verifies a closed work header, exactly one visible final occurrence, a retained intervening notice, expanded source order, and replay without duplicates. Interleaved steering verifies notices before and after the retained user row, final spacing determined by the final notice, and reload. The trailing-notice case verifies its position across a later request, notice-only work without an empty accordion, and reload.
- Red before composition change: the streaming custom entry prevented the work header and left both equal `Done` occurrences visible. A separate temporary experiment removed only ticket 02's `addCustomEntryToChat` wrapper while retaining the corrected composition; the same displayed-text-synchronized case failed identically. Restoring that wrapper and composition passed. Neither experiment asserted private maps or changed source content.
- On coherent Pi 1.1.0, `node --test packages/pi-chat/test/work-history.test.ts packages/pi-chat/test/phase-final.test.ts` passed 38/38, including existing cancellation, inspection, uncertain-history, different-request, branch/fork, compaction, and phase-final scenarios. After tightening the insertion waits to displayed streaming text, `node --test --test-name-pattern='settled work hides|identical delivered steering|standalone native message' packages/pi-chat/test/work-history.test.ts` passed 3/3. Scoped `oxlint`, `oxfmt`, root `tsc --noEmit -p tsconfig.json`, and `git diff --check` passed.
- Limits: no new direct regression inserts a notice between otherwise consecutive tool calls or manufactures an unidentified native row. Existing group composition remains unchanged, and unknown rows still stop the work scan. Combined acceptance for the separately revised native execution renderer, broader correction lifecycle coverage, and physical-terminal verification remain ticket 12. Pi 1.0.2 and the full chat suite were not run in this implementer worktree.
