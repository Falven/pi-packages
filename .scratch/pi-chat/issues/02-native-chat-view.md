# 02: Display native conversations in the owned chat view

**What to build:** Read live and recorded conversation content in pi-chat alongside the existing native composer and dock, using the actual native message and tool presenters.

**Blocked by:** 01: Make the native-host fixture independent of companion extensions.

**Status:** ready-for-agent

- [x] Create the loadable pi-chat package with required-capability checks rather than a version allowlist; missing hooks or conflicting chat ownership prevent activation explicitly. Target Pi 1.1.0 and later, verify 1.1.0, and retain secondary coverage for 1.0.2.
- [x] Acquire the host and install the scoped adapter before native history construction, including normal startup, reload, and session replacement.
- [x] Associate live and committed source occurrences with native message parts, thinking runs, tool rows, and unpersisted notices without matching text or inserting markers.
- [x] Borrow native components and retain the effective Markdown/tool renderer chain, images, terminal markers, themes, and original dock containers; do not duplicate active tool presenters.
- [x] In fullscreen chat, keep each native user-message bar at full chat width and align its rendered content as one block to the right with native padding, preserving relative Markdown indentation and transformations.
- [x] Use the native blank padding row to fill the themed bar during cell-aware composition; preserve OSC 133 row prefixes, translated child pointer coordinates, and search/selection on displayed rows. Copy excludes only the added left layout margin; source messages and regular/printed-exit history remain unchanged.
- [x] Register the owned primary `ScrollView` in native layout, borrowing native scrollbar mode and style callbacks; preserve native track, drag, hover, and hiding behavior without a replacement scrollbar or new settings.
- [x] Read native content width before measurement and alignment; keep the reserved gutter outside text selection and copying, and clear selection when changed width requires reflow.
- [x] Apply current `outputPad` to native header `Text` and detached historical presenters through their available setters; Pi remains responsible for settings normalization and live presenter updates.
- [x] Keep the native document and reducer intact, preserve regular mode and printed exit history, and restore only still-owned methods and roots on cleanup.
- [x] Index source references incrementally and preserve canonical messages/model input; no second history buffer or unnecessary hashing.
- [x] Native-host tests demonstrate live and replayed output, duplicate content identity, custom rendering, dock preservation, lifecycle rebinding, and safe activation/cleanup.
- [x] Verify short, long, resized, and transformed user messages plus pointer, selection, search, and marker behavior through the real host; physical terminal pixels remain pending under ticket 12.

Correction delta:

- [ ] Associate original native custom-entry components with their actual source entries on both ordinary append and direct insertion before a streaming assistant, during live use and native replay.
- [ ] Preserve source identity separately from work membership, retain native renderer state and insertion order, and reuse the existing adapter's lifecycle and cleanup without an extra history rebuild or message changes.
- [ ] Update existing native-host coverage to verify the observable live/replay behavior and source preservation; do not add test cases, files, or a separate test seam.

The completed checklist and earlier results below describe the baseline. This ticket is reopened only for custom-entry association; it introduces no execution-journal parser or tool-package change. Work folding around unrelated notices is the dependent correction in ticket 07.

After the scrollbar and padding corrections, the chat suite passed 116/116 against each of Pi 1.1.0 and 1.0.2. Modified existing cases cover all scrollbar modes and live changes, native styles and pointer behavior, automatic hiding, gutter selection/copy, zero padding, live header updates, retained user/thought/tool padding, and cleanup after a later owner takes over. Existing rendering, source preservation, interaction, and lifecycle checks also pass. TypeScript, scoped lint, and formatting checks pass. Physical-terminal appearance remains pending under ticket 12.
