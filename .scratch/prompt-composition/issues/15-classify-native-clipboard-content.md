# 15: pi-attachments: classify copied files and images

**What to build:** Paste the copied files or image using native clipboard identity and the correct content precedence.

**Blocked by:** 04: pi-attachments: route text pastes and explicit overrides; 14: pi-attachments: preview and submit image snapshots.

**Status:** implemented; real-terminal acceptance pending

- [x] Native copied-file information takes precedence over an accompanying icon image, followed by image data, then plain text.
- [x] Copied file paths with spaces and Unicode retain native identity and validation; text resembling a path stays text unless explicitly attached.
- [x] File/image outcomes use attachment snapshots and presentation; text continues through the existing cutoff and override policy.
- [x] Clipboard read errors remain visible errors and do not silently fall through to another content type.
- [x] Asynchronous reads and snapshot writes remain associated with their requesting draft, preserve selected text until success, and retain recoverable failures.
- [x] Demonstrate native clipboard routes with pi-composer absent and preserve installed listeners/shortcuts.
- [x] Public-boundary assertions verify clipboard precedence, batch snapshots, text and image submission, selection history, and retained-content recovery.
- [ ] Verify actual copied-file and image clipboard formats and precedence in real Ghostty/macOS.
