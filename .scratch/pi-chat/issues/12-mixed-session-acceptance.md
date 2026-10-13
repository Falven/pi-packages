# 12: Complete a mixed session with existing extensions

**What to build:** Use the complete pi-chat workflow with native Pi and the existing composition extensions through a full session and lifecycle changes.

**Blocked by:** 09: Collapse work as a qualifying final response streams; 11: Find and reveal retained pre-compaction content.

**Status:** in-progress

- [x] Exercise live groups, bounded thoughts, steering/follow-ups, final folding, selection/copy, folded search, and pre-compaction reveal together.
- [x] Preserve native and companion composer, attachments, skills, tool/Markdown overrides, widgets, themes, and overlay focus in supported load orders.
- [ ] Exercise native retries, interruption, compaction, reload, session/branch replacement, fullscreen/regular transitions, and printed exit history without stale callbacks or lost canonical content.
- [ ] Complete relevant automated checks and a standards/spec review against the integration branch starting point; fix substantiated findings.
- [ ] Perform actual-terminal image, resize, selection, keyboard/mouse, overlay, and lifecycle acceptance; record evidence and keep unperformed physical checks pending.
- [x] Document delivered support and material limits in the allowed spec/ADRs and this ticket; add no separate research notes or unrequested documentation.
- [ ] Resolve local tickets only according to their demonstrated acceptance, preserve borrowed native ownership, and leave all implementation on the single integration branch.

The mixed native-host tests cover both load orders and a live tool/thought workflow with native and custom renderers, queued steering and follow-up, copy, search, retry, and interruption. They also cover reload, compaction, session replacement, theme and mode switches, and settings changes on a revealed historical image. Existing print-mode fixtures check emitted scrollback, but no physical printed-exit acceptance has been completed. The standards/spec review and final integration are pending.

Physical acceptance is pending because the Mac was locked and automatic unlock failed during the 2026-10-13 07:42 UTC access check; earlier Ghostty app access was denied. No physical terminal session was started or cleaned up. Recording-terminal assertions do not establish image pixels, selection, overlays, resize, or printed-exit behavior in Ghostty.
