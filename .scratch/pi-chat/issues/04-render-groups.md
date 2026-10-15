# 04: Separate item disclosure from native output expansion

**What to build:** Separate item disclosure from native output expansion.

**Blocked by:** None (can start immediately).

**Status:** resolved — native preview correction implemented; verification and limits below

## Native output preview correction — approved 2026-10-15

- [x] Keep a closed item summary-only. Opening it reveals the native output control in its own current state, showing the native collapsed preview by default. Native output clicks expand/collapse output without closing the item.
- [x] Use native built-in renderers and generic default extension rendering for both output states. Keep specific command summaries for previews; permit the generic command summary only when native output is expanded.
- [x] Preserve item and native-output states independently across updates, item/group/Worked-for closure and reopening, and settings reconstruction. New controls inherit the native global state; configured app.tools.expand still sets all available levels without a new shortcut or persisted policy.
- [x] Find expands only the selected native output enough to reveal its matching source. Preserve source, contracts, selection validity, gutters, image ownership, and existing reload lifetime.
- [x] Reproduce and verify using existing real-Pi cases only, including long output, native clicks, remapped global expansion, settings reconstruction, and source Find.

This correction supersedes forced native-output expansion when an item opens. Earlier scope, status, and evidence below remain historical.

### Verification — 2026-10-15

Implemented by `37c61a2` and `50fbcfb`, integrated at `39e0e5d`. Item disclosure controls visibility; Pi's native output control owns its separate preview/full state. Generic extensions now select Pi's native fallback composition instead of the raw path that ignored expansion. Native clicks leave enclosing disclosures open, and both choices survive updates and reconstruction.

All 116 existing chat cases pass on Pi 1.1.0 and 1.0.2. They cover independent native clicks, specific summaries, retained choices, configured global expansion, and selected-only Find reveal. [Chat 12](12-mixed-session-acceptance.md) records the combined checks, reviews, and physical-terminal limits.

## Prior native-flow revision and evidence

**What to build:** Use Pi’s configured native tool-expansion action for render-group, activity-item, and native-output disclosure state, including newly arriving items.

**Blocked by:** None (can start immediately); earlier adapter and grouping prerequisites are complete.

**Status:** resolved — native expansion delta; enclosing activity remains in ticket 07

## Native-flow and disclosure delta — approved 2026-10-15

- [x] Reuse the configured native app.tools.expand action and Pi’s global output-expansion state. Ctrl+O is only the default binding; introduce no hard-coded shortcut or separate expansion setting.
- [x] On an explicit global action, expand or collapse every available render group, activity item, and native output body consistently. Collapsed items remain summary-only; opened items retain the agreed native built-in or generic default expanded rendering.
- [x] New render groups and activity items inherit the current native global expansion state rather than unconditionally starting collapsed. Preserve remembered individual choices through redraw, growth, settlement, settings reconstruction, and resize until an explicit individual/global change; retain the existing in-memory lifetime.
- [x] Individual ancestor closure and reopening preserve descendant choices; a later explicit global action sets every applicable descendant. Group summaries, item summaries, adapter ownership, source data, and grouping boundaries remain unchanged.
- [x] Update existing real-Pi host cases to verify a remapped app.tools.expand binding, default-state inheritance, future arrivals after both global states, native bodies, independent toggles, and retained choices. Reuse the established fixture and existing cases only. Ticket 07 adds the enclosing agent activity disclosure.

These approved criteria supersede conflicting presentation/default-state requirements in earlier revisions. Earlier status, completed checklists, and evidence below remain historical; they do not validate this delta. Accepted decisions: ADRs 0014, 0015, and 0019–0022.

**Revision evidence (2026-10-15, `b73feab`):** Existing native-host cases reproduce new groups and items staying closed after global expansion, then pass with defaults inherited from Pi’s `toolOutputExpanded` flag. A later global action clears older retained choices before applying current state. The remapped `app.tools.expand` case exercises focused disclosure and composer dispatch with Ctrl+E; the former Ctrl+O default has no independent effect. Settings reconstruction retains the newer global choice. All 33 native-chat cases, typechecking, scoped lint/format, and whitespace checks pass on Pi 1.0.2. No keyboard handler, setting, persisted state, test case, test file, or seam was added. Ticket 07 covers enclosing activity; ticket 12 covers combined Pi 1.1.0 and physical-terminal acceptance.

**Review follow-up (`9337a56`):** Settings reconstruction no longer invents a collapsed group choice for a source call that has never owned a group. Genuine previous group choices and item choices remain intact. The existing Hide thinking case verifies globally expanding, rebuilding through native settings, then revealing thinking: both resulting groups retain expanded bodies. The regression failed before the repair and passed after it. All 116 chat cases and four core workflow cases pass on Pi 1.1.0 and 1.0.2; both reviews are clear. [Chat 12](12-mixed-session-acceptance.md) records combined results and physical limits.

## Prior accepted revision and evidence

**What to build:** Use one adapter path for built-ins and extensions, with type-derived group summaries and independently disclosed default activity bodies.

**Blocked by:** None — earlier navigation prerequisites are complete.

**Status:** resolved — approved activity-item delta; earlier evidence retained below

## Activity-item delta — approved 2026-10-15

