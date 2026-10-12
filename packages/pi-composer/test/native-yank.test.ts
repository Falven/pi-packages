/* eslint-disable no-await-in-loop -- Preserve terminal input order. */
import assert from "node:assert/strict"
import { test } from "node:test"
import { openHost } from "../fixtures/host.ts"

const undo = "\x1b[122;9u"
const redo = "\x1b[122;10u"
const toggleView = "\x1b[109;10u"

test("native yank recovers a word deletion in the shared draft history", async (t) => {
  const host = await openHost(t)
  host.ui.setEditorText("one two three")
  await host.key("\x17")
  assert.equal(host.ui.getEditorText(), "one two ")
  await host.key("\x19")
  assert.equal(host.ui.getEditorText(), "one two three")
  await host.key(undo)
  assert.equal(host.ui.getEditorText(), "one two ")
  await host.key(redo)
  assert.equal(host.ui.getEditorText(), "one two three")
})

test("successive formatted deletions retain delimiters in their original source order", async (t) => {
  const host = await openHost(t)
  host.ui.setEditorText("**abc**")
  await host.key("\x05")
  await host.key("\x1b[1;2D")
  await host.key("\x1b[1;2D")
  await host.key("\x17")
  assert.equal(host.ui.getEditorText(), "**a**")
  await host.key("\x17")
  assert.equal(host.ui.getEditorText(), "")
  await host.key("\x19")
  assert.equal(host.ui.getEditorText(), "**abc**")
  await host.key(undo)
  assert.equal(host.ui.getEditorText(), "")
  await host.key(undo)
  assert.equal(host.ui.getEditorText(), "**a**")
})

test("forward formatted deletions retain repeated text inside its original delimiters", async (t) => {
  const host = await openHost(t)
  host.ui.setEditorText("**aaa**")
  await host.key("\x01")
  await host.key("\x1b[1;2C")
  await host.key("\x1b[1;2C")
  await host.key("\x1bd")
  assert.equal(host.ui.getEditorText(), "**a**")
  await host.key("\x1bd")
  assert.equal(host.ui.getEditorText(), "")
  await host.key("\x19")
  assert.equal(host.ui.getEditorText(), "**aaa**")
})

for (const direction of ["backward", "forward"]) {
  test(`successive ${direction} deletions accumulate repeated formatted words and punctuation`, async (t) => {
    const host = await openHost(t)
    host.ui.setEditorText("**a-a-a**")
    await host.key(direction === "backward" ? "\x05" : "\x01")
    for (let index = 0; index < 5; index++) {
      await host.key(direction === "backward" ? "\x17" : "\x1bd")
    }
    assert.equal(host.ui.getEditorText(), "")
    await host.key("\x19")
    assert.equal(host.ui.getEditorText(), "**a-a-a**")
  })
}

test("an extension rewrite after deletion ends retained-source accumulation", async (t) => {
  const host = await openHost(t, {
    extension: (pi) => {
      pi.on("session_start", (_event, ctx) => {
        const previous = ctx.ui.getEditorComponent()
        assert(previous)
        ctx.ui.setEditorComponent((...args) => {
          const editor = previous(...args)
          return new Proxy(editor, {
            set(target, property, value) {
              if (property === "onChange") {
                target.onChange = (text) => {
                  value?.(text)
                  if (text === "one ") ctx.ui.setEditorText("Prefix one ")
                }
                return true
              }
              return Reflect.set(target, property, value)
            },
          })
        })
      })
    },
  })
  host.ui.setEditorText("one two")
  await host.key("\x17")
  assert.equal(host.ui.getEditorText(), "Prefix one ")
  await host.key("\x17")
  assert.equal(host.ui.getEditorText(), "Prefix ")
  await host.key("\x19")
  assert.equal(host.ui.getEditorText(), "Prefix one ")
})

test("formatted deletion retains removed Markdown without surviving delimiters", async (t) => {
  const host = await openHost(t)
  for (const { before, from, length, after, retained, replacement } of [
    {
      before: "red **blue** green",
      from: 4,
      length: 4,
      after: "red  green",
      retained: "**blue**",
      replacement: "red **X** green",
    },
    {
      before: "**alpha**",
      from: 3,
      length: 2,
      after: "**alp**",
      retained: "ha",
      replacement: "**alpX**",
    },
    {
      before: "**blue** and _green_",
      from: 0,
      length: 12,
      after: "_en_",
      retained: "**blue** and gre",
      replacement: "X_en_",
    },
  ]) {
    host.ui.setEditorText(before)
    await host.key("\x01")
    for (let index = 0; index < from; index++) await host.key("\x1b[C")
    for (let index = 0; index < length; index++) await host.key("\x1b[1;2C")
    await host.key("\x17")
    assert.equal(host.ui.getEditorText(), after)
    await host.key(undo)
    assert.equal(host.ui.getEditorText(), before)
    await host.type("X")
    assert.equal(host.ui.getEditorText(), replacement)
    host.ui.setEditorText("plain ")
    await host.key("\x19")
    assert.equal(host.ui.getEditorText(), `plain ${retained}`)
    await host.key(undo)
    assert.equal(host.ui.getEditorText(), "plain ")
  }
})

