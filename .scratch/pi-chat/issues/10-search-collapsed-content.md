# 10: Find and reveal content inside collapsed disclosures

**What to build:** Find retained source and reveal the correct independently disclosed activity item without opening its siblings.

**Blocked by:** Core 03: continuation/replay; Core 04: per-file patches; Core 05: images.

**Status:** ready-for-agent — approved activity-item delta; earlier evidence retained below

## Activity-item delta — approved 2026-10-15

- [ ] Bind split items to original call/result source references and route reliable command, file, and output hits to the matching item.
- [ ] When source cannot identify one split operation, reveal and highlight its owning call without fabricating a match or reviving the aggregate custom renderer.
- [ ] Preserve source text, active-branch restriction, native Find controls, and copying of expanded content only.

## Earlier revision

**Recorded status:** done

**Original delivery:** Use native search input to find readable source text independently of disclosures and reveal the matching conversation occurrence.

- [x] Search retained readable fields already represented in the chat, including messages, thoughts, commands, and tool results on the active branch and ancestry only.
- [x] Match readable Markdown labels and code bodies, excluding structural markup and hidden destinations; use source references, revisions, and match ranges rather than a joined corpus.
- [x] Selecting a result opens ancestor disclosures and reveals the owning occurrence through logical viewports.
- [x] Highlight reliable text ranges; otherwise highlight the owning tool call without changing its presentation or adding an excerpt/preview.
- [x] Revalidate results when source content or the active branch changes, including duplicate text and transforming/omitting renderers.
- [x] Keep extracted activity headings searchable in canonical thought source; a hit opens the agent activity and reveals its thought without reinserting the heading, adding an excerpt/placeholder, or highlighting text that is not rendered.
- [x] Reuse native search input and action routing with an owned source-search controller.
- [x] Verify keyboard search, hidden matches, reveal, highlighting, transforms, stale results, and branch exclusion through the native host.
- [x] Verify Find temporarily reveals only the selected hidden thinking occurrence as native Markdown; navigation/query changes move or remove the reveal and closing Find removes it, without changing Hide thinking.
- [x] Verify extracted-heading hits and unchanged ordinary thought search through the real host.

Hide thinking verification: `node --test packages/pi-chat/test/*.test.ts` passed 116/116 against each of Pi 1.0.2 and 1.1.0, with no failures, cancellations, or skips. Modified existing cases verify temporary thought reveal for body and extracted-heading hits, next/previous navigation, no-match queries, cleanup on close, native text highlighting, and an unchanged global visibility preference. Physical terminal acceptance remains pending under ticket 12.
