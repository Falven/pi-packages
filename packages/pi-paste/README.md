# pi-paste

A clipboard classification and text paste policy extension for the [pi coding agent](https://pi.dev).

Text below 5,000 UTF-16 code units appears inline. Text at or above 5,000 units becomes a readable attachment through `pi-attachments`. The cutoff measures each decoded paste before editor formatting, independently of line count, draft length, or Markdown context.

See the [specification](../../docs/specs/pi-paste.md), its [architecture decisions](../../docs/specs/pi-paste.md#architecture-decisions), and the [package overview](../../README.md#packages).

## Install

From the repository root:

```bash
pi install ./packages/pi-attachments
pi install ./packages/pi-paste
```

Requires Pi and `@earendil-works/pi-tui` `^1.0.2`, which supplies the public copied-file clipboard API. The package works with Pi's native editor and `pi-composer`. Load the composer before editor decorators. `pi-paste` and `pi-attachments` compose in either order; later editor decorators must delegate to the existing factory and preserve its public methods and callback assignments.

## Paste

The configured native clipboard shortcut, Command+V, and fullscreen right-click in the focused main editor read native copied-file identity first, then image bytes, then text. Copied files take precedence over accompanying icon images. Spaces and Unicode in file names and paths are preserved. A copied set is one attachment action; all snapshots are prepared before their references replace the selection together. Images use `pi-attachments` previews and normal, steer, and follow-up delivery.

The cutoff applies only to text. Terminal bracketed paste and `ui.pasteToEditor(text)` carry text without clipboard identity; path-like text stays text. Fragmented bracketed input is assembled before measuring its complete payload. Ordinary typing, direct text insertion, and `ui.setEditorText()` remain inline. A terminal gesture that sends bracketed text uses this text route.

| Action                                  | Command          | Shortcut     |
| --------------------------------------- | ---------------- | ------------ |
| Paste clipboard text inline at any size | `/paste-inline`  | `Ctrl+Alt+V` |
| Open the text attachment dialog         | `/attach-text`   | `Ctrl+Alt+T` |
| Save content held after a paste failure | `/paste-recover` |              |

Attach Text is the existing `pi-attachments` action and accepts short text too. Use shortcuts while composing to preserve the existing draft and selection. Paste Inline reads plain clipboard text. Both explicit actions work in prose and code.

Inline text retains the active editor's whitespace behavior: native Pi expands tabs to four spaces and normalizes line endings to LF; the composer preserves tabs. Attachment files preserve the captured text, including tabs and original line endings.

Native terminal listeners, extension shortcuts, clipboard handlers, mouse handlers, and autocomplete updates retain their priority. Command+V delegates to the supplied clipboard handler when no effective native binding claims that key. Any explicit override of `app.clipboard.pasteImage`, including an empty binding list or a repeated default, suppresses this extra alias. The package supplies its handler only when one is absent; earlier and later custom handlers keep their chosen insertion behavior. Right-click handling stays within the main editor and leaves other native input UIs in control. Composer's standalone clipboard and history behavior remain available without this package.

## Handoff and recovery

Before attaching, the package captures the bytes and saves a readable `request.md` under `pi-paste/paste-*/` in Pi's agent directory. The request records the original session, draft, captured paths, and original copied-file paths. Text is retained as `text.txt`; files retain their names in separate directories, and clipboard images use `clipboard-image` with their detected format extension, such as `.png`. The extension lets the system select the associated image application when opening a link. The ordinary `/attach-file` command receives all captured sources in one action; dispatch never replaces the draft with command text. `pi-attachments` owns the resulting snapshots and attachment references.

Temporary source links point to the preserved contents. Changes to the requesting text, selection, editor, focus, or session retire those links. This also prevents a command deferred by Pi from attaching to a later draft. A deferred command can report that its sources are unavailable; the captured files and `request.md` remain readable. The preserved files are retained because a native command send supplies no completion acknowledgement.

Clipboard read errors, invalid file targets, and unsupported clipboard image formats remain visible errors. They preserve the draft and do not fall through to another content type. Late results preserve the requesting draft and payload in recovery files. Snapshot write failures use the attachment command's native retry UI for the entire set.

A failed staging write retains captured text, image bytes, file bytes, and original session/draft metadata in memory for the current Pi process and agent directory. This survives session switches, extension reloads, and working-directory changes, including failures arriving after the requesting session closes. Failed file reads retain the original paths and any bytes already captured. `/paste-recover` retries uncaptured originals and saves retained contents and metadata without changing the active editor. Use `/attach-file <saved-path>` when ready to attach recovered contents, with one path per line for a set. If Pi exits before storage succeeds, payloads held only in memory are lost.
