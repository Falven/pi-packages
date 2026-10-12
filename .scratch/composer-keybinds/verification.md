# Keybinding setup and page-selection verification

Automated acceptance passes all 655 tests. Setup, page selection, and combined editing work through the public Pi host. Physical Ghostty acceptance remains pending in [ticket 03](issues/03-verify-keybindings-in-ghostty.md); installation, reload, forwarding, and removal in an actual Pi terminal have not been observed.

## Environment

- Runtime integration baseline: `ef6b32f501d9c4185a0161794a1c1bf10d621420`; documentation tip `706a1ff4c029bd776643b7b78fabfc7cb15c719e` was merged before final validation. The tested tree includes the acceptance tests recorded below.
- Automated host: Pi and pi-tui 1.0.2 from the workspace lockfile.
- Full-suite runtime: Node 24.13.1. Package manager: pnpm 12.7.0.
- Installed physical target: macOS 27.0.1 (26A434), Ghostty 1.3.1 stable (15212).
- Separate local source-loading check: installed Pi 1.1.0 on Node 24.13.1.

## Automated acceptance

Tests load the actual extension factories through Pi and observe the public command, editor, and session boundaries. They deliver terminal input, inspect exported Markdown and rendered output, observe model requests, and read retained files. The terminal, local model server, clipboard, and setup process-inspection boundary are controlled fixtures; these checks do not establish physical input delivery.

| Behavior                                                                                                                                                                                                              | Evidence                                                                                                                                                                                                                               |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| All eight delivered identities, effective native bindings, alias suppression, extension priority, and one-operation dispatch                                                                                          | [Native keybindings](../../packages/pi-composer/test/native-keybindings.test.ts), [editor actions](../../packages/pi-composer/test/native-editor-actions.test.ts), [page selection](../../packages/pi-composer/test/jump-page.test.ts) |
| Visible-page selection in both views, anchor retention and reversal, configured or cleared page actions, wrapping, Unicode, resizing, and history                                                                     | [Page selection](../../packages/pi-composer/test/jump-page.test.ts), [clipboard selection](../../packages/pi-composer/test/clipboard.test.ts)                                                                                          |
| Native setup review and cancellation, temporary installation and repeat, removal and repeat, preservation of unrelated bytes and permissions, unsupported configurations, verification failures, and concurrent edits | [Setup command](../../packages/pi-composer/test/setup-keybinds.test.ts)                                                                                                                                                                |
| Setup confirmation while all four packages share a selected draft; native UI ownership, delayed preview refresh, view changes, paste replacement, undo/redo, and retained snapshot bytes                              | [Native UI selection](../../packages/pi-composer/test/native-ui-selection.test.mjs)                                                                                                                                                    |
| Four-package submission, supported decorator orders, custom pickers, native and extension binding ownership, clipboard routes, skill instructions, input transformations, and stable attachment membership            | [Mixed composition](../../packages/pi-composer/test/mixed-composition.test.mjs)                                                                                                                                                        |

The two added combined cases run in formatted and source views. A page selection spans Markdown, Unicode, an image attachment reference, and explicit skill text. While the native setup confirmation owns input, another page gesture leaves the draft selection intact and an image read completes. Cancellation preserves the temporary configuration. Confirmation writes the expected block without a model submission. Replacing the selected range through public paste removes its attachment membership; undo restores the exact draft, selected range, and preview, while redo removes them again. Snapshot bytes remain unchanged.

The first combined attempt mixed file-loaded companion extensions with a supplied composer factory. Pi loads those files before supplied factories, so the later replacement composer discarded their editor decoration and attachment insertion could not confirm its draft. This was a harness-order failure before setup or paging ran. The corrected fixture loads `pi-composer`, `pi-paste`, `pi-attachments`, and `pi-skill-references` as factories in the same order as the existing file-based mixed fixture. The mixed suite also covers exchanging paste and attachment order. A replacement composer loaded after decorators remains outside that supported ordering; no runtime change or broader ordering guarantee was introduced.

### Checks

| Command                                                                                               | Result                                          | Retained local log                               |
| ----------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------ |
| `/Users/fran/.nvm/versions/node/v24.13.1/bin/node --test`                                             | 655 passed; 0 failed, skipped, or todo          | `/tmp/pi-composer-keybinds-node24-tests.log`     |
| Focused combined setup-confirmation cases                                                             | 2 passed; included in the full suite            | `/tmp/pi-composer-keybinds-combined-focused.log` |
| `/Users/fran/.nvm/versions/node/v24.13.1/bin/node --test packages/pi-composer/test/jump-page.test.ts` | 31 passed after the test-only typing correction | `/tmp/pi-composer-keybinds-page-after-types.log` |
| `pnpm run format:check`                                                                               | Passed                                          | `/tmp/pi-composer-keybinds-format-check.log`     |
| `pnpm run lint`                                                                                       | Passed                                          | `/tmp/pi-composer-keybinds-lint.log`             |
| `pnpm run typecheck`                                                                                  | Passed                                          | `/tmp/pi-composer-keybinds-root-types.log`       |
| `pnpm exec tsc --noEmit -p packages/pi-composer/tsconfig.json`                                        | Passed                                          | `/tmp/pi-composer-keybinds-composer-types.log`   |
| `git diff --check`                                                                                    | Passed                                          | `/tmp/pi-composer-keybinds-diff-check.log`       |

