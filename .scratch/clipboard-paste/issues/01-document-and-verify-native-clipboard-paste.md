# 01: Attach single-path text pastes and native clipboard content

**What to build:** A user can paste one readable file path through the terminal, native clipboard text, or public extension paste and receive a retained attachment with either editor. Native file/image clipboard capture remains available, Paste Inline preserves literal text, and Ghostty's ordinary Cmd+V paste remains unchanged.

**Blocked by:** [01: Combine paste and attachment capture](../../attachment-paste/issues/01-merge-paste-and-attachment-capture.md).

**Status:** implemented; physical acceptance pending

**Specifications:** [Attachments and paste](../../../docs/specs/pi-attachments.md), [composer](../../../docs/specs/pi-composer.md), and [native clipboard identity](../../../docs/adr/0011-preserve-native-clipboard-identity.md).

- [x] Classify the entire text paste as one path before the 5,000 UTF-16 unit cutoff. Support raw, quoted, terminal-escaped, local file-URL, home-relative, and CWD-relative paths, including bare filenames and names containing spaces. Do not split lists, evaluate shell expressions, or inspect the surrounding Markdown.
- [x] A readable regular file enters the shared snapshot operation once. Failed recognition, missing/unreadable files, directories, prose, and space- or newline-delimited path lists silently follow the ordinary text policy with the original payload. Captured-content storage failures retain normal recovery behavior.
- [x] Apply the same classification to terminal bracketed paste, public extension paste, and text returned by Pi's effective clipboard action. Assemble fragmented pastes before classification; terminal and extension text never reread clipboard metadata.
- [x] Preserve copied-file → image → text native clipboard precedence, configured bindings, custom handler priority, and terminal settings. Native file metadata retains its existing multiple-file support.
- [x] Paste Inline bypasses file recognition and size conversion. Attach Text captures its literal text. Typing, direct replacements, ordinary edits, and draft restoration do not trigger recognition.
- [x] With native Pi and the composer, verify preserved file names/bytes, image previews and native image delivery, and requesting-draft protection. Composer selection replacement and membership undo/redo remain one edit.
- [x] Editing away a reference's Markdown leaves its snapshot path as text without recapturing it; the image preview and submitted image disappear while the snapshot stays readable.
- [x] Update existing ADRs, specifications, tickets, and package guidance to describe these behaviors and the two paste routes. Reuse public Pi editor/session checks and existing fixtures; record actual validation results here.
- [ ] In real Ghostty/macOS, paste the reported image-file item using Cmd+V and PastePal's Paste action. Verify a snapshot, filename, native preview, image delivery, and ordinary paste outside Pi. Separately verify PastePal Copy followed by Pi's effective clipboard action, Ctrl+V by default, including image-only clipboard data and a non-image file.
- [ ] In the real composer, verify selection replacement, undo/redo, Paste Inline, and editing a reference down to its plain snapshot path. Record versions, revision, effective bindings, gesture, supplied route, and result; keep unavailable physical checks pending in this ticket and the existing [composition acceptance ticket](../../prompt-composition/issues/22-compose-and-resume-mixed-requests.md).

**Research evidence:** On 2026-10-12, PastePal 2.20.3's Copy action for the reported image-file entry exposed one matching file path, no image bytes, and no text through Pi's public native clipboard API. This establishes the copied item's file identity; it does not establish physical Pi paste delivery. Ghostty 1.3.1's [clipboard conversion](https://github.com/ghostty-org/ghostty/blob/v1.3.1/macos/Sources/Helpers/Extensions/NSPasteboard%2BExtension.swift) turns file URLs into shell-escaped path text, and the inspected Cmd+V binding invokes that terminal paste action. PastePal's [documented paste actions](https://docs.indiegoodies.com/pastepal/Mac/quick-start) do not establish the exact terminal handoff or clipboard lifetime for its one-step Paste action.

**Verification (2026-10-12):** All 712 tests passed on Node 26.8.1 against the repository's Pi 1.0.2 public host. Formatting, lint, TypeScript, and whitespace checks passed. Public-host checks cover both editors, path spellings, silent fallback, clipboard precedence, native and terminal routes, fragmented paste, selected-text replacement, undo/redo, retained bytes, image delivery, and late-capture recovery. The existing mixed-composition recovery assertion now waits for retained bytes after recovery metadata appears. Standards and specification reviews have no remaining findings. All 58 checked local links in the changed documentation resolve.

The installed Pi 1.1.0 CLI resolves the three local composition packages to this checkout; `/reload` loads the updated source. Physical Ghostty/PastePal gestures and terminal graphics remain pending above. No terminal configuration changed.
