import assert from "node:assert/strict"
import { test } from "node:test"
import { openHost } from "../fixtures/host.ts"

test("Pi loads the composer and submits the edited multiline source draft", async (t) => {
  const host = await openHost(t)
  assert.equal(typeof host.ui.getEditorComponent(), "function")
  await host.type("First paragraph.")
  await host.key("\x1b[13;2u")
  await host.type("**Second** paragraph.")
  assert.equal(
    host.ui.getEditorText(),
    "First paragraph.\n**Second** paragraph.",
  )
  assert.match(await host.output(), /\*\*Second\*\* paragraph\./)
  await host.key("\r")
  await host.settled()
  assert.equal(host.requests.length, 1)
  assert.equal(host.ui.getEditorText(), "")
  assert.deepEqual(
    host.requests[0]?.messages.filter((message) => message.role === "user"),
    [
      {
        role: "user",
        content: [
          { type: "text", text: "First paragraph.\n**Second** paragraph." },
        ],
      },
    ],
  )
})

test("keyboard selection replaces the selected source and preserves surrounding text", async (t) => {
  const host = await openHost(t)
  host.ui.setEditorText("Keep this draft")
  await host.key("\x1b[1;2D")
  await host.key("\x1b[1;2D")
  await host.key("\x1b[1;2D")
  await host.key("\x1b[1;2D")
  await host.key("\x1b[1;2D")
  await host.type("source")
  assert.equal(host.ui.getEditorText(), "Keep this source")
  await host.key("\x1b[97;9u")
  await host.type("Replacement")
  assert.equal(host.ui.getEditorText(), "Replacement")
})

test("character movement and deletion keep combining text, emoji, and wide characters whole", async (t) => {
  const host = await openHost(t)
  host.ui.setEditorText("Ae\u0301👩‍💻界B")
  await host.key("\x1b[D")
  await host.key("\x7f")
  assert.equal(host.ui.getEditorText(), "Ae\u0301👩‍💻B")
  await host.key("\x7f")
  assert.equal(host.ui.getEditorText(), "Ae\u0301B")
  await host.key("\x1b[1;2D")
  await host.key("\x1b[3~")
  assert.equal(host.ui.getEditorText(), "AB")
  await host.key("\x1b[3~")
  assert.equal(host.ui.getEditorText(), "A")
})

test("word, line, and document movement can extend a source selection", async (t) => {
  const host = await openHost(t)
  host.ui.setEditorText("Alpha beta\nGamma delta")
  await host.key("\x1b[1;9A")
  await host.key("\x1b[1;3C")
  await host.key("\x1b[1;4C")
  await host.type(" X")
  assert.equal(host.ui.getEditorText(), "Alpha X\nGamma delta")
  await host.key("\x1b[1;9B")
  await host.key("\x1b[1;9D")
  await host.type("> ")
  await host.key("\x1b[1;10C")
  await host.type("Done.")
  assert.equal(host.ui.getEditorText(), "Alpha X\n> Done.")
  await host.key("\x1b[1;10A")
  await host.type("Fresh")
  assert.equal(host.ui.getEditorText(), "Fresh")
})

test("vertical movement keeps the terminal column across wrapped wide text and short lines", async (t) => {
  const host = await openHost(t, { columns: 12 })
  host.ui.setEditorText("abcd界efghij\nklmnop")
  await host.key("\x1b[A")
  await host.key("\x1b[A")
  await host.type("X")
  assert.equal(host.ui.getEditorText(), "abcd界Xefghij\nklmnop")
  await host.key("\x1b[1;2B")
  await host.type("!")
  assert.equal(host.ui.getEditorText(), "abcd界X!\nklmnop")
})

