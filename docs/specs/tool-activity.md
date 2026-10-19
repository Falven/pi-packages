# Tool activity

**Earlier activity status:** thought-title correction implemented and verified at `fc33210` on `main`; Ticket 13 records its acceptance and verification. Tickets 11–12 retain the earlier working-label implementation at `4e27987` and its verification limits. Earlier command recognition, configuration, pending calls, verbatim guidance, and input/collection behavior are verified at `fbc8030`; Ticket 09 retains that evidence and completed cleanup.

**Tracker:** The current body-eligibility contract is tracked by resolved [Chat 19](../../.scratch/pi-chat/issues/19-render-group-body-eligibility.md). Earlier activity revisions use [06: Configurable Codex command recognition](../../.scratch/tool-activity/issues/06-configurable-command-recognition.md), [07: Pending calls without premature activities](../../.scratch/tool-activity/issues/07-pending-call-activities.md), [08: Verbatim core tool guidance](../../.scratch/tool-activity/issues/08-verbatim-core-tool-guidance.md), and [10: Process input without extra activities](../../.scratch/tool-activity/issues/10-process-input-parity.md) → [09: Verify the activity alignment](../../.scratch/tool-activity/issues/09-verify-activity-alignment.md). Earlier tickets retain their completed revision evidence.

**Completed thought-title revision:** [13: Thought titles without body leakage](../../.scratch/tool-activity/issues/13-thought-titles.md). [11: Working labels from current activity](../../.scratch/tool-activity/issues/11-working-labels.md) and [12: Verify working label parity](../../.scratch/tool-activity/issues/12-verify-working-labels.md) are its completed prerequisites.

**Body-eligibility revision:** The [chat specification](pi-chat.md) owns render-group body eligibility and disclosure availability. This consumer-only behavior is implemented at `39263b9` and integrated into local `main` at `0680d51`. The operation data format, command recognition, and working-label selection below remain unchanged. [Chat 19](../../.scratch/pi-chat/issues/19-render-group-body-eligibility.md) records the approved single-ticket scope, installed-Pi test seam, verification, and limits.

**Completed chat placement revision:** [Chat 18](../../.scratch/pi-chat/issues/18-active-accordion-working-row.md) specifies one thinking row as the current render-group header or below the conversation, with trailing group/item chevrons. The later body-eligibility revision governs whether a retained group header is expandable; a status-only header has no chevron. Placement alone does not change selection; the operation and thought-heading selection rules below remain authoritative. The new placement is implemented and verified at `5724ea6`, then integrated into `main` at `72c77f6`; Chat 18 and the [chat specification](pi-chat.md) record its 147-case verification, completed reviews, and unavailable physical-terminal check.

## Problem Statement

Routine Output activities have been removed, but common file reads still appear as long shell commands, and an unfinished call can briefly appear as `Called exec (status unknown)`. The existing recognizer covers only a small subset of Codex's command behavior. Recognition and wording are scattered, making operator changes difficult. The toolset also adds local explanatory text to its captured tool guidance, despite the required word-for-word tool interface.

The later screenshot exposed two further differences: failed input calls produced extra activity and duplicate error context, and exact Ctrl+C was rejected for a non-terminal process. The reference updates the original command and supports that interruption.

The original working indicator said `Working` during commands and between reasoning updates because it ignored operations and cleared titles too early. The first correction added operation labels but passed entire Pi thoughts through Codex's summary-text helper. That selected body paragraphs as status text and let the native loader wrap them into several lines. The reported thought already contains the correct title, `Auditing project requirements`. The installed app reads a reasoning summary field and constrains its status display to one line; copying its helper alone did not establish the correct input mapping.

Users need to keep seeing current exploration even when its unfinished rows are not available for inspection. Hiding those rows must not remove operations from progress summaries, conceal retained partial output from Find, or make the provider report a different outcome. Conversely, a general command or registered skill read can remain inspectable before it produces output.

## Solution

Represent operations in agent activity and expose results through their activity bodies when the corresponding rows are available for inspection. Returning or forwarding text does not create another activity. Keep raw execution results, including script and input errors, discoverable through source Find. Present an actual failed operation once. Input/collection calls and script results create no operation just because they fail. Registered skill-file reads use a `Read <name> skill` label through any supported read path.

