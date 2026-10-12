# pi-attachments

Preserved text and file attachments for the [pi coding agent](https://pi.dev).

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
| Attach a file directly          | `/attach-file <path>` |              |

Use shortcuts while composing to keep the existing draft. The text dialog preserves leading whitespace and final newlines; native command submission trims its input. The file command treats everything after the command name as the path, so paths with spaces do not need quotes. Relative paths resolve against the session's working directory.

Attachments are saved under `pi-attachments/` in Pi's agent directory before their references enter the draft. Editing or deleting the source file does not change the snapshot. Normal `@file` references continue to identify the working file. On submission, attachment references remain text; Pi can read the saved files on demand. A draft containing only attachment references can be submitted normally.

## Recovery

Read and write errors leave the main draft intact. Failed text saves reopen the text dialog with its contents. Failed file saves offer **Retry save**, using the already captured bytes even if the source has changed or disappeared.

Text changes, terminal activity, another submission, or session replacement during preparation keep the result out of the newer draft. Text changes are observed through the effective editor's native callback, including changes that return to the original text. The saved snapshot gets an adjacent `.draft.md` recovery file containing the requesting session ID, original draft, and attachment reference. A notification gives its location when the requesting session is still active. The recovery file remains readable after a session switch.

If another extension replaces the editor factory after this package installs its observer, attachment actions save recovery files instead of inserting into an unverified draft. The replacement editor stays active.
