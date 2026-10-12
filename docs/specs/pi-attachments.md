# Attachments specification

## Problem Statement

Users need pasted text, files, and images to enter a draft predictably and remain available after a source changes or a session resumes. They need small text inline, large text readable on demand, image previews, explicit attachment actions, and recovery when capture or submission fails. Clipboard metadata and terminal text paste can carry different content for the same physical gesture.

## Solution

`pi-attachments` provides paste policy, attachment capture, previews, Restore Inline, draft membership changes, retained storage, and native submission delivery in one package. Native clipboard files and images become snapshots; text below 5,000 UTF-16 code units stays inline, and larger text becomes a readable attachment. A path copied as text stays text under that policy. The package works with Pi's native editor and `pi-composer`; the supported environment is Ghostty on local macOS in Pi's fullscreen mode.

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
32. As a Pi user, I want to click an image attachment's label or thumbnail to open it in my system's associated application, so that I can inspect it at full resolution.
33. As a Pi user, I want image links to identify the retained file after the source changes or disappears, so that opening and submission refer to the same captured image.
34. As a Pi user, I want image links to preserve draft text, selection, and focus, so that viewing an attachment does not become an editor action.
35. As a Pi user, I want the filename fallback to remain clickable when image graphics are unavailable, so that I can still open the image.
36. As a Pi user, I want small text pastes to appear inline, so that I can read and edit what I inserted.
37. As a Pi user, I want large text pastes to become readable attachments, so that their complete contents remain available without filling the prompt.
38. As a Pi user, I want the cutoff to apply to each paste, so that a long draft does not change how the next small paste behaves.
39. As a Pi user, I want line count to have no separate cutoff, so that a short multiline paste stays inline.
40. As a Pi user, I want Unicode text measured consistently, so that the same content takes the same route.
41. As a Pi user, I want terminal, native clipboard, right-click, and extension paste to apply the same policy to the content they supply, so that each route behaves predictably.
42. As a Pi user, I want Paste Inline to bypass attachment conversion, so that I can edit a large block directly.
43. As a Pi user, I want Attach Text to work for short text too, so that I can keep supporting material separate from my prose.
44. As a Pi user, I want the same cutoff inside code blocks, so that paste behavior depends on the action I chose.
45. As a Pi user, I want ordinary typing and native text replacement to stay inline, so that building or replacing a long draft does not turn it into a paste attachment.
46. As a Pi user, I want copied files recognized through native clipboard information, so that I attach the files I selected.
47. As a Pi user, I want copied files to take precedence over a clipboard icon image, so that the attachment contains the selected file.
48. As a Pi user, I want changing or clearing the native clipboard binding to suppress the extra raw Cmd+V alias, so that the package cannot bypass my Pi configuration.
49. As a Pi user, I want terminal-generated text paste to keep working independently of the raw Cmd+V alias, so that changing a Pi shortcut does not disable delivered paste payloads.
50. As a Pi user, I want installed clipboard handlers and input listeners to keep their native priority, so that one key cannot perform two operations.
51. As a Pi user, I want the observed input route recorded during paste verification, so that successful text paste is not mistaken for image or copied-file support.
52. As a Pi user, I want a clipboard manager's file item to retain its file identity through native clipboard paste, so that a copied image produces an attachment and preview.
53. As a Pi user, I want to paste the text of an existing file's path without attaching it, so that mentioning a location does not read or capture its contents.
54. As a Ghostty user, I want a documented clipboard-manager workflow using Pi's configured clipboard action, so that I can attach copied files without changing terminal paste in other programs.
55. As a Pi user, I want attachment and paste handling in one installation, so that their capture, recovery, and storage behavior remains consistent.
56. As a Pi user, I want saved attachment paths and earlier paste recovery records to remain usable after an update, so that old drafts, sessions, and uncaptured work remain recoverable.

## Implementation Decisions

