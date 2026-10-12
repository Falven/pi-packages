# 02: pi-composer: delete words and logical lines

**What to build:** Backward/forward word deletion and deletion toward either logical line boundary edit the correct range and undo coherently in both views.

**Blocked by:** [01: pi-composer: honor native bindings and picker priority](01-honor-native-bindings-and-picker-priority.md).

**Status:** complete

**Specifications:** [pi-composer](../../../docs/specs/pi-composer.md).

- [x] Execute effective native word and line deletion actions against the shared draft, including configured bindings and useful terminal translations that Pi receives.
- [x] A nonempty selection takes precedence over calculating an unselected word or line range. At the corresponding logical boundary, remove the adjacent newline and join lines; at an empty outer boundary, do nothing.
- [x] Preserve graphemes, punctuation/whitespace behavior, tabs, code contents, and surrounding Markdown in source and formatted views. Include whole-span, partial-span, and cross-span formatted deletion examples from the composer specification.
- [x] One coherent undo restores the deleted source, selection, and attachment membership; redo restores the edit without changing snapshot contents.
- [x] Verify the result through the existing public Pi boundary with native defaults and custom bindings. Preserve character deletion and application-owned empty-editor exit.
