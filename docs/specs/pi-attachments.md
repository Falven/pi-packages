# Attachments specification

## Problem Statement

Users need to attach text, files, and images without losing the contents when an original file changes or a session is resumed. They also need to inspect what is attached, restore attached text to the draft, remove an attachment from a request, and retain readable material for older submissions.

## Solution

`pi-attachments` preserves attachment snapshots and exposes previews, Restore Inline, draft membership changes, retained storage, and native submission delivery. It works with Pi's native editor and `pi-composer`; pasted attachment creation follows `pi-paste` policy. The supported environment is Ghostty on local macOS in Pi's fullscreen mode.

## User Stories

1. As a Pi user, I want to attach text as a preserved file, so that the agent can read it when needed.
2. As a Pi user, I want to attach existing files, so that I can include their contents with a request.
3. As a Pi user, I want to attach images, so that I can provide visual context.
4. As a Pi user, I want attachment contents captured when added, so that subsequent changes to the original do not change my request.
5. As a Pi user, I want ordinary file references to keep identifying current source files, so that attaching a snapshot and referencing a working file remain distinct actions.
6. As a Pi user, I want to see which attachments belong to the draft, so that I can review the request before sending it.
7. As a Pi user, I want a small preview for each image, so that I can recognize the attached image.
8. As a Pi user, I want to preview an attached text file, so that I can inspect it without inserting the whole file into the draft.
9. As a Pi user, I want Restore Inline to insert attached text at the caret, so that I can edit it as part of the prompt.
10. As a Pi user, I want Restore Inline to replace the current selection, so that restoring text follows ordinary editing behavior.
11. As a Pi user, I want restored code contents preserved, so that restoration does not alter examples.
12. As a Pi user, I want restoration in `pi-composer` to undo as one action, so that I recover both the text and the attachment's membership.
13. As a Pi user, I want to remove an attachment from the draft, so that I can change what the request includes.
14. As a Pi user, I want removing an attachment to preserve contents needed elsewhere, so that undo and older requests remain usable.
15. As a Pi user, I want attachments restored with the correct session draft, so that switching sessions cannot mix requests.
16. As a Pi user, I want saved attachment references to remain readable after restarting Pi, so that unfinished and older work remains usable.
17. As a Pi user, I want resumed sessions and forks to retain readable attachments, so that I can continue prior work.
18. As a Pi user, I want every snapshot added to a draft retained, so that older requests and undo remain usable.
19. As a Pi user, I want explicit cleanup to reclaim proven-unused capture or staging data while preserving added snapshots, so that reclaiming storage cannot break drafts, undo, or retained submissions.
20. As a Pi user, I want text and file attachments read on demand, so that their full contents do not enter the prompt automatically.
21. As a Pi user, I want images delivered through Pi's image support, so that the agent receives image content.
22. As a Pi user, I want attachments included with native submission and steer/follow-up actions, so that they remain associated with the intended message.
23. As a Pi user, I want failed reads, writes, previews, or delivery to leave content recoverable, so that an attachment error does not erase my work.
24. As a Pi user, I want delayed attachment operations to remain associated with the requesting draft, so that later work is not overwritten.
25. As a Pi user, I want attachment actions and previews with native Pi when `pi-composer` is absent, so that attachment handling does not dictate my editor.
26. As an extension author, I want attachment handling to use Pi's existing interfaces, so that it can coexist with native UI and input transformations.
27. As a Pi user, I want preview loading, refresh, and resize to preserve the editor's selection and focus, so that my next edit still changes the intended range.
28. As a Pi user, I want a full-draft selection to survive image-widget updates, so that selecting all remains useful while attachments are visible.
29. As a Pi user, I want navigation, acceptance, and cancellation to stay with the focused attachment UI, so that those keys do not also move or submit my draft.
30. As a Pi user, I want cancelling preview or attachment management to return to the unchanged draft and selection, so that inspecting an attachment does not interrupt editing.
31. As a Pi user, I want image and copied-file checks to use the effective native clipboard action, so that terminal text paste cannot falsely establish attachment support.

## Implementation Decisions

