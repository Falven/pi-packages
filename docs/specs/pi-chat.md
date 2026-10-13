# pi-chat specification

## Problem Statement

Pi users need to follow current activity, inspect earlier work, and find retained conversation content without reading an unbroken stream of commands, thoughts, and output. Existing extensions provide parts of this experience, but their overlapping rendering and input changes can conflict.

The desired experience uses consecutive activity groups, inline thought previews, and collapsible work history with the final response remaining visible. It must operate inside Pi's terminal interface, preserve the original conversation, and reuse native content presentation. It must not require a separate application, service, Pi fork, or modifications to Pi's installed source.

## Solution

Build `pi-chat`, one extension that owns the main chat view in Pi's fullscreen mode. A chat view is the primary conversation surface alongside the composer; a transcript is a separate history-reading overlay and is outside this package's scope.

The extension composes Pi's existing message and tool components into occurrence-aware work histories, activity groups, and inline thought disclosures. Final responses appear after their work history and remain visible when that history closes. Expanded activity groups and live thought previews use bounded inline viewports. Search finds retained content independently of folds and reveals the corresponding occurrence.

Pi continues to own conversation data, execution, effective Markdown and tool rendering, the composer and surrounding dock, themes, terminal protocols, and final painting. One version-specific adapter supplies the private runtime access required for exact native component identity and composition. The initial supported runtime is Pi 1.0.2. Regular mode and the history printed on exit retain native behavior.

## User Stories

