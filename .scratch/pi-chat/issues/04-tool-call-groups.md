# 04: Group and toggle consecutive tool calls

**What to build:** Inspect consecutive tool calls together while each tool retains its native presentation and detail controls.

**Blocked by:** 03: Navigate, select, and copy chat content.

**Status:** done

- [x] Group every consecutive top-level call across assistant messages, stopping at commentary, thoughts, user items, other standalone activity, or explicit boundaries.
- [x] Summaries use actual tool names and one count per call, without semantic categories, renderer scraping, or tool exclusions.
- [x] Groups begin collapsed while active; manual expansion survives growth and completion, and ordinary failure/cancellation does not toggle it.
- [x] Every group retains its outer accordion, including a settled single finished call; groups start collapsed and manual expansion survives growth and completion.
- [x] Group toggles preserve child detail choices; global native tool expansion affects groups and tool details; manual choices survive redraw/resize and reset on reload/restart.
- [x] Provide the agreed Pi-registered disclosure-focus shortcut and configured selector navigation/confirm/cancel, plus pointer toggles and overlay priority; add no slash command or separate reader.
- [x] Keep expansion chevrons visible while focused and show focus with a separate marker.
- [x] Folding excludes closed bodies from copied ranges and clears invalidated selections.
- [x] Native-host tests cover the revised singleton accordion and focused-header presentation as well as grouping boundaries, native/custom tools, failure, manual/global choices, keyboard access, and reload defaults.

The revised focused-chevron and collapsed-singleton tests failed before the source change and now pass. Keyboard and mouse assertions confirm the chevron remains visible beside a separate focus marker. Verification passed the full repository suite (833/833) and the pi-chat native-host suite against Pi 1.1.0 (116/116), plus TypeScript, oxlint, and oxfmt checks.
