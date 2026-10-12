/* eslint-disable no-await-in-loop -- Keep each terminal gesture and its resulting edit in order. */
import assert from "node:assert/strict"
import { writeFile } from "node:fs/promises"
import { join } from "node:path"
import { test } from "node:test"
import { getNativeClipboard, type KeyId } from "@earendil-works/pi-tui"
import { openHost } from "../fixtures/host.ts"

test("native undo on a picker confirmation key restores the draft before completion", async (t) => {
  const host = await openHost(t, {
    keybindings: { "tui.editor.undo": "enter" },
    extension: (pi) => {
      pi.on("session_start", async (_event, ctx) => {
        await writeFile(join(ctx.cwd, "manual.md"), "Manual")
      })
    },
  })
  host.ui.setEditorText("Read ")
  await host.type("@man")
  await t.waitFor(async () => assert.match(await host.output(), /manual\.md/))
  await host.key("\r")
  assert.equal(host.ui.getEditorText(), "Read ")
  assert.equal(host.requests.length, 0)
})

test("native character deletion owns composer shortcuts and full shifted chords", async (t) => {
  const bindings: [KeyId, string][] = [
    ["super+a", "\x1b[97;9u"],
    ["super+x", "\x1b[120;9u"],
    ["super+c", "\x1b[99;9u"],
    ["super+z", "\x1b[122;9u"],
    ["super+shift+z", "\x1b[122;10u"],
    ["super+shift+m", "\x1b[109;10u"],
    ["super+enter", "\x1b[13;9u"],
    ["super+left", "\x1b[1;9D"],
    ["super+shift+up", "\x1b[1;10A"],
    ["shift+left", "\x1b[1;2D"],
  ]
  const host = await openHost(t, {
    keybindings: {
      "tui.editor.deleteCharBackward": bindings.map(([key]) => key),
    },
  })
  for (const [key, input] of bindings) {
    host.ui.setEditorText("abc")
    await host.key(input)
    assert.equal(host.ui.getEditorText(), "ab", key)
    await host.type("!")
    assert.equal(host.ui.getEditorText(), "ab!", key)
  }
  assert.equal(host.requests.length, 0)
})

for (const [description, binding, input] of [
  ["cleared", [], undefined],
  ["repeated default", "ctrl+-", "\x1b[45;5u"],
  ["remapped", "ctrl+shift+u", "\x1b[117;6u"],
] satisfies [string, KeyId | KeyId[], string | undefined][]) {
  test(`an explicit ${description} undo binding suppresses Command Z and preserves fixed actions`, async (t) => {
    const host = await openHost(t, {
      keybindings: { "tui.editor.undo": binding },
    })
    host.ui.setEditorText("Original")
    await host.type(" changed")
    await host.key("\x1b[122;9u")
    assert.equal(host.ui.getEditorText(), "Original changed")
    if (input) {
      await host.key(input)
      assert.equal(host.ui.getEditorText(), "Original")
      await host.key("\x1b[122;10u")
      assert.equal(host.ui.getEditorText(), "Original changed")
    }
    await host.key("\x1b[97;9u")
    await host.type("Replacement")
    assert.equal(host.ui.getEditorText(), "Replacement")
  })
}

test("explicit line bindings suppress Command aliases and their shifted variants", async (t) => {
  const host = await openHost(t, {
    keybindings: {
      "tui.editor.cursorLineStart": "ctrl+a",
      "tui.editor.cursorLineEnd": [],
    },
  })
  for (const input of [
    "\x1b[1;9A",
    "\x1b[1;10A",
    "\x1b[1;9D",
    "\x1b[1;10D",
    "\x1b[1;9B",
    "\x1b[1;10B",
    "\x1b[1;9C",
    "\x1b[1;10C",
  ]) {
    host.ui.setEditorText("abc")
    await host.key("\x1b[D")
    await host.key(input)
    await host.type("X")
    assert.equal(host.ui.getEditorText(), "abXc")
  }
  await host.key("\x01")
  await host.type("Start ")
  assert.equal(host.ui.getEditorText(), "Start abXc")
})

test("configured copy exports the selection, suppresses its alias, and preserves native clear", async (t) => {
  const clipboard = getNativeClipboard()
  assert(clipboard?.setText)
  let copied = "Previous clipboard"
  t.mock.method(
    clipboard as { setText: NonNullable<typeof clipboard.setText> },
    "setText",
    async (text: string) => {
      copied = text
    },
  )
  const host = await openHost(t, {
    keybindings: { "tui.input.copy": "ctrl+shift+c" },
  })
  host.ui.setEditorText("**Selected** source")
  await host.key("\x1b[97;9u")
  await host.key("\x1b[99;9u")
  assert.equal(copied, "Previous clipboard")
  await host.key("\x1b[99;6u")
  await t.waitFor(() => assert.equal(copied, "**Selected** source"))
  await host.type("Replacement")
  assert.equal(host.ui.getEditorText(), "Replacement")
  await host.key("\x03")
  assert.equal(host.ui.getEditorText(), "")
  assert.equal(copied, "**Selected** source")
})

test("an explicit submit binding suppresses Command Enter in the draft and its picker", async (t) => {
  const host = await openHost(t, {
    keybindings: { "tui.input.submit": "ctrl+shift+enter" },
    extension: (pi) => {
      pi.on("session_start", async (_event, ctx) => {
        await writeFile(join(ctx.cwd, "manual.md"), "Manual")
      })
    },
  })
  await host.type("Read @man")
  await t.waitFor(async () => assert.match(await host.output(), /manual\.md/))
  await host.key("\x1b[13;9u")
  assert.equal(host.ui.getEditorText(), "Read @man")
  assert.equal(host.requests.length, 0)
  await host.key("\x1b[13;6u")
  assert.equal(host.ui.getEditorText(), "Read @manual.md ")
  assert.equal(host.requests.length, 0)
  await host.key("\x1b[13;9u")
  assert.equal(host.ui.getEditorText(), "Read @manual.md ")
  await host.key("\x1b[13;6u")
  await host.settled()
  assert.equal(host.requests.length, 1)
  assert.deepEqual(
    host.requests[0]?.messages.filter((message) => message.role === "user"),
    [{ role: "user", content: [{ type: "text", text: "Read @manual.md" }] }],
  )
})

test("native undo on a picker navigation key restores the draft before a skill choice", async (t) => {
  const host = await openHost(t, {
    keybindings: { "tui.editor.undo": "up" },
  })
  host.ui.addAutocompleteProvider((base) => ({
    triggerCharacters: ["$"],
    async getSuggestions() {
      return {
        prefix: "$re",
        items: [
          { value: "/skill:review", label: "Review skill" },
          { value: "/skill:research", label: "Research skill" },
        ],
      }
    },
    applyCompletion: (...args) => base.applyCompletion(...args),
  }))
  host.ui.setEditorText("Use ")
  await host.type("$re")
  await t.waitFor(async () => assert.match(await host.output(), /Review skill/))
  await host.key("\x1b[A")
  assert.equal(host.ui.getEditorText(), "Use ")
  assert.equal(host.requests.length, 0)
})

test("inactive picker bindings leave fixed composer actions available", async (t) => {
  const host = await openHost(t, {
    keybindings: { "tui.select.up": "super+a" },
  })
  host.ui.setEditorText("Original")
  await host.key("\x1b[97;9u")
  await host.type("Replacement")
  assert.equal(host.ui.getEditorText(), "Replacement")
  assert.equal(host.requests.length, 0)
})
