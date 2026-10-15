# 05: Scroll expanded render groups within bounded bodies

**What to build:** Read long render groups within a bounded inline body while their headers, native tool controls, selection, and images remain correct.

**Blocked by:** 04: Group and toggle consecutive tool calls.

**Status:** done

- [x] Compose native ScrollView state for logical offsets and bounds; keep the group header outside its scrolling body.
- [x] Resolve nested logical clips before painting and expose each visible interval through one native window over uncropped rows. The outer primary scroller supplies blank geometry and spacers for native scrollbar layout; leaf windows alone supply image content.
- [x] Keep painting windows at terminal width through a non-shrinking native `HStack`, with the reserved gutter excluded by the outer content clip, preserving native image recovery without a second crop.
- [x] Pi performs the sole image crop, transmission, placement, and terminal diff; preserve image instances and reservation rows.
- [x] Route pointer coordinates to native children and bubble unused wheel movement outward; Page Up/Down remain main-view actions.
- [x] Copy across expanded offscreen body rows, exclude collapsed bodies, preserve reading anchors, and follow the end only when already following.
- [x] Scroll/toggle paths do not rescan history or invalidate unchanged Markdown; reuse native caches and frame-local render references.
- [x] Ordinary scrolling uses cached normalized action facts and summaries without rescanning tool history or changing expanded native presenters.
- [x] Host tests cover clipping commands, input, selection, anchors, resize, and images; record actual-terminal image/selection acceptance separately and leave it pending until performed.

Verified through the real native host: bounded bodies, native child coordinates and wheel consumption, outward wheel bubbling, main-view page navigation, retained selection and expanded offscreen copying, collapsed exclusions, growth/resize anchors, following state, and unchanged Markdown reuse. After the scrollbar correction, the chat suite passed 116/116 against each of Pi 1.1.0 and 1.0.2. The existing image case now checks combined source crops, stable image identity through resize, and reservation rows with `fullscreenScrollbar: "always"`; only native layout paints the bar. After the final group summary changes, the full chat suite again passed 116/116 on both versions, including the updated mixed native-host skill-read case. The `GroupSummaries` self-check found no repeated public lookups while summarizing; source review confirmed cached occurrence state and shared weak Pi-owned entry references for settings row reconstruction. This does not establish persistence across reload or a new load.

**Actual-terminal acceptance:** pending. No image pixels, stale placements, visible selection, or terminal protocol behavior have been verified in a physical terminal. Emitted native instructions are not evidence of those results. Native opaque renderers still traverse full bodies; no bounded frame-cost claim or benchmark was made.
