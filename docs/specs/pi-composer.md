# Composer specification

## Problem Statement

Preparing a prompt with Markdown, references, and attachments requires reliable selection, correction, and recovery. Users need familiar editing in Pi's terminal interface, and they need other extensions' commands, pickers, and text operations to keep working with that editor.

## Solution

`pi-composer` provides an editable, formatted Markdown draft with a source view, shared undo/redo, ordinary text references, and persistent session drafts. It owns draft editing while the other composition packages supply paste policy, attachment handling, and inline skill behavior. The initial supported environment is Ghostty on local macOS in Pi's fullscreen mode.

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

## Implementation Decisions

- Markdown text is the authoritative document. Formatted and source views share that document, selection, and undo history. Equivalent Markdown normalization is allowed while preserving meaning, code contents, references, attachment membership, and unformatted source constructs.
- The composer owns caret movement, selection, text transactions, draft attachment membership, and session draft persistence. Paste policy belongs to `pi-paste`; stored attachment contents and their lifetime belong to `pi-attachments`; inline skill completion and expansion belong to `pi-skill-references`.
- A user operation that changes text and attachment membership commits as one undoable action. Undo and redo restore both parts. Moving a caret or switching views does not create an independent content edit; a fresh edit after undo follows ordinary redo-branch semantics.
- Keyboard and mouse selection target the same source ranges. Typing, insertion, and paste replace the selection and preserve tab characters. Movement and rendering respect grapheme boundaries, wrapped lines, and terminal cell widths.
- Copy and cut export plain Markdown text through Pi's clipboard support. Cutting must preserve the selected content if copying fails. Pasting copied references preserves their text; canonical skill syntax retains its invocation meaning.
- Provide Cmd+A, Cmd+C, Cmd+X, Cmd+V, Cmd+Z, and Cmd+Shift+Z through the supported input and keybinding facilities. Preserve Pi's effective application and extension shortcut priority.
- Enter submits ordinary prose and continues lists or code where the caret is editing that structure. Shift+Enter inserts a newline. Cmd+Enter submits explicitly. Picker acceptance takes precedence when a completion is active. Preserve Pi's follow-up submission action.
- Live formatting covers paragraphs, headings, bold, italic, strikethrough, links, quotes, lists, task lists, inline code, fenced code, and horizontal rules. Source-to-cell mapping must let users edit the underlying text without losing syntax or code contents.
- Reuse Pi's exported Markdown parser, themes, highlighting, rendering utilities, Unicode utilities, and scrolling facilities. Adopt an external state/history dependency only after its public APIs satisfy the shared text-state and runtime requirements.
- Implement the public `EditorComponent` contract, preserving host callbacks, autocomplete updates, and application actions. `getEditorText`, `setEditorText`, `pasteToEditor`, insertion, and external-editor actions must reach the same state owner. Native text replacement is distinct from paste classification.
- Consume the effective `AutocompleteProvider` supplied by Pi, including later updates. Preserve cancellation, suggestion results, completion edits, cursor positions, and native `SelectList` behavior. Custom pickers continue to insert text through native interfaces.
- Native `@` file and directory completion retains effective filtering, quoting, and directory navigation. References stay character-editable. File references identify current source files; attachment references identify preserved contents.
- Autosave each session's draft text and attachment references with native session identity and persistence facilities. Restore those drafts across switches and restarts. Keep undo/redo in memory and isolated by session; a restarted process begins with a fresh history.
- Retain the association between an asynchronous operation and its requesting draft. Later results must preserve unrelated edits and remain recoverable when the original insertion can no longer be applied safely.
- Use Pi's host submission path, input transformations, commands, and steer/follow-up behavior. Draft clearing and recovery must follow actual host lifecycle outcomes. The text-only submission callback and void-returning send API do not constitute acknowledgement.
- Use Pi's fullscreen layout, mouse routing, terminal decoding, and extension UI facilities. Verify the required Command-key forwarding in Ghostty's effective configuration. Respect Pi's single active editor and existing override behavior.

