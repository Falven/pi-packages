# 09: Verify the activity alignment

**What to build:** The combined extensions show the reference command actions throughout streaming, execution, and retained history, with operator configuration and exact core tool declarations verified together.

**Blocked by:** 06: Configurable Codex command recognition; 07: Pending calls without premature activities; 08: Verbatim core tool guidance; 10: Process input without extra activities.

**Status:** in progress — tickets 06–08 are verified at `100316f` on `codex/generic-tool-activity`, from integration base `a6280f9`. The user also authorized Ticket 10's input/collection correction; final checks must include it. Managed-worktree archival remains queued in the app.

- [ ] All reference command cases and affected real-host workflows pass at the integration revision.
- [ ] Existing supported-host compatibility and required static checks pass, or actual limitations are recorded.
- [ ] Standards and specification reviews are completed and actionable findings resolved.
- [ ] Documents and ticket outcomes identify the delivered revision, exact evidence, and any unperformed physical-app checks.
- [ ] Temporary implementer worktrees are cleaned up and user-owned changes remain intact.

**Resolution:** Tickets 06–08 are integrated in the existing two packages. Command recognition targets Codex `0.162.0-alpha.17.2`, revision `740e5af33c71225640e0c1c1555c514c2c93ab74`, bundled with app `26.1007.71326`. No separate package or runtime knowledge between the extensions was added. Operator configuration affects presentation only; the scoped core declarations match their separate frozen reference.

**Verification (2026-10-16, `100316f`):**

- Pi 1.0.2: `node --test packages/pi-chat/test/*.test.ts packages/pi-codex-tools/test/*.test.ts` — 348/348 pass, with no failures, cancellations, or skips. Log: `/tmp/pi-activity-parity-final-1.0.2.log`.
- Pi 1.1.0 in an isolated temporary fixture: `node --test packages/pi-chat/test/*.test.ts packages/pi-codex-tools/test/workflow-presentation.test.ts` — 139/139 pass, with no failures, cancellations, or skips. Log: `/tmp/pi-activity-parity-final-1.1.0.log`. Host, public TUI, and extension-resolved TUI versions were checked in both environments.
- `pnpm typecheck` passes on both host versions. Logs: `/tmp/pi-activity-parity-final-types.log` and `/tmp/pi-activity-parity-final-types-1.1.0.log`.
- Repository `pnpm lint`, `pnpm format:check`, and `git diff --check` pass. Logs: `/tmp/pi-activity-parity-final-lint.log` and `/tmp/pi-activity-parity-final-format.log`.
- All 440 checked-in command vectors match the complete reference results. The original Rust parser/Bash tests pass 106/106. A deterministic differential run of 9,646 additional command vectors found no differences. [Provenance](../../../packages/pi-chat/test/fixtures/codex-command-reference.md) records the exact sources and capture procedure.
- Direct review reproduced missing rows for failed directory changes when the parser returns no actions. The app's display projection supplies a general command in that case. The shared display mapping now does the same for native and independently declared commands; public parser results remain unchanged. Red/green logs: `/tmp/pi-activity-empty-actions-red.log` and `/tmp/pi-activity-empty-actions-green.log`.
- The native streaming test's old placeholder expectation was replaced with the agreed absence of pending activity and correct later placement across commentary boundaries. The final full runs above include this check.

**Standards review:** Direct review of `git diff a6280f9...100316f` found no remaining actionable findings within the approved delta. Public host interfaces, the existing activity boundaries, and package independence are preserved. Local protocol types and binding rules intentionally overlap under ADR 0019. The port ships source attribution and the Apache-2.0 license; the parser uses the matching upstream grammar rather than a new shell interpreter.

**Spec review:** Direct review checked the complete parser results, shell metadata, configuration, skill identity, pending/dispatch transitions, native cancellation, retained unknown outcomes, Find, disclosure, both load orders, and complete outgoing core declarations. The empty-action display fallback found in review was repaired and verified. This establishes the scoped delta, not complete app parity.

**Later screenshot finding:** `chars="\\u0003"` requests Ctrl+C through `write_stdin`. Our non-terminal process path rejects nonempty input because stdin is closed; the failed tool and its outer script retain the same error in two contexts. The pinned Codex `write_stdin` handler returns errors to the model and sends successful interaction events using the original command identity. The installed app applies those events to that command, with no separate native `Called write_stdin` item. The same Codex build special-cases Ctrl+C for a non-terminal process by sending an interrupt signal. Our separate failure row and rejection of that interruption are confirmed remaining parity gaps. They require revisiting failure presentation and execution behavior beyond tickets 06–08; they are not covered by the parser or frozen-guidance checks. Source: [input handler](https://github.com/openai/codex/blob/740e5af33c71225640e0c1c1555c514c2c93ab74/codex-rs/core/src/tools/handlers/unified_exec/write_stdin.rs), [process manager](https://github.com/openai/codex/blob/740e5af33c71225640e0c1c1555c514c2c93ab74/codex-rs/core/src/unified_exec/process_manager.rs), and the installed asset recorded in the reference plan.

**Cleanup:** The unused, clean worktree `/Users/fran/.codex/worktrees/verbatim-tool-guidance/pi-packages` was submitted to the app's archive tool. The response remains `queued`, and removal has not been verified. User-owned files were not changed. The cleanup checkbox remains open until the app finishes.

**Limits:** Both independent review helpers failed before execution with `invalid_request_body` and encrypted-output decoding errors; the reviews above were performed directly. Physical-terminal acceptance, a live app comparison, unrelated package suites, live-model prompt trials, performance trials, and Windows-native path behavior were not verified. Earlier tickets retain their original revision evidence.
