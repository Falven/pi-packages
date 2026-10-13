# Skill references specification

## Problem Statement

Users need to invoke skills while composing ordinary prose and retain native or custom skill pickers. References must survive ordinary text editing and clipboard operations, contribute the intended instructions once, and preserve code examples and unrelated command behavior.

## Solution

`pi-skill-references` extends native completion with `$` and inline `/` skill triggers and inserts ordinary `/skill:name` text. Canonical skill references carry their invocation meaning whether typed, pasted, or inserted by another extension. Submission includes each referenced skill's instructions once. The package works with native Pi and `pi-composer`. The supported environment is Ghostty on local macOS in Pi's fullscreen mode.

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

## Implementation Decisions

- Declare Pi and TUI peers as `^1.0.2`, the supported public API floor.
- The package owns inline skill completion and submission-time expansion. Pi owns effective skill discovery, resource availability, command dispatch, and base provider behavior. The active editor owns picker presentation, insertion, and undo.
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

## Testing Decisions

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

## Out of Scope

The active editor owns draft selection, history, and in-editor picker presentation. Pi owns discovery, command dispatch, and native UI routing; attachment contents follow the attachment specification.

## Further Notes

The [package README](../../packages/pi-skill-references/README.md) documents completion and invocation. Work and acceptance evidence are tracked in the [composition tickets](../../.scratch/prompt-composition/issues/), [picker-selection ticket](../../.scratch/composer-keyboard/issues/07-preserve-selection-through-native-ui.md), and [skill completion audit fixes](../../.scratch/composition-audit/issues/03-preserve-provider-edits-and-prose-boundaries.md).

See the [glossary](../../GLOSSARY.md), [composer specification](pi-composer.md), and [attachment specification](pi-attachments.md).

Native evidence and testing prior art: [provider composition](https://github.com/earendil-works/pi/blob/6fb2e7815/packages/coding-agent/src/modes/interactive/interactive-mode.ts), [native input and leading skill expansion](https://github.com/earendil-works/pi/blob/6fb2e7815/packages/coding-agent/src/core/agent-session.ts), [skill slash-completion tests](https://github.com/earendil-works/pi/blob/6fb2e7815/packages/tui/test/autocomplete-skill-slash.test.ts), [skill-loading tests](https://github.com/earendil-works/pi/blob/6fb2e7815/packages/coding-agent/test/skills.test.ts), and [input transformation tests](https://github.com/earendil-works/pi/blob/6fb2e7815/packages/coding-agent/test/extensions-input-event.test.ts).

### Architecture decisions

- [Preserve Pi extension contracts](../adr/0001-preserve-pi-extension-contracts.md)
- [Independent composition extensions](../adr/0003-independent-composition-extensions.md)
- [Skill invocation is portable text](../adr/0008-pi-skill-references-portable-invocation.md)
- [Resolve native editing actions before composer shortcuts](../adr/0009-pi-composer-native-editing-actions.md)
- [Make terminal keybinding setup explicit and reversible](../adr/0010-explicit-terminal-keybinding-setup.md)
