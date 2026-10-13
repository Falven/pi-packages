# 12: Complete a mixed session with existing extensions

**What to build:** Use the complete pi-chat workflow with native Pi and the existing composition extensions through a full session and lifecycle changes.

**Blocked by:** 09: Collapse work as a qualifying final response streams; 11: Find and reveal retained pre-compaction content.

**Status:** in-progress

- [ ] Exercise always-retained group accordions, both native Hide thinking modes, omitted-reasoning grouping, native working-indicator activity headings, steering/follow-ups, final folding, selection/copy, folded search, selected-only temporary thinking reveal and its cleanup, and pre-compaction reveal together.
- [x] Preserve native and companion composer, attachments, skills, tool/Markdown overrides, widgets, themes, and overlay focus in supported load orders.
- [ ] Exercise native retries, interruption, compaction, reload, session/branch replacement, fullscreen/regular transitions, and printed exit history without stale callbacks or lost canonical content.
- [ ] Complete relevant automated checks and a standards/spec review against the integration branch starting point; fix substantiated findings.
- [ ] Perform actual-terminal image, resize, selection, keyboard/mouse, overlay, and lifecycle acceptance; record evidence and keep unperformed physical checks pending.
- [x] Document delivered support and material limits in the allowed spec/ADRs and this ticket; add no separate research notes or unrequested documentation.
- [x] Resolve local tickets only according to their demonstrated acceptance, preserve borrowed native ownership, and leave all implementation on the single integration branch.

Earlier mixed native-host tests covered both load orders and live tool/thought workflows with native and custom renderers, steering and follow-ups, folding, copy, search, retry, interruption, reload, compaction, session replacement, themes, and mode switches. Historical verification before the Hide thinking change: after activity-heading extraction, `node --test packages/pi-chat/test/*.test.ts` passed 116/116 against each of Pi 1.0.2 and 1.1.0 with no failures, cancellations, or skips; heading presentation, working-label cleanup, canonical preservation, and hidden-heading search reveal were covered by modified existing cases. TypeScript, oxlint, and full formatting checks passed. The full repository suite passed 833/833 before the heading change and was not rerun this turn. Standards review found a trailing `.trim()` that could remove first-line code indentation; stripping only separator newlines fixed it, focused verification passed, and rereview found no remaining concrete issue. The Markdown link-label search defect from earlier spec review was fixed and rechecked. The implementation is on `main`. Existing print-mode fixtures check emitted scrollback, but no physical printed-exit acceptance has been completed, so the lifecycle criterion remains pending.

Hide thinking verification: `node --test packages/pi-chat/test/*.test.ts` passed 116/116 against each of Pi 1.0.2 and 1.1.0, with no failures, cancellations, or skips. Modified existing cases cover native visibility toggles, grouping across omitted reasoning, commentary boundaries, cancellation/reload, working labels in both modes, and temporary Find reveal with navigation/query/close cleanup for current and retained thoughts. TypeScript, scoped oxlint, and repository formatting checks pass. Read-only implementation review found no concrete correctness issue. No new test cases or dependencies were added. The full repository suite and physical-terminal acceptance were not rerun.

Physical acceptance is pending because the Mac was locked and automatic unlock failed during the 2026-10-13 08:09 UTC access check; earlier Ghostty app access was denied. No physical terminal session was started or cleaned up. Recording-terminal assertions do not establish image pixels, selection, keyboard/mouse behavior, overlays, resize, or printed-exit behavior in Ghostty.