The two existing extensions implement the same documented data format over Pi's existing events, result details, and retained custom entries. Neither imports the other, recognizes the other's package identity, or requires a separate contract package. The supplied screenshots define the correction's visible cases. Earlier installed-app source inspection supports continuing command identity and multiple action labels; it does not establish full visual parity for every error or image case.

Match the complete pinned Codex command-recognition behavior, including its general-command fallbacks. Recognized reads, searches, and listings receive clear action labels; actual scripts and tests retain `Running`/`Ran`. Put operator-adjustable recognition and activity wording in one module in the existing chat package. Keep pending calls out of operation activity until execution begins, and preserve failures and unknown historical outcomes. Core tool guidance is verbatim from the scoped frozen reference, with no additional read-style or batching advice.

Feed Pi's native working indicator from those same generic operations, otherwise the latest actual thought title. Reuse the existing activity-heading extraction; never select or summarize body prose. Preserve titles while bodies stream and across thinking/message completion. Use `Thinking` when neither an operation nor a title is available. Keep the fullscreen indicator to one line with an ellipsis when necessary, adapting to resize. Reset transient state at actual request/session boundaries. Hide the working indicator when a confirmed final answer appears without a current operation.

Apply the chat-owned body-eligibility rule after recognizing operations. Keep all logical activity items available to summaries and working-label selection, even when the render-group body omits unfinished ordinary reads, searches, and listings. Providers continue to publish complete authoritative facts; they do not send visibility flags or delete suppressed operations. The chat specification owns disclosure input, state restoration, and temporary Find reveals.

## User Stories

