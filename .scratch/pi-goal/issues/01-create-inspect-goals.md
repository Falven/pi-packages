# 01: Create and inspect goals

**What to build:** Install `pi-goal` as an independent extension, create an explicitly requested goal, inspect its stored state through the agent interface and native status display, and recover that state when the same session reopens. Follow the approved [specification](../../../docs/specs/pi-goal.md).

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] Load through the repository's extension packaging and public Pi services. Verify the primary Pi 1.1.0 runtime separately from the workspace's 1.0.2 dependency, and choose supported versions from demonstrated capabilities. Companion extensions are optional.
- [ ] Expose `get_goal` and `create_goal` with the specified names, descriptions, parameter names, required fields, strictness, additional-property declaration, and absent output schema. Preserve effective tool overrides and detect or explicitly bound tool-name collisions without changing unrelated tools' concurrency.
- [ ] Describe creation as requiring explicit authorization and budgets as requiring an explicit request. The extension never infers a goal from an ordinary task and adds no default allowance or deployment-policy setting that the host does not supply.
- [ ] Keep one current goal per persisted Pi session in an extension-owned durable store independent of the active transcript branch. Create an active goal with fresh identity, creation time, and zero counters; reject replacement of an unfinished goal. Exercise replacement after completion with ticket 02.
- [ ] Preserve Unicode whitespace trimming, the nonempty 4,000-scalar objective limit, positive signed 64-bit budgets, omitted or null optional budgets, unknown object members, sequence-form arguments, and the read tool's unused raw arguments. Preserve the observed invalid-input outcomes, including duplicate members and numeric overflow.
- [ ] Prove argument fidelity through the real provider parser and active orchestration path before declaring decoder compatibility. Record a concrete capability gap if raw arguments or exact integers are lost; do not silently round, coerce, narrow the contract, or introduce private integration.
- [ ] Return the specified JSON envelope with explicit top-level nulls, omitted unbounded `tokenBudget`, exact field casing, integer counters, and Unix-second timestamps. Return ordinary failures as the specified plain text. A failed read must not become a successful missing-goal result.
- [ ] Verify direct-call JSON text and native programmatic JSON values separately, including their next-request serialization and error propagation. Do not add internal success flags to a wire format that does not contain them.
- [ ] Serialize goal operations and persist updates atomically. Session ownership and generation identity must protect other sessions and later replacement goals. Persistence failure leaves an actionable failure and does not commit an in-memory success.
- [ ] Provide native inspection and status presentation without replacing the footer, editor, chat view, or other extensions' presentation. An agent-created goal initially contributes its ordinary tool result, with no fabricated goal reminder.
- [ ] Exercise no-goal reads, valid and invalid creation, duplicate creation, direct and nested calls, storage failure, and reopening through the existing real-session fixture. Inspect actual provider requests and persisted outcomes; do not build a second fake agent loop.
- [ ] Capture the create/read agent-interface scenarios in Phoenix, identify capture layers and runtime settings, and retrieve the records to verify payload fidelity. Record neutral trace references and material differences in this ticket; existing general traces do not establish goal behavior.
- [ ] Keep Pi source and installed files untouched. Use neutral terminology in all authored content, run the relevant checks, and leave unsupported or unperformed acceptance visibly pending.
