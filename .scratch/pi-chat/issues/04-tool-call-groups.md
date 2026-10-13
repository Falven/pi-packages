# 04: Group and toggle consecutive tool calls

**What to build:** Inspect consecutive tool calls together while each tool retains its native presentation and detail controls.

**Blocked by:** 03: Navigate, select, and copy chat content.

**Status:** done

- [x] Group every consecutive top-level call across assistant messages, stopping at visible commentary, visible thoughts, user items, other standalone activity, or explicit boundaries.
- [x] Verify eligible calls group across reasoning omitted by native Hide thinking, while visible commentary and meaningful boundaries still split groups; with Hide thinking off, thoughts separate groups.
- [x] Summaries use actual tool names and one count per call, without semantic categories, renderer scraping, or tool exclusions.
- [x] Groups begin collapsed while active; manual expansion survives growth and completion, and ordinary failure/cancellation does not toggle it.
- [x] Every group retains its outer accordion, including a settled single finished call; groups start collapsed and manual expansion survives growth and completion.
- [x] Group toggles preserve child detail choices; global native tool expansion affects groups and tool details; manual choices survive redraw/resize and reset on reload/restart.
- [x] Provide the agreed Pi-registered disclosure-focus shortcut and configured selector navigation/confirm/cancel, plus pointer toggles and overlay priority; add no slash command or separate reader.
- [x] Keep expansion chevrons visible and highlight focused group and work-history headers with Pi's native selection background instead of an extra arrow.
- [x] Folding excludes closed bodies from copied ranges and clears invalidated selections.
- [x] Native-host tests cover the revised singleton accordion and focused-header presentation as well as grouping boundaries, native/custom tools, failure, manual/global choices, keyboard access, and reload defaults.

Hide thinking and focused-header verification: `node --test packages/pi-chat/test/*.test.ts` passed 116/116 against each of Pi 1.0.2 and 1.1.0, with no failures, cancellations, or skips. Modified existing cases verify that omitted reasoning no longer splits calls, toggling thinking back on restores its boundaries, and visible commentary still separates groups. Updated keyboard, pointer, and work-history cases verify single chevrons, native selection backgrounds, focus clearing, live theme changes, and focus through streaming completion. Existing singleton, native/custom renderer, failure, and manual/global expansion checks also pass.
