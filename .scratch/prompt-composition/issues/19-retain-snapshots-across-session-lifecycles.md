# 19: pi-attachments: retain snapshots across sessions

**What to build:** Resume or fork native sessions with readable attachment snapshots that remain stable across restarts.

**Blocked by:** 02: pi-attachments: attach text and file snapshots.

**Status:** implemented; final acceptance pending

- [x] Keep snapshot storage and references stable across Pi restarts, resumed sessions, and forks with the native editor.
- [x] Associate retained references with the correct native session and submission without depending on pi-composer.
- [x] Retain submitted snapshots until explicit cleanup; elapsed time does not expire them.
- [x] Removing draft membership or changing/removing source files cannot invalidate other draft or submitted references.
- [x] A lifecycle transition or asynchronous failure preserves readable assets and their recoverable association with the requesting draft.
- [x] Verify actual retained bytes and references across native lifecycle actions through the public host boundary.

Automated acceptance: integration `a22accf`; formatting, lint, type checks, and 143 public-boundary tests pass. Final combined and terminal acceptance remain pending.
