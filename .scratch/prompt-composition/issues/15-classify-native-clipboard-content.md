# 15: pi-paste: classify copied files and images

**What to build:** Paste the copied files or image using native clipboard identity and the correct content precedence.

**Blocked by:** 04: pi-paste: route text pastes and explicit overrides; 14: pi-attachments: preview and submit image snapshots.

**Status:** implemented; recovery and final acceptance pending

- [x] Native copied-file information takes precedence over an accompanying icon image, followed by image data, then plain text.
- [x] Copied file paths with spaces and Unicode retain native identity and validation; text resembling a path stays text unless explicitly attached.
- [x] File/image outcomes use attachment snapshots and presentation; text continues through the existing cutoff and override policy.
- [x] Clipboard read errors remain visible errors and do not silently fall through to another content type.
- [ ] Asynchronous reads and snapshot writes remain associated with their requesting draft, preserve selected text until success, and retain recoverable failures.
- [x] Demonstrate native clipboard routes with pi-composer absent and preserve installed listeners/shortcuts.
- [ ] Verify native clipboard precedence in real Ghostty/macOS as well as public-boundary text, snapshot, and submitted-content assertions.

Integration evidence: `a52dba2`; Pi/TUI 1.0.2, fresh frozen installation, formatting, lint, and root/composer typechecks pass. The complete 374-test rerun passes. Native clipboard precedence, batch snapshots, selection/history, deferred commands and native overrides are covered. Ticket20 must retain partial captures when an explicit multi-file command encounters a later read failure. The integration run also exposed an intermittent compaction input-observer ordering assertion; model delivery order passed. Real Ghostty/macOS acceptance remains pending.
