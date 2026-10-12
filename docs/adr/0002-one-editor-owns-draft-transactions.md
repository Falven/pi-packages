# One editor owns draft transactions

The active editor owns draft mutations; with `pi-composer`, native editing actions, text replacement, and attachment membership changes operate on the same Markdown state, selection, and undo history. Paste policy chooses the outcome and attachment handling owns stored contents, while the editor applies the resulting draft change. This keeps both ordinary editing and changes such as replacing selected text with an attachment coherent and undoable across separate extensions.
