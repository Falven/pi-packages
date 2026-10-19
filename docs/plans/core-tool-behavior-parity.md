# Core tool behavior parity

**Status:** specified on 2026-10-18 in the [existing core-tool specification](../../.scratch/core-tools/spec.md), published as `ready-for-agent`. This remains an implementation plan, not a runtime implementation or a new parity result. The six requested corrections are settled scope. Q1 is answered: Pi must remain unchanged under every circumstance. Q2 is accepted: our extension will own core-tool image preparation under Codex's rules. Q3 is accepted: our command tool will follow Codex's complete rule for explicit shell selection. An eight-case public-hook probe shows a possible image path on the installed Pi; it restores final image bytes but does not skip Pi's earlier normalization. Its production limits are recorded below.

## Outcome and scope

For the same script or arguments, initial files, and selected tool surface, Pi must reproduce the scoped reference's accepted inputs, defaults, ordered model-visible results, relevant lifecycle effects, and final filesystem state. Image comparison must include what reaches the provider, not just the return from `view_image()`.

The user selected these corrections:

| Area                     | Required outcome                                                                                                                                                         |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Cell termination         | A command already running when its coordinating cell is terminated can complete. Ending the cell must not turn the command into a killed process.                        |
| Argument validation      | Match Codex's field-specific type, null, default, range, and unknown-property behavior. Invalid inputs must fail before their operation executes.                        |
| Explicit shell selection | Follow Codex's complete shell-selection rule, including fallback and treatment of an existing explicit path. Q3 is accepted.                                             |
| JavaScript failures      | Match status framing, ordered output parts, rejection values, and genuine source error information.                                                                      |
| Patch effects            | Delete the target, fail the subsequent now-dangling symlink deletion, leave the link, and expose that partial failure to the model and activity consumers.               |
| Image detail             | Preserve the requested detail through the extension and host, apply the reference's appropriate preparation policy, and compare final image bytes and provider metadata. |

Keep the six-tool surface. Additional desktop tools, notification-role parity, MCP image-block overloads, audio/generated-image helpers, system prompts, and general performance tuning are separate work. Existing image-helper detail values are included in the detail and argument checks. The separate native display placement exception remains valid: an image can appear in the collecting result while its operation retains its originating identity.

The platform and transport reference remains the audited macOS ARM64 installation and its Responses path. This plan does not establish behavior on Windows, Linux, other providers, or consumer ChatGPT's server tools. Preserve Pi's actual permissions, result redaction, independent extension composition, and session cleanup.

**Fixed boundary:** use Pi as installed. Changes belong in our extension and its supporting documentation and fixtures. Do not modify Pi source, installed packages, private methods, global settings, or version requirements to obtain new host behavior. Do not fork or patch Pi, including upstream. Existing public extension APIs are available for investigation; their existence is not proof of complete parity. Report any difference that cannot be resolved within this boundary. Do not treat Q1 as acceptance of an image difference or ask again to change Pi.

## Reference and evidence

The installed executable still reports `codex-cli 0.163.0-alpha.10.2` on 2026-10-18. The reference source is the version-associated commit `4ebc485ca321243727539187169425fcf972f2c4`. The audit records its binary hashes; a version association is not a reproducible-build proof.

Planning inspected repository `969a29e73b36c1f7cc7355560f5c7cf2b423d391`, Pi host/AI/core packages `1.1.0`, and the installed host's public interfaces. The affected package, host fixture, glossary, and ADR 0024 have no changes between the audit's later formatting revision `c45158e` and this planning revision. Runtime captures remain attributed to audit revision `27c0e7e`.

