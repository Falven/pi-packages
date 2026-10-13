# 05: Scroll expanded tool groups within bounded bodies

**What to build:** Read long tool groups within a bounded inline body while their headers, native tool controls, selection, and images remain correct.

**Blocked by:** 04: Group and toggle consecutive tool calls.

**Status:** ready-for-agent

- [ ] Compose native ScrollView state for logical offsets and bounds; keep the group header outside its scrolling body.
- [ ] Resolve nested logical clips before painting and expose each visible interval through one non-nested native window over uncropped native rows.
- [ ] Pi performs the sole image crop, transmission, placement, and terminal diff; preserve image instances and reservation rows.
- [ ] Route pointer coordinates to native children and bubble unused wheel movement outward; Page Up/Down remain main-view actions.
- [ ] Copy across expanded offscreen body rows, exclude folded bodies, preserve reading anchors, and follow the end only when already following.
- [ ] Scroll/toggle paths do not rescan history or invalidate unchanged Markdown; reuse native caches and frame-local render references.
- [ ] Host tests cover clipping commands, input, selection, anchors, resize, and images; record actual-terminal image/selection acceptance separately and leave it pending until performed.
