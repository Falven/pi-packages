# Pi Predict

## Problem Statement

Pi users need a useful next-message suggestion after a response without changing how they compose, edit, or submit requests. The suggestion must work in vanilla Pi and with an independently selected composer. Requiring a particular package order, replacing the user's composer, or storing proposed text as a real draft would make the feature unreliable.

Users also need to choose the prediction model through Pi's normal extension settings patterns. The requested reference is Codex's follow-up suggestor: its verified prompt and equivalent selection of the complete effective conversation, rather than an invented prompt or a shortened transcript.

## Solution

Add `pi-predict`, an independently installable extension that displays one suggested follow-up as faint placeholder text inside the empty, focused composer. Plain Tab inserts the suggestion as an ordinary editable draft without submitting it. Typing hides it, clearing the draft can reveal it again, and Escape dismisses it for that source response.

The extension follows composer replacements automatically, supports native Pi and `pi-composer` in either order, and uses the same rendering conventions for other compatible composers. The `/predict` command uses native settings controls to enable predictions and choose a model, initially inheriting the current conversation model.

Keep the verified Codex prompt readable and versioned within the package. Predictions use the effective Pi conversation and Pi-owned providers and credentials. The current implementation has passed controlled verification, but generation remains unavailable until that exact reference prompt is captured.

## User Stories

1. As a vanilla Pi user, I want to install only `pi-predict`, so that suggested follow-ups require no other package from this repository.
2. As a user of another composer, I want suggestions inside my selected composer, so that I can keep its editing behavior.
3. As a package user, I want either installation order to work, so that I do not have to arrange extensions manually.
4. As a user who changes composers, I want suggestions to follow the active composer automatically, so that switching or restoring an editor does not remove the feature.
5. As a terminal user, I want suggestions in regular and fullscreen modes, so that my chosen Pi layout remains usable.
6. As a Pi user, I want faint suggested text inside the empty composer, so that I can distinguish a proposal from my own draft.
7. As a Pi user, I want suggestions shown only while the empty composer is focused and Pi is idle without pending messages, so that they do not interfere with active work.
8. As a Pi user, I want Tab to insert a visible suggestion without sending it, so that I can review and edit it first.
9. As a Pi user, I want Tab to insert the complete suggestion even when its preview is shortened, so that long or multiline messages remain intact.
10. As a Pi user, I want ordinary typing to hide the suggestion without overwriting my text, so that I remain in control of the draft.
11. As a Pi user, I want a retained suggestion to reappear when I clear my draft, so that I can reconsider it without another prediction request.
12. As a Pi user, I want Escape to dismiss the suggestion for its source response, so that an unwanted proposal does not keep returning.
13. As a Pi user, I want the composer's normal undo action to undo acceptance, so that suggested text behaves like an ordinary edit.
14. As a Pi user, I want completions, dialogs, pastes, and modified or released keys to keep their native behavior, so that prediction acceptance does not intercept unrelated input.
15. As a terminal user, I want the preview to respect themes, cursor placement, resizing, padding, and Unicode cell widths, so that it stays inside the editable area.
16. As a Pi user, I want prediction generation to inherit my current model by default, so that the feature needs no second model configuration.
17. As a Pi user, I want to select a separate prediction model without changing the conversation model, so that I can choose its cost and capabilities independently.
18. As a Pi user, I want model selection to reuse Pi's providers and credentials, so that I do not maintain another login or credential store.
19. As a Pi user, I want to search available models by provider, identifier, or display name, so that I can find my preferred model quickly.
20. As a Pi user, I want native settings controls for enabling predictions and selecting a model, so that configuration follows familiar Pi interactions.
21. As a Pi user, I want preferences to survive restarts and manual edits to take effect after reload, so that configuration remains predictable.
22. As a Pi user, I want malformed settings and failed saves reported without corrupting my saved preferences, so that configuration failures are recoverable.
23. As a Pi user, I want one prediction attempt after a successful, fully settled response, so that partial responses and repeated UI events do not cause duplicate calls.
24. As a Pi user, I want no prediction after a failed or aborted response, so that the extension does not suggest continuing unfinished work.
25. As a Pi user returning to a completed thread, I want an eligible catch-up prediction, so that the feature also helps with saved sessions.
26. As a Pi user, I want stale work invalidated when the turn, session, branch, model, compaction state, or settings change, so that an old result cannot affect the wrong conversation.
27. As a Pi user, I want draft checkpoints and presentation-only entries to preserve the prediction's source identity, so that ordinary UI bookkeeping does not trigger another attempt.
28. As a Pi user, I want predictions to consider the complete effective conversation and its active branch, so that they reflect the actual instructions and completed work.
29. As a Pi user, I want the same verified prediction prompt used by the chosen Codex reference, so that prompt parity is based on evidence.
30. As a Pi user, I want images to follow Pi's effective image policy and incompatible models to fail clearly, so that context is not silently changed.
31. As a Pi user, I want unavailable models, authentication failures, and context-limit failures reported without model substitution or history truncation, so that my selected configuration remains authoritative.
32. As a Pi user, I want prediction generation to preserve tool context without executing tools or retrieving more content, so that suggesting a message cannot perform additional work.
33. As a Pi user, I want unaccepted suggestions kept out of draft recovery, retained history, and parent requests, so that proposals do not become user messages without my action.
34. As a Pi user, I want valid empty predictions to remain unobtrusive and invalid output to fail clearly without automatic retries, so that background generation is predictable.
35. As a Pi user, I want a bounded request deadline and cancellation on lifecycle changes, so that abandoned predictions do not continue indefinitely.
36. As a Pi user, I want to know that predictions send context to the selected provider and use its normal quota and pricing, so that model choice is informed.
37. As a user of an incompatible composer, I want a specific compatibility notice while keeping that composer operational, so that missing rendering conventions do not break editing.
38. As a user of noninteractive Pi modes, I want the extension to leave those modes unchanged, so that installing it does not add background work to headless workflows.
39. As a maintainer, I want the prompt and its provenance easy to read and update deliberately, so that future changes can be compared with a fixed reference.
40. As a maintainer, I want package organization, documentation, screenshots, release metadata, and standalone archive verification to match the repository's conventions, so that users can install and maintain the extension consistently.

