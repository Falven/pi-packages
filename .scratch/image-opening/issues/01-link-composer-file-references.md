# 01: pi-composer: open local file references

**What to build:** Image attachment references and other absolute local Markdown destinations open the intended file through the terminal's native hyperlink gesture in either composer view.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

**Specification:** [pi-composer](../../../docs/specs/pi-composer.md); [native contracts](../../../docs/adr/0001-preserve-pi-extension-contracts.md); [live Markdown editing](../../../docs/adr/0004-pi-composer-live-markdown-editing.md).

- [ ] Encode absolute local file destinations as file URLs with an explicit localhost authority, preserving existing URL escapes and nonlocal authorities.
- [ ] Keep original Markdown, clipboard text, selection, undo, and submission unchanged in both views; ordinary clicks continue to edit.
- [ ] Preserve native hyperlink capability handling, Unicode wrapping, and link boundaries.
- [ ] Verify file destinations containing spaces, Unicode, percent signs, and hashes through the existing public Pi host.
- [ ] Document file-opening gestures and ordinary external-save semantics.
- [ ] Manually open an image reference in both views in Ghostty and verify the associated application receives the retained image.
