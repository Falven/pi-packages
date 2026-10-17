# 17: Unwrap eligible completed singleton render groups

**What to build:** Let users inspect an eligible inactive singleton directly through its activity-item disclosure, preserving the independent native preview/full-output control. Apply the complete pinned Codex eligibility rule to supported Pi facts in live and retained conversations. Preserve wrappers for excluded or unresolved groups and integrate the verified behavior into main.

**Blocked by:** None (design, specification, existing test seam, and this single-ticket breakdown approved on 2026-10-16).

**Status:** resolved

- [x] Pin the complete caller and helper rule to ChatGPT.app com.openai.codex 26.1013.31256, build 20586, and document every guard and Pi representation limit.
- [x] Omit only a group wrapper with exactly one inactive item in summary state and every other applicable guard satisfied; preserve the item disclosure and native output control independently.
- [x] Keep zero/multiple-item groups, running items including older ones, and the latest open group with active header progress out of singleton unwrapping. Valid empty activity stays absent.
- [x] Permit earlier inactive singletons while later activity continues and update eligibility from established closure during final streaming; do not require whole-turn settlement or successful completion.
- [x] Use authoritative lifecycle facts for failures, interruptions, unknown outcomes, and unattempted files. Carry the original patch outcome and file count through projection; only eligible one-file patches qualify.
- [x] Record the preservation-override, completed-header, and visualization exclusions without inventing currently absent Pi settings or presentation inputs.
- [x] Preserve logical group choices, existing item/native-output presenters, new-control global inheritance, and documented state lifetime through cardinality changes, failure, cancellation, ancestor toggles, settings reconstruction, and replay.
- [x] Keep a usable focus target and correct pointer geometry when a header disappears; preserve reading position where possible and existing selection/copy invalidation rules.
- [x] Preserve source ownership, Find reveal, Hide thinking boundaries, final-response placement, native previews, and unbounded conversation flow.
- [x] Use TDD by extending existing real-Pi host cases, retaining the collapsed-boundary regression; assert fresh frames, real input, copied text, and unchanged provider/session content. Add no test file, test case, or primary seam.
- [x] Pass the established combined chat/tool-presentation suite on the currently installed Pi 1.1.0 in a coherent isolated environment without changing repository dependencies; complete its host typecheck, lint, task-file formatting, and whitespace checks. The user explicitly limited this delta to the installed runtime.
- [x] Complete independent standards and specification reviews against the recorded baseline, repair actionable findings, and rerun affected checks.
- [x] Record actual revisions, commands, runtime versions, results, and limits. Earlier validation is historical and does not validate this delta.
- [x] Integrate the verified result into current main without rewriting history or pushing remotely; include final specification and ticket bookkeeping before marking resolved.
- [x] Verify all task changes are in main, preserve needed evidence and the unrelated comparison report, and remove only task-created branches and worktrees using managed cleanup where applicable.

**Contract:** [Chat specification](../../../docs/specs/pi-chat.md) and [ADR 0020](../../../docs/adr/0020-render-group-lifecycle-and-singleton-preservation.md).

**Historical guarantees:** [Chat 04](04-render-groups.md) keeps item and native-output controls independent. [Chat 12](12-mixed-session-acceptance.md) and [Chat 13](13-activity-item-adapters-and-independent-bodies.md) retain native-host, adapter, and replay guarantees. [Chat 14](14-stable-reading-position.md) keeps collapsed-activity scrolling stable. Their resolved status and earlier evidence remain unchanged.

**Approval:** Q1 and Q3 accepted as proposed; Q2 accepted with verification limited to the currently installed Pi. The installed command reports 1.1.0; the repository development dependency remains 1.0.2. No additional runtime is required for this delta.

**Implemented behavior:** The existing presentation projection emits an eligible group's existing item directly and retains the logical group and its dormant expansion choice. Item and native-output state remain independent. Eligibility uses activity ownership, meaningful projected boundaries, closure and settlement, and authoritative operation outcomes. Earlier inactive items can unwrap during later activity; a finished item in the latest open group remains wrapped. Original edit status and file count survive per-file projection. Focus and reading anchors can transfer from an omitted header to its item; Find preserves a dormant group choice. No new setting, provider contract, dependency, renderer, or selection implementation was introduced.

**Reference and representation:** [Reference notes](../singleton-reference-2026-10-16.md) record the pinned app, archive/source hashes, complete caller and helper predicates, and Pi mapping. Supported Pi inputs have no preservation override, group completed-header slot, or patch visualization activity. These guards remain documented applicability limits. Unknown ownership, omitted original patch cardinality, and records conflating interruption with unknown completion retain the wrapper. Pi's file-record array is not identical to Codex's path-keyed change object.

**Revisions:** Started at `cbf6ffac013f10b6b2a227804d076a4556bd248d`. The original implementation was `8a919a24d5dfd8cfa232a58c3464692ea7ee6cd2`. After reconciling concurrent main changes, the tested code and tests were committed as `d0ad1b7cd55e45511f058db3e69eeec81acd42c3`; the reviewed revision was `606b15401c9b341a60a090ddf5d1211d258c5112`. Documentation-only rebases preserved the tested package tree `d9cc3c6945b87364a5b28da3f91701c8f22995cb`, fixture tree `2ee58cb6da614acb43ad78f637f0099e416a6fd1`, and dependency/configuration files. Local main fast-forwarded from `7c7944f3e0a34693bbe503c8c8a2165d5617b726` to `aa4afa10fe83fcce44da385b69bd5436419830bd`. Current-operation labels, copy controls, enclosing-disclosure eligibility, and their historical evidence were preserved. No main history rewrite or remote push occurred.

