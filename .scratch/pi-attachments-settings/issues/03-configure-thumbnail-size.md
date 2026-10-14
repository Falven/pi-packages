# 03: Configure thumbnail size inside attachment management

**What to build:** Settings inside Manage attachments… offers persistent Small, Medium, and Large thumbnail sizes, including when the draft has no attachments.

**Blocked by:** None (can start immediately).

**Status:** in-progress

**Specification:** [Pi Attachments](../../../docs/specs/pi-attachments.md), including its applicable architecture decisions.

- [ ] Open Settings from Manage attachments… for populated and empty drafts. Use Pi's SettingsList and getSettingsListTheme() through ctx.ui.custom() for native appearance, navigation, acceptance, and cancellation. Preserve draft text, selection, and focus.
- [ ] Offer Small at 12 columns by two rows, Medium at 24 by four as the default, and Large at 48 by eight. Preserve aspect ratio, terminal.showImages, Pi's image-width ceiling, and available terminal space.
- [ ] Save only the attachment-owned thumbnail preference in the package's user settings file. Apply changes, retain them across restarts, and reread manual edits on /reload. Keep native preferences under pi.getSettings(); package persistence is the accepted community fallback.
- [ ] Preserve an attachment preference already saved through the modified host when adopting package storage. Do not rewrite unrelated Pi preferences or bindings. Handle invalid saved values and persistence errors explicitly.
- [ ] Remove consumers of the locally added registerSetting() and getSetting() interfaces. Add no central /settings registration, shared settings framework, third primary action, or separate configurable shortcut.
- [ ] Changing thumbnail size affects rendering only: retain original bytes, Markdown membership, and delivered image dimensions, and never capture again because a setting changes.
- [ ] Adapt existing checks for wide and tall images, narrow and wide terminals, visibility and width overrides, empty-draft access, keyboard controls, persistence, restart, manual edits, reload, and existing preference migration. Verify the native menu and resulting previews on unmodified Pi during ticket 07.

**Integration:** This preference can be developed independently of the native-settings fixes in ticket 01. Coordinate their shared preview integration in the common checkout; ticket 07 owns complete runtime acceptance.

**Historical verification (2026-10-14):** The previous modified-host checks selected a registered central /settings row, exercised all three bounds and native settings precedence, and passed the 252-test attachment suite plus focused type, lint, and format checks. They do not establish the new attachment menu, package-owned persistence, migration, or reload behavior. Physical Ghostty rendering was not observed.
