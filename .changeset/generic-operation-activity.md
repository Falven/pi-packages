---
"pi-chat": patch
"pi-codex-tools": patch
---

Present generic operation activity across independent extensions. Keep returned text out of the activity list, preserve raw results in Find, and label registered skill reads consistently.

Match command recognition to the Codex `0.162.0-alpha.17.2` reference, centralize activity settings, and keep argument streaming out of the activity list. Preserve the frozen core tool guidance verbatim.

Allow exact Ctrl+C input to interrupt non-terminal processes. Keep input/collection calls and script errors out of operation activity while preserving their model results and source Find access.
