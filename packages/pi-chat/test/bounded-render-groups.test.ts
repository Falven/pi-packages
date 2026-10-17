import assert from "node:assert/strict"
import { writeFile } from "node:fs/promises"
import { join } from "node:path"
import test from "node:test"
import { crc32, deflateSync } from "node:zlib"
import {
  getNativeClipboard,
  Text,
  getCapabilities,
  getCellDimensions,
  setCapabilities,
  setCellDimensions,
  stripTerminalSequences,
  type NativeClipboard,
} from "@earendil-works/pi-tui"
import { createReadToolDefinition } from "@earendil-works/pi-coding-agent"
import { openNativeHost } from "../../../fixtures/native-host.ts"

const chat = new URL("../src/index.ts", import.meta.url).pathname
const reads = (paths: string[]) => ({
  event: {
    choices: [
      {
        index: 0,
        delta: {
          role: "assistant",
          tool_calls: paths.map((path, index) => ({
            index,
            id: `read-${index}`,
            type: "function",
            function: { name: "read", arguments: JSON.stringify({ path }) },
          })),
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

async function openWork(host: Awaited<ReturnType<typeof openNativeHost>>) {
  await host.frame()
  const row = host
    .screenLines()
    .findIndex((line) =>
      /Worked for \d+m \d+s ▶/.test(stripTerminalSequences(line)),
    )
  assert(row >= 0)
  const column =
    stripTerminalSequences(host.screenLines()[row]!).indexOf("Worked") + 1
  await host.key(`\x1b[<0;${column};${row + 1}M`)
  await host.key(`\x1b[<0;${column};${row + 1}m`)
  await host.key("\x1b")
}

function writableClipboard(
  clipboard: NativeClipboard | undefined,
): asserts clipboard is NativeClipboard &
  Required<Pick<NativeClipboard, "setText">> {
  assert(clipboard?.setText)
}

test("expanded groups expose all native output in conversation flow without invalidating cached Markdown", async (t) => {
  let markdownTransforms = 0
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    rows: 80,
    keybindings: { "tui.altScreen.top": "home" },
    extensionFactories: [
      (pi) => {
        pi.registerMarkdownTransformer((markdown) => {
          markdownTransforms++
          return markdown
        })
      },
    ],
  })
  await writeFile(
    join(host.directory, "one.txt"),
    Array.from({ length: 20 }, (_, n) => `first-row-${n}`).join("\n"),
  )
  await writeFile(
    join(host.directory, "two.txt"),
    Array.from({ length: 20 }, (_, n) => `second-row-${n}`).join("\n"),
  )
  host.queueResponse(reads(["one.txt", "two.txt"]), toolFinish, done, end)
  await host.type("Read the long outputs")
  await host.key("\r")
  await host.settled()
  await openWork(host)
  const collapsed = await host.frame()
  assert.match(collapsed, /Read files >/)
  assert.doesNotMatch(collapsed, /first-row-0|second-row-19/)
  const groupRow = host
    .screenLines()
    .findIndex((line) => stripTerminalSequences(line).includes("Read files"))
  assert(groupRow >= 0)
  await host.key(`\x1b[<0;2;${groupRow + 1}M`)
  await host.key(`\x1b[<0;2;${groupRow + 1}m`)
  const items = await host.frame()
  assert.match(items, /Read one\.txt >/)
  assert.match(items, /Read two\.txt >/)
  assert.doesNotMatch(items, /first-row-0|second-row-19/)
  const secondItemRow = host
    .screenLines()
    .findIndex((line) => stripTerminalSequences(line).includes("Read two.txt"))
  assert(secondItemRow >= 0)
  await host.key(`\x1b[<0;2;${secondItemRow + 1}M`)
  await host.key(`\x1b[<0;2;${secondItemRow + 1}m`)
  assert.doesNotMatch(await host.frame(), /second-row-19/)
  const nativeCall = host
    .screenLines()
    .findIndex((line) => stripTerminalSequences(line).includes("read two.txt"))
  assert(nativeCall >= 0)
  await host.key(`\x1b[<0;2;${nativeCall + 1}M`)
  await host.key(`\x1b[<0;2;${nativeCall + 1}m`)
  assert.match(await host.frame(), /second-row-19/)
  assert.doesNotMatch(await host.frame(), /first-row-0/)
  await host.key("\u000f")
  await host.frame()
  const lines = host.screenLines().map(stripTerminalSequences)
  assert(lines.some((line) => line.includes("Read files")))
  assert(lines.some((line) => line.includes("first-row-0")))
  assert(lines.some((line) => line.includes("first-row-19")))
  assert(lines.some((line) => line.includes("second-row-0")))
  assert(lines.some((line) => line.includes("second-row-19")))
  assert(lines.some((line) => line.includes("Received.")))
  host.terminal.resize(82, 28)
  await host.frame()
  const before = host.screenLines().map(stripTerminalSequences)
  const body = before.findIndex((line) => line.includes("second-row-19"))
  assert(body >= 0)
  assert(!before.some((line) => line.includes("Read files")))
  const transformsBeforeScrolling = markdownTransforms
  await host.key(`\x1b[<64;3;${body + 1}M`)
  await host.output()
  assert.equal(markdownTransforms, transformsBeforeScrolling)
  const scrolled = host.screenLines().map(stripTerminalSequences)
  assert.notDeepEqual(scrolled, before)
  await host.key("\x1b[H")
  assert.match(await host.frame(), /Read files ▼/)
})

test("selection copies expanded native output across offscreen conversation rows", async (t) => {
  const clipboard = getNativeClipboard()
  writableClipboard(clipboard)
  let copied = ""
  t.mock.method(clipboard, "setText", async (text: string) => {
    copied = text
  })
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    rows: 44,
    keybindings: { "tui.altScreen.top": "home" },
    settings: { fullscreenCopyOnSelect: false, outputPad: 1 },
  })
  await writeFile(
    join(host.directory, "one.txt"),
    Array.from(
      { length: 20 },
      (_, n) => `${n === 1 ? "  " : ""}first-row-${n} 界`,
    ).join("\n"),
  )
  await writeFile(
    join(host.directory, "two.txt"),
    Array.from({ length: 20 }, (_, n) => `second-row-${n}`).join("\n"),
  )
  host.queueResponse(reads(["one.txt", "two.txt"]), toolFinish, done, end)
  await host.type("Copy expanded")
  await host.key("\r")
  await host.settled()
  await openWork(host)
  await host.key("\u000f")
  await host.key("\x1b[H")
  await host.frame()
  const initial = host.screenLines().map(stripTerminalSequences)
  const first = initial.findIndex((line) => line.includes("Copy expanded"))
  assert(first >= 0)
  assert(!initial.some((line) => line.includes("Received.")))
  const column = initial[first]!.indexOf("Copy expanded") + 1
  await host.key(`\x1b[<0;${column};${first + 1}M`)
  // oxlint-disable-next-line eslint/no-await-in-loop -- Mouse gestures must preserve terminal order.
  for (let n = 0; n < 64; n++) await host.key(`\x1b[<65;3;${first + 1}M`)
  await host.frame()
  const lines = host.screenLines().map(stripTerminalSequences)
  const last = lines.findIndex((line) => line.includes("Received."))
  assert(last >= 0, lines.join("\n"))
  assert(!lines.some((line) => line.includes("Copy expanded")))
  const lastColumn = lines[last]!.indexOf("Received.") + "Received.".length
  await host.key(`\x1b[<32;${lastColumn};${last + 1}M`)
  await host.key(`\x1b[<0;${lastColumn};${last + 1}m`)
  await host.key("\x18")
  await t.waitFor(() => assert(copied))
  assert.match(copied, /^first-row-0 界$/m)
  assert.match(copied, /^  first-row-1 界$/m)
  assert.match(copied, /^Read files ▼$/m)
  assert.match(copied, /^Received\.$/m)
  assert.match(copied, /first-row-19 界/)
  assert.match(copied, /second-row-0/)
  assert.match(copied, /second-row-19/)
  assert.match(copied, /Received\.$/)
  const expandedText = copied
  const body = lines.findIndex((line) => line.includes("second-row-19"))
  await host.key(`\x1b[<64;3;${body + 1}M`)
  await host.output()
  copied = ""
  await host.key("\x18")
  await t.waitFor(() => assert.equal(copied, expandedText))
  await host.key("\u000f")
  assert.match(await host.frame(), /Worked for \d+m \d+s ▶/)
  await openWork(host)
  assert.match(await host.frame(), /Read files >/)
  // Native copy flashes briefly cover the right-aligned user text.
  await t.waitFor(
    () =>
      assert(host.screenLines().some((line) => line.includes("Copy expanded"))),
    { timeout: 2000 },
  )
  const collapsed = host.screenLines().map(stripTerminalSequences)
  const collapsedFirst = collapsed.findIndex((line) =>
    line.includes("Copy expanded"),
  )
  const collapsedLast = collapsed.findIndex((line) =>
    line.includes("Received."),
  )
  assert(
    collapsedFirst >= 0 && collapsedLast > collapsedFirst,
    collapsed.join("\n"),
  )
  copied = ""
  await host.key(`\x1b[<0;${column};${collapsedFirst + 1}M`)
  await host.key(`\x1b[<32;${lastColumn};${collapsedLast + 1}M`)
  await host.key(`\x1b[<0;${lastColumn};${collapsedLast + 1}m`)
  await host.key("\x18")
  await t.waitFor(() => assert(copied))
  assert.match(copied, /^Read files >$/m)
  assert.doesNotMatch(copied, /first-row|second-row/)
})

test("group summaries combine native categories and distinct paths while execution updates the header", async (t) => {
  const gate = Promise.withResolvers<void>()
  let waiting = false
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    columns: 100,
    rows: 24,
    extensionFactories: [
      (pi) => {
        pi.on("tool_execution_update", async (event) => {
          if (event.toolCallId !== "action-3") return
          waiting = true
          await gate.promise
        })
      },
    ],
  })
  await writeFile(join(host.directory, "one.txt"), "ok")
  const response = reads(["one.txt", "one.txt"])
  response.event.choices[0]!.delta.tool_calls.push(
    ...[
      { name: "write", args: { path: "one.txt", content: "first edit" } },
      { name: "write", args: { path: "./one.txt", content: "second edit" } },
      { name: "bash", args: { command: "printf first-command" } },
      { name: "bash", args: { command: "printf second-command" } },
    ].map(({ name, args }, index) => ({
      index: index + 2,
      id: `action-${index}`,
      type: "function",
      function: { name, arguments: JSON.stringify(args) },
    })),
  )
  host.queueResponse(response, toolFinish, done, end)
  await host.type("Read, edit, and run commands")
  try {
    await host.key("\r")
    await t.waitFor(() => assert(waiting))
    await host.frame()
    assert.match(
      host.screenLines().map(stripTerminalSequences).join("\n"),
      /^\s*[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏] Running printf second-command >\s*$/m,
    )
  } finally {
    gate.resolve()
    await host.settled()
  }
  await openWork(host)
  await host.frame()
  const header = host
    .screenLines()
    .map(stripTerminalSequences)
    .find((line) => line.includes("Edited a file"))
  assert(header)
  assert.match(header.trimEnd(), /Edited a file, read files, ran commands >$/)
  host.terminal.resize(50, 24)
  await host.frame()
  host.terminal.resize(100, 24)
  assert.match(await host.frame(), /Edited a file, read files, ran commands >/)
  host.terminal.resize(100, 44)
  await host.frame()
  await host.key("\x1bg")
  await host.key("\r")
  const lines = () => host.screenLines().map(stripTerminalSequences)
  const click = async (row: number) => {
    assert(row >= 0)
    await host.key(`\x1b[<0;3;${row + 1}M`)
    await host.key(`\x1b[<0;3;${row + 1}m`)
    await host.frame()
  }
  await host.frame()
  const itemRow = lines().findIndex((line) =>
    line.includes("Ran printf first-command >"),
  )
  await click(itemRow)
  assert.match(lines()[itemRow] ?? "", /Ran printf first-command ▼/)
  await click(
    lines().findIndex((line) => line.includes("$ printf first-command")),
  )
  assert.match(lines()[itemRow] ?? "", /Ran command ▼\s*$/)
  await click(lines().findIndex((line) => line.trim() === "first-command"))
  assert.match(lines()[itemRow] ?? "", /Ran printf first-command ▼/)
  assert.match(lines().join("\n"), /Edited a file, read files, ran commands ▼/)
})

