# Composition extensions

The workspace separates prompt editing, paste policy, attachment handling, and skill references into four independently loadable Pi packages. Each package has a public extension entry point and a specification defining its behavior.

The initial supported environment is Ghostty on local macOS, using Pi's fullscreen mode. Paste, attachment, and skill-reference functionality must remain useful with Pi's native editor as well as `pi-composer`.

## Ownership

| Package                                                          | Responsibility                                                            | Specification                                         |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------- |
| [pi-composer](../packages/pi-composer/README.md)                 | Markdown editing, selection, undo/redo, and session drafts                | [Composer spec](specs/pi-composer.md)                 |
| [pi-paste](../packages/pi-paste/README.md)                       | Paste classification, inline/attachment decisions, and explicit overrides | [Paste spec](specs/pi-paste.md)                       |
| [pi-attachments](../packages/pi-attachments/README.md)           | Attachment snapshots, previews, restoration, retention, and delivery      | [Attachments spec](specs/pi-attachments.md)           |
| [pi-skill-references](../packages/pi-skill-references/README.md) | Inline skill completion and canonical skill expansion                     | [Skill references spec](specs/pi-skill-references.md) |

The active editor owns draft mutations. With `pi-composer`, text, selection, and draft attachment membership share one undo history. `pi-paste` chooses the paste outcome, while `pi-attachments` owns stored contents and their lifetime.

A large paste replacing selected text illustrates the cooperation: paste policy selects attachment handling, attachment handling prepares the snapshot, and the editor commits the text replacement and attachment membership together. An asynchronous result must remain associated with the draft that requested it.

Every snapshot added to a draft remains retained. Explicit attachment cleanup reclaims only proven-unused capture or staging data; hidden editor histories and arbitrary session locations make broader deletion unsafe through current public Pi contracts.

`pi-paste` uses attachment handling for file/image outcomes. That collaboration must work with the native editor and with `pi-composer`; storage behavior belongs to `pi-attachments`. Native skill and path discovery remain Pi's responsibility.

## Native integration

Every package uses existing public Pi contracts and consumes the effective services Pi supplies, including other extensions' overrides.

| Contract                                                               | Requirement                                                                           |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `AutocompleteProvider` and `addAutocompleteProvider`                   | Preserve provider order, updates, cancellation, completion edits, and cursor results. |
| `EditorComponent` and native text APIs                                 | Apply text changes through the active editor.                                         |
| Terminal-input listeners, keybinding managers, commands, and shortcuts | Preserve Pi's dispatch priority.                                                      |
| Widgets, overlays, status, header, and footer hooks                    | Coexist with registered extension UI.                                                 |
| Clipboard, image, theme, and terminal utilities                        | Reuse the host-provided implementations.                                              |
| Input transformations and host submission                              | Preserve native commands and steer/follow-up behavior.                                |
| Session lifecycle and state APIs                                       | Keep drafts and attachment references associated with the correct session.            |

