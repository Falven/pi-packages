# 01: Create and inspect goals

**What to build:** Install `pi-goal` as an independent extension, create an explicitly requested goal, inspect its stored state through the agent interface and native status display, and recover saved state when the same session reopens under Pi's native persistence guarantees. Follow the approved [specification](../../../docs/specs/pi-goal.md).

**Blocked by:** None.

**Status:** ready-for-agent — native session storage delta. Earlier unresolved feature gates remain open.

**Baseline status:** complete — creation and inspection meet the native interface contract accepted on 2026-10-14. Lifecycle, accounting, continuation, and Stop remain in their own tickets.

## Native session storage delta

The accepted storage revision in the specification and ADR 0025 governs this delta. Each ticket retains its existing dependency edges; only these new criteria are being implemented in this revision.

- [ ] Replace the internal goal store with public native custom entries for the owning session. Remove active database imports, initialization, paths, queries, and closing logic without adding a dependency, second store, or host modification.
- [ ] Write full snapshots with session ownership, generation, objective, status, exact decimal-string integer fields, and optional budget. Restore the latest current-session record across all retained entries in append order; exclude clearly foreign owners and report malformed authoritative data rather than returning null or an older snapshot.
- [ ] Preserve all three native tool contracts, successful result values, validation ownership, and lossless conversions. Re-read current state before serialized mutations so older captures cannot overwrite counters or replacement generations.
- [ ] Demonstrate native first-save timing: a goal can exist before a conversation message or session file; the first native message saves it, and an early exit has no independent durability promise. Ephemeral sessions remain unsupported and no synthetic message forces persistence.
- [ ] Keep different sessions independent and document the accepted single-process-per-session limit. Storage errors remain native errors; the retaining failure stop is completed in ticket 03.
- [ ] Adapt creation and inspection checks through the approved real-session seam, including exact large values, Unicode and embedded NUL text, damaged recognized records, first save, reopen, and exclusion of raw state from provider context.

## Historical acceptance

The checklist and evidence below describe the earlier implementation. They are not validation of native storage. Earlier database durability and atomic-write guarantees are superseded by the accepted native persistence limits; unchecked broader feature gates remain open.

- [x] Load through the repository's extension packaging and public Pi services. Verify the primary Pi 1.1.0 runtime separately from the workspace's 1.0.2 dependency, and choose supported versions from demonstrated capabilities. Companion extensions are optional.
- [x] Expose `get_goal` and `create_goal` through Pi's native schemas, validation, result delivery, and errors. Preserve the goal policy descriptions, effective overrides, and tool-name collision handling without changing unrelated tools' concurrency. Remove decoder emulation and provider/history rewriting.
- [x] Describe creation as requiring explicit authorization and budgets as requiring an explicit request. The extension never infers a goal from an ordinary task and adds no default allowance or deployment-policy setting that the host does not supply.
- [x] Keep one current goal per persisted Pi session in an extension-owned durable store independent of the active transcript branch. Create an active goal with fresh identity, creation time, and zero counters; reject replacement of an unfinished goal. Exercise replacement after completion with ticket 02.
- [x] Preserve domain rules for Unicode whitespace trimming, the nonempty 4,000-scalar objective limit, positive signed 64-bit budgets, and omitted/null optional budgets. Pi owns schema failures, duplicate fields, extra properties, accepted argument forms, coercion, and diagnostics.
- [x] Preserve budget values with safe numeric inputs and exact decimal-string inputs for larger integers. Prove that the native schema rejects unsafe numbers without coercing them to rounded strings. Preserve all stored integer values in direct and native programmatic results; remove obsolete raw-decoder fixtures.
- [x] Return the goal envelope through native text and structured content, preserving top-level nulls, omission of unbounded `tokenBudget`, field casing, counters, and Unix-second units. Represent unsafe-sized result integers as exact decimal strings. A failed read must not become a successful missing-goal result.
- [x] Verify native validation, direct and programmatic results, Pi-owned error propagation, permissions, and next-request serialization through the real session. Do not wrap the host to reproduce another exception type.
- [x] Serialize goal operations and persist updates atomically. Session ownership and generation identity must protect other sessions and later replacement goals. Persistence failure leaves an actionable failure and does not commit an in-memory success.
- [x] Provide native inspection and status presentation without replacing the footer, editor, chat view, or other extensions' presentation. An agent-created goal initially contributes its ordinary tool result, with no fabricated goal reminder.
- [x] Exercise no-goal reads, valid and invalid creation, duplicate creation, direct and nested calls, storage failure, and reopening through the existing real-session fixture. Inspect actual provider requests and persisted outcomes; do not build a second fake agent loop.
- [x] Capture the create/read agent-interface scenarios in Phoenix, identify capture layers and runtime settings, and retrieve the records to verify payload fidelity. Record neutral trace references and material differences in this ticket; existing general traces do not establish goal behavior.
- [x] Keep Pi source and installed files untouched. Use neutral terminology in all authored content, run the relevant checks, and leave unsupported or unperformed acceptance visibly pending.

