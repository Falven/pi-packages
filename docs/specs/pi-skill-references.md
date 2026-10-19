# Skill references specification

## Problem Statement

Users need to invoke skills while composing ordinary prose and retain native or custom skill pickers. References must survive ordinary text editing and clipboard operations, contribute the intended instructions once, and preserve code examples and unrelated command behavior.

After submission, full skill instructions can overwhelm the chat view and obscure the user's actual request. Native Pi collapses the first leading skill block into a separate purple row but displays subsequent blocks as ordinary user text. Users want their reference-bearing request, not instruction dumps or additional skill rows, while keeping explicit skill invocation reliable and recorded instructions available for inspection.

## Solution

`pi-skill-references` extends native completion with `$` and inline `/` skill triggers and inserts ordinary `/skill:name` text. Canonical skill references carry their invocation meaning whether typed, pasted, or inserted by another extension. Submission includes each referenced skill's instructions once. The package works independently with native Pi and with `pi-composer`; installing `pi-chat` is optional. Physical-terminal acceptance uses the existing Ghostty/local macOS setup in Pi's fullscreen mode.

Terminal chat shows one normal user message containing the reference-bearing request. Skill instruction bodies and the separate purple skill row are omitted, without adding badges or expansion controls. A skill-only invocation remains visible as its canonical reference. Existing and resumed conversations receive the same presentation; when native Pi did not retain the original command text, the view reconstructs canonical references alongside the saved request rather than claiming to recover its exact original spelling.

This changes presentation only. Stored messages and model-facing instructions remain unchanged. Where retained-source Find is available, selecting a match inside a skill temporarily reveals that occurrence's recorded instructions without a purple row. Moving away from the occurrence or closing Find restores reference-only presentation. HTML exports and machine-readable outputs retain their existing behavior.

## User Stories

