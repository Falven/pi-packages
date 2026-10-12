# One Markdown text state

Markdown text is the authoritative draft in `pi-composer`, with live formatted and source views sharing selection and undo history. This lets native Pi text APIs and other extensions operate on the same representation while keeping canonical skill references portable. The formatted view maps source positions to terminal cells and commits edits through the shared state; local source reveal, cursor appearance, and link metadata affect presentation without changing the draft or adding an undo step.
