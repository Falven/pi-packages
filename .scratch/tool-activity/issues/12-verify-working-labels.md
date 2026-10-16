# 12: Verify working label parity

**What to build:** Verify the working-label correction together with the existing activity display, and record the delivered behavior and actual limits in the ADRs, specification, and tickets.

**Blocked by:** 11: Working labels from current activity (complete).

**Status:** complete at implementation revision `4e27987` on `codex/generic-tool-activity`, from `bf30b7a`.

- [x] Existing chat and combined-workflow suites pass against both established Pi host versions.
- [x] The reference's reasoning-line extraction, current-operation priority, fallback, and confirmed-final suppression match observable native indicator text.
- [x] Typecheck, lint, formatting, and diff checks pass; operator wording and package independence remain intact.
- [x] Standards and specification reviews resolve actionable findings and identify any unavailable independent review or physical app check.
- [x] Documents and tickets record the implementation revision, exact checks, reference pin, and verification limits; this delta's temporary compatibility fixture is removed.

**Reference:** [Working label source record](../../../docs/plans/working-label-parity.md). This verifies the current delta from `bf30b7a`; it does not reopen earlier activity acceptance or claim all desktop features are implemented.

**Verification (2026-10-16):**

- Pi 1.0.2 and Pi 1.1.0: `node --test packages/pi-chat/test/*.test.ts packages/pi-codex-tools/test/workflow-presentation.test.ts` passes 141/141 on each, without skips or cancellations. Logs: `/tmp/pi-working-label-1.0.2-final.log` and `/tmp/pi-working-label-1.1.0-final.log`.
- The final review preserved the existing unrelated-provider check for failure updates after the agent ends. Its additional assertion verifies that those updates do not revive the indicator. `node --test packages/pi-chat/test/activity.test.ts` then passes 8/8 on each host. Logs: `/tmp/pi-working-label-activity-final-1.0.2.log` and `/tmp/pi-working-label-activity-final-1.1.0.log`. Runtime code did not change after the full runs.
- The actual installed desktop reasoning function and bundled CommonMark helpers match all 1,409 comparison inputs. The source record pins the archive assets and capture procedure. Log: `/tmp/pi-working-label-reference.log`.
- Typechecking passes on both hosts: `pnpm typecheck` in the checkout and `./node_modules/.bin/tsc --noEmit -p tsconfig.json` in the compatibility fixture. Logs: `/tmp/pi-working-label-types-final.log` and `/tmp/pi-working-label-types-1.1.0-final.log`.
- Repository `pnpm lint`, `pnpm format:check`, and `git diff --check` pass. Logs: `/tmp/pi-working-label-lint.log` and `/tmp/pi-working-label-format.log`. Scoped formatting also passes after the final activity assertion.
- `npm pack --dry-run --ignore-scripts --json` includes the selector and operator configuration. Record: `/tmp/pi-working-label-pack.json`. No package was published.

**Regression evidence:** The old implementation failed the paused plain-reasoning check with `Working` (`/tmp/pi-working-label-red.log`). The first wider run caught both non-cloneable configuration functions and a thought label leaking alongside a confirmed final answer. Plain text templates and the existing final-phase signal resolve those failures. Existing thought/body, final-phase correction, Find, cancellation, reload, and combined-core-tool cases pass without changing their source-preservation requirements.

**Standards review:** Direct review of `bf30b7a..4e27987` found no remaining actionable finding. The selector consumes the existing validated activity items, uses Pi's public working-message/visibility setters, and reuses the existing native phase-reconciliation hook. The packages remain independent. Configuration is plain data; obsolete heading output is removed. Standard CommonMark libraries replace the need for a second custom Markdown recognizer. There are no new prompts, tool declarations, execution changes, settings, extension packages, or protocol fields.

**Spec review:** Direct review covers current-slice boundaries, latest-running exploration priority, source ordering, late operation updates, read/skill/search/list/edit/command labels, latest usable reasoning, partial Markdown/comments, `Thinking` fallback, confirmed-final suppression, and lifecycle reset. Native thought visibility and disclosure choices remain independent. The after-agent-end failure update check was retained rather than moving all late-update coverage into an active request. No remaining scoped finding was identified.

**Environment and cleanup:** The first compatibility setup mixed Pi 1.1.0 with package-local 1.0.2 peers. The final fixture resolved the host, host TUI, and every extension's Pi/TUI imports to 1.1.0 before the passing runs. All source and test files were compared with the checkout. That temporary fixture was removed; logs and the source extraction remain in `/tmp`. The earlier unused managed worktree still returns `queued` from the app's archive tool; Ticket 09 retains its open cleanup item.

**Limits:** The reference helper failed before analysis with the runtime's encrypted-output decoding error; independent agent review was unavailable, so both review axes were performed directly. These checks use real Pi with a recording terminal and controlled provider. Physical-terminal acceptance, a live desktop UI comparison, unrelated package suites, live-model trials, and performance measurements were not performed. Native animation/placement and app-only connector, visualization, environment, and planning states are outside this delta.
