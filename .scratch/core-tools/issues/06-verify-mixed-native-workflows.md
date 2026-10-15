# 06: Preserve complete workflows in mixed Pi sessions

**What to build:** Verify complete command, continuation, patch, and image workflows through the combined default activity-body path.

**Specification:** [Core toolset](../spec.md).

**Blocked by:** Core 02–05; Chat 10–11.

**Status:** resolved — approved activity-item delta; earlier evidence retained below

## Activity-item delta — approved 2026-10-15

- [x] Reuse both normal extension load orders and existing mixed-host cases to verify independent items and their origin across later prompts, settings, and reload.
- [x] Preserve unrelated notices, final responses, effective hooks, retained source, actual file/process effects, and image single ownership.
- [x] Record combined evidence independently of the prior aggregate-renderer revision.

**Revision evidence (2026-10-15, `f6004ab`):** Existing real `InteractiveMode`/`AgentSessionRuntime` workflows load pi-chat and the core toolset normally in both orders. The updated cases verify separate command/file/execution items, default bodies, initially closed rows, independent details, late outcomes at their origin, and stable behavior through later prompts, settings changes, and reload. Actual process/file effects, authoritative hooks, source preservation, final responses, unrelated notices, and single-owner images remain covered.

These results apply to the activity-item implementation, independently of the earlier aggregate renderer. Pi 1.1.0 passes the complete 116-case chat and 207-case core suites at `f6004ab`. Secondary-version checks, full-repository baseline failures, review repairs, and physical limits are recorded in [ticket 07](07-verify-contract-and-matched-trials.md) and [chat ticket 12](../../pi-chat/issues/12-mixed-session-acceptance.md).

## Earlier revision

**Recorded status:** resolved — presentation workflow and main integration checks complete; historical evidence retained below

**Original delivery:** Verify command, continuation, patch, and image presentation together with normal Pi lifecycle and configured companions, keeping unrelated content and the agent interface intact.

## Presentation delta

- [x] Exercise mixed operations and consecutive calls using the existing real-host fixture with the configured companion setup. Parent cards own nested output; invisible routine entries add no standalone rows while unrelated notices and final responses remain intact.
- [x] Verify rendering during streaming, work after yielding and during a later prompt, input from another execution, late failures, and waits with unchanged model result collection and hook handling.
- [x] Verify reload, resume, fork or branch selection, shutdown, cancellation, and retained history. Later terminal records must win; old work must not acquire the active request’s identity or restore workers and processes.
- [x] Check native themes, image preferences, manual/global expansion, and terminal-width behavior. Generic extension summaries and native tool shells remain unchanged.
- [x] Keep all implementation and test changes within the tool package or the minimal existing host-fixture seam it owns. Pi source and every chat-package correction are explicitly out of scope, including its agent activity collapsing and insertion-identity defects.
- [x] Run the configured-runtime smoke available through the existing host seam. Record exact runtime versions and pre-existing companion incompatibilities separately; do not alter unrelated packages to make a suite pass.

## Presentation verification

After rebasing onto main at `9c633a3`, all four mixed checks pass with the five local companions loading successfully. Main already includes the attachments API repair, so the tests now require normal loading instead of the earlier expected failure. Both installed-CLI pipe/PTY checks also pass with all seven configured companions. Ticket 07 records this integration verification; the earlier snapshot evidence below retains its original scope.

At integration revision `726e350`, the added [mixed presentation checks](../../../packages/pi-codex-tools/test/workflow-presentation.test.ts) pass through the existing real native host and controlled provider. Both package load orders combine project inspection, file creation, hook-redacted validation, a local image, explicit yielding, a late script failure, later collection, and reload. Dark/light settings, disabled image display with preserved model image content, native disclosure controls, generic extension summaries, bounded terminal width, unrelated notices and final responses, original source history, and invisible activity records remain intact. A gated command additionally emits live output, finishes with exit status 9 while an independent final response is streaming, stays before that later request in its originating card, and remains available to a later wait without an extra provider request. No runtime correction was needed in this ticket.

