# 07: Collapse settled agent activity while keeping the final response visible

**What to build:** Copy a settled final response as original Markdown from one action below the entire answer, preserving historical answer identity and native presentation.

**Blocked by:** 03: Component-copy delta, which supplies the shared local action and existing focus-path integration.

**Status:** ready-for-agent

## Final-response-copy delta — approved 2026-10-16

- [ ] Reuse existing settlement, final-message/part recognition, and stable source identities. Show exactly one Copy response action for a settled turn with a recognized final answer; no action for an unfinished or unrecognized answer.
- [ ] Place the action below the whole answer, left aligned and outside collapsible work. Preserve original Markdown and all selected final text parts in source order using the existing text joining convention; exclude thoughts, commentary, tool output, elapsed summaries, and controls.
- [ ] An older answer continues copying itself after newer turns, source reveal, and native reconstruction. Do not call the global last-response handler or infer boundaries from prose.
- [ ] Reuse command/edit action interaction, feedback, native clipboard/error behavior, focus, selection exclusion, narrow layout, and lifecycle cleanup. No new shortcut, framework, source content, or persisted metadata.
- [ ] Extend existing real-Pi final/phase/history cases with a captured clipboard boundary. Preserve global selection-copy, Find, automatic/manual disclosure, user/notice ordering, cancellation, session replacement, and no-final behavior. Add no test case, file, or seam.

The accepted spec and ADRs 0014, 0015, and 0022 govern this delta. Combined supported-host evidence belongs to Chat 12. Earlier completed evidence below remains historical.

## Prior native-flow revision

**What to build:** Include every available enclosing agent activity disclosure in native global expansion and closure while preserving final-response visibility and automatic-collapse eligibility.

**Blocked by:** 04: Group and toggle consecutive activity items.

**Status:** resolved — enclosing disclosure behavior implemented in `9f57ab9`

## Native-flow and disclosure delta — approved 2026-10-15

- [x] An explicit configured native app.tools.expand action expands or collapses all available disclosure levels, including the enclosing Worked for… agent activity block, render groups, activity items, and native output bodies. Ctrl+O remains only Pi’s default binding.
- [x] Explicit individual and global disclosure choices take precedence over automatic collapse eligibility. Cancellation, an unfinished request, or no qualifying final response must not undo a user’s explicit collapse of an available disclosure; without an explicit choice, preserve the existing automatic behavior.
- [x] Individual agent activity closure/reopening preserves descendant disclosure choices; a global action explicitly sets all available levels. Preserve choices across redraw, growth, settlement, settings reconstruction, and resize with the existing in-memory/reload lifetime.
- [x] Keep final responses, retained user messages, unrelated notices, source order, Hide thinking, delivery/phase boundaries, history, elapsed summaries, cancellation outcomes, and image ownership intact. Do not invent disclosures for activity with no available representation or add persisted policy for future turns.
- [x] Update existing real-Pi host cases for the configured/remapped action, all-level expansion/closure, explicit precedence during streaming/cancellation/missing-final scenarios, and unchanged no-choice automatic behavior. Reuse existing cases and fixture only; add no test cases, files, or provider contracts.

**Revision evidence (2026-10-15, `9f57ab9`):** The existing native expansion action applies to every available enclosing header as well as groups, items, and native output. Explicit choices precede automatic eligibility, and an explicitly chosen existing header remains available after its selected final is revoked. No new shortcut, enumeration API, setting, or policy for future turns was introduced.

The existing real Pi 1.0.2 host cases demonstrated the failures before the changes, then passed configured/remapped expansion, manual ancestor choices, retained steering/follow-up headers, streaming and cancellation, final revocation, settings reconstruction, resize, and reload. Unchosen missing-final/error/cancellation cases retain their automatic behavior. The final three affected files pass 71/71; typecheck, scoped lint/format, and whitespace checks pass. No test cases, files, fixtures, or provider contracts were added. Combined primary-runtime and physical-terminal acceptance remain in Chat 12/Core 06.

These approved criteria supersede conflicting presentation/default-state requirements in earlier revisions. Earlier status, completed checklists, and evidence below remain historical; they do not validate this delta. Accepted decisions: ADRs 0014, 0015, and 0019–0022.

## Prior accepted revision and evidence

**What to build:** Collapse the agent's activity for an actually delivered request while every user message, unrelated standalone extension notice, and final response remains visible in native order, including identical progress and final text.

**Blocked by:** 04: Group and toggle consecutive tool calls; the correction delta in 02: Display native conversations in the owned chat view.

**Status:** done

