# 01: Execute a command through the complete model loop

**What to build:** Add a compact native execution card for a completed command, with readable command, effective directory, output, and exit status while preserving the original model interaction and retained source.

**Specification:** [Core toolset](../spec.md).

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent — approved presentation delta; completed baseline retained below

## Presentation delta

- [ ] Register parent call/result renderers for execution and waiting using native components, themes, expansion controls, and terminal-width utilities. Show a compact summary and status by default; expanded execution shows operations and readable results, never orchestration source or transport envelopes.
- [ ] Carry stable operation identity, effective command context after settings and argument hooks, and processed results through tool-owned presentation details and complete pending updates. Keep nested operations in their parent execution card; do not rely on native nested-call IDs or independent child transcript rows.
- [ ] Preserve original source and transport results in retained history and leave model declarations, result content, encoding, hook processing, and output collection unchanged. Returned presentation must respect hook edits instead of recovering removed results.
- [ ] Retain compact incremental presentation records through public entries and make routine activity entries invisible in the chat view. Completed command presentation remains recoverable from available history; no separate history store or chat-package changes.
- [ ] Keep command errors, script errors before any child, and script-emitted text readable. Distinguish command exit status from script success. Bound presentation data and show omissions using display-cell-aware clipping and wrapping.
- [ ] Use the approved real-host seam for red-before-green checks of compact/expanded command cards, hook changes and redaction, retained original content, invisible routine records, and unchanged next model request. Existing callers and selected core behavior remain valid.

## Completed baseline

**Historical status:** resolved — completed command slice; final contract verification is recorded in ticket 07

The following criteria and evidence describe the previously completed core contract. This revision supersedes its visible routine-journal presentation; it does not authorize changes to Pi or the chat package.

- [x] Create the normal self-contained package with the approved identifier and public extension entry point. Preserve the approved naming restriction and avoid extra documentation or runtime application dependencies.
- [x] Freeze the selected declarations and instructions from the identified source capture, preserving the approved omissions and recording the scoped fixture separately from the complete capture. Do not silently substitute current live declarations if the frozen source is unavailable.
- [x] Demonstrate the captured direct execution namespace, raw JavaScript input, optional execution pragma, and selected nested command signature in the actual outgoing request. Prove the public provider path before expanding the runtime.
- [x] Execute a short command with fresh JavaScript globals and the required text/exit behavior, and verify the real result in the next outgoing request. Deliver this working slice before adding continuation features.
- [x] Preserve the command result's field optionality, success and nonzero-exit behavior, output budget, launch errors, and script errors for the completed-call cases in this slice.
- [x] Use the execution context's cwd, effective shell preference and command prefix, inherited environment, managed executable path, and current Pi session metadata. Exercise explicit per-call options and effective setting overrides.
- [x] Route the nested call through public dispatch. Demonstrate blocking, argument mutation, result mutation/redaction, and normal native events; do not return raw content discarded by hooks.
- [x] Replace only enabled equivalent stock built-ins. Preserve explicit selections/exclusions, unrelated extension tools, and extension-owned overrides. Keep registered/callable tools distinct from model-visible declarations.
- [x] Apply the new surface on the next request after normal loading in both a new and existing conversation, without rewriting previous calls or other instructions.
- [x] Preserve the captured permission argument shapes without fabricating host authority, approval, or isolation. Use Pi's actual permission and extension behavior.
- [x] Reuse the real native-host fixture and controlled provider transport to verify request → command effect → next request. Leave other fixture callers intact; add no separate agent harness.

## Implementation evidence

- The normal package entry loads through the public extension loader, including from an installed `node_modules` location. Its packed files contain the JavaScript worker and frozen contract. No launcher flags or private host imports are required.
- Scoped fixture `local-core-tools-1` has canonical SHA-256 `fcfd6138dc219b03fd1afde6c0c0e981bed7ef1041096557cf61c583bc0935b7`. It remains separate from the complete capture identified in the specification. The outgoing request uses the captured namespace, custom raw-input grammar, and selected command declaration. A narrow public request hook projects these fields while the native provider retains parsing, dispatch, processing, and conversation ownership.
- The real native-host checks cover raw input and replay after deselection or an empty tool selection, unchanged unrelated history, completed and nonzero commands, Unicode truncation, text item boundaries, execution budgets, fresh modules, launch and script errors, effective settings, current environment, explicit selection and exclusion, extension ownership, argument and result hooks, later context redaction, reload into an existing conversation, and cancellation. Cancellation drains already-aborted nested calls before returning, retains processed partial output, and leaves a complete native nested-call record.
- Review reproduced relative command directories resolving from the host process instead of the owning context in both pipe and PTY calls. A shared command-boundary fix resolves explicit relative directories against the current context; the real-host regression now observes the expected file effect and next-request output in both modes. Existing checks retain omitted and absolute directory behavior, effective settings, and native hooks. One local registration helper now applies the existing ownership and exposure rules to all four nested tools in the original registration order.
- Supplemental command input/output observations are retained in the [command evidence index](../../../packages/pi-codex-tools/test/fixtures/observed/commands/index.json). Their runtime identity and observation limits are separate from the frozen contract, as recorded in the specification.
- Validation at this slice's completion: all 23 package tests pass on the installed host dependency at 1.0.2; the package type check, targeted lint and formatting checks, package packing, and an existing native-chat fixture regression pass.

## Remaining contract limits

This ticket initially verified completed scripts whose nested calls were awaited. Its original restricted description is superseded by the session-owned continuation implementation in [ticket 03](03-yield-and-resume-execution-cells.md). The frozen fixture retains the full selected baseline; final conformance is recorded in [ticket 07](07-verify-contract-and-matched-trials.md).

The initial ticket 01 command slice waited for completion and rejected PTY requests. That historical scope is superseded by [ticket 02](02-continue-interactive-commands.md), which owns process sessions, PTYs, command yield deadlines, input polling, and their current implementation status. Unavailable elevated authority remains rejected instead of creating an approval mechanism.

[Ticket 03](03-yield-and-resume-execution-cells.md) implements retained cells, waiting, notifications, timers, stored values, and explicit yielding under the approved package contract. [Ticket 06](06-verify-mixed-native-workflows.md) verifies continued work with configured companions and native session lifecycle events. Public native attribution still ends with the original parent; package-owned activity records do not claim to repair that host limitation. Ordinary completion does not silently wait for or cancel dispatched unawaited host work.

Patches and images are documented in [ticket 04](04-apply-file-patches.md) and [ticket 05](05-return-local-images.md). [Ticket 06](06-verify-mixed-native-workflows.md) verifies combined companion workflows and native lifecycle coverage; matched live-model trials are recorded in [ticket 07](07-verify-contract-and-matched-trials.md). The shared raw-call fixture setup is in [model-loop.ts](../../../packages/pi-codex-tools/test/fixtures/model-loop.ts); the existing native host remains the controlled-test agent harness.
