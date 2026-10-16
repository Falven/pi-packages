# 05: Skill reads across tools

**What to build:** Reading a registered skill shows a clear `Read <name> skill` activity through native reads or command operations. Literal shell sequences preserve their other actions and actual output. See the [specification](../../../docs/specs/tool-activity.md).

**Blocked by:** 04: Action results without a separate package.

**Status:** done — implemented and verified at `789b142` on `codex/generic-tool-activity`, from correction base `4ad78cc`.

- [x] Skill reads match Pi's public skill metadata by resolved path, including providers with arbitrary tool names and retained history.
- [x] A formatting header followed by a literal skill-file read gets a skill label; several reads and other commands keep their individual actions.
- [x] Ambiguous shell syntax, unknown files, and replacements without semantic facts keep honest generic command/tool presentation.
- [x] Observed built-in identity survives reload and fork through bound provenance records; unobserved or changed calls keep generic fallback.
- [x] Native body controls, source Find, model results, and both extension load orders remain intact.
- [x] Final affected-package checks, supported-runtime checks, standards/spec review, and any unavailable visual checks are recorded against the correction's revision.

**Resolution:** Native reads and independently declared command operations share skill recognition through Pi's public registry. Literal commands preserve other actions and full native output; uncertain syntax keeps its command summary. Compact bound provenance preserves observed native labels through reload and fork without assigning native identity to replacement tools. Ticket 04's result suppression, source Find, and failure grouping remain intact. No separate package or runtime dependency between the extensions remains.

**Verification (2026-10-16, `789b142`):**

- Pi 1.0.2: `node --test packages/pi-chat/test/*.test.ts packages/pi-codex-tools/test/*.test.ts` — 343/343 pass, no failures, cancellations, or skips. Log: `/tmp/pi-activity-correction-1.0.2-verified.log`.
- Pi 1.1.0, using released dependencies in an isolated temporary checkout: `node --test packages/pi-chat/test/*.test.ts packages/pi-codex-tools/test/workflow-presentation.test.ts` — 134/134 pass, no failures, cancellations, or skips. This includes all chat, contract, and combined workflow cases. Log: `/tmp/pi-activity-correction-1.1.0-verified.log`.
- Repository typechecking passes on both versions using `./node_modules/.bin/tsc --noEmit -p tsconfig.json`. Logs: `/tmp/pi-activity-correction-types-verified.log` and `/tmp/pi-activity-correction-types-1.1.0-verified.log`.
- Repository lint, formatting, and `git diff --check` pass. Local links in changed documentation resolve. Existing installed binaries were used directly; pnpm's dependency synchronization was blocked by its existing unapproved-build policy, which was not changed.
- The earlier full runs exposed five assertions expecting native labels to disappear on replay. Updated assertions preserve checks for distinct reused calls, output padding, source order, native expansion, and no re-execution. A later concurrent run exceeded the fixture's one-second settlement poll; the new skill case now awaits Pi's public prompt-completion promise. The final runs above include that correction.
- Direct review reproduced a missing failure activity for `throw ""`. The failure now stays visible through reload while the model result remains exactly `Script error:\n`. The focused regression failed before the repair and passes afterward; logs: `/tmp/pi-empty-error-red.log` and `/tmp/pi-empty-error-green.log`.

**Standards review:** Direct review of `git diff 4ad78cc...789b142` found no remaining actionable standards findings. The existing native host boundary and public persistence APIs are retained. Duplicate protocol types and binding rules are intentional under ADR 0019; there is no shared runtime package, provider-name mapping in chat, or general shell interpreter.

**Spec review:** Direct review found no remaining actionable delta findings. Verified independent publishers, both load orders, skill and ordinary reads, conservative command classification, retained provenance, result authority, failure context, single-owner images, source Find, and disclosure preservation. The empty-message failure found during review was repaired and verified.

**Limits:** Both independent review agents failed before execution with `invalid_request_body` and an encrypted-output decoding error; these are direct reviews, not independent passes. Physical-terminal acceptance, a live ChatGPT.app comparison, unrelated package suites, new live-model trials, and performance trials were not repeated. Earlier tickets retain their original revision evidence. The isolated compatibility checkout was removed after verification.