1. As a Pi user, I want `$` to offer skill completion within prose, so that I can select a skill where I mention it.
2. As a Pi user, I want `/` to offer skill completion within prose, so that I can use slash-style references without moving to the beginning of the draft.
3. As a Pi user, I want selected skills inserted as canonical native text, so that the reference remains portable.
4. As a Pi user, I want to type a canonical skill reference directly, so that I can invoke a known skill without a picker.
5. As a Pi user, I want pasted canonical references to retain their meaning, so that copying a request does not lose its explicit skill choices.
6. As an extension author, I want native text insertion of a canonical reference to work, so that my picker does not need a separate integration.
7. As a Pi user, I want references to remain character-editable, so that I can select, correct, or remove them using normal editing.
8. As a Pi user, I want ordinary cut and copy to carry reference text, so that I can reuse it across local Pi sessions.
9. As a Pi user, I want the configured native skill catalog and filtering, so that inline completion reflects the skills Pi actually makes available.
10. As a Pi user, I want my custom skill picker to keep working, so that I can retain its workflow.
11. As a Pi user, I want providers added before or after this package to remain effective, so that installing one extension does not erase another's completions.
12. As a Pi user, I want cancelled or stale completion requests to leave the current draft alone, so that asynchronous suggestions do not overwrite typing.
13. As a Pi user, I want selection of a skill to retain its qualified identity when a command has the same display name, so that the intended skill is used.
14. As a Pi user, I want native leading commands and their arguments to retain their behavior, so that inline skills do not interfere with commands.
15. As a Pi user, I want native `@` file and directory completion to remain effective, so that path references continue to work.
16. As a Pi user, I want several different skills in one request, so that I can combine their instructions.
17. As a Pi user, I want repeated references to one skill expanded once, so that the request does not contain duplicate instruction blocks.
18. As a Pi user, I want leading and inline references deduplicated together, so that placement does not cause duplicate instructions.
19. As a Pi user, I want skill-like text in code examples to remain literal, so that showing an example does not invoke it.
20. As a Pi user, I want URLs, paths, escaped references, and incidental dollar or slash text to remain literal, so that ordinary prose is not reinterpreted unexpectedly.
21. As a Pi user, I want unresolved references and skill read errors to preserve my text, so that I can correct the request.
22. As a Pi user, I want skill expansion to preserve attached images and other input transformations, so that adding instructions does not lose other context.
23. As a Pi user, I want skill expansion with normal, steer, and follow-up submissions, so that explicit references work through native delivery.
24. As a Pi user, I want inline skills with native Pi when `pi-composer` is absent, so that my skill workflow does not depend on one editor.
25. As a Pi user, I want attached text to remain available on demand until I restore it into the draft, so that scanning references does not pull attachment contents into the prompt.
26. As a Pi user, I want completion navigation, acceptance, and cancellation to use effective native bindings, so that my picker controls remain familiar.
27. As a Pi user, I want native undo to retain priority over in-editor completion keys, so that a remapped undo cannot accidentally accept a skill or submit a draft.
28. As a Pi user, I want extension-owned pickers to retain their focus and accepted shortcuts, so that their keys cannot also edit the background composer.
29. As a Pi user, I want completion and custom-picker insertion to replace a selection through the editor's normal history, so that one undo restores the selected prose and references.
30. As a Pi user, I want cancelling a custom picker to preserve my draft and selection, so that browsing skills does not commit an edit.
31. As a Pi user, I want submitted requests shown with their skill references rather than full instruction bodies, so that I can read my request without scrolling past loaded guidance.
32. As a Pi user, I want no separate purple skill row, so that invoking a skill does not add a second presentation of my request.
33. As a Pi user, I want a skill-only request to remain visible as its canonical reference, so that hiding instructions does not erase the user message.
34. As a Pi user, I want every skill in a multi-skill request presented consistently, so that the first skill does not collapse while later skills spill into the chat view.
35. As a Pi user, I want native leading invocations and extension-generated inline invocations to share the compact presentation, so that the route used to invoke a skill does not change readability.
36. As a Pi user, I want the retained request's prose, Markdown, and reference placement preserved when available, so that presentation does not rewrite what I asked.
37. As a Pi user, I want canonical references reconstructed when the original command text is unavailable, so that older native invocations remain identifiable without inventing the original input.
38. As a Pi user, I want new, existing, and resumed conversations to use the same presentation, so that reopening a session does not bring instruction dumps back.
39. As a Pi user, I want historical references to remain readable after a skill is renamed, changed, or removed, so that my conversation does not depend on today's skill catalog.
40. As a Pi user, I want skill-bearing normal, steering, and follow-up messages presented compactly without changing their content, so that their delivery, order, and relationship to agent activity remain intact.
41. As a Pi user, I want the agent to receive the same full instructions as before, so that improving readability does not make explicit skill loading depend on the model choosing to read a file.
42. As a Pi user, I want retained history left unchanged, so that compact presentation does not destroy the instructions actually used for a request.
43. As a Pi user, I want compact presentation when only `pi-skill-references` is installed, so that I do not need `pi-chat` for skill-reference behavior.
44. As a Pi user, I want the same submitted-message presentation with the native editor and `pi-composer`, so that my choice of composer does not affect the chat view.
45. As an extension maintainer, I want skill interpretation and presentation owned by `pi-skill-references`, so that `pi-chat` does not need skill-specific rules or a dependency on this package.
46. As a Pi user, I want the feature to work without editing Pi's installation or using a fork, so that installing an extension does not replace my host runtime.
47. As a Pi user, I want retained-source Find to include recorded skill instructions, so that hiding them from ordinary chat does not remove useful search results.
48. As a Pi user, I want a selected instruction match to reveal only its owning skill occurrence, so that repeated invocations and other skills in the same request stay compact.
49. As a Pi user, I want matches in ordinary request text or visible references to leave instruction bodies hidden, so that searching my own request does not expand unrelated guidance.
50. As a Pi user, I want instruction reveals removed when Find moves away, loses the match, or closes, so that inspection does not permanently change the chat view.
51. As a Pi user, I want Find to reveal the instructions recorded for that invocation rather than the current skill file, so that I inspect the guidance the agent actually received.
52. As a Pi user, I want available retained and pre-compaction instruction occurrences to follow the same Find rules on the active branch, so that compaction does not create inconsistent inspection behavior.
53. As a Pi user, I want literal skill examples and unrecognized or malformed content preserved, so that compact presentation does not hide ordinary user-authored text.
54. As a Pi user, I want attachments and images preserved beside the compact request, so that hiding instructions does not remove other submitted context.
55. As a Pi user, I want selection copying and quoting to use the displayed text, so that selecting the compact request does not unexpectedly include hidden instruction bodies.
56. As a Pi user, I want native Markdown, themes, output padding, and resizing retained, so that references remain part of the normal user-message presentation.
57. As a Pi user, I want scrolling, focus, and occurrence targeting preserved as instructions are hidden or temporarily revealed, so that inspection does not leave blank skill rows or move me to another request.
58. As a Pi user, I want existing global expansion controls to retain their other behavior without reopening skill bodies, so that reference-only presentation is not an additional collapsed disclosure.
59. As a Pi user, I want no new command, setting, badge, or permanent skill expansion control, so that this readability change does not introduce another interaction to manage.
60. As a Pi user, I want reloads and session or branch changes to discard stale reveal state and safely rebind rendering, so that one conversation cannot affect another's presentation.
61. As a Pi user, I want optional chat and editor extensions to work in either supported load order, so that installation order does not duplicate rows, lose references, or disable Find.
62. As a Pi user, I want an incompatible rendering integration to report its limitation and preserve native operation, so that a presentation failure does not prevent invocation or lose a request.
63. As a Pi user, I want HTML exports and machine-readable outputs unchanged, so that this terminal-only feature does not alter other consumers of the conversation.
64. As a Pi user, I want disabling the extension to restore native presentation without migrating session data, so that the change remains reversible.

