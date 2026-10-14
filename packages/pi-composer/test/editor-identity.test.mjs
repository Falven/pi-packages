import assert from "node:assert/strict"
import { test } from "node:test"
import { openAttachmentEditor } from "../fixtures/attachment-editor.ts"

test("composer identity follows undo and redo across identical captures", async (t) => {
  const host = await openAttachmentEditor(t)
  host.ui.setEditorText("[note](source.txt)")
  const original = host.access.snapshot().identity
  await host.key("\x1b[D")
  assert.strictEqual(host.access.snapshot().identity, original)

  assert.equal(host.access.captureEdit(7, 17).replace("retained.txt"), true)
  const first = host.access.snapshot().identity
  assert.notStrictEqual(first, original)
  assert.equal(host.access.captureEdit(7, 19).replace("retained.txt"), true)
  const second = host.access.snapshot().identity
  assert.notStrictEqual(second, first)

  await host.key("\x1b[122;9u")
  assert.strictEqual(host.access.snapshot().identity, first)
  await host.key("\x1b[122;9u")
  assert.strictEqual(host.access.snapshot().identity, original)
  await host.key("\x1b[122;10u")
  assert.strictEqual(host.access.snapshot().identity, first)
  await host.key("\x1b[122;10u")
  assert.strictEqual(host.access.snapshot().identity, second)

  host.ui.setEditorText("another draft")
  assert.notStrictEqual(host.access.snapshot().identity, second)
})

test("same-text composer replacement changes identity without adding an undo step", async (t) => {
  const host = await openAttachmentEditor(t)
  host.ui.setEditorText("draft")
  await host.key("\x1b[D")
  const before = host.access.snapshot().identity

  host.ui.setEditorText("draft")
  const after = host.access.snapshot().identity
  assert.notStrictEqual(after, before)
  assert.equal(host.ui.getEditorText(), "draft")

  await host.key("!")
  assert.equal(host.ui.getEditorText(), "draf!t")

  await host.key("\x1b[122;9u")
  assert.strictEqual(host.access.snapshot().identity, after)
  assert.equal(host.ui.getEditorText(), "draft")
  await host.key("\x1b[122;9u")
  assert.equal(host.ui.getEditorText(), "")
})
