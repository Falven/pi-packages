# Codex command reference

`codex-command-cases.json` records 440 command inputs and their complete parsed results from the Codex build bundled with the reference app. Expected results come from the Rust implementation, independently of the TypeScript port.

## Source

- App manifest: `/Applications/ChatGPT.app/Contents/Resources/codex-cli/codex-package.json`.
- Version: `0.162.0-alpha.17.2`.
- Upstream tag: `rust-v0.162.0-alpha.17.2`.
- Commit: `740e5af33c71225640e0c1c1555c514c2c93ab74`.
- [Command parser and helpers](https://github.com/openai/codex/tree/740e5af33c71225640e0c1c1555c514c2c93ab74/codex-rs/shell-command/src): `parse_command.rs`, `bash.rs`, `shell_detect.rs`, and `powershell.rs`. The fixture records their SHA-256 hashes.
- Reference dependencies: Rust `tree-sitter` 0.25.10, `tree-sitter-bash` 0.25.1, and `shlex` 1.3.0. The port uses the same Bash grammar through Node `tree-sitter` 0.25.1 and adapts the reference shlex behavior.
- Capture platform: macOS, matching the installed app. Windows-native path behavior has not been verified.

This source supersedes the older local Codex checkout used during initial investigation. The frozen core tool-interface fixture has its own provenance and is unchanged by this parser reference.

## Capture and verification

The reference parser and Bash test modules passed all 106 original tests. Instrumentation recorded function inputs and public `parse_command` results without changing test assertions or parsing behavior. Each fixture case identifies its source test or additional boundary case.

To refresh the corpus deliberately:

1. Resolve the chosen app's bundled version to an upstream commit. Record the source hashes and dependency versions before changing the reference.
2. Run the original parser and Bash tests in a Rust harness using that source and its matching dependencies. Capture public parser inputs/results, Bash parse inputs, Bash wrapper-extraction inputs, PowerShell tokenizer inputs, and formatting-helper inputs. Run tests serially so each capture retains its test name.
3. Replay helper-only inputs through the public parser. Wrap Bash scripts in `bash -lc` and PowerShell text in `pwsh -c`. For formatting helpers, append a separate `cat reference-sentinel.md` operation to expose whether the helper is suppressed. Preserve direct argument vectors for wrapper-extraction cases.
4. Deduplicate equal argument vectors, retaining all source names. Run every remaining input through the Rust public parser and store all returned fields. Keep the additional quoting, options, paths, and wrapper boundary cases.
5. Run `node --test packages/pi-chat/test/command.test.ts`. Its equality check compares action kinds, full command strings, paths, display names, queries, ordering, and fallback results. Update recognition only when it matches the chosen reference.

The integration checks also cover native commands, unrelated activity providers, registered skill paths, pending calls, and retained history. An additional deterministic comparison of 9,646 generated command vectors against the same Rust parser found no differences; it supplements the checked-in reference corpus.

The defaults deliberately retain the reference's boundaries: if any action in a submitted script remains unknown, the public parser returns one general command for that script. Operator overrides in `src/config.ts` change presentation; they do not change the captured reference expectations.

The port and fixture are attributed in [NOTICE](../../NOTICE) and distributed with [LICENSE-APACHE-2.0](../../LICENSE-APACHE-2.0).
