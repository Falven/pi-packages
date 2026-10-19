# 01: Align command arguments and explicit shell selection

**What to build:** A command accepts the same arguments and selects the same explicit shell as the reference, then exposes its actual output, failure, and effective command context through the complete model loop.

**Specification:** [Core toolset](../spec.md), especially implementation decisions 12, 14, 15, and 33 and testing decisions 18–19.

**Decision:** [Accepted behavior alignment](../../../docs/adr/0030-core-tool-behavior-parity.md).

**Blocked by:** None (can start immediately). The existing command and public-dispatch implementation is complete.

**Status:** claimed — Core 01 delta implemented in the isolated command worktree; exact diagnostics and integrated comparison gates remain open

## Behavior alignment — 2026-10-18

This updates the existing approved command slice. The current requirements supersede conflicting historical requirements below; earlier passing checks do not verify this revision. Work stays in the extension and its existing public-host seam. Pi source, installed packages, private runtime behavior, global settings, and version requirements must remain unchanged.

- [x] Validate original command arguments through public argument preparation before Pi can coerce them. Require a string command; reject incorrect primitives, invalid array members, fractions, and out-of-range numeric values under the reference's field rules. Preserve the distinction between an argument error, a launch error, and a nonzero command exit.
- [x] Match null, omission, and zero separately. Command yield defaults to 10,000 ms and tty to false; both reject null. Optional command fields and output budgets retain their native nullable/default behavior and applicable unsigned ranges. Ignore unknown keys in the scoped object call while preserving every frozen declaration, including its captured additional-property restriction.
- [x] Keep public nested dispatch, blocking, argument edits, result replacement/redaction, permissions, and explicit tool selection authoritative. Reuse existing non-coercing facilities; do not add a validation framework, parser copy, or unsupported authority. Share only validation that the other slices actually need.
- [ ] Apply the complete explicit-shell rule before launching: infer the supplied name's shell kind, discover an installed executable in reference order, and use the platform fallback when the kind is unknown or unavailable. On the audited platform, account-shell, PATH, and family fallback precedence must match.
- [x] Apply that rule even when the supplied path exists. Reproduce the existing-custom-wrapper case against the pinned runtime before treating source inspection as runtime evidence. Cover recognized families, missing recognized paths, unknown names, relative names, and discovery precedence.
- [x] With shell omitted, preserve Pi's configured shell and existing default behavior. Keep command text, the once-applied prefix, owning working directory, inherited environment, session metadata, login options, and pipe/PTY selection. Report the actual selected executable in effective inputs after argument processing.
- [x] Launch once. A missing working directory or another launch failure must not trigger a shell retry or a second execution. Invalid command arguments must produce no marker or process effect. Measure public-boundary error diagnostics; disclose unavailable raw-parser information instead of modifying Pi or masking differences.
- [ ] Verify request → public dispatch → real command effect → processed result → next request with the existing command and presentation cases and temporary diagnostics. Check exact result fields, errors, effective inputs, hook edits, and retained source alongside real effects. Add no new test cases, files, or harness.

**Evidence to record:** Targeted paired inputs/results, actual executable and launch count, effect checks, runtime/source identities, and relevant existing checks. Record unresolved differences explicitly. This ticket owns command validation and shell selection; the other behavior tickets own their own entry boundaries.

**Current verification:** Implementation is ready for integration with the explicit open gates below. Resumed after the worker transport restart, preserving the original claim. Branch `codex/core-command-alignment`, HEAD, integration ref, and merge base all confirmed initially at `6c775356361cf89bf247f7eb9f1dc31a16cb912e`; the earlier Git metadata sandbox denial no longer blocks this worktree. Implementation uses the approved real public-host/model-loop seam, existing assertions and isolated diagnostics under `/tmp/pi-core-alignment-20261018-a7r6fk0i/command/`. No shared differential/live runner or final Phoenix publication runs in this worktree.

**Current scope:** Command preparation and shell selection in `src/command.ts`; its sole registration caller is `src/index.ts`, and commands reach it through `ExecutionCells`' public `ctx.executeTool()` dispatch. Shell-family launch arguments use the narrow `ProcessSessions.start()` options boundary in `src/process.ts`. Update existing command/presentation assertions only. Core 02 retains stdin validation and process collection ownership. Pi source/runtime code, dependency requirements, frozen declarations, and historical evidence are not change targets.

**Implementation and focused evidence (2026-10-18):** `prepareArguments` uses the installed non-coercing TypeBox checker, retains invalid array members for rejection, removes only ignored fields and accepted optional nulls, and bounds command yield/output numbers below `2 ** 64` without imposing the pragma's safe-integer rule. Explicit shell resolution follows the pinned Unix family/account/PATH/fallback rules before launch, including existing paths, recursive filename suffixes, and relative names. Command construction supplies the selected family's argument vector to the existing process launcher; no stdin/collection logic changes. The README records the custom-wrapper migration behavior. Existing command/presentation cases were updated; no permanent test case, fixture, or harness was added.