test("default activity bodies and surrounding entries scroll together in the conversation", async (t) => {
  let appendPrefix: (() => void) | undefined
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    rows: 28,
    keybindings: {
      "tui.altScreen.top": "home",
      "tui.altScreen.bottom": "end",
    },
    extensionFactories: [
      (pi) => {
        pi.registerEntryRenderer(
          "test.prefix",
          () =>
            new Text(
              Array.from({ length: 40 }, (_, n) => `prefix-${n}`).join("\n"),
              0,
              0,
            ),
        )
        appendPrefix = () => pi.appendEntry("test.prefix", {})
        pi.registerTool({
          ...createReadToolDefinition("."),
          renderCall: () => new Text("CUSTOM CALL", 0, 0),
          renderResult: () => new Text("CUSTOM RESULT", 0, 0),
        })
      },
    ],
  })
  assert(appendPrefix)
  appendPrefix()
  const firstPath = join(host.directory, "one.txt")
  const secondPath = join(host.directory, "two.txt")
  await writeFile(
    firstPath,
    Array.from({ length: 20 }, (_, n) => `first-row-${n}`).join("\n"),
  )
  await writeFile(
    secondPath,
    Array.from({ length: 20 }, (_, n) => `second-row-${n}`).join("\n"),
  )
  host.queueResponse(reads([firstPath, secondPath]), toolFinish, done, end)
  await host.type("Pointer controls")
  await host.key("\r")
  await host.settled()
  await openWork(host)
  await host.key("\u000f")
  await host.frame()
  const screen = () => host.screenLines().map(stripTerminalSequences)
  const row = screen().findIndex((line) => line.includes("second-row-10"))
  assert(row >= 0)
  assert.doesNotMatch(screen().join("\n"), /CUSTOM CALL|CUSTOM RESULT/)
  const before = screen()
  await host.key(`\x1b[<64;3;${row + 1}M`)
  await host.frame()
  assert.notDeepEqual(screen(), before)
  await host.key("\x1b[H")
  await host.frame()
  assert(screen().some((line) => line.includes("prefix-0")))
  assert(!screen().some((line) => line.includes("second-row-19")))
  await host.key("\x1b[F")
  await host.frame()
  assert(screen().some((line) => line.includes("second-row-19")))
  assert(!screen().some((line) => line.includes("Called tools")))
  await host.key("\x1b[5~")
  await host.frame()
  assert(screen().some((line) => /first-row-\d/.test(line)))
  assert(!screen().some((line) => line.includes("second-row-19")))
})

