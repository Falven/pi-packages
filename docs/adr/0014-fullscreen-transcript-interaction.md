# Target native fullscreen chat interaction

The complete disclosure interaction targets Pi's fullscreen mode with keyboard access to every disclosure and supplementary mouse interaction, preserving [Pi's ownership of input and terminal behavior](0001-preserve-pi-extension-contracts.md) and ordinary terminal scrolling without rewriting terminal-owned scrollback. Pi's global tool-expansion action controls render groups and their activity bodies, while group-only toggles preserve child activity-body disclosure choices and the enclosing agent activity disclosure remains independent. Manual disclosure choices stay in memory, survive redraws and resizing, and reset on application restart or extension reload.

## Consequences

The [owned chat view](0022-native-rows-in-an-owned-transcript.md) manages selection in occurrence and rendered-row coordinates across its logical viewports, while reusing Pi's input decoding, effective keybindings, clipboard transport, and overlay focus restoration. One shortcut registered through Pi transfers focus from the composer to the nearest visible disclosure; configured selector up/down actions move between disclosures, confirm toggles the focused disclosure, and cancel returns focus to the current composer. Native overlays retain their focus priority, and the shortcut does not open another view or require a slash command.

Installed Pi 1.0.2 and source checkout 1.1.0 provide programmatic focus but no keyboard traversal from the composer to individual chat controls: Tab handles completion, Shift+Tab cycles thinking level, and viewport actions scroll without moving focus. The accepted focus shortcut supplies that missing entry interaction while retaining Pi's existing focus and keyboard mechanisms.
