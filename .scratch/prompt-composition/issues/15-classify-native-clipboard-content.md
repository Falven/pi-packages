# 15: pi-paste: classify copied files and images

**What to build:** Paste the copied files or image using native clipboard identity and the correct content precedence.

**Blocked by:** 04: pi-paste: route text pastes and explicit overrides; 14: pi-attachments: preview and submit image snapshots.

**Status:** implemented; real-terminal acceptance pending

- [x] Native copied-file information takes precedence over an accompanying icon image, followed by image data, then plain text.
- [x] Copied file paths with spaces and Unicode retain native identity and validation; text resembling a path stays text unless explicitly attached.
- [x] File/image outcomes use attachment snapshots and presentation; text continues through the existing cutoff and override policy.
- [x] Clipboard read errors remain visible errors and do not silently fall through to another content type.
- [x] Asynchronous reads and snapshot writes remain associated with their requesting draft, preserve selected text until success, and retain recoverable failures.
- [x] Demonstrate native clipboard routes with pi-composer absent and preserve installed listeners/shortcuts.
- [ ] Verify native clipboard precedence in real Ghostty/macOS as well as public-boundary text, snapshot, and submitted-content assertions.

Integration evidence: `a52dba2`; Pi/TUI 1.0.2, fresh frozen installation, formatting, lint, and root/composer typechecks pass. The complete 374-test rerun passes. Native clipboard precedence, batch snapshots, selection/history, deferred commands and native overrides are covered. Real Ghostty/macOS acceptance remains pending.

Recovery verification: `11c623c`; clipboard/checkpoint/image write failures, partial captures, late shutdown work, reload and fresh-process restoration pass. The full 393-test suite and all required checks pass; actual model delivery ordering remains asserted.

Final verification: [shared results](../verification.md).
