# 13: Give every activity item a specific summary and independent body

**Status:** resolved — approved ticket deltas implemented on `codex/activity-items-integration`; verification limits recorded below

**Rendering follow-up (2026-10-15):** The native preview correction in [Chat 04](04-render-groups.md), [Chat 05](05-bounded-render-groups.md), [Chat 12](12-mixed-session-acceptance.md), and [Core 06](../../core-tools/issues/06-verify-mixed-native-workflows.md) supersedes forced full-output expansion when an item opens. Each item now requires its own native preview/full-output control. The accepted breakdown and evidence below retain their original revision scope.

**Scope:** pi-chat and the operation facts supplied by pi-codex-tools.

**Specifications:** [pi-chat](../../../docs/specs/pi-chat.md) and [core toolset](../../core-tools/spec.md). This issue coordinates the revision across both packages. Earlier completed tickets retain their recorded scope and evidence.

## Problem Statement

Generic execution summaries and operation counts do not tell users which commands ran or which files changed. A single execution cell can contain several commands, and one patch can affect several files, while the current presentation gives them one parent disclosure. Pi's default collapsed rendering also previews results and errors when the user only wants to scan summaries.

The behavior must work for Pi's built-ins, the core toolset, and other extensions. Fixing only the core toolset's custom renderer would leave inconsistent summaries and would not deliver Pi's default expanded activity bodies. Script errors must also remain accessible without obscuring successful children or repeating their output.

## Solution

Give the render group three explicit disclosure states:

| State                               | Visible content                                                                                                                                                                                                                                                        |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Render group collapsed              | Only `>` and a group summary summarizing operation types, such as `Edited files, ran commands`.                                                                                                                                                                        |
| Render group open, operation closed | Individual rows, each initially collapsed and showing only `>` plus a specific item summary, such as `Ran git diff --check` or `Edited GLOSSARY.md +8 -1`. No result, preview, diff, image, omission notice, or error body.                                            |
| Operation open                      | That operation's Pi default expanded activity bodies, with an independent close control. Built-ins use native expanded renderers; extensions use Pi's generic default rendering. A command header may become `Ran command` because its body contains the full command. |

One tool call can yield several rows. Commands in a cell and files in a patch receive independent activity bodies. Each new activity item starts collapsed; opening or closing the group preserves existing row choices.

Pi-chat owns all tool adapters in organized internal modules and one explicit registry. Adapters describe operations from tool facts. Shared chat formatting produces item summaries and derives the group summary from their types. Unknown or unmodified extensions use a useful tool-name fallback and generic activity bodies without adopting a mandatory protocol.

The core toolset supplies the facts this requires: stable identities, effective inputs, individual outcomes, applicable activity bodies, verified per-file changes, and explicit output ownership. One separate execution activity item holds a cell's own nonempty output or error. It uses the same disclosure behavior, omits attributed child duplicates, and preserves successful child outcomes. Compact operation descriptions remain available after activity bodies are truncated.

## User Stories

