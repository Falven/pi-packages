# 05: Return local images through Pi's image pipeline

**What to build:** Let the model read a local image through the selected image tool, emit it from JavaScript, and receive the image in the next request while Pi's blocking and normalization settings remain effective.

**Specification:** [Core toolset](../spec.md).

**Blocked by:** 01 — Execute a command through the complete model loop.

**Status:** ready-for-agent

- [ ] Expose the captured `view_image` parameters and result shape: absolute path, default high detail or requested original detail, returned detail, and base64 data URL.
- [ ] Support the selected `image` helper's data-URL and ordinary result-object forms and explicit-detail override. Add no network URL support, protocol image metadata, audio, or generated-image surface.
- [ ] Check effective image blocking before the tool reads or returns image bytes. Verify that serializing the blocked result as text also exposes no image bytes or data URL.
- [ ] Emit allowed images through normal Pi result processing, preserving result-hook changes, effective auto-resize settings, and the routed model's limits. Avoid a second normalization pass based on stale model metadata.
- [ ] Verify actual content type, dimensions, format conversion, and model-bound content under relevant host settings. Record original-detail changes caused by native normalization as the accepted host difference.
- [ ] Keep terminal image-display preferences independent from the model's image-blocking setting.
- [ ] Exercise a valid local image, a large image, a blocked image, invalid input, and a missing or unreadable file. Establish unobserved baseline errors before asserting exact fidelity.
- [ ] Demonstrate the complete request → image operation → emitted image → next-request path through the existing host fixture, without private image-processing imports or a provider bypass.
