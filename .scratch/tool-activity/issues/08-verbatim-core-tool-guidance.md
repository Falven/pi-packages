# 08: Verbatim core tool guidance

**What to build:** The model receives the exact scoped reference core tool guidance, without local additions or paraphrases. Native tool selection still limits the available tool surface.

**Blocked by:** None (can start immediately).

**Status:** done — implemented and verified at `100316f` on `codex/generic-tool-activity`, from integration base `a6280f9`.

- [x] Complete selected declarations and description strings match the frozen scoped contract.
- [x] Local lifecycle, image, and notification prose is removed from tool guidance; retained helper wording is unchanged.
- [x] Excluded tools omit only their sections and directly dependent helper text.
- [x] No system prompts, other prompts, model read-style advice, execution behavior, or unrelated tools change.
- [x] Actual outgoing model requests establish the wording, with existing selected-scope checks retained.

**Resolution:** Removed the local notification rewrite and appended lifecycle/image prose. The selected tool declarations and retained helper text now match the frozen core contract. Tool selection only removes unavailable sections and directly dependent helper text. The frozen capture and its provenance are unchanged; the newer command-parser reference does not replace this separate interface reference.

**Verification (2026-10-16, `100316f`):** The real-host model-request check compares the complete outgoing tool namespace with the frozen contract, including every retained description. Existing selected-scope cases also pass. The core toolset runs without the chat package. [Ticket 09](09-verify-activity-alignment.md) records the final checks.

**Limits:** No app/system prompts, read-style instructions, new live-model experiments, or execution changes were introduced.
