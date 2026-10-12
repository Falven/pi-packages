# Composer library integration

The composer uses Pi's public editor, parser, rendering, and lifecycle services. Its text state and source-to-cell mapping keep those services working with formatted editing and one undo history. The [composer specification](specs/pi-composer.md) defines the behavior.

## Native services

| Need                 | Existing implementation                                                                           | Composer responsibility                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Completion           | Effective `AutocompleteProvider` and native `SelectList`                                          | Apply returned edits and cursor positions, preserve provider updates and cancellation.                   |
| Markdown recognition | Pi's exported `Marked`, `Token`, and `Tokens`                                                     | Map parsed structures to the editable Markdown source.                                                   |
| Terminal rendering   | Pi themes, code highlighting, width/slicing/wrapping and cursor utilities                         | Render formatted text and selections at source-mapped cell positions.                                    |
| Input                | Native key decoding, the supplied keybinding manager, editor actions and fullscreen mouse routing | Resolve effective actions and apply them to the shared draft, selection, and history.                    |
| Unicode              | Standard `Intl.Segmenter` and Pi cell-width utilities                                             | Preserve grapheme boundaries across movement, wrapping and deletion.                                     |
| Clipboard            | Pi's native clipboard and copy helpers                                                            | Preserve selection until copying succeeds and route pasted content through the active native paste path. |
| Session drafts       | Public session events, custom entries and state-directory helpers                                 | Save recoverable drafts and isolate in-memory histories by session.                                      |

Consume the effective services Pi supplies, including registered overrides. Paste policy, attachment storage and previews, and skill expansion follow the [shared package ownership](architecture.md).

## Editing action ownership

The replacement editor must execute native character, word, and line deletion, retained-text recovery, navigation, and undo against its own draft. Calling the inherited editor's editing methods would mutate a separate document. Reuse native action definitions and public helpers without delegating draft ownership.

The factory-supplied manager resolves effective bindings and exposes explicit user overrides. Changing or clearing an action's bindings suppresses the composer's extra Cmd aliases for that action, including shifted aliases. Native editing bindings and accepted extension shortcuts take priority over composer fallbacks. Native undo precedes in-editor completion; focused overlays and other host-owned routes keep their input.

Select-all, cut, redo, and source-view toggle use documented fixed keys because Pi's current public manager has no registration API for new action IDs. Literal shortcut registration does not create a configurable native action. Pi owns terminal decoding and configuration; the composer neither reads another configuration copy nor imports macOS text-field preferences. See the [binding and dispatch contract](specs/pi-composer.md#binding-and-dispatch).

Terminal text paste carries the supplied text. The effective native clipboard action can read copied-file or image metadata. A raw Cmd+V alias follows the native action's override rules, while terminal-generated bracketed paste remains an independent route. Preserve effective handlers and each route's native dispatch.

## Text and history

One Markdown string is the authoritative draft. Selection offsets and before/after text states belong to the editor. Formatted and source views share that state, so switching views does not serialize a second document or replace the draft.

Typing and deletion group into coherent undo events. Completion, native text replacement, clipboard insertion, retained-text recovery, and attachment reference changes enter the same history. Attachment membership follows ordinary reference text; the attachment package retains the referenced bytes independently of undo. Redraw, resize, view changes, and native image-widget refresh preserve selection and do not create content edits.

Public editor callbacks remain connected to the host when factories are decorated or reinstalled. Session histories contain plain editor data and remain isolated across session switches and resource reloads. A process restart restores saved text with fresh history.

## Markdown projection

Pi's Marked parser identifies Markdown structures. The composer maps visible graphemes, hidden delimiters, styles and terminal cells back to source offsets, allowing formatted selection and replacement to edit the same Markdown text. Pi supplies the theme, code highlighter and terminal utilities.

Equivalent Markdown normalization is allowed while preserving meaning, code contents, references, attachments and unsupported syntax. Source view exposes the Markdown directly. Native parsing and rendering services remain the dependency baseline; the editor adds only the state and mapping needed for editing.

## Verification

Public-host tests load the extensions and drive native editor/session routes. They check source and formatted editing, Unicode selection, grouped history, effective completion providers, clipboard behavior, attachment references and recovery. The revised contract also requires native action remapping and clearing, alias collisions, picker precedence, word/line deletion and yank, and logical-line versus visual-row navigation. Combined scenarios verify that independently loaded packages cooperate through those routes.

Real Ghostty/macOS checks remain necessary for Command-key forwarding, clipboard formats, mouse behavior and image graphics. Record terminal interception, delivered-input editing, and native clipboard metadata as separate results. Synthetic input and captured terminal output establish automated behavior, without proving the physical terminal integration. The revised requirements await implementation and acceptance; the [terminal procedure](terminal-checks.md) defines the physical checks.

Native source references: [TUI exports](https://github.com/earendil-works/pi/blob/6fb2e7815/packages/tui/src/index.ts), [coding-agent exports](https://github.com/earendil-works/pi/blob/6fb2e7815/packages/coding-agent/src/index.ts), [editor contract](https://github.com/earendil-works/pi/blob/6fb2e7815/packages/tui/src/editor-component.ts), and [Markdown renderer](https://github.com/earendil-works/pi/blob/6fb2e7815/packages/tui/src/components/markdown.ts).