- The package owns paste policy, attachment capture, recovery, stored contents, metadata, preview, restoration, retention, and delivery. Its paste module classifies clipboard content and text; a shared internal capture operation prepares snapshots for both pastes and explicit actions; attachment UI and delivery consume those snapshots. Membership follows ordinary Markdown attachment references in the active editor's text. Editing or undoing those references changes membership through the editor's existing text history while storage remains attachment-owned.
- Snapshot text, files, and images when the attachment is added. A reference becomes usable only after its contents are successfully preserved. Later changes or removal of the original source do not alter that snapshot.
- Ordinary file references continue to identify current source files. Attachment references identify captured contents. Preserve that distinction in the displayed draft and submitted request.
- Use Pi's clipboard and image conversion/resizing helpers and standard Node filesystem facilities. Keep retained contents in stable package-owned storage using Pi's state-location conventions. Image previews and delivery conversions must preserve the original snapshot.
- Retain format extensions supplied by clipboard capture. Generated recovery filenames for supported native images include their image-type extension, so opening their references uses the system's associated image application. Preserve captured bytes, copied-file names, and existing snapshot paths.
- Link successfully loaded image filenames, thumbnail cells, and text fallbacks to their retained full-resolution file with Pi's native hyperlink helper and effective capability detection. Keep Pi's native Image component responsible for graphics. Use encoded local file URLs with an explicit localhost authority; native Pi or terminal activation opens the system's associated application without a package-specific launcher or terminal configuration change.
- Publish a clickable preview only after the retained file passes the existing storage and image checks. Links belong only to rendered output, cover the preview's reserved cells, and end before surrounding UI. Resizing, refresh, removal, and session changes update the clickable regions alongside visible membership. Opening does not edit the draft or transform the retained file; an external application's subsequent save follows ordinary file semantics and can change that file.
- Attachment-producing pastes call the shared capture operation directly with captured text, image bytes, or copied-file identities. The operation completes snapshot storage and recovery preparation before inserting references into the requesting draft. Explicit `attach-file` and `attach-text` commands use the same capture operation, storage, and lifetime rules. Paste preparation does not create a second persisted copy, temporary source links, or a command submission.
- Show attachment membership near the active editor through Pi's `setWidget` facility. Render small image previews with Pi's `Image` component and graphics capabilities, and use native overlays for attachment actions and text preview. Reuse the existing preview integration. Loading, refresh, resize, invalidation, and preview errors preserve the editor's text, selection anchor/range, history, and focus.
- Focused attachment-management and preview components own their navigation, acceptance, and cancellation through native routing. Cancelling or closing a preview returns to the unchanged draft and selection. An accepted action changes the draft only through the active editor's public text interfaces; its key cannot also trigger background editing or submission.
- Clipboard attachments arrive through the effective native clipboard handler and paste policy. A clipboard manager's native file item uses the same snapshot, image-preview, and delivery behavior as any other copied file. Terminal text, including a path-shaped paste, supplies no image/file metadata and does not authorize capture of the named file. Verify native image and copied-file delivery independently of the physical shortcut used to trigger text paste.
- Restore Inline inserts the complete preserved text at the current caret or replaces the selection. The native editor retains its tab expansion to four spaces and LF normalization; `pi-composer` preserves tabs, and the snapshot bytes remain unchanged. Restoration is an explicit inline action even when the text exceeds the paste cutoff. The restored item leaves the draft's attachment membership.
- With `pi-composer`, restoration, removal, or attachment insertion and its related text changes form one undoable action. Undo/redo must restore membership without losing the required stored contents.
- Removing an item from the draft changes membership. Preserve stored contents needed by another saved draft, in-memory undo, or a retained submission. A preview failure must not imply that the stored attachment has been removed.
- Associate saved attachment references with native session identity. Restore readable references with session drafts and preserve the contents needed by resumed sessions and forks.
- Retain every snapshot that has entered a draft, including contents reachable through hidden editor history, saved sessions, submissions, or forks. Explicit cleanup reclaims only proven-unused capture or staging data; pending writes, recoverable contents, and data with uncertain eligibility remain retained. Pi's public contracts cannot enumerate every live undo history or session-file location. Retained storage remains usable across application restarts.
- Text and file attachments contribute readable snapshot references to the submitted prompt; their full bodies remain available on demand. Images use native image content. Existing images and other input transformations must survive composition with attachment delivery.
- Preserve native submission, command dispatch, and steer/follow-up behavior. Deliver the attachments associated with the submitted draft, including requests whose supporting material is entirely attached. Draft clearing is not evidence that delivery succeeded.
- Automatic text attachment capture preserves exact bytes through the same retry-save action as copied files and images. Explicit text-dialog save failures retain the editable dialog contents. Unsupported clipboard image bytes remain durably recoverable with an error and no insertion.
- Bind asynchronous reads, writes, previews, and delivery preparation to the requesting draft and attachment. Preserve later unrelated edits and report failures with enough context for recovery.
- Cooperate with editors and other extensions through existing public Pi contracts, including native text insertion, widgets, input transformations, and lifecycle/state facilities. Direct capture stays internal to this package. Combined undo follows ordinary Markdown attachment references and the active editor's text history; native text callbacks do not acknowledge model submission.
- Use native clipboard facilities for plain text, Markdown, copied file paths, and images. The native clipboard route preserves Pi's content precedence: native copied-file information before image data, then plain text. A clipboard read error remains an error rather than being treated as a different content type.
- Measure each decoded text paste in JavaScript UTF-16 code units before editor formatting. A text paste shorter than 5,000 units is inline; a paste of at least 5,000 units uses text-attachment handling. The policy has no line-count or accumulated-draft-length condition.
- Assemble a bracketed paste as one action even when terminal input arrives in chunks. Classify the complete payload once. The native editor retains its tab expansion to four spaces and LF normalization; `pi-composer` preserves tabs. Attachment snapshots preserve the captured contents independently of editor whitespace handling.
- Apply the policy to terminal paste, clipboard shortcuts, right-click paste, and native `pasteToEditor` calls, including pastes inside code blocks. Terminal bracketed paste and `pasteToEditor` supply text; process that payload without rereading the clipboard to infer images or copied files. Native clipboard actions supply the separate metadata-aware route. Ordinary typing and native text replacement do not invoke the cutoff.
- Expose Paste Inline and Attach Text through existing Pi action/UI facilities. Paste Inline explicitly selects inline text insertion regardless of size. Attach Text explicitly selects a text attachment regardless of size.
- File and image outcomes use attachment handling. Preserve native clipboard file identities and path validation. Classify actual copied-file metadata independently of a text representation of the same path. A plain, quoted, escaped, or file-URL-shaped text payload follows the text policy without checking the target's existence or reading it. Only native clipboard identity or an explicit attachment action selects file capture.
- Resolve native clipboard input through the supplied manager's effective `app.clipboard.pasteImage` action, whose macOS default is Ctrl+V. Use its public user-binding information: any explicit override, including an empty list or a repeated default, suppresses the package's raw Cmd+V convenience alias. This applies with the native editor as well as `pi-composer`; neither package can restore an alias the configuration suppressed.
- For clipboard-manager files and images in Ghostty, copy the selected item to the system clipboard, return focus to Pi, and invoke its effective native clipboard action. With PastePal, use the selected clip's Copy action, then Ctrl+V under Pi's default macOS bindings. Use Pi's native shortcut information when the action is remapped. This workflow requires `pi-attachments` and works with either editor; the clipboard manager's one-step Paste action is a separate input route.
- Supply a clipboard handler only when one is absent. Earlier handlers and later assignments retain their chosen insertion behavior, including direct insertion; a deliberate direct insertion is distinct from the public paste route governed by this policy.
- Preserve native input dispatch and existing listeners that transform or consume input. Native actions, accepted extension shortcuts, and focused components keep their input before a raw Cmd+V fallback. A handled key must not also read the clipboard or edit the draft. Raw listeners, direct editor paste, and native clipboard insertion are different host routes; demonstrate each required route without adding a separate keybinding manager or configuration reader.
- A physical Cmd+V, terminal menu action, or right-click may produce bracketed text rather than a raw key or native clipboard action. Disabling the raw alias does not disable a delivered text paste. Apply the cutoff to the decoded text actually supplied, and report the observed route when verifying behavior. Keep terminal settings unchanged.
- Preserve Ghostty's Cmd+V binding and its ordinary paste behavior outside Pi. Terminal setup keeps the existing eight forwarding rules. A terminal-converted file path remains text; use the native clipboard workflow or an explicit attachment action to capture the file.
- Keep existing attachment snapshot paths, Markdown references, session records, and durable recovery files readable. Preserve earlier `pi-paste` recovery data in place, including captured bytes and requesting-draft metadata; recovered files remain attachable through the native file action. Pending in-memory capture recovery remains available across extension reloads and session changes.
- Keep `paste-inline`, `paste-recover`, `attach-file`, `attach-text`, `attachments`, `attachments-recover`, and `attachments-cleanup` available through native commands. `paste-recover` aliases the shared attachment recovery action. Recovery retries retained content without inserting it into a newer draft. If Pi exits before a failed write can be retried, contents held only in memory are lost.