## Implementation Decisions

- Retain the existing Pi and TUI peers at `^1.1.0`; this feature does not require a dependency or runtime upgrade. Native adapter compatibility is established through required capabilities and real-host behavior, not a version-string allowlist.
- The package owns inline skill completion, submission-time expansion, skill interpretation, compact user-message presentation, temporary instruction reveal, and its native rendering adapter. Pi owns effective skill discovery, resource availability, command dispatch, base provider behavior, and conversation data. The active editor owns picker presentation, insertion, and undo. An installed `pi-chat` continues owning chat composition, selection, and source Find, without acquiring skill-specific rules.

### Completion and invocation

- `$` and `/` in ordinary prose are completion triggers. Inline `/` uses Tab in the native editor and opens automatically in `pi-composer`, following each editor's effective provider contract. A selected skill inserts native `/skill:name` text. Bare shorthand remains text until selection produces a canonical reference.
- Complete canonical skill references in ordinary prose carry explicit invocation intent regardless of whether they were typed, pasted, or inserted by another extension. Editing a reference changes its meaning according to the resulting text; no hidden identity is required.
- Use the effective native skill catalog and command/resource information exposed by public Pi interfaces. Retain native skill-command availability, filtering, and resource precedence.
- Wrap the supplied `AutocompleteProvider` through `addAutocompleteProvider`. Delegate unrelated suggestions and edits, preserve wrapper order and later provider updates, and carry cancellation, completion ranges, and resulting cursor positions through the native contract.
- Native completion providers and extension-owned pickers share canonical text insertion through existing Pi interfaces. The package preserves native `@` path completion and leading command/argument completion. The active editor controls its in-editor picker presentation; current Pi contracts do not provide a general renderer-replacement hook. Extension-owned pickers may use native UI and text insertion without a package-specific interface.
- Keep native action-specific key precedence. Accepted extension shortcuts and focused overlays retain host routing. Native undo runs before in-editor autocomplete; picker navigation, acceptance, and cancellation then precede ordinary editor fallbacks. A configured undo sharing a picker key must not also accept a reference, move a choice, or submit. Preserve native leading-command dispatch.
- Completion applies the effective provider's returned edit and caret position once through the active editor. An extension-owned picker uses the public text insertion/replacement route it chooses; selection replacement in `pi-composer` belongs to the same draft history. Cancelling a picker makes no edit and preserves the selection. Stale asynchronous results cannot replace later work.
- Restoring inline context preserves provider-added text even when it contains another copy of the completed reference on the same line. An ambiguous completion result leaves the original draft intact rather than moving prose to a guessed location.
- Distinguish skill selection from a command sharing its display name by inserting the qualified native skill spelling. Preserve Pi's native dispatch priority and command behavior.
- Recognize invocation tokens in the text delivered by Pi using Markdown-aware prose boundaries. Inline and fenced code, indented code, escaped text, link destinations, URLs, and incidental path/slash/dollar text retain their literal meaning. Pi's native submission trimming applies: use fenced code for a leading literal example whose indentation would otherwise be removed. Match complete skill names rather than prefixes embedded in other text.
- Markdown emphasis permits inline skill completion. Ordinary trailing Unicode punctuation is a reference boundary, while an exact catalog name still takes precedence and filename-like suffixes remain literal.
- Expand resolved references through Pi's public input transformation boundary. Preserve the draft's ordinary text representation; prepare the submitted instruction content without rewriting the saved draft.
- Deduplicate by the resolved native skill in first-reference order, including leading and inline occurrences. Each selected skill contributes one instruction block with its native resource context. Preserve surrounding prose and avoid expanding references inside inserted skill instruction bodies.
- Use public native discovery and exported helpers where available. Pi's built-in leading skill expansion is private, so it is an implementation reference rather than a callable public API. The extension's transformation must compose with that native leading-expansion step without duplication.
- Match native unresolved-skill behavior: an unknown name retains its text, and an unreadable skill preserves the reference while surfacing the read failure. Do not claim instructions were included when resolution or reading failed.
- Operate on the submitted prompt text. Attachment contents remain available on demand and do not become a second source of automatic skill invocation. Restored inline text follows the ordinary prose and code rules.
- Preserve images, input source, native input-handler order, and steer/follow-up behavior. Cooperate through existing Pi contracts with the native editor and `pi-composer`.

