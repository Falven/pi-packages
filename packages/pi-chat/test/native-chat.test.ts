import assert from "node:assert/strict"
import test from "node:test"
import { writeFile } from "node:fs/promises"
import { join } from "node:path"
import {
  getNativeClipboard,
  Input,
  MouseRegion,
  Text,
  TuiAltScreen,
  stripTerminalSequences,
  type NativeClipboard,
} from "@earendil-works/pi-tui"
import { openNativeHost } from "../../../fixtures/native-host.ts"
import { installReplacement, observed } from "./fixtures/root-owner.ts"

const chat = new URL("../src/index.ts", import.meta.url).pathname
const rootOwner = new URL("./fixtures/root-owner.ts", import.meta.url).pathname
const ownedRoot = () => observed.host?.fullscreenLayoutRoot

function assertWritableClipboard(
  clipboard: NativeClipboard | undefined,
): asserts clipboard is NativeClipboard &
  Required<Pick<NativeClipboard, "setText">> {
  assert(clipboard?.setText)
}

test("native chat keeps the live answer, composer, and provider content", async (t) => {
  const host = await openNativeHost(t, { extensionPaths: [chat] })
  await host.type("Hello")
  await host.key("\r")
  await host.settled()

  const frame = await host.frame()
  assert.match(frame, /Hello/)
  assert.match(frame, /Received\./)
  assert.match(frame, /draft-test/)
  assert.equal(host.requests[0]?.messages.at(-1)?.role, "user")
  assert.match(
    JSON.stringify(host.requests[0]?.messages.at(-1)?.content),
    /Hello/,
  )
  assert.doesNotMatch(frame, /pi-chat requires|pi-chat cannot/)
})

test("native Markdown transforms still apply without changing stored or requested text", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    extensionFactories: [
      (pi) =>
        pi.registerMarkdownTransformer((markdown) =>
          markdown.replace("Received.", "Rendered by extension"),
        ),
    ],
  })
  await host.type("Transform")
  await host.key("\r")
  await host.settled()

  assert.match(await host.frame(), /Rendered by extension/)
  assert.equal(
    host.session.messages.findLast((message) => message.role === "assistant")
      ?.content[0]?.type,
    "text",
  )
  assert.match(JSON.stringify(host.session.messages.at(-1)), /Received\./)
  assert.doesNotMatch(JSON.stringify(host.requests[0]), /Rendered by extension/)
})

test("switching sessions rebuilds the visible native conversation", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    persistSession: true,
  })
  await host.type("First session")
  await host.key("\r")
  await host.settled()
  const first = host.session.sessionFile!

  await host.runtime.newSession()
  assert.doesNotMatch(await host.frame(), /First session/)
  await host.type("Second session")
  await host.key("\r")
  await host.settled()
  await host.runtime.switchSession(first)

  const frame = await host.frame()
  assert.match(frame, /First session/)
  assert.doesNotMatch(frame, /Second session/)
  assert.match(frame, /Received\./)
})

test("reloading extensions rebinds the current native conversation", async (t) => {
  const host = await openNativeHost(t, { extensionPaths: [chat] })
  await host.type("Before reload")
  await host.key("\r")
  await host.settled()

  await host.reload()
  const frame = await host.frame()
  assert.match(frame, /Before reload/)
  assert.match(frame, /Received\./)
  assert.doesNotMatch(frame, /pi-chat requires|pi-chat cannot|Reload failed/)

  await host.type("After reload")
  await host.key("\r")
  await t.waitFor(() => assert.equal(host.requests.length, 2))
  assert.match(await host.frame(), /After reload/)
})

test("Pi's compacted replay remains canonical in the owned view", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    persistSession: true,
    rows: 40,
  })
  await host.type("Retained before compaction")
  await host.key("\r")
  await host.settled()
  const file = host.session.sessionFile!
  host.session.sessionManager.appendCompaction("Compressed context", null, 100)

  await host.runtime.newSession()
  await host.runtime.switchSession(file)
  const frame = await host.frame()
  assert.match(frame, /Compacted from 100 tokens/)
  assert.doesNotMatch(frame, /Retained before compaction/)
  assert.match(
    JSON.stringify(host.session.sessionManager.getBranch()),
    /Retained before compaction/,
  )
})

