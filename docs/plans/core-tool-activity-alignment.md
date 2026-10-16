# Generic tool activity aligned with ChatGPT.app

The first revision was implemented at `4e271b8` from baseline `6013382`. The user's later screenshots and package correction are implemented and verified at `789b142`, from `4ad78cc` on `codex/generic-tool-activity`. The [specification](../specs/tool-activity.md) and [resolved correction ticket](../../.scratch/tool-activity/issues/05-skill-reads-across-tools.md) record the delivered format and verification. Earlier tickets retain their original evidence.

The user requires a generic interface. Neither `pi-chat` nor `pi-codex-tools` may depend on knowledge of the other package. ChatGPT.app's command activity is the default behavior reference. Command recognition, one activity configuration module, pending-call handling, and verbatim scoped core guidance are verified at `100316f` from `a6280f9`. The user then approved correcting failed input/collection activities and non-terminal Ctrl+C. [Ticket 10](../../.scratch/tool-activity/issues/10-process-input-parity.md) defines that continuation; [Ticket 09](../../.scratch/tool-activity/issues/09-verify-activity-alignment.md) records combined verification. System prompts and additional model advice remain excluded.

## Setting and terms

The agent uses tools to do work. The tool package runs that work. The chat package shows its progress and results.

Use the existing [glossary](../../GLOSSARY.md):

- **Tool call:** one request to a tool, with its inputs and result.
- **Operation:** the work being done, such as running a command or changing a file.
- **Activity item:** a row in the chat that identifies an operation, failure, or delivered image.
- **Execution cell:** a script execution that can call tools and return before all commands it started have finished.

These are different units. Starting `pnpm test` and checking its output three times requires several tool calls. Those checks do not run the tests again.

In the screenshot, “Collected output” describes a collection call. “Execution completed” describes the execution cell's status. It does not prove that a command started by that cell has finished.

## Baseline behavior

At `6013382`, `packages/pi-chat/src/tool-adapters/core-tools.ts` recognized specific tool names and checked whether their package was named `pi-codex-tools`. It created collection activity items for `wait` and empty `write_stdin` calls. The summary code gave them the labels in the screenshot.

The chat also read the tool package's private execution format in `packages/pi-chat/src/tool-adapters/core-activity.ts` and subscribed to its private activity channel. Both adapters have been removed. Their [generic replacement](../../packages/pi-chat/src/tool-adapters/activity.ts) consumes the shared contract.

The baseline execution activity item was conditional on script output, an error, or an image; it was not an automatic receipt for every completed script. The expanded raw arguments came from Pi's generic tool rendering.

## ChatGPT.app reference

The command-parser delta targets the bundled Codex version recorded in `codex-cli/codex-package.json`: `0.162.0-alpha.17.2`, upstream commit `740e5af33c71225640e0c1c1555c514c2c93ab74`. Its parser lives in `codex-rs/shell-command`; the initial local checkout was older. The complete reference corpus and source hashes belong with the chat package's recognition checks. This parser reference does not change the separately frozen tool-guidance capture.

Inspected the installed `/Applications/ChatGPT.app/Contents/Resources/app.asar`, package version `26.1007.71326`.

Its `webview/assets/app-shared-8340f229c2b3.js` provides direct evidence:

| Code path                     | Observed behavior                                                                                                                   |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `applyOutputDeltas`           | Finds the existing command record by item ID and updates its accumulated output.                                                    |
| `applyTerminalInteraction`    | Associates submitted terminal commands with the existing command record.                                                            |
| `commandExecution` projection | Builds displayed command actions from that record's actions, output, and status. One record can contain several meaningful actions. |

The same projection supplies the original command when its parsed action list is empty. The command-recognition delta retains that fallback, including failed directory changes. The inspected asset's SHA-256 is `3b4cabc382e71f0da7398393a619d7c62d13dfae598a5fe2e9880ab8d31d1bf5`.

