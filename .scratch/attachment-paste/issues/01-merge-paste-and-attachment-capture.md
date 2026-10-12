# 01: Combine paste and attachment capture

**What to build:** Installing `pi-attachments` supplies text paste policy, native clipboard attachments, explicit attachment actions, previews, and recovery through one capture lifecycle. The native editor and `pi-composer` keep their own editing contracts, and existing drafts and retained files remain usable.

**Blocked by:** None (can start immediately).

**Status:** complete

**Specifications:** [Attachments and paste](../../../docs/specs/pi-attachments.md), [composer](../../../docs/specs/pi-composer.md), [composition ownership](../../../docs/adr/0003-independent-composition-extensions.md), and [native clipboard identity](../../../docs/adr/0011-preserve-native-clipboard-identity.md).

- [x] Install `pi-attachments`, `pi-composer`, and `pi-skill-references` as the three composition packages. Remove the standalone paste package and its workspace, dependency, fixture, and local installation entries.
- [x] Native clipboard files, image bytes, large pasted text, and explicit attachment actions share one internal capture operation. Preserve contents once before inserting references; pasted attachments do not dispatch an attachment command, create handoff links, or require a second snapshot copy.
- [x] Preserve the 5,000 UTF-16 unit cutoff, fragmented paste assembly, Paste Inline, explicit Attach Text, native whitespace behavior, and literal path text. File metadata takes precedence over image bytes, then text; read errors remain errors.
- [x] Keep existing Pi clipboard handlers, configured bindings, accepted extension shortcuts, focused UI, and native editor decorators in control. Ghostty's Cmd+V and its eight-rule terminal setup remain unchanged.
- [x] Keep `paste-inline`, `paste-recover`, `attach-file`, `attach-text`, `attachments`, `attachments-recover`, and `attachments-cleanup` available. Failed or late capture preserves the requesting draft and recoverable bytes; recovery does not edit a newer draft.
- [x] Preserve snapshot paths, attachment references, saved sessions, earlier durable paste recovery records, and pending captured data across reload and session changes. Existing recovered files remain attachable and retained contents stay protected by conservative cleanup.
- [x] With the composer, pasting an attachment over a selection is one undo/redo action. Verify preview membership, original bytes, native image delivery, and normal, steer, and follow-up submission through the shared host.
- [x] Consolidate package guidance, ADR ownership, specifications, and ticket links. Explain PastePal Copy followed by Pi's effective clipboard action, Ctrl+V by default; distinguish native file identity from terminal path text.
- [x] Reuse the existing public Pi editor/session tests for native and composer routes, existing-data recovery, failed writes, delayed capture, custom handlers, and shortcut ownership. Run required formatting, lint, type, test, and local resource-loading checks.

Physical clipboard-manager acceptance remains in the [native clipboard workflow ticket](../../clipboard-paste/issues/01-document-and-verify-native-clipboard-paste.md); an automated host result does not complete those checks.

**Verification (2026-10-12):** All 685 tests passed with `node --test` on Node 26.8.1 against the repository's Pi 1.0.2 public host. Formatting, lint, TypeScript, and whitespace checks passed. Focused recovery assertions also checked old in-memory paste requests, late arrivals after reload, storage isolation, preserved copied filenames, generated image extensions, and partial captures. The installed Pi 1.1.0 CLI loaded the three local packages and reported each of the seven attachment/paste commands exactly once. `pi remove` removed only the obsolete local package entry; `pi list` resolves the remaining three packages to this checkout. Existing snapshot directories and Ghostty settings were not modified.
