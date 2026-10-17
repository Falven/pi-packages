# pi-quote

Highlight conversation text in fullscreen Pi, then click **[Quote]** to insert it into the current draft. The button uses empty space beside the selection or a fixed row above the editor, so it never pushes the conversation around. **Alt+Shift+Q** also quotes the selection on terminals that report that key combination. **Escape** dismisses it.

Install from the repository root; this package is not published to npm yet:

```bash
pi install ./packages/pi-quote
```

Requires Node.js 24+ and Pi/TUI 1.1.0+. Works independently with stock Pi. It also works with `pi-chat`, `pi-composer`, and `pi-attachments`, in either quote-extension load order. It adds no editor or transcript replacement.

Every selected line becomes a Markdown blockquote, including blank lines. Selections inside visible code fences retain fenced formatting. Insertion preserves the text around the caret, follows the editor's selection replacement behavior, and leaves a blank line for your reply. One Undo restores the draft. Large quotes stay inline when attachments are enabled. Nothing is sent until you submit the draft.

Quotes use Pi's selected **rendered text**, including its line wrapping and whitespace normalization. Original Markdown markers, link URLs, table syntax, and other hidden source formatting are not recovered. Images themselves are not quoted. Normal terminal mode leaves highlighting to the terminal emulator, so the action is available only in fullscreen mode.

The package reserves one blank widget row in fullscreen mode. Its isolated adapter uses Pi's private selection and rendering APIs, checks required capabilities, and restores its hooks on reload or disposal. Changed selected text and width changes dismiss the button. Compatibility is verified against Pi/TUI 1.1.0; future Pi updates may require adapter changes.

See the [specification](../../docs/specs/pi-quote.md) and [independent extension decision](../../docs/adr/0028-independent-quote-extension.md).