test("native tool calls and results survive session replay without rerunning the tool", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    persistSession: true,
    rows: 44,
  })
  await writeFile(
    join(host.directory, "note.txt"),
    "Retained native tool result",
  )
  host.queueResponse(
    {
      event: {
        choices: [
          {
            index: 0,
            delta: {
              role: "assistant",
              tool_calls: [
                {
                  index: 0,
                  id: "retained-call",
                  type: "function",
                  function: { name: "read", arguments: '{"path":"note.txt"}' },
                },
              ],
            },
            finish_reason: null,
          },
        ],
      },
    },
    {
      event: {
        choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }],
      },
    },
    { event: "[DONE]" },
    { end: true },
  )
  await host.type("Read the note")
  await host.key("\r")
  await t.waitFor(() => assert.equal(host.requests.length, 2))
  await host.settled()
  const file = host.session.sessionFile!

  await host.runtime.newSession()
  await host.runtime.switchSession(file)
  await host.key("\u000f")
  const frame = await host.frame()
  assert.match(frame, /read note\.txt/)
  assert.match(frame, /Retained native tool result/)
  assert.equal(host.requests.length, 2)
})

test("native custom renderers keep equal occurrences distinct", async (t) => {
  const sendRef: { current?: () => void } = {}
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    extensionFactories: [
      (pi) => {
        pi.registerEntryRenderer(
          "test.entry",
          () => new Text("Rendered entry", 0, 0),
        )
        pi.registerMessageRenderer(
          "test.message",
          () => new Text("Repeated custom message", 0, 0),
        )
        sendRef.current = () => {
          pi.appendEntry("test.entry", { value: 1 })
          pi.sendMessage(
            { customType: "test.message", content: "same", display: true },
            { triggerTurn: false },
          )
          pi.sendMessage(
            { customType: "test.message", content: "same", display: true },
            { triggerTurn: false },
          )
        }
      },
    ],
  })
  assert(sendRef.current)
  sendRef.current()
  const frame = await host.frame()
  assert.match(frame, /Rendered entry/)
  assert.equal(frame.match(/Repeated custom message/g)?.length, 2)
  const entries = host.session.sessionManager
    .getBranch()
    .filter((entry) => entry.type === "custom_message")
  assert.equal(entries.length, 2)
  assert.notEqual(entries[0]?.id, entries[1]?.id)
  assert.equal(host.requests.length, 0)
})

test("native shell output remains a persisted standalone conversation row", async (t) => {
  const host = await openNativeHost(t, { extensionPaths: [chat] })
  await host.type("!printf ShellOwned")
  await host.key("\r")
  await t.waitFor(() => {
    assert(
      host.session.sessionManager
        .getBranch()
        .some(
          (entry) =>
            entry.type === "message" && entry.message.role === "bashExecution",
        ),
    )
  })
  const frame = await host.frame()
  assert.match(frame, /printf ShellOwned/)
  assert.match(frame, /ShellOwned/)
  assert.equal(host.requests.length, 0)
})

test("shell output queued during streaming joins its native row after persistence", async (t) => {
  const host = await openNativeHost(t, { extensionPaths: [chat] })
  host.queueResponse(
    {
      event: {
        choices: [
          {
            index: 0,
            delta: { role: "assistant", reasoning_content: "Working" },
            finish_reason: null,
          },
        ],
      },
    },
    { pause: true },
    {
      event: {
        choices: [
          { index: 0, delta: { content: "Finished" }, finish_reason: null },
        ],
      },
    },
    { event: { choices: [{ index: 0, delta: {}, finish_reason: "stop" }] } },
    { event: "[DONE]" },
    { end: true },
  )
  await host.type("Start")
  await host.key("\r")
  await t.waitFor(() => assert.equal(host.session.isStreaming, true))
  await host.type("!printf DeferredShell")
  await host.key("\r")
  await t.waitFor(() => assert.equal(host.session.hasPendingBashMessages, true))
  host.resumeResponse()
  await host.settled()
  const bash = host.session.sessionManager
    .getBranch()
    .find(
      (entry) =>
        entry.type === "message" && entry.message.role === "bashExecution",
    )
  assert(
    bash && bash.type === "message" && bash.message.role === "bashExecution",
  )
  assert.match(bash.message.output, /DeferredShell/)
  assert.match(await host.frame(), /DeferredShell/)
})

test("regular mode keeps native history and switching to fullscreen mounts owned chat", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    tuiMode: "regular",
  })
  await host.type("Regular mode")
  await host.key("\r")
  await host.settled()
  assert.match(await host.frame(), /Received\./)
  assert.equal(host.switchMode("fullscreen"), true)
  const fullscreen = await host.frame()
  assert.match(fullscreen, /Regular mode/)
  assert.match(fullscreen, /Received\./)
  assert.match(fullscreen, /draft-test/)
  await host.type("Fullscreen follow-up")
  await host.key("\r")
  await t.waitFor(() => assert.equal(host.requests.length, 2))
  assert.match(await host.frame(), /Fullscreen follow-up/)
  assert.equal(host.switchMode("regular"), true)
  assert.match(await host.frame(), /Received\./)
})

