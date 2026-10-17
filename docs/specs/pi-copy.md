# pi-copy specification

**Status:** independent-plugin correction in progress. Independent chat integration is implemented at `8902b5f`; native decoration and distribution verification are tracked in [ticket 04](../../.scratch/pi-copy/issues/04-native-pi-decoration.md). The preceding library extraction and response spacing were verified at `a83094c` and integrated into local `main`; [ticket 02](../../.scratch/pi-copy/issues/02-separate-response-copy-footer.md) retains that historical evidence.

**Accepted scope:** Independently install `pi-copy` and `pi-chat`, with no dependency between them and no loss of current functionality. Copy also decorates stock Pi's output boxes and final assistant responses. Preserve one blank display row before Copy response and exact copied text. The user's correction and instruction to continue on 2026-10-17 replace the earlier library design.

**Tracker:** historical [Copy extraction](../../.scratch/pi-copy/issues/01-extract-chat-copy-behavior.md) and [Response spacing](../../.scratch/pi-copy/issues/02-separate-response-copy-footer.md) are resolved. The correction is [Independent chat integration](../../.scratch/pi-copy/issues/03-independent-chat-integration.md) → [Native Pi decoration](../../.scratch/pi-copy/issues/04-native-pi-decoration.md). All are local Markdown tickets.

## Problem Statement

Pi users need a clear gap between a final answer and its Copy response control. The current layout appends the control without owning that gap, so spacing depends on the answer's rendering. Maintainers also need all existing chat copy behavior in its own package without changing which content can be copied or how copying works.

## Solution

Provide `pi-copy` as its own Pi extension. Retain Copy command, Copy output, Copy diff, and Copy response exactly as they work today, with a consistent blank display row between the final response and its copy control. Installing copy alone decorates native Pi; installing chat alone provides chat presentation without copy controls; installing both provides their combined behavior. Each package is explicitly installed, including editable local installations.

Chat retains ownership of the conversation, semantic activity items, final-response recognition, layout, selection, source Find, and its extension lifecycle. Copy owns its controls, panel decoration, payload formatting, clipboard execution, feedback, and cleanup. An optional interface integrates those controls with the active transcript owner; stock Pi uses copy's native adapter.

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
33. As a Pi user, I want chat and copy installed independently, so that installing or removing either does not install or remove the other.
34. As a maintainer, I want copy behavior owned by one package, so that a copy fix does not require duplicate implementations across chat callers.
35. As a maintainer, I want copy independent of chat's concrete host and activity implementation, so that package ownership does not create circular dependencies.
36. As a maintainer, I want each packaged extension to load without the other package present, so that workspace links cannot hide an installation dependency.
37. As a Pi user, I want copy controls on native command/edit boxes and at the end of final assistant responses without chat installed, so that copying works with stock Pi.
38. As a Pi user, I want both extension load orders to produce one set of controls, so that installation order does not duplicate or hide actions.
39. As a Pi user, I want reload, session replacement, and disabling either extension to remove its hooks and stale feedback, so that the remaining extension stays usable.
40. As a maintainer, I want the existing real-Pi behavior cases to exercise both extensions explicitly, so that the independence correction preserves every previously covered copy behavior.

## Implementation Decisions

