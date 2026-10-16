# Working label parity

The working label is the text in Pi's native progress indicator. The previous implementation updated it only for complete standalone bold thought headings and cleared it at thinking/message completion. It never consumed tool activities. Pi consequently displayed its default `Working` during most commands and between reasoning updates.

The user authorized exact selection behavior from the installed Codex desktop app, the existing generic activity interface, and the established real-Pi verification seam. No new package, provider-name rules, or additional model guidance is permitted. This delta starts at `bf30b7a` on `codex/generic-tool-activity`.

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

## Selection and lifecycle

1. Consider the active request only. New assistant text closes the preceding activity slice; reasoning alone does not split an exploration. Pending calls without operations do not supply a label. Output collection and empty operation snapshots cannot invent one.
2. In a trailing exploration of reads, searches, and listings, select its latest running operation, otherwise its latest operation. This keeps `Reading <file>` available between consecutive reads. Completion order does not change source order.
3. Otherwise select the latest running operation in the current slice. Reads use `Reading <target>`; registered skill reads use `Reading <name> skill`; edits use `Editing files`; actual commands retain `Running <command>` or `Running command` when empty. Completed command rows keep their existing `Ran` labels; they are not continuing operations.
4. Search labels prefer a supplied location: `Searching files in <folder> folder`. Otherwise use `Searching for <query>`, or `Searching files` without either. Listings use `Listing files in <folder> folder`, or `Listing files`. The existing technical command-detail policy retains query syntax.
5. With no qualifying operation, use the latest usable reasoning line in the active request. Scan reasoning items from newest to oldest. Within an item, select the last nonblank line that is not only leading HTML comments or a partial comment opener. Interpret that line as CommonMark and extract its text, recursively unwrapping a single strong paragraph. Plain text and incomplete Markdown participate; complete bold markup is not required. Empty/new reasoning does not erase an earlier usable item. The app uses the standard CommonMark/MDAST parser and text extraction; use those small libraries instead of implementing another Markdown parser.
6. Fall back to `Thinking` when neither source supplies a label. The source does have this fallback; claiming it always has specific text would be inaccurate. Keep reasoning available after `thinking_end` and `message_end`. End/cancel, a new delivered request, session replacement, and shutdown clear transient state.
7. When no current operation supplies a label and a confirmed final answer is visible, hide the working indicator. Use the existing provider-phase evidence; do not infer a final answer from ordinary text. A phase correction or subsequent work restores it. End/reset restores the native visibility default for the next request.

The status text is separate from activity row summaries and from the thought body's existing omission of standalone bold paragraphs. Hide thinking, global disclosure expansion, and Find do not change its inputs. Current operations use the same validated adapters as the rows, including late updates after a parent call returns. Historical facts cannot turn the live status back on.

## Scope and verification

Reuse Pi's native indicator and public working-message and visibility setters. Hide only the working indicator for a confirmed final answer; keep retry/compaction indicators, placement, animation, and native start/end handling in Pi. Reuse the host adapter's existing phase reconciliation to update visibility after authoritative final-answer changes. This is label-selection parity for the operations represented by the existing interface. Codex-only UI features, connector branding, visualization-specific labels, compact-answer layout, and app environment preparation states are outside this extension's interface and this delta.

Keep all adjustable wording in the existing activity configuration module as plain text templates; `{value}` is replaced with the file, command, query, folder, or tool name. Do not modify core tool declarations or either package's execution semantics. Preserve source, result bindings, operation identity, standalone producer behavior, and package independence.

Use existing real-host thought, activity, final-phase, and combined workflow cases. Pause the provider and operations to inspect the native indicator during plain/partial reasoning, read/search/list, edits, commands, out-of-order completion, and late activity updates. Check thought visibility, confirmed-final suppression and correction, source preservation, cancellation, new requests, and reload. Compare reasoning cases with the pinned extraction algorithm and CommonMark parser. Run the chat and combined workflow suites on Pi 1.0.2 and 1.1.0 plus required static checks; distinguish these from physical app acceptance.

The extraction comparison executes the installed app's `fpi`/`ppi` functions and its actual bundled parser/text helpers in an isolated Node VM, then compares this package's selector. All 1,409 inputs match: plain/formatted seeds, every streaming prefix, preceding-line variants, CRLF, and HTML comments. Temporary scripts: `/tmp/pi-working-status-reference/oracle.mjs` and `check.mjs`; result: `/tmp/pi-working-label-reference.log`. This compares the installed implementation, rather than a second transcription of its algorithm.

Tracker: [11: Working labels from current activity](../../.scratch/tool-activity/issues/11-working-labels.md) → [12: Verify working label parity](../../.scratch/tool-activity/issues/12-verify-working-labels.md). Earlier activity tickets retain their original completion evidence.
