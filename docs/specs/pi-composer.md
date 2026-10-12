# Composer specification

**Triage:** `ready-for-agent`

## Problem Statement

Preparing a prompt with Markdown, references, and attachments requires reliable selection, correction, and recovery. Users need familiar editing in Pi's terminal interface, and they need other extensions' commands, pickers, and text operations to keep working with that editor. Replacing the editor must preserve configured native operations, including word and line deletion, without losing selections during redraws or treating a terminal-intercepted shortcut as an editor failure.

## Solution

`pi-composer` provides an editable, formatted Markdown draft with a source view, shared undo/redo, ordinary text references, and persistent session drafts. It executes Pi's effective editing actions against that draft and supplies documented convenience shortcuts where input reaches the editor. Other composition packages supply paste policy, attachment handling, and inline skill behavior. The initial target is Ghostty on local macOS in Pi's fullscreen mode; physical shortcut delivery requires separate acceptance evidence.

## User Stories

1. As a Pi user, I want to edit a multiline draft in the terminal, so that I can prepare a complete request before submitting it.
2. As a Pi user, I want to move through characters, words, lines, and the document, so that I can reach the text I need to change.
3. As a Pi user, I want keyboard selection, so that I can replace, copy, or remove a precise range.
4. As a Pi user, I want mouse selection inside the composer, so that I can edit visible text directly.
5. As a Pi user, I want Cmd+A to select the draft, so that I can operate on all its text.
6. As a Pi user, I want typing to replace the current selection, so that correcting text is predictable.
7. As a Pi user, I want Cmd+C to copy selected Markdown text, so that I can use it in another application.
8. As a Pi user, I want Cmd+X to cut selected text, so that I can move it without losing its contents.
9. As a Pi user, I want Cmd+V to paste at the caret or replace the selection, so that clipboard insertion follows the same editing rules as typing.
10. As a Pi user, I want Cmd+Z to undo a coherent editing action, so that I can recover from a mistake.
11. As a Pi user, I want Cmd+Shift+Z to redo an undone action, so that I can restore a change I still want.
12. As a Pi user, I want completion, cut, paste, and external-editor changes to share the draft's history, so that undo works across editing methods.
13. As a Pi user, I want a text replacement and its attachment membership change to undo together, so that one action has one recoverable result.
14. As a Pi user, I want Markdown formatting to appear inside the editable draft, so that I can read its structure while composing.
15. As a Pi user, I want paragraphs, headings, emphasis, strikethrough, and links to display their formatting, so that prose remains easy to scan.
16. As a Pi user, I want quotes, lists, task lists, and horizontal rules to display their structure, so that I can organize a request.
17. As a Pi user, I want inline and fenced code to retain their contents and readable presentation, so that examples remain accurate.
18. As a Pi user, I want a source-view toggle, so that I can inspect and edit Markdown syntax directly.
19. As a Pi user, I want switching views to preserve selection and history, so that changing presentation does not interrupt editing.
20. As a Pi user, I want Markdown constructs without live formatting to remain editable as source, so that their contents survive editing.
21. As a Pi user, I want caret movement and wrapping to respect Unicode characters and terminal widths, so that text is neither split nor selected incorrectly.
22. As a Pi user, I want Enter to submit ordinary prose, so that sending a request stays quick.
23. As a Pi user, I want Enter inside a list or code block to continue that structure, so that writing structured content does not submit it accidentally.
24. As a Pi user, I want Shift+Enter to insert a newline and Cmd+Enter to submit explicitly, so that both actions are available in every editing context.
25. As a Pi user, I want an open completion picker to accept my selection first, so that Enter does not unexpectedly send the draft.
26. As a Pi user, I want native file and directory completion, so that existing path discovery, quoting, and navigation remain familiar.
27. As a Pi user, I want file and skill references to remain ordinary editable text, so that I can select, change, and copy them normally.
28. As a Pi user, I want my installed completion providers and custom pickers to remain effective, so that changing the editor preserves my workflow.
29. As a Pi user, I want native commands, application shortcuts, and follow-up submission to keep their behavior, so that the composer fits into Pi.
30. As a Pi user, I want one autosaved draft per session, so that switching sessions does not mix unfinished requests.
31. As a Pi user, I want drafts and readable attachment references restored after restarting Pi, so that I can resume unfinished work.
32. As a Pi user, I want undo histories isolated between sessions, so that undo cannot change another session's draft.
33. As a Pi user, I want delayed clipboard or attachment operations to stay with the draft that requested them, so that they cannot overwrite another request.
34. As a Pi user, I want recoverable draft content when submission or persistence fails, so that a failed operation does not lose my work.
35. As an extension author, I want Pi's public text and editor interfaces to operate on the same draft, so that my extension can work without a composer-specific integration.
36. As a Pi user, I want existing widgets, overlays, and surrounding terminal controls to coexist with the composer, so that editing preserves the rest of Pi's interface.
37. As a Pi user, I want configured backward and forward word deletion, so that I can correct text using my native Pi bindings.
38. As a Pi user, I want deletion toward either line boundary and newline joining at that boundary, so that line editing keeps its native behavior.
39. As a Pi user, I want deletion to remove an existing selection first, so that a word or line shortcut cannot remove additional unselected text.
40. As a Pi user, I want native yank and yank-pop to recover word and line deletions, so that replacing the editor preserves retained-text recovery.
41. As a Pi user, I want formatted deletions to retain the Markdown needed for recovery, so that hidden delimiters do not cause lost or duplicated content.
42. As a Pi user, I want Cmd+Up/Down and Cmd+Left/Right to reach the current logical line's boundaries when their aliases apply, so that line navigation is consistent in either view.
43. As a Pi user, I want an extra Up on the first visual row or Down on the last visual row to reach that line's boundary, so that the caret does not remain stranded in the middle of the row.
44. As a Pi user, I want shifted movement to keep its original selection anchor and stay in the draft at its boundaries, so that extending a selection cannot browse prompt history.
45. As a Pi user, I want native prompt history, character jumps, and editor paging to remain available through their effective bindings, so that the replacement preserves established navigation.
46. As a Pi user, I want a selection to survive redraw, resize, view changes, and image-preview refresh, so that my next edit still applies to the selected text.
47. As a Pi user, I want changing or clearing a native action's bindings to suppress the composer's extra aliases for that action, so that my configuration controls it completely.
48. As a Pi user, I want native actions and accepted extension shortcuts to win collisions with composer shortcuts, so that each key performs only its intended operation.
49. As a Pi user, I want native undo to keep its priority while completion is open, so that remapping it to a picker key still recovers my edit.
50. As a Pi user, I want Option+Up/Down and host-owned viewport keys to retain Pi's behavior, so that editing does not take over application navigation.
51. As a Pi user, I want fixed composer shortcuts and terminal delivery limits documented, so that I know which behavior Pi can configure and which keys actually reach it.

