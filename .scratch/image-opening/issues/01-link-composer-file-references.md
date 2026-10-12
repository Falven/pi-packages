# 01: pi-composer: open local file references

**What to build:** Image attachment references and other absolute local Markdown destinations open the intended file through the terminal's native hyperlink gesture in either composer view.

**Blocked by:** None (can start immediately).

**Status:** implemented; manual acceptance pending

**Specification:** [pi-composer](../../../docs/specs/pi-composer.md); [native contracts](../../../docs/adr/0001-preserve-pi-extension-contracts.md); [live Markdown editing](../../../docs/adr/0004-pi-composer-live-markdown-editing.md).

- [x] Encode absolute local file destinations as file URLs with an explicit localhost authority, preserving existing URL escapes and nonlocal authorities.
- [x] Keep original Markdown, clipboard text, selection, undo, and submission unchanged in both views; ordinary clicks continue to edit.
- [x] Preserve native hyperlink capability handling, Unicode wrapping, and link boundaries.
- [x] Verify file destinations containing spaces, Unicode, percent signs, and hashes through the existing public Pi host.
- [x] Document file-opening gestures and ordinary external-save semantics.
- [ ] Manually open an image reference in both views in Ghostty and verify the associated application receives the retained image.

**Automated validation:** On 2026-10-12, all 687 workspace tests passed on Node 24.13.1, together with formatting, lint, and typechecking. The public-host selection and hyperlink checks cover local path encoding in both views, existing file-URL escapes, remote authorities, capability changes, ordinary mouse editing, clipboard, undo, and unchanged submission. Physical link activation awaits user testing.
