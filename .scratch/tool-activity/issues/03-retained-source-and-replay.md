# 03: Retained source and replay

**What to build:** Reliable operation facts survive reload, while original calls and results remain discoverable even when normal activity has no row. See the [specification](../../../docs/specs/pi-activity.md).

**Blocked by:** 02: Command continuation without receipt rows.

**Status:** ready-for-agent

- [ ] Find indexes original arguments and processed results of zero-item calls and temporarily reveals their native source presenter.
- [ ] Leaving the hit or closing Find removes that reveal without running tools or changing retained/model content.
- [ ] Replay chooses the latest reliable operation revisions on the active branch; stale running work is unknown and no resources are recreated.
- [ ] Invalid processed metadata cannot revive discarded journal bodies; older history remains usable through generic fallback.
- [ ] Both extension load orders, standalone use, relevant package checks, and standards/spec review are recorded with honest verification limits.
