# 17: Unwrap eligible completed singleton render groups

**What to build:** Let users inspect an eligible inactive singleton directly through its activity-item disclosure, preserving the independent native preview/full-output control. Apply the complete pinned Codex eligibility rule to supported Pi facts in live and retained conversations. Preserve wrappers for excluded or unresolved groups and integrate the verified behavior into main.

**Blocked by:** None (design, specification, existing test seam, and this single-ticket breakdown approved on 2026-10-16).

**Status:** ready-for-agent

- [ ] Pin the complete caller and helper rule to ChatGPT.app com.openai.codex 26.1013.31256, build 20586, and document every guard and Pi representation limit.
- [ ] Omit only a group wrapper with exactly one inactive item in summary state and every other applicable guard satisfied; preserve the item disclosure and native output control independently.
- [ ] Keep zero/multiple-item groups, running items including older ones, and the latest open group with active header progress out of singleton unwrapping. Valid empty activity stays absent.
- [ ] Permit earlier inactive singletons while later activity continues and update eligibility from established closure during final streaming; do not require whole-turn settlement or successful completion.
- [ ] Use authoritative lifecycle facts for failures, interruptions, unknown outcomes, and unattempted files. Carry the original patch outcome and file count through projection; only eligible one-file patches qualify.
- [ ] Record the preservation-override, completed-header, and visualization exclusions without inventing currently absent Pi settings or presentation inputs.
- [ ] Preserve logical group choices, existing item/native-output presenters, new-control global inheritance, and documented state lifetime through cardinality changes, failure, cancellation, ancestor toggles, settings reconstruction, and replay.
- [ ] Keep a usable focus target and correct pointer geometry when a header disappears; preserve reading position where possible and existing selection/copy invalidation rules.
- [ ] Preserve source ownership, Find reveal, Hide thinking boundaries, final-response placement, native previews, and unbounded conversation flow.
- [ ] Use TDD by extending existing real-Pi host cases, retaining the collapsed-boundary regression; assert fresh frames, real input, copied text, and unchanged provider/session content. Add no test file, test case, or primary seam.
- [ ] Pass the established combined chat/tool-presentation suite on the currently installed Pi 1.1.0 in a coherent isolated environment without changing repository dependencies; complete its host typecheck, lint, task-file formatting, and whitespace checks. The user explicitly limited this delta to the installed runtime.
- [ ] Complete independent standards and specification reviews against the recorded baseline, repair actionable findings, and rerun affected checks.
- [ ] Record actual revisions, commands, runtime versions, results, and limits. Earlier validation is historical and does not validate this delta.
- [ ] Integrate the verified result into current main without rewriting history or pushing remotely; include final specification and ticket bookkeeping before marking resolved.
- [ ] Verify all task changes are in main, preserve needed evidence and the unrelated comparison report, and remove only task-created branches and worktrees using managed cleanup where applicable.

**Contract:** [Chat specification](../../../docs/specs/pi-chat.md) and [ADR 0020](../../../docs/adr/0020-render-group-lifecycle-and-singleton-preservation.md).

**Historical guarantees:** [Chat 04](04-render-groups.md) keeps item and native-output controls independent. [Chat 12](12-mixed-session-acceptance.md) and [Chat 13](13-activity-item-adapters-and-independent-bodies.md) retain native-host, adapter, and replay guarantees. [Chat 14](14-stable-reading-position.md) keeps collapsed-activity scrolling stable. Their resolved status and earlier evidence remain unchanged.

**Approval:** Q1 and Q3 accepted as proposed; Q2 accepted with verification limited to the currently installed Pi. The installed command reports 1.1.0; the repository development dependency remains 1.0.2. No additional runtime is required for this delta.

**Verification and integration:** Pending. Record delta-specific evidence and the integration revision here after implementation; do not mark resolved before verification and integration.

**Limits:** The recording-terminal seam establishes emitted frames and real-host behavior, not physical-terminal pixels or live Codex interaction. Absent reference inputs and lossy historical lifecycle records limit exact parity as described in the specification.
