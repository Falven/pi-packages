# 14: pi-attachments: preview and submit image snapshots

**What to build:** Attach an image, recognize it through a small preview, and send native image content.

**Blocked by:** 02: pi-attachments: attach text and file snapshots.

**Status:** implemented; real-terminal acceptance pending

- [x] Explicit image attachment preserves original bytes before making its reference usable.
- [x] Show a small image preview near the active native editor or composer through Pi's image/graphics facilities.
- [x] Image conversion, resizing, and preview rendering retain the original snapshot; later source changes do not affect it.
- [x] Normal, steer, and follow-up submissions deliver image content associated with the intended request and preserve existing input-transform images.
- [x] Image-only requests work through native submission, and read/render/delivery failures preserve recoverable contents.
- [x] Pending image work stays with its requesting draft and cannot overwrite newer work.
- [ ] Use public-boundary tests for bytes, membership, and submitted image content, plus real Ghostty/macOS graphics and widget-coexistence checks.

Integration evidence: `c087d06` and `07f426d`; 181 combined tests, formatting, lint, and root/composer typechecks pass. Public-host probes confirm image delivery and retained original bytes. Real terminal graphics remain pending.

Recovery verification: `11c623c`; clipboard/checkpoint/image write failures, partial captures, late shutdown work, reload and fresh-process restoration pass. The full 393-test suite and all required checks pass; actual model delivery ordering remains asserted.

Final verification: [shared results](../verification.md).
