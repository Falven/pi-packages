# 02: pi-composer: set up and remove Ghostty keybindings

**What to build:** A user can review and install the specified eight persistent Ghostty forwarding rules with /setup-keybinds ghostty, then reverse that change with /setup-keybinds ghostty remove. The command changes only one marked block in an existing configuration after verification and native confirmation.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

**Specification:** Composer specification, “Ghostty keybinding setup,” “Verification boundary,” and “Setup and page-selection acceptance,” stories 52–64; ADR 0010, “Make terminal keybinding setup explicit and reversible.”

- [ ] First demonstrate a supported method that establishes the complete loading order and all eight prospective effective bindings before changing live settings. Record the target Ghostty version and supported configuration shapes. Candidate syntax validation plus current-binding inspection alone does not pass this gate; temporary live installation followed by rollback does not pass it. If no supported case can be demonstrated, record the blocker and leave installation incomplete.
- [ ] Register the command through Pi's public command API. Missing or unsupported arguments produce usage without a write. Use native review, confirmation, and notifications; cancellation or missing interactive confirmation leaves settings unchanged.
- [ ] Before confirmation, show the resolved existing target file, all eight shortcuts, and their persistent effect outside Pi until explicit removal and Ghostty configuration reload. Preserve the draft, selection, history, and editor ownership present at handler entry; closing the dialog restores focus without an additional edit or model submission.
- [ ] Resolve the configuration Ghostty actually loads, including macOS Application Support and XDG roots, modern and legacy filenames, and include order. Missing or ambiguous targets, unsupported configurations, invalid settings, unavailable verification, and conflicting includes leave all live settings unchanged.
- [ ] Use Ghostty to validate the proposed configuration and establish the specified resulting bindings before installation. Report a conflicting shortcut and its source only when established; distinguish a proven conflict from an inability to verify the result.
- [ ] Append exactly the specification's eight forwarding rules in a single block marked BEGIN pi-composer keybindings and END pi-composer keybindings. Preserve surrounding bytes, line endings, original final-newline state, and permissions. Create no backup or additional managed bindings file.
- [ ] Repeating setup with an intact block makes no write and creates no duplicate. If later settings make the block ineffective or unverifiable, report that result without claiming success or replacing the block.
- [ ] Removal reviews and removes only the unmodified managed block after validating the remaining configuration. Preserve unrelated later edits and original surrounding formatting. An absent block is a no-op; edited, incomplete, or duplicate blocks require manual resolution and remain untouched.
- [ ] Recheck the reviewed file and relevant loaded configuration sources before writing. Concurrent edits and validation or write failures are reported without overwriting newer settings or leaving a partial file. Report success only after the intended contents are written.
- [ ] Give the native Ghostty reload instruction after installation or removal. Returning to the shell, package reload, and Pi exit leave an explicitly installed block intact.
- [ ] Preserve each forwarded key's identity, Pi's configured action ownership and alias suppression, and accepted extension priority. Do not change Pi's keybinding configuration or working Cmd+C and Cmd+Shift+Up/Down terminal bindings.
- [ ] Verify the complete command lifecycle at the approved public Pi command/editor/session boundary with temporary configuration fixtures. Cover review and cancellation, install and repeat, removal after unrelated edits, malformed blocks, both roots and filename combinations, overriding and unrelated includes, unavailable Ghostty, invalid configuration, concurrent changes, file preservation, and retained draft state. Prove supported verification against the native Ghostty executable rather than only mocked success.
- [ ] Update delivered-feature documentation with both commands, supported verification cases, persistent effects, native reload steps, and actual limitations. A command that refuses every installation is not completion of this ticket.

The Ghostty 1.3.1 CLI inspected for the specification validates candidates but exposes only current effective settings through its inspectors. This is the first implementation gate, not evidence that candidate precedence is already verified. Page selection can proceed independently in ticket 01; physical acceptance of the combined behavior belongs to ticket 03.
