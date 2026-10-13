# 05: Scroll expanded tool groups within bounded bodies

**What to build:** Read long tool groups within a bounded inline body while their headers, native tool controls, selection, and images remain correct.

**Blocked by:** 04: Group and toggle consecutive tool calls.

**Status:** done

- [x] Compose native ScrollView state for logical offsets and bounds; keep the group header outside its scrolling body.
- [x] Resolve nested logical clips before painting and expose each visible interval through one non-nested native window over uncropped native rows.
- [x] Pi performs the sole image crop, transmission, placement, and terminal diff; preserve image instances and reservation rows.
- [x] Route pointer coordinates to native children and bubble unused wheel movement outward; Page Up/Down remain main-view actions.
- [x] Copy across expanded offscreen body rows, exclude folded bodies, preserve reading anchors, and follow the end only when already following.
- [x] Scroll/toggle paths do not rescan history or invalidate unchanged Markdown; reuse native caches and frame-local render references.
- [x] Host tests cover clipping commands, input, selection, anchors, resize, and images; record actual-terminal image/selection acceptance separately and leave it pending until performed.

Verified through the real native host: bounded bodies, native child coordinates and wheel consumption, outward wheel bubbling, main-view page navigation, retained selection and expanded offscreen copying, folded exclusions, growth/resize anchors, following state, and unchanged Markdown reuse. Raw Kitty instructions verify combined source crops, stable image identity through resize, and reservation rows. Group headings retain the exact call count and list each actual tool name once.

**Actual-terminal acceptance:** pending. No image pixels, stale placements, visible selection, or terminal protocol behavior have been verified in a physical terminal. Emitted native instructions are not evidence of those results. Native opaque renderers still traverse full bodies; no bounded frame-cost claim or benchmark was made.