test("undo and redo group typing and selection replacement, and a fresh edit abandons redo", async (t) => {
  const host = await openHost(t)
  host.ui.setEditorText("Draft: ")
  await host.type("one coherent edit")
  await host.key("\x1b[122;9u")
  assert.equal(host.ui.getEditorText(), "Draft: ")
  await host.key("\x1b[122;10u")
  assert.equal(host.ui.getEditorText(), "Draft: one coherent edit")
  await host.key("\x1b[97;9u")
  await host.type("Replacement")
  await host.key("\x1b[122;9u")
  assert.equal(host.ui.getEditorText(), "Draft: one coherent edit")
  await host.type("New branch")
  await host.key("\x1b[122;10u")
  assert.equal(host.ui.getEditorText(), "New branch")
})

test("Command Enter submits a multiline source draft through Pi", async (t) => {
  const host = await openHost(t)
  host.ui.setEditorText("Explicit\nsubmission")
  await host.key("\x1b[13;9u")
  await host.settled()
  assert.equal(host.requests.length, 1)
  assert.equal(host.ui.getEditorText(), "")
  assert.deepEqual(
    host.requests[0]?.messages.filter((message) => message.role === "user"),
    [
      {
        role: "user",
        content: [{ type: "text", text: "Explicit\nsubmission" }],
      },
    ],
  )
})

test("native text replacements and long typing stay in the same inline draft and history", async (t) => {
  const host = await openHost(t)
  host.ui.setEditorText("Before")
  const longSource = "x".repeat(5100) + "\n**Inline tail**"
  host.ui.setEditorText(longSource)
  assert.equal(host.ui.getEditorText(), longSource)
  assert.match(await host.output(), /\*\*Inline tail\*\*/)
  await host.key("\x1b[122;9u")
  assert.equal(host.ui.getEditorText(), "Before")
  await host.key("\x1b[122;10u")
  assert.equal(host.ui.getEditorText(), longSource)
  await host.key("\x1b[97;9u")
  await host.type(longSource.replace("\n", " "))
  assert.equal(host.ui.getEditorText(), longSource.replace("\n", " "))
})

test("native pasteToEditor replaces selected source as one undoable edit", async (t) => {
  const host = await openHost(t)
  host.ui.setEditorText("Keep old")
  await host.key("\x1b[1;4D")
  host.ui.pasteToEditor("new\nsource")
  assert.equal(host.ui.getEditorText(), "Keep new\nsource")
  await host.key("\x1b[122;9u")
  assert.equal(host.ui.getEditorText(), "Keep old")
  await host.key("\x1b[122;10u")
  assert.equal(host.ui.getEditorText(), "Keep new\nsource")
})

test("the focused source draft renders a visible caret", async (t) => {
  const host = await openHost(t)
  host.terminal.output = ""
  host.ui.setEditorText("Caret")
  await host.output()
  assert(host.terminal.output.includes("\x1b[7m \x1b[27m"))
})

test("native application and extension shortcuts take priority over composer keys", async (t) => {
  const host = await openHost(t, {
    keybindings: { "app.clear": "super+enter" },
    extension: (pi) => {
      pi.registerShortcut("super+a", {
        handler: (ctx) => ctx.ui.setEditorText("Extension shortcut"),
      })
    },
  })
  host.ui.setEditorText("Original")
  await host.key("\x1b[97;9u")
  await host.type(" wins")
  assert.equal(host.ui.getEditorText(), "Extension shortcut wins")
  await host.key("\x1b[13;9u")
  assert.equal(host.ui.getEditorText(), "")
  assert.equal(host.requests.length, 0)
})

test("native follow-up submission queues and delivers the edited source during streaming", async (t) => {
  const host = await openHost(t, { holdResponses: true })
  host.ui.setEditorText("First request")
  await host.key("\r")
  await t.waitFor(() => assert.equal(host.requests.length, 1))
  host.ui.setEditorText("Follow-up\nsource")
  await host.key("\x1b\r")
  await t.waitFor(() =>
    assert.deepEqual(host.session.getFollowUpMessages(), ["Follow-up\nsource"]),
  )
  assert.equal(host.ui.getEditorText(), "")
  host.reply()
  await t.waitFor(() => assert.equal(host.requests.length, 2))
  host.reply()
  await host.settled()
  assert.deepEqual(
    host.requests[1]?.messages.filter((message) => message.role === "user"),
    [
      { role: "user", content: [{ type: "text", text: "First request" }] },
      { role: "user", content: [{ type: "text", text: "Follow-up\nsource" }] },
    ],
  )
})

