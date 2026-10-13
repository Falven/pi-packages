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
  sliceByColumn,
  stripTerminalSequences,
  visibleWidth,
  type NativeClipboard,
} from "@earendil-works/pi-tui"
import { createReadToolDefinition } from "@earendil-works/pi-coding-agent"
import { openNativeHost } from "../../../fixtures/native-host.ts"
import { installReplacement, observed } from "./fixtures/root-owner.ts"

const chat = new URL("../src/index.ts", import.meta.url).pathname
const rootOwner = new URL("./fixtures/root-owner.ts", import.meta.url).pathname
const ownedRoot = () => observed.host?.fullscreenLayoutRoot
const readDelta = (id: string, path: string) => ({
  event: {
    choices: [
      {
        index: 0,
        delta: {
          role: "assistant",
          tool_calls: [
            {
              index: 0,
              id,
              type: "function",
              function: { name: "read", arguments: JSON.stringify({ path }) },
            },
          ],
        },
        finish_reason: null,
      },
    ],
  },
})
const readPairDelta = (
  prefix: string,
  first = "one.txt",
  second = "two.txt",
) => ({
  event: {
    choices: [
      {
        index: 0,
        delta: {
          role: "assistant",
          tool_calls: [
            {
              index: 0,
              id: `${prefix}-one`,
              type: "function",
              function: {
                name: "read",
                arguments: JSON.stringify({ path: first }),
              },
            },
            {
              index: 1,
              id: `${prefix}-two`,
              type: "function",
              function: {
                name: "read",
                arguments: JSON.stringify({ path: second }),
              },
            },
          ],
        },
        finish_reason: null,
      },
    ],
  },
})
const toolFinish = {
  event: { choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }] },
}
const done = { event: "[DONE]" }
const end = { end: true } as const

async function openWork(
  host: Awaited<ReturnType<typeof openNativeHost>>,
  cancel = "\x1b",
) {
  await host.frame()
  const row = host
    .screenLines()
    .findIndex((line) => stripTerminalSequences(line).includes("▸ Worked"))
  assert(row >= 0)
  await host.key(`\x1b[<0;2;${row + 1}M`)
  await host.key(`\x1b[<0;2;${row + 1}m`)
  await host.key(cancel)
  await host.frame()
}

function assertWritableClipboard(
  clipboard: NativeClipboard | undefined,
): asserts clipboard is NativeClipboard &
  Required<Pick<NativeClipboard, "setText">> {
  assert(clipboard?.setText)
}

test("native chat right-aligns user messages and keeps the answer, composer, and source content", async (t) => {
  const clipboard = getNativeClipboard()
  assertWritableClipboard(clipboard)
  let copied = ""
  t.mock.method(clipboard, "setText", async (text: string) => {
    copied = text
  })
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    settings: { fullscreenCopyOnSelect: false },
  })
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
  const lines = host.screenLines().map(stripTerminalSequences)
  const row = lines.findIndex((line) => line.trim() === "Hello")
  assert(row >= 0)
  const column = lines[row]!.indexOf("Hello")
  assert.equal(column, host.terminal.columns - "Hello".length - 1)
  // oxlint-disable-next-line eslint/no-control-regex -- The native background still spans the first cell.
  assert.match(sliceByColumn(host.screenLines()[row]!, 0, 1, true), /\x1b\[48;/)
  assert.equal(
    lines.find((line) => line.includes("Received."))?.indexOf("Received."),
    1,
  )
  await host.key(`\x1b[<0;${column + 1};${row + 1}M`)
  await host.key(`\x1b[<32;${column + 5};${row + 1}M`)
  await host.key(`\x1b[<0;${column + 5};${row + 1}m`)
  await host.key("\x18")
  await t.waitFor(() => assert.equal(copied, "Hello"))
})

