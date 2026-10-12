# 18: pi-composer: autosave session text drafts

**What to build:** Switch sessions or restart Pi and resume the correct text draft with isolated undo history.

**Blocked by:** 01: pi-composer: edit and submit source drafts.

**Status:** complete

- [x] Autosave one authoritative text draft per native session and restore the matching text when switching sessions or restarting.
- [x] Keep ordinary file, skill, and snapshot reference text intact during persistence.
- [x] Keep undo/redo histories in memory and isolated by session; restart begins with a fresh history.
- [x] Report persistence failures while keeping current text and the last usable saved draft recoverable.
- [x] Delayed saves or editor operations cannot overwrite a different session or newer unrelated work.
- [x] Test session switches, restarts, history isolation, and write failures through public session and editor interfaces with temporary state.

Automated acceptance: integration `a22accf`; formatting, lint, type checks, and 143 public-boundary tests pass. Project terminal acceptance is tracked by [ticket 22](22-compose-and-resume-mixed-requests.md).

Final verification: [shared results](../verification.md).
