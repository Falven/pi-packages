# 04: Group and toggle consecutive tool calls

**What to build:** Inspect consecutive tool calls together while each tool retains its native presentation and detail controls.

**Blocked by:** 03: Navigate, select, and copy chat content.

**Status:** ready-for-agent

- [ ] Group every consecutive top-level call across assistant messages, stopping at commentary, thoughts, user items, other standalone activity, or explicit boundaries.
- [ ] Summaries use actual tool names and one count per call, without semantic categories, renderer scraping, or tool exclusions.
- [ ] Groups begin collapsed while active; manual expansion survives growth and completion, and ordinary failure/cancellation does not toggle it.
- [ ] Active groups or unfinished calls retain their outer accordion; a settled single finished call appears directly, while settled multiple calls retain the accordion.
- [ ] Group toggles preserve child detail choices; global native tool expansion affects groups and tool details; manual choices survive redraw/resize and reset on reload/restart.
- [ ] Provide the agreed Pi-registered disclosure-focus shortcut and configured selector navigation/confirm/cancel, plus pointer toggles and overlay priority; add no slash command or separate reader.
- [ ] Folding excludes closed bodies from copied ranges and clears invalidated selections.
- [ ] Native-host tests cover grouping boundaries, singletons, native/custom tools, failure, manual/global choices, keyboard access, and reload defaults.
