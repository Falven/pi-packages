# 03: Install chat and copy independently

**What to build:** Installing chat alone provides its existing presentation without copy controls. Installing copy alongside it restores every current copy action through copy's own extension lifecycle, regardless of load order.

**Blocked by:** None (the earlier extraction and spacing tickets are resolved).

**Status:** ready-for-agent

- [ ] Neither package imports or declares an installation dependency on the other.
- [ ] Copy registers its own Pi extension and owns control creation, native panel decoration, payloads, feedback, and disposal.
- [ ] Chat supplies authoritative sources and integrates optional control geometry with existing layout, navigation, selection, and Find.
- [ ] Both extension orders preserve all existing behavior, exact clipboard text, response spacing, and lifecycle cleanup without duplicate controls.
- [ ] Chat alone remains functional and omits copy controls and their spacing.
- [ ] Existing affected behavior cases load the two plugins explicitly and pass; no new tests are added.

Published on 2026-10-17 from the user's independent-plugin correction and instruction to preserve all current functionality and continue. The canonical [specification](../../../docs/specs/pi-copy.md) and [ADR 0028](../../../docs/adr/0028-copy-as-an-independent-extension.md) govern the delta.
