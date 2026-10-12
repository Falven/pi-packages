/* eslint-disable no-await-in-loop -- Each terminal gesture precedes its observable draft edit. */
import assert from "node:assert/strict"
import { test } from "node:test"
import { openHost } from "../fixtures/host.ts"

for (const sourceView of [false, true]) {
  const view = sourceView ? "source" : "formatted"
  test(`native character jumps reach the next target across lines in ${view} view`, async (t) => {
    const host = await openHost(t)
    if (sourceView) await host.key("\x1b[109;10u")
    const original = "alpha\n**beta**\ngamma"
    host.ui.setEditorText(original)
    await host.key("\x1b[97;9u")
    await host.key("\x1b[D")
    await host.key("\x1d")
    await host.key("\x1b[98u")
    assert.equal(host.ui.getEditorText(), original)
    await host.type("X")
    assert.equal(host.ui.getEditorText(), "alpha\n**Xbeta**\ngamma")
    await host.key("\x1b[122;9u")
    assert.equal(host.ui.getEditorText(), original)
    await host.key("\x1b\x1d")
    await host.key("a")
    await host.type("Y")
    assert.equal(host.ui.getEditorText(), "alphYa\n**beta**\ngamma")
  })
}

for (const sourceView of [false, true]) {
  const view = sourceView ? "source" : "formatted"
  test(`shifted page gestures replace the selected page and restore its range on undo in ${view} view`, async (t) => {
    const host = await openHost(t)
    if (sourceView) await host.key("\x1b[109;10u")
    const original = "row0\nrow1\nrow2\nrow3\nrow4\nrow5\nrow6\nrow7\nrow8"
    host.ui.setEditorText(original)
    await host.output()
    await host.key("\x1b[97;9u")
    await host.key("\x1b[D")
    for (let i = 0; i < 3; i++) await host.key("\x1b[C")
    await host.key("\x1b[6;2~")
    assert.equal(host.ui.getEditorText(), original)
    await host.type("X")
    assert.equal(host.ui.getEditorText(), "rowX7\nrow8")
    await host.key("\x1b[122;9u")
    assert.equal(host.ui.getEditorText(), original)
    await host.type("Y")
    assert.equal(host.ui.getEditorText(), "rowY7\nrow8")
    await host.key("\x1b[122;9u")
    await host.key("\x1b[5;2~")
    await host.type("Z")
    assert.equal(host.ui.getEditorText(), original.replace("row0", "rowZ0"))
  })

  test(`delivered native page actions move one visible editor page in ${view} view`, async (t) => {
    const host = await openHost(t)
    if (sourceView) await host.key("\x1b[109;10u")
    const original = "row0\nrow1\nrow2\nrow3\nrow4\nrow5\nrow6\nrow7\nrow8"
    host.ui.setEditorText(original)
    await host.output()
    await host.key("\x1b[97;9u")
    await host.key("\x1b[D")
    for (let i = 0; i < 3; i++) await host.key("\x1b[C")
    await host.key("\x1b[6;5~")
    await host.type("X")
    assert.equal(host.ui.getEditorText(), original.replace("row7", "rowX7"))
    await host.key("\x1b[122;9u")
    await host.key("\x1b[5;5~")
    await host.type("Y")
    assert.equal(host.ui.getEditorText(), original.replace("row0", "rowY0"))
  })
}

test("character jumps skip the current target, consume misses, and cancel before control input", async (t) => {
  const host = await openHost(t)
  for (const [inputs, expected] of [
    [["\x1d", "a"], "abcXa"],
    [["\x1d", "z"], "Xabca"],
    [["\x1d", "\x1d"], "Xabca"],
    [["\x1d", "\x1b\x1d"], "Xabca"],
    [["\x1d", "\x1b[C"], "aXbca"],
    [["\x1d", "\x05"], "abcaX"],
  ] as const) {
    host.ui.setEditorText("abca")
    await host.key("\x01")
    for (const input of inputs) await host.key(input)
    await host.type("X")
    assert.equal(host.ui.getEditorText(), expected)
  }
})

for (const sourceView of [false, true]) {
  const view = sourceView ? "source" : "formatted"
  test(`character jumps keep whole Unicode graphemes and visible targets in ${view} view`, async (t) => {
    const host = await openHost(t)
    if (sourceView) await host.key("\x1b[109;10u")
    for (const [target, expected] of [
      ["\u0301", "**é** 👩‍💻 Xe\u0301"],
      ["💻", "**é** X👩‍💻 e\u0301"],
    ]) {
      host.ui.setEditorText("**é** 👩‍💻 e\u0301")
      await host.key("\x1b\x1d")
      await host.key(target!)
      await host.type("X")
      assert.equal(host.ui.getEditorText(), expected)
    }
    host.ui.setEditorText("**a** z")
    await host.key("\x01")
    await host.key("\x1d")
    await host.key("*")
    await host.type("X")
    assert.equal(host.ui.getEditorText(), sourceView ? "*X*a** z" : "**Xa** z")
  })
}

