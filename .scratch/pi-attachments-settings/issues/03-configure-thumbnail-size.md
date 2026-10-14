# 03: Configure attachment thumbnail size in Pi settings

**What to build:** Pi standard settings offers Small, Medium, and Large attachment thumbnails while preserving global visibility and width preferences.

**Blocked by:** 01: Honor effective Pi settings.

**Status:** complete

**Specification:** [Pi Attachments](../../../docs/specs/pi-attachments.md). Use the existing public editor/session test boundary and applicable architecture decisions.

- [x] Add public upstream support for this preference in Pi standard settings and consume it through effective settings services; do not invent a private settings menu.
- [x] Offer Small at 12 columns by two rows, Medium at 24 by four as the default, and Large at 48 by eight.
- [x] Preserve aspect ratio and clamp to Pi general image width and available terminal space. Settings changes affect rendering without modifying retained bytes, membership, or delivered image dimensions.
- [x] Verify all three choices for wide and tall images across terminal sizes, effective overrides, visibility changes, and settings persistence through the public host.

**Evidence:** The native Pi host tests select the registered row in `/settings` and exercise all three bounds on wide and tall PNGs in wide and narrow terminals. They also check live effective overrides, Pi's image-width ceiling, retained bytes, and unchanged draft references. Existing native tests cover visibility and delivered image dimensions. Upstream Pi tests verify global persistence, project and runtime precedence, and invalid saved values. The attachment package suite passes (252 tests); focused format, lint, and type checks pass against the tested host artifact. Physical Ghostty rendering remains unobserved.
