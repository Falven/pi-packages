# 02: Display native conversations in the owned chat view

**What to build:** Read live and recorded conversation content in pi-chat alongside the existing native composer and dock, using the actual native message and tool presenters.

**Blocked by:** 01: Make the native-host fixture independent of companion extensions.

**Status:** done

- [x] Create the loadable pi-chat package for pinned Pi 1.0.2; unsupported runtime structure or conflicting chat ownership prevents activation explicitly.
- [x] Acquire the host and install the scoped adapter before native history construction, including normal startup, reload, and session replacement.
- [x] Associate live and committed source occurrences with native message parts, thinking runs, tool rows, and unpersisted notices without matching text or inserting markers.
- [x] Borrow native components and retain the effective Markdown/tool renderer chain, images, terminal markers, themes, and original dock containers; do not duplicate active tool presenters.
- [x] Keep the native document and reducer intact, preserve regular mode and printed exit history, and restore only still-owned methods and roots on cleanup.
- [x] Index source references incrementally and preserve canonical messages/model input; no second history buffer or unnecessary hashing.
- [x] Native-host tests demonstrate live and replayed output, duplicate content identity, custom rendering, dock preservation, lifecycle rebinding, and safe activation/cleanup.
