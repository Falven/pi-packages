# 02: pi-attachments: open image previews

**What to build:** Image attachment labels, thumbnails, and graphics fallbacks open the retained full-resolution image through Pi's native hyperlinks and the system's associated application.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

**Specification:** [pi-attachments](../../../docs/specs/pi-attachments.md); [native contracts](../../../docs/adr/0001-preserve-pi-extension-contracts.md); [retained snapshots](../../../docs/adr/0007-pi-attachments-retain-snapshots.md).

- [ ] Retain Pi's Image renderer and publish native file links only for successfully validated image previews.
- [ ] Link the filename, reserved thumbnail cells, and graphics fallback to the retained file, independent of the original source and preview thumbnail bytes.
- [ ] Keep clickable regions within the visible preview and update them on resize, refresh, membership removal, and capability changes.
- [ ] Preserve the draft, selection, focus, and retained bytes during opening; document that an external save can modify the opened file.
- [ ] Verify visible hyperlink targets and native click dispatch through the existing public Pi host, substituting only the OS launcher boundary.
- [ ] Manually open labels and thumbnail cells in Ghostty, including after resizing and with an image's original source removed.
