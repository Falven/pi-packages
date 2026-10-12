# Large pastes become readable attachments

`pi-paste` measures decoded text before editor formatting and routes pastes of at least 5,000 UTF-16 code units to readable attachments, keeping their full contents available on demand. The same per-paste rule applies across paste routes, with explicit Paste Inline and Attach Text actions as described in the [specification](../specs/pi-paste.md). Inline text retains the native editor's tab expansion and LF normalization when that editor is active; `pi-composer` preserves tabs, and attachment snapshots preserve captured bytes.