1. As a user, I want the activity list to identify work, so that returned text does not look like another action.
2. As a user, I want command output inside its command activity, so that I can understand what produced it.
3. As a user, I want forwarding a whole result or its text to produce the same activity, so that model coding style does not change the display.
4. As a user, I want combined command results to add no Output activity, so that parallel work stays readable.
5. As a user, I want literal script text retained without a routine activity row, so that inspection remains possible without clutter.
6. As a user, I want Find to reveal raw processed results for both text-only and mixed calls, so that omitting a result row does not discard information.
7. As a user, I want leaving a source hit to remove only its temporary reveal, so that operation disclosure choices remain intact.
8. As a user, I want source inspection to avoid execution and model requests, so that navigating history has no tool effects.
9. As a user, I want each failed operation represented once, so that the parent error does not look like another failed action.
10. As a user, I want additional execution errors retained in model results and source Find, so that a distinct failure is not discarded or falsely attributed to a child.
11. As a user, I want a failure before any child operation to remain inspectable even without an error message, so that a broken script is diagnosable without inventing an operation.
12. As a user, I want successful children to stay successful after their script fails, so that status describes actual work.
13. As a user, I want a registered skill read labeled `Read <name> skill`, so that I can identify the loaded instructions.
14. As a user, I want skill labels through native reads and declared command operations, so that the tool implementation does not determine the label.
15. As a user, I want a header followed by a literal file read recognized, so that formatting commands do not obscure skill use.
16. As a user, I want separate submitted commands to retain their independent actions, so that one skill label does not conceal mixed work. A script containing an unrecognized action follows the reference's whole-command fallback.
17. As a user, I want uncertain shell syntax and unknown skill paths described conservatively, so that the chat does not invent actions.
18. As a user, I want labels and reliable late outcomes to survive reload and forks, so that history remains useful.
19. As a user, I want invalid metadata to preserve authoritative processed output, so that result hooks and older providers remain supported.
20. As a provider author, I want to publish generic activity without installing a display or contract package, so that my extension remains independent.
21. As a chat maintainer, I want to accept an unrelated provider's valid facts without tool-name rules, so that the interface remains generic.
22. As a user, I want native output controls and single-owner images preserved, so that the correction does not replace Pi's presentation controls.
23. As a user, I want every command form covered by the pinned Codex parser recognized the same way, so that parity includes fallback and edge cases as well as common reads.
24. As a user, I want line-range reads and read pipelines labeled by file, so that shell formatting does not obscure the work.
25. As a user, I want search labels to retain the query and available location, so that I can understand their scope.
26. As a user, I want shortened display names to retain their real file identity, so that skill recognition and source inspection remain correct after directory changes.
27. As an operator, I want command recognition and all activity wording in one readable configuration module, so that I can make presentation changes without searching the rendering implementation.
28. As an operator, I want reference defaults and explicit customizations, so that changing a label or command alias does not change execution or model guidance.
29. As a user, I want pending calls distinguished from unknown outcomes, so that a still-arriving call does not look completed or broken.
30. As a user, I want errors, cancellation, and unobserved historical calls retained, so that removing a transient placeholder cannot conceal a real outcome.
31. As a user, I want the exact scoped core tool guidance, so that local prompt additions do not change how the model uses the toolset.
32. As a maintainer, I want the pinned reference's complete command cases and actual model-facing declarations checked, so that later edits cannot silently narrow coverage or change wording.
33. As a user, I want Ctrl+C to interrupt a non-terminal process as it does in the reference app, so that the agent can stop a running command without restarting it in a terminal.
34. As a user, I want successful and failed input/collection calls to add no activity of their own, so that the list continues to describe the original command.
35. As a user, I want an input failure and its propagated script error retained without duplicate activity or body text, so that I can inspect the failure without mistaking it for more work.
36. As a user, I want the working label to name a read, search, listing, edit, or command while it runs, so that I can understand progress without expanding the activity list.
37. As a user, I want a continuing exploration to retain its latest relevant read/search/list label, so that fast completed reads do not leave an uninformative gap.
38. As a user, I want the latest actual thought title displayed while its body streams, so that the indicator identifies the work without showing thought prose.
39. As a user, I want the title retained across incomplete new headings and thinking/message completion, so that the indicator does not reset between related steps.
40. As a user, I want `Thinking` when no specific label is available, so that fallback behavior matches the reference without invented work.
41. As a user, I want new requests and session changes to clear old status, so that history and completed work do not masquerade as current work.
42. As a user, I want the same working label with thinking hidden or visible and disclosures open or closed, so that presentation controls do not change the reported work.
43. As a provider author, I want existing generic operation facts to drive status, so that my tools need no chat-specific integration.
44. As an operator, I want working-label wording beside the existing activity settings, so that presentation changes stay in one place without modifying model guidance.
45. As a user, I want a confirmed final answer to suppress the working indicator when no operation remains current, so that completed reasoning does not appear to continue alongside the answer.
46. As a user, I want long status text to stay on one line with an ellipsis and recover when the terminal widens, so that progress does not consume the conversation area.

47. As a provider author, I want running operations retained in the published facts even while their rows are suppressed, so that progress and history remain complete.
48. As a user, I want the working label to describe an unfinished read, search, or listing whose row is absent, so that I can follow current exploration without a redundant disclosure.
49. As a user, I want general commands and registered skill reads to remain inspectable before stdout arrives, so that empty output does not hide useful command or skill information.
50. As a user, I want mixed render groups to retain progress from every logical item while exposing only eligible rows, so that inspecting finished work does not obscure ongoing exploration.
51. As a maintainer, I want summaries and singleton decisions to use logical membership rather than the filtered body, so that row suppression never changes grouping or invents a singleton.
52. As a user, I want Find to temporarily expose retained content from a suppressed running item, so that partial output remains discoverable without changing its outcome.
53. As a user, I want finished failures and uncertain outcomes to remain inspectable, so that lack of success or completion evidence does not conceal retained output.
54. As a provider author, I want body eligibility to use the existing operation kinds, skill identity, and lifecycle facts, so that my extension needs no protocol revision or consumer-specific integration.
55. As a user, I want body visibility to leave collection cursors, model results, and authoritative result bindings unchanged, so that inspecting activity does not consume or restore output.
56. As a user, I want retained activity to keep its established uncertainty rules, so that replay does not fabricate live work or completion to justify presentation.
57. As a maintainer, I want the accepted body-eligibility cases to use the existing real-Pi host seam, so that the presentation rule can be verified without new test infrastructure or parser trials.

## Implementation Decisions

