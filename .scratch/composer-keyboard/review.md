# Keyboard review

Review baseline: `68f09ca2cdbba9c258086c2680226eecfbec23e4`. Initial reviewed tip: `121634a1e70e7ded259d3da9c8282367f1f04164`.

The review found one Standards issue and two Spec issues. All three are resolved and covered by public-host regressions. No code-smell or scope-creep findings were reported.

## Standards

**P2: Preserve native action precedence on overlapping bindings.** [ADR 0001](../../docs/adr/0001-preserve-pi-extension-contracts.md) requires “preserving native dispatch.” Binding backward word deletion to Left moved the composer caret instead of deleting the word, unlike locked Pi 1.0.2. The existing branches now follow native editor order, including copy before undo, deletion before yank/history/movement, and native precedence within movement and deletion groups. [Native binding tests](../../packages/pi-composer/test/native-keybindings.test.ts) pass all 18 cases, including eight collision regressions.

## Spec

**P2: Protect delayed clipboard results through the raw Cmd+V alias.** The [composer specification](../../docs/specs/pi-composer.md#binding-and-dispatch) requires the alias to preserve the supplied handler, while [paste requirements](../../docs/specs/pi-paste.md#implementation-decisions) require the intended insertion target and recoverable content. A direct callback invocation by the paste decorator bypassed request protection. The composer now guards its public clipboard callback, preserving its receiver, later replacement, and the original request when a decorator awaits before calling a saved handler. [Paste binding tests](../../packages/pi-paste/keybindings.test.mjs) cover both native and raw input in both decorator orders; 54 clipboard/paste checks pass.

**P2: Retain Markdown in source order across consecutive deletions.** The [composer specification](../../docs/specs/pi-composer.md#native-editing-behavior) requires retained text to accumulate in source order. Deleting `bc` and then `a` from `**abc**` previously yanked `**a**bc`. Deletions now retain actual source ranges and merge them against the original draft, preserving delimiter placement and repeated text. An extension rewrite ends accumulation. [Yank tests](../../packages/pi-composer/test/native-yank.test.ts) cover both directions, repeated words, and undo; all 38 deletion/yank checks pass.

## Verification

The complete suite passes 606 tests on Node 24.13.1 with Pi 1.0.2; none failed, skipped, or remained todo. Formatting, lint, root and composer typechecks, and diff checks pass. See the [verification record](verification.md) for commands, coverage, and the unchanged physical acceptance gate.

Physical Ghostty/macOS acceptance remains pending because the computer-use tool denied access. Terminal settings remain unchanged.
