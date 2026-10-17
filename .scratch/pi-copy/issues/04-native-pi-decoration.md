# 04: Copy from native Pi without chat

**What to build:** Installing copy alone adds the existing copy controls to native command/edit boxes and final assistant responses. Both plugins remain independently loadable after packaging and editable installation.

**Blocked by:** 03 — Install chat and copy independently.

**Status:** resolved

- [x] Native command, output, diff, and final-response controls preserve source text, empty/partial/error handling, feedback, and blank response separation.
- [x] Native components, transcript, editor, notices, and normal selection/copy behavior remain in use.
- [x] Native hooks attach only when no cooperating transcript owner is present and restore on reload, session replacement, and shutdown.
- [x] Native-only and combined interactions work through the real Pi host, including keyboard, mouse, resize, history, and pending-copy disposal.
- [x] Each packed plugin loads with the other package absent; both load orders preserve the existing combined behavior.
- [x] Run required checks, integrate the delta into main, explicitly register both editable packages in Pi, and remove task worktrees and branches.
- [x] Record actual verification and any physical-terminal or OS clipboard limits without treating earlier evidence as proof of this delta.

Published on 2026-10-17. The canonical [specification](../../../docs/specs/pi-copy.md) and [ADR 0029](../../../docs/adr/0029-copy-as-an-independent-extension.md) govern the delta.

## Implementation and verification

The native adapter decorates Pi's existing assistant and built-in bash/edit/write components. It reuses copy's controls, native panel mounting, source payloads, clipboard handling, and feedback. Its component and fullscreen selection/Find hooks restore on disposal; it unwraps the native heading cache before restoring the original renderer. The optional event agreement selects chat when present in either extension order.

A temporary real-Pi response probe first failed because copy alone had no footer, then passed after native attachment. Eight temporary assert-based native-host cases pass: exact Markdown and one blank display row, mouse and configured-key copying, current command output, native failure panels and raw edit patches, empty and partial payloads, clipboard failures, selection and Find exclusion, resize/history, regular/fullscreen switches, pending-copy disposal, retained multipart final phases, and disabling/re-enabling either plugin on reload. No repository tests were added.

The final implementation at `eabaf49` passed `node --test --test-concurrency=2 packages/pi-chat/test/*.test.ts packages/pi-codex-tools/test/workflow-presentation.test.ts`: 147/147, with no failures, skips, or cancellations. It also passed all eight temporary native probes. TypeScript (`tsc --noEmit -p tsconfig.json`), scoped oxlint, formatting, and whitespace checks pass on Pi/TUI 1.1.0. `npm pack --ignore-scripts` produced separate packages; four isolated real-host cases load and reload copy alone, chat alone, and both orders, with the other plugin absent in the single-plugin directories. The final native sources were repacked before repeating the four distribution checks.

Standards review against `f19521d`: no unresolved findings. The scoped native integration exception is explicit in ADR 0029; the duplicated structural contract is intentional and keeps the packages independent. The Copy ADR was numbered 0029 to preserve concurrently added quote-plugin work using 0028.

Spec review against `f19521d`: no unresolved implementation findings. Source payloads, the display-only separator, existing combined behavior, native decoration, independent loading, and lifecycle cleanup are covered by the checks above.

Both requested review agents and the merger failed before executing because the agent service rejected encrypted output (`invalid_request_body`). The primary agent performed the two review passes and integration directly; these are not independent-agent reviews. Recording-terminal and captured-clipboard checks do not verify physical-terminal rendering or OS clipboard transport. Native integration uses Pi 1.1.0 internals and needs compatibility verification after Pi updates.

## Integration and editable installation

On 2026-10-17 the integration branch was rebased against main and main was fast-forwarded to `faef6a6`, containing the verified implementation and review documentation. Concurrent quote-plugin edits and the earlier untracked UX notes were preserved. The temporary Git autostash was applied successfully and left no stash behind.

Both explicit editable commands succeeded: `pi install /Users/fran/Source/pi-packages/packages/pi-copy` and `pi install /Users/fran/Source/pi-packages/packages/pi-chat`. Pi's global settings contain exactly one local entry for each package. The installed Pi 1.1.0 `DefaultResourceLoader` loaded both main-checkout entry points exactly once, with zero extension errors. The obsolete chat-to-copy workspace symlink was removed. A running Pi session still needs `/reload`; live terminal interaction was not available for this check.

The three clean, integrated correction worktrees were archived through Codex and removed from disk. Their `codex/pi-copy-independent`, `codex/pi-copy-native`, and `codex/pi-copy-optional-chat` branches were deleted. `git worktree list` contains only main and no Copy task branch remains. The older `pi-copy-integration` app attachment is still stale: its checkout and branch are absent, and the archive tool rejects the attachment as owned by another task.