- [x] Observe actual initial prompt and steering/follow-up drain objects without changing calls/returns; certify delivery only at message start and join committed entries after native persistence.
- [x] Delivered steering continues the current agent activity and separates render groups; a delivered follow-up starts new agent activity and a new answer relationship. Keep every user message visible in collapsed agent activity, and restore agent activity around it in source order when expanded, including after reload.
- [x] Keep exactly one neutral blank line between the last retained user-message bar and the final response, including split final content and reload, without doubling native spacing.
- [x] For providers without final-phase evidence, select the qualifying terminal assistant message text as one final response only after agent activity settles; do not infer prose boundaries.
- [x] Keep the selected final occurrence outside collapsed earlier agent activity, including duplicate strings, while preserving native content and source order.
- [x] Honor explicit expansion choices; agent activity collapsing is independent of group/tool state, and selection or scroll position does not defer automatic collapse.
- [x] Cancellation or absence of a qualifying final leaves agent activity expanded; do not invent boundaries for uncertain historical relationships.
- [x] Show `Worked for <minutes>m <seconds>s` with a trailing `▶` when collapsed or `▼` when expanded at the normal terminal font size and line height, using native delivery and completion timestamps; retain the settled duration across reload.
- [x] Give the header a muted summary and native thin bottom divider, with blank lines above and below and no background; underline only the focused summary.
- [x] Verify ordinary, identical queued, steering, follow-up, cleared/consumed input, partial/error/cancellation, and duplicate-answer scenarios through real provider requests and visible frames.

Correction delta:

- [x] Compose known agent activity with its selected final across positively identified standalone extension notices that have no established agent activity membership; do not infer ownership from text, arrival time, or the current request.
- [x] Keep retained users and notices in one native-ordered sequence when agent activity closes, restore activities around those same rows when it opens, and preserve visible notices as render group boundaries.
- [x] Avoid empty agent activity disclosures when only retained rows remain. Choose final-response spacing from the last retained visible row, preserving the neutral gap when that row is a user-message bar without adding a second gap after an intervening notice.
- [x] Preserve actual request, history, and compaction boundaries; stop at agent activity for a different known turn or unidentified message row, and leave notices after the selected final response in place.
- [x] Keep execution status owned by its native tool presenter and preserve that component's disclosure choices through updates. Do not add a reader for earlier standalone execution journals, new relationship metadata, or a cross-package ownership protocol.
- [x] Extend existing native-host cases for live insertion, replay/reload, interleaved steering/notices, notice-only content, trailing notices, and boundary preservation; retain existing cancellation, manual-disclosure, source-preservation, and lifecycle behavior.

Earlier completed criteria and verification below describe the baseline. This correction changes presentation composition only; persisted relationship semantics from ticket 08 remain unchanged. Combined acceptance with the separately revised native execution renderer belongs to ticket 12.

Real-host tests cover identical progress and final text, native user-message replacement, steering and follow-up delivery, cleared or consumed input, batched follow-ups, cancellation before and after agent-end, empty/error/length outcomes, explicit tool inspection, independent agent-activity and tool disclosure choices, and automatic collapsing while selecting scrollback. Terminal text parts form one final answer; thoughts remain in agent activity, native trailing notices remain visible, and native prompt navigation is retained. Historical agent activity without observed relationships stays expanded.

After the header and user-visibility changes, all 116 chat tests passed on Pi 1.1.0 and 1.0.2. Updated existing cases verify elapsed time through reload, muted header and divider spacing, focus underline, visible steering in collapsed agent activity, exactly one neutral gap before a split final response, expanded source order, and native image reservation rows. TypeScript, repository lint, formatting, and diff checks passed; no test cases or files were added.

Relationship persistence and provider-phase evidence remain tickets 08 and 09. Physical-terminal acceptance is pending; this ticket verifies recorded native frames, input, provider bodies, persisted content, and clipboard boundaries.

Correction verification (2026-10-14):

- Extended three existing native-host cases; no new test cases, files, fixtures, dependency, persisted metadata, or tool-package changes. The duplicate-answer case appends a native custom entry after both equal `Done` occurrences are visibly streaming. It verifies a collapsed agent activity header, exactly one visible final occurrence, a retained intervening notice, expanded source order, and replay without duplicates. Interleaved steering verifies notices before and after the retained user row, final spacing determined by the final notice, and reload. The trailing-notice case verifies its position across a later request, notice-only agent activity without an empty disclosure, and reload.
- Red before composition change: the streaming custom entry prevented the agent activity header and left both equal `Done` occurrences visible. A separate temporary experiment removed only ticket 02's `addCustomEntryToChat` wrapper while retaining the corrected composition; the same displayed-text-synchronized case failed identically. Restoring that wrapper and composition passed. Neither experiment asserted private maps or changed source content.
- On coherent Pi 1.1.0, `node --test packages/pi-chat/test/agent-activity.test.ts packages/pi-chat/test/phase-final.test.ts` passed 38/38, including existing cancellation, inspection, uncertain-history, different-request, branch/fork, compaction, and phase-final scenarios. After tightening the insertion waits to displayed streaming text, `node --test --test-name-pattern='settled agent activity hides|identical delivered steering|standalone native message' packages/pi-chat/test/agent-activity.test.ts` passed 3/3. Scoped `oxlint`, `oxfmt`, root `tsc --noEmit -p tsconfig.json`, and `git diff --check` passed.
- Integration follow-up: ticket 12 extends existing cases for a notice between otherwise consecutive tool calls, a public native warning without source identity, retained-only steering/notices, branch/fork and compaction boundaries, and late native renderer invalidation. The complete correction passes all 116 chat tests on each of Pi 1.1.0 and 1.0.2, with no remaining standards or spec review finding. Ticket 12 records combined acceptance for the separately revised native execution renderer and the earlier pending physical-terminal checks.
