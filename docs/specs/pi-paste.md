# Paste specification

**Triage:** `acceptance-pending`

## Problem Statement

A pasted block should be visible and editable when it is small, and readable on demand when it is large. Different paste routes must make the same decision for the same supplied content. Users also need to choose an inline paste or text attachment explicitly and retain their content when clipboard or attachment handling fails. Terminal text paste and native clipboard actions can deliver different content even when the physical gesture looks the same.

## Solution

`pi-paste` classifies incoming clipboard content and applies one paste policy with Pi's native editor or `pi-composer`. Small text appears inline; large text uses an attachment; Paste Inline and Attach Text let the user choose either outcome. Attachment storage and presentation are supplied by `pi-attachments`. The initial target is Ghostty on local macOS in Pi's fullscreen mode; physical input and graphics require separate acceptance evidence.

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
24. As a Pi user, I want the effective native clipboard binding to select clipboard paste, so that my Pi configuration controls the action with either editor.
25. As a Pi user, I want changing or clearing that binding to suppress the extra raw Cmd+V alias, so that the package cannot bypass my configuration.
26. As a Pi user, I want terminal-generated text paste to keep working independently of the raw Cmd+V alias, so that changing a Pi shortcut does not disable delivered paste payloads.
27. As a Pi user, I want terminal text and native clipboard metadata handled according to what each route supplies, so that a pasted path does not unexpectedly attach a file.
28. As a Pi user, I want a shortcut consumed by another native action, extension, or focused overlay to leave my draft alone, so that one key cannot perform two operations.
29. As a Pi user, I want the observed route recorded when testing Cmd+V, menu paste, and right-click, so that successful text paste is not mistaken for image or copied-file support.

## Implementation Decisions

- `pi-paste` owns content classification, inline/attachment decisions, and explicit paste overrides. The active editor owns draft changes. `pi-attachments` owns snapshots, previews, restoration, retention, and delivery.
- Use native clipboard facilities for plain text, Markdown, copied file paths, and images. The native clipboard route preserves Pi's content precedence: native copied-file information before image data, then plain text. A clipboard read error remains an error rather than being treated as a different content type.
- Measure each decoded text paste in JavaScript UTF-16 code units before editor formatting. A text paste shorter than 5,000 units is inline; a paste of at least 5,000 units uses text-attachment handling. The policy has no line-count or accumulated-draft-length condition.
- Assemble a bracketed paste as one action even when terminal input arrives in chunks. Classify the complete payload once. The native editor retains its tab expansion to four spaces and LF normalization; `pi-composer` preserves tabs. Attachment snapshots preserve the captured contents independently of editor whitespace handling.
- Apply the policy to terminal paste, clipboard shortcuts, right-click paste, and native `pasteToEditor` calls, including pastes inside code blocks. Terminal bracketed paste and `pasteToEditor` supply text; process that payload without rereading the clipboard to infer images or copied files. Native clipboard actions supply the separate metadata-aware route. Ordinary typing and native text replacement do not invoke the cutoff.
- Expose Paste Inline and Attach Text through existing Pi action/UI facilities. Paste Inline explicitly selects inline text insertion regardless of size. Attach Text explicitly selects a text attachment regardless of size.
- File and image outcomes use attachment handling. Preserve native clipboard file identities and path validation. Text that merely resembles a resource reference keeps its text meaning unless the native clipboard identifies it as copied files or the user chooses an attachment action.
- Apply a successful paste at the active editor's intended caret or selection. With `pi-composer`, related text and attachment membership changes are one undoable action. Snapshot preparation must succeed before the selected content is discarded.
- Associate the clipboard read, snapshot preparation, and resulting edit with the requesting draft. Preserve later unrelated edits; late or failed operations must leave their content recoverable.
- Use current public Pi contracts for cooperation. The package must remain useful with the native editor, and its policy must cooperate with `pi-composer` and installed native overrides. Attachment-producing outcomes require attachment handling to be available.
- Resolve native clipboard input through the supplied manager's effective `app.clipboard.pasteImage` action, whose macOS default is Ctrl+V. Use its public user-binding information: any explicit override, including an empty list or a repeated default, suppresses the package's raw Cmd+V convenience alias. This applies with the native editor as well as `pi-composer`; neither package can restore an alias the configuration suppressed.
- Preserve native input dispatch and existing listeners that transform or consume input. Native actions, accepted extension shortcuts, and focused components keep their input before a raw Cmd+V fallback. A handled key must not also read the clipboard or edit the draft. Raw listeners, direct editor paste, and native clipboard insertion are different host routes; demonstrate each required route without adding a separate keybinding manager or configuration reader.
- A physical Cmd+V, terminal menu action, or right-click may produce bracketed text rather than a raw key or native clipboard action. Disabling the raw alias does not disable a delivered text paste. Apply the cutoff to the decoded text actually supplied, and report the observed route when verifying behavior. Keep terminal settings unchanged.
- If attachment handling cannot complete an action, report the failure and preserve the draft and recoverable paste contents. Automatic conversion must not silently substitute a different paste policy.

## Testing Decisions

