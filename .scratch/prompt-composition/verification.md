# Prompt composition verification

Implementation and automated verification cover all 22 tickets at `fe76587` (2026-10-12). Eight tickets meet all their criteria. Fourteen retain explicit real-terminal acceptance criteria.

- The full suite passes **470 tests**, with no failures or skipped tests, on Node **24.13.1** and **26.8.1**. The integration tree matches the tree tested on Node 24.
- Formatting, lint, root TypeScript checks, and the dedicated composer TypeScript check pass.
- Tests use Pi **1.0.2** through its public editor/session boundary, observing drafts, submitted content, and retained files. They include actual filesystem failures and controlled model failures.

| Review axis   | Final result                                                                                                                                                                                                              |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Standards     | Two findings corrected: completion preserves provider edits and cursor results (`e94d766`); attachment capture and recovery reject non-regular sources promptly (`179c20d`).                                              |
| Specification | Two findings corrected: native queue replay deduplicates skill instructions and keeps their bodies opaque (`e40d5be`); Restore Inline removes membership across formatted selections in one undo/redo action (`728d468`). |

The final completion regression covers provider-added references, changes to earlier references, edits to the completed line, and independent cursor moves. No reproduced software failure remains open.

Tickets **02, 05, 06, 17, 18, 19, 20, and 21** are complete. The other tickets retain their unchecked physical-terminal criteria.

Real Ghostty/macOS fullscreen acceptance is **pending**. Use the [isolated terminal procedure](../../docs/terminal-checks.md) to verify physical Command shortcuts, clipboard formats, mouse/scroll/resize behavior, image previews, and the complete workflow. Record the checkout commit with the results. Automated terminal input does not establish those physical results.
