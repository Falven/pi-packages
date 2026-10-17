# 16: Enforce enclosing disclosure eligibility through live and session lifecycles

**What to build:** Keep earlier activity collapsible only when its turn has a qualifying final and is uncancelled. Preserve deliberate inspection, restored preferences, descendant choices, and final/source visibility through live changes and session lifecycles.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] Qualifying streaming finals collapse earlier activity by default while leaving the final visible; individual keyboard/pointer and configured global choices remain effective only while eligible.
- [ ] Cancellation or revoked final qualification reveals activity and removes its enclosing header despite previous closure. Focus returns to the composer when that header disappears.
- [ ] Requalification of the same activity restores its retained open/closed preference. Descendant group, item, and native-output choices survive parent disappearance; global actions still set descendants without overwriting an unavailable parent's preference.
- [ ] Explicit child inspection prevents only default collapse. Find records an explicit open choice even during ineligibility, and later eligible closure still works. Scrolling, selection, and header focus create no hold.
- [ ] A blank final qualifies only with exact phase and explicit provider item completion evidence. Unfinished blank replacement revokes qualification. Preserve the exact source boundary and native notices without fabricated text or collapse across uncertain history.
- [ ] Valid partial finals remain eligible after non-cancellation errors. Retry discards stale phase evidence, late cancellation follows actual settlement facts, and idle abort does not retroactively cancel successful settlement.
- [ ] No-phase providers retain settlement-based selection without prose inference. Replay/reload/fork/branch reconstruct reliable relationships, leave uncertainty visible, and reset memory-only choices at existing lifecycle boundaries without changing relationship storage.
- [ ] Equal text and multiple provider items retain exact occurrence identity, source order, user messages, native notices, canonical session content, and subsequent model input. No empty enclosing disclosure appears.
- [ ] Demonstrate the superseded cancellation/revocation behavior failing before runtime changes, then verify the matrix through the existing real-Pi host on installed Pi 1.1.0 only. Retain Find, lifecycle, combined-workflow, and collapsed-boundary scrolling coverage.
- [ ] Required typecheck, lint, changed/new and tracked-file formatting, whitespace checks, and independent standards/specification reviews pass. Integrate into local main, record actual verified code SHA/results/limits, and remove every task-owned temporary branch/worktree.

**Specification:** The approved chat specification and existing ADRs 0014, 0015, 0017, and 0022 govern this delta. The source/scope record distinguishes the ordinary reference mode and Pi's supported final evidence.

**Historical context:** Chat 07, 08, 09, 12, and 14 retain their completion evidence. In particular, this supersedes Chat 07's independent-manual-closure policy from `9f57ab9`; earlier results do not validate this delta.

**Verification limits:** The sole primary boundary uses the real Pi host with a recording terminal and scripted provider. It establishes emitted terminal output and behavior, not physical-terminal interaction, desktop pixels, every Codex mode, or other Pi versions. The user approved installed-version-only verification and one combined ticket.
