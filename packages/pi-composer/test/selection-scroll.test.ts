/* eslint-disable no-control-regex, no-await-in-loop -- Observe native ANSI frames and preserve terminal gesture order. */
import assert from "node:assert/strict"
import { test } from "node:test"
import { stripVTControlCharacters } from "node:util"
import type { NativeClipboard } from "@earendil-works/pi-tui"

const previousColor = process.env["FORCE_COLOR"]
process.env["FORCE_COLOR"] = "3"
const { openHost } = await import("../fixtures/host.ts")
const {
  getCapabilities,
  getNativeClipboard,
  getOsc8LinkAtColumn,
  MouseRegion,
  SelectList,
  setCapabilities,
  sliceByColumn,
  Text,
  visibleWidth,
} = await import("@earendil-works/pi-tui")
const { getMarkdownTheme, getSelectListTheme } =
  await import("@earendil-works/pi-coding-agent")
if (previousColor === undefined) delete process.env["FORCE_COLOR"]
else process.env["FORCE_COLOR"] = previousColor

type Host = Awaited<ReturnType<typeof openHost>>

function assertWritableClipboard(
  clipboard: NativeClipboard | undefined,
): asserts clipboard is NativeClipboard &
  Required<Pick<NativeClipboard, "setText">> {
  assert(clipboard?.setText, "Pi must provide the macOS clipboard boundary")
}

