# 01: Create and inspect goals

**What to build:** Install `pi-goal` as an independent extension, create an explicitly requested goal, inspect its stored state through the agent interface and native status display, and recover that state when the same session reopens. Follow the approved [specification](../../../docs/specs/pi-goal.md).

**Blocked by:** None.

**Status:** in-progress — creation and inspection are implemented; adapt the interface to the accepted native contract and verify lossless values before closing.

- [x] Load through the repository's extension packaging and public Pi services. Verify the primary Pi 1.1.0 runtime separately from the workspace's 1.0.2 dependency, and choose supported versions from demonstrated capabilities. Companion extensions are optional.
- [ ] Expose `get_goal` and `create_goal` through Pi's native schemas, validation, result delivery, and errors. Preserve the goal policy descriptions, effective overrides, and tool-name collision handling without changing unrelated tools' concurrency. Remove decoder emulation and provider/history rewriting.
- [x] Describe creation as requiring explicit authorization and budgets as requiring an explicit request. The extension never infers a goal from an ordinary task and adds no default allowance or deployment-policy setting that the host does not supply.
- [x] Keep one current goal per persisted Pi session in an extension-owned durable store independent of the active transcript branch. Create an active goal with fresh identity, creation time, and zero counters; reject replacement of an unfinished goal. Exercise replacement after completion with ticket 02.
- [ ] Preserve domain rules for Unicode whitespace trimming, the nonempty 4,000-scalar objective limit, positive signed 64-bit budgets, and omitted/null optional budgets. Pi owns schema failures, duplicate fields, extra properties, accepted argument forms, coercion, and diagnostics.
- [ ] Preserve budget values with safe numeric inputs and exact decimal-string inputs for larger integers. Prove that the native schema rejects unsafe numbers without coercing them to rounded strings. Preserve all stored integer values in direct and native programmatic results; remove obsolete raw-decoder fixtures.
- [ ] Return the goal envelope through native text and structured content, preserving top-level nulls, omission of unbounded `tokenBudget`, field casing, counters, and Unix-second units. Represent unsafe-sized result integers as exact decimal strings. A failed read must not become a successful missing-goal result.
- [ ] Verify native validation, direct and programmatic results, Pi-owned error propagation, permissions, and next-request serialization through the real session. Do not wrap the host to reproduce another exception type.
- [x] Serialize goal operations and persist updates atomically. Session ownership and generation identity must protect other sessions and later replacement goals. Persistence failure leaves an actionable failure and does not commit an in-memory success.
- [x] Provide native inspection and status presentation without replacing the footer, editor, chat view, or other extensions' presentation. An agent-created goal initially contributes its ordinary tool result, with no fabricated goal reminder.
- [x] Exercise no-goal reads, valid and invalid creation, duplicate creation, direct and nested calls, storage failure, and reopening through the existing real-session fixture. Inspect actual provider requests and persisted outcomes; do not build a second fake agent loop.
- [x] Capture the create/read agent-interface scenarios in Phoenix, identify capture layers and runtime settings, and retrieve the records to verify payload fidelity. Record neutral trace references and material differences in this ticket; existing general traces do not establish goal behavior.
- [x] Keep Pi source and installed files untouched. Use neutral terminology in all authored content, run the relevant checks, and leave unsupported or unperformed acceptance visibly pending.

## Implementation evidence

The package loads through its `pi.extensions` manifest, uses public extension hooks, and stores one current row per persisted session in `pi-goal.sqlite` under the agent directory. Creation is one atomic SQLite statement with a fresh private generation. The goal tools request sequential execution individually. Unfinished creation, unavailable persistence, and storage locks return failures. A failed creation leaves no cached successful goal. Replacement and late-event behavior remain work for the lifecycle and accounting tickets.

The initial real-host boundary probes reproduced duplicate-member loss, integer rounding, and native JSON text results. Public stream hooks retain the original arguments; custom session entries retain those strings for reopened history; `prepareArguments` applies the decoder before generic validation; the final request hook restores original goal-call strings. Both provider protocols were exercised, including a response containing only finalized arguments. Other provider protocols remain unverified.

There are 76 creation fixtures exercised through the real provider and tool pipeline. An independent 123-case differential against the pinned decoder implementation also agrees. Coverage includes unknown members, sequence arguments, duplicate known fields, malformed JSON, byte-based error positions, signed-integer boundaries, Unicode whitespace, and 4,000 versus 4,001 scalars. These are bounded compatibility checks, not proof for every possible JSON string.

Direct creation and reading preserve `9223372036854775807` in storage and outgoing JSON text. A native programmatic read exposes the host's rounded JavaScript number; a subsequent direct read remains exact. The observed target has the same native-number limitation. Permission handlers receive the actual prepared objective and native numeric value; objective edits retain an unchanged exact budget, budget edits are respected, and permission denial prevents creation. Permission-hook numbers themselves cannot represent every signed 64-bit integer.

An internal empty result schema enables native JSON values and an `unknown` native return declaration. Actual provider requests advertise no output schema. The captured input declarations have object parameters, `additionalProperties: false`, and `strict: false`. A first-registered foreign inspection tool remains effective; the host reports its duplicate registration, and the package reports the collision before its own creation can proceed. Hooks leave the foreign tool's arguments and history under its ownership.

