# Keyboard verification

Public-host implementation and combined-package acceptance are complete. Physical Ghostty/macOS acceptance remains pending in [ticket 08](issues/08-verify-combined-editing-in-ghostty.md).

## Environment

- Runtime integration baseline: `894b835e3587cbfea1dacf3ddc0cafeed1727125`.
- Tested host: Pi and pi-tui 1.0.2 from the workspace lockfile.
- Full-suite runtime: Node 24.13.1, the supported minimum major. Focused implementation checks also ran on Node 26.8.1.
- Package manager: pnpm 12.7.0. Dependencies installed with `--frozen-lockfile --offline --ignore-scripts`.
- Installed physical target: macOS 27.0.1 (26A434), Ghostty 1.3.1 stable (15212).
- Native behavior reference: Pi 1.1.0 at `6fb2e7815167e6b19006fc526d1a5d0f5f998787`; this is distinct from the tested host.

## Automated acceptance

Tests load the extensions through Pi, deliver input at its public terminal/editor boundary, and observe exported Markdown, rendered output, submissions, retained files, and session drafts. Model responses use a controlled local HTTP server. Clipboard substitutions replace file, image, and text reads at the external boundary; they do not establish physical clipboard delivery.

| Behavior                                                                                                                                                                                                                      | Evidence                                                                                                                                                                                                                           |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Effective native bindings, empty and repeated-default overrides, alias suppression, fixed shortcuts, one-operation dispatch, and undo before completion                                                                       | [Native keybindings](../../packages/pi-composer/test/native-keybindings.test.ts), [native editor actions](../../packages/pi-composer/test/native-editor-actions.test.ts)                                                           |
| Word/line deletion, selected ranges, graphemes, retained Markdown, accumulation, yank/yank-pop, and atomic membership recovery                                                                                                | [Deletion](../../packages/pi-composer/test/native-deletion.test.ts), [yank](../../packages/pi-composer/test/native-yank.test.ts), [attachment yank](../../packages/pi-composer/test/native-yank-attachments.test.mjs)              |
| Logical-line and visual-row boundaries, anchored Shift selection, native history, character jumps, and delivered editor paging                                                                                                | [Navigation](../../packages/pi-composer/test/navigation.test.ts), [jump and page](../../packages/pi-composer/test/jump-page.test.ts)                                                                                               |
| Native/custom picker focus and selection through preview loading, redraw, errors, resize, view changes, restore, and removal                                                                                                  | [Native UI selection](../../packages/pi-composer/test/native-ui-selection.test.mjs)                                                                                                                                                |
| Supplied clipboard handlers, configured input, direct insertion, staged results, late-result recovery, metadata precedence, and native-editor compatibility                                                                   | [Composer clipboard](../../packages/pi-composer/test/native-clipboard.test.ts), [paste keybindings](../../packages/pi-paste/keybindings.test.mjs), [attachment pastes](../../packages/pi-composer/test/attachment-pastes.test.mjs) |
| Four-package composition, supported decorator orders, native/custom completions, text/file/image routes, cutoff, input transformations, membership, skill deduplication, steering/follow-up, recovery, and retained snapshots | [Mixed composition](../../packages/pi-composer/test/mixed-composition.test.mjs)                                                                                                                                                    |

The combined regression edits a formatted selection through a configured deletion action on Cmd+A, confirms that an overridden Cmd+Z alias stays suppressed, and restores the edit through configured undo, fixed redo, and configured yank. Source-view line deletion and yank retain the literal Markdown. Native skill completion and image paste then produce one submission containing one skill instruction block and the preserved image; attached text stays readable on demand.

Two existing Restore Inline setups used Cmd+Up to reach the whole draft's beginning. They now select all and collapse left through public input, keeping their original restoration assertions while Cmd+Up follows its current logical-line contract.

### Checks

| Command                                                                                                               | Result                                                    |
| --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `/Users/fran/.nvm/versions/node/v24.13.1/bin/node --test`                                                             | 589 passed; 0 failed, skipped, or todo                    |
| `node --test packages/pi-attachments/text-actions.test.mjs`                                                           | 35 passed after correcting the two stale selection setups |
| `node --test --test-name-pattern='configured deletion and yank' packages/pi-composer/test/mixed-composition.test.mjs` | Combined regression passed                                |
| `pnpm run format:check`                                                                                               | Passed                                                    |
| `pnpm run lint`                                                                                                       | Passed                                                    |
| `pnpm run typecheck`                                                                                                  | Passed                                                    |
| `pnpm exec tsc --noEmit -p packages/pi-composer/tsconfig.json`                                                        | Passed                                                    |
| `git diff --check`                                                                                                    | Passed                                                    |

The initial full run passed 587 tests and exposed only the two stale document-start setups described above. Their focused suite and the complete rerun pass. Local Markdown links in the changed documentation resolve.

## Physical acceptance

The [terminal procedure](../../docs/terminal-checks.md) remains the acceptance gate. After software verification, the computer-use call `let app = await cua.getApp("Ghostty");` returned: `Computer Use is not allowed to use the app 'com.mitchellh.ghostty' for safety reasons.` The tool supplied no UI state, so no gestures or visual checks ran. No alternate control route was used. All checks below remain unobserved; no physical result is inferred from synthetic input or captured ANSI output.

| Physical check                                                                                               | Result  |
| ------------------------------------------------------------------------------------------------------------ | ------- |
| Cmd+A, Cmd+Enter, Cmd+Up/Down and Shift variants with unchanged effective bindings                           | Pending |
| Cmd+C with and without terminal selection; Cmd+Z/Cmd+Shift+Z with available and unavailable terminal actions | Pending |
| Native translated keys, Option word editing, line/visual boundaries, and selection gestures                  | Pending |
| Clipboard text, actual copied files and images, menu/right-click routes, and cut/copy round trips            | Pending |
| Actual image graphics, preview layout, resize, mouse selection, and focused picker interaction               | Pending |
| Pane changes, external editing, suspend/resume, resource and terminal reload, and exit                       | Pending |

Inspected Ghostty bindings can consume Cmd+A, Cmd+Enter, and Cmd+Up/Down before Pi. Cmd+C and terminal undo/redo have conditional ownership. Those configuration findings identify potential interception; they do not establish which route a physical gesture took in an unperformed check. Terminal settings remain unchanged.

## Public-contract limits

The composer preserves the supplied clipboard handler's route. Pi's default handler can hide text-read errors and deliver copied-file or temporary-image paths as strings. The composer guards results delivered to a composer and retains those strings; it cannot diagnose hidden errors, capture unavailable bytes, or protect an unrelated replacement editor. `pi-paste` owns metadata-aware capture and read-error reporting, while `pi-attachments` owns stable snapshots. See [ticket 06](issues/06-preserve-configured-clipboard-routes.md).

Delivered-input correctness is verified independently of terminal shortcut forwarding. Physical acceptance remains open until the listed gestures and lifecycle checks are observed on the target terminal.
