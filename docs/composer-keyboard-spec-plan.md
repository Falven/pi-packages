# Ghostty keybinding setup and page selection

This plan defines the next amendments to the [composer specification](specs/pi-composer.md). [ADR 0010](adr/0010-explicit-terminal-keybinding-setup.md) records the terminal setup decision; the command and Shift-page selection still require implementation. Existing native editing coverage is recorded in the [keyboard verification record](../.scratch/composer-keyboard/verification.md).

The governing contracts remain [native Pi interoperability](adr/0001-preserve-pi-extension-contracts.md), [one draft owner](adr/0002-one-editor-owns-draft-transactions.md), and [native action precedence](adr/0009-pi-composer-native-editing-actions.md).

## Command and configuration contract

`pi-composer` owns `/setup-keybinds ghostty`. Use Pi's existing command registration and native confirmation UI to show the target file, eight affected shortcuts, and their persistent effect outside Pi before installation. Cancellation leaves the configuration unchanged. `/setup-keybinds ghostty remove` removes the unmodified managed block after review.

Setup appends this single block to the existing configuration:

```ini
# BEGIN pi-composer keybindings
keybind = super+a=csi:97;9u
keybind = super+enter=csi:13;9u
keybind = super+arrow_up=csi:1;9A
keybind = super+arrow_down=csi:1;9B
keybind = super+z=csi:122;9u
keybind = super+shift+z=csi:122;10u
keybind = shift+page_up=csi:5;2~
keybind = shift+page_down=csi:6;2~
# END pi-composer keybindings
```

These rules forward Cmd+A, Cmd+Enter, Cmd+Up/Down, Cmd+Z/Shift+Z, and Shift+PageUp/PageDown with their original key identities. Under the composer's defaults they select all, submit explicitly, move to logical line boundaries, undo/redo, and extend selection by one composer page. Shift+Fn+Up/Down supplies the last two gestures on the user's Mac keyboard.

The configuration lifecycle must satisfy these requirements:

- Resolve the existing configuration Ghostty actually loads. Account for the macOS Application Support and XDG roots, modern `config.ghostty` and legacy `config` filenames, and included files. Report an ambiguous or unsupported configuration without modifying it.
- Preserve existing settings and surrounding bytes. Create no backup. Repeated setup with the intact block makes no write; an ineffective existing block produces a diagnostic instead of another copy.
- Before installation, validate the proposed configuration with Ghostty and establish the eight effective bindings without changing the live file. A conflicting include, invalid configuration, unavailable verification, or concurrent configuration change leaves the file unchanged. Identify a conflicting shortcut when the evidence establishes one; distinguish a conflict from an inability to verify.
- Remove only the exact managed block and validate the remaining configuration. A missing block is a no-op. An edited, incomplete, or duplicated block requires manual resolution. Removal preserves edits outside the block and does not reconstruct prior settings from a saved copy.
- Preserve the file's permissions and avoid truncating it during replacement. Confirm the reviewed contents have not changed before writing.
- Tell the user to reload Ghostty configuration after installation or removal, using its existing reload action. Record configuration inspection separately from physical key delivery.

Forwarding leaves Pi's configured action ownership intact. Native actions and accepted extension shortcuts still take precedence; explicit Pi overrides continue to suppress corresponding composer aliases. Setup does not modify Pi's keybinding configuration. The eight rules leave working Cmd+C and Cmd+Shift+Up/Down bindings alone.

## Ghostty validation constraint