### Reference-only terminal presentation

- Keep submission-time expansion and the agent interface unchanged. Apply a render-only projection of recorded user-message text; do not replace model-facing content, rewrite retained messages, or change the instruction envelope merely to evade native rendering. Compact display is not a token-saving or on-demand loading feature.
- Omit recognized generated skill instruction blocks and the native purple skill row from ordinary terminal chat. Show the reference-bearing request as one normal native user message, without a separate card, placeholder, badge, disclosure, or new control. A skill-only request must still have visible canonical reference text.
- Handle all recognized leading skill blocks, not only the first. Cover native expansion and package-generated multi-skill messages while preserving surrounding request text, repeated references, aliases, and their available placement. Do not recursively interpret instruction-body references as additional user invocations.
- Prefer the retained reference-bearing request when available. When native expansion discarded the original command, reconstruct a canonical representation from recorded skill metadata and keep the saved request. Do not claim to recover unavailable spelling, whitespace, or placement, and do not consult today's catalog to reinterpret historical intent.
- Apply the same projection to live, queued-and-delivered, resumed, and historical user messages. Retained pre-compaction occurrences use it when the active transcript makes them available. Do not migrate old sessions or invent content no longer retained.
- Limit recognition to established expansion representations. Code examples, escaped references, unrelated text, and unrecognized or ambiguous structures remain literal and visible rather than being discarded by a broad text replacement.
- Reuse native user-message Markdown and preserve images, attachments, theme changes, output padding, wrapping, focus, selection, and reading position. Removing skill rows must also remove their otherwise-empty layout spacing. Selection copy and quote follow visible content; existing source-based copy actions keep their own contracts.
- Global disclosure expansion does not reveal generated skill bodies or create a skill disclosure. Temporary Find inspection is the only new reveal behavior; completion, submission, and existing non-skill controls remain unchanged.
- Keep the change confined to terminal chat. HTML exports, JSON/RPC and other machine-readable outputs, stored session entries, provider requests, and headless invocation behavior retain their existing semantics and content.

### Retained-source Find

- Preserve the active transcript's existing retained-source search capability. Do not implement a second search system or require `pi-chat` for ordinary compact presentation. Where retained-source Find is available, instruction bodies remain searchable even though ordinary chat omits them.
- Reveal only the recorded instructions belonging to the selected match's skill occurrence, at its owning user message, using normal Markdown without a purple skill row or permanent expansion control. Preserve the ordinary request and keep other skill occurrences compact, including identical invocations elsewhere in the conversation.
- A match in visible request prose or a reference does not reveal unrelated instruction content. Moving to a different skill occurrence moves the reveal; moving outside instructions, losing the selected match after a query change, or closing Find removes it. Navigating between matches within the same instruction occurrence may retain that occurrence's reveal.
- Use the saved instruction content and recorded resource context. Rendering and inspection must not read a current skill file, reload a removed skill, execute a tool, or initiate a model request. Missing retained content cannot be reconstructed from the filesystem and presented as historical fact.
- Identify the selected occurrence through the transcript's source identity and match range, not the skill name or equal message text. Keep reveal state transient and scoped to the current host, active branch, and selected match; clear it through reload, session replacement, and branch changes.

### Runtime adapter and optional cooperation

