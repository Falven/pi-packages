# Composer library integration

Pi's current public services and extension contracts are the baseline. An external dependency must supply substantial missing editing behavior while preserving those contracts. The [composer specification](specs/pi-composer.md) defines the required behavior.

## Native reuse

| Need                 | Existing implementation                                                                                          | Composer responsibility                                                        |
| -------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Completion           | Supplied `AutocompleteProvider` and native `SelectList`                                                          | Apply completion edits through the shared state and preserve provider updates. |
| Markdown recognition | Public `Marked`, `Token`, and `Tokens` exports                                                                   | Editable formatting and source-to-cell position mapping.                       |
| Rendering and input  | Pi themes, highlighting, width/slicing/wrapping, scrolling, mouse routing, key decoding, and keybinding managers | Editable selection, formatted movement, and Command-key handling.              |
| Unicode segmentation | Public Pi utilities and standard `Intl.Segmenter`                                                                | Map grapheme boundaries to source offsets and terminal cell widths.            |
| Copy and cut         | Pi's `copyToClipboard` helper                                                                                    | Export selected text and apply cutting through the editor history.             |
| Draft lifecycle      | Session APIs, events, and state-directory helpers                                                                | Persist and restore the session draft and its attachment references.           |

Consume the effective services supplied by Pi, including registered overrides. Paste policy, attachment storage and previews, and inline skill expansion follow the [shared package ownership](architecture.md).

Sources: [Pi TUI exports](https://github.com/earendil-works/pi/blob/6fb2e7815/packages/tui/src/index.ts), [coding-agent exports](https://github.com/earendil-works/pi/blob/6fb2e7815/packages/coding-agent/src/index.ts#L478), and [autocomplete composition](https://github.com/earendil-works/pi/blob/6fb2e7815/packages/coding-agent/src/modes/interactive/interactive-mode.ts#L825).

## State and history evaluation

The editor needs persistent Markdown text, selections, mapped changes, transactions, and grouped undo/redo. Formatted and source views must share that state. Draft attachment membership changes must participate in the same undo event as related text edits; attachment contents remain owned by attachment handling.

`@codemirror/state` and the state-oriented history APIs from `@codemirror/commands` are the candidate for runtime validation. No editor-state dependency has been selected or installed.

CodeMirror's `undo` and `redo` are state commands accepting state and dispatch. Its `invertedEffects` API can associate inverse attachment-membership changes with a text edit. This needs verification against the combined history requirements.

The standard `history()` extension also includes an `EditorView` event handler. Verify that the public state/history APIs run inside Pi without constructing a DOM view. Pi remains responsible for terminal input and rendering.

Sources: [CodeMirror system guide](https://codemirror.net/docs/guide/) and [history implementation](https://github.com/codemirror/commands/blob/main/src/history.ts).

## Markdown integration

Use Pi's exported Marked parser with its public terminal styling and layout utilities. The existing Markdown renderer produces display lines; editable formatting additionally needs source-to-cell mapping and structural editing commands.

Equivalent Markdown normalization is allowed while preserving meaning, code contents, references, attachments, and syntax outside the formatting subset. View changes must retain the same draft and history.

Source: [Pi Markdown renderer](https://github.com/earendil-works/pi/blob/6fb2e7815/packages/tui/src/components/markdown.ts#L301).

## Validation requirements

- Native text APIs, completion edits, paste results, and external-editor actions update one state and history.
- Formatted/source changes preserve selection and undo groups.
- Text replacement and attachment membership undo and redo together.
- Terminal edits respect graphemes, wrapping, and mouse selection.
- State/history APIs operate within Pi's runtime through their public interfaces.
- Native provider overrides remain effective before and after composer installation.

These findings come from local Pi source at `6fb2e7815` and upstream source inspection. Dependency integration and terminal behavior remain unverified.