1. As a Pi user, I want an integrated fullscreen chat view, so that I can follow work without opening another application or reader.
2. As a Pi user, I want my existing composer, pending messages, widgets, status, and footer to remain usable, so that changing the chat view preserves my working environment.
3. As a Pi user, I want native Markdown rendering and its effective transformations, so that prose, code, and links retain their existing presentation.
4. As an extension author, I want my tool's call and result renderers to remain responsible for its presentation, so that grouping does not reinterpret or discard its information.
5. As a Pi user, I want replacement and custom tools to participate without classification rules, so that changing tools does not require chat-specific configuration.
6. As a Pi user, I want native images and hyperlinks to remain usable inside expanded content, so that folding does not remove richer output.
7. As a Pi user, I want the current native theme to apply throughout the chat view, so that its appearance stays consistent when the theme changes.
8. As a Pi user, I want native retry, interruption, error, and compaction notices to retain their position and meaning, so that I can understand the session's actual state.
9. As a Pi user, I want consecutive eligible tool calls grouped across assistant messages, so that model iteration boundaries do not fragment related activity.
10. As a Pi user, I want commentary, thoughts, user messages, and other activity boundaries to separate tool groups, so that grouping preserves conversation order.
11. As a Pi user, I want group summaries based on call count and actual tool names, so that the summary remains accurate for unfamiliar tools.
12. As a Pi user, I want each tool call counted once regardless of files, output sections, or updates, so that group size describes calls rather than renderer internals.
13. As a Pi user, I want activity groups collapsed initially, including while active, so that routine execution does not overwhelm the chat view.
14. As a Pi user, I want a group I open to stay open as calls arrive and finish, so that streaming does not undo my choice.
15. As a Pi user, I want an active group or unfinished call to retain its outer accordion, so that a temporarily single-call group does not repeatedly change structure.
16. As a Pi user, I want a settled group containing one finished call to display that call directly, so that I do not need a redundant outer disclosure.
17. As a Pi user, I want a settled group containing several calls to retain its accordion, so that I can inspect or hide them together.
18. As a Pi user, I want ordinary tool failure or cancellation to preserve the group's chosen fold state, so that tool outcomes do not unexpectedly toggle its presentation.
19. As a Pi user, I want an expanded activity group to scroll within a bounded body beneath its header, so that long output does not push its controls away.
20. As a Pi user, I want group-only toggles to preserve each tool's detail state, so that reopening a group restores the level of detail I selected.
21. As a Pi user, I want Pi's global tool-expansion action to control groups and tool details, so that the existing action remains useful.
22. As a Pi user, I want work-history folding independent of group and tool-detail choices, so that hiding earlier work does not erase those choices.
23. As a Pi user, I want the final response outside the work-history fold, so that I can read the answer while earlier activity is collapsed.
24. As a Pi user, I want identical earlier and final text treated as distinct occurrences, so that an earlier “Done” can remain hidden while the final “Done” stays visible.
25. As a Pi user, I want work to collapse when a qualifying final response starts when the provider identifies that phase, so that I can concentrate on the answer while it streams.
26. As a Pi user, I want providers without final-phase information handled without guessing from prose, so that presentation does not invent an answer boundary.
27. As a Pi user, I want explicit expansion choices honored when work becomes eligible to collapse, so that deliberate inspection can keep the work open.
28. As a Pi user, I want cancellation to leave work expanded even after a partial final response, so that interrupted activity remains available for inspection.
29. As a Pi user, I want work expanded when no qualifying final response exists, including when a terminal error disqualifies an earlier candidate, so that a missing answer does not hide the work.
30. As a Pi user, I want automatic collapse to follow activity and answer state without depending on scroll position or selection, so that its behavior is predictable.
31. As a Pi user, I want a bounded, following thought preview at the thought's own position, so that the live preview remains part of the conversation as I scroll.
32. As a Pi user, I want the thought body to collapse to its disclosure when thinking finishes, so that completed thoughts stop taking space automatically.
33. As a Pi user, I want to reopen a completed thought in place, so that its content remains available afterward.
34. As a Pi user, I want a delivered steering message to remain within the current work history while separating activity groups, so that its relationship to ongoing work remains clear.
35. As a Pi user, I want a delivered queued follow-up to start its own work history and final response, so that separate requests do not share an answer fold.
36. As a Pi user, I want consumed, cleared, or undelivered input excluded from delivery relationships, so that the chat view reflects what the agent actually received.
37. As a Pi user, I want established work and answer relationships reconstructed after reopening or branching a session, so that presentation does not rely solely on live observation.
38. As a Pi user, I want uncertain historical work relationships left unfolded without invented boundaries or explanatory messages, so that missing provenance does not distort history.
39. As a Pi user, I want known tool and thought disclosures and search to remain available in uncertain history, so that one missing relationship does not disable the rest of the view.
40. As a Pi user, I want manual fold choices to survive redraw and resize but reset on restart or extension reload, so that their lifetime is consistent and does not alter session content.
41. As a keyboard user, I want one Pi-registered shortcut to focus the nearest visible disclosure from the composer, so that every disclosure is reachable without a mouse.
42. As a keyboard user, I want configured selector actions to move between disclosures and confirm to toggle them, so that interaction follows my effective Pi bindings.
43. As a keyboard user, I want cancel to return focus to the current composer, so that inspecting activity does not require a separate reader or slash command.
44. As a Pi user, I want native tool pointer handlers to receive their own events first, so that tool controls remain interactive inside groups.
45. As a Pi user, I want unused wheel movement to pass from an inner viewport to its parent, so that scrolling can continue naturally at a boundary.
46. As a Pi user, I want Page Up, Page Down, and prompt navigation to target the main chat viewport, so that global navigation does not become trapped in a painting fragment.
47. As a Pi user, I want my visible occurrence and local row preserved when content heights change, or the end followed when already following, so that streaming and resizing do not arbitrarily move my reading position.
48. As a Pi user, I want search to find retained messages, thoughts, commands, and tool output inside closed folds, so that I do not have to expand history before looking for content.
49. As a Pi user, I want search to match readable Markdown labels and code rather than hidden link destinations or structural markup, so that results correspond to content I read.
50. As a Pi user, I want search to include retained pre-compaction content, so that summarization does not make the original conversation undiscoverable.
51. As a Pi user, I want search limited to the active branch and its ancestry, so that results do not silently navigate into a sibling conversation branch.
52. As a Pi user, I want selecting a result to open the necessary folds and reveal its occurrence, so that a hidden match becomes directly accessible.
53. As a Pi user, I want exact matching text highlighted when reliable and the owning tool call highlighted otherwise, so that navigation works without altering the tool's presentation or adding an excerpt.
54. As a Pi user, I want stale search results revalidated when content or the branch changes, so that selecting a result does not reveal the wrong occurrence.
55. As a Pi user, I want selection to span expanded content across inline viewports, including their offscreen rows, so that copying a range preserves the text between its endpoints.
56. As a Pi user, I want collapsed bodies excluded from selection copying, so that a copied range respects the folds shown in the chat view.
57. As a Pi user, I want selection to respect terminal cells and Unicode and use native copy actions and clipboard transport, so that copied content matches my intended range.
58. As a Pi user, I want ordinary scrolling to preserve selection and folding, reflow, or selected-content changes to clear it, so that selection does not silently refer to different text.
59. As a Pi user, I want native overlays to retain focus priority and restore the correct underlying focus, so that chat controls do not intercept overlay input.
60. As a Pi user, I want regular mode and the history printed on exit to retain native behavior, so that the extension does not rewrite terminal-owned scrollback.
61. As an extension author, I want current renderer registrations and Markdown transformations respected after reload and session changes, so that the view does not retain a stale extension environment.
62. As a Pi user, I want session switching, reload, and unload to restore the host cleanly, so that old callbacks, state, or components do not affect another session.
63. As a Pi user, I want original message text and model context preserved without embedded identifiers, so that copying, other extensions, and future model requests see the original conversation.
64. As a Pi user, I want historical rows materialized without rerunning tools or starting speculative previews, so that inspecting retained history has no execution side effects.
65. As a Pi user, I want unsupported runtime versions or conflicting chat-root ownership reported before activation, so that I am not given silently incomplete presentation.
66. As a maintainer, I want source references and native component caches reused without a second history buffer, so that memory use and ownership remain manageable.
67. As a Pi user, I want scrolling and fold toggles to avoid rescanning history or reprocessing unchanged source text, so that routine interaction does not perform unnecessary work.

