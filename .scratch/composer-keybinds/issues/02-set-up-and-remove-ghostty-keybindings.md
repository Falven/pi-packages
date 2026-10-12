# 02: pi-composer: set up and remove Ghostty keybindings

**What to build:** A user can review and install the specified eight persistent Ghostty forwarding rules with /setup-keybinds ghostty, then reverse that change with /setup-keybinds ghostty remove. The command changes only one marked block in an existing configuration after verification and native confirmation.

**Blocked by:** None (can start immediately).

**Status:** complete

**Specification:** Composer specification, “Ghostty keybinding setup,” “Verification boundary,” and “Setup and page-selection acceptance,” stories 52–64; ADR 0010, “Make terminal keybinding setup explicit and reversible.”

- [x] First demonstrate a supported method that establishes the complete loading order and all eight prospective effective bindings before changing live settings. Record the target Ghostty version and supported configuration shapes. Candidate syntax validation plus current-binding inspection alone does not pass this gate; temporary live installation followed by rollback does not pass it. If no supported case can be demonstrated, record the blocker and leave installation incomplete.
- [x] Register the command through Pi's public command API. Missing or unsupported arguments produce usage without a write. Use native review, confirmation, and notifications; cancellation or missing interactive confirmation leaves settings unchanged.
- [x] Before confirmation, show the resolved existing target file, all eight shortcuts, and their persistent effect outside Pi until explicit removal and Ghostty configuration reload. Preserve the draft, selection, history, and editor ownership present at handler entry; closing the dialog restores focus without an additional edit or model submission.
- [x] Resolve the configuration Ghostty actually loads, including macOS Application Support and XDG roots, modern and legacy filenames, and include order. Missing or ambiguous targets, unsupported configurations, invalid settings, unavailable verification, and conflicting includes leave all live settings unchanged.
- [x] Use Ghostty to validate the proposed configuration and establish the specified resulting bindings before installation. Report a conflicting shortcut and its source only when established; distinguish a proven conflict from an inability to verify the result.
- [x] Append exactly the specification's eight forwarding rules in a single block marked BEGIN pi-composer keybindings and END pi-composer keybindings. Preserve surrounding bytes, line endings, original final-newline state, and permissions. Create no backup or additional managed bindings file.
- [x] Repeating setup with an intact block makes no write and creates no duplicate. If later settings make the block ineffective or unverifiable, report that result without claiming success or replacing the block.
- [x] Removal reviews and removes only the unmodified managed block after validating the remaining configuration. Preserve unrelated later edits and original surrounding formatting. An absent block is a no-op; edited, incomplete, or duplicate blocks require manual resolution and remain untouched.
- [x] Recheck the reviewed file and relevant loaded configuration sources before writing. Concurrent edits and validation or write failures are reported without overwriting newer settings or leaving a partial file. Report success only after the intended contents are written.
- [x] Give the native Ghostty reload instruction after installation or removal. Returning to the shell, package reload, and Pi exit leave an explicitly installed block intact.
- [x] Preserve each forwarded key's identity, Pi's configured action ownership and alias suppression, and accepted extension priority. Do not change Pi's keybinding configuration or working Cmd+C and Cmd+Shift+Up/Down terminal bindings.
- [x] Verify the complete command lifecycle at the approved public Pi command/editor/session boundary with temporary configuration fixtures. Cover review and cancellation, install and repeat, removal after unrelated edits, malformed blocks, both roots and filename combinations, overriding and unrelated includes, unavailable Ghostty, invalid configuration, concurrent changes, file preservation, and retained draft state. Prove supported verification against the native Ghostty executable rather than only mocked success.
- [x] Update delivered-feature documentation with both commands, supported verification cases, persistent effects, native reload steps, and actual limitations. A command that refuses every installation is not completion of this ticket.

## Verification

The supported pre-write proof is limited to Ghostty 1.3.1 on local macOS with exactly one owned, regular Application Support `config` or `config.ghostty`, no XDG config file, no includes, and no extra Ghostty launch arguments. The command walks Pi's same-user parent chain and uses an optional system Python3 standard-library probe to match Ghostty's executable, account HOME, XDG and startup context. Darwin `KERN_PROCARGS2` is marked unstable by the SDK; denied access, missing Python, unexpected layout or any context mismatch prevents a write.

Within that established single-source shape, native freshly loaded configuration/binding inspection excludes later includes and establishes the baseline. Native validation checks the exact staged candidate. Ghostty's documented duplicate-trigger last-wins semantics then establishes all eight appended bindings before installation; this is a loading-order proof, not a candidate binding inspector or observation of the live GUI after a write. Independent temporary native fixtures demonstrated both Application Support filenames, include resolution and precedence against Ghostty 1.3.1. No real settings were changed.

The inline product probe was also run read-only against the live same-user Ghostty process: executable identity, UID, stable identity, argc=1, HOME/XDG equality, CFFIXED_USER_HOME absence and account-home equality all passed. Expected roots in this read-only check came from the calling shell. Actual interactive Pi-to-Ghostty ancestry and physical forwarding remain ticket 03's acceptance checks.

- `node --test packages/pi-composer/test/setup-keybinds.test.ts`: 30 passed at the public Pi command/editor/session boundary with temporary configurations and the public OS boundary substituted.
- The same 30 tests passed with the initial `process.platform` set to Linux; the fixture restores its platform/environment substitutions. This checks portability of the CI harness, not Linux product support.
- Native Ghostty 1.3.1 `+validate-config --config-file=<temporary-candidate>` accepted the exact eight rules. Native `+show-config` and `+list-keybinds --plain` completed; the current freshly loaded configuration reported zero includes.
- Focused lint and formatting checks, `pnpm typecheck`, and `git diff --check`: passed.

Coverage includes native registration and usage, both draft views, selected draft and undo preservation, confirmation/cancellation, install/repeat, removal/repeat, cancelled or invalid removal, legacy/modern filenames, LF/CRLF/no-final-newline preservation, permissions, later user edits, malformed/duplicate/edited markers, ineffective repeat, conflicting and unrelated includes, both XDG filenames, multiple roots, symlinks, unavailable process verification, unsupported versions, extra argv/account-home mismatch, invalid candidates, and concurrent edits. Atomic replacement avoids a partial live configuration; staging cleanup errors are reported separately.

The README and library integration notes document both commands, supported prerequisites, persistent effects outside Pi, and native reload instructions. Integration tip `9a4be91` was synchronized before completion. Physical terminal gestures, live Pi ancestry and installed-package manual testing were not run here. Ticket 03 retains those acceptance checks.