test("configured character jumps own their bindings and leave old bindings inactive", async (t) => {
  const host = await openHost(t, {
    keybindings: {
      "tui.editor.jumpForward": "super+a",
      "tui.editor.jumpBackward": "super+shift+z",
    },
  })
  host.ui.setEditorText("abca")
  await host.key("\x01")
  await host.key("\x1b[97;9u")
  await host.key("a")
  await host.type("X")
  assert.equal(host.ui.getEditorText(), "abcXa")
  await host.key("\x1b[122;10u")
  await host.key("a")
  await host.type("Y")
  assert.equal(host.ui.getEditorText(), "YabcXa")
  await host.key("\x1d")
  await host.type("Z")
  assert.equal(host.ui.getEditorText(), "YZabcXa")
})

test("replacing a draft cancels its pending character jump", async (t) => {
  const host = await openHost(t)
  host.ui.setEditorText("alpha")
  await host.key("\x1b\x1d")
  host.ui.setEditorText("beta")
  await host.type("a")
  assert.equal(host.ui.getEditorText(), "betaa")
})

for (const sourceView of [false, true]) {
  const view = sourceView ? "source" : "formatted"
  test(`configured page actions retain the preferred cell through short and Unicode rows in ${view} view`, async (t) => {
    const host = await openHost(t, {
      keybindings: {
        "tui.editor.pageUp": "ctrl+alt+p",
        "tui.editor.pageDown": "ctrl+alt+n",
      },
    })
    if (sourceView) await host.key("\x1b[109;10u")
    host.terminal.resize(60, 10)
    const original = "0123456789\none\ntwo\nx\nfour\nfive\n👩‍💻\t界e\u0301z"
    host.ui.setEditorText(original)
    await host.output()
    await host.key("\x1b[97;9u")
    await host.key("\x1b[D")
    for (let i = 0; i < 9; i++) await host.key("\x1b[C")
    await host.key("\x1b[110;7u")
    await host.key("\x1b[110;7u")
    await host.type("X")
    assert.equal(host.ui.getEditorText(), original.replace("z", "Xz"))
    await host.key("\x1b[122;9u")
    await host.key("\x1b[112;7u")
    await host.key("\x1b[112;7u")
    await host.type("Y")
    assert.equal(host.ui.getEditorText(), original.replace("9", "Y9"))
  })

  test(`page movement follows wrapped rows and clamps at draft boundaries in ${view} view`, async (t) => {
    const host = await openHost(t, { columns: 12 })
    if (sourceView) await host.key("\x1b[109;10u")
    host.terminal.resize(12, 10)
    const original = "abcdefghijklmno👩‍💻pqrstuv\n0123456789ABCDEFGHIJKLMN"
    host.ui.setEditorText(original)
    await host.output()
    await host.key("\x1b[97;9u")
    await host.key("\x1b[D")
    for (let i = 0; i < 9; i++) await host.key("\x1b[C")
    await host.key("\x1b[6;5~")
    await host.type("X")
    assert.equal(host.ui.getEditorText(), original.replace("9", "X9"))
    await host.key("\x1b[122;9u")
    await host.key("\x1b[6;5~")
    await host.key("\x1b[6;5~")
    await host.type("Y")
    assert.equal(host.ui.getEditorText(), `${original}Y`)
    await host.key("\x1b[122;9u")
    await host.key("\x1b[5;5~")
    await host.key("\x1b[5;5~")
    await host.key("\x1b[5;5~")
    await host.type("Z")
    assert.equal(host.ui.getEditorText(), original.replace("c", "Zc"))
  })
}

for (const sourceView of [false, true]) {
  const view = sourceView ? "source" : "formatted"
  test(`paging maps hidden Markdown and wide graphemes in ${view} view`, async (t) => {
    const host = await openHost(t)
    if (sourceView) await host.key("\x1b[109;10u")
    host.terminal.resize(60, 10)
    const original = "0123456789\none\ntwo\n**👩‍💻\t界e\u0301z**"
    host.ui.setEditorText(original)
    await host.output()
    await host.key("\x1b[97;9u")
    await host.key("\x1b[D")
    for (let i = 0; i < 9; i++) await host.key("\x1b[C")
    await host.key("\x1b[6;5~")
    await host.type("X")
    assert.equal(
      host.ui.getEditorText(),
      sourceView ? original.replace("界", "X界") : original.replace("z", "Xz"),
    )
  })
}

