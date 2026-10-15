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
  type ScrollView,
} from "@earendil-works/pi-tui"
import { createReadToolDefinition } from "@earendil-works/pi-coding-agent"
import { openNativeHost } from "../../../fixtures/native-host.ts"
import { installReplacement, observed } from "./fixtures/root-owner.ts"

const chat = new URL("../src/index.ts", import.meta.url).pathname
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
    .findIndex((line) =>
      /Worked for \d+m \d+s ▶/.test(stripTerminalSequences(line)),
    )
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
    settings: { fullscreenCopyOnSelect: false, outputPad: 0 },
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
  assert.equal(column, host.terminal.columns - "Hello".length)
  // oxlint-disable-next-line eslint/no-control-regex -- The native background still spans the first cell.
  assert.match(sliceByColumn(host.screenLines()[row]!, 0, 1, true), /\x1b\[48;/)
  assert.equal(
    lines.find((line) => line.includes("Received."))?.indexOf("Received."),
    0,
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
    "Aligned **界** content retains the full native wrapping width and Markdown layout while the user text moves to the right within its bar.\n\n```text\n  kept-indent\n```"
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
  await host.key(`\x1b[<0;1;${first + 1}M`)
  await host.key(`\x1b[<32;${lastColumn};${last + 1}M`)
  await host.key(`\x1b[<0;${lastColumn};${last + 1}m`)
  await host.key("\x18")
  await t.waitFor(() => assert(copied))
  assert.equal(
    copied.replace(/\s+/g, " "),
    prose.split("\n\n")[0]!.replaceAll("**", ""),
  )
  assert(copied.split("\n").every((line) => line.search(/\S/) === 0))
  const selectedLine = host.screenLines()[first + 1]!
  for (const cell of [0, host.terminal.columns - 1]) {
    const gutter = sliceByColumn(selectedLine, cell, 1, true)
    assert(
      gutter.lastIndexOf("\x1b[7m") <=
        Math.max(gutter.lastIndexOf("\x1b[0m"), gutter.lastIndexOf("\x1b[27m")),
    )
  }
  const indented = lines.findIndex((line) => line.includes("kept-indent"))
  assert(indented > last)
  await host.key(`\x1b[<0;1;${indented + 1}M`)
  await host.key(`\x1b[<32;${host.terminal.columns};${indented + 1}M`)
  await host.key(`\x1b[<0;${host.terminal.columns};${indented + 1}m`)
  await host.key("\x18")
  await t.waitFor(() => assert.equal(copied, "    kept-indent"))
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
  assert.match(frame, /Called read[\s\S]*"path": "note\.txt"/)
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
  assert.match(screen(), /Read files/)
  assert.doesNotMatch(screen(), /Read one\.txt|Read two\.txt/)
  await host.key("\x1bg")
  await host.key("\r")
  await host.frame()
  assert.match(screen(), /▼ Read files/)
  assert.match(screen(), /> Read one\.txt/)
  assert.match(screen(), /> Read two\.txt/)
  assert.doesNotMatch(screen(), /FIRST TOOL BODY|SECOND TOOL BODY/)
  await host.key("\x1b[B")
  await host.key("\r")
  assert.match(await host.frame(), /FIRST TOOL BODY/)
  assert.doesNotMatch(screen(), /SECOND TOOL BODY/)
  await host.key("\r")
  assert.doesNotMatch(await host.frame(), /FIRST TOOL BODY|SECOND TOOL BODY/)
  await host.key("\x1b[A")
  await host.key("\u000f")
  await host.frame()
  assert.match(screen(), /FIRST TOOL BODY/)
  await host.key("\r")
  await host.frame()
  assert.match(screen(), /> Read files/)
  assert.doesNotMatch(screen(), /Read one\.txt|FIRST TOOL BODY/)
  await host.key("\r")
  await host.frame()
  assert.match(screen(), /FIRST TOOL BODY/)
  await host.key("\u000f")
  await host.frame()
  assert.doesNotMatch(screen(), /Read one\.txt|FIRST TOOL BODY/)
  await host.key("\r")
  await host.frame()
  assert.match(screen(), /> Read one\.txt/)
  assert.doesNotMatch(screen(), /FIRST TOOL BODY/)
  await host.reload()
  await openWork(host)
  await host.frame()
  assert.match(screen(), /Called tools/)
  assert.doesNotMatch(screen(), /Read one\.txt|FIRST TOOL BODY/)
})

