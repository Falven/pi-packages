# 03: Configure thumbnail size inside attachment management

**What to build:** Settings inside Manage attachments… offers persistent Small, Medium, and Large thumbnail sizes, including when the draft has no attachments.

**Blocked by:** None (can start immediately).

**Status:** implemented — preference storage, the native menu, and integrated management/preview checks pass on unmodified Pi. Both editors also pass fresh executable menu, persistence, and reload checks on restored Pi 1.1.0 and official Pi 1.2.0. Physical graphics acceptance remains in ticket 07.

**Specification:** [Pi Attachments](../../../docs/specs/pi-attachments.md), including its applicable architecture decisions.

- [x] Open Settings from Manage attachments… for populated and empty drafts. Use Pi's SettingsList and getSettingsListTheme() through ctx.ui.custom() for native appearance, navigation, acceptance, and cancellation. Preserve draft text, selection, and focus.
- [x] Offer Small at 12 columns by two rows, Medium at 24 by four as the default, and Large at 48 by eight. Preserve aspect ratio, terminal.showImages, Pi's image-width ceiling, and available terminal space.
- [x] Save only the attachment-owned thumbnail preference in the package's user settings file. Apply changes, retain them across restarts, and reread manual edits on /reload. Keep native preferences under pi.getSettings(); package persistence is the accepted community fallback.
- [x] Preserve an attachment preference already saved through the modified host when adopting package storage. Do not rewrite unrelated Pi preferences or bindings. Handle invalid saved values and persistence errors explicitly.
- [x] Remove consumers of the locally added registerSetting() and getSetting() interfaces. Add no central /settings registration, shared settings framework, third primary action, or separate configurable shortcut.
- [x] Changing thumbnail size affects rendering only: retain original bytes, Markdown membership, and delivered image dimensions, and never capture again because a setting changes.
- [x] Adapt existing checks for wide and tall images, narrow and wide terminals, visibility and width overrides, empty-draft access, keyboard controls, persistence, restart, manual edits, reload, and existing preference migration. Verify the native menu and resulting previews on unmodified Pi during ticket 07.

**Integration:** This preference can be developed independently of the native-settings fixes in ticket 01. Coordinate their shared preview integration in the common checkout; ticket 07 owns complete runtime acceptance.

**Portability implementation (2026-10-14):** Management now includes Settings for empty and populated drafts. The settings dialog uses Pi's public native components; Enter or Space changes the size and Escape closes the dialog. Only `thumbnailSize` is saved in `pi-attachments.json` in the active agent directory. This mutable file stays outside retained snapshot storage. Saving uses an atomic replacement; an unsuccessful write reports the error and keeps the saved choice. On first adoption, the previous saved user preference is copied from Pi's settings without rewriting that file. A package preference takes precedence on later loads.

**Verified on unmodified Pi 1.0.2:** Eight isolated native UI checks passed for all three choices, draft caret and focus, persistence, manual edits and reload, a separate-process restart, legacy migration, unchanged unrelated preferences, malformed configuration, and permission-denied saves. Manual package settings and migrated Pi settings also accept a UTF-8 byte order mark. The checks install the actual attachment settings module through a test extension using public command registration and custom UI; they do not substitute missing host APIs. Scoped settings type checking, affected-file lint and formatting, and whitespace checks passed.

**Integrated verification (2026-10-14):** The complete attachment extension now passes the management and wide/tall thumbnail checks on unmodified Pi 1.0.2, including empty and populated drafts, native visibility and width ceilings, selected-editor focus, unchanged snapshots, and delivery. Fresh launches of both editors on the restored Pi 1.1.0 executable and official Pi 1.2.0 also verify empty-draft access, Medium default, persisted Large, and a manual Small preference applied by `/reload`; ticket 07 records the commands and reports. These controlled checks do not establish physical Ghostty image rendering, which remains unobserved.

**Historical verification (2026-10-14):** The previous modified-host checks selected a registered central /settings row, exercised all three bounds and native settings precedence, and passed the 252-test attachment suite plus focused type, lint, and format checks. They do not establish the new attachment menu, package-owned persistence, migration, or reload behavior. Physical Ghostty rendering was not observed.