- **Consumer-owned body eligibility.** Preserve the complete logical activity-item sequence and the existing version-1 operation contract. Chat alone derives its render-group body using the accepted rule in the chat specification; providers do not suppress facts, change statuses, or add a display-eligibility field. Existing skill identity distinguishes registered skill reads from ordinary reads before presentation. Group summaries, singleton cardinality, and working-label selection continue to use full membership. Output presence and item count are not eligibility thresholds. Codex-only visualization and summary-only dynamic-renderer inputs remain documented applicability limits, not new provider requirements.

- **Package ownership.** Remove the separate activity package, imports, dependencies, and release entry. Keep provider construction and consumer validation local. A small overlap in types, protocol identifiers, and binding rules is the explicit cost of independent implementations. Do not replace the package with a repository-root runtime import, generated shared module, or bundling system.
- **Data format.** Preserve version 1, source ID, originating call/session identity, revisions, ordered operation facts, result binding, and native image ownership. A command operation may provide `shell`, the executable and argument prefix to which each command text is appended for recognition. For example, `["/bin/zsh", "-lc"]` preserves the actual shell invocation. Omitted `shell` retains the existing Bash-compatible interpretation. This generic field avoids reading another package's opaque argument schema. The protocol remains documented below. Neither side uses the other extension's implementation or private records.
- **Operations and results.** Normal script text is retained in execution results, not published as new work. The consumer also suppresses ordinary text-only output facts in older valid records. This rule does not depend on string matching, object identity, parsing script source, or how the model forwards results.
- **Failures.** Actual failed operation facts remain visible and independent. The core producer publishes no operation for input/collection calls or script results, including failures; exact errors remain in model results and source Find. This removes both the failed-input row and the duplicate script-error context without matching error text, changing rejection values, or rewriting child status. Existing valid error facts from other producers or retained records remain supported through the generic error presenter. Empty operation snapshots are valid for failed calls; invalid or absent metadata still uses generic fallback.
- **Empty recognition.** When the parser returns no actions, keep a general command activity with the submitted command, outcome, and body, matching the app's display fallback. An explicitly empty operation snapshot still describes zero operations.
- **Images.** Image bytes remain in the actual processed collecting result and appear once through native handling. An image with no operation owner gets an image activity, not a generic Output receipt.
- **Skill identity.** Use the effective public skill registry and resolved file path. Share recognition across native reads and classified command reads, including retained source. Do not infer skill use from returned Markdown, a filename alone, or the name of the calling tool.
- **Native provenance.** Persist observed built-in identity and working directory through private, non-model custom entries tied to the original assistant entry/content index, call identity, and argument binding. Restore only matching facts on the active branch. This preserves native skill labels after reload without guessing from the currently installed tool registry or copying results. Unobserved history keeps generic fallback.
- **Command recognition.** Port the full behavior of Codex `0.162.0-alpha.17.2`, bundled with the installed app, at commit `740e5af33c71225640e0c1c1555c514c2c93ab74`, using its Bash grammar `0.25.1` and accepted syntax. This replaces the older checkout cited in the initial annotation. Preserve action ordering, deduplication, shell-wrapper handling, formatting-helper rules, option handling, path handling, and exact fallback semantics. If any surviving action is unknown, retain the entire submitted script as one command, as this build does. Recognition must never evaluate the shell. Preserve full raw commands in source and bodies. Defaults retain reference limitations, including general-command fallback for a multi-file `cat`; separate tool commands retain their own actions. Later app versions require an explicit reference update.
- **Operator configuration.** One source module in the existing chat package exports all activity presentation options: command recognizer mappings, formatting-helper names, display-path shortening, item wording, group wording/order, and operation-body headings. Provide readable names and brief editing instructions. Parser syntax/lifecycle algorithms and data validation remain implementation. Changes take effect on reload; do not add persistent preference files, menus, runtime override layers, new packages, or a repository-wide settings system. Pi remains the source for its native settings.
- **Pending calls.** Track whether a live call has begun execution separately from its operation outcome. While arguments arrive, no generic fallback row or group count is produced. Execution, result delivery, or interruption resolves the pending state. Unrecognized dispatched tools retain normal generic presentation; cancelled or failed calls and unknown historical outcomes remain visible. The rule is generic and cannot name `exec` or its provider.
- **Core guidance.** The complete selected tool declaration and retained helper wording match the frozen scoped reference exactly. Remove local lifecycle/image/notification prose and the rewritten notification description. When native selection excludes a tool, remove only that tool's section and directly dependent helper text. Preserve the already approved scope, input forms, permissions, runtime behavior, and unrelated extensions. Do not change system prompts or add instructions encouraging simpler reads or scripts.
- **Source Find.** Keep original arguments and all processed result text searchable even when operation bodies also exist. Selected raw source can temporarily use the existing native generic presenter. Remove that reveal when selection leaves or Find closes, without disturbing normal operation choices or adding execution. Images remain with their normal activity owner during text inspection. A hit on a suppressed running activity item follows chat's temporary selected-item reveal; moving to another owner, changing the query so the hit disappears, or closing Find removes the old reveal without changing operation facts or erasing disclosure choices.
- **Result authority and history.** Keep content/activity bindings, active-branch revision reconciliation, original session identity after forks, unknown stale-running status, omission markers, and generic fallback. Missing or invalid processed metadata cannot restore old live or journal bodies. Preserve compact retained updates and native model collection.
- **Process interruption.** Match the pinned process manager's exact Ctrl+C exception: for a non-terminal process, input consisting only of `\u0003` sends an interrupt signal to the owned process group. Other nonempty input still fails with closed stdin. Terminal input follows the existing terminal path. Preserve collection serialization, trailing output, observed exit status, and origin identity. A command may handle or ignore the signal; do not invent a stopped outcome.
- **Working-label selection.** Within the active request and current activity slice, prefer the latest running read/search/list in a trailing exploration, otherwise its latest operation. Otherwise prefer the latest running operation. Assistant text closes a slice; reasoning alone does not. Use the complete validated logical activity-item sequence in original order, including suppressed body items and later updates after a parent call returns. Pending calls, empty snapshots, and hidden result text cannot invent work. Read labels use `Reading <target>` or `Reading <name> skill`; edits use `Editing files`; commands use `Running <command>` or `Running command`. Search labels prefer `Searching files in <folder> folder`, then `Searching for <query>`, then `Searching files`; listings use `Listing files` with the same folder suffix when known. Completed rows retain their existing outcome labels.
- **Thought-title fallback.** With no qualifying operation, choose the latest reasoning item with a complete activity heading: a standalone bold paragraph already recognized by thought presentation. Reuse its latest extracted heading as plain title text. Inline emphasis, code, comments, incomplete headings, and ordinary body prose cannot supply a title. An item without a complete heading does not erase an earlier title. Fall back to `Thinking` only when no operation or title is available. Do not clear at thinking/message completion, create a title from the body, add prompt guidance, or use another model call. The desktop summary-text helper is not a substitute for extracting a title from Pi's combined thought text.
- **Working-label lifetime and fit.** Feed the public native working-message API from public lifecycle events and the existing generic activity observations. Keep the source label intact; collapse whitespace and fit the fullscreen display to one line with terminal-cell-aware ellipsis. Account for the actual destination's padding, native spinner, and trailing disclosure chevron when present, including resize. Cache displayed text to avoid redundant setter calls. Clear state on end/cancel, a new delivered request, session replacement, and shutdown; retained history cannot activate status. With no current operation, hide the working indicator for a confirmed final answer through the public visibility API and existing provider-phase reconciliation. Revoked phase evidence or new work restores it; end/reset restores the native default. Do not infer a final answer from ordinary text. Keep canonical reasoning and the existing thought-body heading omission unchanged. Pi retains spinner creation, animation, disposal, and the shared slot's lifecycle. Fullscreen chat borrows only the working presentation at one destination under the chat specification; retry/compaction indicators retain native presentation. Adjustable working wording stays in the existing activity configuration.
- **Scope.** The approved Ctrl+C exception is the only execution change. Preserve errors returned to scripts, declaration schemas, permissions, other cancellation behavior, and model-facing result content. Only the specified tool-guidance correction changes guidance. Do not alter JavaScript values to recover lost string provenance or change skill invocation itself.

