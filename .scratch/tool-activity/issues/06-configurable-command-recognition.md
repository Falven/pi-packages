# 06: Configurable Codex command recognition

**What to build:** Recognized command actions match the complete pinned Codex reference. Operators adjust recognition and activity wording through one clear module in the existing chat package. Native commands and unrelated activity providers display the same reads, searches, listings, and general commands.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

**Reference:** Installed-app Codex `0.162.0-alpha.17.2`, commit `740e5af33c71225640e0c1c1555c514c2c93ab74`, Bash grammar `0.25.1`. Supersedes the older annotated checkout following the user's explicit app-parity clarification. Mixed scripts with a remaining unknown action use one full-command fallback.

- [ ] The reference revision, source hashes, grammar version, and complete command-case corpus are recorded; full parsed results match.
- [ ] Shell wrappers, pipelines, sequencing, quoting, options, directory changes, formatting helpers, display names, deduplication, and fallback follow the reference.
- [ ] Empty parsed action lists retain the app's general command activity, including failed native and declared commands.
- [ ] Generic command facts carry an optional shell invocation prefix; producers supply their actual shell and consumers never inspect producer-specific argument keys.
- [ ] One operator module supplies recognition mappings, presentation wording, group ordering, and operation-body headings; defaults preserve reference behavior.
- [ ] Effective paths retain skill identity independently of shortened names, and full commands/results remain inspectable.
- [ ] Native calls and arbitrary third-party producers share this behavior without cross-package knowledge or a separate package.
- [ ] Operator customizations change presentation through the real path without changing execution or model-facing guidance.