## Implementation Decisions

- Markdown text is the authoritative document. Formatted and source views share that document, selection, and undo history. Equivalent Markdown normalization is allowed while preserving meaning, code contents, references, attachment membership, and unformatted source constructs.
- The composer owns caret movement, selection, text transactions, draft attachment membership, and session draft persistence. Paste policy belongs to `pi-paste`; stored attachment contents and their lifetime belong to `pi-attachments`; inline skill completion and expansion belong to `pi-skill-references`.
- A user operation that changes text and attachment membership commits as one undoable action. Undo and redo restore both parts. Moving a caret or switching views does not create an independent content edit; a fresh edit after undo follows ordinary redo-branch semantics.
- Keyboard and mouse selection target the same source ranges. Typing, insertion, and paste replace the selection and preserve tab characters. Movement and rendering respect grapheme boundaries, wrapped lines, and terminal cell widths. Redraw, resize, scrolling, view changes, and attachment-preview updates preserve the range and anchor; they do not create an edit or clear selection.
- Copy and cut export plain Markdown text through Pi's clipboard support. Cutting must preserve the selected content if copying fails. Pasting copied references preserves their text; canonical skill syntax retains its invocation meaning.
- Resolve native editing actions through the keybinding manager supplied to the editor factory. Execute them against the authoritative draft and history; the inherited editor's private document cannot perform these edits. Use public user-binding information to detect explicit overrides. Pi owns decoding, protocol negotiation, configuration, and application dispatch; the composer adds no parallel manager or configuration reader.
- Native submit and newline actions use their effective bindings. With defaults, Enter submits ordinary prose and continues lists or code where the caret is editing that structure; Shift+Enter inserts a newline. The Cmd+Enter alias submits explicitly from prose, lists, and code when available. In-editor completion acceptance handles its keys before contextual submission; native undo retains its earlier priority. Preserve native command, steer, and follow-up dispatch.
- Live formatting covers paragraphs, headings, bold, italic, strikethrough, links, quotes, lists, task lists, inline code, fenced code, and horizontal rules. Source-to-cell mapping must let users edit the underlying text without losing syntax or code contents.
- Reuse Pi's exported Markdown parser, themes, highlighting, rendering utilities, Unicode utilities, and scrolling facilities. Adopt an external state/history dependency only after its public APIs satisfy the shared text-state and runtime requirements.
- Implement the public `EditorComponent` contract, preserving host callbacks, autocomplete updates, and application actions. `getEditorText`, `setEditorText`, `pasteToEditor`, insertion, and external-editor actions must reach the same state owner. Native text replacement is distinct from paste classification.
- Consume the effective `AutocompleteProvider` supplied by Pi, including later updates. Preserve cancellation, suggestion results, completion edits, cursor positions, and native `SelectList` behavior. Extension-owned pickers continue to insert text through native interfaces. Provider composition does not imply a public hook for replacing every in-editor picker renderer.
- Native `@` file and directory completion retains effective filtering, quoting, and directory navigation. References stay character-editable. File references identify current source files; attachment references identify preserved contents.
- Autosave each session's draft text and attachment references with native session identity and persistence facilities. Restore those drafts across switches and restarts. Keep undo/redo in memory and isolated by session; a restarted process begins with a fresh history.
- Retain the association between an asynchronous operation and its requesting draft. Later results must preserve unrelated edits and remain recoverable when the original insertion can no longer be applied safely.
- Use Pi's host submission path, input transformations, commands, and steer/follow-up behavior. Draft clearing and recovery must follow actual host lifecycle outcomes. The text-only submission callback and void-returning send API do not constitute acknowledgement.
- Use Pi's fullscreen layout, mouse routing, terminal decoding, and extension UI facilities. Respect Pi's single active editor and existing override behavior. Document physical delivery separately from editor actions. These editing changes leave terminal settings unchanged; a terminal-consumed key cannot be recovered by the composer or shell.

