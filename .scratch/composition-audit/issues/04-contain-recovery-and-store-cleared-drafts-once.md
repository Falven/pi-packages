# 04: Contain recovery and store cleared drafts once

**What to build:** Session identity cannot escape clipboard recovery storage, and retained cleared drafts do not inflate every appended checkpoint.

**Blocked by:** None (can start immediately).

**Status:** complete

**Specification:** [pi-composer](../../../docs/specs/pi-composer.md).

- [x] Encode or hash imported session identity before deriving clipboard recovery paths, reusing the draft-storage convention.
- [x] Preserve requesting-draft metadata, private file permissions, retry behavior, and existing clipboard recovery.
- [x] Store cleared draft contents without repeating the accumulated history in each native session checkpoint. Keep old checkpoints and disk recovery readable.
- [x] Preserve recovery across restart, switching, forks, reload, failed writes, and retries. Retain every cleared draft required by the existing contract.
- [x] Verify imported session IDs through public loading and delayed clipboard delivery, then measure storage growth through native session checkpoints.

**Verification:** All 55 focused clipboard and session-recovery checks pass, followed by all 708 tests in the full suite. They cover an imported `../../escaped` session ID, legacy checkpoints, native-only restart, failed checkpoint and cleared-draft appends, retry after reload, and complete disk snapshots. A four-draft storage probe recorded 12,085 bytes of native custom entries versus 31,774 bytes for repeated cumulative checkpoints. An independent review checked Pi's append behavior and recovery paths. Existing recovery files remain readable; this change neither migrates nor deletes them. Low-level repair of a truncated native session file remains Pi's responsibility.