- The package owns stored attachment contents, metadata, preview, restoration, retention, and delivery. Membership follows ordinary Markdown attachment references in the active editor's text. Editing or undoing those references changes membership through the editor's existing text history while storage remains attachment-owned.
- Snapshot text, files, and images when the attachment is added. A reference becomes usable only after its contents are successfully preserved. Later changes or removal of the original source do not alter that snapshot.
- Ordinary file references continue to identify current source files. Attachment references identify captured contents. Preserve that distinction in the displayed draft and submitted request.
- Use Pi's clipboard and image conversion/resizing helpers and standard Node filesystem facilities. Keep retained contents in stable package-owned storage using Pi's state-location conventions. Image previews and delivery conversions must preserve the original snapshot.
- Pasted attachment creation consumes the paste policy; explicit attachment actions use native Pi action/UI facilities. The native `attach-file` command accepts captured sources from paste handling and explicit file choices. Both routes share the same snapshot storage and lifetime rules.
- Show attachment membership near the active editor through Pi's `setWidget` facility. Render small image previews with Pi's `Image` component and graphics capabilities, and use native overlays for attachment actions and text preview. Reuse the existing preview integration. Loading, refresh, resize, invalidation, and preview errors preserve the editor's text, selection anchor/range, history, and focus.
- Focused attachment-management and preview components own their navigation, acceptance, and cancellation through native routing. Cancelling or closing a preview returns to the unchanged draft and selection. An accepted action changes the draft only through the active editor's public text interfaces; its key cannot also trigger background editing or submission.
- Clipboard attachments arrive through the effective native clipboard handler and paste policy. Terminal text, including a path-shaped paste, supplies no image/file metadata. Verify native image and copied-file delivery independently of the physical shortcut used to trigger text paste.
- Restore Inline inserts the complete preserved text at the current caret or replaces the selection. The native editor retains its tab expansion to four spaces and LF normalization; `pi-composer` preserves tabs, and the snapshot bytes remain unchanged. Restoration is an explicit inline action even when the text exceeds the paste cutoff. The restored item leaves the draft's attachment membership.
- With `pi-composer`, restoration, removal, or attachment insertion and its related text changes form one undoable action. Undo/redo must restore membership without losing the required stored contents.
- Removing an item from the draft changes membership. Preserve stored contents needed by another saved draft, in-memory undo, or a retained submission. A preview failure must not imply that the stored attachment has been removed.
- Associate saved attachment references with native session identity. Restore readable references with session drafts and preserve the contents needed by resumed sessions and forks.
- Retain every snapshot that has entered a draft, including contents reachable through hidden editor history, saved sessions, submissions, or forks. Explicit cleanup reclaims only proven-unused capture or staging data; pending writes, recoverable contents, and data with uncertain eligibility remain retained. Pi's public contracts cannot enumerate every live undo history or session-file location. Retained storage remains usable across application restarts.
- Text and file attachments contribute readable snapshot references to the submitted prompt; their full bodies remain available on demand. Images use native image content. Existing images and other input transformations must survive composition with attachment delivery.
- Preserve native submission, command dispatch, and steer/follow-up behavior. Deliver the attachments associated with the submitted draft, including requests whose supporting material is entirely attached. Draft clearing is not evidence that delivery succeeded.
- Bind asynchronous reads, writes, previews, and delivery preparation to the requesting draft and attachment. Preserve later unrelated edits and report failures with enough context for recovery.
- Cooperate through existing public Pi contracts, including native text insertion, widgets, input transformations, and lifecycle/state facilities. Verify cross-package handoff and combined undo through those interfaces; the text-only editor callback supplies no structured attachment transaction or submission acknowledgement.

## Testing Decisions

- Test through the public Pi editor/session boundary using loaded extensions and temporary attachment storage. Assert visible membership, previewed/restored text, preserved bytes, submitted references/images, and readable files after lifecycle changes. Avoid assertions about private metadata layout or storage helper calls.
- Exercise explicit attachments with native Pi alone, pasted attachments with `pi-paste`, and history behavior with `pi-composer`. Use the same host setup to verify compatibility with other native input transformations and UI registrations.
- Use the existing Node test runner. Pi's clipboard/image tests, virtual-terminal tests, and extension input-event tests provide prior art for content fixtures, native rendering, and transformation chaining. Reuse the package's public-host fixtures and behavior tests.
- Cover the following observable scenarios:

