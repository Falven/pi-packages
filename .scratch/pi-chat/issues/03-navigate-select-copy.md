# 03: Navigate, select, and copy chat content

**What to build:** Copy exact commands and retained command/edit results from their open native activity items without changing disclosure, selection, or reading position.

**Blocked by:** None for this delta; the established native activity presentation is already integrated.

**Status:** resolved — component-copy implementation; combined supported-host validation remains in Chat 12

## Component-copy delta — approved 2026-10-16

- [x] Only semantic commands and edits receive controls. Successful and failed commands have Copy command beside the native heading and Copy output below the result. Edits have Copy diff for an actual retained diff, otherwise Copy output for retained text.
- [x] Read authoritative arguments/operation payloads at activation, preserving exact multiline scripts and all retained output beyond preview and viewport. Keep per-operation/per-file ownership and intentional existing payload sharing; exclude presentation labels/escapes and never reread or execute anything.
- [x] Prefer actual raw patches over decorated diffs. Do not infer diffs from counts, arguments, speculative previews, or current files. Include actual failure text and distinguish unavailable/partial retained output.
- [x] Use the public clipboard helper, await completion, show fixed-geometry Copied feedback only on success, report errors natively, disable empty values, and clean up timers/in-flight callbacks across disposal and reconstruction.
- [x] Consume copy clicks; retain preview/full output, ancestor disclosure choices, reading position, images, padding, narrow layout, and native theme. Extend existing keyboard navigation and focus recovery without new shortcuts. Exclude controls from selection and source Find; preserve global selection-copy behavior.
- [x] Extend existing real-host cases only, with captured clipboard transport and isolated rejection fallbacks. No new test cases, test files, test seams, dependencies, settings, or persistence schema.

The accepted spec and ADRs 0014, 0019, and 0022 govern this delta. Combined supported-host evidence belongs to Chat 12. Earlier completed evidence below remains historical.

**Revision evidence (2026-10-16):** A local copy action composes the native command heading and command/edit result footer. It reads the current semantic item's retained payload at activation, preserves native preview/full output, and uses the public clipboard helper. The adapter retains original merged error content before adding presentation labels. Native raw patches take precedence; retained headerless file patches use their existing successful edit metadata to distinguish actual changes from plain error text. Keyboard traversal includes enabled controls, and source Find and selection exclude control spans. Native status reports errors and partial retention; disposal makes pending copy completion inert.

Three existing Pi 1.0.2 recording-terminal cases cover exact multiline scripts, successful/failed commands, 240-line output beyond the preview and viewport, streaming updates, raw native patch preference, per-file and shared operation ownership, output fallback, omitted/partial results, native clipboard rejection, reload/session replacement during pending copies, 18-column layout, collapse/reopen, keyboard focus and confirmation, selection across controls, and global selection-first copying. Clipboard writes were captured at the native transport; the macOS rejection fallback used an isolated failing `pbcopy` stub. Scoped formatting, lint, TypeScript, and whitespace checks passed. No physical terminal or OS clipboard check was performed; final-answer actions are Chat 07's delta.

## Prior native-flow revision

**What to build:** Scroll the conversation directly over its existing native side padding while preserving native child input, scrollbar behavior, selection, and copying.

**Blocked by:** 05: Expand render groups and native activity bodies in conversation flow.

**Status:** resolved — native padding gutters implemented in `5c28720`

## Native-flow and disclosure delta — approved 2026-10-15

- [x] Reuse Pi’s existing outputPad on both sides of the whole conversation viewport, including messages, disclosure headers, and activity bodies; count it once. Zero padding means no gutter. Add no inset, minimum width, columns, or setting; leave composer and dock layout unchanged.
- [x] Route wheel input over either conversation gutter or a disclosure header directly to the primary conversation. Preserve native scrollbar hover, track, drag, and priority where its edge overlaps padding, including always, auto, and hidden modes.
- [x] Offer interior body input to native children first. Where native content has its own scrolling, preserve child-first scrolling and pass unused wheel movement to the conversation at the edge. Do not create a body viewport or let painting windows consume conversation wheel movement.
- [x] Preserve content width, meaningful indentation, native child coordinates, reading anchors, end following, image ownership, and source order across live padding changes and resize. Selection/highlighting/copy exclude gutter and alignment padding without trimming content indentation.
- [x] Update relevant existing real-Pi host cases for zero and nonzero/live padding, both gutter edges, headers, child handoff, native scrollbar modes, selection/copy, and resize. Reuse the established fixture; add no test cases, files, or alternate seam.

**Revision evidence (2026-10-15, `5c28720`):** Native pointer dispatch excludes the existing output padding before offering input to children. Interior coordinates and native scrollbar handling remain intact; standard output scrolls with the conversation. Selection, Find painting, and copying exclude known native padding and visible scrollbar chrome while preserving source indentation and image painting windows. Opaque custom renderers retain their own text bounds.

The established Pi 1.0.2 host checks passed 39/39 after the main change. After the final scrollbar clipping correction, the three affected selection cases and 27/27 Find cases passed. The final supported-padding case, typecheck, scoped lint/format, and whitespace checks passed. Existing cases were updated; no cases, fixtures, settings, or wrappers were added. Primary Pi 1.1.0 and physical-terminal acceptance remain in Chat 12/Core 06.

These approved criteria supersede conflicting presentation/default-state requirements in earlier revisions. Earlier status, completed checklists, and evidence below remain historical; they do not validate this delta. Accepted decisions: ADRs 0014, 0015, and 0019–0022.

## Prior accepted revision and evidence

**What to build:** Navigate the main chat viewport and copy the intended rendered text while preserving native input, composer behavior, and overlay focus.

**Blocked by:** 02: Display native conversations in the owned chat view.

**Status:** done

- [x] Use native input decoding and effective keybindings for main-view scrolling and prompt navigation.
- [x] Preserve the first visible occurrence and local row as heights change, or continue following the end when already following.
- [x] Map selection endpoints through occurrence, row, and terminal-cell geometry, including Unicode and offscreen expanded rows.
- [x] Reuse native message-copy, copy-on-select, and clipboard transport; do not introduce another clipboard implementation.
- [x] Offer child pointer handlers their own events first and preserve native overlays and focus restoration.
- [x] Ordinary scrolling preserves selection; reflow or changed selected content clears invalidated ranges.
- [x] Verify displayed frames, input routing, copied text at the native boundary, resize, and overlay interactions through the real host.