**Integration sync:** `git merge --no-edit codex/core-tool-behavior-parity` fast-forwarded to `3c4a6c946e82a8c03dfca8c5eabff1b9326ff629`, incorporating Core 04 without conflicts or loss of the current claim. All four changed command/contract/presentation cases and workspace typechecking pass afterward (`post-merge-focused.log`, `post-merge-typecheck.log`). A final merge incorporated the documentation-only integration update `1d39dda08b938681b0cda7b55970509390fdd143`; runtime files did not change. The 68-case focused run and 223-case full run below preceded those merges; their source changes are limited to this command delta on the original `6c77535` base.

Evidence is under `/tmp/pi-core-alignment-20261018-a7r6fk0i/command/`:

- `validation-red.json` records 46 invalid inputs and 25 actual launches before the fix. `validation-green.json` records rejection of all 46 before any launch and acceptance of seven default/null/unknown-key/unsigned-boundary inputs. Zero-budget output also matches a direct pinned-runtime probe after removing only volatile fields.
- `shell-red.log` fails the existing settings case because an explicit custom wrapper ran. `shell-green.log` passes. `shell-discovery-red.json` exposes incorrect PowerShell launch flags; `shell-discovery-green.json` verifies 22 real-host cases, effective executable metadata, prefix and command effects, account-shell/PATH/fallback precedence, family flags, no retry after a nonzero exit, and no execution with a missing cwd.
- `identities-before.json`, `reference-shells.json`, `reference-shell-effects.json`, `reference-validation.json`, and `reference-boundaries.json` identify direct probes through the active bundled runtime. Its executable hash matches the audit (`1afb28c01d7d49e892bd75f11076b10f1451e34e0ee308a95e5ab7f69f9c84fe`, version `0.163.0-alpha.10.2`). Existing executable custom wrappers were skipped in pipe and PTY modes; recognized existing/missing/relative Bash requests selected `/bin/bash`. All seven effect markers contain one command execution and the wrapper marker is absent. Unavailable Cmd/PowerShell kinds selected `/bin/sh`.
- `focused-tests.log`: all 68 existing command/presentation checks pass, including blocking, shell/command argument edits, result replacement, context redaction, retained source, selection, and cleanup. `core-suite.log`: 222/223 pass; one Ctrl+C workflow assertion observed `READY\nAFTER\nSTOPPED\n`. Both load-order variants pass on the focused rerun in `workflow-interrupt-rerun.log`. The full run is not reported as passing; signal behavior remains with Core 02 and integrated acceptance with Core 06.
- Package and workspace typechecks, targeted lint/format checks via the existing binaries, and `git diff --check` pass. Exact commands, source identities, and reference requests are indexed in `REPORT.md` in the evidence directory. A `pnpm exec` attempt unexpectedly entered automatic dependency setup and failed on the symlinked hoist directory before any static check ran. Checked Pi source/package hashes and versions are unchanged; generated dependency-launcher timestamps advanced in the shared tree, without a prior content hash to establish their byte identity or attribution. `dependencies-after-pnpm-attempt.json` records that limit. No further package-manager command or dependency repair was attempted.

