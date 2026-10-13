# 03: Navigate, select, and copy chat content

**What to build:** Navigate the main chat viewport and copy the intended rendered text while preserving native input, composer behavior, and overlay focus.

**Blocked by:** 02: Display native conversations in the owned chat view.

**Status:** ready-for-agent

- [ ] Use native input decoding and effective keybindings for main-view scrolling and prompt navigation.
- [ ] Preserve the first visible occurrence and local row as heights change, or continue following the end when already following.
- [ ] Map selection endpoints through occurrence, row, and terminal-cell geometry, including Unicode and offscreen expanded rows.
- [ ] Reuse native message-copy, copy-on-select, and clipboard transport; do not introduce another clipboard implementation.
- [ ] Offer child pointer handlers their own events first and preserve native overlays and focus restoration.
- [ ] Ordinary scrolling preserves selection; reflow or changed selected content clears invalidated ranges.
- [ ] Verify displayed frames, input routing, copied text at the native boundary, resize, and overlay interactions through the real host.