### Native editing behavior

A line is a logical line separated by a newline. A visual row is a displayed row after wrapping. Line actions target logical boundaries; vertical movement follows visual rows and preserves the preferred display column where possible. Formatted view maps these positions to the Markdown source without making hidden delimiters stray caret stops.

| Native action                                                                 | Required behavior                                                                                                                                                                                                                                                                                      |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `tui.editor.deleteCharBackward` / `deleteCharForward`                         | Remove the selection or one whole grapheme in the requested direction. Preserve native newline joining.                                                                                                                                                                                                |
| `tui.editor.deleteWordBackward` / `deleteWordForward`                         | Remove the selection or the native word range, retaining the removed Markdown for yank. At the corresponding logical boundary, remove the newline and join adjacent lines.                                                                                                                             |
| `tui.editor.deleteToLineStart` / `deleteToLineEnd`                            | Remove the selection or text toward the logical line boundary. At that boundary, remove the adjacent newline when present. Retain removed Markdown for yank.                                                                                                                                           |
| `tui.editor.yank` / `yankPop`                                                 | Insert the latest retained deletion at the caret or over the selection. Yank-pop rotates retained entries by replacing the preceding yank or yank-pop; it is inactive after unrelated editing or movement.                                                                                             |
| `tui.editor.cursorLeft` / `cursorRight`, `cursorWordLeft` / `cursorWordRight` | Move by grapheme or native word boundaries in the shared draft. Use the shared source selection and keep its original anchor for Shift movement.                                                                                                                                                       |
| `tui.editor.cursorLineStart` / `cursorLineEnd`                                | Reach the current logical line's beginning or end in either view.                                                                                                                                                                                                                                      |
| `tui.editor.cursorUp` / `cursorDown`                                          | Move through visual rows. In an ordinary draft, an extra Up on the first row reaches its beginning; an extra Down on the last row reaches its end.                                                                                                                                                     |
| `tui.editor.historyPrevious` / `historyNext`                                  | Browse native prompt history through the shared draft. Preserve explicit history bindings, empty-editor behavior, and active history browsing. Unmodified Up can enter history once the caret is already at the draft's beginning; Shift movement never does.                                          |
| `tui.editor.jumpForward` / `jumpBackward`                                     | Await a printable target and move to its next/previous occurrence, searching across logical lines; no match leaves the caret unchanged. A repeated jump key cancels, and other control input cancels then follows native dispatch. Keep grapheme boundaries and map visible targets in formatted view. |
| `tui.editor.pageUp` / `pageDown`                                              | When delivered to the editor, move by its visible page and keep the preferred column where possible. Pi's fullscreen viewport retains keys it handles before the editor.                                                                                                                               |
| `tui.editor.undo`                                                             | Restore the prior coherent draft edit and selection, including attachment membership, before in-editor autocomplete handling.                                                                                                                                                                          |