The [official item model](https://learn.chatgpt.com/docs/app-server#items) also defines command identity, status, output, and exit code. Its [output event](https://learn.chatgpt.com/docs/app-server#item-deltas) updates an existing item.

The target is therefore stable operations with continuing results. It is not a blanket “one row per tool call” or “one row per process” rule. For the simple test command above, repeated collection adds no new command action.

The later input-failure screenshot prompted source inspection of the same pinned Codex build. Its [input handler](https://github.com/openai/codex/blob/740e5af33c71225640e0c1c1555c514c2c93ab74/codex-rs/core/src/tools/handlers/unified_exec/write_stdin.rs) returns failures to the model. Its [process manager](https://github.com/openai/codex/blob/740e5af33c71225640e0c1c1555c514c2c93ab74/codex-rs/core/src/unified_exec/process_manager.rs) sends successful interaction events using the original command ID and special-cases exact Ctrl+C for non-terminal processes by sending an interrupt signal. The installed app applies those events to the existing command; raw function results do not produce normal activity rows. The core producer therefore publishes no input/collection or script-result operation, including failures. Actual operation failures remain visible, and raw errors remain available to the model and through Find. This removes both the extra failed-input row and repeated script-error context without guessing error identity.

This is source inspection, not a live app comparison. Physical presentation of uncommon errors, cancellation, and images remains unverified. Earlier automatic script-error publication is superseded by the approved input correction. Existing historical error facts remain supported; no history migration is included.

## Generic interface

Both existing packages independently implement the [documented activity format](../specs/tool-activity.md). The producer constructs facts and the consumer validates them. No separate contract package, cross-package runtime import, or provider-specific consumer rule is required.

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
| Documented format                        | Specify the records and their ownership rules for independent implementations.                                      |
| Chat package, including `pi-chat`        | Turn those records into activity items and apply the app's display behavior.                                        |
| Other tools or displays                  | Use the same contract without either package being installed.                                                       |

For example, the provider reports “operation A started,” “operation A has more output,” and “operation A finished.” The chat updates the activity for A. It does not need to know whether those updates came from `exec`, `wait`, `write_stdin`, or a differently named tool.

Shared action kinds may include commands, file changes, images, and generic tool actions. They describe the work, not the package that supplied it. Keep styling, summaries, disclosure state, and Pi components in the display package.

## Work sequence

1. **Record the app reference cases.** Inspect the screenshot scenario and command update/input behavior. Record unverified uncommon cases separately. The earlier four display-preference questions are withdrawn.
2. **Define the smallest shared contract.** Cover zero/multiple operations, later updates, native source identity, independent outcomes, and result ownership. Preserve validation after result hooks. Do not infer ownership by matching output text.
3. **Make the tool package publish the contract.** Reuse its existing process observers and execution records. Keep its private worker and process details private. It must work without `pi-chat`.
4. **Make the chat consume the contract.** Replace its package-specific adapter, decoder, and event subscription. Reuse its current activity items, command classification, grouping, native output controls, and generic fallback. Remove obsolete special cases.
5. **Preserve history and navigation.** Keep original calls and results. Use source identities to keep Find, copy, disclosure state, and later updates correct. Older history without the shared metadata keeps the generic display; no automatic migration is planned.
6. **Update the existing specifications and verify.** Revise [ADR 0019](../adr/0019-tool-renderers-own-tool-presentation.md), [ADR 0024](../adr/0024-core-tools-use-native-extension-lifecycle.md), the [chat specification](../specs/pi-chat.md), and the [tool specification](../../.scratch/core-tools/spec.md) around the shared contract. Preserve the existing [retained-source search](../adr/0016-search-retained-transcript-content.md) requirement.

The correction removes the separate package and its dependency declarations. It updates both packages' activity integration, affected history/search code, existing fixtures, and the documents above. It preserves tool execution, permissions, cancellation, and model-facing call and result content.

## Acceptance and validation

- A simple command keeps its output and correct final state through repeated collection.
- Routine collection and script completion add no activity merely because a tool call ended.
- Command actions and continuing results follow the inspected app behavior. Independent errors and images retain their source and native handling; their exact app presentation remains unverified.
- Multiple operations have independent identities and outcomes. A completed script cannot mark a still-running command complete.
- The chat accepts the contract from an unrelated producer with arbitrary tool names. No `pi-codex-tools` package or name check is required.
- The tool package supplies the contract to a simple subscriber with `pi-chat` absent.
- Live display and recorded history agree. Unknown records use the generic fallback. Discarded result content is not restored from an earlier snapshot.
- Existing Find, grouping, disclosure, copy, and image controls still work.

The existing combined workflow, native chat, and source-search checks were reused, with focused contract, unrelated-provider, terminal-input, retained-source, skill-read, and failure checks. At `789b142`, the affected packages pass 343/343 checks on Pi 1.0.2; the full chat suite, combined workflows, and contract checks pass 134/134 on Pi 1.1.0. Typechecking passes on both versions; repository lint, formatting, and diff checks pass.

Repository code, installed Pi interfaces, official documentation, and the installed app bundle were inspected. Direct standards/spec review is complete; independent review agents failed before running because of a runtime decoding error. Physical-terminal acceptance and live app comparison remain unperformed. [Ticket 05](../../.scratch/tool-activity/issues/05-skill-reads-across-tools.md) records the correction's exact validation scope and limitations.