## Implementation Decisions

- **Name and package boundary:** use `pi-predict` and the `/predict` command. Keep extension registration, lifecycle, prediction requests, settings, the reference prompt, and the native adapter owned by this package. Add no runtime, type, optional, or peer dependency on a sibling package.
- **Supported platform:** follow the repository's source-loaded ESM TypeScript packaging, shared strict configuration, Node.js 24 minimum, Pi/AI/TUI 1.x peer ranges starting at 1.1.0, and exact development dependency versions. Verified compatibility currently covers Pi/AI/TUI 1.1.0.
- **Native ownership:** preserve Pi's input decoding, keybindings, focus, cursor management, provider services, session projection, and effective settings. The selected composer continues to own draft text, selection, insertion, undo, completions, and submission.
- **Approved adapter boundary:** follow the preserve-Pi-contracts decision and the specific suggested-follow-up adapter exception. Acquire the native host through a synchronous observation that is immediately restored. Persistent observations and decoration are scoped to the current host, its Agent request function, and its active editor.
- **Composer changes and cleanup:** observe Pi's existing editor-selection operation and attach to the actual replacement synchronously. Preserve the selected factory and current draft. Restore only still-owned hooks, release partial attachment on failure, and leave inactive wrappers forwarding native behavior when another extension has wrapped them.
- **Rendering contract:** require a focused editor, Pi's cursor marker, ordinary insertion support, and a writable rendering method. Decorate the empty content row using native terminal-width, clipping, compositing, theme, and optional padding services. Preserve the cursor cell and display a dim, shortened single-line preview without writing draft text.
- **Compatibility limits:** verify native Pi and `pi-composer` in both orders and both TUI modes. Other composers preserving these conventions need no separate integration. Missing capabilities produce a specific notice and preserve the selected composer; they do not cause a fallback editor.
- **Display eligibility:** show only in an exactly empty, focused composer while Pi is idle, with no pending messages, active completion, or blocking extension dialog. A result received while the user is typing may be retained, but must not replace the draft.
- **Acceptance and dismissal:** consume plain Tab only for a suggestion actually painted by the current editor and still eligible. Insert the full text through that editor's normal edit operation, clear the suggestion, and never submit. Escape dismisses a painted suggestion for its source response. Ordinary typing hides retained text; clearing the draft can reveal it again. Undo remains native and does not restore an accepted suggestion.
- **Source and attempts:** identify the last successful completed assistant response by its source entry within the current session, excluding presentation-only bookkeeping. Permit one attempt for that source under the current configuration after settling or when returning to an eligible saved thread. Failed and aborted responses are ineligible.
- **Lifecycle:** cancel pending requests and scheduled work on new agent activity, session navigation or disposal, model changes, compaction, and configuration changes. Check source identity and request ownership before displaying asynchronous results. Scope dialogs, listeners, timers, and render hooks to the active session; a closed old-session dialog cannot schedule work in its replacement.
- **Reference prompt:** bundle the exact verified remote prompt, prompt version, capture date, content hash, and configured reasoning override in readable source. Append the reference client's nullable-string JSON-schema instruction. Do not invent a replacement, use an upstream test prompt as production text, or fetch Codex configuration at runtime. Missing verified prompt data must fail before a provider request.
- **Live context:** observe the public Agent request function while forwarding the parent request unchanged. Retain its fully prepared messages and persisted session boundary, then include subsequent projected messages through the completed response. This preserves final context transformations and temporary system-prompt overrides that Pi clears before the settled event.
- **Catch-up context:** when no applicable captured request exists, use Pi's complete canonical session projection, context transformation, and LLM conversion. Respect the active branch and existing compaction. Temporary instructions that Pi never persisted cannot be recovered from an earlier process.
- **Context fidelity:** include effective instructions, conversation messages, tool declarations, tool results, and images allowed by Pi. Preserve the parent conversation and use Pi's normal conversion and image policy. Do not shorten history, independently summarize or compact it, silently remove required images, retrieve extra context, or switch to a fallback model. Equivalent context selection does not promise identical provider payloads or Codex-specific encrypted reasoning.
- **Prediction request:** call the selected model through Pi's model registry without changing the conversation model or recording a prediction turn. Retain tool declarations, request no tool selection, and provide no execution loop. Reject any returned tool call. Use a 30-second deadline, lifecycle cancellation, and no automatic client retries; inherit Pi's reasoning choice unless the verified reference supplies an override.
- **Output contract:** require one JSON object whose required suggestion field is either a string or null. Trim outer whitespace; null and an empty string mean no suggestion. Reject malformed JSON, invalid field types, terminal control characters, incomplete responses, and tool requests. Report provider and validation failures without inserting text or automatically retrying.
- **Native settings:** use Pi's custom UI, settings list, input, selection list, themes, keybindings, and fuzzy filtering. Offer enablement and a model selection from Pi's available-model registry. Do not patch the central settings menu or add provider and credential management.
- **Preference contract:** default to enabled with no independent model selection. Persist a boolean enablement value and either no selection or the selected provider and model identifiers in a package-owned file under Pi's active agent directory. Validate stored values, use an exclusive private temporary file and atomic rename, keep the prior saved value on write failure, and reread manual changes on reload.
- **Distribution and documentation:** follow the existing package manifests, root listing, Changeset, specification, and architectural records. Include runtime source, the readable reference prompt, README, and captured screenshots in the archive. Document installation, reload, settings, acceptance, provider usage, context limits, and verified compatibility. A screenshot using a controlled response must not imply live-provider quality or exact-prompt verification.
- **Scope of integration:** attach interactive behavior only in TUI mode. Keep other packages, installed Pi sources, and shared dependencies unchanged. Add no production interface solely for testing.

