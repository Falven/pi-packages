# 02: Separate the response copy footer

**What to build:** Every settled final response has one blank display row before its Copy response control, while copied Markdown and all extracted copy behavior remain identical.

**Blocked by:** 01: Extract chat copy behavior.

**Status:** claimed

- [ ] Guarantee exactly one blank boundary row before Copy response after prose, lists, and code blocks, reusing existing rendered separation instead of stacking blank rows.
- [ ] Preserve the gap through redraw, narrow layouts, resize, history reload, and multipart finals. Keep eligible empty-final and absent-final behavior unchanged.
- [ ] Preserve copied Markdown byte for byte, including source newlines; keep controls, feedback, and the separator outside conversation source and provider inputs.
- [ ] Preserve pointer and keyboard access, selection/Find exclusion, focus recovery, response identity, panel placement for other actions, and pending-copy cleanup.
- [ ] Strengthen existing final-response host checks and record a failing spacing assertion before the layout fix, then passing behavior through the accepted seam.
- [ ] Run the affected chat and combined-workflow suites and required static checks. Resolve actionable Standards and Spec review findings before integration.
- [ ] Record exact verification and integration evidence, mark both tickets resolved when accepted behavior is verified, and preserve unrelated work during main integration and task-worktree cleanup.

**Contract:** [pi-copy specification](../../../docs/specs/pi-copy.md). This ticket depends on the extracted controls so spacing is implemented against the final package interface; it adds no separate test host or new product capability.

## Comments

Published as `ready-for-agent` on 2026-10-17. The user accepted display spacing and unchanged clipboard payloads in the preceding discussion.