test("native Markdown transforms still apply without changing stored or requested text", async (t) => {
  const clipboard = getNativeClipboard()
  assertWritableClipboard(clipboard)
  let copied = ""
  t.mock.method(clipboard, "setText", async (text: string) => {
    copied = text
  })
  const widths: number[] = []
  const prose =
    "Aligned **界** content retains the full native wrapping width and Markdown layout while the user text moves to the right within its bar."
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    rows: 34,
    settings: { fullscreenCopyOnSelect: false },
    keybindings: { "tui.altScreen.previousPrompt": "alt+up" },
    extensionFactories: [
      (pi) =>
        pi.registerMarkdownTransformer((markdown, context) => {
          if (markdown === "Transform") {
            widths.push(context.availableWidth)
            return prose
          }
          return markdown.replace("Received.", "Rendered by extension")
        }),
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
  assert.doesNotMatch(JSON.stringify(host.requests[0]), /Aligned/)
  assert.equal(widths.at(-1), 58)
  let lines = host.screenLines().map(stripTerminalSequences)
  let first = lines.findIndex((line) => line.includes("Aligned 界"))
  assert(first >= 0)
  const column = lines[first]!.indexOf("Aligned")
  assert(column >= 1)
  assert.equal(lines[first + 1]!.search(/\S/), column)
  const last = lines.findIndex((line, row) => row > first && !line.trim()) - 1
  assert(last > first)
  const lastColumn = visibleWidth(lines[last]!.trimEnd())
  await host.key(`\x1b[<0;${column + 1};${first + 1}M`)
  await host.key(`\x1b[<32;${lastColumn};${last + 1}M`)
  await host.key(`\x1b[<0;${lastColumn};${last + 1}m`)
  await host.key("\x18")
  await t.waitFor(() => assert(copied))
  assert.equal(copied.replace(/\s+/g, " "), prose.replaceAll("**", ""))
  assert(copied.split("\n").every((line) => line.search(/\S/) <= 1))
  host.terminal.resize(32, 34)
  await host.frame()
  assert.equal(widths.at(-1), 30)
  lines = host.screenLines().map(stripTerminalSequences)
  first = lines.findIndex((line) => line.includes("Aligned 界"))
  assert(first >= 0)
  const narrowColumn = lines[first]!.indexOf("Aligned")
  assert(narrowColumn >= 1)
  assert.equal(lines[first + 1]!.search(/\S/), narrowColumn)
  host.terminal.resize(32, 10)
  await host.frame()
  await host.key("\x1b[1;3A")
  await host.frame()
  await host.key("\x1b[1;3A")
  assert.match(await host.frame(), /Aligned/)
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
  await openWork(host)
  await host.key("\u000f")
  const frame = await host.frame()
  assert.match(frame, /read note\.txt/)
  assert.match(frame, /Retained native tool result/)
  assert.equal(host.requests.length, 2)
})

test("consecutive native calls start as one closed group and open from the composer", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    rows: 44,
    onMount: (interactive) => {
      const mode = interactive as unknown as {
        version: string
        fullscreenLayoutRoot: {
          addChild(component: Text): void
        }
      }
      mode.version = "unversioned"
      mode.fullscreenLayoutRoot.addChild(new Text("Native status row", 0, 0))
    },
  })
  await writeFile(join(host.directory, "one.txt"), "FIRST TOOL BODY")
  await writeFile(join(host.directory, "two.txt"), "SECOND TOOL BODY")
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
                  id: "first",
                  type: "function",
                  function: { name: "read", arguments: '{"path":"one.txt"}' },
                },
                {
                  index: 1,
                  id: "second",
                  type: "function",
                  function: { name: "read", arguments: '{"path":"two.txt"}' },
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
  await host.type("Read both")
  await host.key("\r")
  await host.settled()
  await openWork(host)
  const screen = () => host.screenLines().map(stripTerminalSequences).join("\n")
  await host.frame()
  assert.match(screen(), /Native status row/)
  assert.match(screen(), /2 tool calls.*read/)
  assert.doesNotMatch(screen(), /read one\.txt|read two\.txt/)
  await host.key("\x1bg")
  await host.key("\r")
  await host.frame()
  assert.match(screen(), /read one\.txt/)
  assert.match(screen(), /read two\.txt/)
  await host.key("\u000f")
  await host.frame()
  assert.match(screen(), /FIRST TOOL BODY/)
  await host.key("\r")
  await host.frame()
  assert.doesNotMatch(screen(), /read one\.txt|FIRST TOOL BODY/)
  await host.key("\r")
  await host.frame()
  assert.match(screen(), /FIRST TOOL BODY/)
  await host.key("\u000f")
  await host.frame()
  assert.doesNotMatch(screen(), /read one\.txt|FIRST TOOL BODY/)
  await host.key("\r")
  await host.frame()
  assert.match(screen(), /read one\.txt/)
  assert.doesNotMatch(screen(), /FIRST TOOL BODY/)
  await host.reload()
  await openWork(host)
  await host.frame()
  assert.match(screen(), /2 tool calls.*read/)
  assert.doesNotMatch(screen(), /read one\.txt|FIRST TOOL BODY/)
})