## Implementation Decisions

- **Package and ownership.** Implement `pi-chat` as one extension with internal modules for the host adapter, occurrence and relationship indexing, fold policy, layout and interaction, and source search. These modules share one lifecycle and source identity model. Do not publish a support framework or require the composer, attachments, or skill-reference packages as runtime dependencies.

- **Native content boundary.** Pi remains the canonical owner of messages, session entries, model context, execution, and the native event reducer. Borrow its actual message and tool components and retain the effective renderer chain. Never insert markers into message content, replace messages for rendering identity, or maintain a second joined conversation buffer. Render-only source references and native rendered-line caches do not become conversation history.

- **Supported runtime.** Initially support the installed Pi 1.0.2 runtime through one explicitly version-specific in-process adapter. This is the accepted exception to the repository's usual public-extension-only boundary. Validate the required host structure and ownership before activation. Unsupported versions, structural mismatches, or competing chat-root ownership must produce an explicit failure and leave native presentation available, without claiming partial support. The inspected 1.1.0 source checkout does not establish support for that release.

- **Host acquisition and root replacement.** Capture the actual `InteractiveMode` through a scoped observation of the native widget method reached by `ctx.ui.setWidget`; restore the prototype descriptor immediately. Verify TUI mode and the same session manager. Save and replace `fullscreenLayoutRoot`, reusing the exact pending-message, status, widget, editor, and footer containers. Leave the native document, chat container, and event reducer alive. Use the original document in regular mode and for history printed on exit.

- **Reload bootstrap.** Native history can be constructed before `session_start` on reload or session replacement. During extension initialization, temporarily observe `renderSessionEntries`. Recognize the owning runner by the function identity of the extension's registered relationship-entry renderer, install the instance adapter before history construction, and restore the prototype. Disarm any remaining observer at `session_start`; use widget acquisition for initial TUI startup. Support the normal Pi CLI lifecycle. Abandoned extension discovery through custom SDK loaders is outside this lifecycle contract.

- **History assembly and binding.** Replace only the small native history assembly step, using the exported `sessionEntryToContextMessages` helper and the pinned host's usage-notice rules. Associate projected items with their source entry and item ordinal. Invoke the original `renderSessionItems` once through a scoped iterator so the association remains available while it constructs direct tool rows, notices, and message rows. Observe insertion and removal paths. Keep unpersisted native notices by component identity and insertion position rather than inventing stored messages. Do not trigger an extra destructive history rebuild.

- **Native component association.** Associate assistant content parts and adjacent thinking runs with the native children produced by the pinned construction algorithm, including its trimming and thinking aggregation. Rebind those references after native assistant updates recreate children. Preserve native semantic terminal markers. Borrow actual tool components with their renderer state, callbacks, and image instances; do not create another active presenter for the same call.

