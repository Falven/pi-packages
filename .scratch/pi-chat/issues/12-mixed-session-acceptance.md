# 12: Verify independent native output previews in mixed sessions

**What to build:** Verify the combined command, edit, and final-response copy delta through the existing native host and safely captured clipboard boundary, then integrate the verified changes into main.

**Blocked by:** 03: Component-copy delta; 07: Final-response-copy delta.

**Status:** ready-for-agent

## Copy acceptance delta — approved 2026-10-16

- [ ] Establish exact command/output/diff/response payloads, including multiline commands, failures, output beyond preview/viewport, live updates, per-file results, multi-operation ownership, and older/split/mixed final answers.
- [ ] Establish empty/omitted/partial behavior, clipboard rejection without actual clipboard writes, and in-flight disposal cleanup.
- [ ] Establish mouse consumption, configured keyboard/focus behavior, unchanged global selection-copy, narrow/resize/ancestor behavior, source Find, and absence of actions on every excluded category.
- [ ] Run the existing chat suite and required static checks on existing supported Pi 1.0.2 and 1.1.0 environments. Record commands, results, and unavailable coverage; do not upgrade dependencies or add test cases/files/seams.
- [ ] Review Standards and Spec independently, fix concrete findings, integrate only this delta into main, and remove task-created branches/worktrees while preserving unrelated work.

These recording-terminal checks do not establish physical-terminal or OS clipboard behavior. Report physical acceptance only if performed. Earlier evidence below remains historical.

## Prior native-preview revision

**What to build:** Verify independent native output previews in mixed sessions.

**Blocked by:** Chat 04 and Chat 05 native preview correction.

**Status:** resolved — native preview correction implemented; verification and limits below

## Native output preview correction — approved 2026-10-15

- [x] Use the existing real-Pi seam and existing cases to verify built-ins and extensions: summary-only item, open item with native preview, then independent full native output, with native collapse leaving the item open.
- [x] Verify configured/remapped global expansion, ancestor choice preservation, settings rebuild, Find beyond preview limits, meaningful copy, images, and existing lifecycle in both supported runtimes.
- [x] Run relevant checks and standards/spec review. Record revision-specific evidence and preserve earlier evidence; distinguish native recorded-frame/input checks from physical-terminal observations.

This correction supersedes forced native-output expansion when an item opens. Earlier scope, status, and evidence below remain historical.

### Verification — 2026-10-15

Runtime changes `37c61a2` and `50fbcfb` are integrated at `39e0e5dfd6f210644167edfcb7446236edf72b64` on `codex/chat-scroll-integration`. Production changes are confined to the existing `native-host.ts` adapter. The initial regression reproduced forced full output; a second generic-tool regression identified Pi's raw-renderer path. Both now pass using native controls.