1. As a Pi user, I want a collapsed render group to show only its disclosure marker and a group summary summarizing operation types, so that I can scan mixed agent activity without opening its output.
2. As a Pi user, I want an expanded render group to reveal individual activity items that initially remain collapsed, so that opening the group does not also expose their activity bodies.
3. As a Pi user, I want every collapsed activity item to show only `>` and its item summary, so that output previews, diff excerpts, images, and error bodies remain hidden until I open that row.
4. As a Pi user, I want a collapsed command activity item to identify the command, such as `Ran git diff --check`, so that I can choose the operation I need to inspect.
5. As a Pi user, I want an expanded command activity item to be allowed to use `Ran command` when its activity body shows the full command, so that the header need not repeat the body.
6. As a Pi user, I want built-in operations to use their native Pi expanded renderers, so that opening their activity bodies preserves the default command, file, and result presentation.
7. As a Pi user, I want extension operations to use Pi's generic default expanded rendering, so that an extension's custom renderer does not replace the agreed activity-body view.
8. As a Pi user, I want one execution cell's commands to have separate activity items and disclosures, so that inspecting one command does not require opening every command's output.
9. As a Pi user, I want one patch's changed files to have separate activity items and disclosures, so that I can inspect a single file's change independently.
10. As a Pi user, I want every expanded activity item to remain closable by mouse and keyboard, so that inspection never leaves a permanently open body.
11. As a Pi user, I want newly arriving activity items to start collapsed while existing row choices survive updates and group collapsing, so that streaming preserves my chosen disclosure state.
12. As a Pi user, I want built-ins and extensions to pass through the same activity-item and grouping path, so that summaries and disclosure behavior stay consistent across tool providers.
13. As a Pi user, I want an unmodified or unknown extension to receive a useful tool-name fallback and generic activity bodies, so that it remains usable without implementing a new provider protocol.
14. As a package operator, I want named tool-adapter modules and one explicit registry inside pi-chat, so that I can find and change a mapping without editing unrelated providers or chat layout code.
15. As a package operator, I want the supported mappings, selection rules, and fallback behavior documented together, so that I can add or adjust an adapter with predictable results.
16. As a Pi user, I want confidently recognized reads, searches, and listings classified consistently across command providers, so that equivalent operations receive equivalent item summaries.
17. As a Pi user, I want ambiguous commands and unreliable tool provenance to retain honest fallback descriptions, so that the chat does not invent action semantics.
18. As a Pi user, I want edit item summaries to show verified additions and deletions when available and omit unavailable counts, so that a concise summary remains accurate.
19. As a Pi user, I want partial patch failures to preserve each file's actual outcome, so that completed edits are not confused with failed or unattempted changes.
20. As a Pi user, I want an execution cell's own output or error in one separate execution activity item, so that I can inspect script-level content independently of child operations.
21. As a Pi user, I want empty execution activity items omitted and attributed child output excluded from them, so that the render group contains useful entries without repeated output.
22. As a Pi user, I want genuine script-owned output preserved even when its text matches child output, so that text-based duplicate detection does not silently discard information.
23. As a Pi user, I want an execution failure before any child starts to remain accessible through an initially collapsed activity item, so that an empty operation list cannot hide the error.
24. As a Pi user, I want a script failure to leave successful child commands successful, so that the parent outcome does not misrepresent completed agent activity.
25. As a Pi user, I want progress and late outcomes to update the originating operation without moving or duplicating it, so that yields, waits, and later prompts preserve attribution.
26. As a Pi user, I want compact operation descriptions retained when activity-body output is omitted, so that rows and group summaries still describe all known agent activity.
27. As a Pi user, I want an omission notice only inside the expanded activity body of an affected item, so that truncation is explicit without violating summary-only collapsed activity items.
28. As a Pi user, I want reliable retained facts to reconstruct the same operations after reload or branch changes, so that history remains useful without rerunning tools or fabricating missing activity bodies.
29. As a Pi user, I want Find and copying to respect operation source references and disclosure state, so that inspection targets the correct result and copied ranges exclude collapsed bodies.
30. As a Pi user, I want summaries and activity bodies to reflect effective inputs and authoritative processed results, so that hooks, replacements, and redaction are respected.
31. As a Pi user, I want images to appear once through the appropriate expanded native activity body and obey image preferences, so that independent rows do not duplicate or leak image output.
32. As an agent, I want presentation updates to preserve tool results, collection cursors, and provider requests, so that showing progress introduces no extra calls, polling, or unsolicited turns.
33. As a Pi user, I want the same behavior in both extension load orders and after settings or session changes, so that adapter ownership does not depend on initialization order.

## Implementation Decisions

1. **Package ownership.** Keep built-in, core-tool, and generic fallback adapters and their registry inside pi-chat. Provider-specific decoding stays inside these adapters; grouping, summaries, and disclosure consume one common activity-item model. The core toolset exposes factual data and owns execution. It does not own chat adapters, group summary formatting, or command classification. Do not introduce a shared adapter package or a mandatory extension protocol.

2. **Operator workflow.** Use named adapter modules, one explicit selection registry, and one catalog maintained in the chat specification. Document supported mappings, required facts, selection rules, and fallback behavior together. Adding or changing a mapping should not require editing unrelated providers or layout code. Specific selection requires reliable identity and provenance; replacement or unknown tools fall back when those facts are unavailable.

3. **Activity-item contract.** Carry stable identity, source references, initial order, operation type, action and target facts, actual lifecycle status, optional verified change statistics, and applicable activity-body content or references with explicit availability. Call, execution-cell, process, and file identities preserve ownership without imposing a one-item-per-call rule. The model-facing tool messages and session projection remain unchanged.

4. **Summaries and grouping.** Derive group summaries from all included operation types and the execution activity item where present. Preserve established ordering and distinct-target rules; running agent activity changes the relevant wording without replacing the group summary with one activity item's summary. Closed item summaries identify the action and target. Share conservative read, search, and listing classification across command providers. Ambiguous commands retain the command itself. Do not classify orchestration source, rendered output, or unknown tools by name alone.