test("a finished call stays grouped while another iteration may join it", async (t) => {
  const host = await openNativeHost(t, { extensionPaths: [chat], rows: 44 })
  await writeFile(join(host.directory, "one.txt"), "first")
  await writeFile(join(host.directory, "two.txt"), "second")
  host.queueResponse(readDelta("first", "one.txt"), toolFinish, done, end)
  host.queueResponse(
    { pause: true },
    readDelta("second", "two.txt"),
    toolFinish,
    done,
    end,
  )
  await host.type("Read twice")
  await host.key("\r")
  await t.waitFor(() => assert.equal(host.requests.length, 2))
  const screen = () => host.screenLines().map(stripTerminalSequences).join("\n")
  await host.frame()
  assert.match(screen(), /1 tool call: read/)
  assert.doesNotMatch(screen(), /read one\.txt/)
  await host.key("\x1bg")
  await host.key("\r")
  await host.frame()
  assert.match(screen(), /read one\.txt/)
  host.resumeResponse()
  await host.settled()
  await host.frame()
  assert.match(screen(), /2 tool calls: read/)
  assert.match(screen(), /read one\.txt/)
  assert.match(screen(), /read two\.txt/)
})

test("a settled finished singleton displays its native call directly", async (t) => {
  const host = await openNativeHost(t, { extensionPaths: [chat], rows: 44 })
  await writeFile(join(host.directory, "one.txt"), "only")
  host.queueResponse(readDelta("only", "one.txt"), toolFinish, done, end)
  host.queueResponse(
    { pause: true },
    {
      event: {
        choices: [
          {
            index: 0,
            delta: { role: "assistant", content: "Finished" },
            finish_reason: null,
          },
        ],
      },
    },
    { event: { choices: [{ index: 0, delta: {}, finish_reason: "stop" }] } },
    done,
    end,
  )
  await host.type("One call")
  await host.key("\r")
  await t.waitFor(() => assert.equal(host.requests.length, 2))
  const screen = () => host.screenLines().map(stripTerminalSequences).join("\n")
  await host.frame()
  assert.match(screen(), /1 tool call: read/)
  assert.doesNotMatch(screen(), /read one\.txt/)
  host.resumeResponse()
  await host.settled()
  await openWork(host)
  await host.frame()
  assert.doesNotMatch(screen(), /1 tool call: read/)
  assert.match(screen(), /read one\.txt/)
  await host.key("\x1bg")
  await host.key("\r")
  await host.frame()
  assert.match(screen(), /only/)
})

test("commentary between model iterations separates tool groups in source order", async (t) => {
  const host = await openNativeHost(t, { extensionPaths: [chat], rows: 44 })
  await writeFile(join(host.directory, "one.txt"), "first")
  await writeFile(join(host.directory, "two.txt"), "second")
  host.queueResponse(readDelta("first", "one.txt"), toolFinish, done, end)
  host.queueResponse(
    {
      event: {
        choices: [
          {
            index: 0,
            delta: { role: "assistant", content: "Between calls" },
            finish_reason: null,
          },
        ],
      },
    },
    readDelta("second", "two.txt"),
    { pause: true },
    toolFinish,
    done,
    end,
  )
  await host.type("Read with commentary")
  await host.key("\r")
  await t.waitFor(() => assert.equal(host.requests.length, 2))
  const screen = () => host.screenLines().map(stripTerminalSequences).join("\n")
  await host.frame()
  assert.match(
    screen(),
    /read one\.txt[\s\S]*Between calls[\s\S]*1 tool call: read/,
  )
  assert.doesNotMatch(screen(), /2 tool calls/)
  host.resumeResponse()
  await host.settled()
})

test("a later assistant's trailing prose follows consecutive calls", async (t) => {
  const host = await openNativeHost(t, { extensionPaths: [chat], rows: 44 })
  await writeFile(join(host.directory, "one.txt"), "first")
  await writeFile(join(host.directory, "two.txt"), "second")
  host.queueResponse(readDelta("first", "one.txt"), toolFinish, done, end)
  host.queueResponse(
    readDelta("second", "two.txt"),
    {
      event: {
        choices: [
          {
            index: 0,
            delta: { content: "After both calls" },
            finish_reason: null,
          },
        ],
      },
    },
    toolFinish,
    done,
    end,
  )
  await host.type("Read with trailing prose")
  await host.key("\r")
  await host.settled()
  await openWork(host)
  const screen = (await host.frame())
    .split("\n")
    .map(stripTerminalSequences)
    .join("\n")
  assert.match(screen, /2 tool calls: read[\s\S]*After both calls/)
  assert.doesNotMatch(screen, /1 tool call/)
})

