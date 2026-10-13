# 04: pi-attachments: route text pastes and explicit overrides

**What to build:** Attach single-path pastes, show other small pastes inline, attach large text pastes, and offer Paste Inline and Attach Text through native Pi.

**Blocked by:** 02: pi-attachments: attach text and file snapshots.

**Status:** implemented; real-terminal acceptance pending

- [x] In native Pi, recognized single-file paths enter capture first. Other decoded text below 5,000 UTF-16 units appears inline; text at or above 5,000 units becomes a readable text attachment.
- [x] Demonstrate the policy through actual terminal, clipboard-shortcut, right-click, and native extension paste routes; one route's handler test is insufficient.
- [x] Assemble fragmented bracketed input into one payload and classify it once. Preserve snapshot contents; inline text retains the native editor's tab expansion and LF normalization, while pi-composer preserves tabs.
- [x] Test 4,999/5,000/5,001-unit boundaries including supplementary characters, short multiline text, and small pastes into long drafts.
- [x] Paste Inline bypasses path recognition and size conversion; Attach Text captures even short text and literal path characters. Both work in prose and code. Typing and ordinary native text replacement do not invoke paste policy.
- [x] Successful insertion uses the active editor. Unsuccessful path recognition silently uses the original text; failures after capture preserve the draft and recoverable contents.
- [x] Late clipboard/snapshot results stay with their requesting draft. Preserve native shortcut priority and input listeners that consume or transform events.
- [x] Use existing public Pi contracts for paste routing, editor insertion, and recovery.
- [x] Public-boundary checks cover paste routes, native priority, delayed capture, cutoff overrides, and recovery across session changes and reload.
- [ ] Run real Ghostty/macOS clipboard, shortcut, and right-click checks.

Single-path recognition and its physical acceptance are tracked in the [clipboard paste ticket](../../clipboard-paste/issues/01-document-and-verify-native-clipboard-paste.md).
