# 04: pi-paste: route text pastes and explicit overrides

**What to build:** Show small pastes inline, attach large pastes, and offer Paste Inline and Attach Text through native Pi.

**Blocked by:** 02: pi-attachments: attach text and file snapshots.

**Status:** implemented; real-terminal acceptance pending

- [x] In native Pi, decoded text below 5,000 UTF-16 units appears inline; text at or above 5,000 units becomes a readable text attachment.
- [x] Demonstrate the policy through actual terminal, clipboard-shortcut, right-click, and native extension paste routes; one route's handler test is insufficient.
- [x] Assemble fragmented bracketed input into one payload and classify it once. Preserve snapshot contents; inline text retains the native editor's tab expansion and LF normalization, while pi-composer preserves tabs.
- [x] Test 4,999/5,000/5,001-unit boundaries including supplementary characters, short multiline text, and small pastes into long drafts.
- [x] Paste Inline bypasses conversion; Attach Text attaches even short text. Both work in prose and code. Typing and ordinary native text replacement do not invoke paste policy.
- [x] Successful insertion uses the active editor; unavailable attachment handling or write failures preserve the draft and recoverable payload without silent rerouting.
- [x] Late clipboard/snapshot results stay with their requesting draft. Preserve native shortcut priority and input listeners that consume or transform events.
- [x] Use existing public Pi contracts for paste routing, native attachment-command handoff, and recovery.
- [x] Public-boundary checks cover paste routes, native priority, deferred attachment commands, cutoff overrides, and recovery across session changes and reload.
- [ ] Run real Ghostty/macOS clipboard, shortcut, and right-click checks.