## Historical Implementation evidence

The package registers the goal tools through public Pi APIs and stores one current goal per persisted session in `pi-goal.sqlite`. Creation is an atomic SQLite statement with a fresh private generation and zero counters. Unfinished replacement, ephemeral sessions, and storage locks remain failures. Goal tools request sequential execution individually. Replacement after completion and late-event accounting remain in their assigned tickets.

Pi now owns schema validation, ordinary coercion, result delivery, and errors. The custom decoder, argument bridge, stream hooks, request strictness changes, history rewriting, and their obsolete fixtures were removed. No private integration or shared fixture change was needed. Native errors are ordinary `Error` objects in programmatic calls; this is accepted behavior.

The budget schema uses `type: ["integer", "string"]`, a numeric minimum of 1 and maximum of 9007199254740991, and a positive decimal-string pattern with a 19-digit limit. Real sessions on both supported runtimes prove that unsafe numeric inputs, including already rounded inputs, fail native validation before the permission handler. A small domain conversion checks the full positive signed 64-bit range with `BigInt`. Optional null budgets follow native optional-field handling. Numeric and string coercions remain Pi's responsibility.

Safe result integers remain numbers; larger integers become exact decimal strings. Text and structured content derive from the same converted object. Tests cover the safe boundary, the first larger integer, the maximum allowance, overflow, direct and programmatic calls, subsequent reads, and restored provider history. Permission handlers receive exact string budgets, can edit objectives or cap budgets, and can deny creation. An unsafe numeric value introduced by a permission handler is rejected before storage.

Objectives retain Unicode whitespace trimming and the nonempty 4,000-scalar limit. A failing real-session test proved that unpaired surrogates could otherwise change during storage; `isWellFormed()` now rejects them before persistence. Another failing Node 24 test found that its SQLite text reader returned only `a` from `a\u0000b`, although stored bytes were `610062` with length 3. Reading the TEXT column as bytes and decoding UTF-8 preserves embedded NULs without a new storage encoding or runtime-version branch. Unicode, scalar-limit, and exact read-back checks pass.

The effective foreign tool remains authoritative when a name collision occurs, with the native registration diagnostic and a clear goal collision notice. Native inspection and status display preserve other interface ownership. Terminal control sequences are removed only from displayed objective text. Ordinary tasks create no goal, and goal creation contributes only its ordinary tool result.

## Historical Current agent-interface captures

Fresh runs use a real Pi 1.1.0 session with a local scripted provider. They capture complete host context, the last public request observer, received request-body strings after decompression, parsed provider events, tool starts and results, and final messages. The observer equals the received decoded string; this does not establish compressed transport-byte identity. Authorization headers are absent. Each complete stored input and output was retrieved and checked by SHA-256, correlated by span identity. Captures also record hashes of the package source files.

