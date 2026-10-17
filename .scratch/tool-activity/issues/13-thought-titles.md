# 13: Thought titles without body leakage

**What to build:** Keep current operation labels, otherwise show the latest actual thought title already present as an activity heading. Never promote body prose to status. Fit the fullscreen native indicator to one line with an ellipsis and restore its full label when space becomes available.

**Blocked by:** 11: Working labels from current activity; 12: Verify working label parity (both complete).

**Status:** in progress on `main`, from `e338ecf`.

- [x] Recheck the installed desktop selector's input and single-line display, and reproduce the reported title/body mismatch.
- [x] Correct the glossary, ADRs, specification, and reference record without claiming the earlier helper comparison established visual parity.
- [ ] Reuse existing activity-heading extraction; retain a complete title across body streaming, incomplete later headings, and thinking/message completion.
- [ ] Preserve operation priority, `Thinking` fallback, final-answer visibility, request/session reset, Hide thinking, and canonical source/Find behavior.
- [ ] Fit labels in existing fullscreen dock layout for embedded and standalone native indicators, including narrow/wide resize and terminal-cell width.
- [ ] Update existing real-host cases, run affected suites on Pi 1.0.2 and 1.1.0, and complete static checks.
- [ ] Review standards and specification, record exact evidence and limits, and leave no new task branch or worktree.

**Reference:** [Specification](../../../docs/specs/tool-activity.md), [source record](../../../docs/plans/working-label-parity.md), and ADRs [0013](../../../docs/adr/0013-transcript-activity-order-and-inline-thoughts.md) and [0022](../../../docs/adr/0022-native-rows-in-an-owned-transcript.md).

**Reproduction:** The reported saved thought's actual heading is `Auditing project requirements`. The previous selector chose its 467-character body paragraph; the native loader rendered it as five rows at 120 columns. The updated existing Hide thinking case fails on the old implementation because unheaded body prose appears as status instead of `Thinking`. Log: `/tmp/pi-thought-title-red.log`.

**Scope:** No new package, settings, prompts, generated title, model call, tool behavior, or cross-package dependency. Keep the current checkout on `main` following the user's completed branch/worktree cleanup.
