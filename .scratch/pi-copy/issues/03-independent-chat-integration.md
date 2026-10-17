# 03: Install chat and copy independently

**What to build:** Installing chat alone provides its existing presentation without copy controls. Installing copy alongside it restores every current copy action through copy's own extension lifecycle, regardless of load order.

**Blocked by:** None (the earlier extraction and spacing tickets are resolved).

**Status:** resolved

- [x] Neither package imports or declares an installation dependency on the other.
- [x] Copy registers its own Pi extension and owns control creation, native panel decoration, payloads, feedback, and disposal.
- [x] Chat supplies authoritative sources and integrates optional control geometry with existing layout, navigation, selection, and Find.
- [x] Both extension orders preserve all existing behavior, exact clipboard text, response spacing, and lifecycle cleanup without duplicate controls.
- [x] Chat alone remains functional and omits copy controls and their spacing.
- [x] Existing affected behavior cases load the two plugins explicitly and pass; no new tests are added.

Published on 2026-10-17 from the user's independent-plugin correction and instruction to preserve all current functionality and continue. The canonical [specification](../../../docs/specs/pi-copy.md) and [ADR 0029](../../../docs/adr/0029-copy-as-an-independent-extension.md) govern the delta.

## Verification

The existing sparse-final case first failed because copy had no extension factory. It passes with copy loaded before chat. The complete affected chat/combined-workflow suite passes 147/147, including mixed extension orders, exact payloads, spacing, selection, keyboard/mouse, history, and pending-copy disposal. Existing inline-thought cases load chat alone. Workspace typecheck and scoped lint/format pass. Native-only copying remains ticket 04. The implementer could not start because the agent runtime rejected encrypted output; the primary agent completed the work directly.