- Pi's public Markdown transformation hook runs after native leading-skill detection, so that hook alone cannot remove an existing purple skill row. Permit a narrow, reversible, instance-scoped native rendering adapter inside `pi-skill-references` for this specific gap. This is not permission to edit Pi source, replace installed host packages, fork Pi, or alter private message delivery.
- Use documented services first and the existing independent-extension adapter patterns for the remaining gap. Keep private integration isolated, check required host capabilities, preserve the original behavior for unrelated messages, and restore only hooks still owned by this extension. Do not leave global prototype changes installed or retain active callbacks after disposal.
- Prove the adapter against the real native user-message rendering path, including history construction before session-start callbacks during reload. A candidate interception point is not considered compatible until normal delivery, reconstruction, and cleanup have been exercised. Reuse existing native rows rather than creating a second transcript or replacing the active editor.
- Work independently with native Pi and cooperate with `pi-chat` and `pi-composer` when installed. Neither optional package is imported, required, or installed by this feature. Do not move skill parsing, canonical-reference reconstruction, or instruction-reveal decisions into `pi-chat`.
- If coordinating with the active transcript is necessary for source Find, use the existing optional in-process cooperation pattern through Pi's event bus. Exchange only generic source-selection and presentation information; the skill package supplies all skill-specific interpretation. Preserve either load order and keep one active presentation owner. Do not introduce a shared runtime package or general-purpose rendering framework.
- Do not add persistent presentation metadata, duplicate instruction snapshots, or another conversation buffer. Retain source identity and reuse recorded content. On missing capabilities or failed adapter installation, release partial hooks, report the limitation, and preserve native rendering and existing invocation behavior rather than losing input or mutating history.

## Testing Decisions

- The user approved the existing real Pi editor/session host as the single acceptance seam for this revision. Use the [shared recording-terminal host](../../fixtures/native-host.ts), normal extension loading, real input and lifecycle routes, retained sessions, and captured provider requests. Substitute only the controlled terminal, model server, and existing fixture-supported external services; do not add a production interface solely for testing.
- A good test submits or restores a real request and asserts the resulting current frame, retained source, and model-facing content. Verify observable behavior rather than private adapter methods or parser structure. Accumulated terminal writes and isolated input-handler assertions are not substitutes for checking the current presentation and actual host expansion order.
- Test `pi-skill-references` as the behavior owner, with optional chat/editor cooperation exercised through the same host. Existing [skill submission tests](../../packages/pi-skill-references/test/index.test.ts) provide expansion and queue prior art; [native chat tests](../../packages/pi-chat/test/native-chat.test.ts) and [source Find tests](../../packages/pi-chat/test/source-search.test.ts) provide reconstruction, duplicate-occurrence targeting, and temporary hidden-content reveal prior art. Keep the existing completion and invocation regression coverage.
- Verify native leading-whitespace trimming and a fenced leading literal example through normal, steer, and follow-up submission.
- Test through the public Pi editor/session boundary. Load the extension, request and accept completion through the effective provider, and submit through native input processing. Assert the resulting draft, instruction blocks, preserved literal text, image content, and errors.
- Use the shared host setup with the native editor and `pi-composer`, with custom pickers and provider wrappers installed in different supported orders. Test provider updates after the package is active.
- Use the existing Node test runner. Pi's skill slash-completion, skill-loading, and extension input-event suites provide prior art for catalog fixtures, command collisions, and transformation chaining. Assert externally visible results rather than private parser structure.
- Cover the following observable scenarios:

