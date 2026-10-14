# 06: Preserve complete workflows in mixed Pi sessions

**What to build:** Use commands, continued execution, patches, and images together in normal Pi sessions while preserving existing extensions, user choices, native history, and lifecycle behavior.

**Specification:** [Core toolset](../spec.md).

**Blocked by:** 02 — Continue interactive commands across prompts; 03 — Yield and resume execution cells; 04 — Apply file patches through native dispatch; 05 — Return local images through Pi's image pipeline.

**Status:** ready-for-agent

- [ ] Demonstrate a mixed workflow that inspects a project, changes a file, validates the change, and inspects a local image through the selected toolset.
- [ ] Verify normal package loading and reloading, activation in an existing conversation, and explicit tool inclusions/exclusions. Distinguish hidden declarations from callable-tool access and preserve historical calls.
- [ ] Preserve unrelated tools and their model-dependent availability, including current web tools. Leave extension-owned core-name overrides intact without claiming their restrictions transfer to the new names.
- [ ] Exercise the configured composer, attachments, skill references, prompt/lifecycle extension, and chat package together. Preserve submitted content, native tool presentation, work history, and retained history.
- [ ] Preserve provider composition and the user's guidance, skills, model settings, and effective host preferences. Introduce no second conversation store or package-specific chat protocol.
- [ ] Verify ordinary prompt continuation with live process/cell state, then new/resumed/forked sessions, reload, quit, and shutdown using actual native lifecycle events. Clear owned live state while retaining completed file changes and history.
- [ ] Verify cancellation and result interception across a mixed sequence, including a blocked nested call and a redacted result that stays redacted in the next model request.
- [ ] Keep user-entered shell commands on their native path and avoid changes to terminal, keybinding, editor, or clipboard ownership.
- [ ] Reuse the same host fixture for integration checks; run the affected existing companion checks only where this slice changes shared behavior.
