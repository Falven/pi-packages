# 06: Show thoughts inline

**What to build:** Honor native Hide thinking; otherwise show native thought prose inline at its conversation position. Route standalone bold activity headings to Pi's working indicator in either mode.

**Blocked by:** 05: Scroll expanded tool groups within bounded bodies.

**Status:** done

- [x] With Hide thinking off, show native thought Markdown in ordinary chat flow, without a separate viewport or docked widget.
- [x] Use native thought/Markdown presentation and original source references, including adjacent thinking-block aggregation and otherwise-hidden native bodies.
- [x] With Hide thinking off, keep the thought visible after thinking ends while its work history is open, with no static header, individual disclosure, or keyboard/mouse toggle.
- [x] Use public `registerMarkdownTransformer` only for assistant-thinking display to omit standalone bold paragraphs anywhere in thinking; keep inline bold emphasis, original thinking blocks, native presenter identity, canonical messages, and history unchanged.
- [x] Use public `message_update` to set the latest recognized heading through native `ctx.ui.setWorkingMessage`; clear this extension's label at `thinking_end`, `message_end`, and `agent_end`, without a custom spinner or setting.
- [x] Add visual separation between visible thoughts and tool groups.
- [x] Verify Pi's native `hideThinkingBlock` removes live and retained thought rows entirely, without a placeholder, header, spacing, or disclosure, while source remains unchanged/searchable and working labels continue in either mode.
- [x] Verify disabling Hide thinking restores full inline native prose apart from extracted activity headings; add no setting or raw-versus-summary distinction and leave provider/model controls with Pi.
- [x] Reuse native renderers and caches with ordinary-flow selection and scrolling.
- [x] Retain exact occurrence ownership through stream updates, resize, native invalidation, and replay.
- [x] Verify full thought growth, completion, scrollback, selection, and native renderer transformations through the real host.
- [x] Verify leading and mid-block activity headings, inline emphasis, native working-indicator updates/clears, canonical source preservation, and search reveal through the real host.

Hide thinking verification: `node --test packages/pi-chat/test/*.test.ts` passed 116/116 against each of Pi 1.0.2 and 1.1.0, with no failures, cancellations, or skips. Modified existing cases verify hidden streaming bodies, activity-heading labels in both modes, live visibility toggles, cancellation notices, hidden-state reload, unchanged canonical messages, and retained-history visibility. Full inline Markdown, selection, scrolling, and heading parser checks also pass. Physical terminal acceptance remains pending under ticket 12.