- **Absent historical content.** Materialize rows omitted by Pi's compaction-aware display projection through native factories into a detached destination, without populating editor history or clearing live pending-tool state. Use historical tool initialization without execution-start behavior or speculative edit previews. For otherwise-hidden thought bodies, use native assistant construction with a render-only array referencing the original thought blocks and the current Markdown environment. Reuse these owned historical presenters until a relevant invalidation or lifecycle change requires replacement.

- **Occurrence identity.** Assign a stable presentation handle to each source occurrence. A live handle points to the current live message and content part; after native persistence, promote that same handle to its committed entry and part reference. Use source entry and projected item ordinal where one entry yields several native items. Content equality, hashes, callback order, timestamps, and screen position do not determine occurrence identity. Equal progress and final text therefore remain independently addressable.

- **Incremental indexing.** Index the raw active branch once, including retained originals omitted by compaction. Reconcile appended entries and changed live occurrences incrementally, and rebase on session or branch changes. Retain references, classifications, revisions, and relationships rather than copied message bodies. Scrolling and folding consume the existing index; they do not scan history or hash unchanged content. No hashing dependency is required by this design.

- **Actual input delivery.** Observe the message objects passed to the particular agent's initial prompt operation and returned by its steering and follow-up queue drains. Preserve calls and return values unchanged. Certify delivery only when the corresponding user message starts. An agent listener ordered after native session persistence joins delivered objects to committed entries. Submission intent, queued text, or an input-handler snapshot cannot establish delivery, including when queued prompts contain identical text.

- **Work relationships.** A delivered steering message continues the current work history and forms a user boundary between activity groups. A delivered follow-up starts a new work history and answer relationship. An assistant message boundary or agent-loop boundary alone does not begin new work. Preserve source order throughout.

- **Relationship persistence.** Append only minimal native custom session entries for certified delivery, work, and final-phase relationships needed on replay. They contain classifications and source references, never copied conversation text or fold choices, and remain outside model context. Interpret references within the session journal so copied history in a fork can be rebased. Persist established facts, not guesses that attempt to repair missing provenance.

- **Historical uncertainty.** When historical delivery or phase provenance is unavailable, leave only the uncertain work relationships unfolded. Preserve known ordering, tool and thought disclosures, and search. Do not invent boundaries, phase labels, or explanatory chat messages. Missing historical provenance is distinct from an unsupported host structure, which prevents adapter activation.

- **Activity eligibility and summaries.** Every top-level tool call is eligible. Consecutive calls accumulate across assistant messages until commentary, thoughts, user rows, other standalone non-tool activity, or an explicit boundary intervenes. Count each call once. Summaries use observable call count and actual tool names. Do not infer semantic categories, scrape renderer titles, add exclusion lists, or require a tool-supplied grouping protocol.

- **Activity-group lifecycle.** Groups begin collapsed, including while executing. A group stays active while additional consecutive calls can still join; completion of its current call alone does not settle it. Keep its outer accordion while active or while any call is unfinished. Once the group reaches summary state, display exactly one finished call directly with its native detail controls, and retain the outer accordion for multiple calls. Preserve manual expansion while the group exists. Ordinary call failure or cancellation does not change its fold choice. One call editing many files remains one call.

- **Fold interaction and lifetime.** Pi's global tool-expansion action controls group and tool-detail expansion. A group-only toggle preserves child detail choices; whole-work folding is independent. Store manual choices in memory, retaining them through redraw, growth, completion, and resize while their disclosure exists. Reset them on application restart or extension reload. Do not store choices in conversation content or relationship entries.

- **Final-response selection.** Keep provider phase, selected final response, and settled work outcome as separate facts. Associate provider phase evidence with the exact normalized content occurrence, including when several provider items share one assistant message. Remove the selected final occurrence from the work activity sequence and present it after the work history. Never identify it by matching text. Native user and standalone activity ordering remains intact.

- **Work-history collapse.** Work becomes eligible to collapse as qualifying final-response text starts, subject to explicit expansion and keep-open choices. A successful completion is not required. Selection and scroll position do not defer automatic collapse. Cancellation removes automatic collapse eligibility and leaves work expanded even after a partial final response; activity groups retain their independent state. No qualifying final response also leaves work expanded. A terminal error that disqualifies the final candidate returns work to that condition; failure alone is not a blanket completed-answer requirement.

