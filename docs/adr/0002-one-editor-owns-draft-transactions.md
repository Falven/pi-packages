# One editor owns draft transactions

The active editor owns draft mutations; with `pi-composer`, text, selection, and attachment membership participate in one undo history. Paste policy chooses the outcome and attachment handling owns stored contents, while the editor applies the resulting draft change. This keeps a change such as replacing selected text with an attachment coherent and undoable as one action across separate extensions.