| Scenario                                                                                             | Required result                                                                                            |
| ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Attach text, a file, or an image; then change or remove its original source                          | The retained attachment still exposes the contents captured when added.                                    |
| Reference a working file normally, then change it                                                    | The reference continues to identify the current source file.                                               |
| Preview attached text or display a small image preview                                               | The preview identifies the selected attachment without altering stored contents.                           |
| Restore text at a caret or over a selection, including code and text above the paste cutoff          | Complete preserved text appears inline and the attachment leaves draft membership.                         |
| Undo and redo restoration, removal, or selection replacement in `pi-composer`                        | Text and membership return together; required snapshots remain available.                                  |
| Remove an attachment used by another draft or retained submission                                    | The other reference remains readable.                                                                      |
| Switch sessions, restart, resume, or fork                                                            | The correct draft references and submitted snapshots remain usable.                                        |
| Request explicit cleanup while snapshots remain referenced                                           | Added snapshots and recoverable contents survive; only proven-unused capture or staging data is reclaimed. |
| Submit text/files and images through normal, steer, and follow-up paths                              | Text/files remain readable on demand; image content and message association are preserved.                 |
| Another input transformation has already supplied images or changed text                             | Attachment delivery composes with that result through native dispatch.                                     |
| A source is unreadable, a write fails, or a preview cannot render                                    | The error is visible; existing draft content and retained assets remain recoverable.                       |
| A session changes or the host clears the editor during pending work or failed submission             | No unrelated draft is overwritten and required contents remain recoverable.                                |
| Select part or all of the draft, then load, refresh, resize, or fail an image preview                | Both views retain the source range and anchor; the next replacement edits that range and undoes once.      |
| Navigate, accept, or cancel attachment management while text is selected                             | Only the focused native UI handles its keys; no background movement, submission, or duplicate edit occurs. |
| Close a text preview or cancel management without choosing a draft action                            | The same draft, selection, attachment membership, and editor focus return.                                 |
| Restore or remove while another native widget and a completion provider are installed                | The native UI remains usable; one editor transaction changes membership and text as specified.             |
| Compare terminal text paste with a remapped native clipboard action using actual copied files/images | Only the native metadata route establishes image/file capture; previews identify the captured snapshots.   |

- Run real Ghostty/macOS checks for image graphics, attachment placement, keyboard access to preview/restoration, clipboard images, and fullscreen coexistence with native widgets. Include keyboard select-all and partial selection through redraws, view changes, and image updates, then type and undo to verify the preserved range. Record clipboard routes separately from terminal text and keep unobserved physical routes pending.
- Verify native command handoff, combined text/membership undo, and submission recovery through the public host. Assert the final message and retained bytes as well as successful storage.

## Out of Scope

Paste classification belongs to the paste specification. Selection, editing bindings, and shared undo belong to the active editor; the attachment UI uses their public contracts.

## Further Notes

The [package README](../../packages/pi-attachments/README.md) documents attachment actions, previews, recovery, and cleanup. Work and acceptance evidence are tracked in the [composition tickets](../../.scratch/prompt-composition/issues/) and [preview-selection ticket](../../.scratch/composer-keyboard/issues/07-preserve-selection-through-native-ui.md).

See the [glossary](../../GLOSSARY.md), [paste specification](pi-paste.md), and [composer specification](pi-composer.md).

Native evidence and testing prior art: [extension UI, input, and submission contracts](https://github.com/earendil-works/pi/blob/6fb2e7815/packages/coding-agent/src/core/extensions/types.ts), [image and terminal exports](https://github.com/earendil-works/pi/blob/6fb2e7815/packages/tui/src/index.ts), [clipboard image tests](https://github.com/earendil-works/pi/blob/6fb2e7815/packages/coding-agent/test/clipboard-image.test.ts), and [input transformation tests](https://github.com/earendil-works/pi/blob/6fb2e7815/packages/coding-agent/test/extensions-input-event.test.ts).

### Architecture decisions

- [Preserve Pi extension contracts](../adr/0001-preserve-pi-extension-contracts.md)
- [One editor owns draft transactions](../adr/0002-one-editor-owns-draft-transactions.md)
- [Independent composition extensions](../adr/0003-independent-composition-extensions.md)
- [Retain attachment snapshots](../adr/0007-pi-attachments-retain-snapshots.md)
- [Resolve native editing actions before composer shortcuts](../adr/0009-pi-composer-native-editing-actions.md)
- [Make terminal keybinding setup explicit and reversible](../adr/0010-explicit-terminal-keybinding-setup.md)