- [Audit report](/Users/fran/.pi/artifacts/pi-codex-tools-parity-2026-10-17/report.md): 147 cases, 158 steps, 113 normalized matching payload sequences and 45 differences.
- [All captures and reproduction instructions](/Users/fran/.pi/artifacts/pi-codex-tools-parity-2026-10-17/README.md), [differing payloads](/Users/fran/.pi/artifacts/pi-codex-tools-parity-2026-10-17/all-differences.md), and [Phoenix summary](http://127.0.0.1:6006/projects/UHJvamVjdDo0/traces/0ad9f81e4a0f44b3af73183db0c0635b).
- [Pending-command termination capture](/Users/fran/.pi/artifacts/pi-codex-tools-parity-2026-10-17/runs/supplemental-1/wait-terminate-pending-command/comparison-v3.json).
- [Target-then-symlink deletion capture](/Users/fran/.pi/artifacts/pi-codex-tools-parity-2026-10-17/runs/full-1/patch-delete-dangling-alias/comparison-v3.json).
- [2026-10-18 public image hook probe](/Users/fran/.pi/artifacts/pi-codex-tools-image-hooks-2026-10-18.ib8b7m/README.md): eight isolated Pi cases, source bytes preserved through reload, and tested removal/replacement/blocking respected. This is not a new Codex/Phoenix parity run.
- Version-pinned source is available in the existing local bare repository `/Users/fran/.pi/artifacts/pi-codex-tools-parity-2026-10-17/runner/reference.git`. All source inspection for this plan used the explicit commit above, not its moving HEAD.

Keep the audit and its original fixtures unchanged. New captures must have new run names and their own source identities. Do not silently replace historical observations with desired behavior.

## Design tree and current frontier

| Branch               | Settled prerequisite                                                               | Current question or evidence gate                                                                             | Decisions that depend on it                                                                                                      |
| -------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Image integration    | Q1 is settled. The eight-case probe preserves a PNG through existing public hooks. | Resolve event lifetime; check image consumers before message replacement, mixed content, detail, and formats. | A production design, or a precisely evidenced remaining limitation. No Pi source or release branch remains available.            |
| Image preparation    | Q2 is accepted: our extension owns preparation under Codex's rules.                | Verify native limits, format behavior, and the public hooks needed to retain the final permitted image.       | A scoped image processor and final-message integration. No further approval of Q2 is needed.                                     |
| Explicit shell       | Q3 is accepted: use Codex's complete rule for an explicit shell argument.          | Verify the source rule with the valid-wrapper, discovery-order, and missing-path cases.                       | Implementation and a migration note; no further approval of Q3 is needed.                                                        |
| Cancellation         | The running command must survive explicit cell termination.                        | Compare dispatch-before-start, process collection, and queued file work against the reference.                | Whether any non-process lifetime rule also changes; do not infer it from a surviving OS process.                                 |
| Arguments and errors | Coercion, failure framing, and missing source stacks must change.                  | Replay errors through public preparation; measure where decoding has discarded raw JSON spelling/positions.   | Exact diagnostics achievable through existing APIs, and any evidenced limitation. Pi API changes are forbidden.                  |
| Patch effects        | Ordered partial failure is explicitly requested.                                   | Existing reproduction plus reverse-order and initial-dangling controls.                                       | No open user policy choice; the published specification records the requested effect.                                            |
| Encoded media        | Original image fidelity is required; comparator retains bytes.                     | Compare the existing image codec with the reference for resized pixels, encoding, orientation, and metadata.  | Reuse an existing codec if exact; otherwise decide a shared codec dependency versus an explicitly accepted remaining difference. |

All three policy questions raised so far are answered. The remaining gates require source or runtime evidence; they are not requests to approve Q1, Q2, or Q3 again. No image difference or dependency has been accepted in advance.

### Q1: Pi changes are forbidden

**Settled answer: no.** The user said, "You are not allowed to modify Pi under any circumstance." The previous recommendation to extend Pi's image contract and require a new release is withdrawn. Work in `pi-codex-tools` through existing public APIs only.

The existing `message_end` hook can replace a finalized tool-result message before persistence. The `before_provider_request` hook can replace a payload. Context hooks can change model messages. The eight-case probe combines existing hooks to preserve a permitted PNG before it enters history; changing `detail` only at the last step would not recover resized bytes. The broader production contract still needs the checks below.

### Q2: Which image rule controls the result?

**Accepted on 2026-10-18.** The user answered, "Q2 - Agreed," and asked whether our extension can bypass Pi's image handling and have its own. Core-tool image preparation belongs in `pi-codex-tools`. The requested detail and Codex's applicable limits determine the final image; Pi's automatic resize preference must not replace that decision. Image blocking and other extensions' removals and replacements remain effective. Global settings stay unchanged.

For the audited 3000×2000 PNG, `original` produces a 3000×2000 image in Codex. In Pi, the same request produces a 2000×1333 image with automatic resizing enabled. Turning resizing off alone still leaves `detail: "auto"` in Pi's provider request. The [existing image check](../../packages/pi-codex-tools/test/image.test.ts:276) shows that the size and detail field are separate problems.

Our extension can own preparation and replace the image before it enters history and the provider request. The public-hook probe demonstrates that path for the original PNG case. It does not stop Pi's image processor from running first: Pi still emits a resized result at its tool-completion boundary. No per-tool or per-image skip option appears in the inspected public contract. Treat the proposal as control of the final image, with remaining event/display behavior to verify; do not describe it as a complete processing bypass. Acceptance of Q2 settles the target, not every shortcut in the probe.

### Q3: Which shell program runs the command?

**Accepted on 2026-10-18.** The user answered, "Q3 - Agreed." Record that decision without asking again. The user also requested a simpler explanation.

The agent can give the command tool two separate inputs: the command to run and the program to run it. For example:

```json
{ "cmd": "echo hello", "shell": "/missing/bash" }
```

The task is to print `hello`. The second input names Bash at a file location that does not exist. Our current tool stops at that missing file. Codex reads the name `bash`, finds an installed Bash, and uses it to print `hello`. If the requested kind of shell is unknown or unavailable, Codex selects the platform fallback, `/bin/sh` on the audited machine. The command text stays the same; the selected program can change.

This rule also applies when the supplied file exists:

| Example explicit argument                         | Our current command tool   | Codex's source rule on the audited platform                 |
| ------------------------------------------------- | -------------------------- | ----------------------------------------------------------- |
| `/missing/bash`, with Bash installed elsewhere    | Tries that path and fails. | Finds an installed Bash and runs the command.               |
| `/tools/company-shell`, an existing custom script | Runs the custom script.    | The name is not a recognized shell kind; selects `/bin/sh`. |

The second row explains why this is broader than handling a missing file. A custom shell script can set environment values before starting Bash. The Codex rule can skip that setup. These rows explain the pinned source rule; the valid-wrapper case remains a planned runtime probe. The [captured missing-shell case](/Users/fran/.pi/artifacts/pi-codex-tools-parity-2026-10-17/all-differences.md:744) is already observed.

Implement that complete Codex rule inside our extension, including when the supplied file exists. It does not change Pi's configured shell; when the tool call omits `shell`, keep that existing configuration and command prefix. Acceptance of this rule does not claim its implementation or runtime verification is complete.

## Image cause and implementation boundary

The original image finding is partly in this extension and partly in Pi. It does not come from `pi-attachments`: the controlled runner loads `pi-codex-tools` alone.

| Stage                                           | Current behavior                                                                               | Planned responsibility                                                                                                                                       |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/image.ts`                                  | Returns the source data URL and requested/default detail without replacing valid source bytes. | Preserve the raw helper contract; own native-compatible preparation for emitted images and stricter entry validation here.                                   |
| `src/worker.mjs`                                | Sends the selected image detail with its image message.                                        | Preserve overload precedence and match native handling of unsupported detail values.                                                                         |
| `src/execution.ts`                              | Drops that detail from its image part and emitted `ImageContent`.                              | Carry detail with each image, including mixed content, duplicate images, and later `wait` collection.                                                        |
| `src/index.ts` public hooks                     | Already owns call receipts and the core-tool provider-request conversion.                      | Finalize permitted prepared images before persistence; extend the existing request hook for image detail, with ownership and content checks.                 |
| Pi `normalizeToolResultImages` / `processImage` | Converts and resizes after result hooks using Pi settings and model limits.                    | Read-only boundary. Still runs before message finalization; account for its event output and replace only the final image content proven eligible.           |
| Pi Responses encoding                           | Explicitly assigns `auto`.                                                                     | Read-only boundary. Use our existing provider-request hook to match native image metadata. The helper's detail string need not literally appear on the wire. |

For the audited 3000×2000 PNG, the target original path preserves 31,406 source bytes and the source hash. High detail produces 1920×1280 and 50,858 bytes. Pi currently produces 2000×1333 and 53,305 bytes for both. The captured native provider request omits its detail field; helper metadata and provider encoding are separate checkpoints.

The pinned native image utility uses 32-pixel patches. Its high-detail limits are a 2048-pixel dimension and 2,500 patches; original-detail limits are a 6000-pixel dimension and 10,000 patches. Original images can still be resized above those limits. The preparation path also depends on model capabilities. Probe boundary dimensions and capability routing before applying these constants to core-tool images. Preserve source bytes for formats the native implementation preserves; animated/converted formats and metadata need their own checks.

Own the selection of limits and preparation policy in our extension. Reuse existing image utilities as primitives only where they produce the required result; do not inherit Pi's automatic resize policy through those calls. A matching width and height is insufficient: resizing algorithms and encoders can change pixels, ICC/EXIF information, MIME types, and bytes. The current Photon pipeline must not be declared equivalent to the native Rust image pipeline without comparison. Leave byte mismatches visible until resolved or explicitly accepted. Do not add a codec dependency before this evidence gate.

The smallest proposed design has four responsibilities, using the existing package and hooks:

1. Keep image preparation in `src/image.ts`. Preserve the already-matching `view_image()` raw return while preparing emitted images under the selected native detail and capability rules. Retain source bytes when native does; decode, resize, or re-encode only when its behavior requires that work. No new service, image framework, or setting is needed.
2. Carry detail and source identity through `worker.mjs` and `execution.ts` to the collecting `exec` or `wait` result. Keep real image blocks visible to normal result hooks. Images removed or replaced there must stay removed or replaced; preparation must use the permitted result, not a cached earlier original. Associate any temporary preparation state with the existing call lifecycle and release it on finalization or session cleanup.
3. Use the public `message_end` replacement in `src/index.ts` to finalize prepared image bytes and MIME types before history is saved. Preserve intervening message edits. Reconcile content hashes and activity/source bindings with the actual saved result, including reload. Pi's own pass still happens before this hook; its `tool_execution_end` output and display consumers require explicit comparison.
4. Extend the existing `before_provider_request` handler to supply the native wire detail for unchanged, owned images that remain after context hooks. Do not insert image data from a separate cache. Match omission of the detail field when the native request omits it; do not blindly write the helper's `original` string into the payload.

The installed source fixes the order: `agent-session.js` runs `normalizeToolResultImages` after all result hooks, while its later `message_end` path accepts a same-role replacement without repeating image normalization. `ToolDefinition` and `ToolResultEventResult` expose no skip flag, and every real image block enters the normalizer. Hiding image bytes in text or another opaque result until the last hook would prevent ordinary image hooks from inspecting them, so that is not the proposed bypass. The eight-case probe's `tool_execution_end` captures show 2000×1333 while its replacement later saves and sends 2400×1600. Retain that distinction in traces; final provider equality does not erase earlier observable differences.

An initial feasibility check passed eight cases through existing public APIs. A `tool_result` observer retained the event; `tool_execution_end` recorded Pi's normalized output; `message_end` supplied the last permitted PNG content only when an earlier message hook had not replaced that output. The finalized image was stored in history. The existing provider-request boundary removed `auto` for the controlled call. The source bytes survived reload, and the tested result/message/context removals, result replacement, and image blocking remained effective.

This probe is not an accepted production design. Its retained result event sees later handlers' updates because the current runner mutates that event. The public type does not promise this lifetime. Resolve that dependency explicitly before integration; do not silently rely on it as a stable final-result API. The probe also uses known PNG fixtures and one known call ID. Extend the evidence to real detail metadata, correct MIME preparation, mixed/duplicate images, all helper detail modes, a later `wait`, concurrent calls, routed-model limits, and activity/source bindings. A separate image cache that can restore removed content remains unacceptable.

Select the smallest extension-owned solution only after those checks pass. Do not edit Pi types, normalizers, encoders, installed `node_modules`, or package-version requirements. Do not toggle global resize settings around a call. If the current APIs cannot satisfy the contract, retain the exact image difference as unresolved and explain the evidence; do not claim that host changes are permitted or that partial alignment is complete.

## Cancellation and ownership

`ExecutionCells.wait()` currently sends `terminate` through `stop()`. That method stops the worker, aborts the cell controller shared by nested calls, waits for pending dispatch, and can append the aborted command result. `ProcessSessions.collect()` turns that abort into a process-group kill. Merely deleting the abort from the shared method would also change user interruption, resource-failure handling, and shutdown.

Separate explicit cell termination from forced operation cleanup. End the worker and reject new messages immediately. A terminating result includes only output already accepted for that cell; it must not wait for a sleeping command to finish or inject a fabricated killed-command result. The command must remain owned by the session, with its real subsequent status and existing process handle available when one was already returned.

Use the existing process registry, operation observers, and bounded activity records. Late process completion must not write into a closed cell output store, revive its JavaScript continuation, create another command row, or trigger an unsolicited model turn. A collected cell must still permit shutdown to reach its live processes. Pay particular attention to the current `cell.stopping` early return: a previous cell termination must not prevent a later forced shutdown from cleaning up pending work.

| Trigger                                                                     | Required distinction                                                                                              |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Ordinary yield or prompt completion                                         | Preserve continuation.                                                                                            |
| Cancel a later `wait` collector                                             | Preserve the cell and unread output, as existing tests require.                                                   |
| Explicit cell termination while a command is running                        | Stop JavaScript continuation; the already-running command survives and can write its later marker.                |
| Explicit process interruption through `write_stdin`                         | Keep the existing exact Ctrl+C behavior and process identity.                                                     |
| Initial `exec` abort, session replacement/reload/shutdown, resource failure | Preserve the existing cleanup guarantees unless a separately established reference case requires a scoped change. |
| Work still waiting to begin or a queued patch                               | Reference gate: do not generalize command survival into permission for every queued operation to commit.          |

The native broker distinguishes dispatch admission from cancellation; its tool runtime can abort a handler while an OS process survives. Therefore the implementation must establish which lifetime is being preserved. Probe a pre-start command, an in-flight initial command, a pending `write_stdin`, a blocked result hook, and a queued patch before finalizing the signal split. Keep permission checks and cancellation before process start effective.

Acceptance includes the original delayed marker reproduction, absence of code after the terminated await, prompt termination with a held result hook, later process collection without duplicate bytes, unchanged cancellation of a collector, no new execution after termination, and cleanup of all retained PIDs on reload/shutdown. Preserve observed store/load behavior across termination and failure rather than assuming it follows process lifetime.

## Argument contracts and public preparation

Pi exposes `ToolDefinition.prepareArguments(args)` before `validateToolArguments`. The latter removes optional nulls and performs coercion. Validation inside `execute()` is consequently too late to distinguish `17` from `"17"`. Put the required checks at the public preparation boundary and keep `ctx.executeTool()` for nested dispatch.

Use the existing TypeBox facilities for non-coercing checks where possible. Keep shared logic small; a full alternate schema framework or copied Rust JSON parser is not the default solution. Preparation may remove ignored keys and normalize only nulls/defaults that the reference accepts. It must not coerce types, hide invalid array members, or turn an unsupported permission request into permission.

| Entry          | Required/default behavior from the pinned source                                                                                                                                                                                                                      |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `exec`         | Nonempty raw source. A first-line pragma requires following code, an object, and only the two supported keys. Its optional numeric fields allow null/default and must be nonnegative safe integers. Native removes the pragma line before module evaluation.          |
| `wait`         | Required string cell ID. Yield is a defaulted non-null `u64`; terminate is a defaulted non-null boolean. Maximum tokens is an optional nullable unsigned value. Unknown keys are ignored.                                                                             |
| `exec_command` | Required string command. Yield and tty are defaulted non-null values. Shell, login, workdir, justification, prefix rule, maximum tokens, and the selected permission option follow their native optional/null rules. Unknown keys in the scoped contract are ignored. |
| `write_stdin`  | Required signed 32-bit integer process ID. Chars defaults to empty but rejects null. Yield is defaulted/non-null; maximum tokens is optional/nullable. Unknown keys are ignored.                                                                                      |
| `apply_patch`  | Its script-facing input remains raw patch text. The internal public-dispatch `{input}` wrapper must not make non-string script arguments valid through coercion.                                                                                                      |
| `view_image`   | Required string path; optional/null detail defaults as native does. Reject unsupported strings using its observed detail error. Unknown keys are ignored.                                                                                                             |

Keep the frozen model-facing declarations separate from runtime preparation. In particular, relaxing runtime handling of extra keys does not require rewriting a captured schema or description. Known fields outside the package's retained tool surface, such as native environment selection, do not become supported integrations or additional authority through this work.

Replay missing fields, wrong primitives, null per field, unknown keys, malformed pragma JSON, fractional/negative numbers, signed-ID bounds, safe-integer boundaries, and values around native unsigned bounds. Do not apply the pragma's safe-integer constraint indiscriminately to every native numeric field. Retain command/input wait clamps and verify zero separately from omission. For invalid commands or patches, assert absence of a marker/file effect as well as the error.

Capture full error values through the public host. Raw JSON spelling, duplicate keys, and parser positions may already be lost before `prepareArguments`. Determine what existing public APIs expose; do not change Pi to recover that information. Do not claim universal parser equivalence or normalize those differences away. First require equality for the existing captured cases and record any broader limitation precisely.

## Explicit shell resolution

Native `get_shell_by_model_provided_path()` selects a shell family and discovers its executable. On Unix the discovery checks the matching account shell, PATH, then family fallback paths. An unknown or unavailable family uses `/bin/sh`. This happens before spawning; it is not a blanket retry after a process error.

Under the accepted Q3 decision, implement the rule at command construction, before effective arguments and activity are published. Keep the same command text, cwd, environment, command prefix, login flag, and PTY selection. Do not retry after an arbitrary ENOENT, because a missing cwd can produce that error too. Do not execute a command twice after a shell has begun running it.

Verify omitted shell with the current Pi setting, recognized names, nonexistent paths ending in a recognized family, an unknown basename, a valid custom wrapper, relative paths, PATH precedence, login true/false, and both PTY and pipe execution. A nonexistent cwd must remain a failure. Record the actual selected executable in effective inputs. Unsupported platform-specific shell families remain limited by the stated platform scope.

## JavaScript failures and result structure

`collect()` currently returns from its error branch before constructing the normal status header. `worker.mjs` discards error stacks and gives modules a generated VM identity. Fix those causes rather than rewriting only the visible chat row.

Construct the appropriate native header for a failed execution, followed by already accepted text/images in their original order and the script error. Preserve `isError`, legitimate child outcomes, token budgets, and per-part source bindings. Cover pre-cell errors separately: malformed input and an unknown wait handle do not all pass through the same native handler path, so one universal prefix is not justified.

Use the native module origin `exec_main.mjs` and native pragma removal for source locations. Preserve genuine string `stack` values where native does, including custom thrown objects, and use the correct string conversion for non-Error throws. A local Node VM probe confirms that naming the module produces useful source frames but also adds Node evaluation/task frames absent from native output. Compare that boundary explicitly; do not fabricate native frames or delete user-supplied stack content through broad regex matching.

Include synchronous and asynchronous throws, nested functions, an error after yield, a timer callback error, syntax errors, thrown strings/undefined/objects, custom stack accessors, rejected nested calls, store serialization errors, and `exit()`. Verify that a stack accessor invoking exit cannot resurrect error processing or discard already valid state. Empty error messages and failures with no child operation remain inspectable without creating invented activity rows.

The renderer, raw copy, and Find must retain the corrected source result and must not show two copies of the error. `waitRenderers` currently inspects the final text part and strips `Script error:`; update only if the changed authoritative result requires it. Keep the independent activity format unchanged unless verification establishes a necessary field change.

## Patch effects and partial failure

The existing test at `packages/pi-codex-tools/test/patch.test.ts:894` explicitly expects Pi to unlink a now-dangling alias. Replace that expectation with the requested native outcome.

Initial whole-patch validation can read both target and alias. At application time, native follows the path for a metadata/non-directory check before deletion. After an earlier target deletion, that check fails for the alias. Pi's `priorContent()` tolerates missing contents for presentation, then its direct `unlink()` succeeds. A presentation-only fix would leave the wrong file state.

Add the equivalent application-time following-metadata check at the deletion boundary while holding the existing mutation queues. Preserve successful unlink of a valid symlink without deleting its target. Compare the related move-source deletion path before sharing a helper or changing it. Keep whole-patch validation and ordered application; add no rollback or cross-process lock.

The target deletion remains completed. The alias deletion is failed, with no invented removed-line counts, and any later operation remains unattempted. The error must identify the alias and preserve native runtime framing and its trailing newline. Align the other captured application-time trailing-newline difference at the existing failure formatter rather than adding a separate output layer.

Verify target-then-alias, alias-then-target, an initially dangling alias, a directory or symlink-to-directory, an additional operation after the failure, and relevant move/alias cases. Inspect `lstat` and `readlink`, not only `stat` or `readFile`: the latter fail for both a missing entry and a retained dangling symlink. Compare final entries, targets, bytes, modes, errors, and per-file activity together. Reuse the 51 patch cases and their historical outcomes as regression evidence.

## Affected surfaces and delivery order

| Surface                                              | Expected work                                                                                                                                                         |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/index.ts`                                       | Public argument preparation, image finalization and provider metadata, consistent registration/exposure, shutdown wiring, and verbatim declaration preservation.      |
| `src/command.ts`                                     | Raw field contract, shell resolution, defaults and truthful effective inputs.                                                                                         |
| `src/execution.ts`                                   | Cell/operation cancellation distinction, failure framing, pragma parsing, image metadata, late outcomes and buffer cleanup.                                           |
| `src/worker.mjs`                                     | Source identity, error serialization, detail propagation and overload behavior.                                                                                       |
| `src/process.ts`                                     | Only the ownership/collection changes established by the cancellation probes; retain output cursors, exact Ctrl+C, capacity limits and final cleanup.                 |
| `src/patch.ts`                                       | Entry validation, application-time delete checks, exact partial failure formatting and facts.                                                                         |
| `src/image.ts`                                       | Entry validation and extension-owned image preparation under Codex's detail, format, and capability rules; preserve matching raw helper bytes.                        |
| `src/presentation.ts` / `src/activity.ts`            | Review content hashes, image/source bindings, status ownership, error display and late updates. Change only where the corrected results require it.                   |
| Existing package tests and `fixtures/native-host.ts` | Update contrary assertions and extend current data-driven cases through real public dispatch; keep both standalone and combined extension workflows.                  |
| Pi host packages                                     | Read-only source inspection and behavior checks through their existing public APIs. No source, installed-package, private runtime, or Pi version changes.             |
| Package manifests / lockfile / changeset             | Document this extension's release and proven behavior changes. No Pi upgrade requirement. Change dependencies only if a separate extension-owned need is established. |
| ADRs / glossary / README / core specification        | Replace the conflicting cancellation, shell and image rules; preserve the historical audit and unrelated design decisions.                                            |

The package paths above are under `packages/pi-codex-tools` unless another location is named. Review `pi-chat` and `pi-copy` consumers through their existing generic activity/source tests; they need no new package dependency or tool-name knowledge. Reuse the current capture runner and public-host fixture, not a second parity framework.

1. Preserve Q1 as a fixed constraint and Q2/Q3 as accepted decisions in the published specification. Run the small missing reference probes and inspect exact parser/media behavior; ask only new policy questions supported by evidence. Specification publication does not claim implementation or verification is complete.
2. Refine the extension-owned image preparation and demonstrated public-hook integration. Resolve event lifetime and prove the remaining detail, format, identity, composition, and pre-finalization consumer cases. Account for Pi's remaining normalization pass. Do not add a Pi change or release dependency.
3. Implement argument preparation and shell resolution. These affect every later test's entry boundary, so verify them before attributing downstream mismatches.
4. Implement cell termination/operation ownership and failure output together. Check late callbacks, buffer closure, result hooks and session cleanup before moving on.
5. Implement ordered patch deletion effects and failure formatting. Verify both the raw rejection and the filesystem snapshot.
6. Carry and process image detail end to end. Validate helper returns, post-hook content, history, final provider encoding and the image itself; do not stop at unit metadata assertions.
7. Run the affected package checks and paired replay, review the combined consumers, update operator documentation and ADR status, and attach the new evidence to Phoenix. Preserve the original audit result alongside the new result.

The independent patch change can be prepared while the image feasibility check proceeds. The complete parity correction must not be described as finished while the image target or another required branch remains unresolved. No unresolved branch permits a Pi modification.

## Verification and completion gates

Use the existing public-host test files: `cell.test.ts`, `command.test.ts`, `process.test.ts`, `patch.test.ts`, `image.test.ts`, the presentation tests, and `workflow-presentation.test.ts`. Keep blocked calls, argument edits, result replacements, context redaction, retained Find/copy sources, reload, and standalone/combined extension load order covered. Extend existing fixtures and assertions rather than duplicating production logic in a new harness.

Run the affected checks first, then the core package suite and `pnpm typecheck`; lint and format changed files. Exercise Pi through the existing public-host fixture. Broaden into generic consumer suites only for the surfaces actually changed; Pi itself is not a change target. No package tests were added or rerun during planning. The eight-case image diagnostic ran outside the repository suite. The prior audit's 223 passing tests remain historical evidence, not verification of these proposed changes.

Replay targeted scenarios through the existing differential runner against the same installed binary before one final replay of the full 147-case matrix. Use a fresh named run. Compare every ordered payload associated with a call, actual file snapshots, process outcomes, and image bytes. The audit comparator's only existing allowances remain generated IDs, reported durations and JSON object-key order. Preserve stacks, failure text, arrays, image data, and ordering. Any additional allowance requires an explicit decision and must be reported separately.

Run paired live command, patch, continuation, and image tasks through the same model alias and controls after deterministic cases pass. Keep full surrounding model-context differences visible; successful final answers do not certify tool parity. Count scripted provider exchanges separately from actual model inference.

Publish captures, comparison results, source identities, and selected lifecycle spans to the existing local Phoenix project using new run tags. Retrieve stored inputs/outputs and check hashes so trace publication is verified. A successful span status records execution/capture success, not a matching verdict. Publish a per-branch pass/fail and remaining-difference ledger; never promote a normalized match into full-request equality.

Completion requires the six selected behavior changes within the unchanged-Pi boundary, relevant extension and public-host checks, retained permission/redaction/cleanup guarantees, an accepted ADR, accurate operator/release notes, and evidence showing each targeted mismatch resolved. If a target is not achievable through existing public APIs, record the exact unresolved result; do not mark it matched or expand scope. Other desktop capabilities and explicitly unselected differences remain outside that completion claim.
