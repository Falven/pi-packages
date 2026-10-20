# 02: Enable verified suggested follow-ups

**Parent:** [01: Complete independent composer predictions](01-independent-composer-predictions.md).

**What to build:** Make the existing `pi-predict` extension generate suggested follow-ups with the verified Codex reference prompt and complete effective Pi context. Users can choose a prediction model through native settings, see faint text in the empty composer, and press Tab to insert an editable draft without submitting it. Deliver this behavior in a standalone package that works with native Pi and `pi-composer`, in either order and after composer replacement.

**Blocked by:** No other ticket. External prerequisite: a verified capture of the Codex configuration values `prompt`, `prompt_version`, and `prediction_reasoning_effort`. These values are currently unavailable. The parent is a scope reference, not a prerequisite that must close first. Implementation cannot finish until the reference is available.

**Status:** ready-for-agent

**Acceptance criteria:**

- [ ] Record the exact prompt, remote version, reasoning override, capture date, and content hash in the package's readable reference. Verify provenance against the inspected Codex version; do not substitute a synthetic instruction, fetch Codex configuration at runtime, or introduce another application dependency.
- [ ] Verify the resulting instruction and nullable-string JSON-schema suffix against the captured reference. Confirm that the selected Pi model receives the complete effective context, including current instructions, completed response, tool declarations and results, and images permitted by Pi. Keep the parent conversation unchanged and execute no prediction tools.
- [ ] Demonstrate a prediction from the bundled reference appearing as faint text in the empty composer and becoming an editable draft only after plain Tab. Verify native Pi and both `pi-composer` orders, later replacement, normal and fullscreen layouts, full-text insertion from a clipped preview, and preservation of native undo and completion behavior.
- [ ] Preserve inherited and independent model selection, Pi-owned authentication, persisted enablement and preferences, and clear failure behavior. Keep the established single-attempt, dismissal, typing, cancellation, and session-isolation rules. Recheck cases affected by the captured prompt or any necessary fixes rather than rebuilding completed components.
- [ ] Pack and load the actual extension outside the workspace without sibling packages. Verify that the archive contains the verified reference and can generate and accept a suggestion through the existing real-Pi host. Keep controlled provider responses distinct from live-provider quality evidence and record any host dependency pin.
- [ ] Pass the relevant static and behavioral checks after the reference is integrated. Update preview warnings and release status only after reference acceptance succeeds, retaining accurate compatibility, physical-terminal, and provider-quality limits.

**Testing seam:** Use the existing real Pi InteractiveMode and AgentSession host, normal extension loading, recording terminal, actual keyboard and lifecycle routes, temporary preference storage, and captured requests to a controlled provider. Compare rendered text, actual draft content, submission, effective context, and persistence. Add no production testing interface or committed test suite solely for this ticket.

**Existing evidence:** The implementation passed 38 behavior/lifecycle/provider-boundary probes, 75 existing host/composer checks, two standalone archive checks, typecheck, lint, formatting, and whitespace checks. These results used controlled responses and synthetic probe instructions; they do not establish exact-prompt parity. Physical-terminal input, later Pi releases, the full repository test suite, and live-provider quality remain unverified. The standalone Pi 1.1.0 host pins its own pi-codemode dependency to 1.1.0; this is not an extension dependency.

**Scope and ownership:** Complete the existing implementation under the [canonical specification](../../../docs/specs/pi-predict.md) and [approved adapter decision](../../../docs/adr/0032-independent-composer-followups.md). Keep prompt integration, model/context fidelity, composer behavior, relevant verification, and delivery documentation in this one verifiable slice. Do not create separate tickets for already implemented settings, rendering, lifecycle, or packaging. Preserve the parent issue and other packages.

**Frontier:** There are no ticket-to-ticket blocking edges. The single ticket becomes actionable for completion when the verified external reference is supplied. Do not describe it as immediately unblocked while that input is absent.

**Publication:** Published on 2026-10-20 after the user requested implementation of the proposed completion slice. Integration branch: `codex/pi-predict`. The existing implementation and its evidence remain the starting point; the exact reference is still required for resolution.

**Implementation work, 2026-10-20:** The package is committed as `4b98452`; `1741bf8` fixes three reproduced defects: detached render wrappers interfering with Tab after native-editor restoration, old context surviving compaction, and prediction requests remaining active while compaction generates a summary. Four temporary real-host assertions failed before the corresponding fixes and passed afterward. Both review axes were performed directly after the implementer and review agents failed to start. The [research record](../../../docs/plans/composer-predictions.md) contains the review and final verification commands. The external reference remains unavailable, so this ticket and its parent remain unresolved.
