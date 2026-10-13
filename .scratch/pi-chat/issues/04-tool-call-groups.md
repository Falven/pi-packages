# 04: Group and toggle consecutive tool calls

**What to build:** Inspect consecutive tool calls together while each tool retains its native presentation and detail controls.

**Blocked by:** 03: Navigate, select, and copy chat content.

**Status:** done

- [x] Group every consecutive top-level call across assistant messages, stopping at visible commentary, visible thoughts, user items, other standalone activity, or explicit boundaries.
- [x] Verify eligible calls group across reasoning omitted by native Hide thinking, while visible commentary and meaningful boundaries still split groups; with Hide thinking off, thoughts separate groups.
- [x] Collapsed summaries use the supported built-in action labels and fixed order, count distinct edited paths and skill definitions, and use “Called a tool/tools” for unknown, replacement, or historically unproven calls; never scrape renderer titles or exclude calls.
- [x] Observed execution drives active reading, searching, listing, editing, command, skill, and generic labels; cancellation and agent end clear active status, and missing results do not imply running work.
- [x] Modified existing native-host cases verify the new labels and fallback without adding test cases; expanded Pi tool controls, grouping boundaries, folds, thought labels, and source stay unchanged.
- [x] Groups begin collapsed while active; manual expansion survives growth and completion, and ordinary failure/cancellation does not toggle it.
- [x] Every group retains its outer accordion, including a settled single finished call; groups start collapsed and manual expansion survives growth and completion.
- [x] Group toggles preserve child detail choices; global native tool expansion affects groups and tool details; manual choices survive redraw/resize and reset on reload/restart.
- [x] Provide the agreed Pi-registered disclosure-focus shortcut and configured selector navigation/confirm/cancel, plus pointer toggles and overlay priority; add no slash command or separate reader.
- [x] Use the larger `▶` / `▼` for closed/open group and work disclosures at the normal terminal font size and line height. Keep expansion chevrons visible without an extra arrow. Highlight focused activity-group headers with Pi's native selection background; work-history headers have no background and underline only their focused label.
- [x] Folding excludes closed bodies from copied ranges and clears invalidated selections.
- [x] Native-host tests cover the revised singleton accordion and focused-header presentation as well as grouping boundaries, native/custom tools, failure, manual/global choices, keyboard access, and reload defaults.

Hide thinking and focused-header verification: `node --test packages/pi-chat/test/*.test.ts` passed 116/116 against each of Pi 1.0.2 and 1.1.0, with no failures, cancellations, or skips. Modified existing cases verify that omitted reasoning no longer splits calls, toggling thinking back on restores its boundaries, and visible commentary still separates groups. Updated keyboard, pointer, and work-history cases verify single chevrons, native selection backgrounds, focus clearing, live theme changes, and focus through streaming completion. Existing singleton, native/custom renderer, failure, and manual/global expansion checks also pass.

Action-label verification: the full real-host chat suite passed 116/116 on primary Pi 1.1.0 and again on secondary Pi 1.0.2, with no failures, skips, or cancellations. An updated repeated-tool case verifies the active native bash label, fixed-order “Edited a file, read files, ran commands,” repeated-path deduplication, and resize. Existing cases cover native/custom/replacement and historical fallback with grouping, fold, input, and settings reconstruction. A temporary `ActionLabels` self-check covered supported active phrases, public skill metadata, distinct skill/edit paths, singular/plural order, unknown/replacement fallback, concurrent active selection and stop, source preservation, and entry rebinding. The updated mixed native-host case reads a registered review skill beside a native read and custom call, producing “Loaded a tool, called a tool, read files” while expanded controls, search, copy, retry, and interruption remain available. No test cases or test files were added, and no dependencies, private hooks, or version guards were added. Typecheck, repository lint and formatting, and `git diff --check` passed. The final repository suite passed 833/833 after the presentation and terminology changes. The primary Pi 1.1.0 chat suite passed 116/116; its focused active-label case also passed after making the execution gate release on assertion failure. Physical-terminal acceptance remains pending.
