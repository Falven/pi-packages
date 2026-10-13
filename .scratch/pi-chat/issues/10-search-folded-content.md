# 10: Find and reveal content inside closed folds

**What to build:** Use native search input to find readable source text independently of folds and reveal the matching conversation occurrence.

**Blocked by:** 06: Show temporary thoughts inline; 07: Fold settled work while keeping the final response visible.

**Status:** ready-for-agent

- [ ] Search retained readable fields already represented in the chat, including messages, thoughts, commands, and tool results on the active branch and ancestry only.
- [ ] Match readable Markdown labels and code bodies, excluding structural markup and hidden destinations; use source references, revisions, and match ranges rather than a joined corpus.
- [ ] Selecting a result opens ancestor folds and reveals the owning occurrence through logical viewports.
- [ ] Highlight reliable text ranges; otherwise highlight the owning tool call without changing its presentation or adding an excerpt/preview.
- [ ] Revalidate results when source content or the active branch changes, including duplicate text and transforming/omitting renderers.
- [ ] Reuse native search input and action routing with an owned source-search controller.
- [ ] Verify keyboard search, hidden matches, reveal, highlighting, transforms, stale results, and branch exclusion through the native host.
