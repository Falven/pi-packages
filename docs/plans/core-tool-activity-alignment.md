# Generic tool activity aligned with ChatGPT.app

Draft revised 2026-10-16. Repository baseline: `6013382`. This revision replaces the earlier proposal to add more tool-specific rules to `pi-chat`.

The user requires a generic interface. Neither `pi-chat` nor `pi-codex-tools` may depend on knowledge of the other package. ChatGPT.app's command activity is the behavior reference; the work does not introduce alternative display preferences.

## Setting and terms

The agent uses tools to do work. The tool package runs that work. The chat package shows its progress and results.

Use the existing [glossary](../../GLOSSARY.md):

- **Tool call:** one request to a tool, with its inputs and result.
- **Operation:** the work being done, such as running a command or changing a file.
- **Activity item:** a row in the chat that shows an action or result.
- **Execution cell:** a script execution that can call tools and return before all commands it started have finished.

These are different units. Starting `pnpm test` and checking its output three times requires several tool calls. Those checks do not run the tests again.

In the screenshot, “Collected output” describes a collection call. “Execution completed” describes the execution cell's status. It does not prove that a command started by that cell has finished.

## What is wrong today

The [core adapter](../../packages/pi-chat/src/tool-adapters/core-tools.ts) recognizes specific tool names and checks whether their package is named `pi-codex-tools`. It creates collection activity items for `wait` and empty `write_stdin` calls. The [summary code](../../packages/pi-chat/src/item-summary.ts) gives them the labels in the screenshot.

The chat also reads the tool package's private execution format in [core-activity.ts](../../packages/pi-chat/src/tool-adapters/core-activity.ts) and subscribes to its private activity channel in [index.ts](../../packages/pi-chat/src/index.ts). Changing these special cases would retain the dependency the user rejected.

An execution activity item is currently conditional on script output, an error, or an image. It is not an automatic receipt for every completed script. The expanded raw arguments come from Pi's generic tool rendering.

## ChatGPT.app reference

Inspected the installed `/Applications/ChatGPT.app/Contents/Resources/app.asar`, package version `26.1007.71326`.

Its `webview/assets/app-shared-8340f229c2b3.js` provides direct evidence:

| Code path                     | Observed behavior                                                                                                                   |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `applyOutputDeltas`           | Finds the existing command record by item ID and updates its accumulated output.                                                    |
| `applyTerminalInteraction`    | Associates submitted terminal commands with the existing command record.                                                            |
| `commandExecution` projection | Builds displayed command actions from that record's actions, output, and status. One record can contain several meaningful actions. |

The [official item model](https://learn.chatgpt.com/docs/app-server#items) also defines command identity, status, output, and exit code. Its [output event](https://learn.chatgpt.com/docs/app-server#item-deltas) updates an existing item.

The target is therefore stable operations with continuing results. It is not a blanket “one row per tool call” or “one row per process” rule. For the simple test command above, repeated collection adds no new command action.

This is a source inspection, not a live comparison. Before finalizing less common cases, compare script-only output, script errors, collection failures, cancellation, and image delivery with the app. Do not invent “Script output” or “Script failed” headings and call them app parity.

## Proposed interface

Use a small neutral contract package, provisionally `pi-activity`. It contains the shared data types, validation, and protocol identifiers. Both packages use this contract. It contains no tool implementations, chat components, package allowlists, or tool-name rules.

The contract describes:

- The source tool call and session.
- Each operation's stable identity, revision, action, state, and available result.
- Which operation owns output or input, including updates received through later calls.
- Whether a call has supplied a complete operation description, which may contain zero operations.

The last distinction matters: an explicitly described collection call can add zero operations. Missing or invalid metadata must still use Pi's generic display.

Use Pi's existing result metadata, public event bus, and custom history entries to carry the contract. Result metadata supplies the recorded snapshot. Events supply live changes, including changes after the initiating call returns. History entries retain later changes. These transports already exist; no new dispatch system or UI framework is needed.

Responsibilities are:

| Component                                | Responsibility                                                                                                      |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Tool package, including `pi-codex-tools` | Translate its own execution state into the common operation records. Keep command state separate from script state. |
| Shared contract                          | Define and validate the records and their ownership rules.                                                          |
| Chat package, including `pi-chat`        | Turn those records into activity items and apply the app's display behavior.                                        |
| Other tools or displays                  | Use the same contract without either package being installed.                                                       |

For example, the provider reports “operation A started,” “operation A has more output,” and “operation A finished.” The chat updates the activity for A. It does not need to know whether those updates came from `exec`, `wait`, `write_stdin`, or a differently named tool.

Shared action kinds may include commands, file changes, images, and generic tool actions. They describe the work, not the package that supplied it. Keep styling, summaries, disclosure state, and Pi components in the display package.

## Work sequence

1. **Record the app reference cases.** Compare the screenshot scenario and the uncommon cases above. Use the findings as acceptance criteria, including expanded content. The earlier four display-preference questions are withdrawn.
2. **Define the smallest shared contract.** Cover zero/multiple operations, later updates, native source identity, independent outcomes, and result ownership. Preserve validation after result hooks. Do not infer ownership by matching output text.
3. **Make the tool package publish the contract.** Reuse its existing process observers and execution records. Keep its private worker and process details private. It must work without `pi-chat`.
4. **Make the chat consume the contract.** Replace its package-specific adapter, decoder, and event subscription. Reuse its current activity items, command classification, grouping, native output controls, and generic fallback. Remove obsolete special cases.
5. **Preserve history and navigation.** Keep original calls and results. Use source identities to keep Find, copy, disclosure state, and later updates correct. Older history without the shared metadata keeps the generic display; no automatic migration is planned.
6. **Update the existing specifications and verify.** Revise [ADR 0019](../adr/0019-tool-renderers-own-tool-presentation.md), [ADR 0024](../adr/0024-core-tools-use-native-extension-lifecycle.md), the [chat specification](../specs/pi-chat.md), and the [tool specification](../../.scratch/core-tools/spec.md) around the shared contract. Preserve the existing [retained-source search](../adr/0016-search-retained-transcript-content.md) requirement.

The change reaches the shared package and dependency declarations, both packages' activity integration, affected history/search code, existing fixtures, and the documents above. It does not change tool execution, permissions, cancellation, or model-facing call and result content.

## Acceptance and validation

- A simple command keeps its output and correct final state through repeated collection.
- Routine collection and script completion add no activity merely because a tool call ended.
- Meaningful actions, errors, and images follow the verified app behavior; available source content is retained.
- Multiple operations have independent identities and outcomes. A completed script cannot mark a still-running command complete.
- The chat accepts the contract from an unrelated producer with arbitrary tool names. No `pi-codex-tools` package or name check is required.
- The tool package supplies the contract to a simple subscriber with `pi-chat` absent.
- Live display and recorded history agree. Unknown records use the generic fallback. Discarded result content is not restored from an earlier snapshot.
- Existing Find, grouping, disclosure, copy, and image controls still work.

Reuse the existing combined workflow, native chat, and source-search checks. When implementation begins, add the smallest contract self-check needed to prove producer/consumer independence, then run the affected existing provider checks, `pnpm typecheck`, and `pnpm lint`. Compare the result in Ghostty with the recorded app cases.

Planning validation: repository code, installed Pi interfaces, official documentation, and the installed app bundle were inspected. This turn changes only this plan. Implementation and live behavior comparison remain outstanding.
