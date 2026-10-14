import assert from "node:assert/strict"
import { test } from "node:test"
import { openAttachmentEditor } from "../fixtures/attachment-editor.ts"

test("native Pi applies a delayed destination change as one undoable edit before submission", async (t) => {
  const host = await openAttachmentEditor(t, { composer: false })
  host.ui.setEditorText("[note](source.txt) tail")
  const edit = host.access.captureEdit(7, 17)
  await host.type("!")
  assert.equal(edit.replace("retained.txt"), true)
  assert.equal(host.ui.getEditorText(), "[note](retained.txt) tail!")
  await host.key("\x1b[45;5u")
  assert.equal(host.ui.getEditorText(), "[note](source.txt) tail!")
  const submitted = host.access.captureEdit(7, 17)
  await host.key("\r")
  await host.settled()
  assert.equal(submitted.replace("wrong.txt"), false)
  assert.equal(host.requests.length, 1)
})

test("native Pi captures offsets from its public expanded text after a collapsed paste", async (t) => {
  const host = await openAttachmentEditor(t, { composer: false })
  host.ui.pasteToEditor("x".repeat(2000))
  assert.match(host.editor.getText(), /\[paste #\d+/)
  host.ui.pasteToEditor(" [note](source.txt)")
  const from = host.ui.getEditorText().indexOf("source.txt")
  assert(from > 2000)
  assert.equal(
    host.access.captureEdit(from, from + 10).replace("retained.txt"),
    true,
  )
  assert.match(host.ui.getEditorText(), /\[note\]\(retained\.txt\)$/)
})

test("native Pi rejects a captured edit after a session switch", async (t) => {
  const host = await openAttachmentEditor(t, { composer: false })
  host.ui.setEditorText("[note](source.txt)")
  const edit = host.access.captureEdit(7, 17)
  assert.deepEqual(await host.runtime.newSession(), { cancelled: false })
  assert.equal(edit.replace("wrong.txt"), false)
})

test("a delayed destination replacement follows later typing and shares composer undo", async (t) => {
  const host = await openAttachmentEditor(t)
  host.ui.setEditorText("[note](source.txt) tail")
  const edit = host.access.captureEdit(7, 17)
  await host.type("!")
  assert.equal(edit.replace("retained.txt"), true)
  assert.equal(host.ui.getEditorText(), "[note](retained.txt) tail!")
  await host.key("\x1b[122;9u")
  assert.equal(host.ui.getEditorText(), "[note](source.txt) tail!")
  await host.key("\x1b[122;10u")
  assert.equal(host.ui.getEditorText(), "[note](retained.txt) tail!")
  assert.deepEqual(host.origins.slice(-3), ["replacement", "undo", "redo"])
})

test("a delayed replacement preserves a selected draft and rebases unambiguous prefix typing", async (t) => {
  const host = await openAttachmentEditor(t)
  host.ui.setEditorText("[note](source.txt) tail")
  const edit = host.access.captureEdit(7, 17)
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
  const host = await openAttachmentEditor(t)
  host.ui.setEditorText("[note](source.txt)")
  await host.key("\x1b[109;10u")
  const edited = host.access.captureEdit(7, 17)
  await host.key("\x1b[D")
  await host.key("\x1b[D")
  await host.type("X")
  assert.equal(edited.replace("wrong.txt"), false)

  host.ui.setEditorText("aaaa")
  const ambiguous = host.access.captureEdit(1, 2)
  await host.key("\x1b[97;9u")
  await host.key("\x1b[D")
  await host.type("a")
  assert.equal(ambiguous.replace("X"), false)

  host.ui.setEditorText("[note](source.txt)")
  const switched = host.access.captureEdit(7, 17)
  host.ui.setEditorComponent(undefined)
  assert.equal(switched.replace("wrong.txt"), false)
})

test("composer history restoration invalidates work captured before undo or redo", async (t) => {
  const host = await openAttachmentEditor(t)
  host.ui.setEditorText("[note](source.txt)")
  const beforeUndo = host.access.captureEdit(7, 17)
  await host.type("!")
  await host.key("\x1b[122;9u")
  assert.equal(beforeUndo.replace("wrong.txt"), false)
  const beforeRedo = host.access.captureEdit(7, 17)
  await host.key("\x1b[122;10u")
  assert.equal(beforeRedo.replace("wrong.txt"), false)
})

test("a pending composer edit is stale after submission", async (t) => {
  const host = await openAttachmentEditor(t)
  host.ui.setEditorText("[note](source.txt)")
  const edit = host.access.captureEdit(7, 17)
  await host.key("\x1b[13;9u")
  await host.settled()
  assert.equal(edit.replace("wrong.txt"), false)
  assert.equal(host.ui.getEditorText(), "")
})

test("a captured edit cannot cross a session switch", async (t) => {
  const host = await openAttachmentEditor(t)
  host.ui.setEditorText("[note](source.txt)")
  const edit = host.access.captureEdit(7, 17)
  assert.deepEqual(await host.runtime.newSession(), { cancelled: false })
  assert.equal(edit.replace("wrong.txt"), false)
})

test("a frozen composer insertion preserves formatted selection semantics without editing a later draft", async (t) => {
  const host = await openAttachmentEditor(t)
  host.ui.setEditorText("Keep **old**")
  for (let index = 0; index < 3; index++) {
    // eslint-disable-next-line no-await-in-loop -- Selection changes follow terminal input order.
    await host.key("\x1b[1;2D")
  }
  const draft = host.access.snapshot()
  const edit = host.access.captureEdit(draft.range.from, draft.range.to)
  const frozen = edit.snapshot()
  assert.ok(frozen)
  await host.key("\x1b[109;10u")
  host.ui.setEditorText("Later draft")
  const patches = frozen.insert("\n[Attachment: new](</tmp/retained>)\n")
  let prepared = draft.text
  for (const patch of patches.toSorted((left, right) => right.from - left.from))
    prepared =
      prepared.slice(0, patch.from) + patch.text + prepared.slice(patch.to)
  assert.equal(prepared, "Keep \n[Attachment: new](</tmp/retained>)\n")
  assert.equal(host.ui.getEditorText(), "Later draft")
})

for (const composer of [false, true]) {
  test(`${composer ? "composer" : "native"} pending insertion exposes its current range and can be cancelled`, async (t) => {
    const host = await openAttachmentEditor(t, { composer })
    host.ui.setEditorText("Draft")
    const insertion = host.access.captureEdit(5, 5)
    await host.type("!")
    assert.equal(insertion.snapshot()?.from, 6)
    assert.equal(insertion.snapshot()?.to, 6)
    assert.equal(insertion.replace(" [note](retained.txt)"), true)
    assert.equal(host.ui.getEditorText(), "Draft! [note](retained.txt)")
    assert.equal(insertion.snapshot(), undefined)
    await host.key(composer ? "\x1b[122;9u" : "\x1b[45;5u")
    assert.equal(host.ui.getEditorText(), "Draft!")

    const cancelled = host.access.captureEdit(6, 6)
    cancelled.cancel()
    assert.equal(cancelled.snapshot(), undefined)
    assert.equal(cancelled.replace("Wrong"), false)
    assert.equal(host.ui.getEditorText(), "Draft!")
  })

  test(`${composer ? "composer" : "native"} one Send claims pending capture in an empty draft and preserves later typing`, async (t) => {
    const ready = Promise.withResolvers<string>()
    t.after(() => ready.resolve(""))
    let claimed = false
    const host = await openAttachmentEditor(t, {
      composer,
      hasPending: () => true,
      prepare(request) {
        assert.equal(request.text, "")
        assert.deepEqual(request.range, { from: 0, to: 0 })
        claimed = true
        return ready.promise
      },
    })
    host.ui.setEditorText("")
    await host.key(composer ? "\x1b[13;9u" : "\r")
    assert.equal(claimed, true)
    assert.equal(host.requests.length, 0)
    await host.type("Later draft")
    ready.resolve("[note](retained.txt)")
    await t.waitFor(() => assert.equal(host.requests.length, 1))
    await host.settled()
    assert.equal(host.ui.getEditorText(), "Later draft")
    assert.match(JSON.stringify(host.requests[0]), /\[note\]\(retained\.txt\)/)
    assert.doesNotMatch(JSON.stringify(host.requests[0]), /Later draft/)
  })
}