## Testing Decisions

- Test external behavior at the public Pi editor/session boundary. Load the package through Pi, drive host editing and session actions, and assert visible content, exported Markdown, submission content, and retained draft state. Private state layout and helper call counts are not acceptance criteria.
- Use the shared host boundary for the composer alone and in combination with paste, attachments, and skill references. Exercise native and custom completion providers registered before and after composer installation.
- Use the workspace's existing Node test runner for new automated checks. Pi's editor and virtual-terminal suites provide prior art for input, wrapping, and visible output; its extension input-event suite provides prior art for chained transformations. Those upstream helpers are reference material, not public runtime dependencies.
- Cover the following observable scenarios:

| Scenario                                                                               | Required result                                                                                         |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Select text using the keyboard or mouse, then type, cut, paste, or complete            | The intended source range changes; surrounding text survives; one appropriate undo restores the edit.   |
| Undo, switch views, redo, then make a new edit                                         | Both views show the same document; selection remains coherent; redo cannot restore an abandoned branch. |
| Replace selected text with an attachment, then undo and redo                           | Text and attachment membership change together; preserved contents remain readable.                     |
| Edit formatted prose, nested lists, and code; toggle source view                       | Supported formatting remains editable; code contents and other source constructs survive.               |
| Move and select across combining characters, emoji, wide characters, and wrapped lines | Caret and selection correspond to whole graphemes and the correct terminal cells.                       |
| Press each Enter variant in prose, lists, code, and an active picker                   | The documented submit, continuation, newline, or picker action occurs exactly once.                     |
| Use native text replacement, extension paste, and the external editor                  | All changes reach the same document and history; long replacements remain inline text.                  |
| Change sessions or edit the draft while an asynchronous operation is pending           | The result stays with its requesting draft and does not overwrite unrelated work.                       |
| Restart with saved drafts and attachment references                                    | Each session restores its own content; referenced attachment contents remain readable.                  |
| Submit normally, steer, follow up, or encounter a failure after a host clear           | Native delivery behavior is preserved and recoverable draft/attachment content is retained.             |

- Run real Ghostty/macOS checks for Command shortcuts, clipboard copy/cut/paste, mouse selection, fullscreen layout, and image-preview coexistence. Synthetic key events alone do not establish terminal support.
- Demonstrate the native attachment handoff and submission-recovery scenarios before declaring those capabilities complete. Record any failing host contract precisely rather than adding an unapproved runtime interface.

## Further Notes

The package currently contains a loadable scaffold. These requirements define implementation acceptance; feature behavior has not been implemented or verified.

See the [shared architecture and testing boundary](../architecture.md), [glossary](../../GLOSSARY.md), and [library integration notes](../pi-composer-library-integration.md). Related behavior is specified by [pi-paste](pi-paste.md), [pi-attachments](pi-attachments.md), and [pi-skill-references](pi-skill-references.md).

Native evidence and testing prior art: [editor contract](https://github.com/earendil-works/pi/blob/6fb2e7815/packages/tui/src/editor-component.ts), [extension UI contracts](https://github.com/earendil-works/pi/blob/6fb2e7815/packages/coding-agent/src/core/extensions/types.ts), [editor behavior tests](https://github.com/earendil-works/pi/blob/6fb2e7815/packages/tui/test/editor.test.ts), and [interactive terminal tests](https://github.com/earendil-works/pi/blob/6fb2e7815/packages/coding-agent/test/interactive-tui.test.ts).

### Architecture decisions

- [Preserve Pi extension contracts](../adr/0001-preserve-pi-extension-contracts.md)
- [One editor owns draft transactions](../adr/0002-one-editor-owns-draft-transactions.md)
- [Independent composition extensions](../adr/0003-independent-composition-extensions.md)
- [Live Markdown editing](../adr/0004-pi-composer-live-markdown-editing.md)
- [One Markdown text state](../adr/0005-pi-composer-one-markdown-text-state.md)
