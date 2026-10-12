# 06: Recover drafts after native submission failures

**What to build:** Keep the intended draft and attachments recoverable through normal, steer, and follow-up submission failures.

**Blocked by:** 01: pi-composer: edit and submit source drafts; 02: pi-attachments: attach text and file snapshots.

**Status:** complete

- [x] Normal, steer, and follow-up paths associate each submitted draft with its own text and attachments through native host delivery.
- [x] Preserve command dispatch, input transformations, input source, and existing native image content.
- [x] Exercise failures before and after a host editor clear; the original draft and retained attachment contents remain recoverable without overwriting later work.
- [x] Do not treat the text-only submission callback, a void send return, or a cleared editor as delivery acknowledgement.
- [x] Exercise queued input and session changes during pending work through actual public lifecycle events with controlled model responses.
- [x] Captured images and partially captured file sets remain recoverable across session changes, reloads, and a successful persistence retry.
