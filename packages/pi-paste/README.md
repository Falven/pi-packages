# pi-paste

A text paste policy extension for the [pi coding agent](https://pi.dev).

Text below 5,000 UTF-16 code units appears inline. Text at or above 5,000 units becomes a readable attachment through `pi-attachments`. The cutoff measures each decoded paste before editor formatting, independently of line count, draft length, or Markdown context.

See the [specification](../../docs/specs/pi-paste.md), [ADRs](../../docs/specs/pi-paste.md#architecture-decisions), and [shared architecture](../../docs/architecture.md).

## Install

From the repository root:

```bash
pi install ./packages/pi-attachments
pi install ./packages/pi-paste
```

The package works with Pi's native editor and `pi-composer`. Load the composer before editor decorators. `pi-paste` and `pi-attachments` compose in either order; later editor decorators must delegate to the existing factory and preserve its public methods and callback assignments.

## Paste

Terminal bracketed paste, the configured native clipboard shortcut, fullscreen right-click in the focused main editor, and `ui.pasteToEditor()` use the same cutoff. Fragmented bracketed input is assembled before classification. Ordinary typing, direct text insertion, and `ui.setEditorText()` remain inline.

| Action                                  | Command          | Shortcut     |
| --------------------------------------- | ---------------- | ------------ |
| Paste clipboard text inline at any size | `/paste-inline`  | `Ctrl+Alt+V` |
| Open the text attachment dialog         | `/attach-text`   | `Ctrl+Alt+T` |
| Save text held after a staging failure  | `/paste-recover` |              |

Attach Text is the existing `pi-attachments` action and accepts short text too. Use shortcuts while composing to preserve the existing draft and selection. Paste Inline reads plain clipboard text. Both explicit actions work in prose and code.

Inline text retains the active editor's whitespace behavior: native Pi expands tabs to four spaces and normalizes line endings to LF; the composer preserves tabs. Attachment files preserve the captured text, including tabs and original line endings.

Native terminal listeners, extension shortcuts, earlier clipboard handlers, mouse handlers, and autocomplete updates retain their priority. An earlier custom clipboard handler keeps control of that shortcut. Right-click handling stays within the main editor and leaves other native input UIs in control.

## Handoff and recovery

Before attaching, the package saves `text.txt` and a readable `request.md` under `pi-paste/paste-*/` in Pi's agent directory. The request records the original session and draft. The ordinary `/attach-file` command copies a temporary source named `paste.txt`; dispatch never replaces the draft with command text. `pi-attachments` owns the resulting snapshot and attachment reference.

The temporary source is a file link to the preserved text. Changes to the requesting text, selection, editor, focus, or session retire that link. This also prevents a command deferred by Pi from attaching to a later draft. A deferred command can report that its source is unavailable; the adjacent `text.txt` and `request.md` remain readable. The preserved files are retained because a native command send supplies no completion acknowledgement.

Clipboard errors leave the draft unchanged. Late results preserve the requesting draft and payload in those recovery files. Snapshot write failures use the attachment command's native retry UI.

A failed staging write retains the exact text and original session/draft metadata in memory for the current Pi process and agent directory. This survives session switches, extension reloads, and working-directory changes, including failures arriving after the requesting session closes. Run `/paste-recover` once storage is writable to save the retained payloads and their original metadata without changing the active editor. Use `/attach-file <path-to-text.txt>` when ready to attach recovered text. If Pi exits while storage remains unwritable, payloads held only in memory are lost.