test("a finished call retains choices while arriving groups and items inherit native expansion", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    rows: 60,
    keybindings: { "app.tools.expand": "ctrl+e" },
  })
  await Promise.all(
    ["one", "two", "three", "four"].map((name) =>
      writeFile(
        join(host.directory, `${name}.txt`),
        `${name.toUpperCase()} BODY`,
      ),
    ),
  )
  host.queueResponse(readDelta("first", "one.txt"), toolFinish, done, end)
  host.queueResponse(
    { pause: true },
    readDelta("second", "two.txt"),
    toolFinish,
    done,
    end,
  )
  host.queueResponse(
    { pause: true },
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
    readDelta("third", "three.txt"),
    toolFinish,
    done,
    end,
  )
  host.queueResponse(
    { pause: true },
    readDelta("fourth", "four.txt"),
    toolFinish,
    done,
    end,
  )
  await host.type("Read across native expansion choices")
  await host.key("\r")
  await t.waitFor(() => assert.equal(host.requests.length, 2))
  const screen = () => host.screenLines().map(stripTerminalSequences).join("\n")
  await host.frame()
  assert.match(screen(), /> Read files/)
  await host.key("\x1bg")
  await host.key("\r")
  assert.match(await host.frame(), /> Read one\.txt/)
  host.resumeResponse()
  await t.waitFor(() => assert.equal(host.requests.length, 3))
  await host.frame()
  assert.equal(screen().match(/▼ Read files/g)?.length, 1)
  assert.match(screen(), /> Read one\.txt/)
  assert.match(screen(), /> Read two\.txt/)
  assert.doesNotMatch(screen(), /ONE BODY|TWO BODY/)
  await host.key("\x05")
  assert.match(await host.frame(), /ONE BODY[\s\S]*TWO BODY/)
  await host.key("\x1b[B")
  await host.key("\r")
  assert.doesNotMatch(await host.frame(), /ONE BODY/)
  host.resumeResponse()
  await t.waitFor(() => assert.equal(host.requests.length, 4))
  await host.frame()
  assert.match(screen(), /THREE BODY/)
  assert.equal(screen().match(/▼ Read files/g)?.length, 2)
  assert.doesNotMatch(screen(), /ONE BODY/)
  assert.match(screen(), /TWO BODY/)
  await host.key("\x05")
  assert.doesNotMatch(await host.frame(), /ONE BODY|TWO BODY|THREE BODY/)
  host.resumeResponse()
  await host.settled()
  await host.frame()
  if (/Worked for \d+m \d+s ▶/.test(screen())) await openWork(host)
  await host.frame()
  assert.equal(screen().match(/> Read files/g)?.length, 3)
  assert.doesNotMatch(screen(), /Read four\.txt|FOUR BODY/)
  await host.key("\x1bg")
  await host.key("\r")
  await host.frame()
  assert.match(screen(), /> Read four\.txt/)
  assert.doesNotMatch(screen(), /FOUR BODY/)
})

test("a single tool call stays grouped and collapsed after completion", async (t) => {
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
  assert.match(screen(), /Read files/)
  assert.doesNotMatch(screen(), /Read one\.txt/)
  host.resumeResponse()
  await host.settled()
  await openWork(host)
  await host.frame()
  assert.match(screen(), /> Read files/)
  assert.doesNotMatch(screen(), /Read one\.txt/)
  await host.key("\x1bg")
  await host.key("\r")
  await host.frame()
  assert.match(screen(), /▼ Read files/)
  assert.match(screen(), /Read one\.txt/)
  await host.key("\x1b[B")
  await host.key("\r")
  await host.frame()
  assert.match(screen(), /only/)
})

