import assert from "node:assert/strict"
import { writeFile } from "node:fs/promises"
import { join } from "node:path"
import test from "node:test"
import { crc32, deflateSync } from "node:zlib"
import {
  getNativeClipboard,
  MouseRegion,
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
    .findIndex((line) => stripTerminalSequences(line).includes("▸ Worked"))
  assert(row >= 0)
  await host.key(`\x1b[<0;2;${row + 1}M`)
  await host.key(`\x1b[<0;2;${row + 1}m`)
  await host.key("\x1b")
}

function writableClipboard(
  clipboard: NativeClipboard | undefined,
): asserts clipboard is NativeClipboard &
  Required<Pick<NativeClipboard, "setText">> {
  assert(clipboard?.setText)
}

test("long expanded groups retain their header, answer, and cached Markdown while scrolling", async (t) => {
  let markdownTransforms = 0
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    rows: 28,
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
  await host.key("\u000f")
  await host.frame()
  const lines = host.screenLines().map(stripTerminalSequences)
  assert(lines.some((line) => line.includes("2 tool calls")))
  assert(lines.some((line) => line.includes("second-row-19")))
  assert(lines.some((line) => line.includes("Received.")))
  assert(!lines.some((line) => line.includes("first-row-0")))
  const header = lines.findIndex((line) => line.includes("2 tool calls"))
  const body = lines.findIndex((line) => line.includes("second-row-19"))
  const transformsBeforeScrolling = markdownTransforms
  await host.key(`\x1b[<64;3;${body + 1}M`)
  await host.output()
  assert.equal(markdownTransforms, transformsBeforeScrolling)
  const scrolled = host.screenLines().map(stripTerminalSequences)
  assert.equal(
    scrolled.findIndex((line) => line.includes("2 tool calls")),
    header,
  )
  assert.notDeepEqual(
    scrolled.slice(header + 1, body + 1),
    lines.slice(header + 1, body + 1),
  )
  assert(scrolled.some((line) => line.includes("Received.")))
  await host.key("\x1bg")
  await host.key("\x1b[B")
  await host.frame()
  assert.match(
    host.screenLines().map(stripTerminalSequences).join("\n"),
    /read one\.txt/,
  )
})

test("selection copies every expanded body row between visible endpoints", async (t) => {
  const clipboard = getNativeClipboard()
  writableClipboard(clipboard)
  let copied = ""
  t.mock.method(clipboard, "setText", async (text: string) => {
    copied = text
  })
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    rows: 44,
    settings: { fullscreenCopyOnSelect: false },
  })
  await writeFile(
    join(host.directory, "one.txt"),
    Array.from({ length: 20 }, (_, n) => `first-row-${n} 界`).join("\n"),
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
  await host.frame()
  const lines = host.screenLines().map(stripTerminalSequences)
  const first = lines.findIndex((line) => line.includes("Copy expanded"))
  const last = lines.findIndex((line) => line.includes("Received."))
  assert(first >= 0 && last > first)
  const column = lines[first]!.indexOf("Copy expanded") + 1
  await host.key(`\x1b[<0;${column};${first + 1}M`)
  await host.key(`\x1b[<32;10;${last + 1}M`)
  await host.key(`\x1b[<0;10;${last + 1}m`)
  await host.key("\x18")
  await t.waitFor(() => assert(copied))
  assert.match(copied, /first-row-0 界/)
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
  await host.frame()
  // Native copy flashes briefly cover the right-aligned user text.
  await t.waitFor(
    () =>
      assert(host.screenLines().some((line) => line.includes("Copy expanded"))),
    { timeout: 2000 },
  )
  const folded = host.screenLines().map(stripTerminalSequences)
  const foldedFirst = folded.findIndex((line) => line.includes("Copy expanded"))
  const foldedLast = folded.findIndex((line) => line.includes("Received."))
  assert(foldedFirst >= 0 && foldedLast > foldedFirst, folded.join("\n"))
  copied = ""
  await host.key(`\x1b[<0;${column};${foldedFirst + 1}M`)
  await host.key(`\x1b[<32;10;${foldedLast + 1}M`)
  await host.key(`\x1b[<0;10;${foldedLast + 1}m`)
  await host.key("\x18")
  await t.waitFor(() => assert(copied))
  assert.match(copied, /2 tool calls/)
  assert.doesNotMatch(copied, /first-row|second-row/)
})

test("a repeated tool name appears once in a concise group header", async (t) => {
  const host = await openNativeHost(t, { extensionPaths: [chat], rows: 24 })
  await writeFile(join(host.directory, "one.txt"), "ok")
  host.queueResponse(
    reads(Array.from({ length: 30 }, () => "one.txt")),
    toolFinish,
    done,
    end,
  )
  await host.type("Read repeatedly")
  await host.key("\r")
  await host.settled()
  await openWork(host)
  await host.frame()
  const header = host
    .screenLines()
    .map(stripTerminalSequences)
    .find((line) => line.includes("30 tool calls"))
  assert(header)
  assert.match(header.trimEnd(), /30 tool calls: read$/)
})

