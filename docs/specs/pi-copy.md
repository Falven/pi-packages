# pi-copy specification

**Status:** implemented and verified on installed Pi/TUI 1.1.0 at `a83094c`, integrated into local `main`. The affected suite passes 147/147; [ticket 02](../../.scratch/pi-copy/issues/02-separate-response-copy-footer.md) records the checks, review limits, and cleanup evidence.

**Accepted scope:** Extract the current chat copy functionality into a dependency package and guarantee one blank display row before Copy response. The user accepted the package dependency, unchanged copied text, existing host testing seam, and implementation on 2026-10-17.

**Tracker:** [Copy extraction](../../.scratch/pi-copy/issues/01-extract-chat-copy-behavior.md) → [Response spacing](../../.scratch/pi-copy/issues/02-separate-response-copy-footer.md). Both are local Markdown tickets. Existing resolved chat tickets retain their historical evidence.

## Problem Statement

Pi users need a clear gap between a final answer and its Copy response control. The current layout appends the control without owning that gap, so spacing depends on the answer's rendering. Maintainers also need all existing chat copy behavior in its own package without changing which content can be copied or how copying works.

## Solution

Provide `pi-copy` as a package used directly by `pi-chat`. Retain Copy command, Copy output, Copy diff, and Copy response exactly as they work today, with a consistent blank display row between the final response and its copy control. Installing chat continues to supply copying automatically.

Chat retains ownership of the conversation, semantic activity items, final-response recognition, layout, selection, source Find, and extension lifecycle. Copy owns its controls, payload formatting, clipboard execution, feedback, and cleanup through a small interface supplied by chat.

## User Stories

1. As a Pi user, I want one blank display row before Copy response, so that the action is visually separate from the answer.
2. As a Pi user, I want that gap after prose, lists, and code blocks, so that answer formatting does not determine control spacing.
3. As a Pi user, I want the same gap after redraw, resize, and history reload, so that the final-response footer stays predictable.
4. As a Pi user, I want copying to preserve the answer's original Markdown and whitespace, so that a display-only gap never changes pasted text.
5. As a Pi user, I want one Copy response action after the complete settled final response, so that a multipart answer is copied together.
6. As a Pi user, I want final-response copying restricted to the selected text parts, so that thoughts, commentary, and tool activity stay out of my answer.
7. As a Pi user, I want older final responses to retain their own copy actions, so that a newer answer cannot replace what I copy.
8. As a Pi user, I want streaming and unrecognized responses to keep their existing action eligibility, so that copying does not introduce a new final-answer detector.
9. As a Pi user, I want Copy command beside an open command's native heading, so that I can reuse its exact quotes, whitespace, and multiline script.
10. As a Pi user, I want Copy output at the bottom inside successful and failed command result panels, so that I can copy retained output beyond the native preview and viewport.
11. As a Pi user, I want a running command to copy its current retained output snapshot, so that later updates do not leave copying stale.
12. As a Pi user, I want Copy diff below an edit's actual retained patch inside its result panel, so that headers, context, additions, deletions, and newlines survive copying.
13. As a Pi user, I want edits without an actual diff to offer Copy output, so that status text and failures remain copyable without inventing file history.
14. As a Pi user, I want each operation or file to copy its authoritative payload, so that unrelated parent results do not enter the clipboard.
15. As a Pi user, I want terminal styling and presentation-only omission notices excluded, so that copied output contains retained source text.
16. As a Pi user, I want retained failure text preserved, so that copying an unsuccessful operation still explains its outcome.
17. As a Pi user, I want closed items to remain summary-only and open previews to retain their controls, so that copying respects disclosure choices.
18. As a Pi user, I want copy controls only on the existing eligible commands, edits, and final responses, so that extraction does not add actions to other content.
19. As a Pi user, I want copy clicks to consume only their own activation, so that they do not select text or toggle output or ancestors.
20. As a keyboard user, I want enabled copy controls in the existing navigation order, so that confirmation, cancellation, and focus recovery continue to work.
21. As a Pi user, I want explicit copy actions to use their own payload regardless of selection, so that the action always copies its labeled content.
22. As a Pi user, I want native selection copying to retain its current behavior, so that extracting the controls does not change my selected text.
23. As a Pi user, I want empty or unavailable actions disabled, so that they cannot overwrite the clipboard or report success.
24. As a Pi user, I want a partial-retention hint when copying surviving output, so that omitted output is not mistaken for a complete result.
25. As a Pi user, I want Copied only after the clipboard operation succeeds, so that feedback reflects the actual result.
26. As a Pi user, I want clipboard failures reported through the existing native status mechanism, so that errors remain visible without moving the conversation.
27. As a Pi user, I want repeated activation during a pending copy ignored, so that one control does not issue overlapping writes.
28. As a Pi user, I want feedback to retain the control's original geometry and timing, so that copying does not move content or its click target.
29. As a Pi user, I want theme, padding, panel backgrounds, focus styling, and narrow-terminal layout preserved, so that controls fit the existing view.
30. As a Pi user, I want pending clipboard work and feedback cleaned up after reload or session replacement, so that disposed controls cannot update a new view.
31. As a Pi user, I want controls and feedback excluded from selection, source Find, conversation history, and provider inputs, so that actions never become conversation content.
32. As a Pi user, I want existing reading anchors and scroll behavior preserved, so that the new response gap does not move me to unrelated content.
33. As a Pi user, I want chat installation to include copy functionality automatically, so that the extraction adds no setup step or extension-order rule.
34. As a maintainer, I want copy behavior owned by one package, so that a copy fix does not require duplicate implementations across chat callers.
35. As a maintainer, I want copy independent of chat's concrete host and activity implementation, so that package ownership does not create circular dependencies.
36. As a maintainer, I want packaged chat to resolve its copy dependency, so that behavior verified in the workspace also works after packaging.

