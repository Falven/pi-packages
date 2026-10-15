# Search retained conversation content independently of disclosures

Search retained readable source on the active branch and its ancestry independently of disclosures, compaction, and Hide thinking. Selecting hidden thinking temporarily reveals only that occurrence as native Markdown; navigation or query changes move or remove the reveal, and closing Find removes it without changing Hide thinking. This keeps retained content discoverable while [Pi owns the source](0012-transcript-preserves-native-content.md).

## Consequences

Pi's branch readers expose retained pre-compaction entries, while its native chat view is reconstructed from a [compaction-aware projection](/Users/fran/Source/pi-packages/node_modules/@earendil-works/pi-coding-agent/dist/core/session-manager.d.ts:190) that omits summarized originals. The [owned chat view](0022-native-rows-in-an-owned-transcript.md) materializes missing historical rows using native presenters, preserving source order without changing Pi's session projection. Its source-search controller reuses Pi's search input because native Find only indexes rendered lines.

Markdown matching includes link labels and code bodies, excluding structural markup and hidden destinations. Extracted activity headings remain searchable without being reinserted into revealed prose; highlights apply only to rendered text. Other hits open the necessary disclosures and reveal their occurrence. Tool renderers may omit retained source text or transform it. Highlighting that call satisfies navigation without changing its presentation to expose the exact source text; no temporary excerpt or separate search preview is added.
