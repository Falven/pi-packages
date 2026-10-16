# 08: Verbatim core tool guidance

**What to build:** The model receives the exact scoped reference core tool guidance, without local additions or paraphrases. Native tool selection still limits the available tool surface.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] Complete selected declarations and description strings match the frozen scoped contract.
- [ ] Local lifecycle, image, and notification prose is removed from tool guidance; retained helper wording is unchanged.
- [ ] Excluded tools omit only their sections and directly dependent helper text.
- [ ] No system prompts, other prompts, model read-style advice, execution behavior, or unrelated tools change.
- [ ] Actual outgoing model requests establish the wording, with existing selected-scope checks retained.