## Testing Decisions

- Test through the public Pi editor/session boundary using loaded extensions and temporary attachment storage. Assert visible membership, previewed/restored text, preserved bytes, submitted references/images, and readable files after lifecycle changes. Avoid assertions about private metadata layout or storage helper calls.
- Exercise explicit actions and every paste route with `pi-attachments` and native Pi, then with `pi-composer` for shared history. Use the same host setup to verify compatibility with native input transformations, existing clipboard handlers, editor decorators, and UI registrations.
- Use the existing Node test runner. Pi's clipboard/image tests, virtual-terminal tests, and extension input-event tests provide prior art for content fixtures, native rendering, and transformation chaining. Reuse the package's public-host fixtures and behavior tests.
- Cover the following observable scenarios:

| Scenario                                                                                             | Required result                                                                                                                    |
| ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Attach text, a file, or an image; then change or remove its original source                          | The retained attachment still exposes the contents captured when added.                                                            |
| Reference a working file normally, then change it                                                    | The reference continues to identify the current source file.                                                                       |
| Preview attached text or display a small image preview                                               | The preview identifies the selected attachment without altering stored contents.                                                   |
| Click an image label, thumbnail, or graphics fallback after changing or deleting the source          | Pi's native link activation receives the retained full-resolution file URL; the draft and retained bytes remain unchanged.         |
| Resize, remove an image reference, disable hyperlinks, or fail a preview read                        | Clickable cells track the visible image; surrounding UI and failed previews have no stale image target.                            |
| Restore text at a caret or over a selection, including code and text above the paste cutoff          | Complete preserved text appears inline and the attachment leaves draft membership.                                                 |
| Undo and redo restoration, removal, or selection replacement in `pi-composer`                        | Text and membership return together; required snapshots remain available.                                                          |
| Remove an attachment used by another draft or retained submission                                    | The other reference remains readable.                                                                                              |
| Switch sessions, restart, resume, or fork                                                            | The correct draft references and submitted snapshots remain usable.                                                                |
| Request explicit cleanup while snapshots remain referenced                                           | Added snapshots and recoverable contents survive; only proven-unused capture or staging data is reclaimed.                         |
| Submit text/files and images through normal, steer, and follow-up paths                              | Text/files remain readable on demand; image content and message association are preserved.                                         |
| Another input transformation has already supplied images or changed text                             | Attachment delivery composes with that result through native dispatch.                                                             |
| A source is unreadable, a write fails, or a preview cannot render                                    | The error is visible; existing draft content and retained assets remain recoverable.                                               |
| A session changes or the host clears the editor during pending work or failed submission             | No unrelated draft is overwritten and required contents remain recoverable.                                                        |
| Select part or all of the draft, then load, refresh, resize, or fail an image preview                | Both views retain the source range and anchor; the next replacement edits that range and undoes once.                              |
| Navigate, accept, or cancel attachment management while text is selected                             | Only the focused native UI handles its keys; no background movement, submission, or duplicate edit occurs.                         |
| Close a text preview or cancel management without choosing a draft action                            | The same draft, selection, attachment membership, and editor focus return.                                                         |
| Restore or remove while another native widget and a completion provider are installed                | The native UI remains usable; one editor transaction changes membership and text as specified.                                     |
| Compare terminal text paste with a remapped native clipboard action using actual copied files/images | Only the native metadata route establishes image/file capture; previews identify the captured snapshots.                           |
| Paste 4,999, 5,000, and 5,001 UTF-16 code units                                                      | The first is inline; the other two are text attachments.                                                                           |
| Paste equivalent boundary cases containing emoji or supplementary characters                         | Routing follows UTF-16 length, independently of displayed character count or byte length.                                          |
| Paste short text with many lines, or small text into a long draft                                    | The text remains inline.                                                                                                           |
| Deliver one bracketed paste in several input chunks                                                  | One complete payload is classified and inserted once.                                                                              |
| Use terminal paste, clipboard shortcuts, right-click paste, and extension paste                      | The same payload follows the same policy through each actual host route.                                                           |
| Use Paste Inline or Attach Text in prose and code                                                    | The explicit action wins, and contents are preserved.                                                                              |
| Type a long draft or replace it through native text APIs                                             | The resulting draft remains inline text.                                                                                           |
| Copy files with spaces or Unicode names and an accompanying icon image                               | File identity wins; the selected files reach attachment handling.                                                                  |
| Paste an image or receive a native clipboard error                                                   | The image reaches attachment handling; an error is visible and leaves the draft recoverable.                                       |
| Snapshot preparation or a write fails                                                                | No content is silently discarded or rerouted; the user receives a recoverable failure.                                             |
| Remap the native clipboard action, clear its bindings, or explicitly repeat its default              | Effective native bindings control clipboard paste; the extra raw Cmd+V alias is suppressed in both editors.                        |
| Deliver bracketed text after suppressing the raw Cmd+V alias                                         | The supplied text still follows paste policy once; no separate clipboard read adds content.                                        |
| Bind a native action or accepted extension shortcut to Cmd+V                                         | Its native owner acts once; paste adds no draft content or attachment.                                                             |
| Paste while an overlay or another focused component owns the input                                   | Input follows that component's native behavior; the background draft is unchanged.                                                 |
| Deliver a path as terminal text while the clipboard contains a file or image                         | Only the delivered text is classified; unrelated clipboard metadata does not become an attachment.                                 |
| Run the native clipboard action with file, image, and text clipboard data separately                 | Native metadata precedence and the corresponding attachment or inline result are verified independently of terminal text paste.    |
| Copy an existing image file as a file item, then copy its path characters as text                    | The native file item creates an image attachment and preview; the text item stays literal under the text-size policy.              |
| Deliver path text through terminal or extension paste while native metadata names that same file     | Only the supplied text is inserted; matching clipboard metadata does not authorize a separate file capture.                        |
| Resume a draft or session that already names a retained snapshot                                     | The existing path and captured bytes remain usable without rewriting the reference.                                                |
| Recover data retained by an earlier paste installation                                               | Saved files and requesting-draft metadata remain readable and attachable; no recovery data is discarded.                           |
| Paste captured bytes while explicit attachment commands have independent overrides                   | The internal capture operation completes without dispatching a user command; native command invocations retain their own dispatch. |