## Testing Decisions

- **One primary seam:** retain the existing real-Pi InteractiveMode and AgentSession host used during this work. Load extensions normally, drive actual editor and lifecycle input, record terminal frames, and capture requests to a controlled local provider. This covers the user's accepted native-Pi and current-composer verification without introducing another production seam.
- **Observable assertions:** verify what appears, what the draft contains, what was submitted, which model and context received a request, and what persisted. Do not treat a snapshot of faint text, an internal flag, or a wrapped factory alone as proof of correct acceptance or compatibility.
- **Modules through the host:** exercise lifecycle orchestration, prediction generation and validation, context preparation, composer decoration, and native settings through the same host. Use temporary filesystem state for observable preference persistence and failure cases.
- **Composition and editing matrix:** cover native-only operation, both `pi-composer` orders, later replacement and native restoration, regular/fullscreen modes, narrow widths, Unicode, focus, modified/released keys, typing and clearing, multiline acceptance, undo, Escape, completions, pastes, and dialogs. Assert that preview painting leaves draft, retained history, and parent requests unchanged.
- **Lifecycle and request matrix:** cover fully settled success, failed or aborted parents, catch-up, pending results while typing, new turns, session and branch changes, compaction, configuration/model changes, disposal, and draft checkpoints. Count requests and verify that stale results cannot mutate a replacement session or cause automatic retries.
- **Context and failure matrix:** compare prediction input with the actual prepared parent context and completed response. Include temporary system overrides, later context transformations, tool declarations and results, image policy, incompatible or unavailable models, authentication/provider errors, malformed output, terminal control characters, valid null/empty output, tool requests, and cancellation.
- **Settings and packaging:** verify native model search and independent selection, enablement, reload, private atomic persistence, malformed input, and failed saves. Load the packed extension in a separate vanilla Pi installation with sibling packages absent. Packaging checks use the same host behavior rather than a mock extension loader.
- **Prior art and limits:** reuse the repository's native-host, native editor action, completion, mixed-composition, and session-draft checks, along with the standalone packaging approach used for independent packages. The current feature was exercised through temporary assertion probes; this specification does not add a committed test suite.
- **Reference acceptance:** keep synthetic instructions confined to controlled probes. They establish request, rendering, and editing behavior, not exact prompt parity. Compare the bundled prompt and its schema suffix against the verified reference before declaring the feature ready.
- **Verification scope:** run relevant typecheck, lint, formatting, whitespace, integration, and archive checks when implementation changes require them. Record runtime versions and distinguish automated real-host evidence from physical-terminal delivery, later-version compatibility, and live-provider quality.

