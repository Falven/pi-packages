# 02: Separate the response copy footer

**What to build:** Every settled final response has one blank display row before its Copy response control, while copied Markdown and all extracted copy behavior remain identical.

**Blocked by:** 01: Extract chat copy behavior.

**Status:** resolved

- [x] Guarantee exactly one blank boundary row before Copy response after prose, lists, and code blocks, reusing existing rendered separation instead of stacking blank rows.
- [x] Preserve the gap through redraw, narrow layouts, resize, history reload, and multipart finals. Keep eligible empty-final and absent-final behavior unchanged.
- [x] Preserve copied Markdown byte for byte, including source newlines; keep controls, feedback, and the separator outside conversation source and provider inputs.
- [x] Preserve pointer and keyboard access, selection/Find exclusion, focus recovery, response identity, panel placement for other actions, and pending-copy cleanup.
- [x] Strengthen existing final-response host checks and record a failing spacing assertion before the layout fix, then passing behavior through the accepted seam.
- [x] Run the affected chat and combined-workflow suites and required static checks. Resolve actionable Standards and Spec review findings before integration.
- [x] Record exact verification and integration evidence, mark both tickets resolved when accepted behavior is verified, and preserve unrelated work during main integration and task-worktree cleanup.

**Contract:** [pi-copy specification](../../../docs/specs/pi-copy.md). This ticket depends on the extracted controls so spacing is implemented against the final package interface; it adds no separate test host or new product capability.

## Comments

Published as `ready-for-agent` on 2026-10-17. The user accepted display spacing and unchanged clipboard payloads in the preceding discussion.

## Verification

Implemented at `a83094c3c4e2c76ae7ac5a3c2cb437acfe9d2df2`, following extraction at `9e3ded2`. Chat reuses an existing blank boundary row or prepends one to the response control's layout rows. The added row shares the control's selection exclusion and stable identity; the copy click target and keyboard reveal start at the label. Source Markdown and provider content are unchanged.

The existing final-phase host case first failed on the missing blank row (`spacing-red.log`). Strengthened existing cases then passed for prose, a multipart list ending, a code-block ending with source newlines, transformed output with existing separation, narrow resize, reload, historical actions, pointer isolation, selection across the separator, and exact clipboard bytes. No test cases, files, or fixtures were added. The full run exposed two expected geometry changes: the image footer moved one row, and an older heading left a crowded viewport. The existing checks now assert the new separator coordinate and provide enough viewport height to retain the source-order assertion; both passed before the final full run.

On Node v26.8.1 and installed Pi/TUI 1.1.0, the final affected suite passed **147/147**, with no failures, cancellations, or skips, in 50.879 seconds. Workspace typecheck, scoped lint, changed-file formatting, and whitespace checks passed. Both final tarballs passed manifest/source checks, and packed chat loaded packed copy through Pi's public extension loader in an isolated installation. The lockfile adds only the copy workspace dependency and importer; external versions are unchanged.

Commands:

```sh
node --test --test-name-pattern='reused sparse provider slots' packages/pi-chat/test/phase-final.test.ts
node --test --test-concurrency=2 --test-name-pattern='reused sparse provider slots|all terminal text parts|mixed live agent activity' packages/pi-chat/test/phase-final.test.ts packages/pi-chat/test/agent-activity.test.ts packages/pi-chat/test/mixed-session.test.ts
node --test --test-concurrency=2 --test-name-pattern='a standalone native message after the final|native images crop once' packages/pi-chat/test/agent-activity.test.ts packages/pi-chat/test/bounded-render-groups.test.ts
node --test --test-concurrency=2 packages/pi-chat/test/*.test.ts packages/pi-codex-tools/test/workflow-presentation.test.ts
node_modules/.bin/tsc --noEmit -p tsconfig.json
node_modules/.bin/oxlint packages/pi-copy packages/pi-chat/src/native-host.ts packages/pi-chat/src/tool-adapters/built-in.ts packages/pi-chat/test/phase-final.test.ts packages/pi-chat/test/agent-activity.test.ts packages/pi-chat/test/mixed-session.test.ts packages/pi-chat/test/bounded-render-groups.test.ts
pnpm --dir packages/pi-copy pack --pack-destination /tmp/pi-copy-evidence-We82Yx/packages-final
pnpm --dir packages/pi-chat pack --pack-destination /tmp/pi-copy-evidence-We82Yx/packages-final
git diff --check
```

## Standards review

The primary agent reviewed `git diff 527d74bad94ebe50edc553f7eab44edfd30bbeaf...a83094c` and connected callers against the user's coding rules, README, glossary, ADRs, and the code-review skill's smell baseline. No remaining code findings. Documentation now distinguishes the completed working-row revision from the copy delta and clarifies that chat's independence from tool providers does not prohibit its copy-library dependency.

## Spec review

The primary agent checked the same diff against the copy spec and both tickets. The four controls, payload formatting, normalization, clipboard execution, feedback, and cleanup have one package owner. Chat retains final recognition, source/occurrence identity, panel placement, focus, selection, Find, and lifecycle. The only intentional behavior change is the display separator. No remaining implementation findings.

Both requested review agents failed at startup with `Encrypted function output content could not be decrypted or decoded.` The implementer agents had the same runtime failure; the primary agent completed the ticket worktrees, integration, and separate review passes directly. These were not independent reviews. Physical-terminal rendering, OS clipboard transport, other Pi versions, and the full repository behavioral suite were not checked.

## Integration

The accepted documents (`021f1e1`), extraction (`9e3ded2`), and spacing (`a83094c`) were integrated into local `main` without rewriting the tested commits:

```sh
git cherry-pick --ff 527d74bad94ebe50edc553f7eab44edfd30bbeaf..a83094c3c4e2c76ae7ac5a3c2cb437acfe9d2df2
pnpm install --frozen-lockfile --ignore-scripts --offline
node --test --test-concurrency=2 --test-name-pattern='declared command actions|reused sparse provider slots|all terminal text parts' packages/pi-chat/test/activity.test.ts packages/pi-chat/test/phase-final.test.ts packages/pi-chat/test/agent-activity.test.ts
```

The frozen install passed. Main resolves copy inside its own checkout, its package sources and lockfile match the tested commit exactly, and the three focused cases passed again on main in 4.872 seconds. Detailed logs and packed artifacts are under `/tmp/pi-copy-evidence-We82Yx/`. No push or package publication was performed.

All three task branches (`codex/pi-copy-extraction`, `codex/pi-copy-response-spacing`, and `codex/pi-copy-integration`) and their checkouts were removed. Git now lists only the main checkout and main branch. The app archived the two ticket worktrees. Two queued archive attempts left the clean integration checkout present, so it was removed with `git worktree remove` after confirming every commit was on main; its branch was deleted normally with `git branch -d`. Any empty task worktree parent directories were removed. No forced removal or branch deletion was needed.

The app still lists a stale integration-worktree attachment even though the checkout no longer exists. The computer-use tool denied Codex access for safety reasons, so that UI entry could not be cleared through the available tools. This is an app metadata limitation; the Git worktree and branch are gone.

SHA-256 checks confirm both unrelated untracked files, `.scratch/pi-chat-codex-ux-comparison-2026-10-17.md` and `.scratch/pi-chat-ux-evidence-2026-10-17.md`, are unchanged. The final documentation closure changes no runtime or test sources beyond the verified `a83094c` revision.