The initial package typecheck rejected a readonly empty binding array in the page-selection test table. Using `satisfies` with the public `KeybindingsConfig` type preserves the literal cases and gives the empty binding its required mutable type. The package typecheck and all 31 affected tests pass after that type-only correction. The initial diagnostic remains at `/tmp/pi-composer-keybinds-composer-types-initial.log`. The 655-test full run preceded this type-only edit; no runtime source changed. Local Markdown links in the changed documentation resolve.

## Configuration and loading evidence

| Boundary                                                                         | Observed result                                                                                                                                                                                                        | Limit                                                                                                                            |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Public setup command with temporary files and substituted process/CLI inspection | Review, cancellation, write, repeat, removal, failure, and preservation tests pass                                                                                                                                     | Does not establish actual Pi ancestry, live configuration changes, GUI reload, or physical forwarding                            |
| Native Ghostty 1.3.1 validation and inspection                                   | [Ticket 02](issues/02-set-up-and-remove-ghostty-keybindings.md#verification) records validation of the exact candidate, both Application Support filenames, include precedence, and freshly loaded baseline inspection | Proves the supported single-source loading case; no arbitrary prospective binding inspector or live GUI observation is available |
| Read-only native process-context probe                                           | Ticket 02 records successful same-user Ghostty executable, argument, account, and environment checks                                                                                                                   | Expected context came from the calling shell; an actual Pi-to-Ghostty ancestry match remains unobserved                          |
| Installed local Pi 1.1.0 source loading                                          | At runtime baseline `ef6b32f`, public `DefaultResourceLoader` loaded the four package source entrypoints, returned exactly four extensions with no errors, and registered `setup-keybinds`                             | Temporary cwd, agent directory, and in-memory settings; no interactive command execution or physical input                       |

The local source-loading check used `/Users/fran/Source/pi/packages/coding-agent/dist/index.js`, disabled discovered resources, and supplied the four package directories through `additionalExtensionPaths`. Its temporary directory was removed. Behavior tests remain pinned to workspace Pi 1.0.2.

The setup proof supports Ghostty 1.3.1 on local macOS with exactly one owned, regular Application Support configuration, no XDG configuration files or includes, no extra Ghostty launch arguments, and a matching verified ancestor process. Native candidate validation and a freshly loaded baseline combine with the established loading order and last-binding-wins semantics to prove the eight appended bindings. The optional Darwin `KERN_PROCARGS2` probe is an unstable prerequisite and fails closed when unavailable or mismatched. These limits are documented in the [composer specification](../../docs/specs/pi-composer.md#verification-boundary).

## Physical acceptance

The unchanged-configuration baseline is the user's report: Cmd+A, Cmd+Enter, Cmd+Up/Down, Cmd+Z/Shift+Z, and Shift+Fn+Up/Down fail; Cmd+Shift+Up/Down works, and Cmd+C appears to work. These are reported results, not newly observed checks or proof of a particular input route.

The earlier [keyboard verification](../composer-keyboard/verification.md#physical-acceptance) records the normal computer-use call `let app = await cua.getApp("Ghostty");` returning `Computer Use is not allowed to use the app 'com.mitchellh.ghostty' for safety reasons.` No UI state or gestures were available. This acceptance work did not retry through another control route, change live settings, or infer physical behavior from delivered-input tests.

| Configuration phase and check                                                                                                               | Result  |
| ------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| Unchanged settings: observe all requested gestures and conditional terminal copy/undo states                                                | Pending |
| Live Pi command: verify actual ancestor context, review, cancel, then install and reload Ghostty                                            | Pending |
| Installed block: all eight physical gestures in formatted and source views                                                                  | Pending |
| Installed block: stable selection, wrapping, Unicode, page reversal, replacement/undo, preview refresh, and working Cmd+C/Cmd+Shift+Up/Down | Pending |
| Installed block: native and extension ownership, focused pickers, useful native translations, and one-operation dispatch                    | Pending |
| Installed block: pane changes, external editing, suspend/resume, resource reload, terminal reload, and use outside Pi                       | Pending |
| Removal: review, remove, reload, restore prior bindings, preserve unrelated edits, and repeat without a write                               | Pending |

Follow the [terminal acceptance procedure](../../docs/terminal-checks.md) when physical access is available. Successful temporary writes and native validation do not close these checks. The installed block is explicitly persistent outside Pi until removal and reload; acceptance must evaluate that configuration phase rather than assume automatic scoping.