- **Providers without final-phase evidence.** When the provider supplies no usable final-phase information, treat the text of a qualifying terminal assistant message as one final response only after work settles. Do not split its prose into commentary and answer, infer phase from wording, or promise early collapse without evidence. Preserve cancellation and missing-final behavior.

- **Inline thoughts.** Show a bounded thought body at its own chat occurrence while thinking is active, using native content presentation and logical following behavior. Collapse the body there when thinking finishes while retaining a disclosure that can reopen it. Do not move the preview to a docked widget. Account for the native renderer's adjacent thinking-block aggregation in source mapping.

- **Logical viewports and anchors.** Maintain a logical tree of source occurrences, disclosures, and bounded bodies. Compose Pi's `ScrollView` state for offsets and bounds. Keep an activity group's header outside its bounded scrolling body; expanded whole-work history occupies normal chat flow. Preserve the first visible occurrence and local row when heights change, or follow the end if that viewport was already following.

- **Layout and native painting.** Allocate the existing dock first, then measure dirty content at its final width and intersect all logical clips. Present each resulting contiguous leaf interval through one fully visible, non-nested native `ScrollView` over the original uncropped rows. Give each painting interval its exact height, hide its painting scrollbar, avoid clipping ancestors, and give each occurrence one presentation location. Retain image reservation rows and native image instances. Pi performs the sole image crop, transmission, placement, and terminal diff; the extension does not stack independent native crops.

- **Rendering cost.** Preserve native renderer instances and caches. Use frame-local references to rendered rows so measurement and painting do not render a borrowed component twice. Scrolling changes offsets and requests a redraw without invalidating unchanged Markdown. Add another cache only when all invalidations can be observed and measurements justify it. Native opaque renderers can still traverse or render a whole body; a small viewport does not establish bounded rendering cost.

- **Pointer and navigation routing.** Use Pi's terminal input decoding and effective bindings. Map normalized pointer coordinates through logical geometry to the original child, offer events to that child first, and pass unused wheel movement from the innermost logical viewport outward. Native Page Up, Page Down, prompt navigation, and Find target the primary logical chat viewport rather than a painting interval. Preserve overlay priority and composer behavior.

- **Keyboard disclosure access.** Register one shortcut through Pi to transfer focus from the composer to the nearest visible disclosure. Reuse configured selector up/down actions to move between disclosures, confirm to toggle, and cancel to return to the current composer. Use native focus dispatch and overlay restoration. No slash command or separate reading view is introduced. The concrete shortcut chord was not selected during design; binding it must respect native action conflicts rather than silently repurpose completion or thinking controls.

- **Selection and copy.** Own selection geometry within the chat view using occurrence, rendered-row, and terminal-cell endpoints. Traverse expanded content between endpoints, including offscreen rows within expanded bodies, while excluding collapsed content. Reuse native `app.message.copy`, copy-on-select, and clipboard transport. Preserve selection during ordinary scrolling; clear it when folding, reflow, or selected-content changes invalidate the range. Clearing selection does not delay agreed automatic fold transitions.

- **Search corpus.** Search retained readable source fields on the active branch and its ancestry, including messages, thoughts, commands, tool results, and pre-compaction originals. Match Markdown link labels and code bodies, excluding structural markup and hidden destinations. Keep source-field references, revisions, and match ranges rather than a joined corpus. Sibling branches are excluded. Revalidate results after source changes or branch rebasing.

- **Search input and reveal.** Reuse Pi's search input with an owned source-result controller because native Find searches rendered lines. Selecting a hit opens its ancestor folds, creates any missing historical native row at its source-ordered position without changing Pi's session projection, and reveals it through the logical viewports. Highlight the exact rendered range when mapping is reliable. If a tool renderer omits or ambiguously transforms the matching source, highlight the owning call. Add no excerpt, separate preview, or rewritten tool result to expose the match.

- **Effective renderers and lifecycle.** Resolve the current theme, Markdown environment, and renderer registry after relevant lifecycle changes. Rebind painting and input adapters when Pi replaces its renderer during mode switches. Forward root invalidation to the saved native root once, then invalidate owned geometry and presenters. Do not retain an old extension runner after reload or session replacement.

