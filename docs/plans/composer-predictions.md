# Composer predictions

Research for the independent suggested-follow-up package, inspected on 2026-10-20. The confirmed design is implemented in `packages/pi-predict`; the [specification](../specs/pi-predict.md) records its current contract and verification. The supplied Codex prompt version 5 is bundled with its high reasoning setting. Watermark rendering, Tab acceptance, composer replacement, settings, and standalone loading have passed controlled-provider checks using that reference.

## Requested outcome

- Add an independently installable package with no dependency on another package in this repository.
- Support unmodified Pi with its native editor and installations using other composers, including `pi-composer`, in either package order. Handle later composer replacements automatically.
- Let the user select the prediction model through Pi's established extension settings patterns.
- Bundle the verified Codex prediction prompt in a readable, editable source file and preserve its context-selection behavior using the complete effective Pi conversation.
- Show the suggestion as faint text inside the composer. Tab accepts it into the editable draft without submitting it.

The product concept is a **suggested follow-up**. Codex calls the feature **composer predictions**. This is distinct from the glossary's queued follow-up: no user request exists until the user accepts and submits the proposed text.

## Reference and evidence

The installed `/Applications/ChatGPT.app` contains the Codex desktop application, version `26.1013.40934`, build `20770`. Its bundled CLI is `0.163.0-alpha.10.2`. The corresponding public Git tag resolves through annotated tag `d9151c94a70013f176ff370fa93da02734662e41` to commit `4ebc485ca321243727539187169425fcf972f2c4`.

The desktop reference is `Contents/Resources/app.asar`. These are paths inside that archive, not repository files:

| Archive file                                 | Relevant symbols                                                                                        | SHA-256                                                            |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `.vite/build/main-CLu1A25j.js`               | `_w`, `y_e`, `C_e`, `w_e`, `T_e`: response schema, request, remote configuration, cache                 | `8aedee047ec0a078e65b24dc917c64ad544220395e773feb6740f4447008a495` |
| `.vite/build/src-DsLVGakC.js`                | `Jq`, `An`: temporary fork and prediction turn                                                          | `28a0918f01c50b0eb17676e894998ad7182f119d978adf0467ccaac3583f259c` |
| `webview/assets/app-initial-90eb42395b7d.js` | `pju`, `Jqu`, `Yqu`, `Zqu`, `$qu`: background generation, eligibility, editor decoration and acceptance | `2687d59e8c67ccf81c7efb3820211070df303c6a200c9e0e8d604f26253f2f5e` |
| `webview/assets/app-primary-b4ce9e46e8cf.js` | `JZe`, `YZe`: mounted composer and catch-up generation                                                  | `4d70785315494e1be83d5c4b47ac0a45dcfedde43f2d25ce0f111aedf7ae2350` |

The stylesheet `webview/assets/app-primary-71492d0e9e92.css` gives the decoration the theme's tertiary text color and a default content opacity of `0.5`.