## Testing Decisions

**Body-eligibility scope:** Reuse the user-approved real Pi InteractiveMode / AgentSessionRuntime seam on installed Pi 1.1.0. Normal extension loading, controlled provider stages, recorded fresh frames, real input, and retained/provider-content assertions cover the adapter, working-label selector, and chat projection together. Use known expected behavior from the chat specification's presentation matrix, not a copied eligibility predicate or private component fields. Existing native-read, registered-skill, semantic-provider, source-Find, and combined-workflow cases cover unfinished exploration, empty-output commands, mixed bodies, completion/failure/uncertainty, input availability, dormant choices, and temporary reveals. No new primary seam, test infrastructure, parser corpus, or model-request experiment is needed for this revision. The parser and declaration checks below retain their earlier scope.

Use the established real-Pi native-host and combined-workflow seam. It observes activity rows and native bodies alongside retained entries, original calls, and subsequent model requests. Add a failing case for forwarded strings/combined results, implement that slice, then cover raw source Find and failure grouping. Add the skill-read case through the same seam, including a formatting header, several reads, an unrelated command, registered and unregistered paths, and conservative syntax fallback. Reuse continuation, hooks, image settings, load-order, reload, compaction, and fork coverage.

For the completed command-recognition delta, retain the existing host seam and independently sourced input/output cases at the command-recognition boundary. Capture every command case exercised by the unmodified reference tests; record source revision, hashes, dependency versions, and case count. Compare complete parsed actions, not only display labels. Verify operator changes through the same recognition/presentation path. Pause the controlled provider while tool arguments are arriving, then observe dispatch, completion, interruption, and replay. At the existing model-request seam, compare complete selected core declarations byte-for-byte in their description fields. These are the scoped validation seams for the explicitly requested exact coverage; no new live-model prompt experiment is needed.