**TDD and interaction evidence:** Existing cases first failed for eligible singleton projection, focused-header removal, original patch facts, dormant Find state, empty live frames, and adjacent thought boundaries, then passed after their respective changes. Existing cases also cover running and failed operations, uncertain outcomes, final streaming, cardinality changes, cancellation, pointer access, reading anchors, copied text, selection invalidation, Hide thinking, global expansion, settings reconstruction, replay, native images, and both extension load orders. Provider/session content remains unchanged. Chat 14's wheel/selection/copy regression was retained. No test case, test file, or primary seam was added by this delta.

**Runtime and results:** Only the installed Pi 1.1.0 was checked, with Node v26.8.1. Isolated local dependency links used one coherent native installation; no installation, repository dependency change, or lockfile change was made. The initial implementation passed 141/141 combined cases. After incorporating main's six added cases and reconciling four stale current-operation label assertions, the final focused run passed 4/4 and the combined run passed **147/147**, with zero failures, cancellations, or skips, in 50.753 seconds. Typecheck, repository lint, formatting of all 19 task files, and whitespace checks passed.

The final behavior checks ran in the integration worktree:

```sh
node --test --test-concurrency=2 packages/pi-chat/test/*.test.ts packages/pi-codex-tools/test/workflow-presentation.test.ts
node --test --test-concurrency=2 --test-name-pattern='adjacent thinking blocks|a completed singleton|commentary between model|phase-bearing final text' packages/pi-chat/test/inline-thoughts.test.ts packages/pi-chat/test/native-chat.test.ts packages/pi-chat/test/phase-final.test.ts
node_modules/.bin/tsc --noEmit -p tsconfig.json
node_modules/.bin/oxlint .
node_modules/.bin/oxfmt --check .scratch/pi-chat/issues/17-unwrap-eligible-singletons.md .scratch/pi-chat/singleton-reference-2026-10-16.md docs/adr/0014-fullscreen-transcript-interaction.md docs/adr/0019-tool-renderers-own-tool-presentation.md docs/adr/0020-render-group-lifecycle-and-singleton-preservation.md docs/adr/0021-bounded-render-group-scrolling.md docs/specs/pi-chat.md packages/pi-chat/src/native-host.ts packages/pi-chat/src/tool-adapters/activity.ts packages/pi-chat/src/tool-adapters/built-in.ts packages/pi-chat/src/tool-adapters/types.ts packages/pi-chat/test/activity.test.ts packages/pi-chat/test/agent-activity.test.ts packages/pi-chat/test/inline-thoughts.test.ts packages/pi-chat/test/mixed-session.test.ts packages/pi-chat/test/native-chat.test.ts packages/pi-chat/test/phase-final.test.ts packages/pi-chat/test/source-search.test.ts packages/pi-codex-tools/test/workflow-presentation.test.ts
git diff --check
git diff --check 3741f508857f89ebe2573b3e6228854f6c9da6f7..HEAD
```

After the last documentation-only rebase, the code/test equivalence check passed:

```sh
git diff --exit-code 606b15401c9b341a60a090ddf5d1211d258c5112 aa4afa10fe83fcce44da385b69bd5436419830bd -- packages fixtures package.json pnpm-lock.yaml tsconfig.json
```

Specification formatting and final task whitespace checks were repeated. Behavioral tests were not repeated for identical code and tests. Final closure changes are limited to this ticket and specification evidence; scoped formatting and whitespace checks passed for both files.

**Review:** Independent Standards and Spec reviews against the recorded starting commit found **zero actionable findings on each axis**, both at the original implementation and after reconciliation. The second reviews isolated the singleton delta from intervening main work and inspected the 147-case and static-check evidence. The later rebase changed documentation only.

**Evidence:** `/tmp/pi-chat-singleton-20261016-vse6zvdg/` retains the resource inventory, source research, design approval, installed-runtime resolution proof, focused red/green logs, original and final combined-suite logs, static-check logs, implementation/rebase reports, both review rounds, range comparisons, and `task-recovery.bundle`. The final combined result is in `rebased-combined-final.log`; exact reconciliation commands and revision boundaries are in `rebase-report.md`. This ticket retains the durable result summary if temporary logs expire.

**Cleanup:** Both managed archive requests returned `queued` and their checkouts remained present after rechecks. Before cleanup, both worktrees were clean, all needed evidence was outside them, integration was proven present in main, and `git bundle verify` passed for the bundle containing both task branches and complete history. The verified Git-bundle fallback removed `/Users/fran/.codex/worktrees/pi-chat-singleton-implementation/pi-packages` and `/Users/fran/.codex/worktrees/pi-chat-singleton-unwrapping/pi-packages` with `git worktree remove`. Both `codex/pi-chat-singleton-implementation` and `codex/pi-chat-singleton-unwrapping` were deleted; the rebased implementation branch was removed only after the reviewed integration and recovery bundle were verified. No compatibility worktree was created. Git worktree/branch listings and filesystem checks confirm both task resources are gone. Managed archival completion itself was not confirmed. Other tasks' resources and edits were left untouched. The original untracked comparison report remains unchanged at SHA-256 `5e309230c0dda894020498e75ddd9aa03765b4ca44d2d15e10a916045a3148ed`.

**Limits:** The recording-terminal seam establishes emitted frames and real-host input behavior with a captured clipboard boundary. Physical-terminal pixels/input, OS clipboard transport, live Codex interaction, Pi versions other than the installed 1.1.0, and the full repository behavioral suite were not checked. Absent reference inputs and lossy historical lifecycle records limit exact parity as described above and in the specification.