test("a prior fullscreen owner prevents activation without losing its root", async (t) => {
  delete observed.host
  delete observed.replacement
  observed.notifications.length = 0
  observed.errors.length = 0
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    onMount: (interactive) => {
      const mode = interactive as unknown as {
        showError(message: string): void
      }
      const showError = mode.showError
      mode.showError = (message) => {
        observed.errors.push(message)
        showError.call(interactive, message)
      }
      installReplacement(interactive)
    },
  })
  assert.match(await host.frame(), /Other owner active/)
  assert(
    [...observed.notifications, ...observed.errors].some((message) =>
      /requires the unowned Pi 1\.0\.2 fullscreen chat host/.test(message),
    ),
  )
  assert.equal(ownedRoot(), observed.replacement)
  await host.close()
  assert.equal(ownedRoot(), observed.replacement)
})

test("cleanup leaves a later fullscreen owner's replacement intact", async (t) => {
  delete observed.host
  delete observed.replacement
  observed.notifications.length = 0
  observed.errors.length = 0
  const host = await openNativeHost(t, { extensionPaths: [chat, rootOwner] })
  assert.match(await host.frame(), /Other owner active/)
  assert.equal(ownedRoot(), observed.replacement)
  await host.close()
  assert.equal(ownedRoot(), observed.replacement)
})

test("page navigation scrolls native chat while the composer stays usable", async (t) => {
  const sendRef: { current?: () => void } = {}
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    rows: 16,
    extensionFactories: [
      (pi) => {
        pi.registerEntryRenderer(
          "test.long",
          () =>
            new Text(
              Array.from(
                { length: 32 },
                (_, n) =>
                  `${n === 10 ? "\x1b]133;A\x07" : ""}chat-row-${String(n).padStart(2, "0")}`,
              ).join("\n"),
              0,
              0,
            ),
        )
        sendRef.current = () => pi.appendEntry("test.long", {})
      },
    ],
  })
  assert(sendRef.current)
  sendRef.current()
  assert.match(await host.frame(), /chat-row-31/)
  await host.key("\x1b[5~")
  assert.match(await host.frame(), /chat-row-1[0-9]/)
  await host.key("\x1b[5~")
  await host.key("\x1b[5~")
  await host.key("\x1b[5~")
  assert.match(await host.frame(), /chat-row-00/)
  await host.type("Composer still works")
  assert.match(await host.frame(), /Composer still works/)
  await host.key("\x1b[F")
  await host.key("\x1b[1;5A")
  await host.frame()
  assert.match(
    stripTerminalSequences(host.screenLines()[0] ?? ""),
    /chat-row-10/,
  )
  assert.equal(host.switchMode("regular"), true)
  assert.equal(host.switchMode("fullscreen"), true)
  await host.frame()
  await host.key("\x1b[H")
  assert.match(await host.frame(), /chat-row-00/)
})

test("selecting through offscreen native rows copies Unicode through Pi's clipboard", async (t) => {
  const clipboard = getNativeClipboard()
  assertWritableClipboard(clipboard)
  let copied = ""
  t.mock.method(clipboard, "setText", async (text: string) => {
    copied = text
  })
  const sendRef: { current?: () => void } = {}
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    rows: 17,
    extensionFactories: [
      (pi) => {
        pi.registerEntryRenderer(
          "test.selection-start",
          () =>
            new Text(
              [
                "copy-A界",
                ...Array.from(
                  { length: 10 },
                  (_, n) => `copy-row-${String(n).padStart(2, "0")}`,
                ),
              ].join("\n"),
              0,
              0,
            ),
        )
        pi.registerEntryRenderer(
          "test.selection-end",
          () =>
            new Text(
              [
                ...Array.from(
                  { length: 10 },
                  (_, n) => `copy-row-${String(n + 10).padStart(2, "0")}`,
                ),
                "copy-Z",
              ].join("\n"),
              0,
              0,
            ),
        )
        sendRef.current = () => {
          pi.appendEntry("test.selection-start", {})
          pi.appendEntry("test.selection-end", {})
        }
      },
    ],
  })
  assert(sendRef.current)
  sendRef.current()
  await host.frame()
  await host.key("\x1b[H")
  await host.frame()
  const first = host
    .screenLines()
    .findIndex((line) => stripTerminalSequences(line).includes("copy-A界"))
  assert(first >= 0)
  await host.key(`\x1b[<0;1;${first + 1}M`)
  // oxlint-disable-next-line eslint/no-await-in-loop -- Mouse gestures must preserve terminal order.
  for (let n = 0; n < 18; n++) await host.key(`\x1b[<65;1;${first + 1}M`)
  await host.frame()
  const last = host
    .screenLines()
    .findIndex((line) => stripTerminalSequences(line).includes("copy-Z"))
  assert(last >= 0)
  await host.key(`\x1b[<32;6;${last + 1}M`)
  await host.key(`\x1b[<0;6;${last + 1}m`)
  await t.waitFor(() => assert(copied))
  assert.match(copied, /^copy-A界\ncopy-row-00/)
  assert.match(copied, /copy-row-19\ncopy-Z$/)
})

