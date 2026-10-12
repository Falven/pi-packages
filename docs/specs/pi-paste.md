# Paste specification

## Problem Statement

A pasted block should be visible and editable when it is small, and readable on demand when it is large. Different paste routes must make the same decision. Users also need to choose an inline paste or text attachment explicitly and retain their content when clipboard or attachment handling fails.

## Solution

`pi-paste` classifies incoming clipboard content and applies one paste policy with Pi's native editor or `pi-composer`. Small text appears inline; large text uses an attachment; Paste Inline and Attach Text let the user choose either outcome. Attachment storage and presentation are supplied by `pi-attachments`. The initial supported environment is Ghostty on local macOS in Pi's fullscreen mode.

## User Stories

1. As a Pi user, I want small text pastes to appear inline, so that I can read and edit what I inserted.
2. As a Pi user, I want large text pastes to become readable attachments, so that their complete contents are available without filling the prompt.
3. As a Pi user, I want the cutoff to apply to each paste, so that a long draft does not change how the next small paste behaves.
4. As a Pi user, I want line count to have no separate cutoff, so that a short multiline paste stays inline.
5. As a Pi user, I want Unicode text measured consistently, so that the same content takes the same route.
6. As a Pi user, I want terminal paste to follow the policy, so that ordinary terminal insertion is predictable.
7. As a Pi user, I want clipboard shortcuts to follow the same policy, so that changing the shortcut does not change the outcome.
8. As a Pi user, I want right-click paste to follow the same policy, so that mouse and keyboard workflows agree.
9. As an extension author, I want native extension paste calls to follow the policy, so that my extension does not need a separate composer integration.
10. As a Pi user, I want Paste Inline to bypass attachment conversion, so that I can edit a large block directly.
11. As a Pi user, I want Attach Text to work for short text too, so that I can keep supporting material separate from my prose.
12. As a Pi user, I want the same cutoff inside code blocks, so that paste behavior depends on the action I chose.
13. As a Pi user, I want pasted code and Markdown preserved, so that formatting decisions do not corrupt their contents.
14. As a Pi user, I want ordinary typing and native text replacement to stay inline, so that building or replacing a long draft does not turn it into a paste attachment.
15. As a Pi user, I want copied files recognized through native clipboard information, so that I attach the files I selected.
16. As a Pi user, I want copied files to take precedence over a clipboard icon image, so that the attachment contains the selected file.
17. As a Pi user, I want clipboard images sent to attachment handling, so that I can include visual context.
18. As a Pi user, I want paste to replace the current selection through the active editor, so that it follows normal editing behavior.
19. As a Pi user, I want an attachment-producing paste to undo as one action in `pi-composer`, so that undo restores both selected text and attachment membership.
20. As a Pi user, I want delayed clipboard reads to stay with the requesting draft, so that switching sessions cannot misplace content.
21. As a Pi user, I want clipboard and attachment errors to preserve recoverable content, so that a failed paste does not damage the draft.
22. As a Pi user, I want paste policy to work with native Pi when `pi-composer` is absent, so that I can choose my editor independently.
23. As a Pi user, I want existing input listeners and shortcuts to retain their native behavior, so that installing paste policy does not take over unrelated actions.

## Implementation Decisions

- `pi-paste` owns content classification, inline/attachment decisions, and explicit paste overrides. The active editor owns draft changes. `pi-attachments` owns snapshots, previews, restoration, retention, and delivery.
- Use native clipboard facilities for plain text, Markdown, copied file paths, and images. Preserve Pi's content precedence: native copied-file information before image data, then plain text. A clipboard read error remains an error rather than being treated as a different content type.
- Measure each decoded text paste in JavaScript UTF-16 code units before editor formatting. A text paste shorter than 5,000 units is inline; a paste of at least 5,000 units uses text-attachment handling. The policy has no line-count or accumulated-draft-length condition.
- Assemble a bracketed paste as one action even when terminal input arrives in chunks. Classify the complete payload once. Inline display and stored text must preserve the decoded contents, including code text.
- Apply the policy to terminal paste, clipboard shortcuts, right-click paste, and native `pasteToEditor` calls, including pastes inside code blocks. Ordinary typing and native text replacement do not invoke the cutoff.
- Expose Paste Inline and Attach Text through existing Pi action/UI facilities. Paste Inline explicitly selects inline text insertion regardless of size. Attach Text explicitly selects a text attachment regardless of size.
- File and image outcomes use attachment handling. Preserve native clipboard file identities and path validation. Text that merely resembles a resource reference keeps its text meaning unless the native clipboard identifies it as copied files or the user chooses an attachment action.
- Apply a successful paste at the active editor's intended caret or selection. With `pi-composer`, related text and attachment membership changes are one undoable action. Snapshot preparation must succeed before the selected content is discarded.
- Associate the clipboard read, snapshot preparation, and resulting edit with the requesting draft. Preserve later unrelated edits; late or failed operations must leave their content recoverable.
- Use current public Pi contracts for cooperation. The package must remain useful with the native editor, and its policy must cooperate with `pi-composer` and installed native overrides. Attachment-producing outcomes require attachment handling to be available.
- Preserve native input dispatch and existing listeners that transform or consume input. Raw terminal listeners, direct editor paste, and clipboard insertion are different host routes; an implementation must demonstrate coverage of each required route.
- If attachment handling cannot complete an action, report the failure and preserve the draft and recoverable paste contents. Automatic conversion must not silently substitute a different paste policy.

