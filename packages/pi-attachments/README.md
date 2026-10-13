# pi-attachments

Paste handling and preserved text, file, and image attachments for the [pi coding agent](https://pi.dev).

Paste a single file path to capture its contents, paste other small text inline, or capture large text and native clipboard files or images as attachments. Explicit attachment commands use the same capture operation and insert a readable Markdown attachment reference. A widget above the editor lists the draft's attachments. Removing a reference from the draft removes its membership while keeping the saved contents.

See the [specification](../../docs/specs/pi-attachments.md), its [architecture decisions](../../docs/specs/pi-attachments.md#architecture-decisions), and the [package overview](../../README.md#packages).

## Install

From the repository root:

```bash
pi install ./packages/pi-attachments
```

Requires Pi and `@earendil-works/pi-tui` `^1.0.2`, which supplies the public copied-file clipboard API. The package works with Pi's native editor and `pi-composer`. Load the composer before editor decorators. Later decorators must delegate to the existing factory and preserve its public methods and callback assignments.

If `pi-paste` is already installed, remove its package entry with `pi remove ./packages/pi-paste` from the repository root before reloading Pi. Paste handling is included here. Existing attachment snapshots and paste recovery files keep their paths.

## Paste

For copied files and images, invoke **Pi's configured clipboard action** (`Ctrl+V` by default on macOS). With PastePal, choose **Copy** for the selected clip, return focus to Pi, then use that shortcut. Use Pi's native shortcut information if it is remapped. The handler reads copied-file identity first, image bytes second, and text last; copied files take precedence over accompanying icon images.

**Ghostty's Cmd+V remains ordinary terminal paste.** When it delivers one readable file path, the package captures that file as an attachment. Image-only clipboard data uses Pi's native clipboard action. PastePal's Paste and Copy actions can supply different content; the physical clipboard-manager workflows are tracked in the [acceptance ticket](../../.scratch/clipboard-paste/issues/01-document-and-verify-native-clipboard-paste.md).

A complete text paste is first interpreted as one file path. Absolute paths, bare filenames and other relative paths, `~/` paths, local `file:` URLs, whole-path quotes, and terminal-escaped paths are supported. Relative paths use Pi's requesting working directory. Spaces within a filename are preserved; space- or newline-delimited lists are not split into files. Missing or unreadable files, directories, and other unsuccessful matches silently continue through the text policy with the original payload.

Other text below 5,000 UTF-16 code units appears inline. Text at or above 5,000 units becomes a readable `paste.txt` attachment. The cutoff measures each complete decoded paste before editor formatting, independently of line count or draft length. Fragmented bracketed input is assembled before classification.

Terminal bracketed paste, `ui.pasteToEditor(text)`, and native clipboard text use the same policy. Only the pasted payload matters, including when the caret is inside code or a link destination. Terminal and extension paste do not reread clipboard metadata. Ordinary typing, direct insertion, `ui.setEditorText()`, and restored drafts remain inline.

Paste Inline reads plain clipboard text and bypasses file recognition and size conversion. Use it to insert a literal path. Attach Text explicitly captures text, including short text and path characters. Both work in prose and code. Inline insertion retains the active editor's whitespace behavior: native Pi expands tabs to four spaces and normalizes line endings to LF; the composer preserves tabs. Snapshot files preserve the captured text, including tabs and original line endings.

Native listeners, extension shortcuts, clipboard handlers, mouse handlers, and focused components retain their input. The package supplies a clipboard handler only when one is absent; earlier and later custom handlers keep their chosen insertion behavior. A raw Cmd+V is an alias only when the terminal delivers it and no effective native action or accepted extension shortcut owns it. Any explicit override of `app.clipboard.pasteImage`, including an empty binding list or a repeated default, suppresses that alias. Fullscreen right-click reads the clipboard only in the focused main editor; terminal-delivered text uses the text route.

## Actions

| Action                                  | Command                | Shortcut     |
| --------------------------------------- | ---------------------- | ------------ |
| Open the text attachment dialog         | `/attach-text`         | `Ctrl+Alt+T` |
| Attach command text                     | `/attach-text <text>`  |              |
| Choose a file path                      | `/attach-file`         | `Ctrl+Alt+F` |
| Attach files directly                   | `/attach-file <path>`  |              |
| Manage draft attachments                | `/attachments`         | `Ctrl+Alt+A` |
| Paste clipboard text without conversion | `/paste-inline`        | `Ctrl+Alt+V` |
| Retry retained paste captures           | `/paste-recover`       |              |
| Retry retained attachment captures      | `/attachments-recover` |              |
| Clean unused capture data               | `/attachments-cleanup` |              |

Use shortcuts while composing to keep the existing draft. The text dialog preserves leading whitespace and final newlines; native command submission trims its input. The file command accepts one path per line, so spaces within a path do not need quotes. Relative paths resolve against the session's working directory. For example:

```text
/attach-file /path/first file.txt
/path/第二文件.png
```

Pasted attachments and explicit actions use the same capture operation. Every file in a copied or selected set is captured before its references enter the draft as one edit. Spaces and Unicode in names are preserved, and files with the same name are stored separately. With `pi-composer`, one undo restores the selection and removes the whole set's membership.

Attachments are saved under `pi-attachments/` in Pi's agent directory before their references enter the draft. Editing or deleting the source file does not change the snapshot. Normal `@file` references continue to identify the working file. Text and file attachment references remain readable on demand. A draft containing only attachment references can be submitted normally.

To keep only an attachment's path, edit its Markdown reference down to the bare destination. This removes membership, preview, and submitted image content while leaving the saved snapshot path as ordinary text. It does not restore the original source path or capture the file again.

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

Unsuccessful text-path recognition quietly falls back to text paste. Clipboard metadata reads, explicit file reads, and snapshot write failures retain the existing error and recovery behavior. Clipboard errors remain errors instead of falling through to another content type. Failed saves from the explicit text dialog reopen that dialog with its contents. Failed pasted-text, image, or file saves offer **Retry save** for the whole set, using the already captured bytes even if the sources have changed or disappeared. Unsupported clipboard image bytes are retained with an error and are not inserted.

If one file cannot be read, captured members remain available in a partial recovery file that identifies the missing files. `/attachments-recover` retries retained missing reads and failed writes using the captured bytes for completed members; `/paste-recover` is an alias for the same recovery action. It saves recovery files without inserting into the current draft. Requests also retry when a session starts or a response settles.

Text changes, terminal activity, another submission, or session replacement during preparation keep the result out of the newer draft. Text changes are observed through the effective editor's native callback, including changes that return to the original text. Each action saves a `.draft.md` recovery file beside its first snapshot, containing the requesting session ID, session file, cwd, original draft, and attachment references. A notification gives its location when the requesting session is still active. The recovery file remains readable after a session switch.

Later editor factory decorators remain compatible when they delegate to the observed editor and preserve callback assignments. A replacement that bypasses observation, or an editor installation or callback change during preparation, saves a recovery file instead of inserting into the current draft.

Image submissions save a readable `request-*/request.draft.md` under the same storage directory before delivery. The file records the requesting session, submission mode, and draft. Incoming images from other input handlers are preserved beside it as snapshot references. These recovery copies also survive native authentication or provider failures after the editor clears; they do not imply successful delivery. Copy their attachment references back into the draft to reuse the captured images.

Image read, conversion, and recovery-write errors stop that submission and report the available recovery location. Preview errors leave the reference and bytes intact. Pending preparation never restores text over a newer draft or sends into a replacement session. When storage fails, captures and incoming image bytes remain in package-owned process memory across cwd changes, session replacement, and reload. `/attachments-recover` or `/paste-recover` retries them from any live session. A native checkpoint is also attempted for image requests, but a failed append is not a durable copy. Contents held only in memory are lost if Pi exits before a write succeeds.

Existing snapshots, attachment references, and saved session records keep their paths. Pending paste captures from an earlier extension instance remain recoverable after reload. Earlier `pi-paste/paste-*/` captures and `request.md` recovery records remain readable in Pi's agent directory; use `/attach-file` with a recovered file when ready to include it in a draft. Recovery never inserts retained contents into the active editor automatically.

## Cleanup

Run `/attachments-cleanup` to reclaim proven-unused attachment staging. The command appears in native slash-command completion and reports the number of files and bytes removed, with any deletion failures. Cleanup is explicit; storage does not expire automatically.

Every snapshot added to a draft stays readable for native and composer undo, saved drafts, submissions, and forks. All readable or partial recovery records and their snapshots remain retained, including after a later successful retry. Removing a reference or clearing the editor changes no storage eligibility.

An image-request preparation can fail while writing incoming images, before it attempts to publish a recovery record. Once a complete retry saves those images and its recovery record, attachment-owned bookkeeping marks the earlier unpublished capture files as redundant. Cleanup can reclaim those bytes, including after session replacement or restart. It verifies the captured bytes and their replacement using checksums and retains pending writes, unclassified files, symlinks, and anything with uncertain eligibility. An interruption before eligibility is recorded leaves the capture retained.

If cleanup reports a filesystem failure, the files it could not remove remain available for another cleanup attempt after the storage problem is fixed. Snapshots and recovery records remain protected throughout partial cleanup.