test("thinking between calls separates their groups", async (t) => {
  const host = await openNativeHost(t, { extensionPaths: [chat], rows: 44 })
  await writeFile(join(host.directory, "one.txt"), "first")
  await writeFile(join(host.directory, "two.txt"), "second")
  host.queueResponse(readDelta("first", "one.txt"), toolFinish, done, end)
  host.queueResponse(
    {
      event: {
        choices: [
          {
            index: 0,
            delta: {
              role: "assistant",
              reasoning_content: "Considering next call",
            },
            finish_reason: null,
          },
        ],
      },
    },
    readDelta("second", "two.txt"),
    toolFinish,
    done,
    end,
  )
  await host.type("Read with thought")
  await host.key("\r")
  await host.settled()
  await openWork(host)
  const screen = (await host.frame())
    .split("\n")
    .map(stripTerminalSequences)
    .join("\n")
  assert.match(screen, /read one\.txt[\s\S]*Thought[\s\S]*read two\.txt/)
  assert.doesNotMatch(screen, /2 tool calls/)
})

test("remapped selector keys navigate groups and cancel returns to the composer", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    rows: 44,
    keybindings: {
      "tui.select.up": "ctrl+k",
      "tui.select.down": "ctrl+j",
      "tui.select.confirm": "ctrl+y",
      "tui.select.cancel": "ctrl+q",
    },
  })
  await writeFile(join(host.directory, "one.txt"), "first")
  await writeFile(join(host.directory, "two.txt"), "second")
  host.queueResponse(readPairDelta("first"), toolFinish, done, end)
  host.queueResponse(
    {
      event: {
        choices: [
          {
            index: 0,
            delta: { role: "assistant", content: "Boundary" },
            finish_reason: null,
          },
        ],
      },
    },
    readPairDelta("second"),
    toolFinish,
    done,
    end,
  )
  await host.type("Two groups")
  await host.key("\r")
  await host.settled()
  await openWork(host, "\x11")
  const screen = () => host.screenLines().map(stripTerminalSequences).join("\n")
  await host.frame()
  assert.equal(screen().match(/2 tool calls: read/g)?.length, 2)
  await host.key("\x1bg")
  await host.key("\u000b")
  await host.key("\u0019")
  await host.frame()
  const lines = host.screenLines().map(stripTerminalSequences)
  const firstHeader = lines.findIndex((line) =>
    line.includes("2 tool calls: read"),
  )
  const secondHeader = lines.findLastIndex((line) =>
    line.includes("2 tool calls: read"),
  )
  assert(firstHeader >= 0 && secondHeader > firstHeader)
  assert.match(lines[firstHeader] ?? "", /^ →/)
  assert.match(lines[secondHeader] ?? "", /^ ▸/)
  assert.match(screen(), /read one\.txt/)
  await host.key("\u000a")
  await host.key("\u000a")
  await host.key("\u000a")
  await host.key("\u0019")
  await host.frame()
  assert.equal(screen().match(/read one\.txt/g)?.length, 2)
  await host.key("\u0011")
  await host.type("draft after cancel")
  await host.frame()
  assert.match(screen(), /draft after cancel/)
})

test("disclosure focus enters the group visible in scrollback", async (t) => {
  let renderer: TuiAltScreen | undefined
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    rows: 17,
    onMount: (interactive) => {
      renderer = (interactive as unknown as { renderer: TuiAltScreen }).renderer
    },
  })
  assert(renderer)
  await Promise.all(
    ["one", "two", "three", "four"].map((name) =>
      writeFile(join(host.directory, `${name}.txt`), name),
    ),
  )
  host.queueResponse(readPairDelta("first"), toolFinish, done, end)
  host.queueResponse(
    {
      event: {
        choices: [
          {
            index: 0,
            delta: {
              role: "assistant",
              content: Array.from(
                { length: 16 },
                (_, index) => `Boundary ${index}`,
              ).join("\n"),
            },
            finish_reason: null,
          },
        ],
      },
    },
    readPairDelta("second", "three.txt", "four.txt"),
    toolFinish,
    done,
    end,
  )
  await host.type("Scrollback groups")
  await host.key("\r")
  await host.settled()
  await openWork(host)
  await host.frame()
  renderer.scrollToTop()
  await host.frame()
  const screen = () => host.screenLines().map(stripTerminalSequences).join("\n")
  assert.match(screen(), /2 tool calls: read/)
  await host.key("\x1bg")
  await host.key("\r")
  await host.frame()
  assert.match(screen(), /read one\.txt/)
  assert.doesNotMatch(screen(), /read three\.txt/)
})

