/* eslint-disable no-control-regex, no-await-in-loop -- Inspect ANSI output and preserve terminal input order. */
import assert from "node:assert/strict"
import { test } from "node:test"

// The recording terminal supports ANSI, including Pi's native emphasis styles.
const previousColor = process.env["FORCE_COLOR"]
process.env["FORCE_COLOR"] = "3"
const { openHost } = await import("../fixtures/host.ts")
if (previousColor === undefined) delete process.env["FORCE_COLOR"]
else process.env["FORCE_COLOR"] = previousColor

test("Pi renders editable prose with native heading, emphasis, strike, and link styles", async (t) => {
  const host = await openHost(t)
  const source =
    "# Title\nPlain **bold** *italic* ~~gone~~ [Pi](https://pi.dev)"
  host.terminal.output = ""
  host.ui.setEditorText(source)
  const output = await host.output()
  assert.match(output, /Title/)
  assert.match(output, /Plain bold italic gone Pi/)
  assert.doesNotMatch(output, /# Title|\*\*bold\*\*|\*italic\*|~~gone~~|\[Pi\]/)
  assert.match(host.terminal.output, /\x1b\[1m(?:\x1b\[[\d;]+m)*b/)
  assert.match(host.terminal.output, /\x1b\[3m(?:\x1b\[[\d;]+m)*i/)
  assert.match(host.terminal.output, /\x1b\[9m(?:\x1b\[[\d;]+m)*g/)
  assert.match(host.terminal.output, /\x1b\[4m(?:\x1b\[[\d;]+m)*P/)
  assert.equal(host.ui.getEditorText(), source)
})

test("switching views preserves the source selection and the undo and redo branch", async (t) => {
  const host = await openHost(t)
  host.ui.setEditorText("**bold** tail")
  host.terminal.output = ""
  await host.key("\x1b[109;10u")
  assert.match(await host.output(), /\*\*bold\*\* tail/)
  for (let i = 0; i < 4; i++) await host.key("\x1b[1;2D")
  await host.key("\x1b[109;10u")
  await host.type("word")
  assert.equal(host.ui.getEditorText(), "**bold** word")
  await host.key("\x1b[109;10u")
  await host.key("\x1b[122;9u")
  assert.equal(host.ui.getEditorText(), "**bold** tail")
  await host.key("\x1b[109;10u")
  await host.key("\x1b[122;10u")
  assert.equal(host.ui.getEditorText(), "**bold** word")
  await host.key("\x1b[122;9u")
  await host.type("new")
  await host.key("\x1b[122;10u")
  assert.equal(host.ui.getEditorText(), "**bold** new")
  await host.key("\x1b[122;9u")
  await host.key("\x1b[122;9u")
  assert.equal(host.ui.getEditorText(), "")
})

test("typing over a formatted selection edits its visible text and submits the Markdown", async (t) => {
  const host = await openHost(t)
  host.ui.setEditorText("Keep **old**!")
  await host.key("\x1b[D")
  for (let i = 0; i < 3; i++) await host.key("\x1b[1;2D")
  host.terminal.output = ""
  await host.type("new")
  assert.equal(host.ui.getEditorText(), "Keep **new**!")
  assert.match(await host.output(), /Keep new!/)
  await host.key("\x1b[109;10u")
  await host.key("\x1b[122;9u")
  assert.equal(host.ui.getEditorText(), "Keep **old**!")
  await host.key("\x1b[109;10u")
  await host.key("\x1b[122;10u")
  await host.key("\r")
  await host.settled()
  assert.deepEqual(
    host.requests[0]?.messages.filter((message) => message.role === "user"),
    [{ role: "user", content: [{ type: "text", text: "Keep **new**!" }] }],
  )
})

test("formatted vertical selection follows terminal cells across wide text and wrapping", async (t) => {
  const host = await openHost(t, { columns: 12 })
  host.ui.setEditorText("**abcd界efghij**\nklmnop")
  await host.output()
  await host.key("\x1b[A")
  await host.key("\x1b[A")
  await host.type("X")
  assert.equal(host.ui.getEditorText(), "**abcd界Xefghij**\nklmnop")
  await host.output()
  await host.key("\x1b[1;2B")
  await host.type("!")
  assert.equal(host.ui.getEditorText(), "**abcd界X!**\nklmnop")
})

test("word, line, and document movement edit link labels and heading text", async (t) => {
  const host = await openHost(t)
  host.ui.setEditorText("# Title #\nOne **two** [three](https://pi.dev)")
  await host.key("\x1b[1;4D")
  await host.type("four")
  assert.equal(
    host.ui.getEditorText(),
    "# Title #\nOne **two** [four](https://pi.dev)",
  )
  await host.key("\x1b[1;9D")
  await host.type("Next ")
  await host.key("\x1b[1;9A")
  await host.type("New ")
  await host.key("\x1b[1;9C")
  await host.type("!")
  assert.equal(
    host.ui.getEditorText(),
    "# New Title! #\nNext One **two** [four](https://pi.dev)",
  )
})

test("replacing across formatting boundaries preserves surviving prose and removes empty marks", async (t) => {
  const host = await openHost(t)
  host.ui.setEditorText("**bold** plain")
  await host.key("\x1b[1;9A")
  await host.key("\x1b[C")
  await host.key("\x1b[C")
  for (let i = 0; i < 4; i++) await host.key("\x1b[1;2C")
  await host.type("X")
  assert.equal(host.ui.getEditorText(), "**boX**lain")
  await host.key("\x1b[122;9u")
  assert.equal(host.ui.getEditorText(), "**bold** plain")

  host.ui.setEditorText("a **old** b")
  await host.key("\x1b[1;9A")
  await host.key("\x1b[C")
  for (let i = 0; i < 5; i++) await host.key("\x1b[1;2C")
  await host.type("X")
  assert.equal(host.ui.getEditorText(), "aXb")
})

test("a selection inside source syntax remains exact after switching to formatted view", async (t) => {
  const host = await openHost(t)
  host.ui.setEditorText("**word**")
  await host.key("\x1b[109;10u")
  await host.key("\x1b[1;9A")
  await host.key("\x1b[C")
  await host.key("\x1b[1;2C")
  await host.key("\x1b[1;2C")
  await host.key("\x1b[109;10u")
  await host.type("X")
  assert.equal(host.ui.getEditorText(), "*Xord**")
  await host.key("\x1b[122;9u")
  await host.key("\x1b[109;10u")
  await host.type("Y")
  assert.equal(host.ui.getEditorText(), "*Yord**")
})

test("formatted deletion and replacement keep whole graphemes across hidden delimiters", async (t) => {
  const host = await openHost(t)
  host.ui.setEditorText("A **e**\u0301👩‍💻界B")
  await host.key("\x1b[D")
  await host.key("\x7f")
  assert.equal(host.ui.getEditorText(), "A **e**\u0301👩‍💻B")
  await host.key("\x7f")
  assert.equal(host.ui.getEditorText(), "A **e**\u0301B")
  await host.key("\x7f")
  assert.equal(host.ui.getEditorText(), "A B")
  await host.key("\x1b[122;9u")
  assert.equal(host.ui.getEditorText(), "A **e**\u0301👩‍💻界B")

  host.ui.setEditorText("A **e**\u0301B")
  await host.key("\x1b[D")
  await host.key("\x1b[1;2D")
  await host.type("X")
  assert.equal(host.ui.getEditorText(), "A **X**B")
  assert.match(await host.output(), /A XB/)
})

test("links retain exact escaped labels and destinations during formatted editing", async (t) => {
  const host = await openHost(t)
  host.ui.setEditorText('See [**a\\]b**](https://pi.dev "title") now')
  host.terminal.output = ""
  await host.output()
  assert.match(await host.output(), /See a\\\]b now/)
  await host.key("\x1b[1;3D")
  await host.key("\x1b[D")
  await host.key("\x1b[1;2D")
  await host.type("B")
  assert.equal(
    host.ui.getEditorText(),
    'See [**a\\]B**](https://pi.dev "title") now',
  )
})

test("native insertion into formatted prose preserves code, references, and source constructs", async (t) => {
  const host = await openHost(t)
  host.terminal.rows = 120
  const rest = [
    " @file /skill:check",
    "",
    "> **quoted**",
    "- [ ] **task**",
    "",
    "`**inline** /skill:literal`",
    "",
    "```ts",
    'const text = "**literal**";',
    "\t@file /skill:literal",
    "```",
    "",
    "| A | B |",
    "| - | - |",
    "| **source** | [ref] |",
    "",
    "<div>",
    "**literal**",
    "</div>",
    "",
    "[ref]: https://pi.dev",
  ].join("\n")
  host.ui.setEditorText(`***edit***${rest}`)
  await host.key("\x1b[1;9A")
  await host.key("\x1b[1;4C")
  host.ui.pasteToEditor("changed")
  assert.equal(host.ui.getEditorText(), `***changed***${rest}`)
  const output = await host.output()
  assert.match(output, /changed @file \/skill:check/)
  assert.match(output, /> \*\*quoted\*\*/)
  assert.match(output, /- \[ \] \*\*task\*\*/)
  assert.match(output, /\*\*inline\*\* \/skill:literal/)
  assert.match(output, /const text = "\*\*literal\*\*";/)
  assert.match(output, /\| \*\*source\*\* \| \[ref\] \|/)
  assert.match(output, /\[ref\]: https:\/\/pi.dev/)
  await host.key("\x1b[109;10u")
  await host.key("\x1b[122;9u")
  assert.equal(host.ui.getEditorText(), `***edit***${rest}`)
})

test("formatted movement clamps to visible document bounds without selecting hidden markers", async (t) => {
  const host = await openHost(t)
  host.ui.setEditorText("**text**")
  await host.key("\x1b[3~")
  assert.equal(host.ui.getEditorText(), "**text**")
  await host.key("\x1b[1;3C")
  await host.type("!")
  assert.equal(host.ui.getEditorText(), "**text**!")
  await host.key("\x7f")
  await host.key("\x1b[1;9A")
  await host.key("\x1b[1;2D")
  await host.type("X")
  assert.equal(host.ui.getEditorText(), "**Xtext**")
  await host.key("\x1b[1;9B")
  await host.key("\x1b[1;2C")
  await host.type("Y")
  assert.equal(host.ui.getEditorText(), "**XtextY**")
})

test("a narrow formatted draft fits terminal cells without rewriting tabs or wide text", async (t) => {
  const host = await openHost(t, { columns: 3 })
  host.ui.setEditorText("**a\t界**")
  assert.match(await host.output(), /�/)
  assert.equal(host.ui.getEditorText(), "**a\t界**")
  await host.key("\x1b[1;9A")
  await host.key("\x1b[1;3C")
  await host.key("\x1b[1;3C")
  await host.type("X")
  assert.equal(host.ui.getEditorText(), "**a\t界X**")
  await host.key("\x1b[122;9u")
  await host.key("\x1b[1;9A")
  await host.key("\x1b[C")
  await host.key("\x1b[3~")
  assert.equal(host.ui.getEditorText(), "**a界**")
})

test("setext headings and reference links retain their Markdown during live editing", async (t) => {
  const host = await openHost(t)
  const source = "__Heading__\n===\n\n[caption][ref]\n\n[ref]: /path"
  host.ui.setEditorText(source)
  host.terminal.output = ""
  const output = await host.output()
  assert.match(output, /Heading/)
  assert.match(output, /caption/)
  assert.doesNotMatch(output, /__Heading__|===|\[caption\]\[ref\]/)
  assert.match(output, /\[ref\]: \/path/)
  await host.key("\x1b[1;9A")
  await host.key("\x1b[1;4C")
  await host.type("Title")
  assert.equal(
    host.ui.getEditorText(),
    "__Title__\n===\n\n[caption][ref]\n\n[ref]: /path",
  )
  await host.key("\x1b[109;10u")
  await host.key("\x1b[122;9u")
  assert.equal(host.ui.getEditorText(), source)
})

test("a native application binding retains priority over the source toggle", async (t) => {
  const host = await openHost(t, {
    keybindings: { "app.clear": "super+shift+m" },
  })
  host.ui.setEditorText("**Draft**")
  await host.key("\x1b[109;10u")
  assert.equal(host.ui.getEditorText(), "")
  host.terminal.output = ""
  await host.key("\x1b[122;9u")
  const output = await host.output()
  assert.match(output, /Draft/)
  assert.doesNotMatch(output, /\*\*Draft\*\*/)
})