- [x] Keep named built-in, core-tool, and fallback adapters and their explicit registry inside pi-chat. Use reliable provenance and effective arguments; unknown extensions retain a useful tool-name summary.
- [x] Collapsed groups and activity items show only `>` and their group or item summary. Open groups expose initially collapsed items; opened bodies use native built-in or generic default expanded rendering, bypassing custom extension renderers.
- [x] Derive the group summary from all included operation types. Share conservative command classification; preserve distinct-target counting and honest status wording.
- [x] Preserve independent mouse, keyboard, native body-click, and global disclosure controls, bounded layout, settings, and existing state lifetimes.
- [x] Update existing real-host cases and temporary checks; add no test cases or files.

**Revision evidence (2026-10-15, `f6004ab`):** The named built-in, core-tool, and fallback adapters and their explicit registry live in pi-chat. Effective arguments and verified provider provenance feed one activity-item path; the chat specification's operator catalog describes each mapping and its fallback. Group summaries aggregate item types, while collapsed items contain only their disclosure and specific summary. Opened items instantiate Pi's native built-in renderer or generic default component with only the applicable input and result. Custom extension renderers do not supply these bodies.

Existing native-chat, bounded-group, mixed-session, and activity cases cover independent controls, initially closed items, body-click closure, global expansion, streaming state, native settings, and source preservation. Primary Pi 1.1.0 passes all 116 chat cases at this revision; secondary 1.0.2 also passes 116/116. No test cases, test files, dependencies, or additional host seam were added. Combined verification and physical limits are recorded in [ticket 12](12-mixed-session-acceptance.md).

## Earlier revision

**Recorded status:** done

**Original delivery:** Inspect consecutive tool calls together while each tool retains its native presentation and disclosures.

- [x] Group every consecutive top-level call across assistant messages, stopping at visible commentary, visible thoughts, user items, other standalone activity, or explicit boundaries.
- [x] Verify eligible calls group across reasoning omitted by native Hide thinking, while visible commentary and meaningful boundaries still split groups; with Hide thinking off, thoughts separate groups.
- [x] Collapsed group summaries use the supported built-in wording and fixed order, count distinct edited paths and skill definitions, and use “Called a tool/tools” for unknown, replacement, or historically unproven calls; never scrape renderer titles or exclude calls.
- [x] Observed execution drives active reading, searching, listing, editing, command, skill, and generic summaries; cancellation and agent end clear active status, and missing results do not imply running agent activity.
- [x] Modified existing native-host cases verify the new summaries and fallback without adding test cases; expanded Pi tool controls, grouping boundaries, disclosures, thought labels, and source stay unchanged.
- [x] Groups begin collapsed while active; manual expansion survives growth and completion, and ordinary failure/cancellation does not toggle it.
- [x] Every group retains its outer disclosure, including a settled single finished call; groups start collapsed and manual expansion survives growth and completion.
- [x] Group toggles preserve child activity-body disclosure choices; global native tool expansion affects groups and activity bodies; manual choices survive redraw/resize and reset on reload/restart.
- [x] Provide the agreed Pi-registered disclosure-focus shortcut and configured selector navigation/confirm/cancel, plus pointer toggles and overlay priority; add no slash command or separate reader.
- [x] Use the larger `▶` / `▼` for collapsed/expanded group and agent activity disclosures at the normal terminal font size and line height. Keep expansion chevrons visible without an extra arrow. Highlight focused render group headers with Pi's native selection background; agent activity headers have no background and underline only their focused summary.
- [x] Collapsing excludes collapsed bodies from copied ranges and clears invalidated selections.
- [x] Native-host tests cover the revised singleton disclosure and focused-header presentation as well as grouping boundaries, native/custom tools, failure, manual/global choices, keyboard access, and reload defaults.

Hide thinking and focused-header verification: `node --test packages/pi-chat/test/*.test.ts` passed 116/116 against each of Pi 1.0.2 and 1.1.0, with no failures, cancellations, or skips. Modified existing cases verify that omitted reasoning no longer splits calls, toggling thinking back on restores its boundaries, and visible commentary still separates groups. Updated keyboard, pointer, and agent activity cases verify single chevrons, native selection backgrounds, focus clearing, live theme changes, and focus through streaming completion. Existing singleton, native/custom renderer, failure, and manual/global expansion checks also pass.

Group summary verification: the full real-host chat suite passed 116/116 on primary Pi 1.1.0 and again on secondary Pi 1.0.2, with no failures, skips, or cancellations. An updated repeated-tool case verifies the active native bash group summary, fixed-order “Edited a file, read files, ran commands,” repeated-path deduplication, and resize. Existing cases cover native/custom/replacement and historical fallback with grouping, disclosure, input, and settings reconstruction. A temporary `GroupSummaries` self-check covered supported active phrases, public skill metadata, distinct skill/edit paths, singular/plural order, unknown/replacement fallback, concurrent active selection and stop, source preservation, and entry rebinding. The updated mixed native-host case reads a registered review skill beside a native read and custom call, producing “Loaded a tool, called a tool, read files” while expanded controls, search, copy, retry, and interruption remain available. No test cases or test files were added, and no dependencies, private hooks, or version guards were added. Typecheck, repository lint and formatting, and `git diff --check` passed. The final repository suite passed 833/833 after the presentation and terminology changes. The primary Pi 1.1.0 chat suite passed 116/116; its focused active-summary case also passed after making the execution gate release on assertion failure. Physical-terminal acceptance remains pending.