## Implementation Decisions

- **Package ownership.** `pi-copy` is a TypeScript library with a public package export and a direct workspace dependency from chat. It owns the four existing controls, heading composition, copy-specific payload formatting and native output normalization, clipboard writes, pending/success state, status ownership, and disposal. Move existing logic with its validation and error handling. Use Pi's installed native dependencies and conventions.
- **Small interface.** Chat supplies the owning item's current source data or selected final-response parts, theme and padding, rendering/status callbacks, and existing input/navigation integration. Copy has no runtime or type dependency on chat and does not accept its full native host. Keep single-use integration local; add no general action framework or registration protocol.
- **Chat ownership.** Semantic tool classification, operation projection, final-message and final-part recognition, stable occurrence identity, settlement, cancellation, disclosure state, reading anchors, selection, and source Find remain in chat. Its mounting and geometry hooks consume the extracted controls without creating another renderer or source buffer.
- **Existing placement.** Command copying remains beside the native command heading, falling onto its own line when necessary. Output and diff copying remain compact right-aligned footers inside the successful or failed result panel, sharing its background and padding. Only open eligible items expose controls, in preview and expanded-output states alike. One left-aligned response control remains after the entire settled answer outside agent activity.
- **Response separator.** Exactly one blank display row separates the last rendered final-response content from its copy control. Reuse an existing blank boundary row where present rather than stacking gaps. The separator belongs only to layout, works after all supported Markdown endings and reconstruction, and never changes copied source bytes. Preserve existing disabled behavior for an eligible empty final; do not fabricate answer content or create controls when no final qualifies.
- **Command and output payloads.** Read authoritative command arguments or operation source at activation. Join retained output text using the existing text-part convention, preserve meaningful whitespace and failure text, remove terminal styling and proven presentation-only omission notices, and preserve the current native truncation normalization. Copy the owning operation's payload, including intentionally shared source where already supported. Never rerun commands, reread current files, recover discarded data, or substitute the whole parent result for each operation.
- **Edit payloads.** Prefer an actual raw retained patch or diff. Retain the current decorated-diff recognition and textual-result fallback. Counts, previews, and current file contents do not establish a diff. Keep exact per-file payload ownership and partial-output reporting.
- **Final payloads.** Use chat's recognized settled final and selected text parts in source order with the existing concatenation convention. Preserve original Markdown, including fences, links, lists, and text-block whitespace. Exclude thoughts, commentary, activity, elapsed summaries, controls, and the separator. Bind historical actions to their source occurrence rather than a global last answer.
- **Clipboard and feedback.** Await Pi's public clipboard helper. Ignore empty values and repeated activation while pending. Preserve the current Copied label, 1.5-second feedback lifetime, failure text, partial-retention hint, and fixed geometry. Status cleanup is scoped to its owning action. Disposal clears timers and prevents asynchronous completion from updating a replaced UI.
- **Interaction isolation.** Reuse existing pointer capture, configured selector navigation, focus styling, reveal, and cancellation. Keep the native message-copy shortcut and selection preference. Copy controls and feedback stay outside selected source content, source Find, retained messages, and provider inputs. Preserve control coordinates across wrapping and panel padding.
- **Distribution and documentation.** Wire the workspace dependency and lockfile, include exported sources in the package, and document that chat is the consumer. Extract copy-specific requirements from the chat spec, retaining only its integration obligations and historical evidence. Existing ADRs and resolved tickets remain attributable to their original revisions.

