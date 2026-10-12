# Terminal acceptance

**Status: Ghostty setup and Shift-page selection are implemented with public-host acceptance coverage; real Ghostty/macOS fullscreen acceptance remains pending.** The [setup and page-selection verification record](../.scratch/composer-keybinds/verification.md) separates delivered-input checks, temporary configuration writes, native Ghostty validation, and blocked physical acceptance. Earlier editing results remain in the [keyboard verification record](../.scratch/composer-keyboard/verification.md). The [composer specification](specs/pi-composer.md) defines the required results. Record each observed physical result below. Automated terminal input, clipboard substitutes, and captured ANSI output establish software behavior; physical gestures, clipboard formats, layout, and graphics need this run.

Use a local macOS account, Ghostty, Node 24 or newer, pnpm 12.7.0, `fd`, and `rg`. The workspace lockfile supplies Pi and pi-tui 1.0.2, including the native clipboard backend. Finder and Preview supply actual copied-file and image clipboard data. Pi state, fixtures, model requests, and session files go into the temporary directory created below. The explicit setup phase also changes the reviewed Ghostty configuration until removal and reload.

## Prepare the isolated run

In a Ghostty shell, from the repository root:

```sh
git rev-parse HEAD
node --version
pnpm --version
pnpm install --frozen-lockfile --offline --ignore-scripts

export PI_CHECK_NATIVE_BIN="$(node --input-type=module -e '
  import { getAgentDir } from "@earendil-works/pi-coding-agent";
  import { join } from "node:path";
  process.stdout.write(join(getAgentDir(), "bin"));
')"
PATH="$PI_CHECK_NATIVE_BIN:$PATH" command -v fd rg

export PI_CHECK_REPO="$(pwd -P)"
export PI_CHECK_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/pi-ticket22.XXXXXX")"
node "$PI_CHECK_REPO/packages/pi-composer/fixtures/terminal-acceptance.mjs" \
  "$PI_CHECK_ROOT" >"$PI_CHECK_ROOT/model.log" 2>&1 &
PI_CHECK_SERVER_PID=$!
for PI_CHECK_WAIT in {1..50}; do
  test -s "$PI_CHECK_ROOT/ready.json" && break
  sleep 0.1
done
cat "$PI_CHECK_ROOT/model.log"
cat "$PI_CHECK_ROOT/ready.json"
printf 'PI_CHECK_REPO=%s\nPI_CHECK_ROOT=%s\n' "$PI_CHECK_REPO" "$PI_CHECK_ROOT"
```

The launch reuses tools from Pi's current agent directory and the shell search path. Confirm the tool check prints paths for both `fd` and `rg`.

Proceed when the log says `Local acceptance model ready` and `ready.json` contains a loopback URL. Keep a second shell with `PI_CHECK_REPO` and `PI_CHECK_ROOT` set to these exact printed paths. Run the clipboard, file, and model-control commands there while Pi occupies the first shell.

The fixture creates three skills (`review`, `audit`, `literal`), text files of exactly 4,999/5,000/5,001 UTF-16 units, short text, formatted and scrolling drafts, copied-file sources, and a red/blue PNG. Its local HTTP model records each request in `request-N.json` and `requests.jsonl`. Replies report image counts and the number of instruction blocks for each skill. `model.hold` delays responses; `model.fail` produces an actual HTTP 500.

