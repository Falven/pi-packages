# pi-attachments

Preserved text, file, and image attachments for the [pi coding agent](https://pi.dev).

Use native commands or shortcuts to capture contents as a file and insert a readable Markdown attachment reference. A widget above the editor lists the draft's attachments. Removing a reference from the draft removes its membership while keeping the saved contents.

See the [specification](../../docs/specs/pi-attachments.md), its [architecture decisions](../../docs/specs/pi-attachments.md#architecture-decisions), and the [package overview](../../README.md#packages).

## Install

From the repository root:

```bash
pi install ./packages/pi-attachments
```

## Attach

| Action                          | Command                | Shortcut     |
| ------------------------------- | ---------------------- | ------------ |
| Open the text attachment dialog | `/attach-text`         | `Ctrl+Alt+T` |
| Attach command text             | `/attach-text <text>`  |              |
| Choose a file path              | `/attach-file`         | `Ctrl+Alt+F` |
| Attach files directly           | `/attach-file <path>`  |              |
| Manage draft attachments        | `/attachments`         | `Ctrl+Alt+A` |
| Clean unused capture data       | `/attachments-cleanup` |              |

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

Click an image's filename, thumbnail, or text fallback to open the retained full-resolution file in the system's associated application. This uses Pi's native hyperlinks when supported, without terminal configuration changes. In fullscreen Ghostty on macOS, **Shift+Cmd+click** also uses the terminal's native link handling; use that gesture for the attachment reference inside `pi-composer`, where ordinary clicks edit text. Saving changes from the external application can modify the retained attachment; save elsewhere to keep the captured contents intact.

Generated clipboard and recovery image filenames include their format extension, such as `.png`, so the system can choose the image application. Copied files retain their names and existing snapshots keep their paths. Paste an older extensionless clipboard image again to create a snapshot with a format extension.

Images are delivered as native image content on Enter, steering, and follow-up submissions. Delivery follows the submitted references and preserves images supplied by earlier input handlers. BMP conversion, preview thumbnails, and resizing for the current model leave the original snapshot unchanged. References stay in queued text so native dequeue and resubmission can regenerate the images.

## Recovery

Read and write errors leave the main draft intact. Failed text saves reopen the text dialog with its contents. Failed file saves offer **Retry save** for the whole set, using the already captured bytes even if the sources have changed or disappeared.

If one file cannot be read, captured members remain available in a partial recovery file that identifies the missing files. `/attachments-recover` retries missing reads and failed writes using the captured bytes for completed members. It saves recovery files without inserting into the current draft. Requests also retry when a session starts or a response settles.

Text changes, terminal activity, another submission, or session replacement during preparation keep the result out of the newer draft. Text changes are observed through the effective editor's native callback, including changes that return to the original text. Each action saves a `.draft.md` recovery file beside its first snapshot, containing the requesting session ID, session file, cwd, original draft, and attachment references. A notification gives its location when the requesting session is still active. The recovery file remains readable after a session switch.

Later editor factory decorators remain compatible when they delegate to the observed editor and preserve callback assignments. A replacement that bypasses observation, or an editor installation or callback change during preparation, saves a recovery file instead of inserting into the current draft.

Image submissions save a readable `request-*/request.draft.md` under the same storage directory before delivery. The file records the requesting session, submission mode, and draft. Incoming images from other input handlers are preserved beside it as snapshot references. These recovery copies also survive native authentication or provider failures after the editor clears; they do not imply successful delivery. Copy their attachment references back into the draft to reuse the captured images.

Image read, conversion, and recovery-write errors stop that submission and report the available recovery location. Preview errors leave the reference and bytes intact. Pending preparation never restores text over a newer draft or sends into a replacement session. When storage fails, captures and incoming image bytes remain in package-owned process memory across cwd changes, session replacement, and reload. `/attachments-recover` retries them from any live session. A native checkpoint is also attempted for image requests, but a failed append is not a durable copy. Contents held only in memory are lost if Pi exits before a write succeeds.

## Cleanup

Run `/attachments-cleanup` to reclaim proven-unused attachment staging. The command appears in native slash-command completion and reports the number of files and bytes removed, with any deletion failures. Cleanup is explicit; storage does not expire automatically.

Every snapshot added to a draft stays readable for native and composer undo, saved drafts, submissions, and forks. All readable or partial recovery records and their snapshots remain retained, including after a later successful retry. Removing a reference or clearing the editor changes no storage eligibility.

An image-request preparation can fail while writing incoming images, before it attempts to publish a recovery record. Once a complete retry saves those images and its recovery record, attachment-owned bookkeeping marks the earlier unpublished capture files as redundant. Cleanup can reclaim those bytes, including after session replacement or restart. It verifies the captured bytes and their replacement using checksums and retains pending writes, unclassified files, symlinks, and anything with uncertain eligibility. An interruption before eligibility is recorded leaves the capture retained.

If cleanup reports a filesystem failure, the files it could not remove remain available for another cleanup attempt after the storage problem is fixed. Snapshots and recovery records remain protected throughout partial cleanup.