## Testing Decisions

- Retain the accepted primary seam: the real Pi runtime and normal extension loading, controlled provider stages, recording terminal, real keyboard/mouse/resize/lifecycle actions, and captured native clipboard writes. Assertions concern emitted content, payload bytes, user-visible feedback, navigation, and preserved session/provider content.
- Reuse existing command/edit, final-phase, multipart-response, history, and combined-workflow cases. Keep these integration checks with their existing host coverage; package extraction does not justify a second mock host or internal-class tests.
- Establish the extraction baseline with existing behavior checks. For the separator, strengthen an existing final-response case, observe its failure before the layout change, then verify prose, list/code endings, reload, resize, and unchanged copied Markdown. Prefer existing cases and fixtures; add no redundant suite or lower test seam.
- Exercise empty/omitted/partial payloads, failed writes, pending writes across disposal, keyboard navigation, pointer consumption, selection and Find exclusion, panel backgrounds, narrow widths, multiple operations, historical answers, and source/provider preservation through the same seam.
- Run affected chat and combined-presentation suites on installed Pi, workspace typecheck, relevant lint/format, and whitespace checks. Verify packed exports and dependency resolution as distribution checks. Do not upgrade dependencies or build another Pi-version matrix for this extraction.
- Record exact tested revisions and commands. Captured clipboard and recording-terminal checks do not establish physical-terminal rendering or OS clipboard transport; report those separately only if performed. Stop expanding checks after the relevant checks pass unless changes or failures justify more work.

## Out of Scope

- An independently loaded copy extension or standalone copy integration with stock Pi; a second chat host, renderer, history buffer, or lifecycle.
- New copy actions for reads, searches, directory listings, skill reads, generic output/failures, thoughts, commentary, images, user messages, groups, or turn headers; Copy file or Copy path; image clipboard support.
- Composer copy/cut/paste behavior, native selection transport, command execution, semantic tool classification, final-response detection, Markdown transformation, model controls, or provider contracts.
- New shortcuts, settings, persisted state, menus, configuration systems, third-party dependencies, runtime upgrades, or changes to installed Pi sources.
- Extra formatting inside copied text, recovery of omitted content, or new interpretation of command output and diffs.

## Further Notes

[ADR 0026](../adr/0026-copy-actions-in-a-dependent-package.md) records the dependency and ownership decision. [ADR 0027](../adr/0027-copy-retained-source-and-separate-presentation.md) records source fidelity and presentation isolation. The [chat spec](pi-chat.md) remains authoritative for activity classification, final-response recognition, and host integration.

This is a behavior-preserving extraction plus one visual spacing change. The accepted discussion settles package independence, source fidelity, and the existing testing seam; ticket granularity is an implementation choice within that authorization. Local tracker publication uses `ready-for-agent`, then `claimed` and `resolved` as work proceeds. No remote issue or PR is required.