test("commentary between model iterations separates render groups in source order", async (t) => {
  let noticeBetweenCalls = false
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    rows: 44,
    settings: { hideThinkingBlock: true },
    extensionFactories: [
      (pi) => {
        pi.registerEntryRenderer(
          "test.group-boundary",
          () => new Text("Notice between calls", 0, 0),
        )
        pi.on("tool_execution_end", (event) => {
          if (noticeBetweenCalls && event.toolCallId === "notice-first")
            pi.appendEntry("test.group-boundary", {})
        })
      },
    ],
  })
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
  assert.match(screen(), /Read files[\s\S]*Between calls[\s\S]*Called a tool/)
  assert.equal(screen().match(/> /g)?.length, 2)
  assert.doesNotMatch(screen(), /Reading |Read one\.txt|Read two\.txt/)
  host.resumeResponse()
  await host.settled()

  noticeBetweenCalls = true
  host.queueResponse(
    readDelta("notice-first", "one.txt"),
    toolFinish,
    done,
    end,
  )
  host.queueResponse(
    readDelta("notice-second", "two.txt"),
    toolFinish,
    done,
    end,
  )
  await host.type("Read with a native notice")
  await host.key("\r")
  await host.settled()
  const closed = await host.frame()
  assert.match(
    closed,
    /Worked for \d+m \d+s ▶[\s\S]*Notice between calls[\s\S]*Received\./,
  )
  assert.equal((closed.match(/Notice between calls/g) ?? []).length, 1)
  assert.doesNotMatch(closed, /> Read files/)
  const noticeWorkRow = host
    .screenLines()
    .findLastIndex((line) =>
      /Worked for \d+m \d+s ▶/.test(stripTerminalSequences(line)),
    )
  assert(noticeWorkRow >= 0)
  await host.key(`\x1b[<0;2;${noticeWorkRow + 1}M`)
  await host.key(`\x1b[<0;2;${noticeWorkRow + 1}m`)
  const expanded = await host.frame()
  assert.match(
    expanded,
    /> Read files[\s\S]*Notice between calls[\s\S]*> Read files[\s\S]*Received\./,
  )
  assert.equal((expanded.match(/> Read files/g) ?? []).length, 2)
  assert.equal((expanded.match(/Notice between calls/g) ?? []).length, 1)
  await host.reload()
  const replayed = await host.frame()
  assert.equal((replayed.match(/Notice between calls/g) ?? []).length, 1)
  assert.doesNotMatch(replayed, /> Read files/)
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
  assert.match(screen, /Read files[\s\S]*After both calls/)
  assert.equal(screen.match(/> Read files/g)?.length, 1)
})

test("native Hide thinking controls whether reasoning separates render groups", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    rows: 44,
    settings: { hideThinkingBlock: false },
    keybindings: { "app.thinking.toggle": "ctrl+t" },
  })
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
  await host.frame()
  const screen = host.screenLines().map(stripTerminalSequences).join("\n")
  assert.match(
    screen,
    /> Read files[^\n]*\n\s*\n[^\n]*Considering next call[^\n]*\n\s*\n[^\n]*> Read files/,
  )
  assert.doesNotMatch(screen, /Read one\.txt|Read two\.txt|Thought/)
  await host.key("\x14")
  const hidden = await host.frame()
  assert.equal(hidden.match(/> Read files/g)?.length, 1)
  assert.doesNotMatch(hidden, /Considering next call|Thought/)
  await host.key("\x14")
  const visible = await host.frame()
  assert.equal(visible.match(/> Read files/g)?.length, 2)
  assert.match(visible, /Considering next call/)
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
      "app.tools.expand": "ctrl+e",
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
  assert.equal(screen().match(/Read files/g)?.length, 2)
  await host.key("\x1bg")
  await host.key("\u000b")
  await host.key("\u0019")
  await host.frame()
  const lines = host.screenLines().map(stripTerminalSequences)
  const firstHeader = lines.findIndex((line) => line.includes("Read files"))
  const secondHeader = lines.findLastIndex((line) =>
    line.includes("Read files"),
  )
  assert(firstHeader >= 0 && secondHeader > firstHeader)
  assert.match(lines[firstHeader] ?? "", /^ ▼ Read files/)
  assert.match(lines[secondHeader] ?? "", /^ >/)
  const selectedBg = host.ui.theme.getBgAnsi("selectedBg")
  assert(host.screenLines()[firstHeader]?.includes(selectedBg))
  assert(!host.screenLines()[secondHeader]?.includes(selectedBg))
  assert.match(screen(), /Read one\.txt/)
  await host.key("\u000a")
  await host.key("\u000a")
  await host.key("\u000a")
  await host.key("\u0019")
  await host.frame()
  assert.equal(screen().match(/Read one\.txt/g)?.length, 2)
  await host.key("\u000f")
  assert.doesNotMatch(await host.frame(), /first|second/)
  await host.key("\x05")
  assert.match(await host.frame(), /first[\s\S]*second/)
  await host.key("\x05")
  assert.doesNotMatch(await host.frame(), /Read one\.txt|Read two\.txt/)
  await host.key("\u0011")
  await host.key("\u000f")
  assert.doesNotMatch(await host.frame(), /Read one\.txt|Read two\.txt/)
  await host.key("\x05")
  assert.match(await host.frame(), /first[\s\S]*second/)
  await host.type("draft after cancel")
  await host.frame()
  assert.match(screen(), /draft after cancel/)
  for (const line of host
    .screenLines()
    .filter((row) => row.includes("Read files")))
    assert(!line.includes(selectedBg))
})

