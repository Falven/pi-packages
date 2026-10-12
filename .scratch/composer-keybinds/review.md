# Keybinding setup review

Review baseline: `ec70a941d31202819de7d4c6f4bf4665491b0183`. Reviewed runtime revision: `ff58984d378fa4b2bc7c3c680f3dd5ea21d40073`.

Draft-boundary follow-up reviewed from `3425b65` through `d909ea17cbfd01306216c46f7be5b6a7cbf4f7df`.

## Standards

No documented-standard violations or actionable code smells remain. The fixture cleanup finding is resolved: process overrides and temporary files are restored even when host initialization fails, while host shutdown still precedes directory removal. Public-host tests cover both initialization outcomes and cleanup order.

The reviewer checked the final diff and configuration verification boundaries. The implementation preserves existing Pi contracts, file ownership and mode, and the same-user requirement for the selected Ghostty process. Native verification failures stop setup before writing.

The navigation follow-up reuses the existing document projection, movement, and fallback matching. Native movement and its derived Shift selection retain priority. No additional configuration surface or terminal changes were introduced.

Standards findings: **0**. Highest unresolved severity: **none**.

## Spec

No implementation findings remain. Setup verifies the native U.S. input source and layout, rejects physical-binding conflicts and modifier remapping, and repeats those checks before replacement. Removal remains available when keyboard conditions change. ACL-bearing files are refused so atomic replacement cannot discard their access restrictions.

Command description and help now refer to terminals, with `ghostty` as the sole supported option. Ancestor discovery crosses the root-owned macOS login process while requiring Ghostty itself to share Pi's user. The reviewer independently reran the original public-command ancestry regression; it passed.

The navigation follow-up reaches the draft's editable boundaries in both views and preserves the Shift anchor, undo history, and native/extension ownership. Cmd+Left/Right remain native line aliases. The user's reported working shortcuts remain distinct from physical acceptance of the correction.

Spec findings: **0**. Highest unresolved severity: **none**.

## Verification

The [verification record](verification.md) reports 684 passing tests, required static checks, four native checks using read-only inspection or temporary configuration, and successful loading of all four local source packages through installed Pi 1.1.0. Reviewers inspected that evidence without repeating the full suite.

[Ticket 03](issues/03-verify-keybindings-in-ghostty.md) remains open for physical acceptance. The computer-use tool denied Ghostty access; live installation, reload, removal, and keyboard gestures remain unobserved. No live terminal settings changed.