5. **Independent activity bodies.** A collapsed activity item is an owned summary-only header, not Pi's collapsed preview. Opening it uses Pi's public default activity-body component with native built-in renderers or generic default rendering for an extension. Neither the existing custom execution call renderer nor its custom result renderer supplies that body. Keep mouse and keyboard opening and closure independent for every operation and execution activity item, including closure through native activity-body interactions. A split row receives only its applicable input and result, not a repeated aggregate cell or patch body.

6. **Disclosure lifetime.** Retain the outer disclosure for singletons. Groups and new activity items begin collapsed, including while running. Reuse existing disclosure navigation and explicit global expansion. Preserve row choices through updates, completion, resize, and group collapsing; whole agent activity collapsing remains independent. Reset manual state at the existing reload/restart boundary. Preserve bounded activity scrolling and native focus behavior.

7. **Provider fact publication.** Extend existing execution, process, patch, worker-output, and retained-result responsibilities only where they lack required facts. Use documented Pi event-bus updates and reliable retained result/activity records. Updates must arrive even when the custom execution renderer was never instantiated. Routine journals remain invisible and do not create standalone rows or group boundaries.

8. **Per-file changes.** Preserve actual action, target, individual outcome, and available activity bodies for every known patch file, including completed agent activity before a later failure. Distinguish unattempted or failed changes from success. Counts are optional and must come from verified change data; do not infer them from intent or reread current disk contents during rendering. Preserve the core toolset's existing mutation and partial-failure semantics.

9. **Execution-owned content.** Preserve producing-operation or script ownership before serialization loses it. Put genuinely script-owned output and errors in one nonempty execution activity item. Omit empty entries and attributed child duplication. Matching text alone cannot justify removing genuine script output. A script error before any child starts remains inspectable, and a later script failure does not turn completed children into failures. Keep existing output order, returned results, and failure semantics.

10. **Continuation and recovery.** Keep commands in initial operation order and apply later progress and outcomes to their original rows through yields, waits, input, and later prompts. A process handle is not a successful exit. Input or collection retains its meaningful outcome without moving or replaying the command body. Recover the latest reliable facts on the active branch without rerunning tools or restoring live resources.

11. **Bounded activity bodies and honest history.** Bound activity bodies separately from compact operation descriptions. Existing output, settled-operation, or patch-detail windows must not erase known command/file rows or known outcomes. Explain unavailable or omitted bodies only inside the affected opened entry. Older history falls back to available original facts without inventing operations, counts, outcomes, or payloads.

12. **Authoritative data and surrounding behavior.** Respect effective arguments, provenance, hooks, processed results, and later context redaction. Preserve the accepted distinction that live output can be visible before result hooks run; retained or returned activity-body rendering must not restore removed content. Preserve Find/source binding, copy boundaries, final responses, unrelated notices, themes, padding, image preferences, and one visible image owner. An image collected by a later wait keeps its approved native collecting-result placement; path and status remain associated with its origin.

13. **Execution and lifecycle limits.** Presentation observation must not consume output, alter cursors or limits, poll for display, dispatch extra calls, or create failure alerts or unsolicited model turns. Dispose subscriptions and retained component references with their owning session. Preserve the public tool lifecycle and contract. Pi 1.1.0 is the primary verified host target with secondary 1.0.2 coverage; later versions remain capability-based and require behavioral verification. Existing standalone core-tool rendering is not the acceptance surface for chat activity bodies.

## Testing Decisions

1. **Reuse the approved seam.** Run both packages through the existing real Pi InteractiveMode and AgentSessionRuntime fixture with a controlled provider and the normal extension loader. Use both load orders and the same host path for built-ins and an unmodified deterministic extension. Observe real tool effects, fresh terminal frames, persisted entries, clipboard output, and the next provider request together. No new primary seam or simulated chat host is needed.

2. **Assert external behavior.** Check the three disclosure states, exact action/item summaries, individual outcomes, and independently operable mouse/keyboard controls. Compare opened activity bodies with Pi's default component for the corresponding native or generic renderer and applicable payload. Assert fresh closed frames contain no preview, output, diff, error, image, or omission body. Tests should not prescribe adapter class shapes, private maps, callback counts, or registry array structure.

