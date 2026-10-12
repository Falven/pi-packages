# pi-attachments

Preserved text, file, and image attachments for the [pi coding agent](https://pi.dev).

Use native commands or shortcuts to capture contents as a file and insert a readable Markdown attachment reference. A widget above the editor lists the draft's attachments. Removing a reference from the draft removes its membership while keeping the saved contents.

See the [specification](../../docs/specs/pi-attachments.md), [ADRs](../../docs/specs/pi-attachments.md#architecture-decisions), and [shared architecture](../../docs/architecture.md).

## Install

From the repository root:

```bash
pi install ./packages/pi-attachments
```

## Attach

| Action                          | Command               | Shortcut     |
| ------------------------------- | --------------------- | ------------ |
| Open the text attachment dialog | `/attach-text`        | `Ctrl+Alt+T` |
| Attach command text             | `/attach-text <text>` |              |
| Choose a file path              | `/attach-file`        | `Ctrl+Alt+F` |
| Attach files directly           | `/attach-file <path>` |              |
| Manage draft attachments        | `/attachments`        | `Ctrl+Alt+A` |

Use shortcuts while composing to keep the existing draft. The text dialog preserves leading whitespace and final newlines; native command submission trims its input. The file command accepts one path per line, so spaces within a path do not need quotes. Relative paths resolve against the session's working directory. For example:

```text
/attach-file /path/first file.txt
/path/第二文件.png
```

Every file in the set is captured before its references enter the draft as one edit. Spaces and Unicode in names are preserved, and files with the same name are stored separately. With `pi-composer`, one undo restores the selection and removes the whole set's membership.

Attachments are saved under `pi-attachments/` in Pi's agent directory before their references enter the draft. Editing or deleting the source file does not change the snapshot. Normal `@file` references continue to identify the working file. Text and file attachment references remain readable on demand. A draft containing only attachment references can be submitted normally.

## Text actions

Use `Ctrl+Alt+A` while composing to choose an attachment and an action. The attachment widget shows the shortcut; `/attachments` also appears in Pi's command list.

- **Preview text** opens a read-only, scrollable view of the captured UTF-8 text. The preview uses Pi's navigation and cancel bindings and leaves the draft and its selection intact.
- **Restore Inline** inserts the complete captured text at the caret or over the selection and removes that snapshot's references from the draft. It stays inline at any size, including inside code. The native editor expands tabs and normalizes line endings; pi-composer preserves tabs and normalizes line endings. Snapshot bytes stay unchanged.
- **Remove from draft** removes every reference to the chosen snapshot from this draft. Other attachments remain included.

With pi-composer, each restoration or removal is one undo/redo action, including membership and the original selection. Both actions retain the snapshot for history, other drafts, and submitted requests. Read and preview errors preserve the draft and retained contents. A pending action is cancelled if the requesting text, selection, editor, or session changes.

## Images

`/attach-file` recognizes PNG, JPEG, GIF, WebP, and BMP images from the captured bytes, including files with a different extension. Each image gets a small preview above the native editor or composer, using Pi's theme and image graphics. Terminals without image graphics show Pi's filename and dimensions fallback. Removing a reference removes its preview and draft membership while retaining the snapshot for undo and older requests.

Images are delivered as native image content on Enter, steering, and follow-up submissions. Delivery follows the submitted references and preserves images supplied by earlier input handlers. BMP conversion, preview thumbnails, and resizing for the current model leave the original snapshot unchanged. References stay in queued text so native dequeue and resubmission can regenerate the images.

## Recovery

Read and write errors leave the main draft intact. Failed text saves reopen the text dialog with its contents. Failed file saves offer **Retry save** for the whole set, using the already captured bytes even if the sources have changed or disappeared.

Text changes, terminal activity, another submission, or session replacement during preparation keep the result out of the newer draft. Text changes are observed through the effective editor's native callback, including changes that return to the original text. Each action saves a `.draft.md` recovery file beside its first snapshot, containing the requesting session ID, original draft, and all attachment references. A notification gives its location when the requesting session is still active. The recovery file remains readable after a session switch.

Later editor factory decorators remain compatible when they delegate to the observed editor and preserve callback assignments. A replacement that bypasses observation, or an editor installation or callback change during preparation, saves a recovery file instead of inserting into the current draft.

Image submissions save a readable `request-*/request.draft.md` under the same storage directory before delivery. The file records the requesting session, submission mode, and draft. Incoming images from other input handlers are preserved beside it as snapshot references. These recovery copies also survive native authentication or provider failures after the editor clears; they do not imply successful delivery. Copy their attachment references back into the draft to reuse the captured images.

Image read, conversion, and recovery-write errors stop that submission and report the available recovery location. Preview errors leave the reference and bytes intact. Pending preparation never restores text over a newer draft or sends into a replacement session. If recovery storage cannot be written, the request is checkpointed through Pi's native session entries when possible. That fallback remains in memory until Pi persists the session; a new session can remain memory-only until an assistant message exists.