function screen(host: Host): Map<number, string> {
  const rows = new Map<number, string>()
  for (const match of host.terminal.output.matchAll(
    /\x1b\[(\d+);1H\x1b\[2K(.*?)(?=\x1b\[\d+;\d+H|$)/gs,
  )) {
    if (Number(match[1]) <= host.terminal.rows)
      rows.set(Number(match[1]), match[2]!)
  }
  return rows
}

function rowContaining(host: Host, text: string): number {
  const row = [...screen(host)].find(([, line]) =>
    stripVTControlCharacters(line).includes(text),
  )?.[0]
  assert(row, `Pi must display a row containing ${JSON.stringify(text)}`)
  return row
}

function reversedText(line: string): string {
  let reversed = false
  let text = ""
  for (const part of line.split(/(\x1b\[(?:0|7|27)?m)/)) {
    if (part.startsWith("\x1b[") && /^\x1b\[(?:0|7|27)?m$/.test(part)) {
      reversed = part === "\x1b[7m"
    } else if (reversed) text += stripVTControlCharacters(part)
  }
  return text
}

test("native hyperlinks cover recognized link text in both views without changing submitted Markdown", async (t) => {
  const host = await openHost(t, { columns: 100 })
  const capabilities = getCapabilities()
  t.after(() => setCapabilities(capabilities))
  const examples = [
    {
      source: "Before https://pi.dev/a?x=1&y=2 after",
      label: "https://pi.dev/a?x=1&y=2",
      href: "https://pi.dev/a?x=1&y=2",
    },
    {
      source: "Use <https://pi.dev/auto> now",
      label: "https://pi.dev/auto",
      href: "https://pi.dev/auto",
    },
    {
      source: "[**label** and `code`](https://pi.dev/inline) tail",
      label: "code",
      href: "https://pi.dev/inline",
    },
    {
      source: "[Attachment: image % # 界.png](</tmp/image % # 界.png>) tail",
      label: "Attachment: image % # 界.png",
      href: "file://localhost/tmp/image%20%25%20%23%20%E7%95%8C.png",
    },
    {
      source: "[image](file:///tmp/image%20%2520%23.png)",
      label: "image",
      href: "file://localhost/tmp/image%20%2520%23.png",
    },
    {
      source: "[remote image](file://server/share/image.png)",
      label: "remote image",
      href: "file://server/share/image.png",
    },
    {
      source: "> - [e\u0301👩‍💻界 label][ref]\n\n[ref]: https://pi.dev/reference",
      label: "e\u0301👩‍💻界 label",
      href: "https://pi.dev/reference",
    },
  ]
  for (const sourceView of [false, true]) {
    if (sourceView) await host.key("\x1b[109;10u")
    setCapabilities({ ...capabilities, hyperlinks: true })
    for (const { source, label, href } of examples) {
      host.ui.setEditorText(source)
      await host.output()
      const line = screen(host).get(rowContaining(host, label))!
      const text = stripVTControlCharacters(line)
      const column = visibleWidth(text.slice(0, text.indexOf(label)))
      for (let offset = 0; offset < visibleWidth(label); offset++) {
        assert.equal(getOsc8LinkAtColumn(line, column + offset), href)
      }
      assert.equal(host.ui.getEditorText(), source)
      if (sourceView) assert(text.includes(source.split("\n")[0]!))
    }
    setCapabilities({ ...capabilities, hyperlinks: false })
    host.terminal.resize(sourceView ? 102 : 101, 24)
    await host.output()
    const line = screen(host).get(rowContaining(host, "e\u0301👩‍💻界 label"))!
    for (let column = 0; column < visibleWidth(line); column++)
      assert.equal(getOsc8LinkAtColumn(line, column), undefined)
  }
  await host.key("\x1b[13;9u")
  await host.settled()
  assert.deepEqual(
    host.requests[0]?.messages.filter((message) => message.role === "user"),
    [
      {
        role: "user",
        content: [{ type: "text", text: examples.at(-1)!.source }],
      },
    ],
  )
})

test("wrapped hyperlinks preserve mouse selection, clipboard text, destination edits, and undo", async (t) => {
  const host = await openHost(t, { columns: 12 })
  const capabilities = getCapabilities()
  setCapabilities({ ...capabilities, hyperlinks: true })
  t.after(() => setCapabilities(capabilities))
  const source = "See [**ab界e\u0301👩‍💻cd**](https://pi.dev/wrap) end"
  host.ui.setEditorText(source)
  await host.output()
  const first = rowContaining(host, "See ab界e\u0301👩‍💻")
  const last = rowContaining(host, "cd end")
  const rows = screen(host)
  assert.equal(getOsc8LinkAtColumn(rows.get(first)!, 3), undefined)
  for (let column = 4; column < 11; column++)
    assert.equal(
      getOsc8LinkAtColumn(rows.get(first)!, column),
      "https://pi.dev/wrap",
    )
  assert.equal(getOsc8LinkAtColumn(rows.get(first)!, 11), undefined)
  assert.equal(getOsc8LinkAtColumn(rows.get(last)!, 1), "https://pi.dev/wrap")
  assert.equal(getOsc8LinkAtColumn(rows.get(last)!, 2), undefined)
  assert.equal(getOsc8LinkAtColumn(rows.get(last)!, 6), undefined)

  await host.key(`\x1b[<0;1;${last}M`)
  await host.key(`\x1b[<32;3;${last}M`)
  await host.key(`\x1b[<0;3;${last}m`)
  await host.type("X")
  assert.equal(host.ui.getEditorText(), source.replace("cd", "X"))
  await host.key("\x1b[122;9u")
  assert.equal(host.ui.getEditorText(), source)

  const changed = source.replace("/wrap", "/changed")
  host.ui.setEditorText(changed)
  await host.output()
  assert.equal(
    getOsc8LinkAtColumn(screen(host).get(last)!, 0),
    "https://pi.dev/changed",
  )
  const clipboard = getNativeClipboard()
  assertWritableClipboard(clipboard)
  let copied = ""
  t.mock.method(clipboard, "setText", async (text: string) => {
    copied = text
  })
  await host.key("\x1b[97;9u")
  await host.key("\x1b[99;9u")
  assert.equal(copied, changed)
  await host.key("\x1b[122;9u")
  await host.output()
  assert.equal(
    getOsc8LinkAtColumn(screen(host).get(last)!, 0),
    "https://pi.dev/wrap",
  )
  assert.equal(host.ui.getEditorText(), source)
})

test("code and empty or control-bearing destinations remain literal without hyperlink output", async (t) => {
  const host = await openHost(t, { columns: 120 })
  const capabilities = getCapabilities()
  setCapabilities({ ...capabilities, hyperlinks: true })
  t.after(() => setCapabilities(capabilities))
  const examples = [
    "`literal https://pi.dev/code`",
    "```text\nliteral https://pi.dev/code\n```",
    "[literal]()",
    "[literal](https://pi.dev/\u0007)",
    "[literal](https://pi.dev/\u001b]52;c;payload)",
    "[literal](https://pi.dev/\u009c)",
  ]
  for (const sourceView of [false, true]) {
    if (sourceView) await host.key("\x1b[109;10u")
    for (const source of examples) {
      host.ui.setEditorText(source)
      await host.output()
      const line = screen(host).get(rowContaining(host, "literal"))!
      for (let column = 0; column < visibleWidth(line); column++)
        assert.equal(getOsc8LinkAtColumn(line, column), undefined)
      assert.doesNotMatch(line, /\x1b\]52;/)
      assert.equal(host.ui.getEditorText(), source)
    }
  }
})

test("mouse and keyboard replace the same wrapped Unicode prose in either drag direction", async (t) => {
  const clipboard = getNativeClipboard()
  assertWritableClipboard(clipboard)
  let copied = ""
  t.mock.method(clipboard, "setText", async (text: string) => {
    copied = text
  })
  const host = await openHost(t, { columns: 16 })
  const source = "Keep **ae\u0301👩‍💻界bcdefgh** tail"
  host.ui.setEditorText(source)
  await host.key("\x1b[1;9A")
  for (let i = 0; i < 6; i++) await host.key("\x1b[C")
  for (let i = 0; i < 8; i++) await host.key("\x1b[1;2C")
  await host.output()
  const first = rowContaining(host, "Keep ae\u0301👩‍💻界bcde")
  const second = rowContaining(host, "fgh tail")
  assert.equal(reversedText(screen(host).get(first)!), "e\u0301👩‍💻界bcde")
  assert.equal(reversedText(screen(host).get(second)!), "fg")
  await host.key("\x1b[99;9u")
  assert.equal(copied, "e\u0301👩‍💻界bcdef")
  await host.type("X")
  assert.equal(host.ui.getEditorText(), "Keep **aXgh** tail")

  for (const backwards of [false, true]) {
    await host.key("\x1b[122;9u")
    await host.output()
    const start = backwards ? `2;${second}` : `7;${first}`
    const end = backwards ? `7;${first}` : `2;${second}`
    await host.key(`\x1b[<0;${start}M`)
    await host.key(`\x1b[<32;${end}M`)
    await host.key(`\x1b[<0;${end}m`)
    await host.output()
    assert.equal(reversedText(screen(host).get(first)!), "e\u0301👩‍💻界bcde")
    assert.equal(
      reversedText(screen(host).get(second)!),
      backwards ? "f" : "fg",
    )
    await host.key("\x1b[99;9u")
    assert.equal(copied, "e\u0301👩‍💻界bcdef")
    await host.type("X")
    assert.equal(host.ui.getEditorText(), "Keep **aXgh** tail")
  }
  await host.key("\x1b[109;10u")
  await host.key("\x1b[122;9u")
  assert.equal(host.ui.getEditorText(), source)
  await host.key("\x1b[122;10u")
  assert.equal(host.ui.getEditorText(), "Keep **aXgh** tail")
})

test("highlighted fenced code keeps a visible source selection through wrapped mouse editing", async (t) => {
  const clipboard = getNativeClipboard()
  assertWritableClipboard(clipboard)
  let copied = ""
  t.mock.method(clipboard, "setText", async (text: string) => {
    copied = text
  })
  const host = await openHost(t, { columns: 20 })
  const source = '> ```ts\n> const a = "e\u0301👩‍💻界abc";\n> ```'
  host.ui.setEditorText(source)
  await host.key("\x1b[97;9u")
  await host.key("\x1b[D")
  for (let i = 0; i < 21; i++) await host.key("\x1b[C")
  for (let i = 0; i < 5; i++) await host.key("\x1b[1;2C")
  await host.output()
  const first = rowContaining(host, '│ const a = "e\u0301👩‍💻界a')
  const second = rowContaining(host, '│ bc";')
  assert.equal(reversedText(screen(host).get(first)!), "e\u0301👩‍💻界a")
  assert.equal(reversedText(screen(host).get(second)!), "bc")
  await host.key("\x1b[99;9u")
  assert.equal(copied, "e\u0301👩‍💻界ab")
  await host.type("X")
  assert.equal(host.ui.getEditorText(), '> ```ts\n> const a = "Xc";\n> ```')
  await host.key("\x1b[122;9u")
  await host.output()
  await host.key(`\x1b[<0;14;${first}M`)
  await host.key(`\x1b[<32;4;${second}M`)
  await host.key(`\x1b[<0;4;${second}m`)
  await host.output()
  assert.equal(reversedText(screen(host).get(first)!), "e\u0301👩‍💻界a")
  assert.equal(reversedText(screen(host).get(second)!), "bc")
  await host.key("\x1b[99;9u")
  assert.equal(copied, "e\u0301👩‍💻界ab")
  await host.type("X")
  assert.equal(host.ui.getEditorText(), '> ```ts\n> const a = "Xc";\n> ```')
})

test("native wheel scrolling preserves a long draft selection and typing reveals its caret", async (t) => {
  const host = await openHost(t)
  const lines = Array.from(
    { length: 30 },
    (_, index) => `**row ${index.toString().padStart(2, "0")}**`,
  )
  const source = lines.join("\n")
  host.ui.setEditorText(source)
  await host.key("\x1b[1;9B")
  await host.key("\x1b[1;2D")
  await host.key("\x1b[1;2D")
  await host.output()
  const middle = rowContaining(host, "row 25")
  for (let i = 0; i < 3; i++) await host.key(`\x1b[<64;3;${middle}M`)
  await host.output()
  rowContaining(host, "row 20")
  assert(
    ![...screen(host).values()].some((line) =>
      stripVTControlCharacters(line).includes("row 29"),
    ),
  )
  assert.equal(host.ui.getEditorText(), source)
  await host.type("last")
  await host.output()
  rowContaining(host, "row last")
  assert.equal(
    host.ui.getEditorText(),
    [...lines.slice(0, -1), "**row last**"].join("\n"),
  )
  await host.key("\x1b[122;9u")
  assert.equal(host.ui.getEditorText(), source)
})

for (const example of [
  {
    name: "a list inside a quote",
    columns: 12,
    source: "> - **abcdefghi** tail",
    first: "│ - abcdefg",
    second: "│   hi tail",
    column: 7,
    endColumn: 6,
    skip: 6,
    select: 6,
    selected: "cdefgh",
    replacement: "> - **abXi** tail",
  },
  {
    name: "nested quotes",
    columns: 12,
    source: "> > **abcdefghi** tail",
    first: "│ │ abcdefg",
    second: "│ │ hi tail",
    column: 7,
    endColumn: 6,
    skip: 6,
    select: 6,
    selected: "cdefgh",
    replacement: "> > **abXi** tail",
  },
  {
    name: "inline code",
    columns: 16,
    source: "Use `ae\u0301👩‍💻界bcdefgh` end",
    first: "Use ae\u0301👩‍💻界bcdef",
    second: "gh end",
    column: 6,
    endColumn: 2,
    skip: 5,
    select: 9,
    selected: "e\u0301👩‍💻界bcdefg",
    replacement: "Use `aXh` end",
  },
]) {
  test(`mouse and keyboard select the same wrapped source in ${example.name}`, async (t) => {
    const clipboard = getNativeClipboard()
    assertWritableClipboard(clipboard)
    let copied = ""
    t.mock.method(clipboard, "setText", async (text: string) => {
      copied = text
    })
    const host = await openHost(t, { columns: example.columns })
    host.ui.setEditorText(example.source)
    await host.key("\x1b[1;9A")
    for (let i = 0; i < example.skip; i++) await host.key("\x1b[C")
    for (let i = 0; i < example.select; i++) await host.key("\x1b[1;2C")
    await host.output()
    const first = rowContaining(host, example.first)
    const second = rowContaining(host, example.second)
    const selectedFirst = reversedText(screen(host).get(first)!)
    const selectedSecond = reversedText(screen(host).get(second)!)
    assert(selectedFirst.length > 0 && selectedSecond.length > 0)
    await host.key("\x1b[99;9u")
    assert.equal(copied, example.selected)
    await host.type("X")
    assert.equal(host.ui.getEditorText(), example.replacement)

    for (const backwards of [false, true]) {
      await host.key("\x1b[122;9u")
      await host.output()
      const start = `${example.column};${first}`
      const end = `${example.endColumn};${second}`
      await host.key(`\x1b[<0;${backwards ? end : start}M`)
      await host.key(`\x1b[<32;${backwards ? start : end}M`)
      await host.key(`\x1b[<0;${backwards ? start : end}m`)
      await host.output()
      assert.equal(reversedText(screen(host).get(first)!), selectedFirst)
      if (!backwards)
        assert.equal(reversedText(screen(host).get(second)!), selectedSecond)
      await host.key("\x1b[99;9u")
      assert.equal(copied, example.selected)
      await host.type("X")
      assert.equal(host.ui.getEditorText(), example.replacement)
    }
  })
}

test("captured drags scroll beyond either editor edge without selecting surrounding UI", async (t) => {
  const host = await openHost(t)
  host.ui.setWidget("above", ["Above draft"])
  host.ui.setWidget("below", ["Below draft"], { placement: "belowEditor" })
  const lines = Array.from(
    { length: 20 },
    (_, index) => `line ${index.toString().padStart(2, "0")}`,
  )
  const source = lines.join("\n")
  host.ui.setEditorText(source)
  await host.key("\x1b[97;9u")
  await host.key("\x1b[D")
  await host.output()
  const first = rowContaining(host, "line 00")
  const last = rowContaining(host, "line 06")
  await host.key(`\x1b[<0;6;${first}M`)
  for (let i = 0; i < 3; i++) {
    await host.key(`\x1b[<32;7;${last + 1}M`)
    await host.output()
  }
  rowContaining(host, "line 09")
  await host.key(`\x1b[<0;7;${last}m`)
  await host.type("X")
  assert.equal(
    host.ui.getEditorText(),
    ["line X9", ...lines.slice(10)].join("\n"),
  )
  await host.key("\x1b[122;9u")
  await host.key("\x1b[97;9u")
  await host.key("\x1b[C")
  await host.output()
  const top = rowContaining(host, "line 13")
  const bottom = rowContaining(host, "line 19")
  await host.key(`\x1b[<0;7;${bottom}M`)
  for (let i = 0; i < 3; i++) {
    await host.key(`\x1b[<32;6;${top - 1}M`)
    await host.output()
  }
  rowContaining(host, "line 10")
  await host.key(`\x1b[<0;6;${top}m`)
  await host.type("Y")
  assert.equal(
    host.ui.getEditorText(),
    [...lines.slice(0, 10), "line Y9"].join("\n"),
  )
  await host.output()
  rowContaining(host, "Above draft")
  rowContaining(host, "Below draft")
  await host.key("\x1b[122;9u")
  assert.equal(host.ui.getEditorText(), source)
})

test("native resize keeps a wrapped selection, mouse placement, and source editing usable", async (t) => {
  const host = await openHost(t, { columns: 20 })
  const source = "> - **ae\u0301👩‍💻界bcdefghijklm** tail\n>   next"
  host.ui.setEditorText(source)
  await host.key("\x1b[97;9u")
  await host.key("\x1b[D")
  for (let i = 0; i < 5; i++) await host.key("\x1b[C")
  for (let i = 0; i < 7; i++) await host.key("\x1b[1;2C")
  host.terminal.resize(12, 16)
  await host.output()
  rowContaining(host, "│   cdefghi")
  await host.type("X")
  assert.equal(host.ui.getEditorText(), "> - **aXfghijklm** tail\n>   next")
  await host.key("\x1b[122;9u")
  assert.equal(host.ui.getEditorText(), source)
  host.terminal.resize(40, 30)
  await host.output()
  const row = rowContaining(host, "│ - ae\u0301👩‍💻界bcdefghijklm tail")
  await host.key(`\x1b[<0;8;${row}M`)
  await host.key(`\x1b[<0;8;${row}m`)
  await host.type("Y")
  assert.equal(
    host.ui.getEditorText(),
    "> - **ae\u0301Y👩‍💻界bcdefghijklm** tail\n>   next",
  )
  await host.key("\x1b[122;9u")
  await host.key("\x1b[109;10u")
  host.terminal.resize(16, 20)
  await host.output()
  await host.key("\x1b[1;2C")
  await host.type("Z")
  assert.equal(
    host.ui.getEditorText(),
    "> - **ae\u0301Z界bcdefghijklm** tail\n>   next",
  )
  await host.key("\x1b[122;9u")
  assert.equal(host.ui.getEditorText(), source)
})

test("fullscreen widgets, header, footer, and an overlay picker keep their native mouse and focus routes", async (t) => {
  const host = await openHost(t, {
    extension: (pi) => {
      pi.registerShortcut("ctrl+shift+p", {
        description: "Choose a file reference",
        handler: async (ctx) => {
          const value = await ctx.ui.custom<string | undefined>(
            (_tui, _theme, _keys, done) => {
              const picker = new SelectList(
                [
                  { value: "@first.md", label: "First overlay reference" },
                  { value: "@chosen.md", label: "Chosen overlay reference" },
                ],
                5,
                getSelectListTheme(),
              )
              picker.onSelect = (item) => done(item.value)
              picker.onCancel = () => done(undefined)
              return picker
            },
            { overlay: true },
          )
          if (value !== undefined) ctx.ui.pasteToEditor(value)
        },
      })
    },
  })
  const clicks: string[] = []
  const control = (label: string) =>
    new MouseRegion(new Text(label, 0, 0), (event) => {
      if (event.type === "click" && event.button === "left") clicks.push(label)
      return { handled: true }
    })
  host.ui.setHeader(() => new Text("Native header", 0, 0))
  host.ui.setFooter(() => control("Footer control"))
  host.ui.setWidget("above", () => control("Above control"))
  host.ui.setWidget("below", () => control("Below control"), {
    placement: "belowEditor",
  })
  const source = "Keep old tail\n- item\n```ts\nvalue\n```"
  host.ui.setEditorText(source)
  await host.output()
  rowContaining(host, "Native header")
  for (const label of ["Above control", "Below control", "Footer control"]) {
    const row = rowContaining(host, label)
    await host.key(`\x1b[<0;2;${row}M`)
    await host.key(`\x1b[<0;2;${row}m`)
  }
  assert.deepEqual(clicks, ["Above control", "Below control", "Footer control"])
  assert.equal(host.ui.getEditorText(), source)
  const draftRow = rowContaining(host, "Keep old tail")
  await host.key(`\x1b[<0;6;${draftRow}M`)
  await host.key(`\x1b[<32;9;${draftRow}M`)
  await host.key(`\x1b[<0;9;${draftRow}m`)
  await host.key("\x1b[112;6u")
  await host.output()
  const choiceRow = rowContaining(host, "Chosen overlay reference")
  await host.key(`\x1b[<0;20;${choiceRow}M`)
  await host.key(`\x1b[<0;20;${choiceRow}m`)
  assert.equal(
    host.ui.getEditorText(),
    "Keep @chosen.md tail\n- item\n```ts\nvalue\n```",
  )
  assert.equal(host.requests.length, 0)
  await host.key("\x1b[122;9u")
  assert.equal(host.ui.getEditorText(), source)
  await host.type("new")
  assert.equal(
    host.ui.getEditorText(),
    "Keep new tail\n- item\n```ts\nvalue\n```",
  )
  host.terminal.resize(40, 20)
  await host.output()
  for (const label of [
    "Native header",
    "Above control",
    "Below control",
    "Footer control",
  ])
    rowContaining(host, label)
})

test("mouse and both keyboard directions agree at hidden Markdown boundaries", async (t) => {
  const clipboard = getNativeClipboard()
  assertWritableClipboard(clipboard)
  let copied = ""
  t.mock.method(clipboard, "setText", async (text: string) => {
    copied = text
  })
  const host = await openHost(t)
  const source = "A **bold** Z"
  host.ui.setEditorText(source)
  await host.key("\x1b[1;9A")
  for (let i = 0; i < 6; i++) await host.key("\x1b[C")
  for (let i = 0; i < 4; i++) await host.key("\x1b[1;2D")
  await host.key("\x1b[99;9u")
  assert.equal(copied, "bold")
  await host.output()
  const row = rowContaining(host, "A bold Z")
  await host.key(`\x1b[<0;7;${row}M`)
  await host.key(`\x1b[<32;3;${row}M`)
  await host.key(`\x1b[<0;3;${row}m`)
  await host.key("\x1b[99;9u")
  assert.equal(copied, "bold")
  await host.type("new")
  assert.equal(host.ui.getEditorText(), "A **new** Z")
  await host.key("\x1b[122;9u")
  await host.key("\x1b[1;9A")
  await host.key("\x1b[C")
  await host.key("\x1b[C")
  for (let i = 0; i < 4; i++) await host.key("\x1b[1;2C")
  await host.key("\x1b[99;9u")
  assert.equal(copied, "bold")
  await host.type("new")
  assert.equal(host.ui.getEditorText(), "A **new** Z")
})

test("the effective completion picker owns wheel and mouse input after a long draft is resized", async (t) => {
  const host = await openHost(t)
  host.ui.addAutocompleteProvider((base) => ({
    async getSuggestions() {
      return {
        prefix: "@pick",
        items: Array.from({ length: 8 }, (_, index) => ({
          value: `@option${index}.md`,
          label: `Picker option ${index}`,
        })),
      }
    },
    applyCompletion: (...args) => base.applyCompletion(...args),
  }))
  const prefix = Array.from(
    { length: 20 },
    (_, index) => `- row ${index}\n`,
  ).join("")
  host.ui.setEditorText(`${prefix}- @pick`)
  await host.key("\t")
  await host.output()
  host.terminal.resize(40, 28)
  await host.output()
  const picker = rowContaining(host, "Picker option 2")
  for (let i = 0; i < 6; i++) await host.key(`\x1b[<65;4;${picker}M`)
  await host.output()
  const chosen = rowContaining(host, "Picker option 7")
  rowContaining(host, "- @pick")
  await host.key(`\x1b[<0;4;${chosen}M`)
  await host.key(`\x1b[<0;4;${chosen}m`)
  assert.equal(host.ui.getEditorText(), `${prefix}- @option7.md `)
  assert.equal(host.requests.length, 0)
  await host.key("\x1b[122;9u")
  assert.equal(host.ui.getEditorText(), `${prefix}- @pick`)
})

test("mouse edits preserve literal Markdown, tabs, and whole graphemes at partial cells", async (t) => {
  const host = await openHost(t, { columns: 40 })
  host.terminal.resize(40, 40)
  const source =
    "| A | B |\n| - | - |\n| **raw** | `code` |\n\n<div>\n**html**\n</div>\n\n```\n\t👩‍💻界\n```"
  host.ui.setEditorText(source)
  await host.output()
  const raw = rowContaining(host, "| **raw** | `code` |")
  rowContaining(host, "**html**")
  await host.key(`\x1b[<0;5;${raw}M`)
  await host.key(`\x1b[<32;8;${raw}M`)
  await host.key(`\x1b[<0;8;${raw}m`)
  await host.type("new")
  assert.equal(host.ui.getEditorText(), source.replace("**raw**", "**new**"))
  await host.key("\x1b[122;9u")
  await host.output()
  const code = rowContaining(host, "    👩‍💻界")
  await host.key(`\x1b[<0;3;${code}M`)
  await host.key(`\x1b[<0;3;${code}m`)
  await host.type("Q")
  assert.equal(host.ui.getEditorText(), source.replace("\t👩‍💻界", "Q\t👩‍💻界"))
  await host.key("\x1b[122;9u")
  await host.output()
  await host.key(`\x1b[<0;6;${code}M`)
  await host.key(`\x1b[<0;6;${code}m`)
  await host.key(`\x1b[<4;9;${code}M`)
  await host.key(`\x1b[<4;9;${code}m`)
  await host.output()
  assert.equal(reversedText(screen(host).get(code)!), "👩‍💻界 ")
  await host.type("Z")
  assert.equal(host.ui.getEditorText(), source.replace("\t👩‍💻界", "\tZ"))
  await host.key("\x1b[122;9u")
  await host.key("\x1b[109;10u")
  await host.type("Z")
  assert.equal(host.ui.getEditorText(), source.replace("\t👩‍💻界", "\tZ"))
})

test("native theme changes refresh highlighted drafts after movement and scrolling", async (t) => {
  const host = await openHost(t)
  const source = "```ts\nconst value = 1;\n```"
  host.ui.setEditorText(source)
  await host.output()
  const row = rowContaining(host, "const value = 1;")
  const dark = screen(host).get(row)!
  await host.key("\x1b[D")
  await host.key(`\x1b[<64;4;${row}M`)
  assert.equal(host.ui.setTheme("light").success, true)
  await host.output()
  const light = screen(host).get(rowContaining(host, "const value = 1;"))!
  const highlighted = getMarkdownTheme().highlightCode!(
    "const value = 1;",
    "ts",
  )[0]!
  assert(light.includes(sliceByColumn(highlighted, 0, 1)))
  assert.notEqual(light, dark)
  assert.equal(host.ui.getEditorText(), source)
  await host.type("X")
  assert.equal(host.ui.getEditorText(), "```ts\nconst value = 1;\n``X`")
  await host.key("\x1b[122;9u")
  assert.equal(host.ui.getEditorText(), source)
})
