# 06: Configurable Codex command recognition

**What to build:** Recognized command actions match the complete pinned Codex reference. Operators adjust recognition and activity wording through one clear module in the existing chat package. Native commands and unrelated activity providers display the same reads, searches, listings, and general commands.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] The reference revision, source hashes, grammar version, and complete command-case corpus are recorded; full parsed results match.
- [ ] Shell wrappers, pipelines, sequencing, quoting, options, directory changes, formatting helpers, display names, deduplication, and fallback follow the reference.
- [ ] One operator module supplies recognition mappings, presentation wording, group ordering, and operation-body headings; defaults preserve reference behavior.
- [ ] Effective paths retain skill identity independently of shortened names, and full commands/results remain inspectable.
- [ ] Native calls and arbitrary third-party producers share this behavior without cross-package knowledge or a separate package.
- [ ] Operator customizations change presentation through the real path without changing execution or model-facing guidance.
