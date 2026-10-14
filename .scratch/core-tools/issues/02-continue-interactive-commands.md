# 02: Continue interactive commands across prompts

**What to build:** Start a command that remains running, receive its process session identifier, and continue it through input or polling on later calls and ordinary prompts in the same extension session.

**Specification:** [Core toolset](../spec.md).

**Blocked by:** 01 — Execute a command through the complete model loop.

**Status:** resolved — process continuation slice; full contract remains blocked

- [x] Expose and execute the captured `write_stdin` contract through the existing orchestration and public dispatch path.
- [x] Support both pipes and an explicitly requested PTY, with accurate input delivery, output, completion status, and process session identifier behavior.
- [x] Verify a command that yields while still running, receives input, produces several output chunks, and completes. Its yield deadline must not kill it.
- [x] Poll with omitted or empty input and return incremental output without replaying chunks. Preserve the command APIs' optional fields and token-count meaning.
- [x] Establish the exact empty-poll default and out-of-range wait behavior against the fixed baseline. The declared 5,000–300,000 ms range alone is not an exact default or clamp algorithm.
- [x] Preserve effective shell settings, prefix, current context, environment, hooks, result processing, and native execution events on the complete interaction.
- [x] Bound output, preserve UTF-8 decoding and trailing output, and retain captured truncation behavior. Keep any necessary spill files private.
- [x] Keep process handles available across ordinary prompts in the same active extension session. Treat invalid, completed, and stale identifiers according to the verified contract.
- [x] Exercise cancellation and normal session shutdown/reload, including owned child cleanup and retained partial output. Do not restore live handles from history or create a survival daemon.
- [x] Verify the full request/tool/next-request interaction with real controlled processes through the existing host fixture, including nonzero completion and a failed input/poll call.

## Implementation evidence

The process manager owns independent pipe or native PTY processes and private output spill files. It retains no execution context. Each input or poll uses the current parent call's public dispatch, hooks, result processing, and events. Input delivery and collection serialize together per process. Concurrent final polls drain once; the next queued poll sees an unknown handle.

Running results contain a signed 32-bit process identifier and omit `exit_code`. Completed results contain `exit_code` and omit `session_id`; collecting completion retires the handle. Pipe input is closed. A failed nonempty write to a completed pipe preserves unread output for a later empty poll. A completed PTY ignores late input and returns its unread final output. The measured interrupt result is exit code 1 with `^C` output.

The frozen declarations remain unchanged. Supplemental public-interface observations establish these timing rules:

| Call                                      | Default wait | Effective range  |
| ----------------------------------------- | ------------ | ---------------- |
| `exec_command`                            | 10,000 ms    | 250–30,000 ms    |
| `write_stdin` with nonempty input         | 250 ms       | 250–30,000 ms    |
| `write_stdin` with omitted or empty input | 5,000 ms     | 5,000–300,000 ms |

Values clamp to the stated bounds. Negative waits and budgets, and fractional numeric arguments, fail validation; number schemas with `multipleOf: 1` prevent the native integer converter from rounding fractional input. Each call has the declared 10,000-token output default. New output is counted and truncated using the established UTF-8 behavior. Changing the budget between polls does not discard unread bytes. Spill directories are mode 0700 and their files mode 0600.

The real-host checks cover repeated input across ordinary prompts, empty polling, concurrent input and polling, nonzero completion, invalid and stale identifiers, output budgets, split UTF-8, private spill files, policy blocking and edits, redaction, current-parent events, selection and exclusion, active-poll cancellation, reload, and normal shutdown. Cleanup awaits owned shells and their waiting children. The installed-package check also launches a PTY from `node_modules`.

After merging the completed command, patch, and image slices, all 114 package tests pass. The package type check, lint, formatting check, and `git diff --check` pass. Timing tests directly exercise the 10-second command default, 250 ms input minimum, 5-second empty default/minimum, and 30-second command/input maximum. The 300-second empty-poll maximum is directly measured in the reference evidence; it is not repeated as a five-minute host test.

Evidence is retained in the [command index](../../../packages/pi-codex-tools/test/fixtures/observed/commands/index.json). Relevant indexed cases are `command-long-waits.json`, `command-pty-boundaries.json`, `empty-poll-upper-bound.json`, `command-input-validation.json`, `post-exit-handles.json`, `concurrent-process-polls.json`, `concurrent-process-input.json`, and `pty-interrupt.json`. The [dependency probe](../../../packages/pi-codex-tools/test/fixtures/observed/commands/pty-dependency-gate.json) is a separate unindexed observation. These supplemental observations do not establish the runtime build identity of the frozen capture.

## Dependency and remaining limits

`node-pty` is pinned to 1.2.0-beta.15. The published 1.1.0 terminal helper lacks its executable bit on the tested platform. The pinned release ships it as 0755 and loads and spawns on Node 26.8.1, macOS arm64, without install scripts, runtime permission changes, or build-approval settings. Real input, EOF, terminal dimensions, and exit 7 pass the dependency gate. Source-build fallback and other platforms or runtime versions remain unverified.

Process continuation is independent of the blocked execution-cell work in ticket 03. The outer script deadline still reports unavailable retained execution and cancels pending calls. Long polls require a sufficient outer script budget. No old execution context, daemon, or history-based handle restoration is added.

Explicit cancellation retains processed partial output and complete native nested-call records. Normal quit also preserves the active call's partial output and awaits owned processes, but the installed host's direct runtime disposal omits that call's nested summary after invalidation. This native behavior is not repaired with synthetic history. Output produced while no call is collecting it is cleared during session cleanup; already returned results remain in history.

The separate [native-host session replacement observations](../../../packages/pi-codex-tools/test/fixtures/observed/commands/session-replacement.json) passed six cases at `5507b77`: new, resume, and fork, each with an idle handle and an active poll. Owned shell and child processes stopped before replacement returned; stale handles failed, fresh commands worked, and completed files remained. Active polls retained their partial output and complete nested-call records. The evidence records native history behavior and the persistence comparison projection. It verifies process lifecycle only; retained execution cells remain blocked by ticket 03, and ticket 06 owns complete mixed workflows.