| Scenario                                                                                   | Required result                                                                                                  |
| ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Complete `$` or `/` at different prose positions                                           | Selection inserts the canonical reference at the correct range and caret position.                               |
| Complete within emphasis, including nested formatting and surrounding parentheses          | Completion opens through the active editor's normal route, preserves valid formatting, and undoes once.          |
| Accept a provider result containing the same reference elsewhere on the line               | Provider text and the returned caret survive; an ambiguous result leaves the original draft intact.              |
| Follow a canonical reference with Unicode punctuation or a filename-like suffix            | Prose punctuation permits invocation; exact catalog names take precedence and unrelated suffixes remain literal. |
| Insert the same canonical reference by typing, pasting, or a custom picker                 | Each route produces equivalent invocation behavior.                                                              |
| Edit, cut, copy, and paste reference text between drafts                                   | The resulting literal text determines invocation; canonical references remain portable.                          |
| Reference one skill repeatedly, including at the start and inline                          | Exactly one instruction block is submitted for that resolved skill.                                              |
| Reference several skills                                                                   | Each resolved skill contributes one block in first-reference order.                                              |
| Include code, escaped references, URLs, link destinations, paths, or incidental shorthand  | Literal spans survive and do not produce instruction blocks.                                                     |
| Choose a skill whose display name matches a command                                        | The selected completion inserts qualified skill syntax; ordinary command selection retains native behavior.      |
| Update providers, cancel completion, or type while suggestions are pending                 | Native provider behavior remains effective and stale results do not overwrite the draft.                         |
| Change native skill availability or encounter name collisions                              | Completion and resolution follow the effective native catalog and precedence.                                    |
| Use an unknown skill or make a known skill unreadable                                      | The reference text survives; read failures are surfaced; no successful expansion is fabricated.                  |
| Submit with images, other input transforms, or steer/follow-up delivery                    | Skill expansion preserves their content and native delivery behavior.                                            |
| Attach text containing canonical references, then restore it into prose or code            | The attachment stays opaque to expansion; restored text follows the applicable prose or code rule.               |
| Remap native picker navigation, confirmation, or cancellation                              | The effective bindings control the picker; accepting a skill makes one intended completion edit.                 |
| Bind native undo to a picker navigation or confirmation key with in-editor completion open | Undo retains native priority; no reference is accepted and no draft is submitted.                                |
| Use an accepted extension shortcut or navigate an extension-owned picker                   | Native routing handles the key once and the background draft is unchanged until an insertion is chosen.          |
| Insert canonical text over selected prose through a custom picker's public paste route     | One composer undo restores the prose, selection, and prior reference text; redo restores the insertion.          |
| Cancel an extension-owned picker while a draft range is selected and image previews redraw | Text, selection, and membership remain intact; focus returns through the native UI contract.                     |

- Run real Ghostty/macOS checks for inline picker use, effective keyboard acceptance/cancellation, custom picker text insertion, and plain-text clipboard round trips. Verify request counts so picker acceptance is distinguishable from submission. Record terminal interception separately from input that reached a focused native component.
- Prove leading/inline deduplication against the real host expansion order. A standalone input-handler assertion does not establish that Pi will not expand the same skill again.

### Reference-only presentation acceptance

1. Submit leading, inline, repeated, aliased, multiple, and skill-only invocations through native input. Assert one normal reference-bearing user message, no instruction-body text or purple skill row, no leftover row spacing, and preservation of available request formatting. Include existing skill-block-shaped code examples and unrecognized content that must stay visible.
2. Capture provider requests and retained user-message entries. Assert that instruction text, native resource context, ordinary request content, and attached image payloads remain unchanged by rendering, resizing, disclosure actions, selection, Find, and reload. The number of instruction blocks alone is insufficient evidence of source fidelity.
3. Exercise ordinary submission, steering, and follow-up delivery while a controlled provider is active. Preserve native queue order, existing input transformations, images, read-failure reporting, and draft/history behavior; do not test only an already-expanded string passed directly to a renderer.
4. Restore sessions containing native single-skill expansion and package multi-skill expansion, including skill-only requests and records without the original command. Verify canonical reconstruction without changing source entries. Rename, edit, or remove the original skill afterward and confirm that historical presentation and instruction inspection still use retained data.
5. Find a unique phrase inside hidden instructions, navigate between matches in the same skill, another skill in the same message, and identical invocations in different messages. Assert occurrence-specific reveal, visible targeting, no purple row, and restoration when moving to ordinary request text, changing the query so the match disappears, or closing Find. Include active-branch and available pre-compaction source cases; Find must not execute tools or create provider requests.
6. Run the same user-facing behavior with standalone `pi-skill-references`, with `pi-chat`, with `pi-composer`, and with both optional extensions. Exercise supported load orders, native terminal rendering modes, and the existing selection/quote surface where installed. Preserve unrelated extension renderers, native Markdown transformations, themes, output padding, and narrow/wide resize behavior.
7. Exercise reload, session replacement, branch navigation, disabling the extension, and missing required host capabilities. Assert cleared transient reveals, no duplicate hooks or presentation rows, safe restoration of native rendering, preservation of a later hook owner, and intact invocation when compact presentation cannot attach. Include history reconstruction that occurs before session-start notification.
8. Exercise the existing HTML export and headless/machine-output routes to establish that terminal projection does not alter them. Preserve original retained entries rather than validating a newly rewritten session as the baseline.

