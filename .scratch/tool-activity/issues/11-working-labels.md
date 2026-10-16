# 11: Working labels from current activity

**What to build:** The native working indicator identifies current reads, searches, listings, edits, commands, or the latest usable reasoning line using the installed desktop app's selection rules. It falls back to `Thinking` only when no specific label is available.

**Blocked by:** None (can start immediately). Existing command recognition, generic activity facts, and native-host integration are complete.

**Status:** implemented; integration verification in progress under Ticket 12.

- [x] Plain, partial, and formatted reasoning produce the reference's latest usable line and remain available across thinking/message completion.
- [x] Native and independently declared operations update the same indicator with reference labels, including registered skills, source ordering, completion, and late updates after the parent call returns.
- [x] A current trailing read/search/list exploration selects its latest running operation, otherwise its latest operation; other slices select their latest running operation before reasoning/default fallback.
- [x] Assistant text closes the previous activity slice. New requests, end/cancel, session changes, and shutdown clear transient status without replaying history as live work.
- [x] A confirmed final answer suppresses the working indicator when no current operation supplies a label. Existing phase evidence governs suppression and restoration; ordinary text does not invent a final phase.
- [x] Hide thinking, disclosure expansion, source/Find, retry/compaction, and native indicator ownership remain intact.
- [x] Adjustable wording remains in the existing configuration module; no package coupling, new package, prompt addition, execution change, or extra model call is introduced.
- [x] Existing real-host cases reproduce the old behavior and verify this delta before broader integration checks.

**Reference:** [Working label source record](../../../docs/plans/working-label-parity.md). The user explicitly requested this delta, its documents, and implementation using the established seam and integration branch.