The companion-only control and both load orders use the five local companion extensions from the `726e350` snapshot. Pi 1.0.2 reports the pre-existing attachments load error `pi.registerSetting is not a function` with or without the toolset. These tests explicitly retain that diagnostic; they do not establish working attachment integration. Composer, skill references, chat, and goal continue to load. Existing native-host presentation and cell checks passed 45/45, including pipe/PTY live output, input from another execution, hooks, cancellation, termination, shutdown, branch selection, resume/fork, legacy history, clipping, and cleanup. The four new mixed checks passed 4/4 after the final assertions were tightened. Type checking, package lint, formatting, and whitespace validation pass.

The installed `/Users/fran/Library/pnpm/bin/pi` reports **1.1.0**. An external real-PTY probe reused the existing controlled provider and isolated settings with the five snapshot companions plus the configured web extension 1.6.0 and prompt/lifecycle extension 4.13.0. Full startup fails on the same attachments setting API error. A companion-only control without the toolset reproduces that exact startup failure before any provider request. Excluding only attachments permits the remaining six companions and toolset to complete a command, native expansion, readable output/exit status, and reload with no additional provider request (2 requests total). This is a snapshot-code smoke on the installed runtime, not a claim about the concurrently changing primary checkout or a physical terminal inspection. No user settings or credentials were changed.

The temporary executable probes remain outside the repository. Their SHA-256 values are `e07ac7f88e2a1057998c36b9a1b7589caf843a9a00782453398e4e058b8fb609` (full inventory startup), `23ed773e4fcee5dd98fa6a43b929e4ff1afe823a3eff216a18a8db04ed2ea781` (companion-only failure control), and `bbe994a4037493bad310d2604bbea9f3d770db3974426b626d2ed86918c553fb` (attachments-excluded command smoke). The two installed companion manifests hash to `5308ee8f7d84b9a663c93ae0ae99f2b61d23a91044cdffb626e932093575c945` and `11118287abcc7fb463036864b6da6ebaae9c6716d1260a5a3c311f5a43ccfe75`, respectively.

Pi source and companion packages remain unchanged. The chat package's independent agent activity collapsing and custom-entry insertion defects remain outside this ticket; the checks do not assert their repair. Final full-package validation, the extended installed-runtime live/continuation smoke, performance comparison, and independent reviews belong to ticket 07.

## Completed baseline

**Historical status:** resolved — configured controlled native-host workflow verified at `f415bae`; matched live-model verification is recorded in ticket 07

The following criteria and evidence describe the previously completed core contract. This revision supersedes its visible routine-journal presentation; it does not authorize changes to Pi or the chat package.

- [x] Demonstrate a mixed workflow that inspects a project, changes a file, validates the change, and inspects a local image through the selected toolset.
- [x] Verify normal package loading and reloading, activation in an existing conversation, and explicit tool inclusions/exclusions. Distinguish hidden declarations from callable-tool access and preserve historical calls.
- [x] Preserve unrelated tools and their model-dependent availability, including current web tools. Leave extension-owned core-name overrides intact without claiming their restrictions transfer to the new names.
- [x] Exercise the configured composer, attachments, skill references, prompt/lifecycle extension, and chat package together. Preserve submitted content, native tool presentation, agent activity, and retained history.
- [x] Preserve provider composition and the user's guidance, skills, model settings, and effective host preferences. Introduce no second conversation store or package-specific chat protocol.
- [x] Verify ordinary prompt continuation with live process/cell state, then new/resumed/forked sessions, reload, quit, and shutdown using actual native lifecycle events. Clear owned live state while retaining completed file changes and history.
- [x] Verify cancellation and result interception across a mixed sequence, including a blocked nested call and a redacted result that stays redacted in the next model request.
- [x] Verify package-owned cell activity presentation with the configured companions, including work between waits and interrupted records after resume. Native hook IDs/context remain accepted limits; change chat code only after a demonstrated presentation failure.
- [x] Verify that cancelling a later wait preserves its cell and unread output, while termination and session replacement clean up owned work. Check notification delivery without an unsolicited turn or duplicated model content.
- [x] Keep user-entered shell commands on their native path and avoid changes to terminal, keybinding, editor, or clipboard ownership.
- [x] Reuse the same host fixture for integration checks; run the affected existing companion checks only where this slice changes shared behavior.

