# 14: Preserve reading position past collapsed agent activity

**What to build:** Let users wheel or page past a collapsed “Worked for” section and continue reading its final response without jumping backward. Preserve ordinary focus, selection, resize, growth, and follow-end behavior.

**Blocked by:** None (can start immediately).

**Status:** resolved — implemented and verified at `3b08a9a`, integrated into `main`; task branches and worktree removed.

- [x] Reproduce the collapsed-boundary jump through the existing real-Pi native-host seam before changing runtime code.
- [x] Keep repeated layout positions distinct and stable across redraws so scrolling into the answer cannot restore an earlier spacer.
- [x] Verify continued scrolling with the disclosure focused, with answer text selected, and with focus returned to the composer, without introducing a focus or selection workaround.
- [x] Preserve independent disclosures, source content, native wheel/page/scrollbar handling, reading anchors through resize and growth, and following an already followed end.
- [x] Extend an existing host case, run the affected checks on Pi 1.0.2 and 1.1.0, and complete repository static checks; add no test seam, file, or case.
- [x] Complete separate standards and specification reviews, record verification limits, integrate into `main`, and remove the task branches and worktrees.

**Specification:** [Chat specification](../../../docs/specs/pi-chat.md), especially stories 115–120 and the collapsed-boundary regression. ADRs [0021](../../../docs/adr/0021-bounded-render-group-scrolling.md) and [0022](../../../docs/adr/0022-native-rows-in-an-owned-transcript.md) retain native scrolling and distinct displayed positions.

**Diagnosis:** A temporary native-Pi reproduction advanced through scroll positions 1–5, then restored position 3 as the blank row after the header reached the top. The same spacer occupied positions 3 and 6; restoration selected its first occurrence. The jump also occurred with answer text selected and after returning focus to the composer. Giving those two placements distinct identities in the temporary reproduction allowed positions 1–8 in order while the header retained focus. Scrollbar dragging skipped the ambiguous row. These diagnostic changes were not retained in runtime code.

**Scope:** One complete correction in chat composition and its existing native-host coverage. No new package, configuration, tool behavior, prompt, native Pi modification, nested viewport, or anchor framework. The existing seam and this narrow delta are already authorized by the user's instruction to implement the diagnosed fix. Preserve unrelated working-tree files.

**Implementation:** `40dcdd1` gives spacing before and after the agent-activity header, and before a split final response, separate stable component identities. Anchor restoration, focus handling, selection, and native scrolling remain unchanged. `3b08a9a` strengthens the same existing host case to cross the boundary separately in each focus/selection condition and confirm native copying retains the selected answer text.

**Verification:** The existing case failed on the original runtime at wheel step 5, returning to the header (`/tmp/chat-anchor-red.log`). Its final focused run passed (`/tmp/chat-anchor-three-modes.log`). On the integrated source at `3b08a9a`, `node --test --test-concurrency=2 packages/pi-chat/test/*.test.ts packages/pi-codex-tools/test/workflow-presentation.test.ts` passed 141/141 on each of Pi 1.0.2 and 1.1.0, with no failures, cancellations, or skips (`/tmp/pi-chat-scroll-1.0.2.log`, `/tmp/pi-chat-scroll-1.1.0.log`). Existing cases cover page/scrollbar navigation, expansion, growth, resize, and follow-end behavior. The Pi 1.1.0 compatibility copy matched all 284 tracked package and fixture files; every declared host import resolved to the same physical Pi 1.1.0 installation. Repository dependency files were not changed.

Both host typechecks (`tsc --noEmit -p tsconfig.json`), repository lint (`oxlint .`), tracked-file formatting (`git ls-files -z | xargs -0 ./node_modules/.bin/oxfmt --check`), and `git diff --check` passed. The unrestricted `oxfmt --check .` command flags only the pre-existing untracked `.scratch/pi-chat-codex-ux-comparison-2026-10-16.md`; that file remains unchanged. Independent standards and specification reviews of the delta from `c25614c` reported no findings.

**Integration and cleanup:** Cherry-picked the verified commits into `main` with `--ff`, preserving their identities and matching the verified tree. Removed the managed implementation checkout, both task branches, and the temporary Pi 1.1.0 compatibility copy. Only `main` and the primary Git worktree remain; nothing was pushed.

**Limits:** No physical-terminal acceptance or unrelated package suite was run. Recording-terminal evidence establishes emitted output and native-host behavior, not physical-terminal pixels or input.
