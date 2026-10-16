# 01: Generic operation presentation

**What to build:** Providers can describe command, file, image, and independent output operations through one optional interface. Chat renders those operations without recognizing provider packages or tool names. See the [specification](../../../docs/specs/pi-activity.md).

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] A neutral public contract validates operation identity, revisions, output ownership, and processed-result bindings.
- [ ] The existing toolset publishes and chat consumes that contract with no dependency on one another or private schema decoder.
- [ ] An unrelated provider uses arbitrary names through the same path; the toolset also supplies useful facts with no chat loaded.
- [ ] Command/file bodies have semantic headings and native result controls; independent output/errors and image preferences remain supported.
- [ ] Invalid or missing metadata preserves generic processed output; known rows survive bounded-body omission.
