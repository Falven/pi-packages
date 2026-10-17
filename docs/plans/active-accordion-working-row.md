# Use the thinking row as the active accordion header

**Status:** Implemented and verified at `5724ea6`, then integrated into `main` at `72c77f6`; [Chat 18](../../.scratch/pi-chat/issues/18-active-accordion-working-row.md) is resolved. The original inspection was based on `aa4afa1` and the user's accepted visualization. Both planned presentation changes are complete. The existing 147 combined cases, static checks, and final Standards and Spec reviews pass on installed Pi 1.1.0. The ticket records exact evidence and the unavailable physical-terminal check; the [chat specification](../specs/pi-chat.md) remains the contract.

## Observable behavior

The thinking row consists of the existing loading indicator and working label. Preserve the existing label priority: current operation, otherwise the latest complete activity heading, otherwise `Thinking`. A thought heading remains eligible while its body streams and after thinking/message completion. Body prose and incomplete headings cannot replace it.

Where the row appears is separate from what its label says:

| State                                                | Presentation                                                                                                                                                                                      |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Work is live and a render group is current           | The group's header is `spinner working label >`, or `spinner working label ▼` when expanded. No second working row appears below it or in the composer.                                           |
| No current group has a displayed header              | The same working row appears below the existing conversation content, without a disclosure chevron.                                                                                               |
| A group stops being current while work continues     | Its retained header shows the existing group summary with a trailing chevron. The working row moves below, or becomes the next current group's header. Existing singleton omission still applies. |
| Final response, cancellation, or request/session end | Existing working visibility and cleanup rules apply. No transient working row is saved into history.                                                                                              |

Move each render-group and activity-item chevron immediately after its label. Keep the loading indicator on the left. Keep the current `>` and `▼` glyphs. Reserve the chevron's terminal-cell width before truncating the label so it remains visible at narrow widths.

For example, an open group can show `spinner Reviewing the results >` after its command completes, when the existing label selector falls back to that thought heading. It must not require a qualifying current operation just to display a working header.

## Preserve the existing boundaries

Use the current-group facts already present in singleton composition: the current agent activity, its latest visible unit, established activity boundaries, final-response evidence, and settlement. Reuse those facts for working-row placement without changing grouping or singleton eligibility. “Latest visible” means the composed activity sequence, not what is inside the viewport; hidden or empty thoughts and spacers do not independently advance it. An existing native `working` indicator is required: historical unsettled activity cannot create a live row.

Do not use `currentOperation()` as the sole test for header ownership. It selects label input and deliberately retains the latest completed exploration between reads. Preserve that selection, but determine the destination independently. Completing one tool is not a new group-closing event.

Hidden thoughts can leave a group current, allowing its header to show a thought heading when no operation supplies the label. Visible thought prose already creates a grouping boundary; the working row then follows the content. If an ancestor hides the candidate header or existing singleton rules omit it, use the standalone row without recreating a disclosure.

## Implementation

1. **Move disclosure glyphs in `native-host.ts`.** Change `RenderGroupHeader.render()` and `ActivityItemDisclosure.render()` only. Retain their component identities, whole-header mouse targets, keyboard actions, focused background, and independent expansion state. The enclosing `Worked for…` header already has a trailing chevron.

2. **Give the live row one destination in `layoutChat()`.** Select the displayed current group using the existing activity facts. Expose `AgentActivityIndex`'s existing current activity through a read-only accessor to distinguish it from unsettled history. The current group's existing header renders the native spinner and full selected working label; otherwise one transient component renders that presentation at the conversation tail. Remove the separate group `operationLabel` mirror. Other group headers use `GroupSummaries`; activity-item summaries stay unchanged. Keep `WorkingLabel` as the sole label selector, including operation priority, thought headings, and `Thinking`.

3. **Reuse Pi's indicator without taking over its lifecycle.** Extend the private host adapter only as needed to borrow the active working indicator's `renderInBorder(width)` output. Detach its editor/status-container placement before measuring the dock, without disposing it. Do not call `setWorkingVisible(false)` merely to relocate it: that destroys the indicator. Pi continues creating, updating, animating, and disposing it. Reconcile placement after editor replacement, reread the indicator after `working.refresh()` can change visibility, and restore native placement on adapter disposal only while that presentation is still owned. Route only `kind === "working"`; other status indicators keep their native presentation.

4. **Fit the selected label to its actual destination.** Replace the current editor-border width budget with the conversation width minus padding, native spinner, and the trailing chevron when present. Preserve the full source label so widening restores it. Keep the existing heading extraction and request/message/tool subscriptions; no additional heading parser, timer, lifecycle flag, or persisted state is needed.

5. **Reconcile existing assertions and documentation.** Update expectations affected by chevron position and removal of the duplicate row. The chat and activity specifications, related ADRs, and the prior working-label plan now record this requested behavior, including thought headings in active headers. Keep them aligned during implementation and preserve their earlier verification records. No new ADR is needed for this reversible presentation change.

## Verification

Use the existing real-Pi recording-terminal fixture and existing cases; add no test cases, test files, fixtures, or dependencies.

- `activity.test.ts`: operation-label priority, concurrent and completed reads, late updates, narrow widths, and one live working presentation instead of the current duplicated header/dock assertions.
- `inline-thoughts.test.ts`: complete and incomplete thought headings, retained titles during body streaming, the `Thinking` fallback, Hide thinking, resize, editor replacement, cancellation, and reload. Check the selected heading in whichever destination currently owns the row.
- Existing `native-chat`, `bounded-render-groups`, `agent-activity`, `phase-final`, `mixed-session`, and `source-search` cases: trailing chevrons, open/closed state, singleton omission, keyboard/mouse access, focus, scroll anchors, Find/copy, final responses, retry, and lifecycle cleanup. Update affected prefix-based assertions without changing the scenarios.
- Run `node --test packages/pi-chat/test/*.test.ts packages/pi-codex-tools/test/workflow-presentation.test.ts` against the installed Pi, plus `pnpm typecheck`, scoped lint/format checks, and `git diff --check`. Do not change dependency versions to create a compatibility matrix.
- Inspect a live pi-chat session for the handoff between standalone and header presentation, spinner animation, and narrow-terminal fit. Recording-terminal checks alone do not establish physical-terminal behavior.

## Scope and risk

The runtime change belongs in `native-host.ts`, plus a read-only accessor in `agent-activity.ts`. Reuse `WorkingLabel.refresh(width)` and its existing `index.ts` callers without changing label selection or event ordering. No tool-adapter, execution, configuration, package export, dependency, or persistence changes are planned.

Preserve grouping, singleton rules, summaries, labels, thought-body rendering, disclosure state, native output controls, and the enclosing activity accordion. Add no guides, checkmarks, or status dots.

The main integration risk is borrowing Pi's private status presentation without duplicating or disposing its spinner, especially during editor replacement and cleanup. Keep that integration inside the existing native host adapter and verify it through the established host fixture.
