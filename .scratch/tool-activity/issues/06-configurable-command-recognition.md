# 06: Configurable Codex command recognition

**What to build:** Recognized command actions match the complete pinned Codex reference. Operators adjust recognition and activity wording through one clear module in the existing chat package. Native commands and unrelated activity providers display the same reads, searches, listings, and general commands.

**Blocked by:** None (can start immediately).

**Status:** done — implemented and verified at `100316f` on `codex/generic-tool-activity`, from integration base `a6280f9`.

**Reference:** Installed-app Codex `0.162.0-alpha.17.2`, commit `740e5af33c71225640e0c1c1555c514c2c93ab74`, Bash grammar `0.25.1`. Supersedes the older annotated checkout following the user's explicit app-parity clarification. Mixed scripts with a remaining unknown action use one full-command fallback.

- [x] The reference revision, source hashes, grammar version, and complete command-case corpus are recorded; full parsed results match.
- [x] Shell wrappers, pipelines, sequencing, quoting, options, directory changes, formatting helpers, display names, deduplication, and fallback follow the reference.
- [x] Empty parsed action lists retain the app's general command activity, including failed native and declared commands.
- [x] Generic command facts carry an optional shell invocation prefix; producers supply their actual shell and consumers never inspect producer-specific argument keys.
- [x] One operator module supplies recognition mappings, presentation wording, group ordering, and operation-body headings; defaults preserve reference behavior.
- [x] Effective paths retain skill identity independently of shortened names, and full commands/results remain inspectable.
- [x] Native calls and arbitrary third-party producers share this behavior without cross-package knowledge or a separate package.
- [x] Operator customizations change presentation through the real path without changing execution or model-facing guidance.

**Resolution:** The complete parser is ported with the matching Bash grammar. [Configuration](../../../packages/pi-chat/src/config.ts) supplies recognition names, short-path rules, item/group wording, ordering, and body headings. Native calls and unrelated publishers use the same recognition path; optional shell facts remain generic. The app's display fallback preserves a command even when the parser correctly returns no actions.

**Verification (2026-10-16, `100316f`):** All 440 recorded command vectors match the complete Rust results. The unmodified reference parser/Bash tests pass 106/106; an additional deterministic comparison of 9,646 command vectors found no differences. Real-host checks cover operator changes, registered skills, unrelated publishers, PowerShell facts, and failed commands with empty parsed actions. The latter failed before the display repair and passes afterward. [Reference provenance](../../../packages/pi-chat/test/fixtures/codex-command-reference.md) records sources, hashes, and the refresh procedure. [Ticket 09](09-verify-activity-alignment.md) records final package and compatibility evidence.

**Limits:** Defaults target the recorded app build. Operator overrides deliberately change presentation. Windows-native path behavior and a physical-app comparison were not verified.
