# 14: pi-attachments: preview and submit image snapshots

**What to build:** Attach an image, recognize it through a small preview, and send native image content.

**Blocked by:** 02: pi-attachments: attach text and file snapshots.

**Status:** in-progress

- [ ] Explicit image attachment preserves original bytes before making its reference usable.
- [ ] Show a small image preview near the active native editor or composer through Pi's image/graphics facilities.
- [ ] Image conversion, resizing, and preview rendering retain the original snapshot; later source changes do not affect it.
- [ ] Normal, steer, and follow-up submissions deliver image content associated with the intended request and preserve existing input-transform images.
- [ ] Image-only requests work through native submission, and read/render/delivery failures preserve recoverable contents.
- [ ] Pending image work stays with its requesting draft and cannot overwrite newer work.
- [ ] Use public-boundary tests for bytes, membership, and submitted image content, plus real Ghostty/macOS graphics and widget-coexistence checks.