## Partial composition evidence

A temporary probe reused [the native host](../../../fixtures/native-host.ts) and [the shared model-loop fixture](../../../packages/pi-codex-tools/test/fixtures/model-loop.ts) with the configured composer, attachments, skill references, chat, prompt/lifecycle extension at 4.13.0, and web extension at 1.6.0. Four controlled checks passed again at integration commit `0d80487`: a companion-only control, the core toolset loaded first, the core toolset loaded last, and raw call history after deselection. Runtime code remained unchanged in `17c4c58`.

Both core load orders completed a real command → patch → validation → image sequence. Checks covered all four selected names in `ALL_TOOLS`, native nested events and retained records, and image content in the next request. The observed requests also retained attachment image bytes, one expanded skill block, one prompt-extension section, the existing web-search declaration, and model-dependent URL-tool hiding. Native blocking preserved web-tool ownership, reload retained the draft and history, and a user-entered shell command stayed on its native path without a model request.

A separate [public-host process lifecycle probe](../../../packages/pi-codex-tools/test/fixtures/observed/commands/session-replacement.json) passed six cases at `5507b77`: new, resume, and fork, each during an idle handle and an active poll. Owned shells and children stopped before replacement returned; old handles became stale, fresh commands worked, and completed files remained. New sessions had empty history, resume restored the saved destination, and forks retained history through the chosen anchor while keeping later file effects. Active polls preserved `ACTIVE` output and complete native nested-call summaries. Resuming the original history did not restore its old process handle. Reloaded-history comparison omitted only top-level result details and usage properties whose value was undefined, as recorded in the artifact.

Those earlier checks were partial composition and process-lifecycle evidence using controlled provider responses. The companion probe blocked the actual web network call through a native hook. At that revision, neither probe established retained execution cells, their session lifecycle, or matched live-model trials; [ticket 03](03-yield-and-resume-execution-cells.md) still blocked the continued-execution criteria.

## Integrated verification

The [neutral evidence index](../../../packages/pi-codex-tools/test/fixtures/observed/workflows/index.json) records 15 passing public-host cases at `f415bae`: five companion composition, selection/history, and retained-conversation activation checks; seven cancellation and lifecycle checks; and three mixed continuation and genuine interrupted-history checks. The external raw logs and executable probes are identified by SHA-256 in that index. Their literal requests and results remain outside the repository. The current seven-companion inventory includes the newly configured package at version 0.1.0; its package and source-manifest hashes are recorded there. No goal operation was invoked.

Both extension load orders completed command → patch → validation → local-image work while configured hooks blocked and edited nested commands, redacted a result, and continued firing after the parent yielded and during a later prompt. The next model-visible wait result retained the redaction. The model request retained attachment image content, one expanded skill, prompt guidance, unrelated selected declarations, and the additional local-image result. Reload preserved the editor draft and raw history; deselection and re-selection kept the historical call in its original form. Loading the toolset into a saved conversation preserved earlier messages. User-entered shell input stayed on the native route.

Native new, resume, fork, reload, quit, and shutdown events stopped owned live work. The checks retained completed file changes and applicable saved history, preserved unread output when a later wait was cancelled, and cleared stored values after session replacement while preserving them across an ordinary prompt. Public activity rendered during execution and showed “interrupted or unknown” after a real abrupt exit and resume; it did not enter model context. A notification arrived at the safe boundary without an extra provider turn or duplicate model content.

These results establish the configured controlled-host workflow. They do not establish matched live-model performance or general integration with unconfigured overrides. The public host does not provide durable native child-call attribution after a parent result returns; package-owned activity IDs cover that presentation gap. Local-image conversion currently reports automatic detail. Ticket 07 owns final contract conformance and matched trials.