for (const view of ["formatted", "source"]) {
  test(`consecutive ${view} word and line deletions accumulate in source order`, async (t) => {
    const host = await openHost(t)
    if (view === "source") await host.key(toggleView)
    host.ui.setEditorText("one two three")
    await host.key("\x17")
    await host.key("\x17")
    assert.equal(host.ui.getEditorText(), "one ")
    await host.key("\x19")
    assert.equal(host.ui.getEditorText(), "one two three")
    await host.key("\x01")
    await host.key("\x1bd")
    await host.key("\x1bd")
    assert.equal(host.ui.getEditorText(), " three")
    await host.key("\x19")
    assert.equal(host.ui.getEditorText(), "one two three")

    host.ui.setEditorText("keep\n\t👩‍💻 cafe\u0301")
    await host.key("\x15")
    await host.key("\x15")
    assert.equal(host.ui.getEditorText(), "keep")
    await host.key("\x19")
    assert.equal(host.ui.getEditorText(), "keep\n\t👩‍💻 cafe\u0301")
    await host.key("\x1b[97;9u")
    await host.key("\x1b[D")
    await host.key("\x0b")
    await host.key("\x0b")
    assert.equal(host.ui.getEditorText(), "\t👩‍💻 cafe\u0301")
    await host.key("\x19")
    assert.equal(host.ui.getEditorText(), "keep\n\t👩‍💻 cafe\u0301")
  })

  test(`configured yank-pop rotates entries over the original ${view} selection with shared undo`, async (t) => {
    const host = await openHost(t, {
      keybindings: {
        "tui.editor.yank": "ctrl+alt+y",
        "tui.editor.yankPop": "ctrl+alt+p",
      },
    })
    if (view === "source") await host.key(toggleView)
    host.ui.setEditorText("first")
    await host.key("\x15")
    await host.type("second")
    await host.key("\x15")
    await host.type("destination")
    await host.key("\x1b[97;9u")
    await host.key("\x19")
    assert.equal(host.ui.getEditorText(), "destination")
    await host.key("\x1b[121;7u")
    assert.equal(host.ui.getEditorText(), "second")
    await host.key("\x1by")
    assert.equal(host.ui.getEditorText(), "second")
    await host.key("\x1b[112;7u")
    assert.equal(host.ui.getEditorText(), "first")
    await host.key("\x1b[112;7u")
    assert.equal(host.ui.getEditorText(), "second")
    await host.key(undo)
    assert.equal(host.ui.getEditorText(), "first")
    await host.key(undo)
    assert.equal(host.ui.getEditorText(), "second")
    await host.key(undo)
    assert.equal(host.ui.getEditorText(), "destination")
    await host.type("restored selection")
    assert.equal(host.ui.getEditorText(), "restored selection")
  })

  test(`${view} movement and editing end retained deletion accumulation and yank-pop`, async (t) => {
    const host = await openHost(t)
    if (view === "source") await host.key(toggleView)
    host.ui.setEditorText("one two three")
    await host.key("\x17")
    await host.key("\x1b[D")
    await host.key("\x1b[C")
    await host.key("\x17")
    await host.key("\x19")
    assert.equal(host.ui.getEditorText(), "one two ")
    await host.key("\x1by")
    assert.equal(host.ui.getEditorText(), "one three")
    await host.key("\x1b[D")
    await host.key("\x1by")
    assert.equal(host.ui.getEditorText(), "one three")
    await host.key("\x05")
    await host.key("\x19")
    assert.equal(host.ui.getEditorText(), "one threethree")
    await host.type("!")
    await host.key("\x1by")
    assert.equal(host.ui.getEditorText(), "one threethree!")
    await host.key("\x17")
    await host.key("\x19")
    assert.equal(host.ui.getEditorText(), "one threethree!")
    await host.key("\x1by")
    assert.equal(host.ui.getEditorText(), "one threethreethree")
    await host.key("\x1b[97;9u")
    await host.key("\x1by")
    assert.equal(host.ui.getEditorText(), "one threethreethree")
    await host.type("selected")
    assert.equal(host.ui.getEditorText(), "selected")
  })
}

test("partial formatted deletions yank into their surviving and a different formatting context", async (t) => {
  const host = await openHost(t)
  host.ui.setEditorText("**blue**")
  await host.key("\x15")
  host.ui.setEditorText("**alpha**")
  await host.key("\x05")
  await host.key("\x1b[1;2D")
  await host.key("\x1b[1;2D")
  await host.key("\x17")
  assert.equal(host.ui.getEditorText(), "**alp**")
  await host.key("\x19")
  assert.equal(host.ui.getEditorText(), "**alpha**")
  await host.key(undo)
  assert.equal(host.ui.getEditorText(), "**alp**")
  host.ui.setEditorText("_keep_")
  await host.key("\x05")
  await host.key("\x19")
  assert.equal(host.ui.getEditorText(), "_keepha_")
  await host.key(toggleView)
  await host.key("\x1by")
  assert.equal(host.ui.getEditorText(), "_keep**blue**_")
  await host.key("\x1by")
  assert.equal(host.ui.getEditorText(), "_keepha_")
  await host.key(undo)
  assert.equal(host.ui.getEditorText(), "_keep**blue**_")
  await host.key(undo)
  assert.equal(host.ui.getEditorText(), "_keepha_")
  await host.key(undo)
  assert.equal(host.ui.getEditorText(), "_keep_")
})

test("source view retains literal syntax and Unicode through native recovery", async (t) => {
  const host = await openHost(t)
  await host.key(toggleView)
  host.ui.setEditorText("**cafe\u0301 👩‍💻**")
  await host.key("\x01")
  for (let index = 0; index < 6; index++) await host.key("\x1b[1;2C")
  await host.key("\x0b")
  assert.equal(host.ui.getEditorText(), " 👩‍💻**")
  host.ui.setEditorText("literal ")
  await host.key("\x19")
  assert.equal(host.ui.getEditorText(), "literal **cafe\u0301")
  await host.key(undo)
  assert.equal(host.ui.getEditorText(), "literal ")
})