An unrelated test provider constructs the documented data independently; it must not import the consumer's builder or a shared package. Existing standalone provider checks verify useful facts without chat loaded. The input correction uses real process and combined-host cases: Ctrl+C reaches a non-terminal process, ordinary nonempty input still fails, input/script failures create no rows, exact errors remain in outgoing results and Find, and actual failed commands retain their outcomes. Verify both caught and uncaught errors, reload, and both extension orders. Run the affected package suites and repository static checks, plus the established Pi 1.1.0 compatibility suite. Record actual revision/counts and distinguish deterministic recording-terminal evidence from physical app acceptance. Review standards and the spec separately. No new test harness or broad live-model trial is needed.

For the completed working-label revision, retain the existing native-host thought, activity, and combined-workflow cases. Pause a thought before its title completes and after a long body has arrived: assert the fallback, then the actual title, never body text. Cover inline emphasis, code, comments, later titles, retained titles across incomplete updates, both native indicator placements, narrow/wide resize, and both Hide thinking settings. Verify source preservation and existing current-slice boundaries, operation priority, cancellation, new requests, reload, and confirmed-final suppression/correction. Recheck the reported saved thought without printing its body. Reference review must cover the selector's input and the single-line rendering constraint, not just helper equivalence. Reuse the established supported-host checks and static validation; no new test seam or test file is needed.

## Operator Configuration

Edit the exported `activityConfig` in [packages/pi-chat/src/config.ts](../../packages/pi-chat/src/config.ts), then reload Pi. This is the single entry point for activity presentation settings:

- `commands` lists recognized names, case-insensitive names, version prefixes, formatting helpers, and directory names omitted from short labels. Map an alias to an existing command syntax, or remove a name to leave it as a general command. Shell syntax and command-option rules remain the pinned reference algorithms.
- `labels` supplies item verbs, nouns, and status suffixes. `groups` supplies singular/plural wording and its entry order determines summary order. `emptyGroup` supplies the empty summary.
- `body` supplies headings for declared operation details. Native Pi renderer text and native settings remain owned by Pi.
- `working` supplies plain text templates for the working indicator, including the `Thinking` fallback. `{value}` receives the file, command, query, folder, or tool name; it is literal replacement, not executable code. It changes displayed text only; the pinned selection and lifetime rules remain implementation.

