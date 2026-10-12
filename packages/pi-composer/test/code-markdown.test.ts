/* eslint-disable no-control-regex, no-await-in-loop -- Inspect ANSI output and preserve terminal input order. */
import assert from "node:assert/strict"
import { writeFile } from "node:fs/promises"
import { join } from "node:path"
import { test } from "node:test"
import { stripVTControlCharacters } from "node:util"

const previousColor = process.env["FORCE_COLOR"]
process.env["FORCE_COLOR"] = "3"
const { openHost } = await import("../fixtures/host.ts")
const { getMarkdownTheme } = await import("@earendil-works/pi-coding-agent")
const { sliceByColumn } = await import("@earendil-works/pi-tui")
if (previousColor === undefined) delete process.env["FORCE_COLOR"]
else process.env["FORCE_COLOR"] = previousColor

test("Pi styles ordinary and multibacktick inline code without normalizing its source", async (t) => {
  const host = await openHost(t)
  const source = "Use `plain` and `` `quoted` **literal** ``."
  host.terminal.output = ""
  host.ui.setEditorText(source)
  assert.match(
    await host.output(),
    /Use plain and  `quoted` \*\*literal\*\* \./,
  )
  assert(host.terminal.output.includes(getMarkdownTheme().code("p")))
  assert.equal(host.ui.getEditorText(), source)
  host.terminal.output = ""
  await host.key("\x1b[109;10u")
  assert.match(
    await host.output(),
    /Use `plain` and `` `quoted` \*\*literal\*\* ``\./,
  )
  assert.equal(host.ui.getEditorText(), source)
})

test("Pi highlights fenced code with its native theme and keeps every delimiter and tab editable", async (t) => {
  const host = await openHost(t)
  host.terminal.rows = 100
  const source =
    "````ts\n\tconst value = `example`;\n```\n````\n\n~~~\n  @file /skill:literal\n~~~~"
  host.terminal.output = ""
  host.ui.setEditorText(source)
  const output = await host.output()
  assert.match(output, /````ts/)
  assert.match(output, /    const value = `example`;/)
  assert.match(output, /  @file \/skill:literal/)
  const theme = getMarkdownTheme()
  assert(host.terminal.output.includes(theme.codeBlockBorder("`")))
  const highlighted = theme.highlightCode!("const value = `example`;", "ts")[0]!
  assert(host.terminal.output.includes(sliceByColumn(highlighted, 0, 1)))
  assert(
    host.terminal.output.includes(sliceByColumn(theme.codeBlock("@"), 0, 1)),
  )
  assert.equal(host.ui.getEditorText(), source)
  await host.key("\x1b[109;10u")
  await host.key("\x1b[109;10u")
  assert.equal(host.ui.getEditorText(), source)
})