[Official Composer Predictions documentation](https://learn.chatgpt.com/docs/features/composer-predictions) confirms that Tab creates an editable draft, predictions use the current thread, and predictions perform no independent memory or connected-app retrieval. Context already present from those sources can inform the prediction. The docs also distinguish free prediction generation in Codex from ordinary usage when an accepted message is sent. That billing behavior does not transfer to a Pi extension making calls through the user's provider.

## Observed behavior

| Concern     | Installed Codex behavior                                                                                                                                                                                                       |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Output      | One JSON object with a nullable string `suggestion`. Whitespace is trimmed. Null or an empty string yields no suggestion.                                                                                                      |
| Prompt      | Authenticated `GET /wham/predictions/config` returns `prompt`, `prompt_version`, reasoning effort, enablement, model exclusions, and sampling settings. The client appends a JSON-schema instruction to that prompt.           |
| Generation  | A temporary prediction fork of the current thread. The parent model is inherited; configured prediction reasoning effort can override the parent's effort.                                                                     |
| Triggers    | A background `live` request associated with a completed turn and a composer `catch_up` request. These share a cache keyed by host, thread, and source turn.                                                                    |
| Eligibility | Feature and user settings, remote configuration, parent provider/model support, and thread state constrain generation. Plan mode is excluded in the inspected client.                                                          |
| Display     | An editor decoration, separate from draft content. Its editor-level predicate requires one empty paragraph and no active autocomplete or IME composition. The outer composer adds further eligibility checks.                  |
| Appearance  | Theme-aware faint text. The suggestion can contain rendered prompt formatting. A feature-gated first-use hint says to press Tab.                                                                                               |
| Acceptance  | Unmodified Tab, Right Arrow, and Enter insert the suggestion and place the caret at its end. That key event does not submit the message. The user's Pi request requires Tab; the extra keys are not yet a package requirement. |
| Typing      | Entered text hides the decoration. The editor-level predicate can reveal the retained prediction again when the draft becomes empty, unless it has been dismissed or invalidated.                                              |
| Stale work  | A new parent turn invalidates that thread's cached prediction requests. A different source turn replaces prior entries. Dismissal suppresses that source turn in the composer.                                                 |
| Failures    | No automatic query retry. The temporary generation helper has a 30-second timeout. Malformed or absent structured output does not become a suggestion.                                                                         |

The client also checks moderation metadata for the source turn before exposing a prediction. The table describes observed Codex behavior, not an approved Pi implementation specification.

## What the context actually contains

The pinned [thread fork contract](https://github.com/openai/codex/blob/4ebc485ca321243727539187169425fcf972f2c4/codex-rs/app-server-protocol/src/protocol/v2/thread.rs#L544) defines prediction mode as inheritance of the loaded parent's effective configuration, tools, environments, and persisted history. It requires a loaded, persisted parent and an ephemeral fork. Configuration overrides and history cutoffs are rejected for that fork mode.

The [fork implementation](https://github.com/openai/codex/blob/4ebc485ca321243727539187169425fcf972f2c4/codex-rs/app-server/src/request_processors/thread_processor.rs#L5086) obtains the parent's runtime state and disables automatic compaction for the prediction fork. `excludeTurns: true` only omits turn hydration from the API response; it does not remove conversation history from model context.

The public [inheritance snapshot](https://github.com/openai/codex/blob/4ebc485ca321243727539187169425fcf972f2c4/codex-rs/core/tests/suite/snapshots/all__suite__scenarios__prediction_fork_inherits_parent_context.snap) includes developer instructions, tools, environment context, previous messages, and encrypted reasoning. It compares a prediction fork with an equivalent continuation of its parent. A separate [compaction snapshot](https://github.com/openai/codex/blob/4ebc485ca321243727539187169425fcf972f2c4/codex-rs/core/tests/suite/snapshots/all__suite__scenarios__prediction_fork_preserves_context_above_compaction_threshold.snap) preserves the parent's existing context and reminder above the ordinary compaction threshold. These are inspected upstream test artifacts; their tests were not run here.

Consequences for the requested package:

- A last-answer-only prompt, a fixed number of recent messages, or an independently generated summary would change the reference's context policy.
- A selected Pi model can receive the effective Pi conversation. It cannot inherit Codex-specific encrypted reasoning, provider configuration, or runtime state. The portability contract must distinguish equivalent context selection from identical provider request bytes.
- Keeping the full context may exceed a separately selected model's context limit. Silently truncating it would violate the exact-context requirement.
- The reference retains tool declarations. Assuming that the prediction request has no tools would be inaccurate. Whether the portable extension retains declarations while preventing new tool execution needs an explicit decision.
- `context_with_system` exposes Pi's full transcript, including prompt and tool state. Later handlers can still transform it, and `before_provider_request` can change the provider payload. Observing one hook is not proof that the package captured every other extension's final transformation.

## Exact prompt status

The user supplied `/Users/fran/Downloads/prediction-config.json` on 2026-10-20. Its `prompt`, `prompt_version`, and `prediction_reasoning_effort` are now bundled in the readable [prompt reference](../../packages/pi-predict/src/prompt.ts). The prompt text matches the supplied file byte for byte; the appended nullable-string JSON schema matches the inspected Codex client contract.

| Reference field             | Value                                                              |
| --------------------------- | ------------------------------------------------------------------ |
| Prompt version              | `5`                                                                |
| Prediction reasoning effort | `high`                                                             |
| Date received               | `2026-10-20`                                                       |
| UTF-8 prompt SHA-256        | `bf64e2c1b0e11dca1a982ab95e77afc4046422b3605849fb9d9da0fdca069418` |
| Supplied JSON SHA-256       | `b8d3c8c643647383babe83b087520f8ad758913660c809cadc599fc5bc8af8a0` |

The JSON contains no response headers, capture timestamp, or app build. The source's `capturedAt` field records the date the reference was supplied; it does not claim an independently witnessed HTTP capture or tie the remote configuration to a particular build. The inspected client fetches configuration from authenticated `GET /wham/predictions/config` and caches it for five minutes, so configuration can change independently of the app version.

The package uses this fixed reference and Pi-owned model credentials. It does not fetch Codex configuration at runtime or require a Codex login. Codex's enablement, sampling, and model-exclusion fields remain application-specific; they do not replace Pi's model selection or the package's settings. Reference updates are deliberate source changes with a new version and hash.

## Pi integration surface

The repository targets Pi and Pi TUI `1.1.0` with Node.js 24 or later. The relevant public extension guidance and installed declarations were inspected, along with the current upstream extension guide.

**Settings.** Pi `1.1.0` does not expose `registerSetting()` or a way to add a row to central `/settings`. Its [terminal UI guide](../../node_modules/@earendil-works/pi-coding-agent/docs/tui.md) recommends `SettingsList` and the built-in selection components. The [tools example](../../node_modules/@earendil-works/pi-coding-agent/examples/extensions/tools.ts) hosts a settings list inside an extension command; the [preset example](../../node_modules/@earendil-works/pi-coding-agent/examples/extensions/preset.ts) uses extension-owned configuration files. [ADR 0001](../adr/0001-preserve-pi-extension-contracts.md) already records this distinction in this repository. Follow those patterns without importing another package's settings module or inventing a central settings API.

**Model selection.** `ctx.modelRegistry` exposes available models, provider identities, authentication status, and provider-neutral calls through `streamSimple()`. Existing provider configuration and credentials should remain Pi-owned. Choosing a prediction model does not require switching the conversation's main model or adding a second credentials UI.

**Editor.** Public `getEditorComponent()` and `setEditorComponent()` expose the selected custom factory. `addAutocompleteProvider()` stacks completion menus; it does not expose an inline watermark API. The native editor and `SourceEditor` expose rendering, insertion, padding, cursor, and autocomplete state, but neither has a placeholder setter.

A startup-only factory wrapper does not meet the requirement: a later replacement factory removes the wrapper. Package ordering is not an accepted workaround. The extension must follow the active composer automatically, including replacements after startup, without importing or requiring another package.

Pi's shared draft and input APIs establish text access and key interception, not inline rendering compatibility. The installed `EditorComponent` contract requires text access, input handling, and rendering, but exposes neither an editable-area rectangle nor a watermark hook. Pi's separate `Focusable` guidance recommends `CURSOR_MARKER` for cursor placement; `EditorComponent` does not require it. A reversible instance adapter may be necessary; the existing attachment adapter is evidence to investigate, not a dependency or proof that its approach meets this rendering requirement.

The upstream [ghost-text API request](https://github.com/earendil-works/pi/issues/2355) was closed after the maintainer recommended implementing a custom editor. Its closed status does not mean the proposed shared API was added. The inspected community [pi-ghost-text entry point](https://github.com/jcv/pi-ghost-text/blob/0b182406ebe179132655dcd5c830e7d02a73e72a/src/index.ts#L111) installs its own editor through `setEditorComponent()`. Its [rendering helper](https://github.com/jcv/pi-ghost-text/blob/0b182406ebe179132655dcd5c830e7d02a73e72a/src/render.ts#L11) uses the cursor marker and assumes trailing padding. [pi-ghost-complete](https://github.com/Davidcschan/pi-ghost-complete/blob/d24d8ae94933b8c049922262dcb5077cb8ef0252/src/editor.ts#L427) likewise decorates its own editor subclass. These examples establish useful rendering techniques, not compatibility with a separately selected composer.

Accepting text must go through the active editor's ordinary edit operation. Painting a suggestion must not call `setEditorText()` or otherwise affect draft persistence, history, undo, attachment handling, or submission. A global Tab handler must not intercept completion menus or focused dialogs.

### Editor-contract probe

A temporary assertion probe ran against installed, unmodified Pi/TUI `1.1.0` using `fixtures/native-host.ts`, the real `pi-composer` registration function, and the fixture's recording terminal. It did not implement a prediction request or watermark. It observed the existing host instance's editor-replacement method and restored that observation at session shutdown. No repository test was added, and no model request occurred.

Command: `node --test /tmp/pi-followups-reference-20261020/editor-contract-probe.mjs` — three cases passed: native-only, observer before composer, and composer before observer.

Established facts:

- A host-instance observer sees later calls to public `setEditorComponent()` synchronously, including restoration of the native editor. The selected factory and current draft remain unchanged by observation. This is a feasible replacement-tracking seam without a package-order requirement.
- Both native `CustomEditor` and `pi-composer`'s `SourceEditor` emit a cursor marker while focused with an empty draft. Their output differs: at 60 columns, native Pi returns a padded content row, while `SourceEditor` returns only its one-cell empty cursor. A helper that requires native trailing padding would fail to paint in the current composer.
- Pi accepted a minimal valid custom editor without a cursor marker. The observer followed that replacement too, but there was no generic cursor or editable-area metadata to locate a watermark. A universal guarantee for every valid `EditorComponent` cannot be inferred from the public contract.
- Session shutdown restored the observed host method. This verifies the probe's cleanup, not a finished rendering adapter's cleanup.

The implementation uses a package-owned, reversible adapter that follows the existing host's active editor and decorates its rendered cursor position. The later behavior probes establish actual watermark geometry, Tab handling, focus/completion isolation, unsupported-capability notices, renderer changes, and reload behavior. It does not require composer authors to import this package or users to arrange installation order. The user accepted a compatibility notice for composers that do not preserve the required rendering conventions.

## Settled decisions

The user accepted or specified these requirements:

1. **Prompt reference:** freeze a verified remote prompt version in the package, with deliberate updates and no runtime Codex dependency. Keep the prompt somewhere in source that is easy to read and modify. The supplied version 5 configuration resolves the missing-reference prerequisite.
2. **Context portability:** preserve Codex's selection behavior using the complete effective Pi conversation, while documenting provider-specific differences rather than promising identical provider payloads.
3. **Initial model and settings:** inherit the current Pi model until the user selects a separate prediction model. Use Pi's model registry, authentication, native settings components, and established extension-owned settings storage. Predictions make additional provider calls under the selected provider's ordinary usage rules.
4. **Editor composition:** require independence, either load order, and automatic handling of composer changes. Preserve whichever composer the user selected. A startup-only wrapper and an installation-order requirement are rejected.
5. **Repository conventions:** match the existing packages' README conventions, source organization, manifests, settings behavior, documentation, and relevant verification practices. Package-specific limitations in older extensions do not weaken the requirements above.

## Confirmed implementation decisions

The user accepted Q5–Q7 on 2026-10-20. The design frontier is empty, and the supplied configuration resolves the prompt prerequisite. Package-owned user settings follow the accepted Pi convention; full-context overflow must not silently trigger truncation or model substitution.

The accepted decisions are:

5. **Rendering capability boundary:** use a narrow, reversible adapter on the active composer's display, based on Pi's standard rendering conventions. Verify vanilla Pi and `pi-composer` in both orders; other composers preserving those conventions should work without separate integrations. Report a specific incompatibility for an editor exposing no usable rendering anchor rather than replacing it. Suggestions are faint placeholders in an empty composer and enter the draft only through Tab. Follow composer replacements automatically, with no load-order requirement and no dependency on another package.
6. **Tool execution:** retain the conversation's tool history and declarations as context, but make prediction generation a model request without executing new tools. A tool request does not become a suggested follow-up.
7. **Generation and dismissal:** attempt once after a successful, fully settled response and when returning to an eligible completed thread. Show only for an empty composer without an active completion or dialog. Typing hides the retained suggestion; Escape dismisses it for that source turn; Tab inserts it without submitting. Invalidate on a new turn, session change, or model change. Do not generate after an aborted or failed response, and do not automatically retry failed prediction calls.

## Repository standards applied to this package

The review covers all eight package READMEs and manifests, the root development and release setup, and implementation paths for registration, settings, editor transactions, native adapters, and cleanup. Existing package-specific behavior is precedent to assess, not a requirement to copy. In particular, the older attachment installation-order limitation does not apply to this package.

| Area                   | Requirement for the new package                                                                                                                                                                                                                                                                                                                                 | Existing evidence                                                                                                                    |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Package boundary       | A `packages/pi-*` directory, source-loaded ESM TypeScript, a default extension registration function in `src/index.ts`, and `pi.extensions` pointing at it. No runtime, type, optional, or peer dependency on a sibling package.                                                                                                                                | All package manifests; `pi-quote/src/index.ts`; `pi-copy` specification                                                              |
| Dependencies and build | Node.js 24+, Pi/TUI peers matching the repository's `^1.1.0` floor, exact development dependency versions, and the shared strict NodeNext TypeScript configuration. Use the existing workspace and tools; no new build step or settings framework.                                                                                                              | Root `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`; `pi-quote/package.json` and `tsconfig.json`                        |
| Source organization    | Keep registration and lifecycle wiring in `index.ts`. Separate model/prediction work, settings, and any necessary native adapter by responsibility. Keep the verified prompt in a plainly readable source file with its source version and capture metadata; do not hide it in a minified bundle, remote fetch, or generic configuration layer.                 | `pi-composer/src/index.ts`, `pi-attachments/src/settings.ts`, `pi-quote/src/native-adapter.ts`, `pi-codex-tools/src/contract.json`   |
| Native ownership       | Use public Pi services first. The active composer owns edits, selection, undo, completion, history, and submission. Displayed suggestions remain absent from real drafts, saved sessions, and provider input until accepted and submitted.                                                                                                                      | ADRs 0001–0003; `pi-quote` and `pi-copy` implementation boundaries                                                                   |
| Settings and errors    | Native `SettingsList`, `getSettingsListTheme()`, and `ctx.ui.custom()` in a package command. Persist only package preferences under Pi's active agent directory; use Pi's existing model registry and credentials. Validate stored values, save atomically, retain the last saved value on a failed write, report errors, and reload manual edits on `/reload`. | `pi-attachments/src/settings.ts`; Pi's tools and preset extension examples                                                           |
| Lifecycle              | Attach terminal UI only in `tui` mode. Scope subscriptions, timers, async work, and rendering hooks to the current session/adapter. Cancel and dispose before session replacement, reload, or shutdown. A late prediction cannot update a new session or a changed draft.                                                                                       | `pi-quote/src/index.ts`, `pi-copy/src/index.ts`, `pi-skill-references/src/index.ts`, `pi-goal/src/index.ts`                          |
| Composition            | Follow actual active-editor replacements, preserve other adapters, and restore only hooks still owned by this package. Keep both package orders and later replacement as required cases. Do not copy a sibling's private editor type assumptions as a universal editor contract.                                                                                | `pi-attachments/src/editor.ts` replacement observer; `pi-copy/src/native-host.ts` restoration pattern; user's explicit requirement   |
| Product documentation  | Match the centered package title, short benefit statement, useful section links, actual screenshots, local install command, `/reload`, supported versions, settings/keys, behavior, and material limits. Link a package specification. Explain optional companion packages without implying dependencies.                                                       | All package READMEs; especially `pi-quote/README.md` and `pi-copy/README.md`                                                         |
| Distribution           | Include every runtime source/asset, the readable prompt, README, and captured screenshots in the package archive. Add the root package listing and a Changeset following the existing release convention. Verify loading the archive outside the workspace with sibling packages absent.                                                                        | Package `files` fields, `.changeset/independent-selection-quote.md`, `.github/workflows/release.yml`, `pi-quote` verification record |
| Verification           | Reuse `fixtures/native-host.ts` to exercise unmodified Pi with a recording terminal and controlled provider. Use temporary assertion probes for new behavior without adding a committed test suite. Run affected existing checks, typecheck, lint, formatting, and archive/load checks. Report physical-terminal evidence separately.                           | `fixtures/native-host.ts`, `docs/specs/pi-quote.md`, `docs/specs/pi-copy.md`, `.github/workflows/ci.yml`                             |

The small independent packages provide the layout precedent; the new feature does not justify copying attachment recovery machinery, transcript rendering, a shared runtime package, or an additional model/credential manager. Screenshots and compatibility statements must describe the implemented result and actual verification, not a mockup or an untested promise.

## Expected implementation and verification scope

The eventual change should be confined to the new package, its install documentation, workspace lockfile where needed, the root package list, and agreed specification/decision records. The current sibling packages remain independently owned; their source should not need changes merely to expose this feature.

Verify with unmodified Pi in native-only and other-composer installations, including `pi-composer`, both package orders, and composer replacement after startup. The behavior checks need to distinguish painted text from draft content, Tab acceptance from submission, an ordinary edit from a stale asynchronous result, and prediction input from the parent conversation. Cover completion/dialog focus, multicolumn text and terminal width, typing while a request is pending, source-turn/session changes, reload cleanup, model/config errors, and provider context limits. Compatibility claims require runtime evidence for the supported editor contract; native components alone are insufficient.

## Implementation notes

The package is named `pi-predict`, matching the short action names `pi-copy` and `pi-quote`. It predicts the next user message; it does not manage Pi's queued follow-ups. The same name is used by the directory, manifest, `/predict` command, settings file, specification, and release entry. `pnpm view pi-predict name version description --json` returned HTTP 404 from the configured package registry on 2026-10-20. This does not reserve the public npm name; nothing has been published.

The initial context preparation exposed a real mismatch: Pi clears temporary system-prompt overrides before `agent_settled`. The implemented adapter instead observes the public Agent request function, forwards it unchanged, and retains the fully prepared parent context and persisted boundary. It appends the completed response and subsequent projected messages for a live prediction, and uses Pi's complete canonical projection and preparation pipeline for catch-up without an applicable captured request. The controlled-provider probe verifies inheritance of a forced system prompt, final context transformations, tool declarations and results, and Pi's image policy.

The initial temporary probes in `/tmp/pi-followups-reference-20261020/` exercised real installed Pi and `pi-composer`, rather than a replacement host. They covered regular/fullscreen modes and both package orders, actual displayed text versus draft content, Tab/undo/Escape, later replacements, pending requests, dialogs and completions, settings, and provider boundaries. Their synthetic instruction was injected only into those processes and never bundled. Exact commands and results are retained below; the later reference-integration checks use the production prompt unchanged.

At initial verification, the exact reference was unavailable: the app bundle contained the authenticated configuration request but no fallback prompt, an unauthenticated request returned HTTP 401, and the available local authentication did not supply a ChatGPT account session for that endpoint. Computer Use also denied inspection of Codex's own UI. The user subsequently supplied the configuration recorded above; no credentials are needed in the package.

## Recorded implementation verification

These results were established before the to-spec publication. They are retained here so the specification can describe the behavioral contract without embedding temporary probe paths or command transcripts.

These initial checks used `fixtures/native-host.ts` with installed Pi/TUI 1.1.0, real extension registration, real editor input, a recording terminal, and a controlled local provider. Temporary assertion probes exercised the new behavior without adding a committed test suite. Synthetic prediction instructions were injected only into those probe processes; the production prompt was still unset at that stage.

The probes cover both installation orders, later replacements, plain Tab, release events, undo, Escape, typing, pending results, session changes, catch-up, renderer changes, Unicode width, native autocomplete, pastes, dialogs, settings search and persistence, failed writes, malformed settings, unavailable models, tools, image policy, request-time system overrides, invalid model output, provider failures, and no-retry behavior.

Results recorded on 2026-10-20 with Node.js 26.8.1 and Pi/AI/TUI 1.1.0:

| Check                                                                    | Result    |
| ------------------------------------------------------------------------ | --------- |
| New behavior, lifecycle, and provider-boundary probes                    | 34 passed |
| Existing native-host and composer integration tests                      | 75 passed |
| Packed extension loaded outside the repository, without sibling packages | 2 passed  |
| Workspace typecheck and lint                                             | Passed    |
| Changed-file formatting and `git diff --check`                           | Passed    |

The behavior and regression commands were:

```bash
node --test /tmp/pi-followups-reference-20261020/prediction-behavior-probe.mjs /tmp/pi-followups-reference-20261020/prediction-lifecycle-probe.mjs /tmp/pi-followups-reference-20261020/prediction-boundary-probe.mjs
node --test test/native-host.test.ts packages/pi-composer/test/completions.test.ts packages/pi-composer/test/native-editor-actions.test.ts packages/pi-composer/test/mixed-composition.test.mjs packages/pi-composer/test/session-drafts.test.ts
pnpm run typecheck
pnpm run lint
```

`pnpm pack --pack-destination /tmp/pi-predict-dist-20261020` from the package directory produced `pi-predict-0.1.0.tgz`, containing its manifest, all five runtime source files, README, and both screenshots. A separate project at `/tmp/pi-predict-install-20261020` installed that archive and Pi/AI/TUI 1.1.0. `node --test standalone.test.mjs` there passed both checks: the unchanged archive loads settings and reports the missing prompt before a prediction request; a separate extracted copy with a synthetic instruction displays and accepts a prediction in vanilla Pi. The installed archive and production prompt stayed unchanged.

The initial standalone host failed before extension loading because Pi 1.1.0's dependency range selected `pi-codemode` 1.2.0, which lacks an export required by that Pi release. The passing standalone check pins this host dependency to 1.1.0, matching the repository lockfile. This is a Pi dependency limitation, not an added dependency or override in `pi-predict`.

Documentation images are rasterized from actual recorded Pi frames with a controlled response. Physical-terminal keyboard delivery, later Pi versions, the full repository test suite, and live-provider prediction quality were not checked. Exact prompt comparison was blocked at this stage; the later reference integration resolves it against the supplied file.

## Integration review and verification

On 2026-10-20, the existing work was committed on `codex/pi-predict` as `4b98452`. The review used `git diff 1397934dc136fd472ade2064691ba860635a4189...HEAD`. The implementer and both review subagents failed before starting with an encrypted-output decoding error. Implementation and the Standards and Spec passes therefore continued directly; this was not an independent agent review.

### Standards

No remaining documented-standard violations or actionable baseline smells were found. Package organization, native settings, dependency boundaries, documentation, and release metadata follow the existing extensions. The adapter follows [ADR 0001](../adr/0001-preserve-pi-extension-contracts.md) and its [ADR 0032 exception](../adr/0032-independent-composer-followups.md). The detachment fix preserves another extension's renderer wrapper while making the old prediction wrapper forward without decorating. No shared helper, sibling dependency, installed-Pi edit, or committed test suite was added.

### Spec

Three defects were reproduced and fixed in `1741bf8`:

- **Editor restoration:** the spec requires “leave inactive wrappers forwarding native behavior when another extension has wrapped them.” An old render wrapper could decorate again when Pi restored its native editor. The watermark remained visible but Tab did not accept it. The [adapter](../../packages/pi-predict/src/native-adapter.ts) now deactivates each render attachment independently. Regular and fullscreen reproductions both pass.
- **Compaction context:** the spec requires “Respect the active branch and existing compaction.” A retained last-request boundary could keep the old full history and omit Pi's new summary. [Lifecycle handling](../../packages/pi-predict/src/index.ts) now clears the captured request after compaction, so context preparation uses the canonical projection. The provider-boundary assertion verifies the new summary, retained tail, and absence of summarized history.
- **Compaction cancellation:** the spec requires “cancel pending requests and scheduled work on … compaction.” Cancellation previously waited for the finished compaction event. The before-compaction handler now cancels immediately; the provider's signal is aborted while summary generation is still pending.

At this review stage, one requirement remained blocked: “bundle the exact verified remote prompt, prompt version, capture date, content hash, and configured reasoning override in readable source.” The prompt reference was unset, so generation failed before a provider request. Neither local issue was resolved until the later reference integration below.

At that stage, Standards had no remaining findings; Spec had three defects fixed and one unresolved prompt prerequisite.

### Final checks

The four new assertions first failed on their specific pre-fix behavior and passed after correction. The integration checkout then passed all 38 temporary feature probes, all 75 existing host/composer regressions, workspace typecheck, lint, and scoped formatting. Commands:

```bash
node --test /tmp/pi-followups-reference-20261020/prediction-behavior-probe.mjs /tmp/pi-followups-reference-20261020/prediction-lifecycle-probe.mjs /tmp/pi-followups-reference-20261020/prediction-boundary-probe.mjs /tmp/pi-followups-reference-20261020/prediction-review-probe.mjs
node --test test/native-host.test.ts packages/pi-composer/test/completions.test.ts packages/pi-composer/test/native-editor-actions.test.ts packages/pi-composer/test/mixed-composition.test.mjs packages/pi-composer/test/session-drafts.test.ts
node_modules/.bin/tsc --noEmit -p tsconfig.json
node_modules/.bin/oxlint --deny-warnings .
node_modules/.bin/oxfmt --check packages/pi-predict/src
git diff --check
```

The managed implementation worktree used symlinks to existing dependencies for checks. Its commit hook attempted dependency installation and refused the linked directory. The verified patch was applied to the integration checkout, where the normal lint and formatting commit hooks passed; no hook was bypassed.

`pnpm pack --pack-destination /tmp/pi-predict-review-dist-20261020` produced the updated archive. All nine files were compared with current package source: eight matched byte for byte, and the manifest matched after JSON parsing. The archive was extracted into `/tmp/pi-predict-review-install-20261020`, using the previous isolated Pi 1.1.0 host and its pi-codemode 1.1.0 pin without another dependency installation. `node --test standalone.test.mjs` passed both unchanged-archive and separate synthetic-copy checks. Production prompt data remained unset, and the archive loaded without sibling packages.

## Reference integration (2026-10-20)

The supplied version 5 prompt and high reasoning setting are now bundled on `main`. Assertions compare the prompt, version, reasoning, hash, and complete schema suffix with the supplied configuration and inspected client contract. The required-data guard remains in place. The READMEs and release entry no longer describe a missing-prompt preview, and both local completion issues are resolved.

The existing four probe files were copied to `/private/tmp/pi-predict-reference-20261020-fopf3v7c`, with their synthetic prompt overrides removed and reference comparisons added. A fifth probe verifies that a separately selected reasoning-capable Pi model receives `reasoning_effort: "high"`, the exact instruction, and `tool_choice: "none"`, while the parent session and input stay unchanged. All 39 cases passed with Node.js 26.8.1 and Pi/AI/TUI 1.1.0. This includes native Pi, both composer orders and layouts, later replacements, watermark and Tab behavior, complete context, lifecycle, settings, and provider failures.

The packed `pi-predict-0.1.0.tgz` contains the same nine files as the package: eight match byte for byte, and its manifest matches after JSON parsing. It was extracted unchanged into that temporary directory's `standalone` subdirectory, using the earlier isolated Pi dependencies and their pi-codemode 1.1.0 pin. Both standalone checks passed without sibling packages: reference/archive equality, and real-host generation, display, Tab acceptance without submission, and settings access. No synthetic instruction was used. Provider responses remained controlled local fixtures.

Commands run from the repository root unless a working directory is noted:

```bash
node --test --test-concurrency=1 /private/tmp/pi-predict-reference-20261020-fopf3v7c/*-probe.mjs
pnpm run typecheck
pnpm exec oxlint --deny-warnings packages/pi-predict/src
# From packages/pi-predict:
pnpm pack --pack-destination /private/tmp/pi-predict-reference-20261020-fopf3v7c/dist
# From /private/tmp/pi-predict-reference-20261020-fopf3v7c/standalone:
node --test standalone.test.mjs
```

Typecheck, scoped lint, changed-file formatting, and `git diff --check` passed. The local Pi installation already resolves its editable package entry to this repository's `packages/pi-predict`; `/reload` loads the bundled reference. No dependency, runtime API, committed test suite, or production testing seam was added. Physical-terminal keyboard delivery, later Pi versions, and live-provider prediction quality remain unverified. The full repository suite was not run; the earlier 75 host/composer regressions were not repeated for this reference-only runtime change.

## Reasoning preferences (2026-10-20)

The user clarified that `/predict` must expose reasoning effort as well as the model. The native settings dialog now offers an independent effort preference, defaulting to the reference's high value. `reasoning: null` or an absent field preserves that default in `pi-predict.json`. The picker uses Pi's `getSupportedThinkingLevels()` for the selected model; display and requests use `clampThinkingLevel()` to adapt saved preferences when model capabilities differ. The original preference survives model changes. The reference prompt, version, and hash are unchanged.

Three focused assertions passed through the existing real-Pi host: native model/effort selection, persistence and reload with outgoing low/off/default requests; model-supported choices and capability adjustment; and legacy files, invalid values, and failed saves. They verify that the conversation's model, effort, history, and draft stay unchanged. All 39 existing prediction checks then passed, including native Pi, both composer orders, replacements, watermark rendering, and Tab acceptance. The updated settings screenshot was rendered from the actual recorded light-theme frame and visually inspected.

The updated archive passed both standalone checks with the existing isolated Pi 1.1.0 host and its pi-codemode 1.1.0 pin. All package files match the source. The extension loaded without sibling packages, displayed and accepted a suggestion, and saved an `off` effort through the native dialog without submitting or altering the accepted draft. Commands:

```bash
# From /private/tmp/pi-predict-reasoning-20261020-kqp38v21:
node --test reasoning-settings-probe.mjs
node --test --test-concurrency=1 prediction-behavior-probe.mjs prediction-lifecycle-probe.mjs prediction-boundary-probe.mjs prediction-review-probe.mjs reference-reasoning-probe.mjs
# From packages/pi-predict:
pnpm pack --pack-destination /private/tmp/pi-predict-reasoning-20261020-kqp38v21/dist
# From /private/tmp/pi-predict-reasoning-20261020-kqp38v21/standalone:
node --test standalone.test.mjs
```

Workspace typecheck and scoped lint passed. No dependency, committed test, production testing seam, or sibling-package source changed. Provider responses remained controlled local fixtures; physical-terminal input, later Pi versions, and live-provider quality remain unverified. No full repository test run or registry publication was performed.