For example, adding `view: "cat"` to `commands.names` recognizes a `view` executable with `cat` syntax. Changing `labels.read.completed` to `"Inspected"` changes its completed activity to `Inspected <file>`. These settings never execute a command, change its arguments, or add model guidance. Defaults match the recorded reference; operator overrides deliberately change presentation.

## Out of Scope

For body eligibility, the operation wire format, command parser, model-facing guidance, execution, and working-label priority/lifetime are unchanged. No provider visibility flags, new operation kinds, output-presence/count threshold, new setting, additional Pi-version matrix, or live-app parity claim is introduced. Pushing remains a separately authorized action.

A separate package, new tools, execution changes beyond the Ctrl+C correction, declaration-schema changes, a shell interpreter, settings UI or persistence, a repository-wide configuration framework, new output viewers, display-driven polling, extra model calls, automatic notifications, old-history migration, producer-specific chat rules, ChatGPT.app/Codex system and other prompts, additional model guidance, and claims of complete app visual parity.

## Further Notes

**Body-eligibility documentation alignment (2026-10-19):** The chat specification remains the behavior authority; this companion specification records the unchanged provider-fact and label-selection obligations. The user already approved the sole real-Pi host seam and one complete ticket, so this synthesis adds neither a new interview nor a new task graph. Chat 19 was published as `ready-for-agent`, then implemented and resolved on the integration branch. It stays resolved. Its existing evidence is 147/147 combined cases, seven targeted host probes, static checks, and separate self-performed Standards/Spec reviews at `39263b9`. Those results are carried forward, not a new behavioral test run for this documentation-only update; physical-terminal, live Codex, other-version, and full-repository-suite limits are unchanged.

The thought-title correction at `fc33210` passes 141/141 chat/combined-workflow checks on each of Pi 1.0.2 and 1.1.0, both typechecks, repository lint/format, and diff checks. Existing cases now verify title retention through body streaming and partial later headings, absence of body text in status, both native indicator placements, and narrow/wide resize. The captured thought selects `Auditing project requirements` and renders one line. Separate standards and specification reviews found no actionable issue. [Ticket 13](../../.scratch/tool-activity/issues/13-thought-titles.md) records logs and unperformed physical checks; its temporary compatibility fixture is removed.

