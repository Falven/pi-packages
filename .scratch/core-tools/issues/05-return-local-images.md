# 05: Return local images through Pi's image pipeline

**What to build:** Let the model read a local image through the selected image tool, emit it from JavaScript, and receive the image in the next request while Pi's blocking and normalization settings remain effective.

**Specification:** [Core toolset](../spec.md).

**Blocked by:** 01 — Execute a command through the complete model loop.

**Status:** resolved — image slice; native detail limitation remains

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