**Open acceptance:** `immutable-replay.json` replays 11 immutable captured command inputs through the public host. All return-versus-reject outcomes agree, and four normalized payloads match exactly (unknown key, nullable budget, missing shell, and raw-object-string rejection). Seven argument-error strings differ: the extension returns TypeBox field diagnostics, while the reference includes its JSON parser wording and byte positions. The public preparation hook receives parsed values, not original JSON spelling/duplicate keys/positions; no replacement parser or fabricated positions was added. Missing-cwd launch error framing also remains different (`spawn <selected shell> ENOENT` versus the reference's `CreateProcess` rejection). These are unresolved differences, not comparison allowances. Native PATH/account/fallback precedence and installed PowerShell/Cmd argument-vector paired probes remain requested from root in `reference-probe-requests.json`. The real-host checks and pinned-source implementation do not replace those fresh paired captures. Root owns the serialized targeted/full matrix, live tasks, and Phoenix publication. The two open checklist items must not be marked verified from this worker's evidence.

### Additional paired findings — 2026-10-19

The fresh argument run at `ea67f6d` preserves the original requests and all121 inputs across four cases. Native nested calls retain JavaScript object insertion order; sorting keys changes error columns. String-target numeric errors and numeric-target errors also use different native descriptions. [Detailed findings](/tmp/pi-core-alignment-20261018-a7r6fk0i/parent-additional-arguments.md) point to the complete new raw captures. The original “ignored properties” row contains `additional_permissions`, a recognized native field outside the frozen selected declaration. Keep that observation separate from the genuine extra-only case; it does not authorize adding a permission surface.

The [controlled shell run](/tmp/pi-core-alignment-20261018-a7r6fk0i/parent-controlled-shell-evidence.md) verifies account/PATH selection and the supplied flag vectors with disposable executables. Bash, Zsh, Sh, Cmd and nonzero-without-retry results match. Three PowerShell results expose a remaining implementation fix: native prepends `try { [Console]::OutputEncoding=[System.Text.Encoding]::UTF8 } catch {}\n` once unless the trimmed command already starts with that exact prefix. The five-case argv capture also covers already-prefixed and whitespace-prefixed commands. These are executable-selection/argv observations, not real PowerShell/Cmd language validation. Preserve the prefix in the actual launch arguments and verify the complete payload again.

## Historical revisions

Everything below records prior requirements and verification. It remains historical where it conflicts with the current revision above.

**Previous title:** 01: Execute a command through the complete model loop

**What to build:** Inspect each completed command independently in the chat, with a separate entry for genuinely script-owned output or errors and an unchanged model contract.

**Specification:** [Core toolset](../spec.md).

**Blocked by:** Chat 04: common activity-item path.

**Status:** resolved — approved activity-item delta; earlier evidence retained below

## Activity-item delta — approved 2026-10-15

- [x] Publish factual operation updates independently of custom renderer subscription and document their schema through Pi’s event bus and retained results/activity records.
- [x] Project several commands in one execution cell into stable ordered activity items with applicable effective inputs and processed results, using generic default expanded bodies.
- [x] Preserve output ownership before serialization: omit attributed child duplicates and empty execution entries, retain genuine script text even when equal to child output, and expose pre-child script failures.
- [x] Keep successful children successful after a script failure and respect authoritative result hooks and model-facing output.

**Revision evidence (2026-10-15, `f6004ab`):** Public `core-tools.activity` updates and retained execution records publish operation identity, effective inputs, actual outcome, and applicable processed content without requiring a custom renderer subscription. Pi-chat creates ordered, independently disclosed command items and a separate nonempty execution item for script-owned content. Result metadata is checked against processed content before retained facts are reused; malformed or removed metadata uses the generic processed-result fallback. Successful children retain their outcomes after a script failure, including failures before any child starts.

Object identity attributes forwarded child results before serialization; empty entries and explicitly attributed child duplicates are omitted. Primitive values have no identity, so a string result or rejection emitted through `text` can also appear in the execution body. Text equality is not used to discard it, and the native helper contract remains unchanged. This limit is documented in the [provider fact schema](../spec.md#provider-facts-for-chat), rather than presented as complete primitive attribution. Existing command, presentation, workflow, hook, and contract checks pass; [ticket 07](07-verify-contract-and-matched-trials.md) records exact integrated verification.

## Earlier revision

**Recorded status:** resolved — completed command presentation delta; completed baseline retained below

**Original delivery:** Add a compact native execution card for a completed command, with readable command, effective directory, output, and exit status while preserving the original model interaction and retained source.

## Presentation delta

- [x] Register parent call/result renderers for execution and waiting using native components, themes, disclosures, and terminal-width utilities. Show a compact summary and status by default; expanded execution shows operations and readable results, never orchestration source or transport envelopes.
- [x] Carry stable operation identity, effective command context after settings and argument hooks, and processed results through tool-owned presentation details and complete pending updates. Keep nested operations in their parent execution card; do not rely on native nested-call IDs or independent child transcript rows.
- [x] Preserve original source and transport results in retained history and leave model declarations, result content, encoding, hook processing, and output collection unchanged. Returned presentation must respect hook edits instead of recovering removed results.
- [x] Retain compact incremental presentation records through public entries and make routine activity entries invisible in the chat view. Completed command presentation remains recoverable from available history; no separate history store or chat-package changes.
- [x] Keep command errors, script errors before any child, and script-emitted text readable. Distinguish command exit status from script success. Bound presentation data and show omissions using display-cell-aware clipping and wrapping.
- [x] Use the approved real-host seam for red-before-green checks of compact/expanded command cards, hook changes and redaction, retained original content, invisible routine records, and unchanged next model request. Existing callers and selected core behavior remain valid.

## Presentation evidence

- Eight real-host/provider/native-screen checks verify compact and expanded completed-command cards, effective argument mutation, child and parent result redaction, readable emitted command envelopes alongside script text and errors, nonzero command status distinct from successful script completion, failures before dispatch, retained completed presentation after reload, hidden routine records, missing-cell wait errors, and bounded Unicode output at a narrow terminal width. Original orchestration and the next model request remain unchanged.
- Effective command and directory metadata cross the public nested-update/result boundary. Presentation records use package-owned operation identity, retain bounded processed results incrementally, and omit routine chat rows. The returned card checks its original content fingerprint before using retained details, so a parent result hook cannot leave stale operation output visible merely by replacing content.
- Validation: all 156 package checks passed in the completed full run. The subsequent native-error-context correction also passes all eight presentation checks, including a missing-cell wait failure and an explicit display-width assertion. Package type checking, targeted lint, formatting, and diff checks pass. Live process streaming, continued ownership, and history reconciliation are delivered by the following tickets; a physical-terminal check has not been run in this slice.

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
