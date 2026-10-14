# 03: Configure attachment thumbnail size in Pi settings

**What to build:** Pi standard settings offers Small, Medium, and Large attachment thumbnails while preserving global visibility and width preferences.

**Blocked by:** 01: Honor effective Pi settings.

**Status:** ready-for-agent

**Specification:** [Pi Attachments](../../../docs/specs/pi-attachments.md). Use the existing public editor/session test boundary and applicable architecture decisions.

- [ ] Add public upstream support for this preference in Pi standard settings and consume it through effective settings services; do not invent a private settings menu.
- [ ] Offer Small at 12 columns by two rows, Medium at 24 by four as the default, and Large at 48 by eight.
- [ ] Preserve aspect ratio and clamp to Pi general image width and available terminal space. Settings changes affect rendering without modifying retained bytes, membership, or delivered image dimensions.
- [ ] Verify all three choices for wide and tall images across terminal sizes, effective overrides, visibility changes, and settings persistence through the public host.