- Test through the public Pi editor/session boundary. Drive actual host paste routes and observe inline content, attachment references, stored contents, submission payloads, and errors. A policy helper test alone cannot establish route coverage.
- Use the shared host setup with native Pi, with `pi-composer`, and with attachment handling enabled. Verify existing input listeners and shortcuts retain their native dispatch behavior.
- Use the existing Node test runner. Pi's clipboard file-precedence tests, editor paste tests, and interactive terminal tests provide prior art for behavior and fixture construction. Keep package implementation details out of assertions.
- Cover the following observable scenarios:

| Scenario                                                                                | Required result                                                                                                                 |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Paste 4,999, 5,000, and 5,001 UTF-16 code units                                         | The first is inline; the other two are text attachments.                                                                        |
| Paste equivalent boundary cases containing emoji or supplementary characters            | Routing follows UTF-16 length, independently of displayed character count or byte length.                                       |
| Paste short text with many lines, or small text into a long draft                       | The text remains inline.                                                                                                        |
| Deliver one bracketed paste in several input chunks                                     | One complete payload is classified and inserted once.                                                                           |
| Use terminal paste, clipboard shortcuts, right-click paste, and extension paste         | The same payload follows the same policy through each actual host route.                                                        |
| Use Paste Inline or Attach Text in prose and code                                       | The explicit action wins, and contents are preserved.                                                                           |
| Type a long draft or replace it through native text APIs                                | The resulting draft remains inline text.                                                                                        |
| Copy files with spaces or Unicode names and an accompanying icon image                  | File identity wins; the selected files reach attachment handling.                                                               |
| Paste an image or receive a native clipboard error                                      | The image reaches attachment handling; an error is visible and leaves the draft recoverable.                                    |
| Replace a selection with an attachment, then undo/redo in `pi-composer`                 | Text and membership change together and the snapshot remains readable.                                                          |
| Change sessions or edit while a read/write is pending                                   | The operation stays associated with the requesting draft and preserves unrelated edits.                                         |
| Attachment handling is unavailable or a snapshot write fails                            | No content is silently discarded or rerouted; the user receives a recoverable failure.                                          |
| Remap the native clipboard action, clear its bindings, or explicitly repeat its default | Effective native bindings control clipboard paste; the extra raw Cmd+V alias is suppressed in both editors.                     |
| Deliver bracketed text after suppressing the raw Cmd+V alias                            | The supplied text still follows paste policy once; no separate clipboard read adds content.                                     |
| Bind a native action or accepted extension shortcut to Cmd+V                            | Its native owner acts once; paste adds no draft content or attachment.                                                          |
| Paste while an overlay or another focused component owns the input                      | Input follows that component's native behavior; the background draft is unchanged.                                              |
| Deliver a path as terminal text while the clipboard contains a file or image            | Only the delivered text is classified; unrelated clipboard metadata does not become an attachment.                              |
| Run the native clipboard action with file, image, and text clipboard data separately    | Native metadata precedence and the corresponding attachment or inline result are verified independently of terminal text paste. |

- Run real Ghostty/macOS checks for clipboard formats, shortcut forwarding, right-click paste, and copied-file precedence with the native editor and composer. Record effective Pi and terminal bindings, the physical gesture, observed route, and result. Menu or Cmd+V text paste alone does not establish native image/file delivery; verify the effective native clipboard action separately. Keep unobserved routes pending.
- Require route coverage and native attachment handoff as integration acceptance checks before completing the package. Record any unsupported host route with its exact public-contract limitation.

## Out of Scope

Draft state and history belong to the active editor. Snapshot storage, previews, restoration, and retention belong to the attachment specification.

## Further Notes

The revised input routing is implemented and verified through public Pi input with the native editor and composer. Tests cover effective bindings, supplied clipboard handlers, terminal text, metadata precedence, and retained-content recovery. Physical clipboard formats and terminal delivery remain pending in the [verification record](../../.scratch/composer-keyboard/verification.md) and [terminal procedure](../terminal-checks.md).

See the [shared architecture and testing boundary](../architecture.md), [glossary](../../GLOSSARY.md), [composer specification](pi-composer.md), and [attachment specification](pi-attachments.md).

Native evidence and testing prior art: [extension paste and UI contracts](https://github.com/earendil-works/pi/blob/6fb2e7815/packages/coding-agent/src/core/extensions/types.ts), [interactive paste routes](https://github.com/earendil-works/pi/blob/6fb2e7815/packages/coding-agent/src/modes/interactive/interactive-mode.ts), [clipboard file-precedence tests](https://github.com/earendil-works/pi/blob/6fb2e7815/packages/coding-agent/test/clipboard-paste-file-paths.test.ts), and [editor paste tests](https://github.com/earendil-works/pi/blob/6fb2e7815/packages/tui/test/editor.test.ts).

### Architecture decisions

- [Preserve Pi extension contracts](../adr/0001-preserve-pi-extension-contracts.md)
- [One editor owns draft transactions](../adr/0002-one-editor-owns-draft-transactions.md)
- [Independent composition extensions](../adr/0003-independent-composition-extensions.md)
- [Large pastes become readable attachments](../adr/0006-pi-paste-large-pastes-as-readable-attachments.md)
- [Resolve native editing actions before composer shortcuts](../adr/0009-pi-composer-native-editing-actions.md)
- [Make terminal keybinding setup explicit and reversible](../adr/0010-explicit-terminal-keybinding-setup.md)
