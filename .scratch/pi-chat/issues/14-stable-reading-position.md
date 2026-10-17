# 14: Preserve reading position past collapsed agent activity

**What to build:** Let users wheel or page past a collapsed “Worked for” section and continue reading its final response without jumping backward. Preserve ordinary focus, selection, resize, growth, and follow-end behavior.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] Reproduce the collapsed-boundary jump through the existing real-Pi native-host seam before changing runtime code.
- [ ] Keep repeated layout positions distinct and stable across redraws so scrolling into the answer cannot restore an earlier spacer.
- [ ] Verify continued scrolling with the disclosure focused, with answer text selected, and with focus returned to the composer, without introducing a focus or selection workaround.
- [ ] Preserve independent disclosures, source content, native wheel/page/scrollbar handling, reading anchors through resize and growth, and following an already followed end.
- [ ] Extend an existing host case, run the affected checks on Pi 1.0.2 and 1.1.0, and complete repository static checks; add no test seam, file, or case.
- [ ] Complete separate standards and specification reviews, record verification limits, integrate into `main`, and remove the task branches and worktrees.

**Specification:** [Chat specification](../../../docs/specs/pi-chat.md), especially stories 115–120 and the collapsed-boundary regression. ADRs [0021](../../../docs/adr/0021-bounded-render-group-scrolling.md) and [0022](../../../docs/adr/0022-native-rows-in-an-owned-transcript.md) retain native scrolling and distinct displayed positions.

**Diagnosis:** A temporary native-Pi reproduction advanced through scroll positions 1–5, then restored position 3 as the blank row after the header reached the top. The same spacer occupied positions 3 and 6; restoration selected its first occurrence. The jump also occurred with answer text selected and after returning focus to the composer. Giving those two placements distinct identities in the temporary reproduction allowed positions 1–8 in order while the header retained focus. Scrollbar dragging skipped the ambiguous row. These diagnostic changes were not retained in runtime code.

**Scope:** One complete correction in chat composition and its existing native-host coverage. No new package, configuration, tool behavior, prompt, native Pi modification, nested viewport, or anchor framework. The existing seam and this narrow delta are already authorized by the user's instruction to implement the diagnosed fix. Preserve unrelated working-tree files.

**Verification:** Pending implementation. Recording-terminal evidence must not be described as physical-terminal acceptance.
