# 08: Restore work relationships across session lifecycles

**What to build:** Reopen or branch a conversation with its established work and answer relationships intact, without persisting manual fold choices or altering model context.

**Blocked by:** 07: Fold settled work while keeping the final response visible.

**Status:** done

- [x] Append minimal native custom entries for certified delivery, work, and final relationships using source references rather than copied text.
- [x] Keep metadata outside model context and preserve original conversation messages.
- [x] Reconstruct established relationships on replay, reload, session replacement, branch changes, and copied/forked history using session-journal-local identity.
- [x] Reset fold choices at the agreed lifecycle boundaries; do not store them in metadata.
- [x] Leave only uncertain historical work relationships unfolded, retaining known tool disclosures, inline thoughts, and search compatibility without invented notices.
- [x] Verify persisted entries, provider input, reopened/forked sessions, duplicate input text, compaction history, and missing provenance through the native host.