test("native syntax colors survive multiline code and Unicode wrapping while edits remain live", async (t) => {
  const host = await openHost(t, { columns: 20 })
  host.terminal.rows = 100
  const source =
    "```ts\n/* first\ncontinued */\n\tconst text = `e\u0301👩‍💻界`;\n```"
  host.ui.setEditorText(source)
  host.terminal.output = ""
  assert.match(await host.output(), /e\u0301👩‍💻界/)
  const row = host.terminal.output
    .split("\x1b[2K")
    .find((line) => stripVTControlCharacters(line).includes("continued */"))
  assert(row)
  const comment = getMarkdownTheme().highlightCode!("/* continued */", "ts")[0]!
  assert(row.includes(sliceByColumn(comment, 3, 1)))
  await host.key("\x1b[97;9u")
  await host.key("\x1b[D")
  await host.key("\x1b[B")
  await host.key("\x1b[B")
  await host.key("\x1b[1;9D")
  await host.key("\x1b[1;4C")
  await host.type("changed")
  assert.equal(
    host.ui.getEditorText(),
    "```ts\n/* first\nchanged */\n\tconst text = `e\u0301👩‍💻界`;\n```",
  )
  assert.match(await host.output(), /changed \*\//)
  await host.key("\x1b[122;9u")
  assert.equal(host.ui.getEditorText(), source)
})

test("long fenced code stays responsive without changing the draft", async (t) => {
  const host = await openHost(t)
  const source = '```ts\nconst text = "' + "x".repeat(5100) + '";\n```'
  let start = performance.now()
  host.ui.setEditorText(source)
  await host.output()
  assert(
    performance.now() - start < 1500,
    "A long code draft must render within 1.5 seconds",
  )
  start = performance.now()
  await host.key("\x1b[D")
  await host.output()
  assert(
    performance.now() - start < 1500,
    "Caret movement must finish within 1.5 seconds",
  )
  assert.equal(host.ui.getEditorText(), source)
})

for (const view of ["formatted", "source"]) {
  test(`Enter continues fenced code in ${view} view; Shift Enter inserts a newline and Command Enter submits`, async (t) => {
    const host = await openHost(t)
    if (view === "source") await host.key("\x1b[109;10u")
    const source = "```ts\n\tconst value = 1;\n```"
    host.ui.setEditorText(source)
    await host.key("\x1b[97;9u")
    await host.key("\x1b[D")
    await host.key("\x1b[B")
    await host.key("\x1b[1;9C")
    await host.key("\r")
    assert.equal(host.ui.getEditorText(), "```ts\n\tconst value = 1;\n\t\n```")
    assert.equal(host.requests.length, 0)
    await host.key("\x1b[122;9u")
    assert.equal(host.ui.getEditorText(), source)
    await host.key("\x1b[122;10u")
    await host.key("\x1b[13;2u")
    const submitted = "```ts\n\tconst value = 1;\n\t\n\n```"
    assert.equal(host.ui.getEditorText(), submitted)
    assert.equal(host.requests.length, 0)
    await host.key("\x1b[13;9u")
    await host.settled()
    assert.equal(host.ui.getEditorText(), "")
    assert.deepEqual(
      host.requests[0]?.messages.filter((message) => message.role === "user"),
      [{ role: "user", content: [{ type: "text", text: submitted }] }],
    )
  })
}

test("native application Enter bindings take precedence inside fenced code", async (t) => {
  const host = await openHost(t, { keybindings: { "app.clear": "enter" } })
  const source = "```ts\n\tconst value = 1;"
  host.ui.setEditorText(source)
  await host.key("\r")
  assert.equal(host.ui.getEditorText(), "")
  assert.equal(host.requests.length, 0)
  await host.key("\x1b[122;9u")
  assert.equal(host.ui.getEditorText(), source)
})

test("explicit native Enter bindings retain newline, submit, and application priority in code", async (t) => {
  const host = await openHost(t, {
    keybindings: {
      "tui.input.newLine": "enter",
      "tui.input.submit": "shift+enter",
      "app.clear": "super+enter",
    },
  })
  host.ui.setEditorText("```ts\nconst value = 1;\n```")
  await host.key("\x1b[97;9u")
  await host.key("\x1b[D")
  await host.key("\x1b[B")
  await host.key("\x1b[1;9C")
  await host.key("\r")
  const source = "```ts\nconst value = 1;\n\n```"
  assert.equal(host.ui.getEditorText(), source)
  await host.key("\x1b[13;9u")
  assert.equal(host.ui.getEditorText(), "")
  assert.equal(host.requests.length, 0)
  await host.key("\x1b[122;9u")
  await host.key("\x1b[109;10u")
  await host.key("\x1b[13;2u")
  assert.equal(host.ui.getEditorText(), "")
  await host.settled()
  assert.deepEqual(
    host.requests[0]?.messages.filter((message) => message.role === "user"),
    [{ role: "user", content: [{ type: "text", text: source }] }],
  )
})

test("native replacement and paste keep code tabs and literal references with the composer's LF handling", async (t) => {
  const host = await openHost(t)
  host.ui.setEditorText("```text\r\n\told\r```")
  const original = "```text\n\told\n```"
  assert.equal(host.ui.getEditorText(), original)
  await host.key("\x1b[97;9u")
  await host.key("\x1b[D")
  await host.key("\x1b[B")
  await host.key("\x1b[1;9C")
  for (let index = 0; index < 3; index++) await host.key("\x1b[1;2D")
  host.ui.pasteToEditor("new\r\n\t/skill:literal\t@file\r\n\t$example")
  const source = "```text\n\tnew\n\t/skill:literal\t@file\n\t$example\n```"
  assert.equal(host.ui.getEditorText(), source)
  await host.key("\x1b[109;10u")
  await host.key("\x1b[122;9u")
  assert.equal(host.ui.getEditorText(), original)
  await host.key("\x1b[122;10u")
  await host.key("\x1b[109;10u")
  await host.key("\x1b[13;9u")
  await host.settled()
  assert.deepEqual(
    host.requests[0]?.messages.filter((message) => message.role === "user"),
    [{ role: "user", content: [{ type: "text", text: source }] }],
  )
})

for (const [name, source] of [
  ["a closing fence", "~~~\n\tcode\n~~~~"],
  ["prose after a closed fence", "```ts\nconst x = 1;\n```\nAfter"],
  ["prose outside an unfinished quoted fence", "> ```\n> code\nAfter"],
  ["ordinary inline code", "Use `` `literal` ``."],
]) {
  test(`Enter submits ${name} through Pi`, async (t) => {
    const host = await openHost(t)
    host.ui.setEditorText(source!)
    await host.key("\r")
    await host.settled()
    assert.equal(host.requests.length, 1)
    assert.deepEqual(
      host.requests[0]?.messages.filter((message) => message.role === "user"),
      [{ role: "user", content: [{ type: "text", text: source }] }],
    )
  })
}

test("a closing fence with trailing whitespace submits without continuing the block", async (t) => {
  const host = await openHost(t)
  const source = "```\ncode\n```   \nAfter"
  host.ui.setEditorText(source)
  await host.key("\x1b[A")
  await host.key("\x1b[1;9C")
  await host.key("\r")
  assert.equal(host.ui.getEditorText(), "")
  await host.settled()
  assert.deepEqual(
    host.requests[0]?.messages.filter((message) => message.role === "user"),
    [{ role: "user", content: [{ type: "text", text: source }] }],
  )
})

test("fence-like text Pi treats as code stays editable and continues with Enter", async (t) => {
  const host = await openHost(t)
  const source = "```\ncode\n```\t "
  host.ui.setEditorText(source)
  await host.key("\r")
  assert.equal(host.ui.getEditorText(), "```\ncode\n```\t \n")
  assert.equal(host.requests.length, 0)
  await host.key("\x1b[122;9u")
  assert.equal(host.ui.getEditorText(), source)
})

test("wrapped inline code selections keep Unicode, tabs, delimiters, and one history across views", async (t) => {
  const host = await openHost(t, { columns: 14 })
  const source = "Keep ``a`b\t👩‍💻e\u0301界`` tail"
  host.ui.setEditorText(source)
  await host.output()
  await host.key("\x1b[1;9A")
  for (let index = 0; index < 12; index++) await host.key("\x1b[C")
  for (let index = 0; index < 3; index++) await host.key("\x1b[1;2D")
  await host.key("\x1b[109;10u")
  await host.type("新")
  assert.equal(host.ui.getEditorText(), "Keep ``a`b\t新`` tail")
  await host.key("\x1b[109;10u")
  await host.key("\x1b[122;9u")
  assert.equal(host.ui.getEditorText(), source)
  await host.key("\x1b[122;10u")
  assert.equal(host.ui.getEditorText(), "Keep ``a`b\t新`` tail")
  await host.key("\x1b[122;9u")
  await host.type("next")
  await host.key("\x1b[122;10u")
  assert.equal(host.ui.getEditorText(), "Keep ``a`b\tnext`` tail")
})

test("fenced code wrapping maps vertical selection to source cells without consuming its fences", async (t) => {
  const host = await openHost(t, { columns: 12 })
  const source = "```ts\nabcd界efghij\nklmnop\n```"
  host.ui.setEditorText(source)
  await host.output()
  await host.key("\x1b[A")
  await host.key("\x1b[1;9C")
  await host.key("\x1b[A")
  await host.key("\x1b[A")
  await host.type("X")
  assert.equal(host.ui.getEditorText(), "```ts\nabcd界Xefghij\nklmnop\n```")
  await host.output()
  await host.key("\x1b[1;2B")
  await host.type("!")
  assert.equal(host.ui.getEditorText(), "```ts\nabcd界X!\nklmnop\n```")
  await host.key("\x1b[122;9u")
  await host.key("\x1b[122;9u")
  assert.equal(host.ui.getEditorText(), source)
})

for (const [name, accept] of [
  ["Enter", "\r"],
  ["Command Enter", "\x1b[13;9u"],
]) {
  test(`native file completion accepts ${name} before code continuation or submission`, async (t) => {
    const host = await openHost(t, {
      extension: (pi) => {
        pi.on("session_start", async (_event, ctx) => {
          await writeFile(join(ctx.cwd, "manual.md"), "Reference source")
        })
      },
    })
    host.ui.setEditorText("```text\n@man\n```")
    await host.key("\x1b[97;9u")
    await host.key("\x1b[D")
    await host.key("\x1b[B")
    await host.key("\x1b[1;9C")
    await host.type("u")
    await t.waitFor(async () => assert.match(await host.output(), /manual\.md/))
    await host.key(accept!)
    assert.equal(host.ui.getEditorText(), "```text\n@manual.md \n```")
    assert.equal(host.requests.length, 0)
    await host.key("\r")
    assert.equal(host.ui.getEditorText(), "```text\n@manual.md \n\n```")
    assert.equal(host.requests.length, 0)
    await host.key("\x1b[122;9u")
    await host.key("\x1b[122;9u")
    assert.equal(host.ui.getEditorText(), "```text\n@manu\n```")
  })
}

for (const view of ["formatted", "source"]) {
  test(`an unfinished nested fence continues across empty lines in ${view} view`, async (t) => {
    const host = await openHost(t)
    if (view === "source") await host.key("\x1b[109;10u")
    host.ui.setEditorText("> - ```ts")
    await host.key("\r")
    assert.equal(host.ui.getEditorText(), "> - ```ts\n>   ")
    await host.key("\r")
    assert.equal(host.ui.getEditorText(), "> - ```ts\n>   \n>   ")
    host.ui.pasteToEditor("\tconst value = 1;")
    await host.key("\r")
    assert.equal(
      host.ui.getEditorText(),
      "> - ```ts\n>   \n>   \tconst value = 1;\n>   \t",
    )
    assert.equal(host.requests.length, 0)
  })
}

test("nested inline and fenced code render from the original quoted and listed source", async (t) => {
  const host = await openHost(t)
  host.terminal.rows = 100
  const source = [
    "# `title`",
    "> `` `quoted` ``",
    "",
    "- item `inline`",
    "  > ```ts",
    "  > \tconst value = `literal`;",
    "  > ```",
  ].join("\n")
  host.ui.setEditorText(source)
  host.terminal.output = ""
  const output = await host.output()
  assert.match(output, /title/)
  assert.match(output, /│  `quoted` /)
  assert.match(output, /- item inline/)
  assert.match(output, /│     const value = `literal`;/)
  const highlighted = getMarkdownTheme().highlightCode!(
    "const value = `literal`;",
    "ts",
  )[0]!
  assert(host.terminal.output.includes(sliceByColumn(highlighted, 0, 1)))
  assert.equal(host.ui.getEditorText(), source)
  await host.key("\x1b[A")
  await host.key("\x1b[1;9C")
  await host.key("\x1b[D")
  await host.key("\x1b[D")
  for (let index = 0; index < 7; index++) await host.key("\x1b[1;2D")
  await host.type("next")
  assert.equal(
    host.ui.getEditorText(),
    [
      "# `title`",
      "> `` `quoted` ``",
      "",
      "- item `inline`",
      "  > ```ts",
      "  > \tconst value = `next`;",
      "  > ```",
    ].join("\n"),
  )
  await host.key("\x1b[109;10u")
  await host.key("\x1b[122;9u")
  assert.equal(host.ui.getEditorText(), source)
})

test("nested code renders the original tab when it also provides container indentation", async (t) => {
  const host = await openHost(t)
  const source = "- ```ts\n\tconst value = `界`;\n  ```"
  host.ui.setEditorText(source)
  host.terminal.output = ""
  assert.match(await host.output(), /    const value = `界`;/)
  assert.equal(host.ui.getEditorText(), source)
  await host.key("\x1b[97;9u")
  await host.key("\x1b[D")
  await host.key("\x1b[B")
  await host.key("\x1b[1;9D")
  await host.key("\x1b[C")
  await host.type("X")
  assert.equal(
    host.ui.getEditorText(),
    "- ```ts\n\tXconst value = `界`;\n  ```",
  )
  await host.key("\x1b[122;9u")
  assert.equal(host.ui.getEditorText(), source)
})

test("code after a task paragraph keeps its source mapping and continuation", async (t) => {
  const host = await openHost(t)
  host.terminal.rows = 60
  const source = "- [x] item\n\n  ```ts\n  \tconst value = 1;\n  ```"
  host.ui.setEditorText(source)
  host.terminal.output = ""
  const output = await host.output()
  assert.match(output, /- \[x\] item/)
  assert.match(output, /      const value = 1;/)
  assert.equal(host.ui.getEditorText(), source)
  await host.key("\x1b[A")
  await host.key("\x1b[1;9C")
  await host.key("\r")
  assert.equal(
    host.ui.getEditorText(),
    "- [x] item\n\n  ```ts\n  \tconst value = 1;\n  \t\n  ```",
  )
  assert.equal(host.requests.length, 0)
  await host.key("\x1b[109;10u")
  await host.key("\x1b[122;9u")
  assert.equal(host.ui.getEditorText(), source)
})

for (const view of ["formatted", "source"]) {
  test(`Enter keeps a fenced block inside its existing list and quote in ${view} view`, async (t) => {
    const host = await openHost(t)
    if (view === "source") await host.key("\x1b[109;10u")
    const source = "- > ~~~ts\n  > \tconst value = 1;\n  > ~~~"
    host.ui.setEditorText(source)
    await host.key("\x1b[97;9u")
    await host.key("\x1b[D")
    await host.key("\x1b[B")
    await host.key("\x1b[1;9C")
    await host.key("\r")
    assert.equal(
      host.ui.getEditorText(),
      "- > ~~~ts\n  > \tconst value = 1;\n  > \t\n  > ~~~",
    )
    await host.key("\r")
    assert.equal(
      host.ui.getEditorText(),
      "- > ~~~ts\n  > \tconst value = 1;\n  > \t\n  > \t\n  > ~~~",
    )
    assert.equal(host.requests.length, 0)
    await host.key("\x1b[122;9u")
    await host.key("\x1b[122;9u")
    assert.equal(host.ui.getEditorText(), source)
  })
}