- Primary Pi 1.1.0: an immutable archive of `39e0e5d` passed `node --test --test-concurrency=2 packages/pi-chat/test/*.test.ts packages/pi-codex-tools/test/workflow-presentation.test.ts`: **120/120**, no skips. Typechecking passed. ESM resolution confirmed one coherent Pi 1.1.0 coding-agent/TUI dependency tree.
- Secondary Pi 1.0.2: `node --test packages/pi-chat/test/*.test.ts` passed **116/116** and `node --test packages/pi-codex-tools/test/workflow-presentation.test.ts` passed **4/4**. The chat source/tests are unchanged from the worker's checked runtime through `39e0e5d`; final core workflow checks include the replay-layout correction.
- Root `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, and `git diff --check a901939..39e0e5d` passed. Existing cases cover preview/full/preview input, open ancestors after native collapse, retained state, configured/remapped global expansion, settings, hidden-source Find, copy, images, both extension load orders, replay, and streaming outcomes. No new test cases, files, fixtures, or seams were added.
- Independent Standards and Spec reviews of `a901939..39e0e5d` found no actionable findings. The earlier tracker-graph and evidence-scope findings were corrected at `035c6c5`. Historical ticket bodies remain unchanged below.

Logs, revision and dependency records, and review reports are in `/var/folders/z8/66twpw0n05z3dy2dtkn_z8v40000gn/T/pi-native-preview-hmc3u7ql`. These are real native-host recorded-frame/input checks, not physical-terminal acceptance. No new physical-terminal check, full-repository suite, or live-model trial was run for this correction. Earlier physical observations and full-suite failures retain their recorded scope below.

The configured local package resolves to `/Users/fran/Source/pi-packages/packages/pi-chat`. A running Pi session needs `/reload` to load this code; no input was sent to the user's active session.

## Prior native-flow revision and evidence

**What to build:** Verify the combined native-flow, padding-gutter, and configured global-disclosure revision through existing mixed real-Pi workflows.

**Blocked by:** 03: Navigate, select, and copy chat content; 05: Expand render groups and native activity bodies in conversation flow; 07: Collapse settled agent activity while keeping the final response visible. Earlier adapter, retained-item, and core workflow prerequisites are complete.

**Status:** resolved — approved native-flow and disclosure delta

## Native-flow and disclosure delta — approved 2026-10-15

- [x] Exercise both normal extension load orders, built-ins, core tools, unknown/replacement extensions, hooks, and live/retained activity through the established real-Pi host fixture. Update existing cases only; add no test cases, files, fixtures, or alternate seam.
- [x] Verify full render-group expansion in conversation flow and standard native expanded output sizing with independent summary-only collapsed items. Verify configured/remapped app.tools.expand reaches Worked for…, groups, items, and native output, while future groups/items inherit the native global flag and explicit choices retain precedence.
- [x] Verify zero and nonzero/live outputPad without extra width, inset, or setting; gutter/header wheel routing; native scrollbar modes and priority; child-first scrolling with edge handoff where supported; and primary conversation scrolling for standard native bodies.
- [x] Preserve source, Find/reveal, meaningful indentation, offscreen copy/selection, anchors, end following, resize, single-owner images, notices/final responses, themes, image preferences, native input/overlays, and composer behavior.
- [x] Exercise cancellation, late updates, later prompts, reload, branch/session replacement, and other already-covered lifecycle paths without stale callbacks or resource resurrection. Do not change provider contracts, execution cells/process sessions, model collection, or the unresolved raw execution-output policy.
- [x] Run focused existing checks, required static checks, and standards/spec review on the integration revision; record actual runtimes and results. Distinguish recorded native frames from physical-terminal pixels/input, and leave unavailable physical acceptance explicit. Prior revision evidence below does not certify these deltas.

**Revision evidence (2026-10-15, `9337a56`):** The combined implementation exposes every group item in conversation flow, uses native expanded output sizes, routes existing padding to conversation scrolling, and applies configured app.tools.expand to every available disclosure level. Existing real-Pi cases cover both normal extension load orders, native/custom/replacement tools, hooks, Find/copy, images, live settings, explicit parent/child choices, new arrivals, cancellation, late outcomes, reload, and session/mode changes. No test cases, files, fixtures, settings, dependencies, or provider contracts were added. Raw execution-output policy remains unchanged.

**Automated checks:** At integration `025a241`, primary Pi 1.1.0 passed all 116 chat and 207 core-tool cases. After the review repair at `9337a56`, all 116 chat cases and four core mixed-workflow cases passed again on both Pi 1.1.0 and Pi 1.0.2, with no failures, skips, or cancellations. Typechecking passed in both environments; repository lint, formatting, and whitespace checks passed. Each runtime used one coherent native dependency tree. The full repository run on Pi 1.0.2 at `025a241` passed 1,361 of 1,372 cases, with nine skipped and two failures: composer fullscreen key ownership and goal abort after an empty final. Both failures reproduced individually on the exact starting commit `c674973`; neither belongs to this delta. The full repository and full core suite were not repeated after the focused repair.

**Review:** Standards review found no actionable issue. Spec review found that settings reconstruction saved a collapsed group choice for calls that had never owned a group. Repair `9337a56` preserves absent state and genuine prior choices; the existing Hide thinking case failed before the repair and passed after it. Both reviews found no remaining implementation/test issue after rechecking that commit. The spec also keeps item closability separate from global-state inheritance.

**Physical terminal:** Real cmux input and pixels with Pi 1.1.0 at production source `9f57ab9` verified full group expansion, independent command/error/file disclosures, native long-output conversation scrolling, left-padding wheel routing, zero-padding layout, configured/remapped global expansion across available levels, one image placement, and narrow-pane reflow. Later acceptance commits changed tests only; the settings-retention repair is covered by automated checks rather than a repeated physical run. Both isolated Pi sessions exited cleanly. [Local terminal evidence and screenshots](/tmp/pi-scroll-deltas-2d_lp_g4/terminal-evidence.md) distinguish these observations from recorded native frames.

**Physical checks still unperformed:** child inheritance after a pre-prompt global action, scrollbar track clicks, selection/copy, /reload, a second image-size variant, and the second extension load order. Automated cases cover the corresponding behavior, but do not certify physical pixels, clipboard, or terminal input. cmux UI access became unavailable during cleanup; no test process remains, but closure of the disposable cmux workspace could not be confirmed. Earlier physical limitations below retain their historical scope. [Core 06](../../core-tools/issues/06-verify-mixed-native-workflows.md) records the companion workflow acceptance.

These approved criteria supersede conflicting presentation/default-state requirements in earlier revisions. Earlier status, completed checklists, and evidence below remain historical; they do not validate this delta. Accepted decisions: ADRs 0014, 0015, and 0019–0022.

## Prior accepted revision and evidence

**What to build:** Verify the combined activity-item revision with all surrounding chat behavior and both extension load orders.

**Blocked by:** Chat 11: retained-item reveal; Core 02–05: commands, continuation, patches, and images.

**Status:** resolved — approved activity-item delta; earlier evidence retained below

## Activity-item delta — approved 2026-10-15

- [x] Run affected existing real-host cases on primary Pi 1.1.0 and secondary 1.0.2 with both extension load orders, built-ins, unknown/replacement extensions, hooks, and live/retained activity.
- [x] Verify three disclosure states, independent controls, native default bodies, copying/Find, notices/final responses, settings, cancellation, and session lifecycles.
- [x] Run configured-terminal acceptance where available and distinguish emitted bytes from verified physical pixels and input.
- [x] Record exact checks and remaining limits; retain earlier physical-terminal acceptance as pending until verified.

**Revision evidence (2026-10-15, production tip `f6004ab`):** The activity-item implementation is verified independently of the earlier aggregate renderer. The complete existing chat suite passes 116/116 on coherent Pi 1.1.0 and secondary Pi 1.0.2. The complete core suite passes 207/207 on Pi 1.1.0. The primary snapshot's tracked chat/core source matches the final production tip; fixture and extension imports resolve one physical copy of each native package. Both extension load orders run through the normal real-host fixture, alongside built-ins, unknown/replacement tools, hooks, retained history, native settings, cancellation, Find/copy, and final/notice ordering. Existing cases were updated; no test cases, files, dependencies, or primary seam were added.

Physical acceptance used a fresh cmux 0.65.1 terminal on macOS with coherent Pi 1.1.0, staged `f6004ab`, the real `InteractiveMode`/`AgentSessionRuntime`, and a local controlled provider. CUA mouse, keyboard, and wheel actions verified closed group summaries, initially closed independent items, native default command/error/file bodies, independent closure, a single image with bounded scrolling, resize, `/reload`, Find revealing a closed error, and `/quit` printed exit with shell status zero. Reload left the provider request count at two; the retained collecting result contains one image. Opening the large image follows it within the existing bounded group viewport; wheel movement reveals the earlier rows without moving the group header or final answer. This is expected scrolling, not image overpainting.

The outside-repository [physical evidence note](/Users/fran/.codex/visualizations/2026/10/15/01a13d3b-e072-7013-9513-a2cfcccecf0f/activity-terminal/f6004ab-physical-acceptance.md) records the exact launch, runtime, observations, and screenshots. This run verifies cmux in chat-first order only. Ghostty access was denied by CUA; no workaround accessed that surface. Physical clipboard selection/copy, native retry, compaction, alternate light theme, chat-last order, and the wider companion matrix were not repeated. Their automated coverage is distinct; earlier unperformed physical criteria remain open in the historical section below.

[Core ticket 07](../../core-tools/issues/07-verify-contract-and-matched-trials.md) records static checks, review closure, and the full repository run: 1,361 passes, two unrelated failures reproduced on the starting commit, and nine skips. The provider's primitive-string attribution limit remains explicit in [Core 01](../../core-tools/issues/01-execute-command-through-model-loop.md); complete primitive forwarding attribution is not claimed.

## Earlier revision

**Recorded status:** in-progress — correction delta complete; earlier physical-terminal acceptance pending

**Original delivery:** Use the complete pi-chat workflow with native Pi and the existing composition extensions through a full session and lifecycle changes.

- [ ] Exercise always-retained group disclosures, both native Hide thinking modes, omitted-reasoning grouping, native working-indicator activity headings, steering/follow-ups, final collapsing, selection/copy, collapsed search, selected-only temporary thinking reveal and its cleanup, and pre-compaction reveal together.
- [x] Preserve native and companion composer, attachments, skills, tool/Markdown overrides, widgets, themes, and overlay focus in supported load orders.
- [x] Verify native scrollbar modes and pointer behavior, gutter selection/copy, zero/live output padding, and retained-history settings updates through the real host on primary Pi 1.1.0; keep future versions capability-based without promising untested compatibility.
- [x] Verify normalized collapsed and active group summaries across built-in, unknown, replacement, and historical calls in the existing native-host workflow without changing expanded tool presentation, thought labels, source, or disclosures.
- [x] Exercise a registered skill-definition read in the mixed native-host workflow alongside native and custom calls, preserving expanded controls, search, copy, retry, and interruption.
- [ ] Exercise native retries, interruption, compaction, reload, session/branch replacement, fullscreen/regular transitions, and printed exit history without stale callbacks or lost canonical content.
- [x] Complete relevant automated checks and a standards/spec review against the integration branch starting point; fix substantiated findings.
- [ ] Perform actual-terminal image, resize, selection, keyboard/mouse, overlay, and lifecycle acceptance; record evidence and keep unperformed physical checks pending.
- [x] Document delivered support and material limits in the allowed spec/ADRs and this ticket; add no separate research notes or unrequested documentation.
- [x] Resolve local tickets only according to their demonstrated acceptance, preserve borrowed native ownership, and leave all implementation on the single integration branch.

Correction delta:

- [x] Verify native custom-entry append and streaming insertion together with agent activity collapsing, retained-user/notice order, render group boundaries, replay, reload, branch/fork changes, and compaction through the existing real-host seam.
- [x] Load the separately revised native `exec` renderer through normal extension loading and verify execution status inside its initiating tool activity under both disclosure levels, including later updates, later requests, and reload; keep the final visible without an extra standalone execution-status row.
- [x] Complete focused regression checks, typechecking, formatting, and a standards/spec review for the correction integration branch; fix substantiated findings and record exact evidence separately from baseline results.
- [x] Record any unavailable combined-renderer or physical-terminal acceptance explicitly and leave the corresponding criterion open; do not certify it through a simulated chat host or chat-owned execution-journal parser.

The combined execution-status criterion depends on the native `exec` presentation specified in ADR 0024, owned by the separate tool-package work. Correcting or committing that package is outside this ticket's scope. This dependency does not block tickets 02 and 07 or independent native-host verification. Preserve all earlier pending physical acceptance below; the correction does not reopen completed implementation unrelated to these deltas.

Correction acceptance verification: existing real `InteractiveMode` cases now cover a native `appendEntry` notice between otherwise consecutive tool calls, with two separate native group disclosures when agent activity opens, one retained notice when agent activity closes, and the same ordering after reload. The existing notice-only case also delivers steering after an empty assistant iteration, retaining only that user, a standalone notice, and the selected answer without an empty agent activity disclosure. Existing tree-navigation, fork, and compaction cases retain an interleaved native notice exactly once before the selected answer; navigating to an earlier branch excludes that later notice. These checks complement tickets 02 and 07's native append/streaming-insertion and retained-user/notice-order evidence.

The existing custom-tool case separately verifies the public native renderer `invalidate` callback after a final response and during a later streaming request. Its original result presenter is reused, manual group expansion survives, collapsed agent activity hides the updated result, and reopening displays the latest result exactly once. This generic native-renderer coverage does not certify the separately revised `exec` renderer or its causal execution-status relationship.

Focused correction checks on coherent Pi 1.1.0: `node --test --test-name-pattern='custom renderers and failed calls|commentary between model iterations|a standalone native message after the final|same-journal tree navigation|native fork carries certified|compaction keeps certified' packages/pi-chat/test/native-chat.test.ts packages/pi-chat/test/agent-activity.test.ts` passed 6/6 with no failures, cancellations, or skips. `tsc --noEmit -p tsconfig.json`, scoped `oxlint`, scoped `oxfmt --check`, and `git diff --check` passed. No runtime, fixture, dependency, configuration, new test case, or new test file was added by this acceptance delta. Final integrated evidence follows; earlier physical-terminal criteria remain open.

Cross-version correction follow-up: the first integrated run passed 116/116 on Pi 1.1.0 and exposed one malformed acceptance fixture on Pi 1.0.2. The later streamed answer now supplies its required `finish_reason`. The remaining red failure was native same-row double-click selection: Pi 1.0.2 selected/copied the header word instead of dispatching a disclosure click. The renderer-invalidation case now closes and reopens agent activity through existing keyboard disclosure controls; pointer cases remain separate. No runtime correction was required. The existing standalone-notice case also uses public `ui.notify` between earlier tool activity and the first final-answer delta to verify that an unidentified native warning stops agent activity composition: earlier agent activity stays visible in source order, without introducing the warning into session messages or provider context. The two amended cases passed 2/2 on each coherent Pi 1.0.2 and 1.1.0, with no failures, cancellations, or skips. TypeScript, scoped lint/format, and `git diff --check` passed.

Integrated correction verification (2026-10-14, `f5ac5b8`): `node --test packages/pi-chat/test/*.test.ts` passed 116/116 on Pi 1.1.0 in 13.079 seconds and 116/116 on Pi 1.0.2 in 13.349 seconds, with no failures, cancellations, or skips. Fixture and extension imports used the same native version in each run. Root TypeScript, lint and formatting for changed source/tests, formatting for the affected spec/ADRs/tickets, and the integration diff whitespace check passed. Separate standards and spec reviews covered the diff from `57797e3`; the spec review's missing unidentified-row check was added, and both follow-up reviews report no remaining finding. The full repository suite and physical-terminal acceptance were not rerun for this correction.

Combined native execution acceptance: a disposable managed checkout paired tool commit `726e3505a73598653fa07b8d5e4139bfcd2d8bee` with the chat delta `57797e3..f5ac5b8` and companion source matching `f5ac5b8`. Fixture, chat, tool, and companion imports all resolved Pi 1.1.0. The existing chat-first and chat-last mixed-session cases temporarily loaded the actual `exec` extension through the normal loader and drove real commands. `node --test --test-name-pattern='mixed chat (first|last) session' packages/pi-chat/test/mixed-session.test.ts` passed 2/2 in 5.02 seconds, with normal process exit and no failures, cancellations, or skips; scoped lint, formatting, and whitespace checks passed.

Both load orders keep status inside the original activity through group and agent activity collapsing. A command's late exit 7 during a later streaming request remains in its original card; a yielded script's late failure retains its successful nested command's exit 0. Opening the original disclosures reveals the latest output once. Closed disclosures keep both final answers visible without extra execution-status rows. Native reload restores both outcomes; shell run-count files remain exactly one execution each, and provider request counts do not increase. These temporary assertions are retained in the archived managed verification checkout. No tool-package source was corrected or committed, and no chat-owned journal parser was added.

The pinned tool branch also contained a newer attachment implementation requiring `pi.registerSetting`, absent from Pi 1.1.0. Combined acceptance therefore used the already verified companion source matching the chat integration, leaving that unrelated API mismatch outside this correction. This check certifies the stated version combination; it does not certify newer companions or physical-terminal behavior.

Earlier mixed native-host tests covered both load orders and live tool/thought workflows with native and custom renderers, steering and follow-ups, collapsing, copy, search, retry, interruption, reload, compaction, session replacement, themes, and mode switches. Historical verification before the Hide thinking change: after activity-heading extraction, `node --test packages/pi-chat/test/*.test.ts` passed 116/116 against each of Pi 1.0.2 and 1.1.0 with no failures, cancellations, or skips; heading presentation, working-label cleanup, canonical preservation, and hidden-heading search reveal were covered by modified existing cases. TypeScript, oxlint, and full formatting checks passed. The full repository suite passed 833/833 before the heading change and was not rerun this turn. Standards review found a trailing `.trim()` that could remove first-line code indentation; stripping only separator newlines fixed it, focused verification passed, and rereview found no remaining concrete issue. The Markdown link-label search defect from earlier spec review was fixed and rechecked. The implementation is on `main`. Existing print-mode fixtures check emitted scrollback, but no physical printed-exit acceptance has been completed, so the lifecycle criterion remains pending.

Hide thinking verification: `node --test packages/pi-chat/test/*.test.ts` passed 116/116 against each of Pi 1.0.2 and 1.1.0, with no failures, cancellations, or skips. Modified existing cases cover native visibility toggles, grouping across omitted reasoning, commentary boundaries, cancellation/reload, working labels in both modes, and temporary Find reveal with navigation/query/close cleanup for current and retained thoughts. TypeScript, scoped oxlint, and repository formatting checks pass. Read-only implementation review found no concrete correctness issue. No new test cases or dependencies were added. The full repository suite and physical-terminal acceptance were not rerun.

Scrollbar and padding verification: `node --test packages/pi-chat/test/*.test.ts` passed 116/116 against each of Pi 1.1.0 and 1.0.2, with no failures, cancellations, or skips. Modified existing cases cover all native scrollbar modes and live settings changes, styles, track clicks, thumb dragging, hover and automatic hiding, gutter selection/copy, image crops with reserved width, zero/live header padding, and retained user/thought/tool padding. TypeScript, scoped lint, and formatting checks pass. Read-only review caught selection spilling into the gutter and cleanup changing a later owner's scrollbar; both were corrected and rechecked. No new test cases, dependencies, version guards, or private hooks were added; native primary-scroll discovery removes one override. The full repository suite and physical-terminal checks were not rerun.

Group summary verification: `node --test packages/pi-chat/test/*.test.ts` passed 116/116 on primary Pi 1.1.0 and secondary Pi 1.0.2, with no failures, cancellations, or skips. The updated repeated-tool case covers a native bash active group summary, fixed collapsed order, repeated edit-path deduplication, and resize. Existing cases cover native/custom/replacement/historical fallback, grouping, disclosures, input, and settings reconstruction. The updated mixed native-host case reads a registered review skill beside a native read and custom mystery call, producing “Loaded a tool, called a tool, read files” while expanded native/custom controls, search, copy, retry, and interruption remain available. A temporary `GroupSummaries` assert self-check passed supported active phrases, skill mapping through public metadata, distinct edit/skill paths, plurality/order, generic fallback, concurrent active selection/stop, no repeated public lookups while summarizing, preserved source, and entry rebind/historical-unobserved behavior. Typecheck, repository lint and formatting, and `git diff --check` passed; read-only review found no concrete issue. No test cases or test files were added, and no dependencies, private hooks, or version guards were added. The final repository suite passed 833/833 after the presentation and terminology changes. The primary Pi 1.1.0 chat suite passed 116/116; its focused active-summary case also passed after making the execution gate release on assertion failure. The subscription Responses fixture now selects the API through public model metadata; its focused check passed on both versions. Physical-terminal acceptance remains pending.

Physical acceptance remains pending. The earlier attempt was blocked because the Mac was locked and automatic unlock failed during the 2026-10-13 08:09 UTC access check; earlier Ghostty app access was denied. No physical terminal session was started or cleaned up. Recording-terminal assertions do not establish image pixels, selection, keyboard/mouse behavior, overlays, resize, or printed-exit behavior in Ghostty.