test("message copy prefers a retained selection and resize clears it", async (t) => {
  const clipboard = getNativeClipboard()
  assertWritableClipboard(clipboard)
  let copied = ""
  t.mock.method(clipboard, "setText", async (text: string) => {
    copied = text
  })
  const sendRef: { current?: () => void } = {}
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    rows: 20,
    settings: { fullscreenCopyOnSelect: false },
    extensionFactories: [
      (pi) => {
        pi.registerEntryRenderer(
          "test.copy",
          () => new Text("copy-first 界\ncopy-second", 0, 0),
        )
        sendRef.current = () => pi.appendEntry("test.copy", {})
      },
    ],
  })
  await host.type("Make an answer")
  await host.key("\r")
  await host.settled()
  assert(sendRef.current)
  sendRef.current()
  await host.frame()
  const lines = host.screenLines().map(stripTerminalSequences)
  const first = lines.findIndex((line) => line.includes("copy-first 界"))
  const second = lines.findIndex((line) => line.includes("copy-second"))
  assert(first >= 0 && second > first)
  await host.key(`\x1b[<0;1;${first + 1}M`)
  await host.key(`\x1b[<32;12;${second + 1}M`)
  await host.key(`\x1b[<0;12;${second + 1}m`)
  assert.equal(copied, "")
  await host.key("\x18")
  await t.waitFor(() => assert.equal(copied, "copy-first 界\ncopy-second"))
  await host.key("\x1b[5~")
  await host.key("\x18")
  assert.equal(copied, "copy-first 界\ncopy-second")
  host.terminal.resize(42, 20)
  await host.frame()
  await host.key("\x18")
  await t.waitFor(() => assert.equal(copied, "Received."))
})

test("changing selected rendered content clears the native selection", async (t) => {
  const clipboard = getNativeClipboard()
  assertWritableClipboard(clipboard)
  let copied = ""
  t.mock.method(clipboard, "setText", async (text: string) => {
    copied = text
  })
  const sendRef: { current?: () => void } = {}
  let rendered: Text | undefined
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    rows: 20,
    settings: { fullscreenCopyOnSelect: false },
    extensionFactories: [
      (pi) => {
        pi.registerEntryRenderer("test.mutable-selection", () => {
          rendered = new Text("before selected", 0, 0)
          return rendered
        })
        sendRef.current = () => pi.appendEntry("test.mutable-selection", {})
      },
    ],
  })
  await host.type("Make an answer")
  await host.key("\r")
  await host.settled()
  assert(sendRef.current)
  sendRef.current()
  await host.frame()
  const row = host
    .screenLines()
    .findIndex((line) =>
      stripTerminalSequences(line).includes("before selected"),
    )
  assert(row >= 0)
  await host.key(`\x1b[<0;1;${row + 1}M`)
  await host.key(`\x1b[<32;7;${row + 1}M`)
  await host.key(`\x1b[<0;7;${row + 1}m`)
  await host.key("\x18")
  await t.waitFor(() => assert.equal(copied, "before"))
  assert(rendered)
  rendered.setText("after selected")
  await host.frame()
  await host.key("\x18")
  await t.waitFor(() => assert.equal(copied, "Received."))
})