test("group pointer toggles retain native tool clicks and overlay focus", async (t) => {
  let renderer: TuiAltScreen | undefined
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    rows: 44,
    onMount: (interactive) => {
      renderer = (interactive as unknown as { renderer: TuiAltScreen }).renderer
    },
  })
  assert(renderer)
  await writeFile(join(host.directory, "one.txt"), "FIRST TOOL BODY")
  await writeFile(join(host.directory, "two.txt"), "SECOND TOOL BODY")
  host.queueResponse(readPairDelta("pointer"), toolFinish, done, end)
  await host.type("Pointer group")
  await host.key("\r")
  await host.settled()
  await openWork(host)
  const lines = () => host.screenLines().map(stripTerminalSequences)
  const click = async (row: number) => {
    await host.key(`\x1b[<0;3;${row + 1}M`)
    await host.key(`\x1b[<0;3;${row + 1}m`)
  }
  await host.frame()
  const header = lines().findIndex((line) => line.includes("2 tool calls"))
  assert(header >= 0)
  await click(header)
  await host.frame()
  assert.match(lines().join("\n"), /read one\.txt/)
  const call = lines().findIndex((line) => line.includes("read one.txt"))
  assert(call >= 0)
  await click(call)
  await host.frame()
  assert.match(lines().join("\n"), /FIRST TOOL BODY/)

  await host.key("\x1bg")
  let submitted = 0
  const input = new Input({ prompt: "Overlay" })
  input.onSubmit = () => {
    submitted++
  }
  const overlay = renderer.showOverlay(input)
  await host.key("\x1bg")
  await host.key("\r")
  assert.equal(submitted, 1)
  overlay.hide()
  await host.key("\r")
  await host.frame()
  assert.doesNotMatch(lines().join("\n"), /read one\.txt|FIRST TOOL BODY/)
})

test("copy uses the native selected text while a disclosure is focused", async (t) => {
  const clipboard = getNativeClipboard()
  assertWritableClipboard(clipboard)
  let copied = ""
  t.mock.method(clipboard, "setText", async (text: string) => {
    copied = text
  })
  const sendRef: { current?: () => void } = {}
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    rows: 44,
    settings: { fullscreenCopyOnSelect: false },
    extensionFactories: [
      (pi) => {
        pi.registerEntryRenderer(
          "test.focused-copy",
          () => new Text("focused-copy", 0, 0),
        )
        sendRef.current = () => pi.appendEntry("test.focused-copy", {})
      },
    ],
  })
  await writeFile(join(host.directory, "one.txt"), "ONE")
  await writeFile(join(host.directory, "two.txt"), "TWO")
  host.queueResponse(readPairDelta("copy"), toolFinish, done, end)
  await host.type("Copy in group")
  await host.key("\r")
  await host.settled()
  assert(sendRef.current)
  sendRef.current()
  await host.frame()
  const lines = host.screenLines().map(stripTerminalSequences)
  const row = lines.findIndex((line) => line.includes("focused-copy"))
  assert(row >= 0)
  const start = lines[row]!.indexOf("focused-copy") + 1
  await host.key(`\x1b[<0;${start};${row + 1}M`)
  await host.key(`\x1b[<32;${start + 12};${row + 1}M`)
  await host.key(`\x1b[<0;${start + 12};${row + 1}m`)
  await host.key("\x1bg")
  await host.key("\x18")
  await t.waitFor(() => assert.equal(copied, "focused-copy"))
})

