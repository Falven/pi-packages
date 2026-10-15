# 05: Expand render groups and native activity bodies in conversation flow

**What to build:** Open a render group to expose every activity item in ordinary conversation flow, with independent native-sized activity bodies.

**Blocked by:** None (can start immediately); existing common activity-item rendering is complete.

**Status:** resolved — native-flow delta; combined acceptance remains in ticket 12

## Native-flow and disclosure delta — approved 2026-10-15

- [x] Remove the shared render-group scrolling area and height cap. An expanded group exposes all of its activity-item rows; its header and children participate in the primary conversation flow.
- [x] Use Pi’s standard expanded output sizes for each opened native built-in or generic default activity body. Add no replacement preview, body cap, percentage limit, row limit, or independently bounded body viewport. Short bodies use only their native required height.
- [x] Preserve summary-only collapsed items, independent item disclosures, stable source identities and order, native default content, images, meaningful indentation, and native output expansion. Global-state inheritance and all-level toggling are coordinated by tickets 04 and 07, not prerequisites for this slice.
- [x] Keep the primary scrollbar and native full-width painting windows required for image clipping; those painting windows are not user scroll controls. Preserve one native image crop/placement owner, reservation rows, resize behavior, and image-tail recovery.
- [x] Preserve source Find/reveal, copying of expanded offscreen rows, collapsed exclusions, selection validity, reading anchors, end following, and unchanged-content caches without history rescans on ordinary scrolling.
- [x] Update the existing bounded-group, source-search, and related real-Pi host cases for full native flow and long bodies while retaining meaningful image, selection, cache, anchor, and source checks. Reuse the established fixture and existing cases; add no test cases or files. Keep physical-terminal acceptance distinct from recorded-frame assertions.

These approved criteria supersede conflicting presentation/default-state requirements in earlier revisions. Earlier status, completed checklists, and evidence below remain historical; they do not validate this delta. Accepted decisions: ADRs 0014, 0015, and 0019–0022.

**Revision evidence (2026-10-15, `cc74939`):** Removed the shared group viewport and its height cap while preserving native painting windows. The revised existing host case failed before the change because the first long body was hidden, then passed with all native output in conversation flow. Pi 1.0.2 passes all 33 affected flow/Find cases and three focused navigation/native-child/reflow cases. Existing cases cover offscreen output selection/copy, unchanged Markdown caches, primary scrolling, growth/resize anchors, and single-owner image crops/reservation rows. Typechecking, scoped lint/format, and whitespace checks pass. No test cases, test files, provider changes, or installed Pi modifications were added. Full combined, primary Pi 1.1.0, and physical-terminal acceptance belong to ticket 12.

## Prior accepted revision and evidence

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
