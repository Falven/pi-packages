# pi-composer

A Markdown composer for the [pi coding agent](https://pi.dev).

Edit paragraphs, headings, emphasis, strikethrough, links, quotes, lists, tasks, rules, and inline or fenced code with Pi's native styles and highlighting. Cmd+Shift+M switches between formatted and source views of the same Markdown draft, preserving selection and grouped undo/redo. Native text replacement and insertion reach that draft and history. Movement and deletion preserve graphemes, including combining characters, emoji, and wide text across wrapped lines.

In fullscreen mode, mouse dragging and keyboard selection address the same Markdown text. Wheel scrolling preserves the selection; editing brings the caret back into view. Resizing keeps the selection usable, and native widgets, overlays, and completion pickers retain their focus and mouse routing.

The composer uses Pi's application actions, commands, input transformations, and submission path. Undo retains source cleared during submission, including failed submissions.

Native `@` path completion, command completion, provider updates, and custom pickers continue through Pi's existing interfaces. File and skill references remain editable text.

Each native session autosaves its Markdown draft, including file, skill, and attachment references. Edits save after 150 ms of idle time and flush before switching sessions or shutting down. Reopening a saved session restores its draft, including an explicitly cleared draft. Undo/redo stays in memory, isolated by session, across working-directory changes and resource reloads. Restarting Pi begins with fresh history.

Recovery files live in `pi-composer/drafts` inside Pi's agent directory. `/composer-recover` offers cleared drafts, drafts from unsaved sessions, and drafts retained after failed saves. It restores the selected text as an undoable edit in the current session and keeps the draft it replaces recoverable. Text autosave respects `--no-session` and keeps those drafts in memory.

Save failures report an error and preserve the current text and the last usable checkpoint. A failed save cancels a session switch or fork. Complete replacement files remain available for recovery if their final rename fails. If shutdown cannot save either copy, the pending draft stays with its process-lifetime history and is retried on resume. `/composer-recover` can also retrieve and save it from another session. Contents held only in memory are lost if Pi exits before a write succeeds.

## Keys

**Keyboard revision pending implementation and acceptance.** The tables below define the required contract. Native word/line deletion, outer-row navigation, Cmd+Up/Down line movement, and complete binding precedence still need the corrections described in the [specification](../../docs/specs/pi-composer.md). Physical delivery remains subject to the terminal's effective bindings.

| Native action               | Default or useful delivered input               | Required behavior                                                                                                   |
| --------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Character and word movement | Arrows; Option+Left/Right                       | Move by grapheme or word.                                                                                           |
| Line boundaries             | Home/Ctrl+A; End/Ctrl+E                         | Reach the current logical line's beginning/end.                                                                     |
| Vertical movement           | Up/Down                                         | Move by visual row; an extra press at the first/last row reaches its beginning/end. Preserve native prompt history. |
| Character deletion          | Backspace; forward Delete/Ctrl+D                | Remove the selection or a grapheme; retain native empty-editor exit.                                                |
| Word deletion               | Ctrl+W/Option+Backspace; Option+D/Option+Delete | Remove the selection or word in the requested direction.                                                            |
| Line deletion               | Ctrl+U/Ctrl+K                                   | Delete toward the logical line boundary; join lines when already at that boundary.                                  |
| Retained-text recovery      | Ctrl+Y; Option+Y                                | Yank the retained deletion; rotate the preceding yank.                                                              |
| Undo                        | Ctrl+-                                          | Undo the prior coherent edit.                                                                                       |
| Clipboard paste             | Ctrl+V                                          | Use the effective native clipboard handler.                                                                         |
| Submit/newline              | Enter; Shift+Enter/Ctrl+J                       | Submit prose or continue a list/code block; insert a newline.                                                       |
| Application actions         | Option+Enter; Option+Up/Down                    | Preserve native follow-up and other effective Pi behavior.                                                          |

On a Mac keyboard, Delete means backward deletion, named `backspace` in bindings. Ghostty's Cmd+Delete translation to Ctrl+U and Cmd+Left/Right translations to Ctrl+A/E can use native actions without new terminal rules. Pi's effective bindings control the received input.

| Composer shortcut                      | Configuration contract                                            |
| -------------------------------------- | ----------------------------------------------------------------- |
| Cmd+Left/Up; Cmd+Right/Down            | Line-start/end aliases, including Shift selection.                |
| Cmd+C, Cmd+V, Cmd+Z, Cmd+Enter         | Copy, clipboard paste, undo, and explicit-submit aliases.         |
| Cmd+A, Cmd+X, Cmd+Shift+Z, Cmd+Shift+M | Fixed select-all, cut, redo, and formatted/source-view shortcuts. |

Any explicit Pi override, including an empty binding list, suppresses the aliases for that native action. Fixed composer actions have no configurable native action IDs. Both kinds of shortcut yield to effective native bindings and accepted extension shortcuts. Shift movement keeps the selection anchored. Native undo precedes in-editor completion; the picker handles its acceptance keys before ordinary contextual submission. `/hotkeys` lists native actions and registered extension shortcuts; direct composer aliases are documented here. These bindings do not import macOS text-field settings.

Ghostty can consume Cmd+A, Cmd+Enter, and Cmd+Up/Down before Pi receives them. Cmd+C and Cmd+Z/Cmd+Shift+Z delivery can depend on terminal selection and undo state. Cmd+V may generate text paste instead of a raw key. The [terminal acceptance procedure](../../docs/terminal-checks.md) records those cases separately from editor behavior. The package leaves terminal settings unchanged.

Continuous typing and deletion group until movement, another kind of edit, or a pause of more than 500 ms. Native replacements and pastes each form one undoable edit. A fresh edit after undo discards the old redo branch.

Copy and cut use Pi's clipboard support. A cut deletes only after copying succeeds and its original selection is still current. Standalone Command+V reads text and enters Pi's paste route. With `pi-paste` loaded, the effective clipboard handler classifies copied files, images, and text before insertion. Terminal text paste carries only its supplied text; suppressing the raw Cmd+V alias does not disable that route.

If a clipboard read finishes after its draft or selection changes, or paste dispatch fails, the original session, cwd, draft, selection offsets, and clipboard text are saved as JSON under `pi-composer/clipboard-recovery/<session-id>/` in Pi's agent directory. The recovery path is reported in Pi, or on stderr after that session closes. Failed writes retain the payload in process memory across session changes and reloads. Starting a session or running `/composer-recover` retries those writes and reports the saved files without inserting into the current draft.

## Load

From the repository root:

```bash
pi install ./packages/pi-composer
```

See the [specification](../../docs/specs/pi-composer.md), [ADRs](../../docs/specs/pi-composer.md#architecture-decisions), and [library integration notes](../../docs/pi-composer-library-integration.md). The [shared architecture](../../docs/architecture.md) defines cooperation with the other extensions.
