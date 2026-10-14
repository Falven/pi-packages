# 06: Preserve complete workflows in mixed Pi sessions

**What to build:** Use commands, continued execution, patches, and images together in normal Pi sessions while preserving existing extensions, user choices, native history, and lifecycle behavior.

**Specification:** [Core toolset](../spec.md).

**Blocked by:** 02 — Continue interactive commands across prompts; 03 — Yield and resume execution cells; 04 — Apply file patches through native dispatch; 05 — Return local images through Pi's image pipeline.

**Status:** blocked by 03 — public nested-call lifetime; partial composition checked

- [ ] Demonstrate a mixed workflow that inspects a project, changes a file, validates the change, and inspects a local image through the selected toolset.
- [ ] Verify normal package loading and reloading, activation in an existing conversation, and explicit tool inclusions/exclusions. Distinguish hidden declarations from callable-tool access and preserve historical calls.
- [ ] Preserve unrelated tools and their model-dependent availability, including current web tools. Leave extension-owned core-name overrides intact without claiming their restrictions transfer to the new names.
- [ ] Exercise the configured composer, attachments, skill references, prompt/lifecycle extension, and chat package together. Preserve submitted content, native tool presentation, work history, and retained history.
- [ ] Preserve provider composition and the user's guidance, skills, model settings, and effective host preferences. Introduce no second conversation store or package-specific chat protocol.
- [ ] Verify ordinary prompt continuation with live process/cell state, then new/resumed/forked sessions, reload, quit, and shutdown using actual native lifecycle events. Clear owned live state while retaining completed file changes and history.
- [ ] Verify cancellation and result interception across a mixed sequence, including a blocked nested call and a redacted result that stays redacted in the next model request.
- [ ] Keep user-entered shell commands on their native path and avoid changes to terminal, keybinding, editor, or clipboard ownership.
- [ ] Reuse the same host fixture for integration checks; run the affected existing companion checks only where this slice changes shared behavior.

## Partial composition evidence

A temporary probe reused [the native host](../../../fixtures/native-host.ts) and [the shared model-loop fixture](../../../packages/pi-codex-tools/test/fixtures/model-loop.ts) with the configured composer, attachments, skill references, chat, prompt/lifecycle extension at 4.13.0, and web extension at 1.6.0. Four controlled checks passed at integration commit `5507b77`: a companion-only control, the core toolset loaded first, the core toolset loaded last, and raw call history after deselection.

Both core load orders completed a real command → patch → validation → image sequence. Checks covered all four selected names in `ALL_TOOLS`, native nested events and retained records, and image content in the next request. The observed requests also retained attachment image bytes, one expanded skill block, one prompt-extension section, the existing web-search declaration, and model-dependent URL-tool hiding. Native blocking preserved web-tool ownership, reload retained the draft and history, and a user-entered shell command stayed on its native path without a model request.

This is partial composition evidence using controlled provider responses. The probe blocked the actual web network call through a native hook. It did not establish retained execution cells, new/resumed/forked session behavior, the complete session lifecycle, or matched live-model trials. [Ticket 03](03-yield-and-resume-execution-cells.md) still blocks the continued-execution criteria, so this ticket remains open.