test("native children receive source coordinates before inner wheel movement bubbles outward", async (t) => {
  let appendPrefix: (() => void) | undefined
  let clicked = ""
  let consumeWheel = true
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    rows: 28,
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
          renderResult: (result) => {
            const text = result.content
              .filter((part) => part.type === "text")
              .map((part) => part.text)
              .join("\n")
            return new MouseRegion(new Text(text, 0, 0), (event) => {
              if (event.type === "wheel" && consumeWheel)
                return { handled: true }
              if (event.type !== "click") return undefined
              clicked = text.split("\n")[event.y] ?? ""
              return { handled: true }
            })
          },
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
  await host.key(`\x1b[<0;3;${row + 1}M`)
  await host.key(`\x1b[<0;3;${row + 1}m`)
  assert.equal(clicked, "second-row-10")
  const before = screen()
  await host.key(`\x1b[<64;3;${row + 1}M`)
  await host.frame()
  assert.deepEqual(screen(), before)
  consumeWheel = false
  await host.key("\x1bg")
  await host.key("\x1b[B")
  await host.frame()
  const first = screen().findIndex((line) => line.includes("first-row-0"))
  const header = screen().findIndex((line) => line.includes("2 tool calls"))
  assert(first > header && header >= 0)
  await host.key(`\x1b[<64;3;${first + 1}M`)
  await host.frame()
  assert(screen().findIndex((line) => line.includes("2 tool calls")) > header)
  await host.key("\x1b")
  await host.key("\x1b[6~")
  await host.frame()
  assert(screen().some((line) => line.includes("first-row-0")))
  assert(!screen().some((line) => line.includes("second-row-19")))
})

test("growing output and resizing preserve a body anchor and follow only an already followed end", async (t) => {
  const lengths: Record<string, number> = { prefix: 20, target: 40 }
  const invalidate = new Map<string, () => void>()
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    columns: 82,
    rows: 44,
    extensionFactories: [
      (pi) => {
        pi.registerTool({
          ...createReadToolDefinition("."),
          execute: async () => ({
            content: [{ type: "text", text: "output" }],
            details: {},
          }),
          renderCall: (args) => new Text(`CALL ${args.path}`, 0, 0),
          renderResult: (_result, _options, _theme, context) => {
            const name = context.args.path
            invalidate.set(name, context.invalidate)
            return new Text(
              Array.from(
                { length: lengths[name]! },
                (_, row) => `${name}-${row}`,
              ).join("\n"),
              0,
              0,
            )
          },
        })
      },
    ],
  })
  host.queueResponse(reads(["prefix", "target"]), toolFinish, done, end)
  await host.type("Read growing outputs")
  await host.key("\r")
  await host.settled()
  await openWork(host)
  await host.key("\u000f")
  await host.frame()
  const screen = () => host.screenLines().map(stripTerminalSequences)
  const last = screen().findIndex((line) => line.includes("target-39"))
  assert(last >= 0)
  await host.key(`\x1b[<64;3;${last + 1}M`)
  await host.output()
  const anchor = screen()
    .find((line) => /target-\d/.test(line))
    ?.trim()
  assert(anchor)
  lengths["prefix"] = 40
  assert(invalidate.get("prefix"))
  invalidate.get("prefix")!()
  await host.output()
  assert.equal(
    screen()
      .find((line) => /target-\d/.test(line))
      ?.trim(),
    anchor,
  )
  host.terminal.resize(60, 36)
  await host.output()
  assert.equal(
    screen()
      .find((line) => /target-\d/.test(line))
      ?.trim(),
    anchor,
  )
  lengths["target"] = 41
  invalidate.get("target")!()
  await host.output()
  assert.equal(
    screen()
      .find((line) => /target-\d/.test(line))
      ?.trim(),
    anchor,
  )
  assert(!screen().some((line) => line.includes("target-40")))
  const body = screen().findIndex((line) => /target-\d/.test(line))
  // oxlint-disable-next-line eslint/no-await-in-loop -- Terminal input must be delivered in order.
  for (let i = 0; i < 16; i++) await host.key(`\x1b[<65;3;${body + 1}M`)
  await host.output()
  assert(screen().some((line) => line.includes("target-40")))
  lengths["target"] = 42
  invalidate.get("target")!()
  await host.output()
  assert(screen().some((line) => line.includes("target-41")))
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

test("native image crops combine logical clips once and retain their identity and reservation rows", async (t) => {
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
    settings: { terminal: { imageWidthCells: 48 } },
    extensionFactories: [
      (pi) => {
        pi.registerEntryRenderer<{ name: string }>(
          "test.image-margin",
          (entry) => {
            assert(entry.data)
            return new Text(
              Array.from(
                { length: entry.data.name === "prefix" ? 7 : 8 },
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
  const first = kittyPlacements(host.terminal.output).at(-1)
  assert(first, host.terminal.output)
  assert.equal(first["y"], "360")
  assert.equal(first["h"], "360")
  assert.equal(first["r"], "8")
  await host.key("\x1b[6~")
  await host.frame()
  const second = kittyPlacements(host.terminal.output).at(-1)
  assert(second)
  assert.equal(second["i"], first["i"])
  assert.equal(second["y"], "540")
  assert.equal(second["h"], "540")
  assert.equal(second["r"], "12")
  const imageRow = host
    .screenLines()
    .findIndex((line) => kittyPlacements(line).length)
  assert(imageRow >= 0)
  assert(
    host
      .screenLines()
      .slice(imageRow + 1, imageRow + 12)
      .every((line) => stripTerminalSequences(line).trim() === ""),
  )
  assert.match(
    stripTerminalSequences(host.screenLines()[imageRow + 13] ?? ""),
    /Received\./,
  )
  host.terminal.resize(60, 28)
  await host.frame()
  assert.equal(kittyPlacements(host.terminal.output).at(-1)?.["i"], first["i"])
})
