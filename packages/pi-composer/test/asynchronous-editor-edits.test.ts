import assert from "node:assert/strict"
import { test } from "node:test"
import { openNativeHost } from "../../../fixtures/native-host.ts"
import { openHost } from "../fixtures/host.ts"

test("native Pi applies a delayed destination change as one undoable edit before submission", async (t) => {
  const host = await openNativeHost(t, { noTools: "all" })
  host.ui.setEditorText("[note](source.txt) tail")
  const edit = host.ui.captureEditorEdit(7, 17)
  await host.type("!")
  assert.equal(edit.replace("retained.txt"), true)
  assert.equal(host.ui.getEditorText(), "[note](retained.txt) tail!")
  await host.key("\x1b[45;5u")
  assert.equal(host.ui.getEditorText(), "[note](source.txt) tail!")
  const submitted = host.ui.captureEditorEdit(7, 17)
  await host.key("\r")
  await host.settled()
  assert.equal(submitted.replace("wrong.txt"), false)
  assert.equal(host.requests.length, 1)
})

test("native Pi captures offsets from its public expanded text after a collapsed paste", async (t) => {
  const host = await openNativeHost(t, { noTools: "all" })
  host.ui.pasteToEditor("x".repeat(2000))
  host.ui.pasteToEditor(" [note](source.txt)")
  const from = host.ui.getEditorText().indexOf("source.txt")
  assert(from > 2000)
  assert.equal(
    host.ui.captureEditorEdit(from, from + 10).replace("retained.txt"),
    true,
  )
  assert.match(host.ui.getEditorText(), /\[note\]\(retained\.txt\)$/)
})

test("native Pi rejects a captured edit after a session switch", async (t) => {
  const host = await openNativeHost(t, { noTools: "all" })
  host.ui.setEditorText("[note](source.txt)")
  const edit = host.ui.captureEditorEdit(7, 17)
  assert.deepEqual(await host.runtime.newSession(), { cancelled: false })
  assert.equal(edit.replace("wrong.txt"), false)
})

test("a delayed destination replacement follows later typing and shares composer undo", async (t) => {
  const origins: string[] = []
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
                target.onChange = (text, origin) => {
                  origins.push(origin ?? "unknown")
                  value?.(text, origin)
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
  host.ui.setEditorText("[note](source.txt) tail")
  const edit = host.ui.captureEditorEdit(7, 17)
  await host.type("!")
  assert.equal(edit.replace("retained.txt"), true)
  assert.equal(host.ui.getEditorText(), "[note](retained.txt) tail!")
  await host.key("\x1b[122;9u")
  assert.equal(host.ui.getEditorText(), "[note](source.txt) tail!")
  await host.key("\x1b[122;10u")
  assert.equal(host.ui.getEditorText(), "[note](retained.txt) tail!")
  assert.deepEqual(origins.slice(-3), ["replacement", "undo", "redo"])
})

test("a delayed replacement preserves a selected draft and rebases unambiguous prefix typing", async (t) => {
  const host = await openHost(t)
  host.ui.setEditorText("[note](source.txt) tail")
  const edit = host.ui.captureEditorEdit(7, 17)
  await host.key("\x1b[97;9u")
  await host.key("\x1b[D")
  await host.type("Prefix ")
  await host.key("\x1b[97;9u")
  assert.equal(edit.replace("retained.txt"), true)
  assert.equal(host.ui.getEditorText(), "Prefix [note](retained.txt) tail")
  await host.type("New draft")
  assert.equal(host.ui.getEditorText(), "New draft")
})

test("a delayed replacement rejects edited, ambiguous, or replaced drafts", async (t) => {
  const host = await openHost(t)
  host.ui.setEditorText("[note](source.txt)")
  await host.key("\x1b[109;10u")
  const edited = host.ui.captureEditorEdit(7, 17)
  await host.key("\x1b[D")
  await host.key("\x1b[D")
  await host.type("X")
  assert.equal(edited.replace("wrong.txt"), false)

  host.ui.setEditorText("aaaa")
  const ambiguous = host.ui.captureEditorEdit(1, 2)
  await host.key("\x1b[97;9u")
  await host.key("\x1b[D")
  await host.type("a")
  assert.equal(ambiguous.replace("X"), false)

  host.ui.setEditorText("[note](source.txt)")
  const switched = host.ui.captureEditorEdit(7, 17)
  host.ui.setEditorComponent(undefined)
  assert.equal(switched.replace("wrong.txt"), false)
})

test("composer history restoration invalidates work captured before undo or redo", async (t) => {
  const host = await openHost(t)
  host.ui.setEditorText("[note](source.txt)")
  const beforeUndo = host.ui.captureEditorEdit(7, 17)
  await host.type("!")
  await host.key("\x1b[122;9u")
  assert.equal(beforeUndo.replace("wrong.txt"), false)
  const beforeRedo = host.ui.captureEditorEdit(7, 17)
  await host.key("\x1b[122;10u")
  assert.equal(beforeRedo.replace("wrong.txt"), false)
})

test("a pending composer edit is stale after submission", async (t) => {
  const host = await openHost(t)
  host.ui.setEditorText("[note](source.txt)")
  const edit = host.ui.captureEditorEdit(7, 17)
  await host.key("\x1b[13;9u")
  await host.settled()
  assert.equal(edit.replace("wrong.txt"), false)
  assert.equal(host.ui.getEditorText(), "")
})

test("a captured edit cannot cross a session switch", async (t) => {
  const host = await openHost(t)
  host.ui.setEditorText("[note](source.txt)")
  const edit = host.ui.captureEditorEdit(7, 17)
  assert.deepEqual(await host.runtime.newSession(), { cancelled: false })
  assert.equal(edit.replace("wrong.txt"), false)
})
