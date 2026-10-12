# 03: pi-skill-references: invoke canonical inline skills

**What to build:** Invoke a known skill with ordinary canonical text while preserving literal examples and native commands.

**Blocked by:** None (can start immediately).

**Status:** in-progress

- [ ] With native Pi alone, a canonical skill reference in ordinary prose resolves through Pi's effective skill catalog and contributes the intended instructions and native resource context.
- [ ] Typing, pasting, or native insertion by another extension produces the same invocation behavior; references remain character-editable plain text.
- [ ] Inline, fenced, and indented code, escaped references, link destinations, URLs, paths, and incidental shorthand remain literal; only complete canonical references invoke skills.
- [ ] Unknown skills retain their text; unreadable skills preserve the reference and surface the read failure without claiming successful expansion.
- [ ] Keep the saved draft unchanged during submission-time expansion and preserve native leading command dispatch.
- [ ] Verify behavior at the actual Pi editor/session and input-transformation boundary, including the host's subsequent native leading-skill step. Check plain-text clipboard portability in real Ghostty/macOS.
- [ ] Use existing public discovery and transformation contracts; private native expansion code is reference material only.