All deletion actions consume a nonempty selection before computing an unselected range. A deletion at an outer boundary with no text to remove is a no-op. Consecutive native word/line deletions accumulate retained text in source order: backward deletions prepend and forward deletions append. An intervening edit or movement ends accumulation. Yank and yank-pop use the composer's same document and undo history.

In formatted view, retained text includes the removed Markdown and any enclosing delimiters removed with it. Delimiters still needed by surviving text stay in the draft and are not duplicated in retained text. A partial formatted span therefore contributes its removed text without inventing new wrappers. Yank inserts that plain Markdown into its destination context; undo restores the exact prior text, selection, and membership. Source view deletes and retains the literal selected source. The examples in Testing Decisions define whole-span, partial-span, and cross-span results.

### Binding and dispatch

Preserve the native input path in this order:

1. Terminal-input listeners, fullscreen viewport handling, overlays, and focused components keep the input the host routes to them.
2. Extension shortcuts accepted by Pi retain its conflict rules. Native clipboard, context-sensitive interrupt/exit, explicit history bindings, and other application actions keep their native precedence.
3. At the editor, native undo precedes in-editor autocomplete. Picker navigation, acceptance, and cancellation retain their native priority over ordinary editor fallbacks.
4. Effective native editing bindings resolve before composer convenience or fixed shortcuts. A native deletion action assigned to Cmd+A deletes once; it does not also select all.
5. A composer alias for a native action is available only when that action has no explicit binding override. Changing its binding or setting an empty list suppresses all its aliases, including Shift variants. An explicit binding that repeats a default still counts as an override.

For Shift selection, resolve any effective action on the full chord first. Otherwise extend using the effective movement binding or an available movement alias, keeping the original anchor. Do not derive selection keys from suppressed aliases. Option+Up/Down retain Pi's effective application behavior, including its default dequeue action on Option+Up.

| Composer key                           | Action/configuration contract                                                                                                                                     |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cmd+Left or Cmd+Up; Shift variants     | Aliases for `tui.editor.cursorLineStart`; target the current logical line.                                                                                        |
| Cmd+Right or Cmd+Down; Shift variants  | Aliases for `tui.editor.cursorLineEnd`; target the current logical line.                                                                                          |
| Cmd+C                                  | Alias for `tui.input.copy` when native dispatch delivers it to the editor; preserve parent interrupt/clear behavior.                                              |
| Cmd+V                                  | Alias for the effective `app.clipboard.pasteImage` route; preserve its supplied handler and paste policy.                                                         |
| Cmd+Z                                  | Alias for `tui.editor.undo`.                                                                                                                                      |
| Cmd+Enter                              | Alias for `tui.input.submit`, requesting explicit submission after higher-priority handlers.                                                                      |
| Cmd+A, Cmd+X, Cmd+Shift+Z, Cmd+Shift+M | Fixed select-all, cut, redo, and source-view actions. These have no configurable native action IDs and yield to effective native and accepted extension bindings. |

Existing native movement, deletion, history, recovery, newline, and submit actions remain configurable through Pi. A terminal translation such as Cmd+Delete producing Ctrl+U follows whichever native action currently owns Ctrl+U. Suppressing a raw Cmd+V alias does not disable terminal-generated bracketed paste. Each input performs at most one operation.

