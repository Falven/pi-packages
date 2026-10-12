# 04: pi-paste: route text pastes and explicit overrides

**What to build:** Show small pastes inline, attach large pastes, and offer Paste Inline and Attach Text through native Pi.

**Blocked by:** 02: pi-attachments: attach text and file snapshots.

**Status:** in-progress

- [ ] In native Pi, decoded text below 5,000 UTF-16 units appears inline; text at or above 5,000 units becomes a readable text attachment.
- [ ] Demonstrate the policy through actual terminal, clipboard-shortcut, right-click, and native extension paste routes; one route's handler test is insufficient.
- [ ] Assemble fragmented bracketed input into one payload and classify it once. Preserve snapshot contents; inline text retains the native editor's tab expansion and LF normalization, while pi-composer preserves tabs.
- [ ] Test 4,999/5,000/5,001-unit boundaries including supplementary characters, short multiline text, and small pastes into long drafts.
- [ ] Paste Inline bypasses conversion; Attach Text attaches even short text. Both work in prose and code. Typing and ordinary native text replacement do not invoke paste policy.
- [ ] Successful insertion uses the active editor; unavailable attachment handling or write failures preserve the draft and recoverable payload without silent rerouting.
- [ ] Late clipboard/snapshot results stay with their requesting draft. Preserve native shortcut priority and input listeners that consume or transform events.
- [ ] Use only existing public Pi contracts. Record an exact unsupported route as a blocker rather than claiming complete coverage or introducing a new integration protocol.
- [ ] Run public-boundary automated checks and real Ghostty/macOS clipboard, shortcut, and right-click checks.
