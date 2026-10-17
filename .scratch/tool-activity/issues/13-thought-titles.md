# 13: Thought titles without body leakage

**What to build:** Keep current operation labels, otherwise show the latest actual thought title already present as an activity heading. Never promote body prose to status. Fit the fullscreen native indicator to one line with an ellipsis and restore its full label when space becomes available.

**Blocked by:** 11: Working labels from current activity; 12: Verify working label parity (both complete).

**Status:** complete at implementation revision `fc33210` on `main`, from `e338ecf`.

- [x] Recheck the installed desktop selector's input and single-line display, and reproduce the reported title/body mismatch.
- [x] Correct the glossary, ADRs, specification, and reference record without claiming the earlier helper comparison established visual parity.
- [x] Reuse existing activity-heading extraction; retain a complete title across body streaming, incomplete later headings, and thinking/message completion.
- [x] Preserve operation priority, `Thinking` fallback, final-answer visibility, request/session reset, Hide thinking, and canonical source/Find behavior.
- [x] Fit labels in existing fullscreen dock layout for embedded and standalone native indicators, including narrow/wide resize and terminal-cell width.
- [x] Update existing real-host cases, run affected suites on Pi 1.0.2 and 1.1.0, and complete static checks.
- [x] Review standards and specification, record exact evidence and limits, and leave no new task branch or worktree.

**Reference:** [Specification](../../../docs/specs/tool-activity.md), [source record](../../../docs/plans/working-label-parity.md), and ADRs [0013](../../../docs/adr/0013-transcript-activity-order-and-inline-thoughts.md) and [0022](../../../docs/adr/0022-native-rows-in-an-owned-transcript.md).

**Reproduction:** The reported saved thought's actual heading is `Auditing project requirements`. The previous selector chose its 467-character body paragraph; the native loader rendered it as five rows at 120 columns. The updated existing Hide thinking case fails on the old implementation because unheaded body prose appears as status instead of `Thinking`. Log: `/tmp/pi-thought-title-red.log`.

**Scope:** No new package, settings, prompts, generated title, model call, tool behavior, or cross-package dependency. Keep the current checkout on `main` following the user's completed branch/worktree cleanup.

**Verification (2026-10-16, `fc33210`):**

- `node --test packages/pi-chat/test/*.test.ts packages/pi-codex-tools/test/workflow-presentation.test.ts` passes 141/141 on Pi 1.0.2 and 141/141 on Pi 1.1.0, with no failures, skips, or cancellations. Logs: `/tmp/pi-thought-title-1.0.2-final.log` and `/tmp/pi-thought-title-1.1.0.log`.
- The existing paused thought case passes after failing on the old implementation. It now covers an incomplete first title, a long body, code and inline emphasis, a later incomplete title, title retention, native embedded/standalone placement, 24/60-column resize, Hide thinking, completion, reset, and reload. The wider run exposed two former assertions expecting body text in status; their corrected expectations preserve the original scroll/cancellation/source checks. Focused file run: 8/8, `/tmp/pi-thought-title-focused.log`.
- An assert-based check against the reported saved thought selects `Auditing project requirements`, renders one native text row at 120 columns, and leaves the source unchanged. Log: `/tmp/pi-thought-title-capture.log`. No thought body was copied into this ticket or a new fixture.
- `./node_modules/.bin/tsc --noEmit -p tsconfig.json` passes on both hosts. Logs: `/tmp/pi-thought-title-types-final.log` and `/tmp/pi-thought-title-types-1.1.0.log`.
- Repository `./node_modules/.bin/oxlint .`, `./node_modules/.bin/oxfmt --check .`, and `git diff --check` pass. Logs: `/tmp/pi-thought-title-lint-final.log` and `/tmp/pi-thought-title-format.log`.
- The compatibility host and all 11 declared extension Pi/TUI imports resolve one Pi 1.1.0 tree. All 284 tracked package/fixture files match the checkout. Logs: `/tmp/pi-thought-title-compat-identity.log` and `/tmp/pi-thought-title-snapshot.log`.

**Standards review:** An independent read-only review found no documented-standard violation or actionable smell. It checked reuse of the existing heading extractor, source preservation, package independence, dependency removal, and the native width calculation within the accepted host adapter.

**Specification review:** A separate independent read-only review found no missing behavior, scope creep, or incorrect implementation. It verified complete-title selection, partial-title retention, unchanged operation/lifecycle rules, and both native padding calculations against installed Pi. Both reviewers ran the diff whitespace check; host suites and static checks were run by the integrating agent.

**Cleanup and limits:** The temporary Pi 1.1.0 compatibility fixture is removed; logs remain in `/tmp`. No branch or worktree was created. No physical-terminal or live desktop UI comparison, live-model trial, unrelated package suite, or performance measurement was run. Fullscreen status fitting is covered on the two stated host versions; native regular-mode layout remains Pi-owned.
