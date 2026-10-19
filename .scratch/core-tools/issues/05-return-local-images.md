# 05: Prepare and deliver images with reference detail

**What to build:** An allowed image reaches the model with the reference's bytes, dimensions, format, and detail behavior, while image blocking, extension edits, retained history, and single-owner display remain effective.

**Specification:** [Core toolset](../spec.md), especially implementation decisions 8, 17, 25, and 33 and testing decisions 18 and 23.

**Decision:** [Accepted behavior alignment](../../../docs/adr/0030-core-tool-behavior-parity.md); [image cause and public-API boundary](../../../docs/plans/core-tool-behavior-parity.md#image-cause-and-implementation-boundary).

**Blocked by:** None (can start immediately). Existing image dispatch, collection, and provider integration are implemented. The remaining public-hook and codec questions are evidence gates within this slice.

**Status:** claimed — `codex/core-image-alignment`, 2026-10-18; base `6c775356361cf89bf247f7eb9f1dc31a16cb912e`

## Behavior alignment — 2026-10-18

The accepted image decision gives preparation to this extension. Pi must remain unchanged: no source or installed-package edits, private runtime patches, global-setting toggles, fork, or version requirement to gain host behavior. The eight-case PNG probe establishes a possible final-image path; it is not production integration or complete image parity.

- [x] Validate the original local-image path and detail before host coercion. Require a string path, match null/omission defaults and unsupported-detail errors, and ignore unknown object keys without changing the frozen declaration. Preserve the retained helper overloads and explicit-detail precedence.
- [ ] Preserve matching raw helper return values and carry requested detail plus source identity through the worker, execution output, collection, and provider conversion. Cover mixed text/images, duplicate images, later waits, and concurrent cells without assigning one image's detail or ownership to another.
- [ ] Own emitted-image preparation under the reference's actual format, capability, resizing, and encoding rules. Verify its 32-pixel patch calculation, high-detail limits of 2048 pixels per dimension and 2,500 patches, and original-detail limits of 6000 pixels per dimension and 10,000 patches at their boundaries. Original detail is not an unlimited-size promise.
- [ ] Preserve source bytes wherever the reference does and match required conversion elsewhere. Compare PNG, JPEG, WebP, converted formats, malformed/unsupported data, orientation, and metadata as applicable to the scoped reference. Matching dimensions or decoded pixels alone does not establish matching encoded bytes or notices.
- [ ] Establish codec equivalence before choosing an existing primitive or adding an extension-owned dependency. Reuse installed facilities when their output matches; add a dependency only with evidence they cannot satisfy the contract. No image service, replacement provider stack, or Pi dependency change is authorized.
- [ ] Resolve the prototype's reliance on the current mutable result-event lifetime using existing public APIs. Keep real image blocks visible to normal result hooks and use the final permitted replacement, removal, or blocked outcome. Do not hide payloads in opaque content or recover discarded originals from a side cache.
- [ ] Keep effective image blocking authoritative before local reads and before returning bytes, including when a hook enables it. A blocked result exposes no image bytes or data URL through image emission or text serialization. Preserve later result, finalized-message, and context redaction.
- [ ] Finalize prepared bytes and MIME types before history is saved, then modify only owned images still present after context processing. Match the observed wire metadata, including omission of detail where the reference omits it; forwarding the literal word original is not the acceptance criterion.
- [ ] Preserve correct image/source bindings and hashes through retained history and reload after temporary preparation state is gone. Cover hooks before and after finalization, replacements with different images, removals, unrelated extension images, and changing call identities. Do not restore removed content or rely on the prototype's single known call.
- [ ] Account for Pi's remaining normalization pass. The public API has no per-tool image skip, and the prototype's earlier tool-completion event still contains resized bytes. Compare every affected event/display consumer as well as final history/provider content; final-image restoration alone cannot establish parity.
- [ ] Keep actual images once in the native result that collects them, including a later wait, with origin path/status retained separately. Preserve terminal visibility preferences, generic activity bodies, Find/copy bindings, and bounded cleanup. Match the reference's content-part order and conversion-notice behavior without another image history store.
- [ ] Verify the full helper → public hooks → tool-completion event → finalized message → retained/reloaded history → provider path through existing image, cell, and presentation cases and temporary diagnostics. Repeat the probe's replacement/removal/blocking coverage and establish the untested detail, format, capability, mixed/concurrent, and binding cases. Add no new test cases, files, or harness.
- [ ] Keep an exact unresolved-difference record for any required image boundary that existing public APIs or available codecs cannot reproduce. Neither the accepted ownership decision nor the PNG probe authorizes a Pi change, a comparator exception, or closing this ticket with an unresolved target.

**Evidence to record:** Raw helper results; ordered boundary payloads; image hashes, sizes, dimensions, MIME types, orientation/metadata, and detail fields; capability and hook cases; reload/display outcomes; codec findings; and runtime/source identities. Keep source-based rules separate from paired runtime observations.

**Current verification:** Raw argument correction implemented; image preparation/integration acceptance remains unresolved. The claimed branch and original base above are preserved. Focused checks and exact remaining gates are recorded below; no prior verification is promoted to current parity.

### Current implementation and evidence — 2026-10-18

`src/image.ts` validates original arguments through public `prepareArguments`, retains omission/null defaults, ignores unknown keys, and returns the observed unsupported-detail error. It rechecks effective arguments after permission hooks and rejects reads when the public current model excludes image input. The captured missing-path and numeric-path errors match; full native parser diagnostics for other JSON shapes, numeric spellings, and key orders are not claimed.

The existing image assertions were updated, with a failing public-host run before the fix. An isolated public-host diagnostic then rejected 16 invalid/blocked inputs, preserved raw helper bytes for six valid/default/unknown-key/edited inputs, and kept nested result-hook blocking effective before bytes returned to JavaScript. No permanent test cases or harness files were added. Temporary scripts, raw boundary payloads, logs, fixtures, and reference-probe requests are under [/tmp/pi-core-alignment-20261018-a7r6fk0i/image](/tmp/pi-core-alignment-20261018-a7r6fk0i/image/README.md).

The focused image and image-presentation suites pass 33/33. The full package run passes 222/223: the unchanged Ctrl+C workflow case with the toolset first observed exit 0/`AFTER` instead of exit 23/`STOPPED`; both load-order cases pass on an isolated rerun. Direct root TypeScript checking, targeted lint, formatting, and whitespace checks pass. `pnpm typecheck` itself failed in dependency setup as recorded below. Integration refs `3c4a6c9` and `1d39dda` were merged without conflicts; the latter only updated the patch ticket. Exact commands and logs are in the evidence index.

Integration subsequently advanced to `7aa3894` with the command validation/shell correction. That ref was merged without conflicts after implementation commit `b21c075`. On the merged branch, the existing image, image-presentation, command, and presentation suites pass 101/101; both Ctrl+C workflow cases pass again. Direct TypeScript and formatting checks also pass. The earlier 222/223 package result remains a separate pre-merge observation.

The production image-restoration prototype was **not** adopted. The current public API has no final pre-normalization result callback. In the new diagnostic, two different permitted PNG byte streams collapse to the same normalized image. An immutable result snapshot cannot observe a later replacement; the retained mutable event does, but that lifetime is undocumented. Matching normalized hashes cannot establish which source is still permitted. Restoring an earlier payload would violate the replacement/removal boundary.

Required gates remain open:

- **Final bytes and earlier consumers:** high and original still produce Pi's 2000×1333 PNG and `auto` for the immutable 3000×2000 reference fixture. Reference high is 1920×1280/50,858 bytes; reference original preserves 3000×2000/31,406 bytes. Disabling resize still re-encodes the source to 121,623 bytes. The public tool-completion event precedes finalized-message replacement; native display consumes that earlier result. No per-image skip or safe full restoration route was found.
- **Codec equivalence:** public resize at the reference dimensions produces different pixels and 50,865 bytes. Installed Photon 0.3.4 with Triangle matches the one captured high PNG exactly (50,858 bytes), but drops the pinned source fixture's RGB ICC and EXIF metadata. This rules out declaring that primitive fully equivalent. JPEG, WebP, animated/converted formats, metadata, and boundary captures still need reference comparisons. No dependency or codec implementation was added.
- **Detail, capability, and binding:** requested emission detail is still discarded in collection; mixed original/high/low emissions become the same image and `auto`. Pi's public model metadata does not expose the reference's original-detail support or unified-budget flags. Two concurrent cells retain distinct collecting ownership, but current bindings do not identify image-byte replacement; the preserving-layout replacement remains associated with the prior origin in both core/chat load orders. These checks do not establish complete source/detail binding or routed capability parity.
- **Late blocking:** result/finalized-message blocking removes image blocks from the provider request, but retains image bytes in saved results. A result hook that enables blocking after `view_image` returns also leaves the serialized image data URL in the next provider request; the full-payload reproduction is `blocked-full-payload/block-serialized.json`. The earlier nested-hook check remains effective and has a narrower scope. This required gate is not accepted or closed.
- **Remaining acceptance:** source-bound preparation through history/reload, all affected display/Find/copy consumers, boundary dimensions and patch budgets, physical model capability variants, full format/metadata equivalence, and paired reference captures remain required. [Reference-probe requests](/tmp/pi-core-alignment-20261018-a7r6fk0i/image/reference-probe-requests.json) list the exact missing cases and prepared fixtures. Shared differential/live runners and Phoenix publication were left to root.

Source changes and diagnostics stay inside this extension worktree and its temporary evidence directory. Pi source/runtime files, settings outside the isolated hosts, frozen declarations, and historical evidence were not edited. However, invoking the plan's `pnpm typecheck` command unexpectedly entered pnpm's automatic dependency setup, refreshed 45 generated dependency command shims (including shims inside Pi packages), then failed because the workspace hoist directory is a symlink. This crossed the requested installed-dependency write boundary. No pre-command shim hashes exist, so unchanged shim bytes cannot be asserted. The exact paths and timestamps are in [dependency-command-side-effect.json](/tmp/pi-core-alignment-20261018-a7r6fk0i/image/dependency-command-side-effect.json). No further package-manager command or out-of-scope restoration was attempted; direct installed TypeScript and lint binaries are used instead.

This ticket remains claimed and unresolved; the raw validation fix is only the implemented portion of the current delta.

## Historical revisions

Everything below records prior requirements and verification. It remains historical where it conflicts with the current revision above.

**Previous title:** 05: Return local images through Pi's image pipeline

**What to build:** Keep each image’s origin and status while displaying its bytes once inside the appropriate collecting-result activity body.

**Specification:** [Core toolset](../spec.md).

**Blocked by:** Core 03: continuation and replay.

**Status:** resolved — approved activity-item delta; earlier evidence retained below

## Activity-item delta — approved 2026-10-15

- [x] Use the same adapter and disclosure path for image operations and collecting wait results; collapsed items expose no image or preview.
- [x] Keep path/status at the originating operation and the image in its collecting native result, including a later wait, without duplicate visible owners.
- [x] Preserve image blocking, normalization, terminal preferences, processed-result hooks, model content, and native default expanded rendering.

**Revision evidence (2026-10-15, `f6004ab`):** Image operations and collecting wait results use the common adapter/disclosure path. Path and status stay at the originating operation; image bytes appear once in the collecting native result, including a later wait. Collapsed items expose no image. Processed-result hooks, image preferences, blocking, normalization, and model content remain authoritative.

Invalid or mismatched image ownership metadata falls back to the native processed result rather than dropping the image. Existing image and image-presentation cases, combined workflows, and native image-layout checks passed. The saved malformed-origin reproduction and closing standards review verified the fallback repair. Physical observations and their narrower scope are recorded in [chat ticket 12](../../pi-chat/issues/12-mixed-session-acceptance.md); exact automated totals are in [ticket 07](07-verify-contract-and-matched-trials.md).

## Earlier revision

**Recorded status:** resolved — approved image presentation delta; completed baseline retained below

**Original delivery:** Show readable image operations in their originating execution card and actual images once in their collecting native result, preserving blocking, normalization, result hooks, terminal visibility, and the existing model image contract.

## Presentation delta

- [x] Present image operation path, status, and readable errors within the originating parent card. Actual images appear once in the result that collects them, including a later `wait`, with native image display when permitted. Never use base64 data or a raw result envelope as ordinary card text.
- [x] Respect effective image blocking, normal image processing, hook removal, terminal image visibility, and native disclosures. Keep model image settings independent from terminal visibility and do not recover discarded image bytes through presentation metadata.
- [x] Keep mixed script text and image operations readable and bounded in their originating execution. Preserve actual image placement in the collecting native result; do not duplicate images into the origin or journal, alter model content boundaries, or bypass native rendering and processing.
- [x] Verify valid, blocked, missing, and hook-redacted image outcomes at the approved host seam, including terminal image preferences, emission after a yield, and the next provider request. Preserve the recorded native detail and normalization limitations.

### Presentation verification

- Ten native-host checks in `test/image-presentation.test.ts` cover effective argument changes, compact and expanded image status, readable paths/errors, mixed text, missing files, initial blocking, blocking enabled by a result hook, child redaction, parent image removal, parent text replacement, formatted child results, and truncated serialized image output. The initial checks reproduced the missing image summary and encoded-envelope preview; separate checks reproduced a missing policy-error message when script code caught that error and image bytes entering the journal after a result hook formatted the image envelope.
- Native terminal image rendering consumes only the current processed parent content. A controlled Kitty-capability check verifies images with terminal visibility enabled, and its disabled counterpart keeps the same image in the next provider request without terminal image output. No image bytes are added to presentation details or routine activity records. Native format conversion preserves the image operation's metadata; image removal and mixed-text replacement invalidate stale presentation data.
- The approved late-image exception follows the public native shell: it appends result images independently of custom renderers, with no public per-tool suppression or relocation control. The focused host check keeps the completed path/status in the originating card before collection, then observes exactly one image in the wait result, visible native image row, and next provider request, with none in the earlier execution result. No private component change, result mutation, extra model turn, or image copy into the origin is used.
- Aggregate token truncation loses original text boundaries. If image operations occurred, the card marks that truncated script preview as omitted rather than displaying possible encoded-image fragments. The model result and retained history remain unchanged; ordinary bounded script text remains readable alongside native images.
- All 40 checks across the image, image-presentation, and parent-presentation suites pass on the installed 1.0.2 host dependency. Package type checking, lint, formatting, and whitespace checks pass. This verifies the controlled native host, not physical terminal interaction. The native detail and normalization limits below remain unchanged.

## Completed baseline

**Historical status:** resolved — image slice; native detail limitation remains

The following criteria and evidence describe the previously completed core contract. This revision supersedes its visible routine-journal presentation; it does not authorize changes to Pi or the chat package.

- [x] Expose the captured `view_image` parameters and result shape: local filesystem path, default high detail or requested original detail, returned detail, and base64 data URL. Resolve relative paths in the owning context.
- [x] Support the selected `image` helper's data-URL and ordinary result-object forms and explicit-detail override. Add no network URL support, protocol image metadata, audio, or generated-image surface.
- [x] Check effective image blocking before the tool reads or returns image bytes. Verify that serializing the blocked result as text also exposes no image bytes or data URL.
- [x] Emit allowed images through normal Pi result processing, preserving result-hook changes, effective auto-resize settings, and the routed model's limits. Avoid a second normalization pass based on stale model metadata.
- [x] Verify actual content type, dimensions, format conversion, and model-bound content under relevant host settings. Record original-detail changes caused by native normalization as the accepted host difference.
- [x] Keep terminal image-display preferences independent from the model's image-blocking setting.
- [x] Exercise a valid local image, a large image, a blocked image, invalid input, and a missing or unreadable file. Establish unobserved baseline errors before asserting exact fidelity.
- [x] Demonstrate the complete request → image operation → emitted image → next-request path through the existing host fixture, without private image-processing imports or a provider bypass.

## Implementation evidence

- `test/image.test.ts` uses the existing native host and shared model-loop fixture. It observes the real next request after local PNG and GIF reads, content-based format detection, helper emission, input validation, and captured local file errors. The original image bytes and requested detail reach the script in the ordinary result object.
- Effective blocking is checked before local reads and before returning bytes, including when a native result hook enables blocking during the call. Native argument changes, call blocking, nested result redaction, outer result redaction, and activity attribution remain effective. Disabled images expose no data URL when the result is serialized as text. Terminal image display does not enable or disable model images.
- A 2400-by-1600 image remains unchanged inside the nested result, then becomes a 12-by-8 PNG under the routed model's limits. The selected virtual model's 1-by-1 metadata does not cause an earlier resize. Disabling effective auto-resize preserves 2400-by-1600 dimensions. Public decoding validates local files without replacing their returned bytes; native normalization occurs when the outer image result is emitted.
- Explicit selections and exclusions remain authoritative. An extension-owned read tool does not enable the replacement, and a read-only selection retains its native declaration. A text-budget regression confirms that an image before and after truncated text both reach the next request.
- Supplemental local image and helper observations are retained in the [file evidence index](../../../packages/pi-codex-tools/test/fixtures/observed/files/index.json) and [image helper observations](../../../packages/pi-codex-tools/test/fixtures/observed/files/image-helper-probes-20261014.json). Their provenance and observation limits are separate from the frozen contract, which is unchanged.
- Validation after integrating the raw-history deselection fix: all 41 package tests pass on the installed host dependency at 1.0.2. Package type checking, targeted lint, formatting, and whitespace checks pass.

## Remaining contract limits

The helper validates detail values and explicit-detail precedence, and the local image tool returns the requested detail. The native canonical image type cannot retain that field. Actual outgoing provider requests use `detail: "auto"`, including requests for high or original detail. The live description states this limitation. The accepted native resize difference does not establish detail equivalence, and no provider bypass was added.

Malformed helper image bytes remain subject to native processing. In the measured case, failed normalization preserved the original block in the next controlled provider request. The supplemental reference displayed an omission for those bytes and for low detail, but its raw emitted objects and provider requests were not observable. A reference model-input mismatch and real upstream acceptance or rejection are therefore unverified.

The text-budget check establishes image retention. Text is bounded as one aggregate when truncated, and native provider conversion separates image content from tool text. Those supplemental observations did not expose reference mixed-content wire ordering. The later [ticket 07 live trials](07-verify-contract-and-matched-trials.md) observe text then image in the reference and text, image, then a native conversion notice in Pi, with identical decoded RGB pixels. This bounds the observed ordering claim to that image case; exhaustive cross-part parity remains unverified. [Ticket 03](03-yield-and-resume-execution-cells.md) now implements retained execution, and [ticket 06](06-verify-mixed-native-workflows.md) verifies image work after a yield with configured companions. Those checks do not remove the image-detail limitation above.
