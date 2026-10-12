# 03: preserve generated image extensions

**What to build:** Generated clipboard and native recovery image files carry their format extension, so native image links reach the system's associated image application without changing captured bytes or copied-file names.

**Blocked by:** None (can start immediately).

**Status:** implemented; manual acceptance pending

**Specification:** [pi-attachments](../../../docs/specs/pi-attachments.md); [retained snapshots](../../../docs/adr/0007-pi-attachments-retain-snapshots.md).

- [x] Name clipboard captures using Pi's detected image format before snapshot storage.
- [x] Preserve format extensions in generated native-image recovery references and conservative cleanup.
- [x] Verify PNG and BMP clipboard capture, image recovery, retained bytes, and cleanup through existing public-host tests.
- [x] Check a generated image link through the actual macOS application-selection and opening API.
- [ ] Manually open newly pasted image labels, thumbnails, and composer references in Ghostty after reload.

**Failure evidence:** On 2026-10-12, the retained clipboard PNG was named `clipboard-image`. macOS selected TextEdit for that path and CleanShot X for the same format with a `.png` extension. The system-opener reproduction rejected the extensionless target as the wrong application. Both `file:///` and `file://localhost/` URLs selected TextEdit; the retained image existed and was readable. Existing extensionless attachments retain their paths and need recapture to acquire a format extension.

**Validation:** On 2026-10-12, all 247 paste and attachment tests passed on Node 24.13.1, together with formatting, lint, and typechecking. The PNG/BMP capture and native-image recovery regressions failed before the fix. A separate public-host reproduction pasted the reported image's bytes into an empty composer, extracted its generated hyperlink, and passed it to the actual macOS application-selection and opening API. The system selected CleanShot X and accepted the open request; the original snapshot's bytes remained unchanged. Physical Ghostty clicks remain pending.
