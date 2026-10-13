# 01: Preserve attachment ranges and bound preview work

**What to build:** Attachment actions preserve surrounding draft text, and large text previews remain responsive while retaining access to the complete attachment.

**Blocked by:** None (can start immediately).

**Status:** complete

**Specification:** [pi-attachments](../../../docs/specs/pi-attachments.md).

- [x] An incomplete attachment label or destination cannot consume the next valid reference. Removal and Restore Inline preserve unrelated prose and retained contents.
- [x] Repeated incomplete markers do not cause quadratic recognition work.
- [x] Preview formats bounded chunks around the required viewport, preserves complete text access through paging and resize, and reuses native Pi width/wrapping facilities.
- [x] Verify reference actions and preview navigation through the public Pi host. Measure malformed-input parsing and a large single-line preview.

**Verification:** Public-host checks cover removal and restoration after incomplete references, paging, Unicode, tabs, and resizing at the end of wrapped and multiline text. The full suite passes all 708 tests. A local five-million-character renderer probe produced 22 rows in about 3 ms, compared with about 742 ms and 50,000 rows when wrapping the complete text. Repeated incomplete labels and destinations parsed in under 1 ms for 8,000 markers. These are local measurements, not timing guarantees. Chunk boundaries can add visual wraps to exceptionally long lines; stored text is unchanged. Live terminal checks were not repeated.