- **Package ownership.** `pi-copy` is a Pi extension with its own entry point and no dependency on chat. Chat has no runtime, type, optional, or peer dependency on copy. Copy owns the four existing controls, heading composition, native panel decoration, payload formatting and native output normalization, clipboard writes, pending/success state, status ownership, and disposal. Preserve existing validation and error handling and reuse Pi's installed dependencies.
- **Small optional interface.** Chat supplies current item sources or selected final-response parts, theme and padding, render/status callbacks, and input/navigation integration. Copy supplies controls and panel decoration through a narrow structural agreement over Pi's existing event bus. All extensions register before session attachment; either load order works. Keep the agreement local to each package, without a shared runtime package or a generic action framework.
- **Chat ownership.** Semantic tool classification, operation projection, final-message and final-part recognition, stable occurrence identity, settlement, cancellation, disclosure state, reading anchors, selection, and source Find remain in chat. Chat integrates optional control geometry; absence of the provider creates no controls and no response-control spacing.
- **Native ownership.** Without a cooperating transcript owner, copy decorates the existing native assistant and tool components. It reads original message/argument/result data and owns only its decoration and disposal. It does not replace Pi's transcript, renderer, selection model, or editor. Native final-response selection excludes thoughts and explicit commentary and observes completion and failure. Use scoped reversible instance hooks where public Pi hooks cannot attach inline controls, and preserve native output and notices.
- **Existing placement.** Command copying remains beside the native command heading, falling onto its own line when necessary. Output and diff copying remain compact right-aligned footers inside the successful or failed result panel, sharing its background and padding. Only open eligible items expose controls, in preview and expanded-output states alike. One left-aligned response control remains after the entire settled answer outside agent activity.
- **Response separator.** Exactly one blank display row separates the last rendered final-response content from its copy control. Reuse an existing blank boundary row where present rather than stacking gaps. The separator belongs only to layout, works after all supported Markdown endings and reconstruction, and never changes copied source bytes. Preserve existing disabled behavior for an eligible empty final; do not fabricate answer content or create controls when no final qualifies.
- **Command and output payloads.** Read authoritative command arguments or operation source at activation. Join retained output text using the existing text-part convention, preserve meaningful whitespace and failure text, remove terminal styling and proven presentation-only omission notices, and preserve the current native truncation normalization. Copy the owning operation's payload, including intentionally shared source where already supported. Never rerun commands, reread current files, recover discarded data, or substitute the whole parent result for each operation.
- **Edit payloads.** Prefer an actual raw retained patch or diff. Retain the current decorated-diff recognition and textual-result fallback. Counts, previews, and current file contents do not establish a diff. Keep exact per-file payload ownership and partial-output reporting.
- **Final payloads.** Use chat's recognized settled final and selected text parts in source order with the existing concatenation convention. Preserve original Markdown, including fences, links, lists, and text-block whitespace. Exclude thoughts, commentary, activity, elapsed summaries, controls, and the separator. Bind historical actions to their source occurrence rather than a global last answer.
- **Clipboard and feedback.** Await Pi's public clipboard helper. Ignore empty values and repeated activation while pending. Preserve the current Copied label, 1.5-second feedback lifetime, failure text, partial-retention hint, and fixed geometry. Status cleanup is scoped to its owning action. Disposal clears timers and prevents asynchronous completion from updating a replaced UI.
- **Interaction isolation.** Reuse existing pointer capture, configured selector navigation, focus styling, reveal, and cancellation. Keep the native message-copy shortcut and selection preference. Copy controls and feedback stay outside selected source content, source Find, retained messages, and provider inputs. Preserve control coordinates across wrapping and panel padding.
- **Distribution and documentation.** Remove the workspace dependency and lockfile link, publish copy's extension entry and sources, and document separate installation. Supersede the dependent-package ADR and revise chat's integration obligations. Existing resolved tickets remain attributable to their original revisions. Register both editable packages explicitly in the user's Pi after integration into main.

## Testing Decisions

- Retain the accepted primary seam: the real Pi runtime and normal extension loading, controlled provider stages, recording terminal, real keyboard/mouse/resize/lifecycle actions, and captured native clipboard writes. Assertions concern emitted content, payload bytes, user-visible feedback, navigation, and preserved session/provider content.
- Reuse existing command/edit, final-phase, multipart-response, history, and combined-workflow cases. Keep these integration checks with their existing host coverage; package extraction does not justify a second mock host or internal-class tests.
- Preserve the extraction baseline with the existing behavior checks. Strengthen existing cases and use temporary assert-based probes for native-only, chat-only, and combined installations in both orders. Add no new tests without the user's request. Verify prose, list/code endings, reload, resize, and unchanged copied Markdown through the same host seam.
- Exercise empty/omitted/partial payloads, failed writes, pending writes across disposal, keyboard navigation, pointer consumption, selection and Find exclusion, panel backgrounds, narrow widths, multiple operations, historical answers, and source/provider preservation through the same seam.
- Run affected chat and combined-presentation suites on installed Pi, workspace typecheck, relevant lint/format, and whitespace checks. Load each packed extension with the other absent and both together to verify independent distribution. Do not upgrade dependencies or build another Pi-version matrix.
- Record exact tested revisions and commands. Captured clipboard and recording-terminal checks do not establish physical-terminal rendering or OS clipboard transport; report those separately only if performed. Stop expanding checks after the relevant checks pass unless changes or failures justify more work.

## Out of Scope

- A second transcript, replacement renderer, shared runtime package, or package installation dependency between chat and copy.
- New copy actions for reads, searches, directory listings, skill reads, generic output/failures, thoughts, commentary, images, user messages, groups, or turn headers; Copy file or Copy path; image clipboard support.
- Composer copy/cut/paste behavior, native selection transport, command execution, semantic tool classification, final-response detection, Markdown transformation, model controls, or provider contracts.
- New shortcuts, settings, persisted state, menus, configuration systems, third-party dependencies, runtime upgrades, or changes to installed Pi sources.
- Extra formatting inside copied text, recovery of omitted content, or new interpretation of command output and diffs.

## Further Notes

[ADR 0029](../adr/0029-copy-as-an-independent-extension.md) records independent installation and ownership, superseding the library design in [ADR 0026](../adr/0026-copy-actions-in-a-dependent-package.md). [ADR 0027](../adr/0027-copy-retained-source-and-separate-presentation.md) records source fidelity and presentation isolation. The [chat spec](pi-chat.md) remains authoritative for chat's activity classification, final-response recognition, and host integration.

This correction preserves the existing behavior and spacing while making both plugins independently installable and useful. The accepted discussion and instruction to continue settle source fidelity, final-response controls, independent installation, and the existing testing seam; ticket granularity is an implementation choice within that authorization. Local tracker publication uses `ready-for-agent`, then `claimed` and `resolved`. No remote issue or PR is required.