test("growing output and resizing preserve a conversation anchor and follow only an already followed end", async (t) => {
  const lengths: Record<string, number> = { prefix: 20, target: 40 }
  const updates = new Map<string, (length: number) => void>()
  const gates = {
    prefix: Promise.withResolvers<void>(),
    target: Promise.withResolvers<void>(),
  }
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    columns: 82,
    rows: 44,
    extensionFactories: [
      (pi) => {
        pi.registerTool({
          ...createReadToolDefinition("."),
          execute: async (_id, args, _signal, onUpdate) => {
            const name = args.path as "prefix" | "target"
            assert(onUpdate)
            const result = (length: number) => ({
              content: [
                {
                  type: "text" as const,
                  text: Array.from(
                    { length },
                    (_, row) => `${name}-${row}`,
                  ).join("\n"),
                },
              ],
              details: {},
            })
            updates.set(name, (length) => onUpdate(result(length)))
            onUpdate(result(lengths[name]!))
            await gates[name].promise
            return result(lengths[name]!)
          },
          renderCall: (args) => new Text(`CALL ${args.path}`, 0, 0),
          renderResult: () => new Text("CUSTOM RESULT", 0, 0),
        })
      },
    ],
  })
  host.queueResponse(reads(["prefix", "target"]), toolFinish, done, end)
  await host.type("Read growing outputs")
  try {
    await host.key("\r")
    await t.waitFor(() => assert.equal(updates.size, 2))
    await host.key("\u000f")
    await host.frame()
    const screen = () => host.screenLines().map(stripTerminalSequences)
    assert.doesNotMatch(screen().join("\n"), /CUSTOM RESULT|CALL prefix/)
    const last = screen().findIndex((line) => line.includes("target-39"))
    assert(last >= 0)
    await host.key(`\x1b[<64;3;${last + 1}M`)
    await host.output()
    const anchor = screen()
      .find((line) => /target-\d/.test(line))
      ?.match(/target-\d+/)?.[0]
    assert(anchor)
    lengths["prefix"] = 40
    updates.get("prefix")!(40)
    await host.output()
    assert.equal(
      screen()
        .find((line) => /target-\d/.test(line))
        ?.match(/target-\d+/)?.[0],
      anchor,
    )
    host.terminal.resize(60, 36)
    await host.output()
    assert.equal(
      screen()
        .find((line) => /target-\d/.test(line))
        ?.match(/target-\d+/)?.[0],
      anchor,
    )
    lengths["target"] = 41
    updates.get("target")!(41)
    await host.output()
    assert.equal(
      screen()
        .find((line) => /target-\d/.test(line))
        ?.match(/target-\d+/)?.[0],
      anchor,
    )
    assert(!screen().some((line) => line.includes("target-40")))
    const body = screen().findIndex((line) => /target-\d/.test(line))
    // oxlint-disable-next-line eslint/no-await-in-loop -- Terminal input must be delivered in order.
    for (let i = 0; i < 16; i++) await host.key(`\x1b[<65;3;${body + 1}M`)
    await host.output()
    assert(screen().some((line) => line.includes("target-40")))
    lengths["target"] = 42
    updates.get("target")!(42)
    await host.output()
    assert(screen().some((line) => line.includes("target-41")))
  } finally {
    gates.prefix.resolve()
    gates.target.resolve()
    await host.settled()
  }
})

