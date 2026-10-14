# 04: Verify asynchronous attachment editing on unmodified Pi

**What to build:** A pending attachment operation updates only its requesting draft while preserving the selected editor, later edits, caret, selection where supported, and native history. Establish that the package can provide this behavior without host changes before porting the complete Markdown flow.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

**Specification:** [Pi Attachments](../../../docs/specs/pi-attachments.md) and [Pi Composer](../../../docs/specs/pi-composer.md), including their applicable architecture decisions.

- [ ] Use public editor APIs first and identify the exact missing public capability before each private dependency. CustomEditor and setEditorComponent() provide replacement-editor support; they do not adapt an existing editor or preserve its state automatically.
- [ ] Preserve the selected editor and keep pi-composer optional. Any necessary private adapter stays inside the package, affects only that editor instance, preserves unhandled native input, and is cleaned up on reload. Use no silent editor replacement, global prototype patch, private queue modification, or Pi source change.
- [ ] Remove reliance on locally added native editor identity and range-transaction APIs. Keep the composer's existing package-owned draft identity and targeted edits, without presenting them as additions to Pi's editor contract.
- [ ] Preserve identity and history across ordinary edits, undo, prompt-history recall, and repeated identical drafts. Equal text alone cannot identify a draft. Reject stale changes after draft or session replacement; asynchronous whole-draft replacement and a parallel attachment history are not acceptable substitutes.
- [ ] Run the compatibility experiment on unmodified Pi with the native editor and composer separately. Cover pending capture with typing, caret movement, selection and redo where the editor supports them, undo, prompt history, collapsed native pastes, source operations completing out of order, repeated identical drafts, session changes, and reload cleanup.
- [ ] Exercise submission while capture is pending, earlier input transformations, prompt-history association, and normal, steering, and follow-up ordering. Establish how already-started capture stays associated with the correct submission without the removed host preparation phase; do not infer delivery from draft clearing.
- [ ] Keep immediate capture and snapshot reuse throughout the experiment. Do not move capture to Send, add native editing features the selected editor lacks, or weaken existing composer transactions to make the experiment pass.
- [ ] Reuse the existing editor and session verification boundary with unmodified dependencies. The experiment may exercise the editor integration independently of unfinished settings and action migrations; passing it does not establish full-extension startup.
- [ ] If the experiment fails, record the exact failing behavior in this ticket and discuss any necessary behavior change before proceeding. A composer-only success or a modified-host success cannot satisfy this gate or unblock tickets 05 and 07.

**Integration:** Ticket 05 uses the proven editor integration for the complete capture flow. Ticket 07 verifies the integrated extension and actual restored installation. Record compatibility evidence and identified private API gaps here rather than in a separate report.

**Historical verification (2026-10-14):** The previous implementation passed 76 focused identity, recovery, composition, and cleanup checks and 28 chat relationship tests against the modified host, plus type, lint, and format checks. It depended on host-provided opaque identity and targeted transactions, so it does not prove this adapter feasible. Native selection and redo were unavailable in that verification; composer checks covered them. Physical terminal interaction was not observed.
