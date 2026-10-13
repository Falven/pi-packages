# 03: Preserve provider edits and prose boundaries

**What to build:** Inline skills preserve custom provider edits and work in ordinary formatted prose and punctuation contexts.

**Blocked by:** None (can start immediately).

**Status:** complete

**Specification:** [pi-skill-references](../../../docs/specs/pi-skill-references.md).

- [x] Completion restores preceding prose at the chosen reference without confusing provider-added copies on the same line. Ambiguous results leave the original draft intact.
- [x] Skill completion works inside Markdown emphasis while code, link destinations, and paths retain their exclusions.
- [x] Unicode prose punctuation does not suppress a canonical reference. Exact native catalog names take precedence, and filename suffixes remain literal.
- [x] Verify custom provider output, caret placement, literal exclusions, and instruction delivery through the public Pi host.

**Verification:** The full suite passes all 708 tests. Public-host checks exercise provider-added duplicate references, shifted output and caret positions, missing or duplicated completion anchors, formatted prose, Unicode punctuation, exact catalog names, and literal exclusions. A combined composer and skill-reference check verifies automatic completion inside emphasis, retained closing delimiters, caret placement, and undo. An independent review found no further issues in these paths. Live terminal checks were not repeated.
