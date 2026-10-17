# Quote selections through an independent extension

`pi-quote` is a separately installed extension that works with stock fullscreen Pi and with `pi-chat` and `pi-composer`. It owns the Quote action and draft insertion, while Pi retains mouse selection and the active editor; quoted text becomes ordinary editable Markdown in the draft.

Released Pi 1.1.0 keeps selection text, completion state, and coordinates internal. A package-local adapter may read these capabilities and attach instance-scoped rendering and pointer hooks, with capability checks and cleanup. This accepted exception to [ADR 0001](0001-preserve-pi-extension-contracts.md) keeps installation independent at the cost of compatibility verification after Pi updates. It permits neither changes to installed Pi nor a replacement editor or transcript. Regular terminal mode does not expose terminal-owned highlighting to this extension.