test("undo recovers source after Pi clears a submission that fails", async (t) => {
  const host = await openHost(t, { responseStatus: 400 })
  host.ui.setEditorText("Recover this\n**source**")
  await host.key("\r")
  await host.settled()
  assert.equal(host.ui.getEditorText(), "")
  assert.match(await host.output(), /Controlled model failure/)
  await host.key("\x1b[122;9u")
  assert.equal(host.ui.getEditorText(), "Recover this\n**source**")
})

test("unshifted arrows collapse a selection to its corresponding edge", async (t) => {
  const host = await openHost(t)
  host.ui.setEditorText("A👩‍💻BC")
  await host.key("\x1b[97;9u")
  await host.key("\x1b[D")
  await host.type("X")
  assert.equal(host.ui.getEditorText(), "XA👩‍💻BC")
  await host.key("\x1b[97;9u")
  await host.key("\x1b[C")
  await host.type("Y")
  assert.equal(host.ui.getEditorText(), "XA👩‍💻BCY")
})

test("joining lines keeps the caret outside the newly combined grapheme", async (t) => {
  const host = await openHost(t)
  host.ui.setEditorText("a\n\u0301b")
  await host.key("\x1b[1;9A")
  await host.key("\x1b[C")
  await host.key("\x1b[3~")
  assert.equal(host.ui.getEditorText(), "a\u0301b")
  await host.key("\x7f")
  assert.equal(host.ui.getEditorText(), "b")
})

test("vertical movement measures displayed tabs without rewriting source", async (t) => {
  const host = await openHost(t)
  host.ui.setEditorText("01234567\nab\tc")
  await host.key("\x1b[A")
  await host.type("X")
  assert.equal(host.ui.getEditorText(), "0123456X7\nab\tc")
})

test("explicit native prompt-history bindings retain priority and the unfinished draft", async (t) => {
  const host = await openHost(t, {
    keybindings: {
      "tui.editor.historyPrevious": "super+a",
      "tui.editor.historyNext": "super+n",
      "app.clear": "super+a",
    },
  })
  host.ui.setEditorText("Submitted source")
  await host.key("\r")
  await host.settled()
  host.ui.setEditorText("Unfinished source")
  await host.key("\x1b[97;9u")
  assert.equal(host.ui.getEditorText(), "Submitted source")
  await host.key("\x1b[110;9u")
  assert.equal(host.ui.getEditorText(), "Unfinished source")
  await host.key("\x1b[1;9A")
  await host.key("\x1b[A")
  assert.equal(host.ui.getEditorText(), "Submitted source")
  await host.key("\x1b[B")
  assert.equal(host.ui.getEditorText(), "Unfinished source")
})

test("native commands and input transformations remain active with idle follow-up submission", async (t) => {
  const host = await openHost(t, {
    extension: (pi) => {
      pi.registerCommand("source-test", {
        description: "Prepare a source draft",
        handler: async (_args, ctx) =>
          ctx.ui.setEditorText("Draft from command"),
      })
      pi.on("input", (event) => ({
        action: "transform",
        text: `Transformed: ${event.text}`,
      }))
    },
  })
  host.ui.setEditorText("/source-test")
  await host.key("\r")
  await t.waitFor(() =>
    assert.equal(host.ui.getEditorText(), "Draft from command"),
  )
  assert.equal(host.requests.length, 0)
  await host.key("\x1b\r")
  await host.settled()
  assert.deepEqual(
    host.requests[0]?.messages.filter((message) => message.role === "user"),
    [
      {
        role: "user",
        content: [{ type: "text", text: "Transformed: Draft from command" }],
      },
    ],
  )
})