test("disclosure focus enters the group visible in scrollback", async (t) => {
  let renderer: TuiAltScreen | undefined
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    rows: 19,
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
  assert.match(screen(), /Read files/)
  await host.key("\x1bg")
  await host.key("\r")
  await host.frame()
  assert.match(screen(), /Read one\.txt/)
  assert.doesNotMatch(screen(), /Read three\.txt/)
})

test("group pointer toggles retain native tool clicks and overlay focus", async (t) => {
  let renderer: TuiAltScreen | undefined
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    rows: 44,
    settings: { outputPad: 0 },
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
  assert.match(
    host
      .screenLines()
      .map(stripTerminalSequences)
      .find((line) => /Worked for \d+m \d+s ▶/.test(line)) ?? "",
    /^Worked for \d+m \d+s ▶/,
  )
  await openWork(host)
  const lines = () => host.screenLines().map(stripTerminalSequences)
  const click = async (row: number, column = 3) => {
    await host.key(`\x1b[<0;${column};${row + 1}M`)
    await host.key(`\x1b[<0;${column};${row + 1}m`)
  }
  await host.frame()
  const header = lines().findIndex((line) => line.includes("Read files"))
  assert(header >= 0)
  await click(header)
  await host.frame()
  assert.match(lines()[header] ?? "", /^▼ Read files/)
  const darkBg = host.ui.theme.getBgAnsi("selectedBg")
  assert(host.screenLines()[header]?.includes(darkBg))
  assert.equal(host.ui.setTheme("light").success, true)
  await host.frame()
  const lightBg = host.ui.theme.getBgAnsi("selectedBg")
  assert.notEqual(lightBg, darkBg)
  assert(host.screenLines()[header]?.includes(lightBg))
  assert.match(lines().join("\n"), /Read one\.txt/)
  const call = lines().findIndex((line) => line.includes("Read one.txt"))
  assert(call >= 0)
  await click(call)
  await host.frame()
  assert.match(lines().join("\n"), /FIRST TOOL BODY/)
  const nativeCall = lines().findIndex((line) => line.includes("read one.txt"))
  assert(nativeCall >= 0)
  await click(nativeCall)
  assert.doesNotMatch(await host.frame(), /FIRST TOOL BODY/)
  await click(lines().findIndex((line) => line.includes("> Read one.txt")))
  assert.match(await host.frame(), /FIRST TOOL BODY/)

  await host.key("\x1bg")
  /* eslint-disable no-await-in-loop -- Native focus follows each rendered key event. */
  for (let move = 0; move < 3; move++) {
    await host.frame()
    if (host.screenLines()[header]?.includes(lightBg)) break
    await host.key("\x1b[A")
  }
  /* eslint-enable no-await-in-loop */
  assert(host.screenLines()[header]?.includes(lightBg))
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
  assert.match(lines()[header] ?? "", /^> Read files/)
  assert(host.screenLines()[header]?.includes(lightBg))
  assert.doesNotMatch(lines().join("\n"), /Read one\.txt|FIRST TOOL BODY/)
  await host.key("\x1b")
  await host.type("/settings")
  await host.key("\r")
  await host.type("Output padding")
  await host.key("\r")
  await host.key("\x1b")
  await host.frame()
  assert.match(lines()[header] ?? "", /^ > Read files/)
  assert.match(
    lines().find((line) => line.includes("Worked")) ?? "",
    /^ Worked for \d+m \d+s ▼/,
  )
  await click(header, 1)
  await click(header, host.terminal.columns)
  assert.match(lines()[header] ?? "", /^ > Read files/)
  await click(header)
  await host.frame()
  const itemRow = lines().findIndex((line) => line.includes("Read one.txt"))
  assert.match(lines()[itemRow] ?? "", /^ ▼ Read one\.txt/)
  await click(itemRow, 1)
  await click(itemRow, host.terminal.columns)
  const bodyRow = lines().findIndex((line) => line.includes("FIRST TOOL BODY"))
  assert(bodyRow > itemRow)
  await click(bodyRow, 1)
  await click(bodyRow, host.terminal.columns)
  assert.match(lines()[itemRow] ?? "", /^ ▼ Read one\.txt/)
  assert.match(lines().join("\n"), /FIRST TOOL BODY/)
  await host.key("\x1b")
  await host.key("\u000f")
  await host.key("\u000f")
  assert.doesNotMatch(await host.frame(), /Read one\.txt|FIRST TOOL BODY/)
  await host.type("/settings")
  await host.key("\r")
  await host.type("Output padding")
  await host.key("\r")
  await host.key("\x1b")
  await host.frame()
  assert.doesNotMatch(lines().join("\n"), /Read one\.txt|FIRST TOOL BODY/)
  await click(lines().findIndex((line) => line.includes("> Read files")))
  await host.frame()
  assert.match(lines().join("\n"), /> Read one\.txt/)
  assert.doesNotMatch(lines().join("\n"), /FIRST TOOL BODY/)
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

test("collapsing a render group clears selected tool output before native copy", async (t) => {
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
  let result: Text | undefined
  let resultPresenters = 0
  let invalidateResult: (() => void) | undefined
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
          renderResult: (_value, _options, _theme, context) => {
            if (!context.lastComponent) {
              resultPresenters++
              result = new Text("CUSTOM RESULT", 0, 0)
            }
            assert(result)
            invalidateResult = context.invalidate
            return result
          },
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
  assert.match(screen(), /Called a tool, read files/)
  assert.doesNotMatch(screen(), /CUSTOM CALL|CUSTOM RESULT/)
  await host.key("\x1bg")
  await host.key("\r")
  await host.frame()
  assert.match(screen(), /> Read missing\.txt/)
  assert.match(screen(), /> Called mystery/)
  assert.doesNotMatch(screen(), /ENOENT|CUSTOM CALL|CUSTOM RESULT/)
  await host.key("\x1b[B")
  await host.key("\r")
  assert.match(await host.frame(), /ENOENT/)
  await host.key("\x1b[B")
  await host.key("\r")
  const opened = await host.frame()
  assert.match(opened, /"path":/)
  assert.match(opened, /custom/)
  assert.doesNotMatch(opened, /CUSTOM CALL|CUSTOM RESULT/)
  assert(result)
  assert(invalidateResult)
  assert.equal(resultPresenters, 1)
  result.setText("CUSTOM LATE RESULT")
  invalidateResult()
  assert.doesNotMatch(await host.frame(), /CUSTOM LATE RESULT/)
  assert.match(screen(), /▼ Called a tool, read files/)
  await host.key("\x1b[A")
  await host.key("\x1b[A")
  await host.key("\r")
  assert.doesNotMatch(
    await host.frame(),
    /ENOENT|CUSTOM LATE RESULT|CUSTOM CALL/,
  )
  assert.match(screen(), /Received\./)
  await host.key("\x1b")
  host.queueResponse(
    {
      event: {
        choices: [
          {
            index: 0,
            delta: { role: "assistant", content: "Later answer" },
            finish_reason: null,
          },
        ],
      },
    },
    { pause: true },
    { event: { choices: [{ index: 0, delta: {}, finish_reason: "stop" }] } },
    done,
    end,
  )
  await host.type("A later request")
  await host.key("\r")
  await t.waitFor(async () => assert.match(await host.frame(), /Later answer/))
  result.setText("CUSTOM UPDATE DURING LATER REQUEST")
  invalidateResult()
  assert.doesNotMatch(await host.frame(), /CUSTOM UPDATE DURING LATER REQUEST/)
  assert.equal(resultPresenters, 1)
  host.resumeResponse()
  await host.settled()
  await host.key("\x1bg")
  await host.key("\r")
  await host.key("\x1b")
  const later = await host.frame()
  assert.doesNotMatch(later, /CUSTOM CALL|CUSTOM UPDATE DURING LATER REQUEST/)
  assert.match(later, /▼ Called a tool, read files/)
  assert.match(later, /ENOENT/)
  assert.match(later, /"path":/)
  assert.equal(resultPresenters, 1)
})

test("native custom renderers keep equal occurrences distinct", async (t) => {
  const sendRef: { current?: () => void } = {}
  const appendRef: { current?: () => void } = {}
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    persistSession: true,
    rows: 44,
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
        appendRef.current = () => pi.appendEntry("test.entry", { value: 1 })
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

  host.queueResponse(
    {
      event: {
        choices: [
          {
            index: 0,
            delta: { role: "assistant", content: "Streaming answer" },
            finish_reason: null,
          },
        ],
      },
    },
    { pause: true },
    {
      event: { choices: [{ index: 0, delta: {}, finish_reason: "stop" }] },
    },
    done,
    end,
  )
  await host.type("Stream beside the entry")
  await host.key("\r")
  await t.waitFor(async () =>
    assert.match(await host.frame(), /Streaming answer/),
  )
  assert(appendRef.current)
  appendRef.current()
  await host.frame()
  const screen = () => host.screenLines().map(stripTerminalSequences).join("\n")
  const streamingFrame = screen()
  assert.equal(streamingFrame.match(/Rendered entry/g)?.length, 2)
  assert(
    streamingFrame.lastIndexOf("Rendered entry") <
      streamingFrame.indexOf("Streaming answer"),
  )
  host.resumeResponse()
  await host.settled()
  const sourceEntries = host.session.sessionManager
    .getBranch()
    .filter(
      (entry) => entry.type === "custom" && entry.customType === "test.entry",
    )
  assert.equal(sourceEntries.length, 2)
  assert.notEqual(sourceEntries[0]?.id, sourceEntries[1]?.id)
  const source = JSON.stringify(sourceEntries)
  await host.reload()
  await host.frame()
  assert.equal(screen().match(/Rendered entry/g)?.length, 2)
  assert.equal(screen().match(/Repeated custom message/g)?.length, 2)
  assert(
    screen().lastIndexOf("Rendered entry") <
      screen().indexOf("Streaming answer"),
  )
  assert.equal(
    JSON.stringify(
      host.session.sessionManager
        .getBranch()
        .filter(
          (entry) =>
            entry.type === "custom" && entry.customType === "test.entry",
        ),
    ),
    source,
  )
  assert.equal(host.requests.length, 1)
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
    /* oxlint-disable eslint/no-await-in-loop -- Native capability probes share process-wide host hooks. */
    for (const missing of hook === "getSelectionSourceLine"
      ? [`renderer.${hook}`, "addCustomEntryToChat"]
      : [`renderer.${hook}`]) {
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
          const target = missing.startsWith("renderer.")
            ? mode.renderer
            : (mode as unknown as Record<string, Function | undefined>)
          const name = missing.split(".").at(-1)!
          const original = target[name]
          Object.defineProperty(target, name, {
            configurable: true,
            writable: true,
            value: undefined,
          })
          restore = () => {
            target[name] = original
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
          message.includes(`Pi is missing ${missing}()`),
        ),
      )
      assert.equal(currentRoot?.(), nativeRoot)
      await host.type("Native chat still works")
      await host.key("\r")
      await host.settled()
      assert.match(await host.frame(), /Received\./)
      assert.equal(currentRoot?.(), nativeRoot)
      await host.close()
    }
    /* oxlint-enable eslint/no-await-in-loop */
  })

test("cleanup leaves a later fullscreen owner's replacement intact", async (t) => {
  delete observed.host
  delete observed.replacement
  observed.notifications.length = 0
  observed.errors.length = 0
  let interactive: Parameters<typeof installReplacement>[0] | undefined
  let customEntryMethod: unknown
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    settings: { fullscreenScrollbar: "always" },
    onMount: (mode) => {
      interactive = mode
      customEntryMethod = (mode as unknown as { addCustomEntryToChat: unknown })
        .addCustomEntryToChat
    },
  })
  await host.frame()
  assert(interactive)
  installReplacement(interactive)
  const borrowed = observed.previousRoot?.children[0]
  assert(borrowed && "scrollbar" in borrowed)
  assert.match(await host.frame(), /Other owner active/)
  assert.equal(ownedRoot(), observed.replacement)
  await host.close()
  assert.equal(ownedRoot(), observed.replacement)
  assert.equal(borrowed.scrollbar, "always")
  assert.equal(
    (interactive as unknown as { addCustomEntryToChat: unknown })
      .addCustomEntryToChat,
    customEntryMethod,
  )
})

