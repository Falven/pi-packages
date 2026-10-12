# 06: Recover drafts after native submission failures

**What to build:** Keep the intended draft and attachments recoverable through normal, steer, and follow-up submission failures.

**Blocked by:** 01: pi-composer: edit and submit source drafts; 02: pi-attachments: attach text and file snapshots.

**Status:** ready-for-agent

- [ ] Normal, steer, and follow-up paths associate each submitted draft with its own text and attachments through native host delivery.
- [ ] Preserve command dispatch, input transformations, input source, and existing native image content.
- [ ] Exercise failures before and after a host editor clear; the original draft and retained attachment contents remain recoverable without overwriting later work.
- [ ] Do not treat the text-only submission callback, a void send return, or a cleared editor as delivery acknowledgement.
- [ ] Exercise queued input and session changes during pending work through actual public lifecycle events with controlled model responses.
- [ ] Document any public-contract failure precisely and leave its acceptance criteria unmet; do not add a new acknowledgement protocol.
