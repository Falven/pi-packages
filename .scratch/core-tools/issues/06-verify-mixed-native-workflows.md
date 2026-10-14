# 06: Preserve complete workflows in mixed Pi sessions

**What to build:** Use commands, continued execution, patches, and images together in normal Pi sessions while preserving existing extensions, user choices, native history, and lifecycle behavior.

**Specification:** [Core toolset](../spec.md).

**Dependencies (resolved):** 02 — Continue interactive commands across prompts; 03 — Yield and resume execution cells; 04 — Apply file patches through native dispatch; 05 — Return local images through Pi's image pipeline.

**Status:** resolved — configured controlled native-host workflow verified at `f415bae`; matched live-model verification is recorded in ticket 07

- [x] Demonstrate a mixed workflow that inspects a project, changes a file, validates the change, and inspects a local image through the selected toolset.
- [x] Verify normal package loading and reloading, activation in an existing conversation, and explicit tool inclusions/exclusions. Distinguish hidden declarations from callable-tool access and preserve historical calls.
- [x] Preserve unrelated tools and their model-dependent availability, including current web tools. Leave extension-owned core-name overrides intact without claiming their restrictions transfer to the new names.
- [x] Exercise the configured composer, attachments, skill references, prompt/lifecycle extension, and chat package together. Preserve submitted content, native tool presentation, work history, and retained history.
- [x] Preserve provider composition and the user's guidance, skills, model settings, and effective host preferences. Introduce no second conversation store or package-specific chat protocol.
- [x] Verify ordinary prompt continuation with live process/cell state, then new/resumed/forked sessions, reload, quit, and shutdown using actual native lifecycle events. Clear owned live state while retaining completed file changes and history.
- [x] Verify cancellation and result interception across a mixed sequence, including a blocked nested call and a redacted result that stays redacted in the next model request.
- [x] Verify package-owned cell activity presentation with the configured companions, including work between waits and interrupted records after resume. Native hook IDs/context remain accepted limits; change chat code only after a demonstrated presentation failure.
- [x] Verify that cancelling a later wait preserves its cell and unread output, while termination and session replacement clean up owned work. Check notification delivery without an unsolicited turn or duplicated model content.
- [x] Keep user-entered shell commands on their native path and avoid changes to terminal, keybinding, editor, or clipboard ownership.
- [x] Reuse the same host fixture for integration checks; run the affected existing companion checks only where this slice changes shared behavior.

## Partial composition evidence

A temporary probe reused [the native host](../../../fixtures/native-host.ts) and [the shared model-loop fixture](../../../packages/pi-codex-tools/test/fixtures/model-loop.ts) with the configured composer, attachments, skill references, chat, prompt/lifecycle extension at 4.13.0, and web extension at 1.6.0. Four controlled checks passed again at integration commit `0d80487`: a companion-only control, the core toolset loaded first, the core toolset loaded last, and raw call history after deselection. Runtime code remained unchanged in `17c4c58`.

Both core load orders completed a real command → patch → validation → image sequence. Checks covered all four selected names in `ALL_TOOLS`, native nested events and retained records, and image content in the next request. The observed requests also retained attachment image bytes, one expanded skill block, one prompt-extension section, the existing web-search declaration, and model-dependent URL-tool hiding. Native blocking preserved web-tool ownership, reload retained the draft and history, and a user-entered shell command stayed on its native path without a model request.

A separate [public-host process lifecycle probe](../../../packages/pi-codex-tools/test/fixtures/observed/commands/session-replacement.json) passed six cases at `5507b77`: new, resume, and fork, each during an idle handle and an active poll. Owned shells and children stopped before replacement returned; old handles became stale, fresh commands worked, and completed files remained. New sessions had empty history, resume restored the saved destination, and forks retained history through the chosen anchor while keeping later file effects. Active polls preserved `ACTIVE` output and complete native nested-call summaries. Resuming the original history did not restore its old process handle. Reloaded-history comparison omitted only top-level result details and usage properties whose value was undefined, as recorded in the artifact.

Those earlier checks were partial composition and process-lifecycle evidence using controlled provider responses. The companion probe blocked the actual web network call through a native hook. At that revision, neither probe established retained execution cells, their session lifecycle, or matched live-model trials; [ticket 03](03-yield-and-resume-execution-cells.md) still blocked the continued-execution criteria.

## Integrated verification

The [neutral evidence index](../../../packages/pi-codex-tools/test/fixtures/observed/workflows/index.json) records 15 passing public-host cases at `f415bae`: five companion composition, selection/history, and retained-conversation activation checks; seven cancellation and lifecycle checks; and three mixed continuation and genuine interrupted-history checks. The external raw logs and executable probes are identified by SHA-256 in that index. Their literal requests and results remain outside the repository. The current seven-companion inventory includes the newly configured package at version 0.1.0; its package and source-manifest hashes are recorded there. No goal operation was invoked.

Both extension load orders completed command → patch → validation → local-image work while configured hooks blocked and edited nested commands, redacted a result, and continued firing after the parent yielded and during a later prompt. The next model-visible wait result retained the redaction. The model request retained attachment image content, one expanded skill, prompt guidance, unrelated selected declarations, and the additional local-image result. Reload preserved the editor draft and raw history; deselection and re-selection kept the historical call in its original form. Loading the toolset into a saved conversation preserved earlier messages. User-entered shell input stayed on the native route.

Native new, resume, fork, reload, quit, and shutdown events stopped owned live work. The checks retained completed file changes and applicable saved history, preserved unread output when a later wait was cancelled, and cleared stored values after session replacement while preserving them across an ordinary prompt. Public activity rendered during execution and showed “interrupted or unknown” after a real abrupt exit and resume; it did not enter model context. A notification arrived at the safe boundary without an extra provider turn or duplicate model content.

These results establish the configured controlled-host workflow. They do not establish matched live-model performance or general integration with unconfigured overrides. The public host does not provide durable native child-call attribution after a parent result returns; package-owned activity IDs cover that presentation gap. Local-image conversion currently reports automatic detail. Ticket 07 owns final contract conformance and matched trials.
