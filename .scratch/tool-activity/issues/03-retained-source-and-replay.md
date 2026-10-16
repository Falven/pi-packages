# 03: Retained source and replay

**What to build:** Reliable operation facts survive reload, while original calls and results remain discoverable even when normal activity has no row. See the [specification](../../../docs/specs/tool-activity.md).

**Blocked by:** 02: Command continuation without receipt rows.

**Status:** resolved — implemented at `4e271b8` on `codex/generic-tool-activity`.

- [x] Find indexes original arguments and processed results of zero-item calls and temporarily reveals their native source presenter.
- [x] Leaving the hit or closing Find removes that reveal without running tools or changing retained/model content.
- [x] Replay chooses the latest reliable operation revisions on the active branch; stale running work is unknown and no resources are recreated.
- [x] Invalid processed metadata cannot revive discarded journal bodies; older history remains usable through generic fallback.
- [x] Both extension load orders, standalone use, relevant package checks, and standards/spec review are recorded with honest verification limits.

**Resolution:** Find uses the existing native presenter to reveal a selected source with zero normal activity items. Real-host checks cover original arguments/results, closing Find, reload, pre-compaction history, session switching, and forks without new execution or model requests. Complete result snapshots and later operation revisions reconcile using the original session identity, including inherited fork history. Changed or removed result metadata falls back to the processed result even after later live updates.

**Verification (2026-10-16, Node 26.8.1):**

- Pi 1.0.2: `node --test packages/pi-chat/test/*.test.ts packages/pi-codex-tools/test/*.test.ts packages/pi-activity/test/*.test.ts` — 335/335 pass, no failures, cancellations, or skips. Log: `/tmp/pi-generic-packages-final.log`.
- Pi 1.1.0 in an isolated temporary checkout: `node --test packages/pi-chat/test/*.test.ts packages/pi-codex-tools/test/workflow-presentation.test.ts packages/pi-activity/test/contract.test.ts` — 126/126 pass, no failures, cancellations, or skips. This includes the full chat suite and combined workflows. Log: `/tmp/pi-generic-1.1.0-checks.log`.
- Typechecking passes with `pnpm typecheck` on Pi 1.0.2 and `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` on Pi 1.1.0. Repository `pnpm lint`, `pnpm format:check`, and `git diff --check` pass.
- The red/green checks exercised the public contract, unrelated producer, terminal continuation, retained-source navigation, and fork identity. The existing compact-history check also caught oversized combined journal batches; splitting at flush boundaries restored its unchanged limit without persisting every live output chunk.

**Review:** Direct reviews compared `6013382...4e271b8` against the specification, ADRs 0001/0016/0019/0024, repository development guidance, and the supplied AGENTS.md. Standards: no remaining findings after grouping the shared import with the module's imports. Spec: no remaining findings after repairing compact history batching and fork source identity. Separate review agents could not run: the runtime returned `Encrypted function output content could not be decrypted or decoded` (`invalid_request_body`). These are direct reviews, not independent agent approvals.

**Limits:** The reference comparison inspected installed app source, not a live UI. Physical-terminal pixels/input, full application visual parity, and new live-model trials were not checked. The full repository suite was not rerun; the affected package suites and existing combined workflows were. Public tool declarations, model-result content, execution permissions, cancellation, and collection cursors were not redesigned. Nothing was published or installed into the user's running Pi session. Temporary compatibility files were removed after verification; earlier evidence keeps its original scope.
