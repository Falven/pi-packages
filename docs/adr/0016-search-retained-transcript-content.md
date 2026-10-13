# Search retained conversation content independently of folds

Chat search covers readable text from every retained message, thought, command, and tool output in the active branch and its ancestry, including pre-compaction history and closed folds. Markdown matching includes link labels and code bodies and excludes structural markup and hidden link destinations. Extracted activity headings remain searchable in canonical thought source. Selecting such a hit opens its work history and reveals the thought occurrence without reinserting the heading or adding an excerpt; exact text highlighting applies only where text is rendered. Other results open the necessary folds, reveal the owning occurrence, and highlight exact matching text when reliable or the owning tool call when its renderer prevents reliable text highlighting, while [Pi owns the source text](0012-transcript-preserves-native-content.md).

## Consequences

Pi's branch readers expose retained pre-compaction entries, while its native chat view is reconstructed from a [compaction-aware projection](/Users/fran/Source/pi-packages/node_modules/@earendil-works/pi-coding-agent/dist/core/session-manager.d.ts:190) that omits summarized originals. The [owned chat view](0022-native-rows-in-an-owned-transcript.md) materializes missing historical rows using native presenters, preserving source order without changing Pi's session projection. Its source-search controller reuses Pi's search input because native Find only indexes rendered lines.

Tool renderers may omit retained source text or transform it. Highlighting that call satisfies navigation without changing its presentation to expose the exact source text; no temporary excerpt or separate search preview is added.
