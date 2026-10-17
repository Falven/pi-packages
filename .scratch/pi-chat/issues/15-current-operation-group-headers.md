# 15: Show existing current-operation labels in active render-group headers

**What to build:** Identify the selected current operation in its owning render-group header using existing wording, while preserving aggregate summaries wherever appropriate, the native working indicator, and all disclosure choices. Deliver the header connection, narrow documentation amendments, and verification together.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] Reuse current-operation selection and wording for file/registered-skill reads, searches, listings, commands (including empty fallback), edits (`Editing files`), and other supported operations.
- [ ] Associate the selected operation with the correct group through existing identities and current-activity context. Reuse continuation and exploration behavior; do not copy rendered native indicator text.
- [ ] Preserve settled, historical, and otherwise appropriate aggregate summaries, including category wording, ordering, deduplication, and singular/plural rules. Remove stale operation labels on context changes even when item identities remain unchanged.
- [ ] Preserve group, item, and native-output expansion choices, grouping, lifecycle, native previews, and scrolling. Keep native indicator text, visibility, thought-title fallback, and timing unchanged.
- [ ] Retain full labels while existing terminal-width handling truncates only the displayed header.
- [ ] Record the narrow decision in the existing ADRs, clarify aggregate terminology, and update the existing chat specification while preserving historical evidence.
- [ ] Use TDD in existing real-Pi host cases. Assert headers separately from the indicator for paused reads/commands, active edits, mixed-group aggregate reversion, older groups, and retained disclosure choices; add no file or seam.
- [ ] Run relevant existing cases, the chat and combined tool-presentation suites, required static checks, and supported Pi 1.1.0/1.0.2 checks without changing the installed runtime or lockfile. Record actual revisions, versions, commands, and limits.
- [ ] Complete separate standards and specification reviews, resolve findings within this delta, integrate the verified change into local main, and remove only this task’s temporary branches and worktrees.

**Scope and authorization:** One complete implementation slice and the established real-Pi host seam are specified in the user’s handoff. The activity specification remains authoritative for operation selection; no new selection policy, lifecycle state machine, thought-heading policy, parser, configuration system, or provider contract is required. Singleton unwrapping, copy actions, native previews, scrolling, and broader Codex parity are separate work.

**Revision evidence:** Pending implementation and verification. Earlier resolved tickets retain their original evidence.
