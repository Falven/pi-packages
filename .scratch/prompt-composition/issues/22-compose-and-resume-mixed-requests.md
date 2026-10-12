# 22: Compose and resume mixed requests with all four packages

**What to build:** Complete a real mixed Markdown, skill, paste, and image workflow while preserving native overrides and recovery.

**Blocked by:** 06: Recover drafts after native submission failures; 07: pi-composer: preserve native completions and editor actions; 08: pi-composer: copy, cut, and paste selections; 12: pi-composer: select and scroll formatted drafts; 13: pi-attachments: preview, restore, and remove text; 15: pi-paste: classify copied files and images; 16: pi-skill-references: complete inline skill references; 17: pi-skill-references: expand each skill once; 21: pi-attachments: clean up unused snapshots safely.

**Status:** implemented; real-terminal acceptance pending

- [ ] In Ghostty/macOS fullscreen mode, edit formatted prose/code, use native and custom completions, copy/cut/paste selections, and include text and image attachments in one draft.
- [x] Exercise every actual native paste route with all packages loaded and confirm the same cutoff, overrides, content precedence, selection behavior, and single-action history.
- [x] Attachment text containing canonical skill references remains opaque; Restore Inline enables prose invocation while restored code remains literal.
- [x] Submit normally, steer, and follow up; preserve intended images, once-per-skill instructions, readable snapshot references, and native transformation order.
- [x] Switch sessions or restart during pending work, recover the intended draft, and safely clean up only proven-unused capture or staging data while retaining added snapshots.
- [x] Keep effective providers, custom pickers, native input listeners, shortcuts, widgets, and overlays working in supported registration orders.
- [x] Demonstrate paste, attachment, and skill behavior with the native editor when pi-composer is absent; disabling/replacing an extension preserves saved text and retained files.
- [ ] Run public-boundary automated scenarios and real terminal checks; retain exact evidence for any unresolved public Pi contract instead of declaring full compatibility.

Integration evidence: `2043da5`; all 459 tests pass on Node 24.13.1 and Node 26.8.1, including 22 combined scenarios. Formatting, lint, and root/composer typechecks pass. The scenarios cover both supported decorator orders, all five paste routes, completion and native overrides, text/image delivery, recovery across sessions and fresh processes, and actual filesystem/model failures. Real Ghostty/macOS acceptance remains pending under the [terminal procedure](../../../docs/terminal-checks.md).

Final verification: [shared results](../verification.md).