test("fullscreen viewport keys retain ownership before the composer", async (t) => {
  const host = await openHost(t)
  const original = "row0\nrow1\nrow2\nrow3\nrow4\nrow5\nrow6\nrow7\nrow8"
  for (const input of ["\x1b[5~", "\x1b[6~", "\x1b[H", "\x1b[F"]) {
    host.ui.setEditorText(original)
    await host.output()
    await host.key("\x01")
    await host.key("\x1b[C")
    await host.key("\x1b[C")
    await host.key("\x1b[A")
    await host.key("\x1b[A")
    await host.key(input)
    await host.type("X")
    assert.equal(host.ui.getEditorText(), original.replace("row6", "roXw6"))
  }
})

for (const sourceView of [false, true]) {
  const view = sourceView ? "source" : "formatted"
  test(`page selection retains preferred columns through Unicode and short rows in ${view} view`, async (t) => {
    const host = await openHost(t)
    if (sourceView) await host.key("\x1b[109;10u")
    host.terminal.resize(60, 10)
    const original = "0123456789\none\ntwo\nx\nfour\nfive\n👩‍💻\t界e\u0301z"
    host.ui.setEditorText(original)
    await host.output()
    await host.key("\x1b[97;9u")
    await host.key("\x1b[D")
    for (let i = 0; i < 9; i++) await host.key("\x1b[C")
    await host.key("\x1b[6;2~")
    await host.key("\x1b[6;2~")
    await host.type("X")
    assert.equal(host.ui.getEditorText(), "012345678Xz")
    await host.key("\x1b[122;9u")
    await host.key("\x1b[5;2~")
    await host.type("Y")
    assert.equal(
      host.ui.getEditorText(),
      "012345678Y\nfour\nfive\n👩‍💻\t界e\u0301z",
    )
    await host.key("\x1b[122;9u")
    await host.key("\x1b[5;2~")
    await host.type("Z")
    assert.equal(
      host.ui.getEditorText(),
      "0Z9\none\ntwo\nx\nfour\nfive\n👩‍💻\t界e\u0301z",
    )
  })

  test(`page selection maps wrapped rows and clamps without selecting partial graphemes in ${view} view`, async (t) => {
    const host = await openHost(t, { columns: 12 })
    if (sourceView) await host.key("\x1b[109;10u")
    host.terminal.resize(12, 10)
    const original = "abcdefghijklmno👩‍💻pqrstuv\n0123456789ABCDEFGHIJKLMN"
    host.ui.setEditorText(original)
    await host.output()
    await host.key("\x1b[97;9u")
    await host.key("\x1b[D")
    for (let i = 0; i < 9; i++) await host.key("\x1b[C")
    await host.key("\x1b[6;2~")
    await host.type("X")
    assert.equal(host.ui.getEditorText(), "abcdefghiX9ABCDEFGHIJKLMN")
    await host.key("\x1b[122;9u")
    await host.key("\x1b[6;2~")
    await host.key("\x1b[6;2~")
    await host.type("Y")
    assert.equal(host.ui.getEditorText(), "abcdefghiY")
    await host.key("\x1b[122;9u")
    await host.key("\x1b[5;2~")
    await host.key("\x1b[5;2~")
    await host.key("\x1b[5;2~")
    await host.type("Z")
    assert.equal(
      host.ui.getEditorText(),
      "abZjklmno👩‍💻pqrstuv\n0123456789ABCDEFGHIJKLMN",
    )
  })

  test(`page selection accounts for hidden Markdown cells in ${view} view`, async (t) => {
    const host = await openHost(t)
    if (sourceView) await host.key("\x1b[109;10u")
    host.terminal.resize(60, 10)
    const original = "0123456789\none\ntwo\n**👩‍💻\t界e\u0301z**"
    host.ui.setEditorText(original)
    await host.output()
    await host.key("\x1b[97;9u")
    await host.key("\x1b[D")
    for (let i = 0; i < 9; i++) await host.key("\x1b[C")
    await host.key("\x1b[6;2~")
    await host.type("X")
    assert.equal(
      host.ui.getEditorText(),
      sourceView ? "012345678X界e\u0301z**" : "012345678X**z**",
    )
  })
}