Fixed shortcuts are package behavior. Pi's current public manager cannot register new configurable action IDs; literal extension shortcut registration does not change that. Native `/hotkeys` describes host actions and registered extension shortcuts, while this specification documents the direct composer aliases. Neither Pi nor the composer automatically imports macOS text-field settings.

## Testing Decisions

- Test external behavior at the public Pi editor/session boundary. Load the package through Pi, drive host editing and session actions, and assert visible content, exported Markdown, submission content, and retained draft state. Private state layout and helper call counts are not acceptance criteria.
- Use the shared host boundary for the composer alone and in combination with paste, attachments, and skill references. Exercise native and custom completion providers registered before and after composer installation.
- Use the workspace's existing Node test runner for new automated checks. Pi's editor and virtual-terminal suites provide prior art for input, wrapping, and visible output; its extension input-event suite provides prior art for chained transformations. Those upstream helpers are reference material, not public runtime dependencies.
- Cover the following observable scenarios:

| Scenario                                                                                     | Required result                                                                                                                                    |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Select text using the keyboard or mouse, then type, cut, paste, or complete                  | The intended source range changes; surrounding text survives; one appropriate undo restores the edit.                                              |
| Undo, switch views, redo, then make a new edit                                               | Both views show the same document; selection remains coherent; redo cannot restore an abandoned branch.                                            |
| Replace selected text with an attachment, then undo and redo                                 | Text and attachment membership change together; preserved contents remain readable.                                                                |
| Edit formatted prose, nested lists, and code; toggle source view                             | Supported formatting remains editable; code contents and other source constructs survive.                                                          |
| Move and select across combining characters, emoji, wide characters, and wrapped lines       | Caret and selection correspond to whole graphemes and the correct terminal cells.                                                                  |
| Press each Enter variant in prose, lists, code, and an active picker                         | The documented submit, continuation, newline, or picker action occurs exactly once.                                                                |
| Use native text replacement, extension paste, and the external editor                        | All changes reach the same document and history; long replacements remain inline text.                                                             |
| Change sessions or edit the draft while an asynchronous operation is pending                 | The result stays with its requesting draft and does not overwrite unrelated work.                                                                  |
| Restart with saved drafts and attachment references                                          | Each session restores its own content; referenced attachment contents remain readable.                                                             |
| Submit normally, steer, follow up, or encounter a failure after a host clear                 | Native delivery behavior is preserved and recoverable draft/attachment content is retained.                                                        |
| Use default and remapped word/line deletion with and without a selection                     | The intended range is removed once; newline joins and empty boundaries follow the native action.                                                   |
| Delete punctuation, whitespace, code, emoji, combining characters, and formatted spans       | Unselected content and whole graphemes survive; undo restores source and selection.                                                                |
| Accumulate backward/forward deletions, yank, then yank-pop                                   | Retained text has native ordering; yank-pop replaces only the last yank, and each edit is recoverable in the same history.                         |
| Move across short, long, and wrapped rows; use line actions and extra Up/Down at outer rows  | Logical line boundaries and visual-row movement stay distinct; reaching the first boundary precedes ordinary Up history browsing.                  |
| Extend selection to draft boundaries, then redraw, resize, switch views, or refresh previews | The anchor and source range persist; Shift movement cannot replace the draft from history.                                                         |
| Use native character jumps, explicit prompt-history bindings, and delivered editor paging    | Each retains its native purpose; viewport and application actions remain host-owned.                                                               |
| Remap or clear undo, line movement, copy, clipboard paste, or submit                         | Effective native bindings work; corresponding extra Cmd aliases and their Shift variants are suppressed. Unrelated fixed actions remain available. |
| Assign a native editing action or accepted extension shortcut to a composer key              | The configured owner acts once; the composer fallback makes no second edit.                                                                        |
| Assign native undo to a picker navigation or confirmation key, then open completion          | Undo runs before in-editor picker handling; no completion or submission also occurs.                                                               |
| Use focused native overlays, application shortcuts, and Option+Up/Down                       | Input stays with its host owner and does not cause a composer fallback edit.                                                                       |

