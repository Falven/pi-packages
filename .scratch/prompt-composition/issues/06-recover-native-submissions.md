# 06: Recover drafts after native submission failures

**What to build:** Keep the intended draft and attachments recoverable through normal, steer, and follow-up submission failures.

**Blocked by:** 01: pi-composer: edit and submit source drafts; 02: pi-attachments: attach text and file snapshots.

**Status:** complete

- [x] Normal, steer, and follow-up paths associate each submitted draft with its own text and attachments through native host delivery.
- [x] Preserve command dispatch, input transformations, input source, and existing native image content.
- [x] Exercise failures before and after a host editor clear; the original draft and retained attachment contents remain recoverable without overwriting later work.
- [x] Do not treat the text-only submission callback, a void send return, or a cleared editor as delivery acknowledgement.
- [x] Exercise queued input and session changes during pending work through actual public lifecycle events with controlled model responses.
- [x] Document any public-contract failure precisely and leave its acceptance criteria unmet; do not add a new acknowledgement protocol.

Integration evidence: `2fb6c7b`; all 270 combined tests, formatting, lint, and root/composer typechecks pass. Native normal/steer/follow-up, queues, clears, replay, session/restart recovery and image snapshots are covered. Project terminal acceptance is tracked by [ticket 22](22-compose-and-resume-mixed-requests.md).

Recovery verification: `11c623c`; clipboard/checkpoint/image write failures, partial captures, late shutdown work, reload and fresh-process restoration pass. The full 393-test suite and all required checks pass; actual model delivery ordering remains asserted.

Final verification: [shared results](../verification.md).
