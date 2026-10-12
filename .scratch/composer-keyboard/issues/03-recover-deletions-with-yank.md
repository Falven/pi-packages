# 03: pi-composer: recover deletions with yank and yank-pop

**What to build:** Native retained-text recovery brings back word/line deletions, including formatted Markdown, through the same draft and undo history.

**Blocked by:** [02: pi-composer: delete words and logical lines](02-delete-words-and-logical-lines.md).

**Status:** complete

**Specifications:** [pi-composer](../../../docs/specs/pi-composer.md).

- [x] Retain deleted source and delimiters removed by formatted projection without copying delimiters still needed by surviving text. Source view retains literal deleted syntax.
- [x] Consecutive backward deletions prepend and forward deletions append using native accumulation semantics. Intervening editing or movement ends accumulation.
- [x] Yank inserts the current retained entry at the caret or over the selection. Yank-pop rotates entries by replacing the immediately preceding yank or yank-pop and becomes inactive after unrelated editing or movement.
- [x] Exercise the specified whole-span, partial-span, and cross-span examples, insertion into another formatting context, consecutive deletions, newline joins, and Unicode content.
- [x] Yank and yank-pop share the draft's history, selection, and attachment-membership behavior. Verify through public Pi input and observed source/undo results, using effective native bindings.

Verify at the approved public Pi editor/session boundary. Record physical terminal checks separately from delivered-input behavior.

## Verification

- Added 12 public-host checks in `packages/pi-composer/test/native-yank.test.ts` and `packages/pi-composer/test/native-yank-attachments.test.mjs`. The native yank, formatted retention, accumulation, and yank-pop cases failed before their implementation.
- `node --test packages/pi-composer/test/*.test.*`: 278 passed after merging the integration branch's navigation and clipboard changes.
- `pnpm run format:check`, `pnpm run lint`, `pnpm run typecheck`, and `pnpm exec tsc --noEmit -p packages/pi-composer/tsconfig.json`: passed.
- Attachment checks confirmed one-step undo/redo, restored selection, correct membership, and unchanged retained file contents in both views. No clipboard read was needed.
- Physical Ghostty/macOS acceptance remains tracked by ticket 08.
