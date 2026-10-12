# pi-composer

A Markdown source composer for the [pi coding agent](https://pi.dev).

Edit one inline Markdown draft with keyboard selection and grouped undo/redo. Native text replacement and insertion reach the same draft and history. Movement and deletion preserve graphemes, including combining characters, emoji, and wide text across wrapped lines.

The composer uses Pi's application actions, commands, input transformations, and submission path. Undo retains source cleared during submission, including failed submissions.

## Keys

| Key                       | Action                                   |
| ------------------------- | ---------------------------------------- |
| Arrow keys                | Move by grapheme or visual line          |
| Option+Left/Right         | Move by word                             |
| Cmd+Left/Right            | Move to the start/end of the source line |
| Cmd+Up/Down               | Move to the start/end of the document    |
| Shift with a movement key | Extend the selection                     |
| Cmd+A                     | Select the whole draft                   |
| Backspace/Delete          | Delete a grapheme or the selection       |
| Cmd+Z / Cmd+Shift+Z       | Undo / redo                              |
| Enter / Cmd+Enter         | Submit                                   |
| Shift+Enter               | Insert a newline                         |
| Option+Enter              | Native follow-up submission              |

Pi's configured movement keys remain effective. Native extension and application shortcuts retain their priority. Continuous typing and deletion group until movement, another kind of edit, or a pause of more than 500 ms. Native replacements and pastes each form one undoable edit. A fresh edit after undo discards the old redo branch.

## Load

From the repository root:

```bash
pi install ./packages/pi-composer
```

See the [specification](../../docs/specs/pi-composer.md), [ADRs](../../docs/specs/pi-composer.md#architecture-decisions), and [library integration notes](../../docs/pi-composer-library-integration.md). The [shared architecture](../../docs/architecture.md) defines cooperation with the other extensions.
