# pi-quote specification

## Accepted behavior

`pi-quote` is independently installable and works with unmodified, released fullscreen Pi. It has no dependency on `pi-chat`, `pi-composer`, or `pi-attachments`. The user approved this boundary and the scoped private adapter on 2026-10-17; [ADR 0028](../adr/0028-independent-quote-extension.md) records the decision.

- A completed, nonempty transcript selection offers **[Quote]**. Native character, word, line, reverse, Unicode, and multiline selections keep Pi's extraction behavior. Dragging does not show an action.
- The button uses a clear seven-cell space near the selection with a gap from surrounding text. It avoids image rows. If no suitable space exists, it uses the package's reserved row above the editor. Showing the action does not change transcript height or move the selection. Very narrow or short terminals may leave only keyboard activation available.
- Click or **Alt+Shift+Q** inserts into the active prompt editor. **Escape** dismisses the action. Native pointer capture preserves the selected payload while a click clears the underlying highlight. Other controls retain native input handling.
- Each line is prefixed with `>`, including blank lines. CRLF is normalized and terminal controls are stripped. Visible code fences supply missing boundaries for partial code selections; literal backticks inside a code excerpt are protected by a longer enclosing fence.
- Quotes use the same rendered text Pi selects. They preserve selected indentation and display line breaks, subject to native selection and editor normalization. Hidden source Markdown, original soft-wrap boundaries, link destinations, and image contents are outside this contract.
- Insertion adds paragraph separation before the quote when needed and two newlines afterward. Existing text on both sides of the caret survives. An active composer text selection follows the editor's normal replacement behavior. The editor owns undo and caret movement; a quote is one undoable insertion. The package does not route quotes through paste handling or submit the draft.
- Changed selected text, width changes, dialogs, mode changes, reload, and disposal invalidate the action. Scrolling keeps a still-valid selection available. Quote UI is absent from transcript source, source Find, retained messages, and provider input.

## Implementation boundary

The public extension API registers the widget, keyboard shortcut, cancellation listener, and lifecycle handlers. The active editor's `insertTextAtCursor()` performs the edit. There is no extension-owned editor, transcript, annotation store, clipboard operation, or dependency on another workspace package.

`native-adapter.ts` contains the private integration. It reads completed selection bounds, selected text, source rows, and the layout being rendered. Instance-scoped hooks capture that layout, paint the action after native selection and overlays, and route clicks through Pi's pointer dispatch. Extraction temporarily supplies the current frame to Pi's selection method during forced redraws. Required capabilities are checked before attaching; unsupported selection APIs report an error. Hooks restore only their own replacements, and inactive callbacks do not affect another renderer.

Pi retains fullscreen mouse decoding, selection granularity, copying preferences, scrolling, editor transactions, and provider dispatch. Normal terminal highlighting is unavailable to extensions. The adapter follows the stable TUI reference when Pi switches renderer instances. The reserved widget row exists only in fullscreen mode.

## Verification

Use installed Pi/TUI 1.1.0 through the existing `fixtures/native-host.ts` seam: real extension loading and editor behavior, a recording terminal, and a controlled local provider. Exercise stock Pi, composer alone, chat alone, and the combined packages with quote loaded before and after them. Check quote bytes, one-step undo, caret insertion, crowded placement without reflow, selection gestures, Escape, dialogs, stale text, resizing, mode changes, reload, headless loading, and large inline quotes followed by ordinary submission.

Run workspace typecheck and lint, relevant formatting checks, existing chat/editor integration checks, and a package archive/load check. No new committed test suite is part of this change. Recording-terminal checks do not establish physical-terminal rendering or keyboard delivery.

Verified locally on 2026-10-17 against Pi/TUI 1.1.0:

- Thirteen temporary integration checks passed with the unpacked package installed outside the workspace, using the repository's resolved Pi dependency versions. Coverage includes both extension orders, code and multiline selections, editor selection replacement, key releases, one-step undo, lifecycle cleanup, and a quote over 5,000 characters submitted inline with attachments enabled.
- Seventy-one existing tests passed in `packages/pi-chat/test/native-chat.test.ts`, `packages/pi-composer/test/native-editor-actions.test.ts`, `packages/pi-composer/test/native-ui-selection.test.mjs`, and `packages/pi-composer/test/source-drafts.test.ts`.
- Workspace TypeScript and lint, scoped formatting, and `git diff --check` passed. The installed compiler ran directly after the package-manager wrapper encountered the repository's existing build-script restrictions.
- `pnpm pack` included the manifest, README, and three source files. Pi loaded the packed directory through its extension manifest. The separate installation used an offline lockfile derived from the workspace's resolved dependencies; fresh registry resolution was not verified.