test("jump misses and page boundaries leave an empty draft unchanged in either view", async (t) => {
  const host = await openHost(t)
  for (const sourceView of [false, true]) {
    host.ui.setEditorText("")
    if (sourceView) await host.key("\x1b[109;10u")
    await host.key("\x1d")
    await host.key("x")
    await host.key("\x1b\x1d")
    await host.key("y")
    await host.key("\x1b[5;5~")
    await host.key("\x1b[6;5~")
    assert.equal(host.ui.getEditorText(), "")
    await host.type("Z")
    assert.equal(host.ui.getEditorText(), "Z")
  }
})

for (const [name, keybindings, input, selected] of [
  ["remapped", { "tui.editor.pageDown": "ctrl+alt+n" }, "\x1b[110;8u", true],
  ["old remapped", { "tui.editor.pageDown": "ctrl+alt+n" }, "\x1b[6;2~", false],
  ["cleared", { "tui.editor.pageDown": [] }, "\x1b[6;2~", false],
] as const) {
  test(`${name} page binding controls its derived selection gesture`, async (t) => {
    const host = await openHost(t, { keybindings })
    const original = "row0\nrow1\nrow2\nrow3\nrow4\nrow5\nrow6\nrow7\nrow8"
    host.ui.setEditorText(original)
    await host.output()
    await host.key("\x1b[97;9u")
    await host.key("\x1b[D")
    for (let i = 0; i < 3; i++) await host.key("\x1b[C")
    await host.key(input)
    await host.type("X")
    assert.equal(
      host.ui.getEditorText(),
      selected ? "rowX7\nrow8" : original.replace("row0", "rowX0"),
    )
  })
}

test("explicit native shifted bindings execute ordinary actions before derived page selection", async (t) => {
  const host = await openHost(t, {
    keybindings: {
      "tui.editor.pageDown": "shift+pageDown",
      "tui.editor.pageUp": "ctrl+alt+p",
      "tui.editor.cursorLineEnd": "ctrl+alt+shift+p",
    },
  })
  const original = "row0\nrow1\nrow2\nrow3\nrow4\nrow5\nrow6\nrow7\nrow8"
  host.ui.setEditorText(original)
  await host.output()
  await host.key("\x1b[97;9u")
  await host.key("\x1b[D")
  for (let i = 0; i < 3; i++) await host.key("\x1b[C")
  await host.key("\x1b[6;2~")
  await host.type("X")
  assert.equal(host.ui.getEditorText(), original.replace("row7", "rowX7"))
  await host.key("\x1b[122;9u")
  await host.key("\x1b[112;8u")
  await host.type("Y")
  assert.equal(host.ui.getEditorText(), original.replace("row7", "row7Y"))
})

test("an accepted extension shortcut retains its shifted page gesture", async (t) => {
  let invoked = 0
  const host = await openHost(t, {
    extension: (pi) => {
      pi.registerShortcut("shift+pageDown", {
        handler: () => {
          invoked++
        },
      })
    },
  })
  const original = "row0\nrow1\nrow2\nrow3\nrow4\nrow5\nrow6\nrow7\nrow8"
  host.ui.setEditorText(original)
  await host.output()
  await host.key("\x1b[97;9u")
  await host.key("\x1b[D")
  await host.key("\x1b[6;2~")
  await host.type("X")
  assert.equal(host.ui.getEditorText(), `X${original}`)
  assert.equal(invoked, 1)
})

test("page selection survives redraw and view switches and uses the resized editor height", async (t) => {
  const host = await openHost(t)
  const original =
    "row0\nrow1\nrow2\nrow3\nrow4\nrow5\nrow6\nrow7\nrow8\nrow9\nrow10\nrow11\nrow12\nrow13\nrow14\nrow15"
  host.ui.setEditorText(original)
  await host.output()
  await host.key("\x1b[97;9u")
  await host.key("\x1b[D")
  for (let i = 0; i < 3; i++) await host.key("\x1b[C")
  await host.key("\x1b[6;2~")
  host.terminal.resize(32, 10)
  assert.equal(host.ui.setTheme("light").success, true)
  await host.output()
  await host.key("\x1b[109;10u")
  await host.key("\x1b[6;2~")
  await host.type("X")
  assert.equal(
    host.ui.getEditorText(),
    "rowX10\nrow11\nrow12\nrow13\nrow14\nrow15",
  )
  await host.key("\x1b[122;9u")
  await host.key("\x1b[5;2~")
  await host.key("\x1b[109;10u")
  await host.type("Y")
  assert.equal(
    host.ui.getEditorText(),
    "rowY7\nrow8\nrow9\nrow10\nrow11\nrow12\nrow13\nrow14\nrow15",
  )
  assert.equal(host.requests.length, 0)
})