Exercise the following formatted selections with a native word/line deletion action. The retained column is the Markdown inserted by yank into an unformatted destination in the same editor; no intervening deletion replaces the retained entry. Spaces shown inside inline-code values are significant.

| Draft source before deletion | Selected visible text | Draft source after deletion | Retained Markdown  |
| ---------------------------- | --------------------- | --------------------------- | ------------------ |
| `red **blue** green`         | `blue`                | `red  green`                | `**blue**`         |
| `**alpha**`                  | `ha`                  | `**alp**`                   | `ha`               |
| `**blue** and _green_`       | `blue and gre`        | `_en_`                      | `**blue** and gre` |

For each case, undo immediately after deletion restores the original source and selection. Undo after a yank restores the destination before insertion. Yanking `ha` back before the surviving closing delimiter restores `**alpha**`; yanking it into unformatted prose inserts plain `ha`. For native accumulation, start with `one two three` at its end and delete backward by word twice without intervening input: the draft becomes `one `, retained text is `two three`, and yank restores the original. Verify forward accumulation too, along with source-view deletion retaining literal syntax.

- Run real Ghostty/macOS checks for Command shortcuts, clipboard copy/cut/paste, mouse selection, fullscreen layout, and image-preview coexistence, starting with the user's effective terminal settings unchanged. Record the host and terminal versions, gesture, observed route, configuration, and result. Check Cmd+C with and without terminal selection and Cmd+Z/Cmd+Shift+Z with and without an available terminal undo action. Synthetic events prove delivered-input behavior only; record blocked or unobserved physical delivery separately.
- Verify Cmd+Delete and Cmd+Left/Right translations, Option+Delete and Option+Left/Right, Cmd+Up/Down, shifted movement, and boundary arrows. A terminal-consumed key is a delivery limitation; an incorrect edit after delivery is an editor failure. Keep terminal behavior intact across pane switches, external-editor use, suspension/resumption, resource reload, terminal reload, and exit.
- Demonstrate the native attachment handoff and submission-recovery scenarios before declaring those capabilities complete. Record any failing host contract precisely rather than adding an unapproved runtime interface.

## Out of Scope

Paste classification, attachment storage and previews, and skill expansion belong to their companion specifications. Pi owns terminal input and application-level dispatch.

## Further Notes

This local Markdown specification is ready for implementation of the revised keyboard contract. Existing implementation tickets and prior automated results do not establish the new acceptance scenarios. Runtime fixes and real terminal acceptance remain pending; the [keyboard implementation plan](../composer-keyboard-spec-plan.md) and [terminal procedure](../terminal-checks.md) track that work.

See the [shared architecture and testing boundary](../architecture.md), [glossary](../../GLOSSARY.md), and [library integration notes](../pi-composer-library-integration.md). Related behavior is specified by [pi-paste](pi-paste.md), [pi-attachments](pi-attachments.md), and [pi-skill-references](pi-skill-references.md).

Native evidence and testing prior art: [editor contract](https://github.com/earendil-works/pi/blob/6fb2e7815/packages/tui/src/editor-component.ts), [extension UI contracts](https://github.com/earendil-works/pi/blob/6fb2e7815/packages/coding-agent/src/core/extensions/types.ts), [editor behavior tests](https://github.com/earendil-works/pi/blob/6fb2e7815/packages/tui/test/editor.test.ts), and [interactive terminal tests](https://github.com/earendil-works/pi/blob/6fb2e7815/packages/coding-agent/test/interactive-tui.test.ts).

### Architecture decisions

- [Preserve Pi extension contracts](../adr/0001-preserve-pi-extension-contracts.md)
- [One editor owns draft transactions](../adr/0002-one-editor-owns-draft-transactions.md)
- [Independent composition extensions](../adr/0003-independent-composition-extensions.md)
- [Live Markdown editing](../adr/0004-pi-composer-live-markdown-editing.md)
- [One Markdown text state](../adr/0005-pi-composer-one-markdown-text-state.md)
- [Resolve native editing actions before composer shortcuts](../adr/0009-pi-composer-native-editing-actions.md)
- [Scope terminal integration to Pi's terminal ownership](../adr/0010-scope-terminal-integration-to-pi.md)
