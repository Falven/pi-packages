# 01: Generic operation presentation

**What to build:** Providers can describe command, file, image, and independent output operations through one optional interface. Chat renders those operations without recognizing provider packages or tool names. See the [specification](../../../docs/specs/tool-activity.md).

**Blocked by:** None (can start immediately).

**Status:** resolved — implemented at `4e271b8` on `codex/generic-tool-activity`.

- [x] A neutral public contract validates operation identity, revisions, output ownership, and processed-result bindings.
- [x] The existing toolset publishes and chat consumes that contract with no dependency on one another or private schema decoder.
- [x] An unrelated provider uses arbitrary names through the same path; the toolset also supplies useful facts with no chat loaded.
- [x] Command/file bodies have semantic headings and native result controls; independent output/errors and image preferences remain supported.
- [x] Invalid or missing metadata preserves generic processed output; known rows survive bounded-body omission.

**Resolution:** Added the neutral `pi-activity` contract and removed chat's two provider-specific adapters. Both extensions use the shared facts independently. Real-host checks cover an unrelated provider, a subscriber without chat, processed-result replacement, native output controls, independent failures, images, and compact descriptions. Contract checks distinguish valid empty snapshots from missing, unsupported, or altered metadata. [Ticket 03](03-retained-source-and-replay.md) records final combined validation and review limits.