- **Cleanup.** Mark adapter callbacks inactive before cleanup, release owned timers, subscriptions, search and selection state, and restore only methods and roots still owned by this adapter. Restore temporary prototype observations promptly. Release borrowed component references without disposing the native components. Wrappers retained by another owner must become inert after disposal; owned historical presenters follow their own lifecycle. Do not overwrite a later owner's host changes during restoration.

## Testing Decisions

- **Primary seam:** run `pi-chat` inside the real pinned Pi `InteractiveMode` and `AgentSessionRuntime`, loaded through the normal extension loader. Drive scripted provider responses, real tool execution, terminal input, resize, and native lifecycle operations. Record terminal output, clipboard-boundary output, provider requests, and persisted entries. This is one integration boundary for the adapter, occurrence index, fold policy, layout, selection, and search together; do not substitute a separately simulated chat host.

- **Reuse existing fixtures.** The repository's native-host fixtures already create a real Pi runtime and session, substitute a recording terminal, and serve controlled responses through an in-process test provider. The composer fixture currently loads the composer implicitly, disables tools, and controls whole responses rather than arbitrary stream stages. Extract only the neutral host setup needed for explicit extension loading, retaining the existing package-specific convenience behavior for its callers. Load `pi-chat` alone by default and opt into composer, attachment, skill-reference, or test extensions for interoperability cases. This fixture is test infrastructure, not a published runtime package or product service.

- **Small fixture extensions.** Allow queued provider scripts to emit thought, text, and tool-call stages, pause, finish, fail, or disconnect. Exercise final-phase evidence through actual provider response formats and Pi's parser. Permit native tools and deterministic test tools through normal extension registration, with controlled progress and results. Allow the native settings and mode changes needed to exercise retries, compaction, and fullscreen transitions. Retain raw protocol bytes and expose fresh complete frames for visual assertions.

- **External assertions.** Assert what a user sees and can operate, what copying produces, what the provider receives, and what the session records. Test through actual input and lifecycle operations, not direct calls into private `pi-chat` reducers or assertions on its index structure. A cumulative stripped terminal log is not a current screen: text visible before a fold remains in that log. Use fresh forced frames for visibility assertions, and raw bytes for terminal protocol behavior.

- **Existing precedents.** Composer selection and native UI tests cover mouse and wheel input, Unicode, theme and resize changes, widgets, overlays, and delayed image loading. Submission-recovery tests exercise steering, follow-ups, failures, and compaction; session-draft tests exercise reload, session replacement, and reopening. Mixed-composition tests demonstrate real tool execution and multi-extension behavior. Attachment image tests cover native image conversion, Kitty sequences, dimensions, and hyperlinks. Reuse these fixture patterns with the existing Node test runner.

- **Required automated behavior:**

| Scenario                                                                                                | Observable result                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Equal progress and final text, including separate parts of one assistant message                        | The intended work occurrence folds while the final occurrence stays visible; source text and subsequent provider input remain unchanged.           |
| Consecutive calls across model iterations, interrupted by commentary, thoughts, or delivered user input | Call groups follow activity order and actual boundaries, with one count per call.                                                                  |
| Active singleton, finished call with group still active, settled singleton, and settled multiple calls  | The outer accordion follows the accepted lifecycle; native tool controls remain available.                                                         |
| Manual group expansion, child-detail changes, global tool expansion, failure, and cancellation          | Each fold level changes only according to its own policy.                                                                                          |
| Phase-bearing final stream, no-phase provider, partial final, terminal error, and cancellation          | Early collapse occurs only with qualifying evidence; fallback selection waits for settlement; cancellation and missing finals leave work expanded. |
| Thought growth, completion, reopening, and scrollback                                                   | Preview and disclosure occupy the same source position with the correct bounded body.                                                              |
| Identical queued prompts, cleared input, steering, and follow-ups                                       | Only delivered messages acquire relationships, and each request retains the correct work and final response.                                       |
| Reload, restart, branch switch, copied session history, and missing historical metadata                 | Established relationships reconstruct; fold choices reset at their agreed lifecycle boundaries; uncertainty affects only uncertain work folds.     |
| Custom and replacement tool renderers, Markdown transformations, and renderer updates                   | Native presentation and side effects occur through one active presenter; exact occurrence ownership survives transformed text.                     |
| Expanded groups, offscreen rows, pointer controls, wheel boundaries, keyboard navigation, and overlays  | Input reaches the correct control or viewport; native overlay and composer focus remain correct.                                                   |
| Selection across bodies with Unicode, subsequent scroll, resize, fold, and changed selected text        | Copy includes expanded intervening text, excludes collapsed bodies, and clears invalidated ranges.                                                 |
| Search across folded and pre-compaction content, branch changes, and transformed or omitted tool output | Results cover the retained active path; navigation reveals the right occurrence and uses text or owning-call highlighting as appropriate.          |
| Historical tool rows materialized by search                                                             | Native historical presentation appears in source order without tool execution, speculative previews, or changes to the model's history projection. |
| Image intervals clipped by several logical viewports and changed by resize or folds                     | Emitted native painting instructions apply one crop and retain coherent image identity and reservation rows.                                       |
| Theme changes, mode transitions, reload, unload, failed activation, and conflicting root ownership      | Native host state is preserved or restored, stale callbacks are inert, and unsupported activation is reported explicitly.                          |

