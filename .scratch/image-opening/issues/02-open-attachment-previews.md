# 02: pi-attachments: open image previews

**What to build:** Image attachment labels, thumbnails, and graphics fallbacks open the retained full-resolution image through Pi's native hyperlinks and the system's associated application.

**Blocked by:** None (can start immediately).

**Status:** implemented; manual acceptance pending

**Specification:** [pi-attachments](../../../docs/specs/pi-attachments.md); [native contracts](../../../docs/adr/0001-preserve-pi-extension-contracts.md); [retained snapshots](../../../docs/adr/0007-pi-attachments-retain-snapshots.md).

- [x] Retain Pi's Image renderer and publish native file links only for successfully validated image previews.
- [x] Link the filename, reserved thumbnail cells, and graphics fallback to the retained file, independent of the original source and preview thumbnail bytes.
- [x] Keep clickable regions within the visible preview and update them on resize, refresh, membership removal, and capability changes.
- [x] Preserve the draft, selection, focus, and retained bytes during opening; document that an external save can modify the opened file.
- [x] Verify visible hyperlink targets and native click dispatch through the existing public Pi host, substituting only the OS launcher boundary.
- [ ] Manually open labels and thumbnail cells in Ghostty, including after resizing and with an image's original source removed.

**Automated validation:** On 2026-10-12, all 687 workspace tests passed on Node 24.13.1, together with formatting, lint, and typechecking. The public-host image check verifies filename and fallback clicks, native image-cell links and click dispatch after resizing, encoded filenames, capability changes, removed membership, editor focus, and preserved snapshot bytes after deleting the source. Only the OS process launcher is substituted during activation. Physical graphics, terminal gestures, and the associated application's opening behavior await user testing.
