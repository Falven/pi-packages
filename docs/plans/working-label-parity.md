# Working label parity

**Status:** thought-title correction in progress on `main` from `e338ecf`, tracked in Ticket 13. Ticket 12 retains the earlier implementation at `4e27987`, its checks, and their limits.

The working label is the text in Pi's native progress indicator. The original implementation ignored tool activities and cleared thought titles at thinking/message completion, leaving `Working` during much of a request. The first correction added operation labels but selected the last line of a whole Pi thought. A long body paragraph then replaced its title and wrapped into several indicator rows. The reported saved thought already has the title `Auditing project requirements`.

The user authorized current-operation selection from the installed Codex desktop app, actual thought titles, the existing generic activity interface, and the established real-Pi verification seam. No new package, provider-name rules, generated titles, or additional model guidance is permitted. Earlier work from `bf30b7a` is integrated on `main`; the task branches and worktrees have been removed.

## Installed source

Inspected 2026-10-16: `/Applications/ChatGPT.app`, version `26.1007.71326`, bundled Codex `0.162.0-alpha.17.2` (`740e5af33c71225640e0c1c1555c514c2c93ab74`). The implementation reference is the desktop JavaScript in `Contents/Resources/app.asar`, not the CLI status widget.

| Asset                                        | SHA-256 of original archive bytes                                  | Relevant behavior                                                                         |
| -------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `local-conversation-turn-29618f918e88.js`    | `3135e61faf7f4e39b2da6bc98dc8849690be45d9cbe4876004e9e6d910bbfd47` | Latest reasoning item with usable text; thinking fallback and live reasoning subscription |
| `inline-followup-markdown-e2a46b832038.js`   | `4fb303d6453402e913f02bf5388bb80fe67438b2cab7d07b9ab99dda1966dcac` | `Pe`, `Xe`, `Ze`, `Q`: exploration grouping, current group, latest active operation       |
| `active-tool-activity-label-6fd1ac7cccf0.js` | `90c8e453b7c492d71405c99afc3197c91106472807bf5d17c8fc250a87a351f0` | `D`, `O`, `k`: active command selection and read/search/list labels                       |
| `app-initial-1ab6fbe93c4f.js`                | `f3d5fedc993d0ead2720c9877d8c72a82dc5fb2d935f13ad9426e6964fb6f105` | `fpi`, `ppi`: reasoning-line extraction; `_pi`, `cfo`: reasoning lookup; `Q7c`: fallback  |
| `sites-end-resource-95f165ef7b06.js`         | `a918e7649c137b48cb3b4bb9b9ac74b6d9197eb6d111d552d98d0417955eb97b` | `IO`, `RO`: current group label, including `Editing files`                                |
| `app-shared-8340f229c2b3.js`                 | `3b4cabc382e71f0da7398393a619d7c62d13dfae598a5fe2e9880ab8d31d1bf5` | CommonMark parser/text extraction and `D0n`: confirmed final-answer predicate             |

`Is` in the local-conversation asset suppresses the thinking indicator when a confirmed final answer is visible; an active exploration takes priority. The temporary formatted extraction and original-byte manifest are under `/tmp/pi-working-status-reference`; formatting changes file hashes. No app bundle code is shipped with this project.

The input and display boundaries matter: `_pi` calls `fpi(Xge(n.summary))` for a reasoning item, and `Q7c` renders its status with `min-w-0 flex-1 truncate select-none`. The helper selects a line from the summary field; it is not a title extractor for arbitrary thought prose. The previous port fed it the entire Pi thinking block and used a wrapping native loader. Matching the helper alone missed both gaps. For Pi's combined title/body text, reuse the existing standalone-bold activity-heading extraction and retain only its latest complete title for status.

## Selection and lifecycle