- **Real-terminal acceptance.** Use the same loaded extension in an actual supported terminal to check image pixels and stale placements during nested clipping, folds, resize, and mode changes; terminal cell metrics and capability negotiation; mouse and keyboard protocols; visible selection and clipboard behavior; overlay focus; and fullscreen entry, exit, and printed history. A recording terminal is not a terminal emulator and cannot establish these results from emitted bytes alone. Existing terminal acceptance fixtures can supply isolated sessions and deterministic activity, but their print-mode checks are not evidence of interactive acceptance.

- **Verification limits.** Automated tests run the implemented adapter, layout, selection, search, and lifecycle behavior inside Pi 1.0.2's real `InteractiveMode` with a recording terminal and scripted provider. Mixed-session tests cover both supported extension load orders, native and custom tool presentation, streaming final phases, retained historical reveal, image-setting changes, reload, compaction, retry, interruption, theme, and mode switches. These tests establish emitted protocol bytes and host behavior, not visible pixels or input in a physical terminal. Actual-terminal image, clipping, selection, overlay, resize, mode, and printed-exit acceptance remains pending. No benchmark establishes bounded frame cost; do not claim complete terminal support or compatibility with arbitrary chat-root replacements. Add performance assertions only around an observed problem and a measured contract.

## Out of Scope

- Editing Pi's source, maintaining a Pi fork, replacing its client, or creating an external application, service, terminal installer, or viewer. A requirement that needs a broader implementation must return to discussion.
- A separate transcript-reading overlay, a `/transcript` command, or another navigation view.
- Model verbosity, reasoning effort, model selection, and other model controls. This package changes presentation.
- Planning and todo workflows, subagent workflows, pending-question and recorded-answer workflows, and message actions. Their existing native integrations remain usable; this spec does not build their packages.
- Reimplementing the composer, attachments, skill references, Markdown engine, tool presentation, terminal protocols, image transport, themes, clipboard transport, retries, reconnection, compaction, or agent execution.
- Tool semantic classification, inferred reading/searching/editing labels, renderer-title scraping, tool exclusion lists, patch-specific group exceptions, or a new grouping protocol for tool authors.
- Persistent manual fold preferences, embedded source markers, content-based occurrence matching, a duplicated transcript buffer, and a speculative hashing dependency.
- Searching sibling branches, hidden Markdown destinations, or discarded content that is no longer retained; search excerpts or a separate result-preview surface.
- Full accordion interaction in regular mode, rewriting terminal-owned scrollback, broad unverified Pi-version compatibility, or lifecycle support for abandoned custom SDK extension discovery.
- A new published UI framework, terminal-specific helper packages, speculative configuration, or performance claims unsupported by measurements.

## Further Notes

The product and architecture decisions are recorded in ADRs 0012–0022 and the repository glossary. ADR 0001 records the scoped exception that permits this private adapter. The package name is `pi-chat`; historical ADR filenames do not change their identity or imply that this package is a transcript overlay.

The accepted architecture is implemented against Pi 1.0.2 and exercised through the real-host testing seam; physical-terminal acceptance remains separate. Alt+G is the concrete disclosure-focus shortcut within the accepted interaction. It adds no command or separate view.
