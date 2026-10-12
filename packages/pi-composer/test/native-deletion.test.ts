/* eslint-disable no-await-in-loop -- Preserve terminal input order. */
import assert from "node:assert/strict"
import { test } from "node:test"
import { openHost } from "../fixtures/host.ts"

for (const view of ["formatted", "source"]) {
  test(`native backward word deletion edits the ${view} draft and shares undo`, async (t) => {
    const host = await openHost(t)
    if (view === "source") await host.key("\x1b[109;10u")
    host.ui.setEditorText("one two three")
    await host.key("\x17")
    assert.equal(host.ui.getEditorText(), "one two ")
    await host.key("\x1b\x7f")
    assert.equal(host.ui.getEditorText(), "one ")
    await host.key("\x1b[122;9u")
    assert.equal(host.ui.getEditorText(), "one two ")
    await host.key("\x1b[122;10u")
    assert.equal(host.ui.getEditorText(), "one ")
  })

  test(`native forward word deletion edits the ${view} draft at the caret`, async (t) => {
    const host = await openHost(t)
    if (view === "source") await host.key("\x1b[109;10u")
    host.ui.setEditorText("one two three")
    await host.key("\x01")
    await host.key("\x1bd")
    assert.equal(host.ui.getEditorText(), " two three")
    await host.key("\x1b[3;3~")
    assert.equal(host.ui.getEditorText(), " three")
    await host.key("\x1b[122;9u")
    assert.equal(host.ui.getEditorText(), " two three")
    await host.type("X")
    assert.equal(host.ui.getEditorText(), "X two three")
  })

  test(`native line deletion targets a logical ${view} line and joins only its newline`, async (t) => {
    const host = await openHost(t, { columns: 14 })
    if (view === "source") await host.key("\x1b[109;10u")
    const source = "previous\nstart middle end\nnext"
    host.ui.setEditorText(source)
    await host.key("\x01")
    await host.key("\x15")
    assert.equal(host.ui.getEditorText(), "previous\nstart middle endnext")
    await host.key("\x15")
    assert.equal(host.ui.getEditorText(), "previous\nnext")
    await host.key("\x1b[122;9u")
    assert.equal(host.ui.getEditorText(), "previous\nstart middle endnext")
    await host.key("\x01")
    await host.key("\x0b")
    assert.equal(host.ui.getEditorText(), "previous\n")
    await host.key("\x01")
    await host.key("\x1b[D")
    await host.key("\x0b")
    assert.equal(host.ui.getEditorText(), "previous")
    await host.key("\x0b")
    assert.equal(host.ui.getEditorText(), "previous")
    await host.key("\x1b[122;9u")
    assert.equal(host.ui.getEditorText(), "previous\n")
  })

  test(`word deletion stops at a ${view} logical boundary before joining lines`, async (t) => {
    const host = await openHost(t)
    if (view === "source") await host.key("\x1b[109;10u")
    host.ui.setEditorText("first\n\tlast\nnext")
    await host.key("\x01")
    await host.key("\x17")
    assert.equal(host.ui.getEditorText(), "first\n\tlastnext")
    await host.key("\x17")
    assert.equal(host.ui.getEditorText(), "first\n\tnext")
    await host.key("\x17")
    assert.equal(host.ui.getEditorText(), "first\nnext")
    await host.key("\x1b[D")
    await host.key("\x1bd")
    assert.equal(host.ui.getEditorText(), "firstnext")
    await host.key("\x1b[122;9u")
    assert.equal(host.ui.getEditorText(), "first\nnext")
    await host.type("X")
    assert.equal(host.ui.getEditorText(), "firstX\nnext")
  })

  test(`word deletion keeps native punctuation and Unicode boundaries in ${view} view`, async (t) => {
    const host = await openHost(t)
    if (view === "source") await host.key("\x1b[109;10u")
    for (const [before, after] of [
      ["keep foo.bar", "keep foo."],
      ["keep !!!??", "keep "],
      ["keep 👩‍💻!?\t ", "keep "],
      ["keep cafe\u0301", "keep "],
      ["keep 界面tail", "keep 界面"],
    ]) {
      host.ui.setEditorText(before!)
      await host.key("\x17")
      assert.equal(host.ui.getEditorText(), after, before)
      await host.key("\x1b[122;9u")
      assert.equal(host.ui.getEditorText(), before)
    }
    for (const [before, after] of [
      ["foo.bar tail", ".bar tail"],
      ["!!!?? tail", " tail"],
      ["\t 👩‍💻!? tail", " tail"],
      ["cafe\u0301 tail", " tail"],
      ["界面tail rest", "tail rest"],
    ]) {
      host.ui.setEditorText(before!)
      await host.key("\x01")
      await host.key("\x1bd")
      assert.equal(host.ui.getEditorText(), after, before)
      await host.key("\x1b[122;9u")
      assert.equal(host.ui.getEditorText(), before)
    }
  })

  test(`configured word and line actions own their keys in ${view} view`, async (t) => {
    const host = await openHost(t, {
      keybindings: {
        "tui.editor.deleteWordBackward": "super+a",
        "tui.editor.deleteWordForward": "ctrl+alt+d",
        "tui.editor.deleteToLineStart": "ctrl+alt+u",
        "tui.editor.deleteToLineEnd": "ctrl+alt+k",
      },
    })
    if (view === "source") await host.key("\x1b[109;10u")
    host.ui.setEditorText("one two three")
    await host.key("\x17")
    assert.equal(host.ui.getEditorText(), "one two three")
    await host.key("\x1b[97;9u")
    assert.equal(host.ui.getEditorText(), "one two ")
    await host.type("X")
    assert.equal(host.ui.getEditorText(), "one two X")
    await host.key("\x01")
    await host.key("\x1b[100;7u")
    assert.equal(host.ui.getEditorText(), " two X")
    await host.key("\x05")
    await host.key("\x1b[D")
    await host.key("\x1b[117;7u")
    assert.equal(host.ui.getEditorText(), "X")
    await host.key("\x1b[107;7u")
    assert.equal(host.ui.getEditorText(), "")
  })

  test(`empty outer deletion is a no-op in ${view} view`, async (t) => {
    const host = await openHost(t)
    if (view === "source") await host.key("\x1b[109;10u")
    host.ui.setEditorText("**unchanged**")
    await host.key("\x1bd")
    await host.key("\x0b")
    assert.equal(host.ui.getEditorText(), "**unchanged**")
    await host.key("\x01")
    await host.key("\x17")
    await host.key("\x15")
    assert.equal(host.ui.getEditorText(), "**unchanged**")
    await host.key("\x1b[122;9u")
    assert.equal(host.ui.getEditorText(), "")
    await host.key("\x17")
    await host.key("\x1bd")
    await host.key("\x15")
    await host.key("\x0b")
    assert.equal(host.ui.getEditorText(), "")
    await host.key("\x1b[122;10u")
    assert.equal(host.ui.getEditorText(), "**unchanged**")
  })

  test(`word deletion preserves inline code and tab contents in ${view} view`, async (t) => {
    const host = await openHost(t)
    if (view === "source") await host.key("\x1b[109;10u")
    const source = "Keep `foo.bar\t👩‍💻 cafe\u0301`"
    host.ui.setEditorText(source)
    await host.key("\x05")
    if (view === "source") await host.key("\x1b[D")
    await host.key("\x17")
    assert.equal(host.ui.getEditorText(), "Keep `foo.bar\t👩‍💻 `")
    await host.key("\x17")
    assert.equal(host.ui.getEditorText(), "Keep `foo.bar\t`")
    await host.key("\x17")
    assert.equal(host.ui.getEditorText(), "Keep `foo.`")
    await host.key("\x1b[122;9u")
    await host.key("\x1b[122;9u")
    await host.key("\x1b[122;9u")
    assert.equal(host.ui.getEditorText(), source)
  })
}