The temporary agent directory contains explicit bindings for `app.session.new` on **Control+Option+N** and `app.session.resume` on **Control+Option+R**. These are acceptance bindings; the installed Pi defaults for both actions are empty. They let the native session UI act while the draft remains in the editor. See [Pi's native keybindings](https://github.com/earendil-works/pi/blob/6fb2e7815167e6b19006fc526d1a5d0f5f998787/packages/coding-agent/src/core/keybindings.ts#L79).

## Launch

Define and run this function in the first Ghostty shell:

```sh
pi_ticket22() {
  (
    cd "$PI_CHECK_ROOT/files" || exit 1
    PATH="$PI_CHECK_NATIVE_BIN:$PATH" \
    PI_CODING_AGENT_DIR="$PI_CHECK_ROOT/agent" PI_TELEMETRY=0 \
      "$PI_CHECK_REPO/node_modules/.bin/pi" \
      --tui-mode fullscreen --offline --no-tools \
      --no-extensions --no-skills --no-prompt-templates --no-themes --no-context-files \
      --session-dir "$PI_CHECK_ROOT/sessions" \
      --provider ticket22 --model mixed-acceptance \
      --skill "$PI_CHECK_ROOT/skills" \
      -e "$PI_CHECK_REPO/packages/pi-composer/fixtures/mixed-acceptance.ts" \
      -e "$PI_CHECK_REPO/packages/pi-composer/src/index.ts" \
      -e "$PI_CHECK_REPO/packages/pi-paste/src/index.ts" \
      -e "$PI_CHECK_REPO/packages/pi-attachments/src/index.ts" \
      -e "$PI_CHECK_REPO/packages/pi-skill-references/src/index.ts" \
      "$@"
  )
}
pi_ticket22 --name "ticket22 A"
```

`--no-extensions` disables discovered and built-in extensions while retaining the explicit `-e` files. The [acceptance fixture](../packages/pi-composer/fixtures/mixed-acceptance.ts) adds public providers, a custom picker, a widget, and the actions below. The composer loads before editor decorators. Paste and attachments support either relative order; repeat the paste and attachment checks with their two `-e` lines exchanged. Later editor decorators delegate to the existing factory and preserve its public methods and callback assignments. Pi has one active replacement editor.

| Acceptance action                                          | Key or command                         |
| ---------------------------------------------------------- | -------------------------------------- |
| Custom skill picker                                        | Control+Option+P                       |
| Update the effective completion provider                   | Control+Option+U                       |
| Paste clipboard text using public `ui.pasteToEditor`       | Control+Option+E                       |
| Terminal listener inserts `LISTENER`                       | Control+Option+L                       |
| Extension shortcut notification                            | Control+Option+S                       |
| Reload resources with the draft intact                     | Control+Option+Y; `/acceptance-reload` |
| Run `/attachments-cleanup` with the draft intact           | Control+Option+C                       |
| Open `/composer-recover` with the draft intact             | Control+Option+D                       |
| Quit through public `ctx.shutdown()` with the draft intact | Control+Option+Q                       |

These keys belong to the explicitly loaded acceptance fixture. Package actions are **Control+Option+V** (Paste Inline), **Control+Option+T** (Attach Text), **Control+Option+F** (Attach File), and **Control+Option+A** (manage attachments). Their commands are `/paste-inline`, `/attach-text`, `/attach-file`, and `/attachments`.

## 0. Record physical delivery

Begin with Ghostty's effective settings unchanged. Record macOS and Ghostty versions, the checkout commit, the local Pi version, and any configured bindings relevant to each gesture. Observe separately what the terminal does, what Pi does, and whether the editor changes. A terminal-consumed key is a delivery failure for that shortcut; incorrect editing after delivery is a composer failure. If delivery cannot be established, record it as unknown.

| Physical gesture                          | Delivery check                                                                                                                              |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Cmd+A                                     | Distinguish terminal selection from draft selection. Draft selection persists through redraw and changes which text the next edit replaces. |
| Cmd+C                                     | Repeat with and without a Ghostty terminal selection; terminal copying can consume the key.                                                 |
| Cmd+Z / Cmd+Shift+Z                       | Repeat with and without a terminal undo/redo action available. Record the terminal action and its state, or leave that case pending.        |
| Cmd+Enter; Cmd+Up/Down and Shift variants | Check whether fullscreen or shell-prompt navigation consumes the gesture.                                                                   |
| Cmd+Delete; Cmd+Left/Right                | Check the useful native Ctrl+U and Ctrl+A/E translations against the same native actions directly.                                          |
| Option+Delete; Option+Left/Right          | Check native backward-word deletion and word movement; record any missing or different input.                                               |
| Cmd+X; shifted movement; extra Up/Down    | Verify the draft result and stable selection when the input reaches Pi.                                                                     |
| Shift+Fn+Up/Down                          | Record whether Shift+PageUp/PageDown reaches Pi and whether it extends a selection by one visible composer page.                            |
| Cmd+V; menu paste; right-click            | Record terminal text versus native clipboard behavior using sections 3 and 4.                                                               |

Keep this baseline unchanged. Continue other editing checks using delivered native keys, such as Ctrl+- for undo and Ctrl+V for clipboard paste, or keyboard/mouse range selection. Those results establish their own routes. Direct-input host tests cover composer aliases that the physical terminal consumes; they do not establish shortcut forwarding. Record explicit setup separately in the following phase.

### Explicit setup and removal

The setup command and page selection are implemented. Physical setup, reload, input, and removal remain unobserved because computer-use access to Ghostty was denied. Use the [setup contract](specs/pi-composer.md#ghostty-keybinding-setup) and its pre-write verification gate as the pass criteria when terminal access is available. The supported configuration is Ghostty 1.3.1 with one regular, user-owned Application Support configuration, no XDG configuration files or includes, and no extra launch arguments. The command must also verify its actual Pi-to-Ghostty ancestry and matching configuration context before writing.

1. Record the configuration target and existing effective bindings. Invoke `/setup-keybinds ghostty`, inspect the eight proposed rules and the persistent effect outside Pi, and cancel. Pass: no configuration change or extra draft edit occurs.
2. Invoke the command again and confirm installation. If verification is unavailable or an include conflicts, pass the no-write check and leave installation-dependent checks pending. Do not count a refusal as a successful installation.
3. For a verified installation, inspect the single marked block and reload Ghostty through its native reload action. Repeat setup. Pass: the block remains unchanged and is not duplicated; no backup is created.
4. Exercise Cmd+A, Cmd+Enter, Cmd+Up/Down, Cmd+Z/Shift+Z, and Shift+Fn+Up/Down in formatted and source views. Verify persistent draft selection, explicit submission, draft boundaries, undo/redo, and one-page selection. For page selection, repeat and reverse the gesture, use wrapped and Unicode text, resize, then type and undo to check the selected range.
5. Recheck Cmd+C, Cmd+Shift+Up/Down, useful native translations, focused pickers, and effective native/extension overrides. Record each input route. Terminal forwarding cannot bypass a Pi action that owns the chord.
6. Enter the external editor, suspend/resume Pi, change panes, reload resources, and exit to the shell. Pass: the installed configuration persists and its eight bindings apply wherever that configuration is used. Check another terminal program too; do not expect automatic restoration when Pi exits.
7. Relaunch the same isolated Pi, run `/setup-keybinds ghostty remove`, review and confirm removal, then reload Ghostty. Pass: only the intact managed block is removed, unrelated settings remain, and the pre-existing bindings are effective again. Repeat removal to verify a no-op. An edited or malformed block requires manual resolution and must remain untouched.

Record baseline, installation, physical verification, and removal as separate results, including any supported-configuration limits. Syntax validation and successful configuration writes do not establish physical forwarding.

## 1. Command forwarding and formatted editing

Submit `Start session A` with Enter and wait for a local response. This creates a resumable native session. Then run in the second shell:

```sh
pbcopy < "$PI_CHECK_ROOT/files/draft.md"
```

Paste into Pi with Command+V. Pass: headings, emphasis, list, quote, and fenced code remain editable. Command+Shift+M shows the exact Markdown source and toggles back to the same draft.

Select a prose word using Shift+Arrow, replace it, and use Command+Z and Command+Shift+Z. Pass: one undo/redo restores the edit and selection; switching views preserves both. Command+A selects the entire draft. Command+C copies the selected Markdown; inspect `pbpaste` in the second shell. Command+X cuts it; Command+Z restores it. Paste over a selected word with Command+V and verify one undo returns that word. A forwarded gesture must change Pi's selection/history as described.

Enter continues the list or fenced code at its caret. Shift+Enter inserts a newline. Enter in the final prose submits; Command+Enter explicitly submits from any editing context. Use an open completion picker before testing Enter: it must accept the selected completion first. Check the local request count to distinguish acceptance from submission:

```sh
wc -l "$PI_CHECK_ROOT/requests.jsonl"
```

### Native deletion, navigation, and recovery

Run the following in both formatted and source views, using a short multiline draft and then a narrow window that wraps it. On the Mac keyboard, Delete is backward deletion (`backspace`); use Fn+Delete for forward deletion where available.

| Check                                                                               | Required result                                                                                                                                                                            |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Ctrl+W or Option+Delete; Option+D or Option+forward Delete                          | Remove the word in the requested direction, or only the selected range. At a logical line boundary, join adjacent lines.                                                                   |
| Ctrl+U/Ctrl+K, plus delivered Cmd+Delete                                            | Remove text toward the logical start/end, or only the selection. At the corresponding boundary, remove the newline; at the outer draft boundary, do nothing.                               |
| Consecutive backward/forward word or line deletions, Ctrl+Y, then Option+Y          | Retained text accumulates in source order. Yank inserts it; yank-pop replaces only the previous yank. An intervening edit or movement prevents yank-pop. Undo restores each coherent edit. |
| Home/Ctrl+A and End/Ctrl+E; delivered Cmd+Left/Right                                | Reach the current logical line's start/end, even when it spans several visual rows.                                                                                                        |
| Delivered Cmd+Up/Down and Shift variants                                            | Reach the draft's beginning/end. Shift keeps the original selection anchor; repeated movement at the boundary stays in the draft.                                                          |
| Up from the first visual row, with the caret after its beginning                    | First reach the beginning; another unmodified Up may browse native prompt history.                                                                                                         |
| Down from the last visual row, with the caret before its end                        | Reach the end; preserve next-history behavior while already browsing history.                                                                                                              |
| Shift movement across lines and past the first/last row                             | Keep the original anchor; stay within the draft and do not browse history.                                                                                                                 |
| Select all or part, redraw, resize, scroll, and toggle views                        | Selection survives; typing changes exactly that range and undo restores it.                                                                                                                |
| Native character jumps, explicit history actions, and delivered editor page actions | Preserve their native purpose. Fullscreen PageUp/Down stays with Pi's viewport when the host consumes it.                                                                                  |
| Option+Up/Down                                                                      | Keep native Pi behavior, including dequeue where available.                                                                                                                                |

Include punctuation, spaces, tabs, combining characters, emoji, wide characters, and fenced code. Use the [formatted deletion examples](specs/pi-composer.md#testing-decisions) to compare whole, partial, and cross-span selection results through deletion, yank into unformatted text, and undo. Inspect source view to verify retained delimiters; a visually similar result alone is insufficient.

### Effective binding overrides

Quit the isolated Pi process before each configuration case. Back up only `$PI_CHECK_ROOT/agent/keybindings.json`, add the case's binding while preserving the fixture's session bindings, and restart with the same isolated launch. Use a fresh case rather than relying on resource reload to reload keybindings. Restore the backup before continuing the baseline checks. Leave the user's normal Pi and terminal configuration untouched.

| Temporary Pi binding case                                                               | Required result                                                                                                                                              |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `tui.editor.deleteWordBackward` set to `ctrl+alt+w`                                     | The new key deletes once; the old native keys no longer perform this action unless another effective action owns them.                                       |
| `tui.editor.deleteWordBackward` set to `super+a`                                        | A delivered Cmd+A deletes once instead of selecting all. If Ghostty consumes it, record the physical limitation and use public-host tests for the collision. |
| `tui.editor.undo` remapped, explicitly set to its default, then set to an empty list    | Effective bindings work; the extra Cmd+Z alias is suppressed in each case. Fixed redo remains available unless another native owner handles its key.         |
| `tui.editor.cursorLineStart` or `tui.editor.cursorLineEnd` remapped or cleared          | Cmd+Left/Right aliases and their shifted variants are suppressed for that action. Cmd+Up/Down remain draft shortcuts unless another binding owns the chord.  |
| `tui.input.copy`, `tui.input.submit`, or `app.clipboard.pasteImage` remapped or cleared | Each action's old Cmd alias is suppressed. Preserve parent clear/interrupt, picker, and clipboard priority.                                                  |
| `tui.editor.undo` set to `up`, then to `enter`, with in-editor completion open          | Undo occurs before picker movement or acceptance; no completion or request is also sent.                                                                     |
| Native clipboard action remapped with the same fixtures and then without `pi-composer`  | Both editors honor the effective binding. Terminal-generated bracketed paste still follows paste policy independently.                                       |

For extension precedence, use the fixture's Control+Option+S notification and Control+Option+L listener with text selected. Both keep their native effects and cause no fallback edit. Public-host tests must additionally install an accepted extension shortcut on a composer alias key and verify that only the extension acts. The existing fixture does not provide that conflicting registration.

## 2. Native and custom completion, listeners, and surrounding UI

In prose, type `Read @cur`, wait for the native file choice, and accept it. Pass: the inserted `@"current source.md"` is ordinary character-editable text. Move into the name, delete a character, and undo. Type `Apply $rev` and `Apply /rev` in turn and accept the skill choice. Both insert `/skill:review`; inline slash completion opens automatically in the composer.

Press Control+Option+U. Repeat native path and skill completion. Pass: the picker labels include `updated`, retain the earlier provider's labels, and insert the same native text with the caret at the completion result. Escape dismisses a picker without changing text.

Select a prose word and press Control+Option+P. Navigate the overlay choices and accept `Review mixed request`. Pass: `/skill:review` replaces the selection; one effective undo restores it and its selection. Repeat and cancel with Escape. The unchanged draft and selection regain focus. Overlay keys cause no background movement or submission; verify the local request count. The draft, attachment widget, acceptance widget, and normal Pi controls remain usable.

Press Control+Option+L over a selection. Pass: `LISTENER` replaces it through the terminal listener and undoes once. Control+Option+S displays `Acceptance shortcut received` without changing the draft.

## 3. Actual paste routes, cutoff, and explicit actions

Use a draft containing formatted prose, `/skill:review`, a current-file reference, and a final word `Selected`. Select that word before each paste. Copy a fixture with:

```sh
pbcopy < "$PI_CHECK_ROOT/files/small-4999.txt"
```

Repeat with `large-5000.txt` and `large-5001.txt`. Exercise each physical route separately: Ghostty's **Edit → Paste** terminal text route, forwarded **Command+V**, native **Control+V**, a **right-click in the focused main editor**, and the fixture's **Control+Option+E** extension text route.

Pass for each route: 4,999 units stay inline; 5,000 and 5,001 units become a `paste.txt` attachment. The selected word is replaced only after capture succeeds. One Command+Z restores the word and removes the new membership; one Command+Shift+Z restores the same reference and contents. Verify a short paste still stays inline when the rest of the draft is long. Repeat a large paste with the caret inside a fenced code block.

With `large-5001.txt` on the clipboard, Control+Option+V keeps the complete text inline, including inside code. With Control+Option+T, enter `Short /skill:audit` in the text dialog and press Enter. Pass: this short text becomes an attachment. Undo/redo each action once.

Terminal paste and `ui.pasteToEditor` carry plain text. Native clipboard actions additionally inspect copied-file identities and images. A Command+V or right-click gesture that sends bracketed text establishes the terminal text route. Record the native clipboard route separately using the file/image checks below; pasted path text alone is not evidence of a native copied-file action.

Repeat terminal text paste after clearing or remapping the native clipboard binding in the isolated configuration. Pass: delivered bracketed text still follows the cutoff once, while a raw Cmd+V event cannot bypass that override. Restore baseline bindings before using Control+V in section 4. Keep physical routes that Ghostty consumes or transforms distinct from direct-input host checks.

## 4. Copied files, image clipboard, and snapshot previews

Open the temporary fixture folder:

```sh
open "$PI_CHECK_ROOT/files"
```

In Finder select `copied notes.txt` and `red blue.png`, then press Command+C. In Pi select a prose word and press Control+V. Repeat with forwarded Command+V and native right-click, undoing between attempts. Pass: two attachments appear together, using the original file names; accompanying icon/text clipboard data adds no extra attachment. One undo/redo changes the entire set's membership.

Open `red blue.png` in Preview, select the image with Command+A, and copy with Command+C. Paste into Pi with Control+V, then independently check Command+V and right-click. Pass for a native image action: an image attachment and red/blue thumbnail appear. Record the physical route used. A terminal path/text insertion has the text-route result described above.

Keep one copied text snapshot and one image in the mixed draft. In source view, copy each generated absolute snapshot path into the second shell and set `PI_CHECK_TEXT_SNAPSHOT` and `PI_CHECK_IMAGE_SNAPSHOT` to those exact paths. Record their hashes:

```sh
shasum -a 256 "$PI_CHECK_TEXT_SNAPSHOT" "$PI_CHECK_IMAGE_SNAPSHOT" \
  > "$PI_CHECK_ROOT/published-snapshots.sha256"
printf 'Changed copied source\n' > "$PI_CHECK_ROOT/files/copied notes.txt"
printf 'Current source version two\n' > "$PI_CHECK_ROOT/files/current source.md"
```

Pass: Preview text still shows `Captured file /skill:literal`; the current-file reference still names `current source.md`, whose contents now say version two. Thumbnails remain beside the editor and coexist with native and acceptance widgets. Select part or all of the draft while previews load or refresh, then resize Ghostty narrower and wider. Pass: image display does not move focus or clear the selection; typing replaces the selected range and one undo restores it. Repeat in both views. Pi's native widget and image component supply these previews.

## 5. Mouse selection, scrolling, and resize

Keep attachment references in the draft. Copy `scroll.md` with `pbcopy` and append it using Paste Inline. Drag across formatted words and a wrapped Unicode row, then type a replacement. Pass: the intended source range changes; Command+Z restores its Markdown and whole graphemes.

Select part of the final row, scroll up with the mouse wheel, resize the window, and type a replacement. Pass: scrolling and resize preserve the selection; editing reveals the caret and changes the selected source range. Toggle source view and undo/redo. Repeat a drag in fenced code. Click and navigate the custom picker while the image widget is present; only the focused picker receives the action.

## 6. Opaque text, Preview, Restore Inline, and Remove

Build the mixed draft from `draft.md`, a pasted `large-5000.txt` attachment, the copied file, and one image. Submit with Command+Enter. Pass: the local reply reports `review=1, audit=0, literal=0` and the intended image count. Inspect the latest `request-N.json`: it contains readable snapshot references, the current-file path, and native image content. The attached text body remains on disk.

Use Command+Z to recover the submitted draft. Select a final prose word, press Control+Option+A, choose `paste.txt`, then **Preview text**. Scroll the preview and close it with Escape. Pass: the selected draft is unchanged. Open the same attachment and choose **Restore Inline**. Pass: its full body replaces the selection, its reference leaves membership, and the image/file attachments remain. It stays inline at 5,000 units. One undo/redo restores both selection and membership.

While the preview or management overlay is focused, test its navigation, acceptance, and cancellation keys. Pass: the background caret, selection, and request count do not change. Cancel management without choosing an action and verify the editor regains the same selection. Repeat while an image widget is visible.

Submit the restored draft. Pass: `review=1, audit=1, literal=0`. The restored prose invokes `audit` once; its fenced `/skill:literal` stays literal. Recover the draft, use **Remove from draft**, then undo/redo. Pass: only the selected snapshot's membership changes, and the saved bytes remain readable:

```sh
shasum -a 256 -c "$PI_CHECK_ROOT/published-snapshots.sha256"
```

## 7. Normal, steer, follow-up, and later edits

Normal submission was exercised above. To hold the next response, run:

```sh
touch "$PI_CHECK_ROOT/model.hold"
```

Submit `Hold this response`. While Pi is waiting, prepare a mixed draft with repeated `/skill:review`, a text snapshot, and an image. Command+Enter steers the current response. Pass: native queued-message UI shows the intended request. Type a separate later draft, then release the response:

```sh
rm "$PI_CHECK_ROOT/model.hold"
```

Pass: the queued request is delivered with one review instruction block and its intended images, and the later draft stays intact. Repeat with **Option+Enter** for native follow-up. Inspect `request-N.json` for the queued user's text/images. The automatic combined tests also check input transformations registered before skill expansion and after attachment delivery.

## 8. Session switches, reload, restart, and failures

Prepare an unsent mixed draft in session A. Press the temporary native binding Control+Option+N, submit `Start session B`, and prepare different text in B. Control+Option+R opens the native session picker; select A. Pass: A's text, references, images, and history return; undo/redo never affects B. Repeat the round trip. Control+Option+Y reloads resources with the current draft intact; undo/redo still belongs to this session.

Use Control+Option+Q to quit with A's draft intact. In the first shell:

```sh
pi_ticket22 --continue
```

Pass: the last session's draft and snapshots return, with fresh undo history. Quit again, then use the native startup picker:

```sh
pi_ticket22 --resume
```

Select the intended session. To reopen an exact file, list `rg --files "$PI_CHECK_ROOT/sessions"`, set `PI_CHECK_SESSION_A` to A's actual JSONL path, and run:

```sh
pi_ticket22 --session "$PI_CHECK_SESSION_A"
```

For pending work, hold a local response, submit a mixed request, then use Control+Option+N and type unrelated text in the new session. Release the hold. Pass: the outgoing request's snapshots/recovery stay readable and the new draft remains unchanged.

For an actual model failure, create both controls before submitting a mixed request:

```sh
touch "$PI_CHECK_ROOT/model.hold" "$PI_CHECK_ROOT/model.fail"
```

While the request is pending, type a later draft, then remove `model.hold`. Pass: Pi displays `Acceptance model failure` and preserves the later text. Control+Option+D opens composer recovery; choose the failed original draft. Pass: its complete text/membership returns, and undo restores the later draft. Remove the failure control before continuing:

```sh
rm "$PI_CHECK_ROOT/model.fail"
```

For an actual snapshot write failure, keep a word selected, then run `chmod 500 "$PI_CHECK_ROOT/agent/pi-attachments"`. Paste `large-5000.txt` through Control+V. Pass: Pi reports the filesystem error and offers **Retry save**, with the selected source text preserved. Run `chmod 700 "$PI_CHECK_ROOT/agent/pi-attachments"` and accept **Retry save**. Pass: the complete capture enters as one undoable edit.

For a draft-save failure, run `chmod 500 "$PI_CHECK_ROOT/agent/pi-composer/drafts"`, edit the mixed draft, and press Control+Option+N. Pass: Pi reports the error, cancels the switch, and keeps the edited draft. Restore permission with `chmod 700 "$PI_CHECK_ROOT/agent/pi-composer/drafts"`, then repeat the switch and resume A. Pass: the complete edited draft returns. Recovery data held only in process memory needs a successful retry before quitting.

## 9. Conservative cleanup and native-editor independence

Run Control+Option+C while a mixed draft and recoverable failed request exist. Remove an attachment, run cleanup again, and undo its removal. Pass: cleanup reports exact files/bytes removed and failures; every snapshot added to a draft and all recovery-associated or uncertain data remain readable. Recheck `published-snapshots.sha256`. Successful capture/recovery records remain retained. The automated cleanup suite separately proves reclamation of eligible unpublished captures and partial-failure reporting.

Quit with Control+Option+Q. For a native-editor run, use the same launch command with the `pi-composer/src/index.ts` `-e` pair removed and `--name "ticket22 native"`. Keep the other three packages and the acceptance fixture loaded. Repeat canonical skill completion, the cutoff, Paste Inline, copied files, image paste, text preview/restoration, and submission. Native inline `/` completion uses Tab. Native inline tabs expand to four spaces and line endings normalize to LF; snapshot bytes remain exact.

For a run with composition extensions disabled, launch the local Pi binary with the same isolated agent/model/session flags and `--no-extensions`, with no `-e` arguments. Open A through `--session "$PI_CHECK_SESSION_A"`. Pass: retained submitted text/references and snapshot files remain readable. The saved composer draft remains in the session and `agent/pi-composer/drafts`; re-enabling the original launch restores it. Exit the empty native editor with Control+D. The automated replacement scenario also checks public editor replacement and restoring the supported decorator chain.

## Record and retain evidence

Before finishing, switch panes, enter and return from Pi's external editor, suspend/resume Pi, reload resources and Ghostty configuration, and exit. In the baseline and after explicit removal/reload, verify the pre-existing terminal behavior. While the setup block is installed, verify its documented persistent forwarding outside Pi. Record the configuration phase for every result; Pi lifecycle events do not remove that block.

For each numbered check, record pass/fail/pending, the checkout commit, Pi and macOS/Ghostty versions, relevant bindings, the load order, the actual physical gesture, observed input route, and any error. Record editor correctness separately from physical delivery; keep an unknown route unknown. Retain the temporary directory, relevant `request-N.json` files, session paths, snapshot hashes, and screenshots of graphics/layout failures. A native clipboard result identifies whether Pi received clipboard metadata or terminal text. Keep unexercised physical routes and terminal undo states pending.

Run the software checks from the repository root:

```sh
pnpm run format:check
pnpm run lint
pnpm run typecheck
pnpm exec tsc --noEmit -p packages/pi-composer/tsconfig.json
pnpm test
```

After recording evidence and quitting Pi, stop the local server in its original shell with `kill "$PI_CHECK_SERVER_PID"`. The temporary directory can be removed with `rm -rf "$PI_CHECK_ROOT"` after its evidence is retained.
