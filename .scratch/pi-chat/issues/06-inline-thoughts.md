# 06: Show thoughts inline

**What to build:** Show native thought prose inline in ordinary chat flow at its conversation position, routing standalone bold activity headings to Pi's working indicator.

**Blocked by:** 05: Scroll expanded tool groups within bounded bodies.

**Status:** done

- [x] Show native thought Markdown in ordinary chat flow, without a separate viewport or docked widget.
- [x] Use native thought/Markdown presentation and original source references, including adjacent thinking-block aggregation and otherwise-hidden native bodies.
- [x] Keep the thought visible after thinking ends while its work history is open, with no static header, individual disclosure, or keyboard/mouse toggle.
- [x] Use public `registerMarkdownTransformer` only for assistant-thinking display to omit standalone bold paragraphs anywhere in thinking; keep inline bold emphasis, original thinking blocks, native presenter identity, canonical messages, and history unchanged.
- [x] Use public `message_update` to set the latest recognized heading through native `ctx.ui.setWorkingMessage`; clear this extension's label at `thinking_end`, `message_end`, and `agent_end`, without a custom spinner or setting.
- [x] Add visual separation between thoughts and tool groups.
- [x] Reuse native renderers and caches with ordinary-flow selection and scrolling.
- [x] Retain exact occurrence ownership through stream updates, resize, native invalidation, and replay.
- [x] Verify full thought growth, completion, scrollback, selection, and native renderer transformations through the real host.
- [x] Verify leading and mid-block activity headings, inline emphasis, native working-indicator updates/clears, canonical source preservation, and search reveal through the real host.

After the activity-heading change, `node --test packages/pi-chat/test/*.test.ts` passed 116/116 against each of Pi 1.0.2 and 1.1.0 with no failures, cancellations, or skips. Modified existing cases cover a leading heading split across streaming updates and a mid-block heading arriving in a later update, plain labels with inline code, preserved inline bold and fenced code, native hidden-thought rendering, label cleanup on completion/cancellation/reload, and unchanged canonical messages. Parser self-checks cover quoted/list/code contexts, partial headings, link definitions, CRLF, heading-only input, and indentation after a removed heading. Group, tool, and work disclosures retain selector/copy/page handling; thoughts have no individual disclosure, and whole-work folding still applies. Physical terminal acceptance remains pending under ticket 12; recording-terminal checks do not establish visible pixels or OS clipboard behavior.
