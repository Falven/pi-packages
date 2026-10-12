# One Markdown text state

Markdown text is the authoritative draft in `pi-composer`, with live formatted and source views sharing selection and undo history. This lets native Pi text APIs and other extensions operate on the same representation while keeping canonical skill references portable. The formatted view maps the same source positions to terminal cells, while formatting, cursor appearance, and hyperlink metadata affect presentation without changing source text or creating undo entries.