Pi supports one active replacement editor. Independently loaded packages must cooperate through public interfaces and cannot assume they share a dependency instance. Sources: [editor contract](https://github.com/earendil-works/pi/blob/6fb2e7815/packages/tui/src/editor-component.ts), [extension interfaces](https://github.com/earendil-works/pi/blob/6fb2e7815/packages/coding-agent/src/core/extensions/types.ts), and [package dependencies](https://github.com/earendil-works/pi/blob/6fb2e7815/packages/coding-agent/docs/packages.md).

## Keyboard ownership

The terminal handles its shortcuts before input reaches Pi. Pi owns terminal input decoding, protocol negotiation, and effective keybinding configuration; the active editor applies the resolved editing action to its draft. A replacement editor must implement those operations against its own state rather than delegate them to the inherited editor's separate document.

Native input listeners, focused UI, application actions, and accepted extension shortcuts retain Pi's dispatch behavior. Effective native editing bindings take precedence over composer aliases, and an explicit Pi binding override suppresses aliases for that action, including when its binding list is empty. Composer actions without native action IDs have documented fixed shortcuts, and Pi configuration is not an automatic import of macOS text-field preferences.

Terminal shortcut delivery requires separate verification from editor behavior. Any terminal integration must identify Pi's terminal, follow actual terminal ownership through handoffs, and remove only its own changes while preserving other integrations and behavior outside Pi. The [keyboard spec revision plan](composer-keyboard-spec-plan.md) records the required editing corrections, verified terminal limitations, and acceptance coverage.

## Integration requirements

Pi exposes raw terminal listeners, text insertion/replacement, widgets, and input transformations. Its public editor contract does not expose an atomic operation combining selected text and attachment membership. Terminal listeners alone also do not cover clipboard and extension calls that enter the editor directly.

The editor's `onSubmit` callback carries text, and the extension-level `sendUserMessage` returns `void`. Neither supplies a public submission acknowledgement. Native editor clears, queued input, asynchronous failures, and attachment recovery must therefore be verified through the existing lifecycle and input contracts.

Implementations must demonstrate cross-package attachment handoff, capability availability, and combined undo through existing public Pi contracts. Those scenarios are integration acceptance checks. If a required scenario cannot be satisfied, record the exact host limitation and preserve recoverable content; package separation does not authorize a new integration protocol or Pi API change.

Sources: [text and paste routes](https://github.com/earendil-works/pi/blob/6fb2e7815/packages/coding-agent/src/modes/interactive/interactive-mode.ts#L2655), [clipboard routes](https://github.com/earendil-works/pi/blob/6fb2e7815/packages/coding-agent/src/modes/interactive/interactive-mode.ts#L3138), and [submission API](https://github.com/earendil-works/pi/blob/6fb2e7815/packages/coding-agent/src/core/extensions/types.ts#L1708).

## Verification requirements

- Paste, attachment, and skill-reference extensions provide useful behavior with native Pi while `pi-composer` is absent.
- Each extension retains native provider overrides, commands, shortcuts, and UI registrations.
- Paste routes apply the same policy, including extension paste and direct clipboard handling.
- With `pi-composer`, replacing selected text with an attachment is one undoable edit.
- Session switches and late asynchronous results preserve the correct draft and attachment associations.
- Submission, steer/follow-up, failures, and restoration preserve readable attachment contents.
- Disabling or replacing an extension preserves saved text and retained attachment files.

These requirements are exercised through public-host tests. Real terminal behavior remains a separate acceptance check.

## Testing boundary

Use Pi's public editor/session boundary as the shared behavioral testing seam. Load the actual packages, drive native editing, paste, completion, input transformation, and lifecycle actions, and observe the visible draft, submitted content, retained snapshots, and recoverable errors.

Exercise each package with its required capabilities, with Pi's native editor where applicable, and in the combined four-package setup. Include native overrides and provider updates. A package tested in isolation does not establish behavior through a host route that bypasses its handler.

Use the workspace's Node test runner and existing public-host fixtures. Pi's editor/virtual-terminal and extension input-event tests provide prior art for behavioral assertions. Package-specific acceptance scenarios live in the [specifications](specs/).

Use temporary session and attachment data and controlled model responses for automated submission checks. Keep assertions on text, visible output, instruction/image content, and retained files. Real Ghostty/macOS checks establish Command-key forwarding, clipboard formats, mouse behavior, fullscreen layout, and image graphics.

## Architecture decisions

Shared decisions apply to every package:

- [Preserve Pi extension contracts](adr/0001-preserve-pi-extension-contracts.md)
- [One editor owns draft transactions](adr/0002-one-editor-owns-draft-transactions.md)
- [Independent composition extensions](adr/0003-independent-composition-extensions.md)
- [Scope terminal integration to Pi's terminal ownership](adr/0010-scope-terminal-integration-to-pi.md)

The composer also follows [native editing action resolution](adr/0009-pi-composer-native-editing-actions.md).

All ADRs use one sequence in [docs/adr/](adr/). Package-specific [specifications](specs/) link to their decisions, whose filenames identify the owning package. The [glossary](../GLOSSARY.md) defines the shared terminology.
