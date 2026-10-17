# 16: Enforce enclosing disclosure eligibility through live and session lifecycles

**What to build:** Keep earlier activity collapsible only when its turn has a qualifying final and is uncancelled. Preserve deliberate inspection, restored preferences, descendant choices, and final/source visibility through live changes and session lifecycles.

**Blocked by:** None (can start immediately).

**Status:** resolved — implemented and integrated into local main at `f53480f`; installed Pi 1.1.0 verification and both independent reviews pass. Both task branches and worktrees are removed.

- [x] Qualifying streaming finals collapse earlier activity by default while leaving the final visible; individual keyboard/pointer and configured global choices remain effective only while eligible.
- [x] Cancellation or revoked final qualification reveals activity and removes its enclosing header despite previous closure. Focus returns to the composer when that header disappears.
- [x] Requalification of the same activity restores its retained open/closed preference. Descendant group, item, and native-output choices survive parent disappearance; global actions still set descendants without overwriting an unavailable parent's preference.
- [x] Explicit child inspection prevents only default collapse. Find records an explicit open choice even during ineligibility, and later eligible closure still works. Scrolling, selection, and header focus create no hold.
- [x] A blank final qualifies only with exact phase and explicit provider item completion evidence. Unfinished blank replacement revokes qualification. Preserve the exact source boundary and native notices without fabricated text or collapse across uncertain history.
- [x] Valid partial finals remain eligible after non-cancellation errors. Retry discards stale phase evidence, late cancellation follows actual settlement facts, and idle abort does not retroactively cancel successful settlement.
- [x] No-phase providers retain settlement-based selection without prose inference. Replay/reload/fork/branch reconstruct reliable relationships, leave uncertainty visible, and reset memory-only choices at existing lifecycle boundaries without changing relationship storage.
- [x] Equal text and multiple provider items retain exact occurrence identity, source order, user messages, native notices, canonical session content, and subsequent model input. No empty enclosing disclosure appears.
- [x] Demonstrate the superseded cancellation/revocation behavior failing before runtime changes, then verify the matrix through the existing real-Pi host on installed Pi 1.1.0 only. Retain Find, lifecycle, combined-workflow, and collapsed-boundary scrolling coverage.
- [x] Required typecheck, lint, changed/new and tracked-file formatting, whitespace checks, and independent standards/specification reviews pass. Integrate into local main, record actual verified code SHA/results/limits, and remove every task-owned temporary branch/worktree.

**Specification:** The approved chat specification and existing ADRs 0014, 0015, 0017, and 0022 govern this delta. The source/scope record distinguishes the ordinary reference mode and Pi's supported final evidence.

**Historical context:** Chat 07, 08, 09, 12, and 14 retain their completion evidence. In particular, this supersedes Chat 07's independent-manual-closure policy from `9f57ab9`; earlier results do not validate this delta.

**Verification limits:** The sole primary boundary uses the real Pi host with a recording terminal and scripted provider. It establishes emitted terminal output and behavior, not physical-terminal interaction, desktop pixels, every Codex mode, or other Pi versions. The user approved installed-version-only verification and one combined ticket.

## Completion evidence

Starting main was `cbf6ffac013f10b6b2a227804d076a4556bd248d`. The implementation was rebased onto concurrent copy/header work and fast-forwarded into local main at `f53480f9b4d1ad3b4a0b7bc924a597b9a44e20d5`. The integrated execution and review target was `d5c4f15d0cfb7ef5522a93096c9ff5c60287d334`; the final rebase changed only copy-verification documentation. Runtime, tests, fixtures, and configuration are identical between those revisions. The subsequent copy-closure documentation at `3741f50` is preserved.

The existing cancellation and phase-revocation assertions first failed against the superseded behavior. Completed-blank and Find-during-revocation cases also failed before their runtime slices were implemented. A native-notice boundary failure was corrected before the final checks. Coverage retains exact provider-item identity, source order, canonical content/model input, no-phase settlement, partial-final errors, retry, cancellation timing, requalification, child states, Find, focus recovery, replay/reload/fork/branch, uncertain history, and the collapsed-boundary scrolling regression.

| Check                                                                                                                         | Result                                                             |
| ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `node --test packages/pi-chat/test/phase-final.test.ts packages/pi-chat/test/agent-activity.test.ts`                          | 44/44 passed on the implementation revision `8602309`.             |
| `node --test packages/pi-chat/test/source-search.test.ts`                                                                     | 27/27 passed on `8602309`.                                         |
| `node --test --test-concurrency=2 packages/pi-chat/test/*.test.ts packages/pi-codex-tools/test/workflow-presentation.test.ts` | 147/147 passed at `d5c4f15`; no failures, cancellations, or skips. |
| `./node_modules/.bin/tsc --noEmit -p tsconfig.json`                                                                           | Passed at `d5c4f15`.                                               |
| `./node_modules/.bin/oxlint .`                                                                                                | Passed at `d5c4f15`.                                               |
| Changed-file formatting and `git ls-files -z \| xargs -0 ./node_modules/.bin/oxfmt --check`                                   | Passed; all 423 tracked files formatted.                           |
| `git diff --check` and full task-delta whitespace check                                                                       | Passed.                                                            |

All delta runs used Node `v26.8.1` and one coherent installed Pi 1.1.0 native dependency tree. Repository dependency declarations and installed Pi source were unchanged. Independent **Standards** review: zero actionable findings. Independent **Spec** review: zero actionable findings. Both reviewed the original pinned-base comparison and task-only delta with concurrent changes identified separately.

The managed archive requests returned `queued` without removing either checkout. A complete two-branch Git bundle was saved and verified before Git removed the clean task worktrees and branches. The implementation patch was compared with the integrated patch; only concurrent Copy response assertions differ. No task-owned branch, checkout, or worktree wrapper directory remains. Other work was left to its owners, the comparison report retains its original hash, and nothing was pushed. The [source and scope record](../../../docs/plans/agent-activity-collapse-parity.md) records recovery paths, hashes, logs, and exact ownership.

Physical-terminal interaction, live Codex desktop behavior/pixels, other Codex modes, other Pi versions, and the full repository test suite were not checked for this delta. These are outside the approved verification scope; earlier evidence keeps its original scope.