3. **Reuse prior art.** Adapt affected existing native-chat, mixed-session, command/process, patch, image, source-search, and lifecycle cases. Use temporary assert-based probes for focused gaps. Add no new test cases, files, or seams without a separate request. Existing tool-contract and hook checks establish that presentation changes leave model requests, results, and collection behavior intact.

4. **Exercise the hard cases together.** Cover multiple concurrent commands completing out of order; one patch changing multiple files; partial failure and missing counts; a cell's own text; an empty cell result; propagated child output; equal but genuinely script-owned text; a script error before children start; and a script failure after a successful child. Retain all compact rows beyond former command/file windows and show omissions only in opened activity bodies.

5. **Verify live and retained behavior.** Observe output before a pending command returns, after a yield, after cell settlement with a live process, and during a later prompt. Collapsed activity items remain summary-only throughout. Wait or input from another cell updates the original command without consuming or duplicating output. Repeat through reload, branch/session changes, cancellation, settings changes, and both extension load orders. Verify provenance, hook-modified inputs, redacted results, unknown-tool fallback, Find/copy, native image ownership, and unaffected notices/final responses.

6. **Keep evidence scoped.** Temporary component probes on Pi 1.0.2 and 1.1.0 already demonstrated independent summary-only command/error rows, native and generic expanded activity bodies, native body-click closure, and state preservation through updates. They do not establish combined chat integration, per-file projection, full output attribution, replay, or physical-terminal behavior. Run affected existing host checks and configured-terminal acceptance before claiming this revision complete. Record unavailable checks explicitly. Repeat broader model trials only if execution or the model interface changes.

## Out of Scope

- Moving adapters or chat summary formatting into the core toolset, creating a shared adapter framework, or requiring all extensions to adopt a new protocol.
- Preserving the current custom execution body as the chat's expanded activity bodies, exposing default collapsed previews, or forcing one output control per cell or patch.
- Redesigning the core model contract, output collection, patch mutation semantics, approvals, or notification behavior.
- A Pi fork, edits to installed Pi source, a replacement application, new presentation settings, or an alternate transcript view.
- General shell parsing, inference from rendered output or orchestration source, guessed change counts, or speculative adapters for absent tools.
- Retrofitting missing data into old history, persistent manual disclosure preferences, or additional documentation outside the existing glossary, ADR, specification, and ticket workflow.
- Reopening unrelated completed agent activity or treating earlier aggregate-renderer checks as acceptance of this revision.

## Further Notes

The vocabulary follows the [glossary](../../../GLOSSARY.md). The governing decisions are [chat operation ownership and default activity bodies](../../../docs/adr/0019-tool-renderers-own-tool-presentation.md), [activity ordering](../../../docs/adr/0013-transcript-activity-order-and-inline-thoughts.md), [group lifecycle](../../../docs/adr/0020-render-group-lifecycle-and-singleton-preservation.md), [bounded activity scrolling](../../../docs/adr/0021-bounded-render-group-scrolling.md), [native rows in the owned chat](../../../docs/adr/0022-native-rows-in-an-owned-transcript.md), and [core-tool lifecycle and facts](../../../docs/adr/0024-core-tools-use-native-extension-lifecycle.md).

The approved graph updates existing tickets while retaining their earlier evidence: Chat 04 → Core 01 → Core 02 → Core 03; Core 04 follows Core 01; Core 05 follows Core 03; Chat 10 follows Core 03–05 and gates Chat 11; Chat 12 and Core 06 combine acceptance; Core 07 verifies the contract and reviews the integration. Each delta delivers a usable path through provider facts, adapters, presentation, and existing host checks.

The primary chat specification and companion core specification supersede earlier one-item-per-call, shared-parent-body, built-in-only summaries, and custom-renderer-preservation requirements for this revision. The approved deltas are resolved at production revision `f6004ab` on the integration branch. [Chat 12](12-mixed-session-acceptance.md) records combined and physical acceptance; [Core 07](../../core-tools/issues/07-verify-contract-and-matched-trials.md) records final checks, six resolved review findings, and two unrelated full-repository failures reproduced on the starting commit. Earlier tracker sections retain their original evidence and pending physical checks.

Primitive strings do not preserve producing-operation identity. A string returned by a tool or hook, or caught as a rejection, can appear in both child and execution bodies when emitted through `text`. The implementation keeps the existing helper contract and does not discard equal but potentially genuine script text. Object-owned forwarding is attributed; complete primitive attribution is not claimed. The [provider fact schema](../../core-tools/spec.md#provider-facts-for-chat) records the precise limit.
