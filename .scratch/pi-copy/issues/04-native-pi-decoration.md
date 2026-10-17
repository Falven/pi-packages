# 04: Copy from native Pi without chat

**What to build:** Installing copy alone adds the existing copy controls to native command/edit boxes and final assistant responses. Both plugins remain independently loadable after packaging and editable installation.

**Blocked by:** 03 — Install chat and copy independently.

**Status:** ready-for-agent

- [ ] Native command, output, diff, and final-response controls preserve source text, empty/partial/error handling, feedback, and blank response separation.
- [ ] Native components, transcript, editor, notices, and normal selection/copy behavior remain in use.
- [ ] Native hooks attach only when no cooperating transcript owner is present and restore on reload, session replacement, and shutdown.
- [ ] Native-only and combined interactions work through the real Pi host, including keyboard, mouse, resize, history, and pending-copy disposal.
- [ ] Each packed plugin loads with the other package absent; both load orders preserve the existing combined behavior.
- [ ] Run required checks, integrate the delta into main, explicitly register both editable packages in Pi, and remove task worktrees and branches.
- [ ] Record actual verification and any physical-terminal or OS clipboard limits without treating earlier evidence as proof of this delta.

Published on 2026-10-17. The canonical [specification](../../../docs/specs/pi-copy.md) and [ADR 0028](../../../docs/adr/0028-copy-as-an-independent-extension.md) govern the delta.
