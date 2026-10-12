# 14: pi-attachments: preview and submit image snapshots

**What to build:** Attach an image, recognize it through a small preview, and send native image content.

**Blocked by:** 02: pi-attachments: attach text and file snapshots.

**Status:** implemented; recovery and final acceptance pending

- [x] Explicit image attachment preserves original bytes before making its reference usable.
- [x] Show a small image preview near the active native editor or composer through Pi's image/graphics facilities.
- [x] Image conversion, resizing, and preview rendering retain the original snapshot; later source changes do not affect it.
- [x] Normal, steer, and follow-up submissions deliver image content associated with the intended request and preserve existing input-transform images.
- [ ] Image-only requests work through native submission, and read/render/delivery failures preserve recoverable contents.
- [x] Pending image work stays with its requesting draft and cannot overwrite newer work.
- [ ] Use public-boundary tests for bytes, membership, and submitted image content, plus real Ghostty/macOS graphics and widget-coexistence checks.

Integration evidence: `c087d06` and `07f426d`; 181 combined tests, formatting, lint, and root/composer typechecks pass. Public-host probes confirm image delivery and retained original bytes. Ticket20 must close the failed recovery-file plus failed native-append persistence gap; real terminal graphics remain pending.
