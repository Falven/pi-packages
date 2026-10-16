---
status: accepted
---

# Store goals in native session entries

`pi-goal` will replace its separate SQLite store with Pi's public session custom entries so goal state shares the session's storage and lifecycle. Restoration will use the latest record owned by the current session across all retained entries, with an explicit clear record and lossless integer encoding, preserving current goal state through history navigation and keeping forked sessions independent. This accepts Pi's persistence guarantees instead of retaining a second storage system for stronger guarantees.

## Consequences

- A goal created before the first user or assistant message remains in memory until Pi saves the session; exiting earlier can lose it.
- One running Pi process may manage a session's goal at a time; simultaneous writers to the same session are unsupported, while separate sessions remain independent.
- A storage failure stops automatic goal pursuit for the current runtime and surfaces the error. Pi may already have changed its in-memory history, so rollback and recovery of unsaved usage are not guaranteed; recovery uses the state Pi actually saved. The failure stop survives a retaining extension reload; reopening the saved session establishes the recovery state.
