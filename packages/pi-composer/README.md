# pi-composer

A Markdown composer for the [pi coding agent](https://pi.dev).

Edit paragraphs, headings, emphasis, strikethrough, links, quotes, lists, tasks, rules, and inline or fenced code with Pi's native styles and highlighting. Cmd+Shift+M switches between formatted and source views of the same Markdown draft, preserving selection and grouped undo/redo. Native text replacement and insertion reach that draft and history. Movement and deletion preserve graphemes, including combining characters, emoji, and wide text across wrapped lines.

Deletion uses the underlying Markdown in both views, including hidden syntax. Backspace after `**bold**` leaves `**bold*`; word deletion follows Pi's ordinary punctuation and word boundaries. The remaining source renders immediately through Pi's Markdown parser, and repairing valid syntax restores its formatting. Undo and yank retain the actual source text.

In fullscreen mode, mouse dragging and keyboard selection address the same Markdown text. Wheel scrolling preserves the selection; editing brings the caret back into view. Resizing keeps the selection usable, and native widgets, overlays, and completion pickers retain their focus and mouse routing.

For a blinking caret, enable **Show hardware cursor** in Pi's `/settings`. The composer then uses the terminal cursor in both views, following the terminal's shape and blinking preferences. Disabling the setting restores the drawn caret. Selection highlighting remains visible in either mode.

Recognized URLs and Markdown link labels use Pi's native terminal hyperlinks. Formatted links open their destinations while source view retains literal Markdown. In fullscreen Ghostty on macOS, use **Shift+Cmd+click** to open a link; ordinary clicks and dragging still position the caret and select text. Hover feedback follows Ghostty's mouse-capture behavior. Copying and submitting preserve the Markdown text.

Absolute file links, including image attachment references, open in the system's associated application. Spaces, Unicode, and URL punctuation in captured filenames are encoded only for display links; the draft keeps its original path. Attachment links open the retained full-resolution file. Saving changes from the external application can modify that retained attachment.

The composer uses Pi's application actions, commands, input transformations, and submission path. Undo retains source cleared during submission, including failed submissions.

Native `@` path completion, command completion, provider updates, and custom pickers continue through Pi's existing interfaces. File and skill references remain editable text.

Each native session autosaves its Markdown draft, including file, skill, and attachment references. Edits save after 150 ms of idle time and flush before switching sessions or shutting down. Reopening a saved session restores its draft, including an explicitly cleared draft. Undo/redo stays in memory, isolated by session, across working-directory changes and resource reloads. Restarting Pi begins with fresh history.

Recovery files live in `pi-composer/drafts` inside Pi's agent directory. `/composer-recover` offers cleared drafts, drafts from unsaved sessions, and drafts retained after failed saves. It restores the selected text as an undoable edit in the current session and keeps the draft it replaces recoverable. Text autosave respects `--no-session` and keeps those drafts in memory.

Save failures report an error and preserve the current text and the last usable checkpoint. A failed save cancels a session switch or fork. Complete replacement files remain available for recovery if their final rename fails. If shutdown cannot save either copy, the pending draft stays with its process-lifetime history and is retried on resume. `/composer-recover` can also retrieve and save it from another session. Contents held only in memory are lost if Pi exits before a write succeeds.

## Keys

Keyboard editing follows Pi's effective bindings and native dispatch. Physical delivery depends on the terminal's bindings; the [terminal acceptance ticket](../../.scratch/composer-keybinds/issues/03-verify-keybindings-in-ghostty.md) records automated checks, successful user-reported keyboard tests, and remaining physical checks.

| Native action               | Default or useful delivered input               | Behavior                                                                                                            |
| --------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Character and word movement | Arrows; Option+Left/Right                       | Move by grapheme or word.                                                                                           |
| Line boundaries             | Home/Ctrl+A; End/Ctrl+E                         | Reach the current logical line's beginning/end.                                                                     |
| Vertical movement           | Up/Down                                         | Move by visual row; an extra press at the first/last row reaches its beginning/end. Preserve native prompt history. |
| Character deletion          | Backspace; forward Delete/Ctrl+D                | Remove the selection or a grapheme; retain native empty-editor exit.                                                |
| Word deletion               | Ctrl+W/Option+Backspace; Option+D/Option+Delete | Remove the selection or word in the requested direction.                                                            |
| Line deletion               | Ctrl+U/Ctrl+K                                   | Delete toward the logical line boundary; join lines when already at that boundary.                                  |
| Retained-text recovery      | Ctrl+Y; Option+Y                                | Yank the retained deletion; rotate the preceding yank.                                                              |
| Character jump              | Ctrl+]; Ctrl+Alt+]                              | Await a printable target and move to its next/previous occurrence.                                                  |
| Editor paging               | PageUp/PageDown when delivered to the editor    | Move by the visible editor page; preserve host-owned fullscreen viewport keys.                                      |
| Page selection              | Shift+PageUp/PageDown                           | Extend or contract the selection by one visible composer page.                                                      |
| Undo                        | Ctrl+-                                          | Undo the prior coherent edit.                                                                                       |
| Clipboard paste             | Ctrl+V                                          | Use the effective native clipboard handler.                                                                         |
| Submit/newline              | Enter; Shift+Enter/Ctrl+J                       | Submit prose or continue a list/code block; insert a newline.                                                       |
| Application actions         | Option+Enter; Option+Up/Down                    | Preserve native follow-up and other effective Pi behavior.                                                          |