test("native child pointer handlers receive source rows and focused overlays keep priority", async (t) => {
  const sendRef: { current?: () => void } = {}
  const clicked: number[] = []
  let renderer: TuiAltScreen | undefined
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    rows: 17,
    onMount: (interactive) => {
      renderer = (interactive as unknown as { renderer: TuiAltScreen }).renderer
    },
    extensionFactories: [
      (pi) => {
        pi.registerEntryRenderer(
          "test.pointer",
          () =>
            new MouseRegion(
              new Text(
                Array.from(
                  { length: 28 },
                  (_, n) => `pointer-${String(n).padStart(2, "0")}`,
                ).join("\n"),
                0,
                0,
              ),
              (event) => {
                if (event.type === "click") clicked.push(event.y)
                return event.type === "press" || event.type === "click"
                  ? { handled: true }
                  : undefined
              },
            ),
        )
        sendRef.current = () => pi.appendEntry("test.pointer", {})
      },
    ],
  })
  assert(sendRef.current && renderer)
  sendRef.current()
  await host.frame()
  const target = host
    .screenLines()
    .findIndex((line) => stripTerminalSequences(line).includes("pointer-20"))
  assert(target >= 0)
  await host.key(`\x1b[<0;1;${target + 1}M`)
  await host.key(`\x1b[<0;1;${target + 1}m`)
  assert.deepEqual(clicked, [20])
  const before = renderer.viewportTop
  const overlay = renderer.showOverlay(new Input({ prompt: "Overlay" }))
  await host.key("\x1b[5~")
  assert.equal(renderer.viewportTop, before)
  overlay.hide()
  await host.key("\x1b[5~")
  assert(renderer.viewportTop < before)
})

test("reflow keeps the first visible native occurrence and following end", async (t) => {
  const sendRef: { current?: () => void } = {}
  let prelude: Text | undefined
  let renderer: TuiAltScreen | undefined
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    rows: 18,
    onMount: (interactive) => {
      renderer = (interactive as unknown as { renderer: TuiAltScreen }).renderer
    },
    extensionFactories: [
      (pi) => {
        pi.registerEntryRenderer("test.prelude", () => {
          prelude = new Text(
            Array.from({ length: 10 }, (_, n) => `prelude-${n}`).join("\n"),
            0,
            0,
          )
          return prelude
        })
        pi.registerEntryRenderer(
          "test.target",
          () =>
            new Text(
              Array.from(
                { length: 40 },
                (_, n) => `target-${String(n).padStart(2, "0")}`,
              ).join("\n"),
              0,
              0,
            ),
        )
        sendRef.current = () => {
          pi.appendEntry("test.prelude", {})
          pi.appendEntry("test.target", {})
        }
      },
    ],
  })
  assert(sendRef.current && renderer)
  sendRef.current()
  await host.frame()
  renderer.scrollToTop()
  renderer.scrollBy(16)
  await host.frame()
  const first = stripTerminalSequences(host.screenLines()[0] ?? "")
  assert.match(first, /target-0[0-9]/)
  assert(prelude)
  prelude.setText(
    Array.from({ length: 17 }, (_, n) => `prelude-${n}`).join("\n"),
  )
  await host.frame()
  assert.equal(stripTerminalSequences(host.screenLines()[0] ?? ""), first)
  renderer.scrollToBottom()
  await host.frame()
  prelude.setText(
    Array.from({ length: 21 }, (_, n) => `prelude-${n}`).join("\n"),
  )
  await host.frame()
  assert.match(stripTerminalSequences(host.screenLines().join("")), /target-39/)
})

test("dragging at the chat edge reveals offscreen rows for selection", async (t) => {
  const sendRef: { current?: () => void } = {}
  let renderer: TuiAltScreen | undefined
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    rows: 16,
    settings: { fullscreenCopyOnSelect: false },
    onMount: (interactive) => {
      renderer = (interactive as unknown as { renderer: TuiAltScreen }).renderer
    },
    extensionFactories: [
      (pi) => {
        pi.registerEntryRenderer(
          "test.drag",
          () =>
            new Text(
              Array.from(
                { length: 36 },
                (_, n) => `drag-row-${String(n).padStart(2, "0")}`,
              ).join("\n"),
              0,
              0,
            ),
        )
        sendRef.current = () => pi.appendEntry("test.drag", {})
      },
    ],
  })
  assert(sendRef.current && renderer)
  sendRef.current()
  await host.frame()
  await host.key("\x1b[H")
  await host.frame()
  const first = host
    .screenLines()
    .findIndex((line) => stripTerminalSequences(line).includes("drag-row-00"))
  const bottom = host
    .screenLines()
    .findLastIndex((line) => /drag-row-\d+/.test(stripTerminalSequences(line)))
  assert(first >= 0 && bottom > first)
  await host.key(`\x1b[<0;1;${first + 1}M`)
  await host.key(`\x1b[<32;1;${bottom + 1}M`)
  await t.waitFor(() => assert(renderer!.viewportTop > 0))
  await host.key(`\x1b[<0;1;${bottom + 1}m`)
})
