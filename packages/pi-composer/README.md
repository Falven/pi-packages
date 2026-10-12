# pi-composer

A Markdown composer for the [pi coding agent](https://pi.dev).

Edit paragraphs, headings, bold, italic, strikethrough, and links with Pi's native styles. Cmd+Shift+M switches between formatted and source views of the same Markdown draft, preserving selection and grouped undo/redo. Native text replacement and insertion reach that draft and history. Movement and deletion preserve graphemes, including combining characters, emoji, and wide text across wrapped lines.

The composer uses Pi's application actions, commands, input transformations, and submission path. Undo retains source cleared during submission, including failed submissions.

Each native session autosaves its Markdown draft, including file, skill, and attachment references. Edits save after 150 ms of idle time and flush before switching sessions or shutting down. Reopening a saved session restores its draft, including an explicitly cleared draft. Undo/redo stays in memory, isolated by session, across working-directory changes and resource reloads. Restarting Pi begins with fresh history.

Recovery files live in `pi-composer/drafts` inside Pi's agent directory. `/composer-recover` offers cleared drafts, drafts from unsaved sessions, and drafts retained after failed saves. It restores the selected text as an undoable edit in the current session and keeps the draft it replaces recoverable. Text autosave respects `--no-session` and keeps those drafts in memory.

Save failures report an error and preserve the current text and the last usable checkpoint. A failed save cancels a session switch or fork. Complete replacement files remain available for recovery if their final rename fails. If shutdown cannot save either copy, the pending draft stays with its process-lifetime history and is retried on resume. `/composer-recover` can also retrieve and save it from another session. Contents held only in memory are lost if Pi exits before a write succeeds.

## Keys

| Key                       | Action                                 |
| ------------------------- | -------------------------------------- |
| Arrow keys                | Move by grapheme or visual line        |
| Option+Left/Right         | Move by word                           |
| Cmd+Left/Right            | Move to the start/end of the line      |
| Cmd+Up/Down               | Move to the start/end of the document  |
| Shift with a movement key | Extend the selection                   |
| Cmd+A                     | Select the whole draft                 |
| Cmd+C / Cmd+X             | Copy / cut selected Markdown           |
| Cmd+V                     | Paste text through native paste policy |
| Backspace/Delete          | Delete a grapheme or the selection     |
| Cmd+Z / Cmd+Shift+Z       | Undo / redo                            |
| Cmd+Shift+M               | Toggle formatted / source view         |
| Enter / Cmd+Enter         | Submit                                 |
| Shift+Enter               | Insert a newline                       |
| Option+Enter              | Native follow-up submission            |

Pi's configured movement keys remain effective. Native extension and application shortcuts retain their priority. Continuous typing and deletion group until movement, another kind of edit, or a pause of more than 500 ms. Native replacements and pastes each form one undoable edit. A fresh edit after undo discards the old redo branch.

Copy and cut use Pi's clipboard support. A cut deletes only after copying succeeds and its original selection is still current. Command+V reads Pi's native text clipboard and enters `pasteToEditor`, preserving installed paste decorators.

If a clipboard read finishes after its draft or selection changes, or paste dispatch fails, the original session, cwd, draft, selection offsets, and clipboard text are saved as JSON under `pi-composer/clipboard-recovery/<session-id>/` in Pi's agent directory. The recovery path is reported in Pi, or on stderr after that session closes. Failed writes retain the payload in process memory across session changes and reloads. Starting a session or running `/composer-recover` retries those writes and reports the saved files without inserting into the current draft.

## Load

From the repository root:

```bash
pi install ./packages/pi-composer
```

See the [specification](../../docs/specs/pi-composer.md), [ADRs](../../docs/specs/pi-composer.md#architecture-decisions), and [library integration notes](../../docs/pi-composer-library-integration.md). The [shared architecture](../../docs/architecture.md) defines cooperation with the other extensions.
