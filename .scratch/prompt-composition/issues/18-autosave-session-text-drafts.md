# 18: pi-composer: autosave session text drafts

**What to build:** Switch sessions or restart Pi and resume the correct text draft with isolated undo history.

**Blocked by:** 01: pi-composer: edit and submit source drafts.

**Status:** ready-for-agent

- [ ] Autosave one authoritative text draft per native session and restore the matching text when switching sessions or restarting.
- [ ] Keep ordinary file, skill, and snapshot reference text intact during persistence.
- [ ] Keep undo/redo histories in memory and isolated by session; restart begins with a fresh history.
- [ ] Report persistence failures while keeping current text and the last usable saved draft recoverable.
- [ ] Delayed saves or editor operations cannot overwrite a different session or newer unrelated work.
- [ ] Test session switches, restarts, history isolation, and write failures through public session and editor interfaces with temporary state.
