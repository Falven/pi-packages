# 05: Preserve immediate Markdown attachment capture without host hooks

**What to build:** Valid local-file Markdown captures source contents once, rewrites its destination to the retained snapshot, and controls draft membership through ordinary editing on unmodified Pi.

**Blocked by:** 04: Verify asynchronous attachment editing on unmodified Pi.

**Status:** ready-for-agent

**Specification:** [Pi Attachments](../../../docs/specs/pi-attachments.md), including its applicable architecture decisions.

- [ ] Preserve ordinary Markdown semantics for inline and reference-style links, local file autolinks, and image syntax. Exclude code, escaped examples, unused definitions, remote URLs, and bare paths. Preserve established path resolution, entity and escape handling, and historical retained Attachment: references, including renamed labels and conflicting literal filenames.
- [ ] Capture a new valid source-file reference when it enters the draft, then rewrite only its destination before the first preview. Use ticket 04's proven editor integration to preserve labels, surrounding text, later edits, caret, selection, focus, and history.
- [ ] Reuse the same retained contents for subsequent previews and submission, including after source changes or removal and when graphics are hidden. Restoring retained-file links, redraw, resize, settings changes, Send, and ordinary bare-path edits do not create new snapshots.
- [ ] Replace reliance on input_prepare and native editor identity fields with the proven package integration. Await only capture already belonging to the submitted draft; preserve earlier input transformations, repeated identical submissions, native prompt history, and normal, steering, and follow-up ordering. Compose with ticket 01's public-input image preparation during final integration.
- [ ] Keep insertion at the caret or selection. A generated reference inside code remains literal text and its snapshot remains retained. Stripping reference markup leaves its destination path as ordinary text, removes membership, and does not insert file contents or automatically recapture the path.
- [ ] Preserve file-level management: read-only, scrollable Preview text changes nothing; Restore Inline inserts retained text once at the caret or selection and removes all corresponding references; Remove from draft removes those references. Both mutations retain stored contents, and composer text and membership changes remain one undoable action.
- [ ] Preserve incomplete surrounding Markdown, exact captured text, native editor whitespace behavior, existing snapshot paths, old recovery metadata, pending recovery across reload, and durable retention with --no-session. Rendering never captures contents or changes the draft, and no hidden membership list may contradict Markdown.
- [ ] Adapt existing lifecycle checks to unmodified Pi for both editors: changed sources, snapshot reuse, stale and out-of-order capture, pending submission, repeated references, identical drafts, session changes, reload, earlier input transforms, supplied images, and recoverable failure. Keep public-input failure isolation and all three submission routes within the baseline from ticket 01.

**Integration:** Ticket 04 is the feasibility gate. Ticket 01 supplies the image baseline for combined verification; the non-image capture flow can proceed without waiting for that independent slice. Ticket 07 owns full-extension acceptance.

**Historical verification (2026-10-14):** The previous 44 Markdown tests passed against modified host 5bfbd59c9, including grammar, collapsed-paste ranges, undo, changed sources, pending Send, input transformations, supplied images, out-of-order identical submissions, recovery, and old retained references. Type, lint, formatting, and whitespace checks also passed. That implementation associated capture with host-provided editor identities and input_prepare; these results do not verify the portable replacement. Physical terminal usability was not observed.
