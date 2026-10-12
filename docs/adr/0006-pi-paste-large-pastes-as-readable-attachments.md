# Large pastes become readable attachments

`pi-paste` routes text pastes of at least 5,000 UTF-16 code units to attachment handling so the agent can read their contents on demand. This keeps large pasted content out of the prompt until needed while preserving access to the full text. The same per-paste rule applies across paste routes, with explicit Paste Inline and Attach Text actions as described in the [specification](../specs/pi-paste.md).
