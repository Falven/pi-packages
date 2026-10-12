# 15: pi-paste: classify copied files and images

**What to build:** Paste the copied files or image using native clipboard identity and the correct content precedence.

**Blocked by:** 04: pi-paste: route text pastes and explicit overrides; 14: pi-attachments: preview and submit image snapshots.

**Status:** in-progress

- [ ] Native copied-file information takes precedence over an accompanying icon image, followed by image data, then plain text.
- [ ] Copied file paths with spaces and Unicode retain native identity and validation; text resembling a path stays text unless explicitly attached.
- [ ] File/image outcomes use attachment snapshots and presentation; text continues through the existing cutoff and override policy.
- [ ] Clipboard read errors remain visible errors and do not silently fall through to another content type.
- [ ] Asynchronous reads and snapshot writes remain associated with their requesting draft, preserve selected text until success, and retain recoverable failures.
- [ ] Demonstrate native clipboard routes with pi-composer absent and preserve installed listeners/shortcuts.
- [ ] Verify native clipboard precedence in real Ghostty/macOS as well as public-boundary text, snapshot, and submitted-content assertions.
