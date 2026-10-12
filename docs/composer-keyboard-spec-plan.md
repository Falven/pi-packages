# Ghostty keybinding setup and page selection

The requirements are published in the local Markdown tracker as part of the [composer specification](specs/pi-composer.md), with triage `ready-for-agent`. [ADR 0010](adr/0010-explicit-terminal-keybinding-setup.md) records the single-block setup decision. The root ADR sequence and package-specific specs remain the documentation structure.

## Implementation scope

| Work                            | Contract and current state                                                                                                                                                                                                                                                                               |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Page selection                  | Implement the [page-selection contract](specs/pi-composer.md#page-selection) through effective native page actions and the existing shared draft, selection, and projection. The current page handler does not extend a selection.                                                                       |
| Ghostty setup                   | Implement the [command and configuration lifecycle](specs/pi-composer.md#ghostty-keybinding-setup). Installation first requires a demonstrated [pre-write verification method](specs/pi-composer.md#verification-boundary); unverified configurations remain unchanged.                                  |
| Public-host acceptance          | Extend existing native command/editor/session checks with the spec's [setup and page-selection cases](specs/pi-composer.md#setup-and-page-selection-acceptance). Existing native editing coverage remains recorded in the [keyboard verification record](../.scratch/composer-keyboard/verification.md). |
| Physical acceptance             | Follow the [terminal procedure](terminal-checks.md), recording baseline, explicit installation, physical input, and removal/reload separately.                                                                                                                                                           |
| Delivered-feature documentation | Update the [composer README](../packages/pi-composer/README.md) and [library integration notes](pi-composer-library-integration.md) with implemented commands, supported configuration shapes, and verified limits when implementation is complete.                                                      |

The companion paste, attachment, and skill-reference specifications retain their behavior and package ownership. Combined acceptance uses their existing native interfaces.

## Verification evidence

Ghostty 1.3.1, build 15212, was inspected. The local Pi launcher uses Pi 1.1.0; workspace fixtures use Pi 1.0.2. Candidate syntax and all eight forwarding sequences' Pi decoding have been checked. These results do not establish physical forwarding or proposed binding precedence across all configurations.

Ghostty's candidate validator and current-binding inspectors do not provide an arbitrary prospective effective-configuration query. The [specification](specs/pi-composer.md#verification-boundary) therefore requires proof of the supported verification cases before installation; inspection of current settings alone cannot pass that gate.

The user reports failure for Cmd+A, Cmd+Enter, Cmd+Up/Down, Cmd+Z/Shift+Z, and Shift+Fn+Up/Down. Cmd+Shift+Up/Down works, and Cmd+C appears to work. A delivered Shift+PageDown check separately reproduced the editor's missing selection behavior. Implementation and real terminal acceptance remain pending; these documentation changes modify no live terminal settings.
