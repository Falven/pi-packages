# 01: Complete independent composer predictions

**What to build:** Deliver `pi-predict`, which predicts the next user message using the verified Codex reference prompt and complete effective Pi context. Show faint suggested text in the empty active composer; plain Tab inserts an editable draft without submitting it. Preserve vanilla Pi, both `pi-composer` orders, and later composer replacements, with no sibling dependency or load-order requirement.

**Status:** ready-for-agent

**Blocked by:** The exact Codex configuration values for `prompt`, `prompt_version`, and `prediction_reasoning_effort` remain unavailable. Capture verified values and record provenance before enabling production generation. The app bundle contains no fallback prompt, the unauthenticated endpoint returned HTTP 401, and Computer Use blocked Codex UI inspection. Do not invent a prompt, copy a synthetic upstream test instruction, introduce a runtime Codex dependency, or bypass the access restriction.

**Contract:** The [Pi Predict specification](../../../docs/specs/pi-predict.md) is the canonical spec. It contains the problem statement, solution, 40 user stories, implementation decisions, testing decisions, exclusions, current evidence, and verification limits. The [adapter decision](../../../docs/adr/0032-independent-composer-followups.md) and [preserve-Pi-contracts decision](../../../docs/adr/0001-preserve-pi-extension-contracts.md) define the accepted native integration boundary.

**Current implementation:** The package, native model settings, request/context preparation, reversible composer adapter, lifecycle handling, README, screenshots, and release metadata already exist in the working tree. Production prompt fields remain unset, and generation reports the missing reference before calling a model. Complete and verify that implementation; this issue does not call for a rewrite or reopening settled design questions.

**Remaining acceptance:**

- [ ] Bundle the exact verified prompt, reference version, configured reasoning override, capture date, and content hash in the readable package reference.
- [ ] Compare the resulting prediction instruction and JSON-schema suffix with the inspected Codex contract. Confirm that the selected Pi model receives the complete effective conversation and that prediction tools cannot execute.
- [ ] Recheck affected behavior through the existing real-Pi host and packed extension after the reference changes. Keep synthetic fixtures separate from production source and do not count them as exact-prompt or live-provider quality evidence.
- [ ] Update preview warnings and release status only when the verified reference is present and relevant checks pass. Record remaining physical-terminal, provider-quality, and version limits honestly.

**Testing seam:** Retain the existing real Pi InteractiveMode and AgentSession host, normal extension registration, recording terminal, controlled local provider, real keyboard/lifecycle routes, retained sessions, and captured provider requests. Assert displayed text, draft content, submission, context, and persistence together. Reuse the same seam for the standalone archive check with sibling packages absent. No new production interface or committed test suite is part of this specification publication.

**Existing evidence:** Before publication, 34 behavior/lifecycle/provider-boundary probes, 75 existing host/composer checks, and two standalone archive checks passed. Typecheck, lint, scoped formatting, and whitespace checks also passed. These are controlled-provider results, not exact-prompt or live-provider quality verification. The [research record](../../../docs/plans/composer-predictions.md#recorded-implementation-verification) preserves exact commands, runtime versions, the standalone host dependency pin, and verification limits.

**Scope:** One complete independent feature, including model preferences, prompt/context fidelity, lifecycle, watermark rendering, acceptance, compatibility, distribution, and documentation. No replacement composer, sibling integration dependency, forced package order, automatic submission, context truncation, fallback model, new credential management, or changes to installed Pi are authorized by this issue.

**Publication:** Published to the existing local Markdown tracker as `ready-for-agent` on 2026-10-20 using to-spec. The triage status records the agreed work; it does not mean the reference dependency is resolved or the package is ready to release. Publication changes documentation and tracker state only. Existing implementation and prior verification retain their original scope; no behavior tests were rerun for this synthesis.
