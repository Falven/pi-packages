# Generic tool activity

**Status:** ready-for-agent

**Tracker:** [01: Generic operation presentation](../../.scratch/tool-activity/issues/01-generic-operation-presentation.md) → [02: Command continuation](../../.scratch/tool-activity/issues/02-command-continuation.md) → [03: Retained source and replay](../../.scratch/tool-activity/issues/03-retained-source-and-replay.md).

## Problem Statement

A tool call is a request from the model. An operation is the work that request starts. Collecting an operation's output is another tool call, but usually no new work. The current chat exposes collection receipts and empty execution completions as actions. It also decodes the toolset's private records and recognizes its package paths, so the two packages cannot evolve independently.

## Solution

Use a small optional data contract for operations. Providers publish facts; chat decides how to display them. Repeated output collection updates the original command. Only meaningful actions and independently owned output appear. Unmodified providers retain generic presentation. Both packages depend on the neutral contract, never on one another.

The reference is the installed ChatGPT.app's command activity: output updates an existing command record; terminal input accumulates into submitted actions on that record; the UI can show several meaningful actions. This does not imply one row per process. Source inspection supports these behaviors, not exact visual parity for every script, error, or image case.

## User Stories

1. As a user, I want a command's output and late outcome to update its original activity, so I can follow the work across prompts.
2. As a user, I want successful polls and empty execution completions to add no action, so I can see what actually happened.
3. As a user, I want submitted terminal commands to remain associated with their original operation, so input does not become an unrelated collection receipt.
4. As a user, I want a command or file heading above its native output, so raw orchestration arguments do not obscure the result.
5. As a user, I want script-owned output and errors to remain inspectable, including an error before any child starts.
6. As a user, I want successful child outcomes to survive an unrelated script failure.
7. As a user, I want images to appear once through native image handling, including images collected later.
8. As a user, I want Find to reveal original calls and results even when they produce no activity item.
9. As a user, I want reload and branch navigation to preserve known facts without restarting work or inventing a live state.
10. As a provider author, I want to publish activity without knowing which chat consumes it.
11. As a chat maintainer, I want unrelated providers to use the same interface without adding tool names or private schemas to chat.
12. As a user of an unmodified provider, I want missing or invalid metadata to retain generic presentation and authoritative output.

## Implementation Decisions

- **Boundary.** A neutral package contains pure data types, validation, content binding, and protocol identifiers. It has no UI, dispatch, polling, registration framework, or dependency on either participating extension. Pi's existing result details, event bus, and retained custom entries carry the contract.
- **Identity and updates.** Facts identify the originating call and session, revision, and ordered operations. Each operation has stable identity, semantic kind, actual status, applicable inputs and bounded output, optional verified edit counts, and explicit omitted-body state. Meaningful submitted command actions retain their process ownership. Incremental retained updates do not repeat growing execution snapshots or image bytes.
- **Selection.** A valid record with zero operations deliberately suppresses a receipt. Absent, invalid, or unsupported metadata falls back to the native generic call. Tool names, package manifests, and private producer formats are not consumer selection rules. Native built-ins retain their existing verified adapter.
- **Result authority.** Bind result metadata to the processed content and activity facts. These are consistency checks, not authentication. Native image normalization may change bytes and add known hints; image placement always uses the actual processed content. Missing or invalid bindings prevent journal facts from restoring content discarded by result hooks.
- **Presentation.** Commands, edits, and images retain their semantic summaries and independent disclosures. The open body has a semantic heading and Pi's generic default result preview/full control. Genuine independent output and failures remain accessible. Empty orchestration receipts and successful empty polls add no action; meaningful input updates originating command facts. No display setting or custom output viewport is added.
- **History and search.** Keep original calls, arguments, results, and model context unchanged. Reconcile reliable active-branch records by identity and revision. Stale running history becomes unknown. Find temporarily materializes native source for a zero-item call, then removes that view when selection leaves it. No source navigation executes tools.
- **Compatibility.** This is an optional interface. Existing standalone tool rendering and public tool contracts remain supported. Older history without this metadata uses generic fallback; no migration or invented operations are required.

## Testing Decisions

Use the existing real-Pi host fixture as the main seam. Extend its mixed command, file, image, hooks, load-order, continuation, and reload cases. Add a focused public-contract check and an unrelated provider with arbitrary tool names to establish package independence. A subscriber without chat must receive useful live facts. Check invalid metadata, empty projection, late failures, single-owner images, and retained-source Find. Follow the invoked implementation workflow's red/green cycle; do not add a parallel UI harness or broad live-model trials for unchanged execution contracts.

## Out of Scope

New tools, execution behavior, permission or cancellation changes, display-driven polling, automatic notifications, new chat settings, full application visual parity, old-history migration, custom output controls, and a general plugin or adapter framework.

## Further Notes

The [reference plan](../plans/core-tool-activity-alignment.md) records source evidence and known limits. [ADR 0019](../adr/0019-tool-renderers-own-tool-presentation.md), [ADR 0024](../adr/0024-core-tools-use-native-extension-lifecycle.md), and [ADR 0016](../adr/0016-search-retained-transcript-content.md) govern the boundary, continuation, and source navigation. This delta supersedes package-specific extension adapters and collection/execution receipt rows in the [chat specification](pi-chat.md) and [toolset specification](../../.scratch/core-tools/spec.md); earlier validation remains scoped to its recorded revision.