On a Mac keyboard, Delete means backward deletion, named `backspace` in bindings. Ghostty's Cmd+Delete translation to Ctrl+U and Cmd+Left/Right translations to Ctrl+A/E can use native actions without new terminal rules. Pi's effective bindings control the received input.

| Composer shortcut                      | Configuration contract                                            |
| -------------------------------------- | ----------------------------------------------------------------- |
| Cmd+Left/Right                         | Line-start/end aliases, including Shift selection.                |
| Cmd+Up/Down                            | Fixed draft-start/end movement, including Shift selection.        |
| Cmd+C, Cmd+V, Cmd+Z, Cmd+Enter         | Copy, clipboard paste, undo, and explicit-submit aliases.         |
| Cmd+A, Cmd+X, Cmd+Shift+Z, Cmd+Shift+M | Fixed select-all, cut, redo, and formatted/source-view shortcuts. |

Any explicit Pi override, including an empty binding list, suppresses the aliases for that native action. Fixed composer actions have no configurable native action IDs. Both kinds of shortcut yield to effective native bindings and accepted extension shortcuts. Shift movement keeps the selection anchored. Native undo precedes in-editor completion; the picker handles its acceptance keys before ordinary contextual submission. `/hotkeys` lists native actions and registered extension shortcuts; direct composer aliases are documented here. These bindings do not import macOS text-field settings.

Page selection adds Shift to the effective `tui.editor.pageUp` and `tui.editor.pageDown` bindings. With the defaults, use Shift+Fn+Up/Down on a Mac keyboard. Remapping or clearing a page action changes its selection gestures; an action explicitly bound to the full shifted chord keeps its ordinary behavior. Selection retains its anchor and preferred display column across wrapped rows, redraws, and view changes. After a resize or preview refresh, the next gesture uses the current visible composer height.

Ghostty can consume Cmd+A, Cmd+Enter, and Cmd+Up/Down before Pi receives them. Cmd+C and Cmd+Z/Cmd+Shift+Z delivery can depend on terminal selection and undo state. Cmd+V may generate text paste instead of a raw key. The [testing contract](../../docs/specs/pi-composer.md#testing-decisions) distinguishes terminal delivery from editor behavior. Terminal settings change only through explicit, confirmed setup.

Continuous typing and character deletion group until movement, another kind of edit, or a pause of more than 500 ms. Word/line deletion, yank, yank-pop, native replacement, and paste each form one undoable edit. A fresh edit after undo discards the old redo branch.

Copy and cut use Pi's clipboard support. A cut deletes only after copying succeeds and its original selection is still current. Command+V invokes the same supplied handler as the effective native clipboard action. With `pi-attachments` loaded, that handler classifies copied files, images, and text before insertion. A custom handler retains its chosen insertion route. Terminal and public extension paste carry only their supplied text; suppressing the raw Cmd+V alias does not disable those routes.

If a clipboard result reaches the composer after its draft or selection changes, the original session, cwd, draft, selection offsets, and delivered text are saved as JSON under `pi-composer/clipboard-recovery/<session-id>/` in Pi's agent directory. This also covers delivery to a replacement composer after a session switch or reload. The recovery path is reported in Pi, or on stderr after that session closes. Failed writes retain the payload in process memory. Starting a session or running `/composer-recover` retries those writes without inserting into the current draft.

Pi's default clipboard handler returns text-read failures as empty results and delivers copied-file paths or temporary image paths as text. The composer cannot report errors or retain bytes that this handler does not expose, or guard delivery to an unrelated replacement editor. `pi-attachments` supplies metadata classification, read-error reporting, captured-content recovery, and stable snapshots.

## Ghostty keybinding setup

`/setup-keybinds <terminal> [remove]` reviews, installs, or removes persistent terminal keybindings. Ghostty is the supported terminal. Run `/setup-keybinds ghostty` from Pi inside Ghostty to review and install forwarding for Cmd+A, Cmd+Enter, Cmd+Up/Down, Cmd+Z/Shift+Z, and Shift+Fn+Up/Down. The command shows the target file and asks for confirmation after verification. It appends one marked block, leaving other settings and Pi keybindings intact. The forwarding stays active in other programs and after Pi exits.

Reload Ghostty configuration after installation or removal through its **Reload Configuration** action; the default shortcut is Cmd+Shift+Comma. `/setup-keybinds ghostty remove` reviews and removes the unmodified block while preserving unrelated later edits. Repeating either operation makes no write. An edited or incomplete block requires manual resolution. No backups are created.

Setup supports Ghostty 1.3.1 on local macOS with one regular, user-owned Application Support configuration (`config` or `config.ghostty`), no other default configuration files, no includes, and no extra Ghostty launch arguments. It requires `/usr/bin/python3` to verify that Pi and its same-user Ghostty ancestor use the same configuration context; macOS's root-owned `login` intermediary is supported. The macOS process query is an unstable platform interface; unavailable or mismatched verification leaves settings unchanged.

Installation and repeat verification require the native U.S. keyboard input source and layout (`com.apple.keylayout.US`), no modifier remapping, and no higher-priority physical bindings for the three letter shortcuts. Other or unknown layouts require manual setup. Removal remains available after layout, remap, or physical-binding changes. Files with ACL permissions are refused; ordinary owner, group, mode, and surrounding contents are preserved. Configuration verification does not observe the GUI's loaded state or physical shortcut delivery.

## Load

From the repository root:

```bash
pi install ./packages/pi-composer
```

See the [specification](../../docs/specs/pi-composer.md), its [architecture decisions](../../docs/specs/pi-composer.md#architecture-decisions), and the [package overview](../../README.md#packages).
