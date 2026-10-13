# 05: Enforce supported Pi peer versions

**What to build:** All three packages declare the supported Pi 1.x API range consistently.

**Blocked by:** None (can start immediately).

**Status:** complete

**Specification:** [pi-composer](../../../docs/specs/pi-composer.md), [pi-skill-references](../../../docs/specs/pi-skill-references.md), and [native extension contracts](../../../docs/adr/0001-preserve-pi-extension-contracts.md).

- [x] Composer and skill references declare Pi and TUI peers as `^1.0.2`, matching attachments and the documented supported floor.
- [x] Keep installed dependency versions unchanged and synchronize relevant lockfile metadata.
- [x] Validate manifests, formatting, lint, types, tests, and local Pi resource loading after integration.

**Verification:** Manifest and lockfile assertions confirm matching peer ranges, unchanged package resolutions, acceptance of Pi 1.0.2 and 1.1.0, and exclusion of unsupported 0.x APIs. `pnpm test` passes all 708 tests against the pinned Pi 1.0.2 host; lint, typechecking, formatting, and diff whitespace checks pass. Installed Pi 1.1.0 loads the three local extensions and registers each expected command once. `pi list` still points to this checkout. No live terminal settings or user sessions were changed. Remote CI previously fails during dependency installation on an unrelated lockfile-resolution check; see the [existing verification record](../../attachment-paste/issues/01-merge-paste-and-attachment-capture.md).