The command reference is [the parser in the installed app's Codex build](https://github.com/openai/codex/blob/740e5af33c71225640e0c1c1555c514c2c93ab74/codex-rs/shell-command/src/parse_command.rs), with its Bash helper and grammar. `/Applications/ChatGPT.app/Contents/Resources/codex-cli/codex-package.json` identifies `0.162.0-alpha.17.2`; the upstream release tag resolves to that commit. The user's clarification to match the app requires this newer reference instead of the initial local checkout. This source pin is distinct from the unchanged frozen tool-interface capture and the installed-app presentation evidence. Apache-2.0 attribution accompanies the port. The integration base and existing host/contract seams are already established; the user's explicit direction to implement the agreed delta authorizes the three independent slices and their integration verification.

The earlier working-label delta was verified at `4e27987`: 141/141 chat/combined-workflow checks on each of Pi 1.0.2 and 1.1.0, followed by 8/8 activity checks on each after restoring the final background-update assertion. All 1,409 comparison inputs matched the installed desktop helper and its bundled parser. Those checks did not establish correct mapping from a whole Pi thought or single-line status rendering; the later screenshot exposed both gaps. The [source record](../plans/working-label-parity.md), Ticket 12, and correction Ticket 13 distinguish that historical evidence from the new acceptance cases.

The earlier activity delta passes 351/351 affected-package checks on Pi 1.0.2 and 141/141 chat/combined-workflow checks on Pi 1.1.0 at `fbc8030`. Both typechecks and repository lint/format checks pass. The complete 440-case parser corpus matches the pinned reference; 106 original Rust tests pass, and 9,646 additional differential vectors show no differences. Ticket 09 retains that earlier evidence.

The earlier correction passed 343 affected-package checks on Pi 1.0.2 and 134 chat/combined-workflow checks on Pi 1.1.0 at `789b142`. [Ticket 05](../../.scratch/tool-activity/issues/05-skill-reads-across-tools.md) retains that historical evidence and its unperformed physical-app and live-model checks.

The wire agreement remains `pi.activity`. Live events carry incremental updates; retained custom entries carry the same updates in `data.activity`. Returned `details.activity` carries a complete snapshot, image ownership, and bindings. Each incremental operation is a complete replacement of that operation's facts; a full result snapshot supersedes older observations, while later revisions can continue it.

An update has version 1, a stable source ID, originating call ID and session ID, a nonnegative safe revision, and ordered operations. An operation has stable ID, order, revision, status, applicable inputs, bounded output, and optional omission state. Kinds describe a command and its submitted actions, file edits with individual outcomes/counts, an image path, an otherwise generic tool, or execution error/output facts retained from earlier history. A command's optional `shell` is a nonempty string array with a nonempty executable; remaining arguments may be empty strings. Append each `commands` string to that prefix before recognition. An operation revision cannot exceed its update revision. Unknown kinds or versions fall back to generic presentation.

Result bindings use SHA-256 over the existing JSON representations of content and the update/image-owner pair. They detect inconsistent transformations, not authenticity. Image ownership is an ordered array of operation IDs or null, matching the native image parts. Image bytes and Pi's recognized conversion/resize hints may change during native processing; actual processed content is the only image source. No image bytes belong in metadata. A valid empty operation snapshot deliberately creates no normal activity; missing or invalid metadata does not.

This corrects the separate-package and nonempty-script-result decisions in the previous revision. Its 335 Pi 1.0.2 and 126 Pi 1.1.0 passing checks did not establish the newly supplied screenshot cases. [ADR 0019](../adr/0019-tool-renderers-own-tool-presentation.md), [ADR 0024](../adr/0024-core-tools-use-native-extension-lifecycle.md), and [ADR 0016](../adr/0016-search-retained-transcript-content.md) govern the revised ownership, display, and source navigation. The [reference plan](../plans/core-tool-activity-alignment.md), [chat specification](pi-chat.md), and [toolset specification](../../.scratch/core-tools/spec.md) retain the broader context.

The following TypeScript describes the wire data, not an importable package:

```ts
type Status = "running" | "completed" | "failed" | "unknown" | "unattempted";
type Body = {
  args?: Record<string, unknown>;
  output?: string;
  outputOmitted?: boolean;
};
type File = Body & {
  id: string;
  path: string;
  status: Status;
  changes?: { added: number; removed: number };
};
type Operation = Body & {
  id: string;
  order: number;
  revision: number;
  status: Status;
  cwd?: string;
} & (
    | { kind: "command"; commands: string[]; shell?: string[] }
    | { kind: "edit"; path?: string; files?: File[] }
    | { kind: "image"; path?: string }
    | { kind: "tool"; name: string }
    | { kind: "output" } // Version 1 retains this kind for execution errors and old results.
  );
type Update = {
  version: 1;
  id: string;
  callId: string;
  sessionId: string;
  revision: number;
  operations: Operation[];
};
type Details = {
  activity: {
    update: Update;
    imageOwners: (string | null)[];
    contentHash: string;
    activityHash: string;
  };
};
```

IDs, file paths, and generic tool names are nonempty strings. Operation IDs are unique within an update; file IDs are unique within their operation. Orders, revisions, and change counts are nonnegative safe integers; a command has at least one command string. Every non-null image owner identifies an operation in the snapshot. `outputOmitted` describes retained body limits without deleting the operation or changing its outcome. For version 1, `kind: "output"` with failed status carries execution error facts; other text-only output facts have no normal row.

Compute `activityHash` as SHA-256 of UTF-8 `JSON.stringify({ update, imageOwners })`, keeping that property order and the supplied facts' JSON property order. Compute `contentHash` the same way over the content array after replacing every image part with `{ type: "image" }`, leaving text parts unchanged. The consumer also accepts Pi's appended image-conversion and resize hints immediately after an image: `[Image converted from <mime> to <mime>.]` and `[Image: original <width>x<height>, displayed at <width>x<height>. Multiply coordinates by <decimal> to map to original image.]`, separately or together as one text part. Other text is never excluded. These bindings detect inconsistent transformations; they do not authenticate a provider. A result hook that removes or changes the facts or content must supply consistent new bindings or accept the generic fallback.