- Run real Ghostty/macOS checks for image graphics, attachment placement, keyboard access to preview/restoration, clipboard images, and fullscreen coexistence with native widgets. Include keyboard select-all and partial selection through redraws, view changes, and image updates, then type and undo to verify the preserved range. Record clipboard routes separately from terminal text and keep unobserved physical routes pending.
- Verify pasted and explicit capture, combined text/membership undo, and submission recovery through the public host. Assert the final message and retained bytes as well as successful storage. Attachment-producing paste must not send an attachment command as a user message.
- Inspect native hyperlink cells and activate preview links through fullscreen Pi, substituting only the OS process-launch boundary. Check that full-resolution snapshot bytes and draft selection remain unchanged. Verify generated clipboard and recovery filenames retain format extensions. Manually verify the physical thumbnail click, filename fallback, and composer reference opening in Ghostty with the system's associated application, including an image captured from the clipboard; automated checks do not establish pixel rendering or app launch success.
- Run real Ghostty/macOS checks for clipboard formats, shortcut forwarding, right-click paste, and copied-file precedence with the native editor and composer. Record effective Pi and terminal bindings, the physical gesture, observed route, and result. Include the actual clipboard-manager gesture, a copied image file with spaces in its name, image-only clipboard data, and genuine path text. Menu or Cmd+V text paste alone does not establish native image/file delivery; verify the effective native clipboard action separately. Inspect metadata at the native paste invocation when diagnosing the route; a later clipboard read cannot establish what an earlier gesture supplied. Keep unobserved routes pending.