test("page navigation scrolls native chat while the composer stays usable", async (t) => {
  const sendRef: { current?: () => void } = {}
  let renderer: TuiAltScreen | undefined
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    rows: 16,
    settings: { fullscreenScrollbar: "always" },
    onMount: (interactive) => {
      renderer = (interactive as unknown as { renderer: TuiAltScreen }).renderer
    },
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
  assert(renderer)
  const scroll = (
    renderer as unknown as { getPrimaryScrollView(): ScrollView }
  ).getPrimaryScrollView()
  const scrollbarCell = () =>
    stripTerminalSequences(host.screenLines()[0] ?? "").slice(-1)
  assert.equal(scroll.scrollbar, "always")
  assert.match(scrollbarCell(), /[┃│]/)
  const lastColumn = host.terminal.columns
  await host.key(`\x1b[<0;${lastColumn};1M`)
  await host.key(`\x1b[<0;${lastColumn};1m`)
  assert.equal(scroll.scrollTop, 0)
  assert.match(await host.frame(), /chat-row-00/)
  await host.key(`\x1b[<0;${lastColumn};1M`)
  await host.key(`\x1b[<32;${lastColumn};${scroll.viewportHeight}M`)
  await host.key(`\x1b[<0;${lastColumn};${scroll.viewportHeight}m`)
  assert.match(await host.frame(), /chat-row-31/)
  await host.key("\x1b[5~")
  assert.match(await host.frame(), /chat-row-1[0-9]/)
  await host.key("\x1b[5~")
  await host.key("\x1b[5~")
  await host.key("\x1b[5~")
  assert.match(await host.frame(), /chat-row-00/)
  await host.type("Composer still works")
  assert.match(await host.frame(), /Composer still works/)
  await host.key("\x15")
  assert.equal(host.ui.setTheme("light").success, true)
  await host.frame()
  assert(
    host.screenLines()[0]?.includes(host.ui.theme.getFgAnsi("scrollbarThumb")),
  )
  /* oxlint-disable eslint/no-await-in-loop -- Settings input must reach Pi in order. */
  for (const expected of ["hidden", "auto"] as const) {
    await host.type("/settings")
    await host.key("\r")
    await host.type("Fullscreen scrollbar")
    await host.key("\r")
    await host.key("\x1b")
    await host.frame()
    assert.equal(scroll.scrollbar, expected)
    if (expected === "hidden") assert.doesNotMatch(scrollbarCell(), /[┃█│]/)
  }
  /* oxlint-enable eslint/no-await-in-loop */
  await host.key("\x1b[H")
  await host.key("\x1b[6~")
  await host.frame()
  assert(scroll.scrollTop > 0)
  assert.equal(scroll.isScrollbarVisible, true)
  await host.key("\x1b[<35;5;1M")
  await t.waitFor(() => assert.equal(scroll.isScrollbarVisible, false), {
    timeout: 3000,
  })
  await host.key(`\x1b[<35;${lastColumn};1M`)
  await host.frame()
  assert.equal(scroll.isScrollbarActive, true)
  assert.match(scrollbarCell(), /[█│]/)
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
    settings: { fullscreenScrollbar: "always", outputPad: 0 },
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
  assert.doesNotMatch(copied, /[┃█│]/)
  await host.frame()
  const selected = host
    .screenLines()
    .find((line) => stripTerminalSequences(line).includes("copy-row-19"))
  assert(selected)
  const gutter = sliceByColumn(selected, host.terminal.columns - 1, 1, true)
  assert.match(stripTerminalSequences(gutter), /[┃█│]/)
  assert(
    gutter.lastIndexOf("\x1b[7m") <
      Math.max(gutter.lastIndexOf("\x1b[0m"), gutter.lastIndexOf("\x1b[27m")),
  )
  /* oxlint-disable eslint/no-await-in-loop -- Native scrollbar settings cycle in order. */
  for (let step = 0; step < 2; step++) {
    await host.type("/settings")
    await host.key("\r")
    await host.type("Fullscreen scrollbar")
    await host.key("\r")
    await host.key("\x1b")
  }
  /* oxlint-enable eslint/no-await-in-loop */
  await host.key("\x1b[<64;1;2M")
  await host.frame()
  const row = host
    .screenLines()
    .findIndex((line) => stripTerminalSequences(line).includes("copy-row"))
  assert(row >= 0)
  await host.key(`\x1b[<0;1;${row + 1}M`)
  await host.key(`\x1b[<32;${host.terminal.columns};${row + 1}M`)
  await host.key(`\x1b[<0;${host.terminal.columns};${row + 1}m`)
  await host.key(`\x1b[<35;${host.terminal.columns};1M`)
  await host.frame()
  await t.waitFor(
    () =>
      assert.match(
        stripTerminalSequences(
          sliceByColumn(
            host.screenLines()[row]!,
            host.terminal.columns - 1,
            1,
            true,
          ),
        ),
        /[┃█│]/,
      ),
    { timeout: 2000 },
  )
  const overlayBar = sliceByColumn(
    host.screenLines()[row]!,
    host.terminal.columns - 1,
    1,
    true,
  )
  assert.match(stripTerminalSequences(overlayBar), /[┃█│]/)
  assert(
    overlayBar.lastIndexOf("\x1b[7m") <=
      Math.max(
        overlayBar.lastIndexOf("\x1b[0m"),
        overlayBar.lastIndexOf("\x1b[27m"),
      ),
  )
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

test("native child input keeps source coordinates while padding routes wheels to the conversation", async (t) => {
  const sendRef: { current?: () => void } = {}
  const clicked: number[] = []
  const wheeled: { x: number; y: number }[] = []
  let childHasRoom = true
  let renderer: TuiAltScreen | undefined
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    rows: 17,
    settings: { outputPad: 0, fullscreenScrollbar: "hidden" },
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
                if (event.type === "wheel") {
                  wheeled.push({ x: event.x, y: event.y })
                  return childHasRoom ? { handled: true } : undefined
                }
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
  const initialTop = renderer.viewportTop
  await host.key(`\x1b[<64;1;${target + 1}M`)
  await host.key(`\x1b[<64;${host.terminal.columns};${target + 1}M`)
  assert.equal(renderer.viewportTop, initialTop)
  assert.deepEqual(wheeled, [
    { x: 0, y: 20 },
    { x: 59, y: 20 },
  ])

  await host.type("/settings")
  await host.key("\r")
  await host.type("Output padding")
  await host.key("\r")
  await host.key("\x1b")
  renderer.scrollToBottom()
  await host.frame()
  const bodyRow = () =>
    host
      .screenLines()
      .findIndex((line) => stripTerminalSequences(line).includes("pointer-20"))
  wheeled.length = 0
  const paddedTop = renderer.viewportTop
  assert(bodyRow() >= 0)
  await host.key(`\x1b[<64;1;${bodyRow() + 1}M`)
  assert.equal(wheeled.length, 0)
  assert(renderer.viewportTop < paddedTop)
  renderer.scrollToBottom()
  await host.frame()
  await host.key(`\x1b[<64;${host.terminal.columns};${bodyRow() + 1}M`)
  assert.equal(wheeled.length, 0)
  assert(renderer.viewportTop < paddedTop)
  renderer.scrollToBottom()
  await host.frame()
  await host.key(`\x1b[<64;2;${bodyRow() + 1}M`)
  assert.deepEqual(wheeled, [{ x: 1, y: 20 }])
  assert.equal(renderer.viewportTop, paddedTop)
  childHasRoom = false
  await host.key(`\x1b[<64;2;${bodyRow() + 1}M`)
  assert.equal(wheeled.length, 2)
  assert(renderer.viewportTop < paddedTop)
  childHasRoom = true
  host.terminal.resize(42, 17)
  renderer.scrollToBottom()
  await host.frame()
  const resizedTop = renderer.viewportTop
  wheeled.length = 0
  await host.key(`\x1b[<64;42;${bodyRow() + 1}M`)
  assert.equal(wheeled.length, 0)
  assert(renderer.viewportTop < resizedTop)
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