Ghostty loads included files after the containing configuration, so appending a block does not guarantee precedence. An include originating in the XDG root can override a direct binding in the macOS root. The [native configuration reference](https://ghostty.org/docs/config/reference#config-file) documents deferred include loading.

In Ghostty 1.3.1, `+validate-config --config-file=<candidate>` validates that candidate and its includes. It does not load the other default roots. `+list-keybinds --plain` and `+show-config` inspect the current effective configuration, but neither accepts a candidate-file argument. Their [list-keybinds](https://github.com/ghostty-org/ghostty/blob/v1.3.1/src/cli/list_keybinds.zig), [show-config](https://github.com/ghostty-org/ghostty/blob/v1.3.1/src/cli/show_config.zig), and [validate-config](https://github.com/ghostty-org/ghostty/blob/v1.3.1/src/cli/validate_config.zig) implementations establish these limits.

A supported way to establish the proposed effective bindings without changing live settings is therefore an implementation prerequisite. The spec revision must identify which configuration shapes can be verified; uncertain include trees require manual resolution. Syntax validation and inspection of current bindings alone do not prove the proposed result. A temporary live installation followed by rollback would violate the pre-write contract.

## Composer page selection

Extend the current native page-action handling to use the shared selection and projection machinery in both formatted and source views:

- Shift plus an effective `tui.editor.pageUp` or `pageDown` binding extends from the existing anchor by the current visible composer page height. Use visual rows and preserve the preferred display column across short or wrapped rows.
- Resolve a configured action on the full chord first. Otherwise derive Shift selection from the effective page binding. Remapping or clearing a page action removes selection shortcuts derived from its old bindings.
- Keep whole graphemes and valid source positions, including formatted Markdown, tabs, combining characters, and wide characters. Clamp at the first or last available row.
- Repeated movement extends the same selection; opposite movement contracts it. Redraw, resize, and view changes preserve its source range. Movement creates no content edit; typing over the selection and undo use the existing shared history.
- Preserve Pi's fullscreen viewport ownership of unmodified page keys and all higher-priority native UI and extension handling.

The [current page handler](../packages/pi-composer/src/source-editor.ts) recognizes native page actions but always moves without extending selection. Forwarding Shift+PageUp/PageDown therefore requires this editor correction as well as terminal setup. The existing [page-action checks](../packages/pi-composer/test/jump-page.test.ts) supply the public-host harness.

## Documentation amendments

| Document                                                                                                                 | Required amendment                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [ADR 0010](adr/0010-explicit-terminal-keybinding-setup.md) and [architecture](architecture.md)                           | Record explicit, persistent setup owned by the composer, one removable block, unchanged settings on conflict, and native action precedence. These decisions are recorded now.                                                                                                                                                                                 |
| [Composer specification](specs/pi-composer.md)                                                                           | Add setup, removal, and page-selection user stories. Specify command review, cancellation, path resolution, validation limits, conflict/no-write behavior, repeat setup, and edited-block handling. Extend native paging and dispatch requirements and add the acceptance cases below. Distinguish existing editing coverage from these pending capabilities. |
| [Paste](specs/pi-paste.md), [attachments](specs/pi-attachments.md), and [skill references](specs/pi-skill-references.md) | Keep their current behavior and ownership. Update their shared ADR link; verify coexistence through the composer integration checks.                                                                                                                                                                                                                          |
| [Composer README](../packages/pi-composer/README.md)                                                                     | Document the two command forms, page selection, persistent effects outside Pi, reload/removal, native overrides, and configurations setup cannot verify. Publish feature claims when implementation is complete.                                                                                                                                              |
| [Terminal checks](terminal-checks.md)                                                                                    | Separate unchanged-configuration baseline, explicit installation, physical verification, and removal/reload. State that configured forwarding persists outside Pi and keep those checks distinct from Pi's input handling.                                                                                                                                    |
| [Library integration notes](pi-composer-library-integration.md)                                                          | Document reuse of native command/confirmation, keybinding resolution, projection, and selection facilities where the implementation needs clarification.                                                                                                                                                                                                      |

The next specification pass should settle the verifiable configuration boundary before producing implementation tickets. The root ADR sequence and package-specific specs remain the documentation structure.

## Acceptance plan

Use the existing public Pi command/editor/session boundary and temporary configuration fixtures. The implementation checks should establish:

- Preview and cancellation cause no writes; successful setup preserves surrounding settings; repeated setup makes no write; removal restores the original surrounding bytes while retaining unrelated later edits.
- Ghostty validates the candidate, and effective-binding verification accounts for every loaded root and include. Cover an overriding include, an unrelated include, both default roots, and modern/legacy filename selection. Unsupported verification must return without a live change.
- Invalid configuration, unavailable Ghostty, changed contents during review, and edited or malformed managed blocks produce a clear failure without overwriting user data.
- All eight forwarded sequences decode as intended through Pi. A configured native action or accepted extension shortcut owns its chord exactly once.
- Shift-page selection works in both views across short, wrapped, formatted, and Unicode rows; retains its anchor and preferred column; clamps at boundaries; survives redraw/resize; and supports replacement followed by undo.
- Remapped and cleared native page actions control derived selection shortcuts. Fullscreen viewport paging and focused pickers retain their native behavior.

Real Ghostty/macOS acceptance must record terminal version, Pi version, effective configuration, gesture, delivered input where observable, and visible result. Verify all eight shortcuts after explicit installation and reload. Recheck Cmd+C and Cmd+Shift+Up/Down, confirm the documented persistent behavior in the shell and another application, then remove the block and reload to verify restoration of the pre-existing bindings.

## Current evidence

The inspected terminal is Ghostty 1.3.1, build 15212. The local Pi launcher uses Pi 1.1.0; workspace fixtures use Pi 1.0.2. Candidate syntax and all eight sequences' Pi decoding have been checked. These checks do not establish physical forwarding or candidate precedence across all configurations.

The user reports that Cmd+A, Cmd+Enter, Cmd+Up/Down, Cmd+Z/Shift+Z, and Shift+Fn+Up/Down fail; Cmd+Shift+Up/Down works, and Cmd+C appears to work. These observations refine the baseline in the [terminal procedure](terminal-checks.md).

A delivered Shift+PageDown check also reproduced the composer gap independently of Ghostty: from column three of `row0` in a nine-row draft, typing after the gesture changed `row0` instead of replacing the intended selection through `row7`. The command is not implemented, and this documentation update changes no live terminal settings.
