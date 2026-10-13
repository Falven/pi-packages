# 02: Display native conversations in the owned chat view

**What to build:** Read live and recorded conversation content in pi-chat alongside the existing native composer and dock, using the actual native message and tool presenters.

**Blocked by:** 01: Make the native-host fixture independent of companion extensions.

**Status:** done

- [x] Create the loadable pi-chat package with required-capability checks rather than a version allowlist; missing hooks or conflicting chat ownership prevent activation explicitly. Exercise Pi 1.0.2 and 1.1.0.
- [x] Acquire the host and install the scoped adapter before native history construction, including normal startup, reload, and session replacement.
- [x] Associate live and committed source occurrences with native message parts, thinking runs, tool rows, and unpersisted notices without matching text or inserting markers.
- [x] Borrow native components and retain the effective Markdown/tool renderer chain, images, terminal markers, themes, and original dock containers; do not duplicate active tool presenters.
- [x] In fullscreen chat, keep each native user-message bar at full chat width and align its rendered content as one block to the right with native padding, preserving relative Markdown indentation and transformations.
- [x] Use the native blank padding row to fill the themed bar during cell-aware composition; preserve OSC 133 row prefixes, translated child pointer coordinates, and search/selection on displayed rows. Copy excludes only the added left layout margin; source messages and regular/printed-exit history remain unchanged.
- [x] Keep the native document and reducer intact, preserve regular mode and printed exit history, and restore only still-owned methods and roots on cleanup.
- [x] Index source references incrementally and preserve canonical messages/model input; no second history buffer or unnecessary hashing.
- [x] Native-host tests demonstrate live and replayed output, duplicate content identity, custom rendering, dock preservation, lifecycle rebinding, and safe activation/cleanup.
- [x] Verify short, long, resized, and transformed user messages plus pointer, selection, search, and marker behavior through the real host; physical terminal pixels remain pending under ticket 12.

The pi-chat native-host suite passed 116/116 against both Pi 1.0.2 and 1.1.0. Existing checks cover the full-width native background, right-aligned short text, transformed Unicode wrapping and resize, selection, retained-user Find, semantic navigation, and source preservation. Physical-terminal appearance remains pending under ticket 12.
