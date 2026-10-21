# 02: Enable verified suggested follow-ups

**Parent:** [01: Complete independent composer predictions](01-independent-composer-predictions.md).

**What to build:** Make the existing `pi-predict` extension generate suggested follow-ups with the verified Codex reference prompt and complete effective Pi context. Users can choose a prediction model through native settings, see faint text in the empty composer, and press Tab to insert an editable draft without submitting it. Deliver this behavior in a standalone package that works with native Pi and `pi-composer`, in either order and after composer replacement.

**Blocked by:** None. The user supplied the Codex configuration values `prompt`, `prompt_version`, and `prediction_reasoning_effort` on 2026-10-20. The parent remains the scope reference.

**Status:** resolved

**Acceptance criteria:**

- [x] Record the exact supplied prompt, remote version, reasoning override, reference receipt date, and content hash in the package's readable reference. Document that the supplied JSON has no HTTP capture timestamp or app build. Keep the inspected client contract separate from that provenance; do not substitute a synthetic instruction, fetch Codex configuration at runtime, or introduce another application dependency.
- [x] Verify the resulting instruction and nullable-string JSON-schema suffix against the supplied reference and inspected client contract. Confirm that the selected Pi model receives the complete effective context, including current instructions, completed response, tool declarations and results, and images permitted by Pi. Keep the parent conversation unchanged and execute no prediction tools.
- [x] Demonstrate a prediction from the bundled reference appearing as faint text in the empty composer and becoming an editable draft only after plain Tab. Verify native Pi and both `pi-composer` orders, later replacement, normal and fullscreen layouts, full-text insertion from a clipped preview, and preservation of native undo and completion behavior.
- [x] Preserve inherited and independent model selection, Pi-owned authentication, persisted enablement and preferences, and clear failure behavior. Keep the established single-attempt, dismissal, typing, cancellation, and session-isolation rules. Recheck cases affected by the captured prompt or any necessary fixes rather than rebuilding completed components.
- [x] Pack and load the actual extension outside the workspace without sibling packages. Verify that the archive contains the verified reference and can generate and accept a suggestion through the existing real-Pi host. Keep controlled provider responses distinct from live-provider quality evidence and record any host dependency pin.
- [x] Pass the relevant static and behavioral checks after the reference is integrated. Update preview warnings and release status only after reference acceptance succeeds, retaining accurate compatibility, physical-terminal, and provider-quality limits.

**Testing seam:** Use the existing real Pi InteractiveMode and AgentSession host, normal extension loading, recording terminal, actual keyboard and lifecycle routes, temporary preference storage, and captured requests to a controlled provider. Compare rendered text, actual draft content, submission, effective context, and persistence. Add no production testing interface or committed test suite solely for this ticket.

**Existing evidence:** The implementation passed 38 behavior/lifecycle/provider-boundary probes, 75 existing host/composer checks, two standalone archive checks, typecheck, lint, formatting, and whitespace checks. These results used controlled responses and synthetic probe instructions; they do not establish exact-prompt parity. Physical-terminal input, later Pi releases, the full repository test suite, and live-provider quality remain unverified. The standalone Pi 1.1.0 host pins its own pi-codemode dependency to 1.1.0; this is not an extension dependency.

**Scope and ownership:** Complete the existing implementation under the [canonical specification](../../../docs/specs/pi-predict.md) and [approved adapter decision](../../../docs/adr/0032-independent-composer-followups.md). Keep prompt integration, model/context fidelity, composer behavior, relevant verification, and delivery documentation in this one verifiable slice. Do not create separate tickets for already implemented settings, rendering, lifecycle, or packaging. Preserve the parent issue and other packages.

**Frontier:** No remaining blockers. The supplied reference has been integrated and checked; this ticket and its parent are resolved.

**Publication:** Published on 2026-10-20 after the user requested implementation of the proposed completion slice, initially on `codex/pi-predict`. That implementation was integrated into `main`; reference integration subsequently completed the remaining work.

**Implementation work, 2026-10-20:** The package is committed as `4b98452`; `1741bf8` fixes three reproduced defects: detached render wrappers interfering with Tab after native-editor restoration, old context surviving compaction, and prediction requests remaining active while compaction generates a summary. Four temporary real-host assertions failed before the corresponding fixes and passed afterward. Both review axes were performed directly after the implementer and review agents failed to start. The [research record](../../../docs/plans/composer-predictions.md) contains the review and final verification commands. The external reference was still unavailable at that stage.

**Resolution, 2026-10-20:** `prediction-config.json` supplied prompt version 5 with high reasoning. Exact prompt, metadata, hash, and schema comparisons passed. The production reference passed all 39 real-host probes and both unchanged-archive checks in standalone Pi 1.1.0, using controlled local responses and the existing host dependency pin. Typecheck and scoped lint passed. READMEs, release metadata, specification, and provenance now reflect the bundled reference. The local editable installation needs only `/reload`. Physical-terminal input, later Pi releases, the full repository suite, and live-provider quality remain unverified; no registry publication was performed.
