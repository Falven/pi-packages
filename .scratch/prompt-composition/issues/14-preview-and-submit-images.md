# 14: pi-attachments: preview and submit image snapshots

**What to build:** Attach an image, recognize it through a small preview, and send native image content.

**Blocked by:** 02: pi-attachments: attach text and file snapshots.

**Status:** implemented; real-terminal acceptance pending

- [x] Explicit image attachment preserves original bytes before making its reference usable.
- [x] Show a small image preview near the active native editor or composer through Pi's native widget and Image component.
- [x] Image conversion, resizing, and preview rendering retain the original snapshot; later source changes do not affect it.
- [x] Normal, steer, and follow-up submissions deliver image content associated with the intended request and preserve existing input-transform images.
- [x] Image-only requests work through native submission, and read/render/delivery failures preserve recoverable contents.
- [x] Pending image work stays with its requesting draft and cannot overwrite newer work.
- [x] Public-boundary tests verify original bytes, membership, preview updates, submitted image content, and recovery after partial capture or write failures.
- [ ] Verify real Ghostty/macOS image graphics and widget coexistence.