function pngChunk(name: string, data: Buffer) {
  const bytes = Buffer.concat([Buffer.from(name), data])
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const checksum = Buffer.alloc(4)
  checksum.writeUInt32BE(crc32(bytes))
  return Buffer.concat([length, bytes, checksum])
}

function tallPng() {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(180)
  header.writeUInt32BE(1080, 4)
  header[8] = 8
  header[9] = 6
  const pixels = Buffer.alloc((180 * 4 + 1) * 1080, 255)
  for (let row = 0; row < 1080; row++) pixels[row * (180 * 4 + 1)] = 0
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(pixels)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]).toString("base64")
}

function kittyPlacements(output: string) {
  // oxlint-disable-next-line eslint/no-control-regex -- Inspect the terminal protocol emitted by Pi.
  return [...output.matchAll(/\x1b_G([^;\x1b]*)(?:;[^\x1b]*)?\x1b\\/g)]
    .map((match) =>
      Object.fromEntries(match[1]!.split(",").map((pair) => pair.split("="))),
    )
    .filter((command) => command["r"])
}

test("native images crop once against the conversation and retain their identity and reservation rows", async (t) => {
  const capabilities = getCapabilities()
  const cells = getCellDimensions()
  setCapabilities({ ...capabilities, images: "kitty" })
  setCellDimensions({ widthPx: 9, heightPx: 18 })
  t.after(() => {
    setCapabilities(capabilities)
    setCellDimensions(cells)
  })
  let append: ((name: string) => void) | undefined
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    columns: 82,
    rows: 28,
    keybindings: { "tui.altScreen.top": "home" },
    settings: {
      fullscreenScrollbar: "always",
      terminal: { imageWidthCells: 48 },
    },
    extensionFactories: [
      (pi) => {
        pi.registerEntryRenderer<{ name: string }>(
          "test.image-margin",
          (entry) => {
            assert(entry.data)
            return new Text(
              Array.from(
                { length: entry.data.name === "prefix" ? 13 : 8 },
                (_, n) => `${entry.data!.name}-${n}`,
              ).join("\n"),
              0,
              0,
            )
          },
        )
        append = (name) => pi.appendEntry("test.image-margin", { name })
        pi.registerTool({
          ...createReadToolDefinition("."),
          execute: async (_id, args) => ({
            content:
              args.path === "image"
                ? [{ type: "image", data: tallPng(), mimeType: "image/png" }]
                : [{ type: "text", text: "before image" }],
            details: {},
          }),
        })
      },
    ],
  })
  assert(append)
  append("prefix")
  host.queueResponse(reads(["first", "image"]), toolFinish, done, end)
  await host.type("Show image")
  await host.key("\r")
  await host.settled()
  await openWork(host)
  append("suffix")
  await host.key("\u000f")
  await host.key("\x1b[H")
  await host.frame()
  assert.equal(kittyPlacements(host.terminal.output).length, 0)
  await host.key("\x1b[6~")
  await host.frame()
  const first = kittyPlacements(host.terminal.output).at(-1)
  assert(first, host.terminal.output)
  assert.equal(first["y"], "0")
  assert.equal(first["h"], "90")
  assert.equal(first["r"], "2")
  await host.key("\x1b[6~")
  await host.frame()
  const second = kittyPlacements(host.terminal.output).at(-1)
  assert(second)
  assert.equal(second["i"], first["i"])
  assert.equal(second["y"], "0")
  assert.equal(second["h"], "900")
  assert.equal(second["r"], "20")
  await host.key("\x1b[6~")
  await host.frame()
  assert.equal(kittyPlacements(host.terminal.output).length, 1)
  const third = kittyPlacements(host.terminal.output).at(-1)
  assert(third)
  assert.equal(third["i"], first["i"])
  // The final-response footer adds one row at the clamped conversation end.
  assert.equal(third["y"], "720")
  assert.equal(third["h"], "360")
  assert.equal(third["r"], "8")
  const lines = host.screenLines()
  const imageRow = lines.findIndex((line) => kittyPlacements(line).length)
  assert(imageRow >= 0)
  assert(
    lines
      .slice(imageRow + 1, imageRow + 8)
      .every((line) => stripTerminalSequences(line).slice(0, -1).trim() === ""),
  )
  assert.match(
    stripTerminalSequences(lines[imageRow + 1] ?? "").slice(-1),
    /[┃│]/,
  )
  const answer = stripTerminalSequences(lines[imageRow + 9] ?? "")
  assert.match(answer, /Received\./)
  assert.deepEqual(
    lines.flatMap((line, row) =>
      stripTerminalSequences(line).includes("[Copy response]") ? [row] : [],
    ),
    [imageRow + 10],
  )
  assert.equal(
    stripTerminalSequences(lines[imageRow + 10]!).indexOf("[Copy response]"),
    answer.indexOf("Received."),
  )
  host.terminal.resize(60, 28)
  await host.frame()
  assert.equal(kittyPlacements(host.terminal.output).at(-1)?.["i"], first["i"])
})