Creation and read results keep identical field order across reopening. The native status and `/goal` inspection strip terminal control sequences from display data while storage and model output retain the original objective. A real terminal-buffer test first reproduced an OSC sequence escaping through the footer and then verified both display paths after the fix.

## Agent-interface captures

The final Pi runs use the real Pi 1.1.0 session and a local scripted provider. They include complete host context, the last public request observer, received request-body strings, parsed stream events before normalization, tool starts and results, and final messages. The observer strings equal the endpoint's received strings. Authorization headers are absent from the captured records. Each stored input and output was retrieved and checked by SHA-256.

| Scenario                 | Trace                                                                                                                                                   | Verified records                        |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| Create and read          | [d7dbd987e6a09ed8d0cf61723a451158](http://127.0.0.1:6006/v1/projects/UHJvamVjdDoz/spans?trace_id=d7dbd987e6a09ed8d0cf61723a451158&limit=1000&order=asc) | Three requests; six input/output hashes |
| Native values and errors | [889fb6c82fde5470dcd3f1a3ab9da511](http://127.0.0.1:6006/v1/projects/UHJvamVjdDoz/spans?trace_id=889fb6c82fde5470dcd3f1a3ab9da511&limit=1000&order=asc) | Two requests; four input/output hashes  |

The create/read prefix uses the same prompt, arguments, call identities, and scripted usage as the [comparison trace](http://127.0.0.1:6006/v1/projects/UHJvamVjdDoz/spans?trace_id=2d3e7f73b4fa4515b3ac4f4f3166f60a&limit=1000&order=asc). Its successful JSON text matches after replacing only the session identity and creation/update timestamps. Both calls contribute ordinary tool results; creation inserts no goal reminder. Completion is not exercised by this slice.

Runtime metadata records Pi 1.1.0 at `6fb2e7815167e6b19006fc526d1a5d0f5f998787`, Node 26.8.1, the fixture model with reasoning disabled, 128,000 context capacity, 100 output-token maximum, and disabled compaction/retry. Scripted call responses report 100 input tokens, 20 cached tokens, 12 output tokens, and 4 reasoning tokens. The final fixture answer omits usage and is explicitly marked missing. The configured models, reasoning settings, surrounding host instructions, and complete tool sets differ. These captures establish the create/read boundary, not a matched live-model or desktop-control run. Full comparison and accounting remain pending.

## Revised native interface decision

On 2026-10-14 the accepted contract changed: Pi owns validation, result delivery, and errors while goal rules and values remain intact. The previously captured `Error` object is expected native behavior and is no longer a blocker. The implementation and capture evidence above describe the earlier decoder/transport approach; replace its emulation and verify the revised interface before claiming this ticket complete. Keep the earlier traces identifiable as historical evidence, not proof of code added after their capture.

## Validation

- On Node 24.13.1, the workspace's Pi 1.0.2 dependency passed all 123 combined package and native-host checks, including the incoming admission and Stop probes:

  ```sh
  /Users/fran/.nvm/versions/node/v24.13.1/bin/node --experimental-transform-types --test packages/pi-goal/test/*.test.ts test/native-host.test.ts
  ```

- On Node 24.13.1, primary Pi 1.1.0 passed all 100 creation/inspection and existing native-host checks:

  ```sh
  /Users/fran/.nvm/versions/node/v24.13.1/bin/node --experimental-transform-types --import /Users/fran/Source/pi/packages/coding-agent/src/experimental/source-resolver.ts --test packages/pi-goal/test/goals.test.ts packages/pi-goal/test/protocols.test.ts packages/pi-goal/test/public-boundaries.test.ts test/native-host.test.ts
  ```

- The same 100-check scope previously passed on both Pi runtimes with Node 26.8.1. The combined Node 26 glob passed 106 checks but failed loading the incoming Stop probe because its imported companion code uses TypeScript parameter properties. Node 26 does not accept the transform-types flag. The primary Node 24 combined glob also passed 106 checks, then failed loading that probe because the source resolver could not resolve `packages/tui/src/components/stack.js` from the companion import. These combined-run limitations were not changed by this ticket.
- `pnpm install --frozen-lockfile --ignore-scripts` passed with the new workspace importer. Build approvals and persistent settings were unchanged.
- The same install command later exited with `ERR_PNPM_IGNORED_BUILDS` in the integration checkout for three existing transitive dependencies. No build approval or configuration was changed. Integration typecheck, scoped lint, and formatting passed through the existing local binaries; the integration install check remains unresolved.
- `pnpm run typecheck`, `pnpm exec oxlint packages/pi-goal fixtures/native-host.ts`, and `pnpm exec oxfmt --check packages/pi-goal fixtures/native-host.ts` passed.
- The integration tip `386dd12149c88e6d07f486f576db0301391af732` was merged before reporting.
- Other provider protocols, package lifecycle composition with companion extensions, the full workspace suite, and the remaining lifecycle matrix were not exercised in this slice. The revised native interface needs fresh validation; the earlier exception-type blocker is superseded.