test("folding a group clears selected tool output before native copy", async (t) => {
  const clipboard = getNativeClipboard()
  assertWritableClipboard(clipboard)
  let copied = ""
  t.mock.method(clipboard, "setText", async (text: string) => {
    copied = text
  })
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    rows: 44,
    settings: { fullscreenCopyOnSelect: false },
  })
  await writeFile(join(host.directory, "one.txt"), "FIRST TOOL BODY")
  await writeFile(join(host.directory, "two.txt"), "SECOND TOOL BODY")
  host.queueResponse(readPairDelta("selected"), toolFinish, done, end)
  await host.type("Select tool output")
  await host.key("\r")
  await host.settled()
  await openWork(host)
  await host.key("\x1bg")
  await host.key("\u000f")
  await host.frame()
  const lines = host.screenLines().map(stripTerminalSequences)
  const row = lines.findIndex((line) => line.includes("FIRST TOOL BODY"))
  assert(row >= 0)
  const start = lines[row]!.indexOf("FIRST TOOL BODY") + 1
  await host.key(`\x1b[<0;${start};${row + 1}M`)
  await host.key(`\x1b[<32;${start + 15};${row + 1}M`)
  await host.key(`\x1b[<0;${start + 15};${row + 1}m`)
  await host.key("\x18")
  await t.waitFor(() => assert.equal(copied, "FIRST TOOL BODY"))
  await host.key("\r")
  assert.doesNotMatch(await host.frame(), /FIRST TOOL BODY/)
  await host.key("\x18")
  await t.waitFor(() => assert.equal(copied, "Received."))
})

test("custom renderers and failed calls keep a manually opened group", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    rows: 44,
    extensionFactories: [
      (pi) =>
        pi.registerTool({
          ...createReadToolDefinition("."),
          name: "mystery",
          label: "Mystery",
          renderCall: () => new Text("CUSTOM CALL", 0, 0),
          renderResult: () => new Text("CUSTOM RESULT", 0, 0),
        }),
    ],
  })
  await writeFile(join(host.directory, "valid.txt"), "custom")
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
                  id: "failed",
                  type: "function",
                  function: {
                    name: "read",
                    arguments: '{"path":"missing.txt"}',
                  },
                },
                {
                  index: 1,
                  id: "custom",
                  type: "function",
                  function: {
                    name: "mystery",
                    arguments: JSON.stringify({
                      path: join(host.directory, "valid.txt"),
                    }),
                  },
                },
              ],
            },
            finish_reason: null,
          },
        ],
      },
    },
    toolFinish,
    done,
    end,
  )
  await host.type("Failure and custom tool")
  await host.key("\r")
  await host.settled()
  await openWork(host)
  const screen = () => host.screenLines().map(stripTerminalSequences).join("\n")
  await host.frame()
  assert.match(screen(), /2 tool calls: read, mystery/)
  assert.doesNotMatch(screen(), /CUSTOM CALL|CUSTOM RESULT/)
  await host.key("\x1bg")
  await host.key("\r")
  await host.frame()
  assert.match(screen(), /CUSTOM CALL/)
  assert.match(screen(), /CUSTOM RESULT/)
  assert.match(screen(), /2 tool calls: read, mystery/)
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
      /pi-chat chat root is already owned/.test(message),
    ),
  )
  assert.equal(ownedRoot(), observed.replacement)
  await host.close()
  assert.equal(ownedRoot(), observed.replacement)
})

for (const hook of ["getSelectionSourceLine", "getSelectionColumns"])
  test(`missing renderer.${hook} reports its name and restores native chat`, async (t) => {
    const errors: string[] = []
    let nativeRoot: unknown
    let currentRoot: (() => unknown) | undefined
    let restore: (() => void) | undefined
    const host = await openNativeHost(t, {
      extensionPaths: [chat],
      onMount: (interactive) => {
        const mode = interactive as unknown as {
          fullscreenLayoutRoot: unknown
          renderer: Record<string, Function | undefined>
          showError(message: string): void
        }
        nativeRoot = mode.fullscreenLayoutRoot
        currentRoot = () => mode.fullscreenLayoutRoot
        const original = mode.renderer[hook]
        Object.defineProperty(mode.renderer, hook, {
          configurable: true,
          writable: true,
          value: undefined,
        })
        restore = () => {
          mode.renderer[hook] = original
        }
        const showError = mode.showError
        t.mock.method(mode, "showError", (message: string) => {
          errors.push(message)
          showError.call(mode, message)
        })
      },
    })
    restore?.()
    assert(
      errors.some((message) =>
        message.includes(`Pi is missing renderer.${hook}()`),
      ),
    )
    assert.equal(currentRoot?.(), nativeRoot)
    await host.type("Native chat still works")
    await host.key("\r")
    await host.settled()
    assert.match(await host.frame(), /Received\./)
    assert.equal(currentRoot?.(), nativeRoot)
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
    keybindings: { "tui.altScreen.top": "home", "tui.altScreen.bottom": "end" },
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
    keybindings: { "tui.altScreen.top": "home" },
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
    keybindings: { "tui.altScreen.top": "home" },
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