Use the existing Node test runner and scoped formatting, lint, and type checks for the eventual implementation. Run a real Ghostty/macOS check for normal compact messages, multi-skill history, Find reveal/restoration, selection, and reload. Record the exact host versions, commands, results, and any unavailable physical acceptance separately; approving this specification or passing existing expansion tests does not prove adapter compatibility.

## Out of Scope

The active editor owns draft selection, history, and in-editor picker presentation. Pi owns discovery, command dispatch, and native UI routing; attachment contents follow the attachment specification.

This revision does not change eager skill loading, instruction content, prompt or model semantics, resource discovery, or existing invocation syntax. It does not promise token savings, introduce on-demand skill reads, move expansion into model-only context, migrate session data, or change HTML exports and machine-readable outputs.

No Pi source or installed-package edits, fork, mandatory `pi-chat` dependency, skill-specific rules in `pi-chat`, second transcript/search system, shared runtime framework, persistent reveal state, new setting, command, badge, purple card, or permanent skill expansion control is included. Reconstructing exact input that was not retained and recovering instruction content that is no longer available are also out of scope.

## Further Notes

**Reference-only presentation revision:** The user confirmed the behavior, independent package ownership, reversible runtime-adapter exception, temporary retained-source Find reveal, terminal-only scope, and existing real-host testing seam. This specification is the implementation contract, published as `ready-for-agent` in the [local presentation issue](../../.scratch/pi-skill-references/issues/01-reference-only-chat-presentation.md). The local tracker uses `ready-for-agent`, then `claimed` and `resolved`; no remote issue or additional triage is required.

The initial publication changed documentation only. Partial runtime-adapter and source-Find work was subsequently retained on `main` after the user requested rebase and cleanup of the interrupted implementation. The local issue records that integration and the installed-launcher incident; complete acceptance, independent review, and physical-terminal verification remain open. Existing resolved composition tickets remain resolved and do not provide acceptance evidence for this revision. Update user-facing package documentation with the implemented behavior and verified limits when the feature ships.

The [package README](../../packages/pi-skill-references/README.md) documents completion and invocation. Work and acceptance evidence are tracked in the [composition tickets](../../.scratch/prompt-composition/issues/), [picker-selection ticket](../../.scratch/composer-keyboard/issues/07-preserve-selection-through-native-ui.md), and [skill completion audit fixes](../../.scratch/composition-audit/issues/03-preserve-provider-edits-and-prose-boundaries.md).

See the [glossary](../../GLOSSARY.md), [composer specification](pi-composer.md), [attachment specification](pi-attachments.md), and [chat specification](pi-chat.md). The independent [copy integration decision](../adr/0029-copy-as-an-independent-extension.md) is prior art for package ownership and an optional transcript agreement, not evidence that a skill adapter is already supported.

Native evidence and testing prior art: [provider composition](https://github.com/earendil-works/pi/blob/6fb2e7815/packages/coding-agent/src/modes/interactive/interactive-mode.ts), [native input and leading skill expansion](https://github.com/earendil-works/pi/blob/6fb2e7815/packages/coding-agent/src/core/agent-session.ts), [skill slash-completion tests](https://github.com/earendil-works/pi/blob/6fb2e7815/packages/tui/test/autocomplete-skill-slash.test.ts), [skill-loading tests](https://github.com/earendil-works/pi/blob/6fb2e7815/packages/coding-agent/test/skills.test.ts), and [input transformation tests](https://github.com/earendil-works/pi/blob/6fb2e7815/packages/coding-agent/test/extensions-input-event.test.ts).

### Architecture decisions

- [Preserve Pi extension contracts](../adr/0001-preserve-pi-extension-contracts.md)
- [Independent composition extensions](../adr/0003-independent-composition-extensions.md)
- [Skill invocation is portable text](../adr/0008-pi-skill-references-portable-invocation.md)
- [Resolve native editing actions before composer shortcuts](../adr/0009-pi-composer-native-editing-actions.md)
- [Make terminal keybinding setup explicit and reversible](../adr/0010-explicit-terminal-keybinding-setup.md)
- [Skill references own compact invocation presentation](../adr/0031-skill-references-own-compact-presentation.md)