test("every native word and line deletion consumes the formatted selection before its own range", async (t) => {
  const host = await openHost(t)
  for (const { before, from, length, after, replacement } of [
    {
      before: "red **blue** green",
      from: 4,
      length: 4,
      after: "red  green",
      replacement: "red **X** green",
    },
    {
      before: "**alpha**",
      from: 3,
      length: 2,
      after: "**alp**",
      replacement: "**alpX**",
    },
    {
      before: "**blue** and _green_",
      from: 0,
      length: 12,
      after: "_en_",
      replacement: "X_en_",
    },
  ]) {
    for (const action of ["\x17", "\x1bd", "\x15", "\x0b"]) {
      host.ui.setEditorText(before)
      await host.key("\x01")
      for (let index = 0; index < from; index++) await host.key("\x1b[C")
      for (let index = 0; index < length; index++) await host.key("\x1b[1;2C")
      await host.key(action)
      assert.equal(host.ui.getEditorText(), after)
      await host.key("\x1b[122;9u")
      assert.equal(host.ui.getEditorText(), before)
      await host.key("\x1b[122;10u")
      assert.equal(host.ui.getEditorText(), after)
      await host.key("\x1b[122;9u")
      await host.type("X")
      assert.equal(host.ui.getEditorText(), replacement)
    }
  }
})

test("native word and line deletion consumes literal source selections", async (t) => {
  const host = await openHost(t)
  await host.key("\x1b[109;10u")
  for (const action of ["\x17", "\x1bd", "\x15", "\x0b"]) {
    host.ui.setEditorText("red **blue** green")
    await host.key("\x01")
    for (let index = 0; index < 4; index++) await host.key("\x1b[C")
    for (let index = 0; index < 8; index++) await host.key("\x1b[1;2C")
    await host.key(action)
    assert.equal(host.ui.getEditorText(), "red  green")
    await host.key("\x1b[122;9u")
    await host.type("X")
    assert.equal(host.ui.getEditorText(), "red X green")
  }
})

test("native forward character deletion yields to the application's empty-editor exit", async (t) => {
  const host = await openHost(t)
  let exited = false
  const editor = host.ui.getEditorComponent()!
  host.ui.setEditorComponent((...args) =>
    Object.assign(editor(...args), {
      onCtrlD: () => {
        exited = true
      },
    }),
  )
  host.ui.setEditorText("ab")
  await host.key("\x01")
  await host.key("\x04")
  assert.equal(host.ui.getEditorText(), "b")
  assert.equal(exited, false)
  await host.key("\x0b")
  assert.equal(host.ui.getEditorText(), "")
  await host.key("\x04")
  assert.equal(exited, true)
})