| Scenario                 | Trace                                                                                                                                                   | Verified records                        |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| Create and read          | [561bddfba8eb0973c4230f0efb09e290](http://127.0.0.1:6006/v1/projects/UHJvamVjdDoz/spans?trace_id=561bddfba8eb0973c4230f0efb09e290&limit=1000&order=asc) | Three requests; six input/output hashes |
| Native values and errors | [65434982f1e183d71e93402a1ea5938c](http://127.0.0.1:6006/v1/projects/UHJvamVjdDoz/spans?trace_id=65434982f1e183d71e93402a1ea5938c&limit=1000&order=asc) | Two requests; four input/output hashes  |

The native capture includes rejection of an unsafe numeric allowance, exact maximum-size decimal-string values in structured results, and ordinary native errors. The create/read prefix uses the same prompt, call identities, arguments, and scripted usage as the [comparison trace](http://127.0.0.1:6006/v1/projects/UHJvamVjdDoz/spans?trace_id=2d3e7f73b4fa4515b3ac4f4f3166f60a&limit=1000&order=asc). Goal JSON matches after excluding only `goal.threadId`, `goal.createdAt`, and `goal.updatedAt`. Both calls contribute ordinary tool results; creation inserts no goal reminder. Completion remains outside this slice.

Runtime metadata records Pi 1.1.0 at `6fb2e7815167e6b19006fc526d1a5d0f5f998787`, Node 24.13.1, the fixture model with reasoning disabled, 128,000 context capacity, 100 output-token maximum, and disabled compaction/retry. Scripted call responses report 100 input tokens, 20 cached tokens, 12 output tokens, and 4 reasoning tokens. The final fixture answer has no usage and is explicitly marked missing. Configured models, reasoning settings, host instructions, and full tool sets differ from the comparison run. These are scripted session captures, not matched live-model or desktop-control observations.

The earlier [create/read trace](http://127.0.0.1:6006/v1/projects/UHJvamVjdDoz/spans?trace_id=d7dbd987e6a09ed8d0cf61723a451158&limit=1000&order=asc) and [native-error trace](http://127.0.0.1:6006/v1/projects/UHJvamVjdDoz/spans?trace_id=889fb6c82fde5470dcd3f1a3ab9da511&limit=1000&order=asc) are historical evidence for the superseded decoder and transport approach. Their files remain intact; they do not prove the revised implementation. The previous exception-type blocker is superseded by the accepted native contract.

## Historical Validation

Both scoped commands passed all 48 checks on Node 24.13.1. The first uses workspace Pi 1.0.2; the second uses primary Pi 1.1.0:

```sh
/Users/fran/.nvm/versions/node/v24.13.1/bin/node --experimental-transform-types --test packages/pi-goal/test/goals.test.ts packages/pi-goal/test/protocols.test.ts test/native-host.test.ts
/Users/fran/.nvm/versions/node/v24.13.1/bin/node --experimental-transform-types --import /Users/fran/Source/pi/packages/coding-agent/src/experimental/source-resolver.ts --test packages/pi-goal/test/goals.test.ts packages/pi-goal/test/protocols.test.ts test/native-host.test.ts
```

- `pnpm run typecheck`, `pnpm exec oxlint packages/pi-goal`, scoped `oxfmt --check`, and `git diff --check` passed.
- Integration tip `b2b5cdb1e31f16c67eef79caea6631c308f5338c` was merged before this revision and checked again before reporting.
- The earlier integration installation encountered `ERR_PNPM_IGNORED_BUILDS` for existing dependencies. Installation was not retried, and build settings were not changed; checks use existing binaries.
- Known combined-glob runner limits from the earlier slice remain: Node 26 cannot transform the incoming Stop probe's imported parameter properties, and primary Node 24's source resolver cannot resolve the companion's `stack.js` import. Those unrelated probes were not rerun for this revision.
- Other provider protocols, full workspace tests, package lifecycle composition, and the remaining lifecycle/accounting matrix were not exercised here. Their acceptance remains in the assigned tickets.