## Testing Decisions

- Test through the public Pi editor/session boundary. Drive actual host paste routes and observe inline content, attachment references, stored contents, submission payloads, and errors. A policy helper test alone cannot establish route coverage.
- Use the shared host setup with native Pi, with `pi-composer`, and with attachment handling enabled. Verify existing input listeners and shortcuts retain their native dispatch behavior.
- Use the existing Node test runner. Pi's clipboard file-precedence tests, editor paste tests, and interactive terminal tests provide prior art for behavior and fixture construction. Keep package implementation details out of assertions.
- Cover the following observable scenarios:

| Scenario                                                                        | Required result                                                                              |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Paste 4,999, 5,000, and 5,001 UTF-16 code units                                 | The first is inline; the other two are text attachments.                                     |
| Paste equivalent boundary cases containing emoji or supplementary characters    | Routing follows UTF-16 length, independently of displayed character count or byte length.    |
| Paste short text with many lines, or small text into a long draft               | The text remains inline.                                                                     |
| Deliver one bracketed paste in several input chunks                             | One complete payload is classified and inserted once.                                        |
| Use terminal paste, clipboard shortcuts, right-click paste, and extension paste | The same payload follows the same policy through each actual host route.                     |
| Use Paste Inline or Attach Text in prose and code                               | The explicit action wins, and contents are preserved.                                        |
| Type a long draft or replace it through native text APIs                        | The resulting draft remains inline text.                                                     |
| Copy files with spaces or Unicode names and an accompanying icon image          | File identity wins; the selected files reach attachment handling.                            |
| Paste an image or receive a native clipboard error                              | The image reaches attachment handling; an error is visible and leaves the draft recoverable. |
| Replace a selection with an attachment, then undo/redo in `pi-composer`         | Text and membership change together and the snapshot remains readable.                       |
| Change sessions or edit while a read/write is pending                           | The operation stays associated with the requesting draft and preserves unrelated edits.      |
| Attachment handling is unavailable or a snapshot write fails                    | No content is silently discarded or rerouted; the user receives a recoverable failure.       |

- Run real Ghostty/macOS checks for clipboard formats, shortcut forwarding, right-click paste, and copied-file precedence. Test the native editor as well as the composer.
- Require route coverage and native attachment handoff as integration acceptance checks before completing the package. Record any unsupported host route with its exact public-contract limitation.

## Further Notes

The package currently contains a loadable scaffold. These requirements define implementation acceptance; feature behavior has not been implemented or verified.

See the [shared architecture and testing boundary](../architecture.md), [glossary](../../GLOSSARY.md), [composer specification](pi-composer.md), and [attachment specification](pi-attachments.md).

Native evidence and testing prior art: [extension paste and UI contracts](https://github.com/earendil-works/pi/blob/6fb2e7815/packages/coding-agent/src/core/extensions/types.ts), [interactive paste routes](https://github.com/earendil-works/pi/blob/6fb2e7815/packages/coding-agent/src/modes/interactive/interactive-mode.ts), [clipboard file-precedence tests](https://github.com/earendil-works/pi/blob/6fb2e7815/packages/coding-agent/test/clipboard-paste-file-paths.test.ts), and [editor paste tests](https://github.com/earendil-works/pi/blob/6fb2e7815/packages/tui/test/editor.test.ts).

### Architecture decisions

- [Preserve Pi extension contracts](../adr/0001-preserve-pi-extension-contracts.md)
- [One editor owns draft transactions](../adr/0002-one-editor-owns-draft-transactions.md)
- [Independent composition extensions](../adr/0003-independent-composition-extensions.md)
- [Large pastes become readable attachments](../adr/0006-pi-paste-large-pastes-as-readable-attachments.md)