1. Consider the active request only. New assistant text closes the preceding activity slice; reasoning alone does not split an exploration. Pending calls without operations do not supply a label. Output collection and empty operation snapshots cannot invent one.
2. In a trailing exploration of reads, searches, and listings, select its latest running operation, otherwise its latest operation. This keeps `Reading <file>` available between consecutive reads. Completion order does not change source order.
3. Otherwise select the latest running operation in the current slice. Reads use `Reading <target>`; registered skill reads use `Reading <name> skill`; edits use `Editing files`; actual commands retain `Running <command>` or `Running command` when empty. Completed command rows keep their existing `Ran` labels; they are not continuing operations.
4. Search labels prefer a supplied location: `Searching files in <folder> folder`. Otherwise use `Searching for <query>`, or `Searching files` without either. Listings use `Listing files in <folder> folder`, or `Listing files`. The existing technical command-detail policy retains query syntax.
5. With no qualifying operation, use the latest complete activity heading in the active request. This is the actual thought title, already extracted from standalone bold paragraphs by thought presentation. Body prose, inline emphasis, code, comments, and incomplete headings cannot supply a label. Retain the title while the body or a new heading streams; an item without a title does not erase an earlier one. Remove the separate last-line extractor and its now-unused parser dependencies.
6. Fall back to `Thinking` when neither source supplies a label. The source does have this fallback; claiming it always has specific text would be inaccurate. Keep the title available after `thinking_end` and `message_end`. End/cancel, a new delivered request, session replacement, and shutdown clear transient state.
7. When no current operation supplies a label and a confirmed final answer is visible, hide the working indicator. Use the existing provider-phase evidence; do not infer a final answer from ordinary text. A phase correction or subsequent work restores it. End/reset restores the native visibility default for the next request.
8. Keep the fullscreen indicator to one line. Collapse whitespace in displayed labels and truncate with a terminal-cell-aware ellipsis, reserving the native spinner and padding. Refit during the existing dock layout on resize for embedded and standalone indicators. Preserve the full source label so widening restores it.

Status and thought-body presentation share the existing heading extraction. Activity row summaries remain separate. Hide thinking, global disclosure expansion, and Find do not change status inputs. Current operations use the same validated adapters as the rows, including late updates after a parent call returns. Historical facts cannot turn the live status back on.

## Scope and verification

Reuse Pi's native indicator and public working-message and visibility setters. Hide only the working indicator for a confirmed final answer; keep retry/compaction indicators, placement, animation, and native start/end handling in Pi. Reuse the host adapter's existing phase reconciliation to update visibility after authoritative final-answer changes. This is label-selection parity for the operations represented by the existing interface. Codex-only UI features, connector branding, visualization-specific labels, compact-answer layout, and app environment preparation states are outside this extension's interface and this delta.

Keep all adjustable wording in the existing activity configuration module as plain text templates; `{value}` is replaced with the file, command, query, folder, or tool name. Do not modify core tool declarations or either package's execution semantics. Preserve source, result bindings, operation identity, standalone producer behavior, and package independence.

Update existing real-host thought, activity, final-phase, and combined workflow cases. Pause the provider before a title completes and after a long body arrives; assert only the fallback or actual title appears. Verify later/incomplete headings, inline emphasis, code, comments, and resize in both native indicator placements. Preserve operation-priority, source, thought-visibility, final-phase, cancellation, new-request, and reload checks. Recheck the reported saved thought without printing its body. Run the chat and combined workflow suites on Pi 1.0.2 and 1.1.0 plus required static checks; distinguish these from physical app acceptance.

The earlier extraction comparison executed the installed app's `fpi`/`ppi` functions and actual bundled parser/text helpers in an isolated Node VM. All 1,409 inputs matched the former last-line selector: plain/formatted seeds, streaming prefixes, preceding-line variants, CRLF, and comments. Temporary scripts: `/tmp/pi-working-status-reference/oracle.mjs` and `check.mjs`; result: `/tmp/pi-working-label-reference.log`. This established helper equivalence, not correct title selection from Pi's input or single-line rendering. The new acceptance cases cover those missing boundaries.

Tracker: completed [11: Working labels from current activity](../../.scratch/tool-activity/issues/11-working-labels.md) → [12: Verify working label parity](../../.scratch/tool-activity/issues/12-verify-working-labels.md) → [13: Thought titles without body leakage](../../.scratch/tool-activity/issues/13-thought-titles.md). Earlier tickets retain their original completion evidence with the correction noted.
