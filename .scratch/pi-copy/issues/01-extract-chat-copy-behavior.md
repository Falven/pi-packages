# 01: Extract chat copy behavior

**What to build:** Chat installs and uses the new pi-copy dependency for every existing command, output, diff, and response copy control. Users retain identical payloads, placement, navigation, feedback, and cleanup while copy behavior has one package owner.

**Blocked by:** None (can start immediately).

**Status:** resolved

- [x] All four existing copy controls use the new package, including payload formatting, native output normalization, clipboard writes, feedback, and disposal.
- [x] Copy has no dependency on chat or its full native host. Chat retains semantic classification, source identity, final recognition, layout, focus, selection, Find, and lifecycle integration through a small interface.
- [x] Preserve command/output/diff placement, backgrounds, padding, narrow layouts, exact retained payloads, final-part selection, historical identity, and disabled/partial behavior.
- [x] Preserve pending/success/error handling, status ownership, pointer capture, keyboard navigation, selection exclusion, reading anchors, and disposal during clipboard work.
- [x] Chat resolves the package through its dependency and exported interface in the workspace and packed artifacts, without a separate extension installation or changed external dependency versions.
- [x] Reuse existing real-Pi host and combined-workflow checks as the behavior baseline and verify the extraction; complete relevant typecheck, lint, formatting, distribution, and whitespace checks.
- [x] Record exact commits, checks, results, and limits. Response spacing remains for ticket 02; no extra behavior is introduced here.

**Contract:** [pi-copy specification](../../../docs/specs/pi-copy.md). The current chat and combined-presentation tests are the accepted testing seam. Keep the extraction as one complete slice; splitting classes from their call sites would leave an unusable intermediate state.

## Comments

Published as `ready-for-agent` on 2026-10-17. Existing resolved chat copy tickets establish prior behavior but do not verify this extraction.

## Verification

The copy controls, heading composition, payload formatting, native bash normalization, clipboard execution, feedback ownership, and disposal now live in pi-copy. Chat keeps semantic source projection, final recognition, panel mounting, navigation, selection, and Find geometry. Its five host hooks expose current theme/padding, input, rendering, and status; no chat dependency or full native host crosses into copy. Response spacing is unchanged in this ticket.

On Node v26.8.1 with installed Pi/TUI 1.1.0, the three focused command/final/multipart host cases passed before extraction and after extraction. The complete chat and combined-presentation run passed **147/147**, with no failures, cancellations, or skips, in 51.479 seconds. Workspace typecheck, scoped lint, changed-file formatting, and whitespace checks passed. An initial lint finding about a this alias was fixed with direct callbacks before the final run.

Commands:

```sh
node --test --test-concurrency=2 --test-name-pattern='declared command actions|reused sparse provider slots|all terminal text parts' packages/pi-chat/test/activity.test.ts packages/pi-chat/test/phase-final.test.ts packages/pi-chat/test/agent-activity.test.ts
node --test --test-concurrency=2 packages/pi-chat/test/*.test.ts packages/pi-codex-tools/test/workflow-presentation.test.ts
node_modules/.bin/tsc --noEmit -p tsconfig.json
node_modules/.bin/oxlint packages/pi-copy packages/pi-chat/src/native-host.ts packages/pi-chat/src/tool-adapters/built-in.ts
node_modules/.bin/oxfmt --check packages/pi-copy packages/pi-chat/src/native-host.ts packages/pi-chat/src/tool-adapters/built-in.ts packages/pi-chat/package.json README.md
git diff --check
pnpm install --lockfile-only --ignore-scripts --offline
pnpm --dir packages/pi-copy pack --pack-destination /tmp/pi-copy-evidence-We82Yx/packages
pnpm --dir packages/pi-chat pack --pack-destination /tmp/pi-copy-evidence-We82Yx/packages
```

Distribution checks inspected both tarballs, confirmed chat's workspace dependency became version 0.1.0, and loaded packed chat with packed copy through Pi's public native extension loader in an isolated installation. Existing peer dependencies supplied the runtime; no package was published. The lockfile change adds only the workspace copy dependency and importer, with no external version changes.

Detailed logs and extracted artifacts are under `/tmp/pi-copy-evidence-We82Yx/`. No test case or fixture was added or changed for this extraction. The requested implementer subagent failed at startup with a runtime decryption error, following failed exploration attempts; the primary agent completed the same ticket in its dedicated worktree. Physical-terminal rendering, OS clipboard transport, other Pi versions, and the full repository behavioral suite were not checked. Ticket 02 owns the remaining visual change and final review.

Extraction was committed as `9e3ded2` after the accepted documents in `021f1e1`. Both commits and the response-spacing implementation `a83094c` were integrated into local `main` with a fast-forward cherry-pick. [Ticket 02](02-separate-response-copy-footer.md) records final validation, review, and cleanup for the complete delta.
