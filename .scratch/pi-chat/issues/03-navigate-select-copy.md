# 03: Navigate, select, and copy chat content

**What to build:** Scroll the conversation directly over its existing native side padding while preserving native child input, scrollbar behavior, selection, and copying.

**Blocked by:** 05: Expand render groups and native activity bodies in conversation flow.

**Status:** in-progress

## Native-flow and disclosure delta — approved 2026-10-15

- [ ] Reuse Pi’s existing outputPad on both sides of the whole conversation viewport, including messages, disclosure headers, and activity bodies; count it once. Zero padding means no gutter. Add no inset, minimum width, columns, or setting; leave composer and dock layout unchanged.
- [ ] Route wheel input over either conversation gutter or a disclosure header directly to the primary conversation. Preserve native scrollbar hover, track, drag, and priority where its edge overlaps padding, including always, auto, and hidden modes.
- [ ] Offer interior body input to native children first. Where native content has its own scrolling, preserve child-first scrolling and pass unused wheel movement to the conversation at the edge. Do not create a body viewport or let painting windows consume conversation wheel movement.
- [ ] Preserve content width, meaningful indentation, native child coordinates, reading anchors, end following, image ownership, and source order across live padding changes and resize. Selection/highlighting/copy exclude gutter and alignment padding without trimming content indentation.
- [ ] Update relevant existing real-Pi host cases for zero and nonzero/live padding, both gutter edges, headers, child handoff, native scrollbar modes, selection/copy, and resize. Reuse the established fixture; add no test cases, files, or alternate seam.

These approved criteria supersede conflicting presentation/default-state requirements in earlier revisions. Earlier status, completed checklists, and evidence below remain historical; they do not validate this delta. Accepted decisions: ADRs 0014, 0015, and 0019–0022.

## Prior accepted revision and evidence

**What to build:** Navigate the main chat viewport and copy the intended rendered text while preserving native input, composer behavior, and overlay focus.

**Blocked by:** 02: Display native conversations in the owned chat view.

**Status:** done

- [x] Use native input decoding and effective keybindings for main-view scrolling and prompt navigation.
- [x] Preserve the first visible occurrence and local row as heights change, or continue following the end when already following.
- [x] Map selection endpoints through occurrence, row, and terminal-cell geometry, including Unicode and offscreen expanded rows.
- [x] Reuse native message-copy, copy-on-select, and clipboard transport; do not introduce another clipboard implementation.
- [x] Offer child pointer handlers their own events first and preserve native overlays and focus restoration.
- [x] Ordinary scrolling preserves selection; reflow or changed selected content clears invalidated ranges.
- [x] Verify displayed frames, input routing, copied text at the native boundary, resize, and overlay interactions through the real host.
