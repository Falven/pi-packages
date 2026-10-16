# 09: Verify the activity alignment

**What to build:** The combined extensions show the reference command actions throughout streaming, execution, and retained history, with operator configuration and exact core tool declarations verified together.

**Blocked by:** 06: Configurable Codex command recognition; 07: Pending calls without premature activities; 08: Verbatim core tool guidance; 10: Process input without extra activities.

**Status:** verification complete at `fbc8030` on `codex/generic-tool-activity`, from integration base `a6280f9`. Tickets 06–08 and 10 are implemented and verified. Only managed-worktree archival remains queued in the app.

- [x] All reference command cases and affected real-host workflows pass at the integration revision.
- [x] Existing supported-host compatibility and required static checks pass, or actual limitations are recorded.
- [x] Standards and specification reviews are completed and actionable findings resolved.
- [x] Documents and ticket outcomes identify the delivered revision, exact evidence, and any unperformed physical-app checks.
- [ ] Temporary implementer worktrees are cleaned up and user-owned changes remain intact.

**Resolution:** Tickets 06–08 and 10 are integrated in the existing two packages. Command recognition and the non-terminal Ctrl+C exception target Codex `0.162.0-alpha.17.2`, revision `740e5af33c71225640e0c1c1555c514c2c93ab74`, bundled with app `26.1007.71326`. Input/collection calls and raw script errors create no operation rows. Actual failed commands remain visible, and exact errors remain in model results and retained-source Find. No separate package or runtime knowledge between the extensions was added. Operator configuration affects presentation only; the scoped core declarations match their separate frozen reference.

**Verification (2026-10-16, `fbc8030`):**

- Pi 1.0.2: `node --test packages/pi-chat/test/*.test.ts packages/pi-codex-tools/test/*.test.ts` — 351/351 pass, with no failures, cancellations, or skips. Log: `/tmp/pi-activity-fbc8030-1.0.2.log`.
- Pi 1.1.0 in an isolated temporary fixture: `node --test packages/pi-chat/test/*.test.ts packages/pi-codex-tools/test/workflow-presentation.test.ts` — 141/141 pass, with no failures, cancellations, or skips. Log: `/tmp/pi-activity-fbc8030-1.1.0.log`. Host, public TUI, and extension-resolved TUI versions were checked in both environments.
- `pnpm typecheck` passes on both host versions. Logs: `/tmp/pi-activity-fbc8030-types.log` and `/tmp/pi-activity-fbc8030-types-1.1.0.log`.
- Repository `pnpm lint`, `pnpm format:check`, and `git diff --check` pass. Logs: `/tmp/pi-activity-fbc8030-lint.log` and `/tmp/pi-activity-fbc8030-format.log`.
- All 440 checked-in command vectors match the complete reference results. The original Rust parser/Bash tests pass 106/106. A deterministic differential run of 9,646 additional command vectors found no differences. [Provenance](../../../packages/pi-chat/test/fixtures/codex-command-reference.md) records the exact sources and capture procedure.
- Direct review reproduced missing rows for failed directory changes when the parser returns no actions. The app's display projection supplies a general command in that case. The shared display mapping now does the same for native and independently declared commands; public parser results remain unchanged. Red/green logs: `/tmp/pi-activity-empty-actions-red.log` and `/tmp/pi-activity-empty-actions-green.log`.
- The native streaming test's old placeholder expectation was replaced with the agreed absence of pending activity and correct later placement across commentary boundaries. The final full runs above include this check.
- Five input/error cases failed before the correction and passed after it: `/tmp/pi-process-input-red.log` and `/tmp/pi-process-input-green.log`. They cover exact Ctrl+C against a real non-terminal process group, ordinary closed-stdin rejection, caught and uncaught errors, unknown handles, original operation ownership, actual exit status, Find, reload, and both extension orders.
- The first full runs at `6499536` exposed two older mixed-workflow assertions expecting an Error row. Updated assertions preserve all operation/image/disclosure checks and inspect the collected error through Find after reload. Both repaired cases pass on both hosts and in the final full runs above. Logs: `/tmp/pi-process-input-mixed-1.0.2.log` and `/tmp/pi-process-input-mixed-1.1.0.log`.
- All 91 local Markdown links in the changed documents resolve. `npm pack --dry-run --ignore-scripts --json` confirms that the chat package includes configuration, parser sources, NOTICE, and the Apache-2.0 license. Package metadata: `/tmp/pi-chat-pack-parity.json`. No package was published.

**Standards review:** Direct review through `git diff a6280f9...fbc8030` found no remaining actionable findings within the approved delta. Public host interfaces, the existing activity boundaries, and package independence are preserved. Local protocol types and binding rules intentionally overlap under ADR 0019. The port ships source attribution and the Apache-2.0 license; the parser uses the matching upstream grammar rather than a new shell interpreter. The input correction reuses process-group signaling, preserves serialized collection and rejection values, and removes obsolete error-publication code.

**Spec review:** Direct review checked complete parser results, shell metadata, configuration, skill identity, pending/dispatch transitions, native cancellation, retained unknown outcomes, Find, disclosure, both load orders, and complete outgoing core declarations. It also checked non-terminal Ctrl+C, absence of input/script-result activities, real command failures, and error retention through collection and reload. The empty-action display fallback and outdated mixed-workflow assertions were repaired and verified. This establishes the scoped delta, not complete app parity.

**Screenshot finding resolved:** `chars="\u0003"` requests Ctrl+C through `write_stdin`. Our earlier non-terminal path rejected it as closed stdin and displayed the tool error with repeated outer-script context. The pinned Codex build interrupts that process and associates input with the original command, without a separate native `Called write_stdin` item. Ticket 10 repairs both gaps at `6499536`; `fbc8030` completes the mixed-workflow assertions. Source: [input handler](https://github.com/openai/codex/blob/740e5af33c71225640e0c1c1555c514c2c93ab74/codex-rs/core/src/tools/handlers/unified_exec/write_stdin.rs), [process manager](https://github.com/openai/codex/blob/740e5af33c71225640e0c1c1555c514c2c93ab74/codex-rs/core/src/unified_exec/process_manager.rs), and the installed asset recorded in the reference plan.

**Earlier evidence:** Tickets 06–08 passed 348/348 affected-package cases on Pi 1.0.2 and 139/139 compatibility cases on Pi 1.1.0 at `100316f`. Their logs remain `/tmp/pi-activity-parity-final-1.0.2.log` and `/tmp/pi-activity-parity-final-1.1.0.log`. Those counts predate Ticket 10 and are not its acceptance evidence.

**Cleanup:** The task-owned Pi 1.1.0 fixture was removed after verification; logs remain in `/tmp`. The unused, clean worktree `/Users/fran/.codex/worktrees/verbatim-tool-guidance/pi-packages` was submitted to the app's archive tool. The response remains `queued`, and removal has not been verified. User-owned files were not changed. The cleanup checkbox remains open until the app finishes.

**Limits:** Both independent review helpers failed before execution with `invalid_request_body` and encrypted-output decoding errors; the reviews above were performed directly. Physical-terminal acceptance, a live app comparison, unrelated package suites, live-model prompt trials, performance trials, and Windows-native path behavior were not verified. Earlier tickets retain their original revision evidence.