## Out of Scope

Draft text, selection, editing bindings, and undo history belong to the active editor. Inline skill completion and expansion belong to the skill-reference package.

## Further Notes

The [package README](../../packages/pi-attachments/README.md) documents paste and attachment actions, native clipboard use, previews, recovery, and cleanup. Work and acceptance evidence are tracked in the [composition tickets](../../.scratch/prompt-composition/issues/), [package merge ticket](../../.scratch/attachment-paste/issues/01-merge-paste-and-attachment-capture.md), [native clipboard ticket](../../.scratch/composer-keyboard/issues/06-preserve-configured-clipboard-routes.md), [clipboard-manager workflow ticket](../../.scratch/clipboard-paste/issues/01-document-and-verify-native-clipboard-paste.md), [preview-selection ticket](../../.scratch/composer-keyboard/issues/07-preserve-selection-through-native-ui.md), and [image-opening tickets](../../.scratch/image-opening/issues/).

See the [glossary](../../GLOSSARY.md) and [composer specification](pi-composer.md).

Native evidence and testing prior art: [extension UI, paste, input, and submission contracts](https://github.com/earendil-works/pi/blob/6fb2e7815/packages/coding-agent/src/core/extensions/types.ts), [image and terminal exports](https://github.com/earendil-works/pi/blob/6fb2e7815/packages/tui/src/index.ts), [clipboard file-precedence tests](https://github.com/earendil-works/pi/blob/6fb2e7815/packages/coding-agent/test/clipboard-paste-file-paths.test.ts), [editor paste tests](https://github.com/earendil-works/pi/blob/6fb2e7815/packages/tui/test/editor.test.ts), and [input transformation tests](https://github.com/earendil-works/pi/blob/6fb2e7815/packages/coding-agent/test/extensions-input-event.test.ts).

Ghostty 1.3.1's native paste action [converts clipboard file URLs to shell-escaped path text](https://github.com/ghostty-org/ghostty/blob/v1.3.1/macos/Sources/Helpers/Extensions/NSPasteboard%2BExtension.swift). That text cannot establish the original clipboard type inside Pi. PastePal documents [file clips and separate original/plain-text paste actions](https://docs.indiegoodies.com/pastepal/Mac/quick-start); those actions require route-specific terminal verification.

### Architecture decisions

- [Preserve Pi extension contracts](../adr/0001-preserve-pi-extension-contracts.md)
- [One editor owns draft transactions](../adr/0002-one-editor-owns-draft-transactions.md)
- [Independent composition extensions](../adr/0003-independent-composition-extensions.md)
- [Large pastes become readable attachments](../adr/0006-large-pastes-as-readable-attachments.md)
- [Retain attachment snapshots](../adr/0007-pi-attachments-retain-snapshots.md)
- [Resolve native editing actions before composer shortcuts](../adr/0009-pi-composer-native-editing-actions.md)
- [Make terminal keybinding setup explicit and reversible](../adr/0010-explicit-terminal-keybinding-setup.md)
- [Preserve native clipboard identity](../adr/0011-preserve-native-clipboard-identity.md)