## Out of Scope

- Replacing the user's composer, requiring package order, adding sibling-package dependencies, editing installed Pi, or maintaining a Pi fork.
- A universal rendering guarantee for composers that do not preserve the required native focus, cursor-marker, insertion, and rendering conventions.
- Submitting or queuing a suggestion automatically, accepting it with additional keys, managing queued follow-ups, or offering multiple simultaneous suggestions.
- Custom-prompt settings, runtime Codex configuration fetching, a second credential store, a model-management framework, or central-settings integration unsupported by Pi.
- Executing prediction tools, independent memory or connected-app retrieval, extra file reads for prediction context, model substitution, silent image removal, or independently truncated/summarized history.
- Byte-identical provider requests, recovery of nonpersisted instructions from an earlier process, and replication of Codex-only runtime state or eligibility experiments.
- Changing other packages' editing, attachment, transcript, draft-recovery, or submission behavior.

## Further Notes

**Current state:** the package implementation and controlled verification exist in the working tree. Production generation remains unavailable because the exact Codex prompt has not been retrieved. Completion requires the real prompt, prompt version, and prediction reasoning effort from the reference configuration, followed by provenance recording and reference acceptance. No credentials belong in the package.

**Reference:** the inspected Codex desktop version is 26.1013.40934, build 20770, with CLI 0.163.0-alpha.10.2. Its prompt is fetched from authenticated remote configuration and is absent from the inspected bundle. An unauthenticated request returned HTTP 401; Computer Use also blocked inspection of Codex's own UI. The [research and verification record](../plans/composer-predictions.md) preserves source evidence, exact commands, and results.

**Existing verification, recorded on 2026-10-20:** 34 behavior/lifecycle/provider-boundary probes, 75 existing native-host/composer checks, and two standalone archive checks passed with Node.js 26.8.1 and Pi/AI/TUI 1.1.0. Typecheck, lint, scoped formatting, and whitespace checks passed. The archive checks distinguished the unchanged package's missing-prompt failure from a separate extracted copy using a synthetic instruction; production source remained unchanged.

**Host dependency limitation:** the initial standalone Pi 1.1.0 installation selected pi-codemode 1.2.0, which lacked an export that Pi required before loading any extension. The passing standalone check pinned that host dependency to 1.1.0, matching the repository lockfile. This is not a dependency or override added to pi-predict.

**Unverified:** physical-terminal keyboard delivery, later Pi versions, the full repository test suite, exact prompt parity, and live-provider prediction quality. Recorded-frame screenshots demonstrate rendering with a controlled response.

**Architecture:** the [preserve-Pi-contracts decision](../adr/0001-preserve-pi-extension-contracts.md) remains authoritative, with the approved [suggested-follow-up adapter exception](../adr/0032-independent-composer-followups.md). The [domain glossary](../../GLOSSARY.md) distinguishes a suggested follow-up from a draft and a queued follow-up.

**Publication:** this conversation synthesis is published as `ready-for-agent` in the [local prediction issue](../../.scratch/pi-predict/issues/01-independent-composer-predictions.md). It retains the existing test seam and completed evidence, while recording the prompt dependency as a blocker. Publication does not mark the feature resolved or ready to release. This step changes documentation and tracker state only; it does not rerun or extend behavioral verification.
