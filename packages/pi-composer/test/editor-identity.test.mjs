import assert from "node:assert/strict"
import { test } from "node:test"
import { openHost } from "../fixtures/host.ts"

test("public editor identity follows composer undo and redo across identical captures", async (t) => {
  const host = await openHost(t)
  host.ui.setEditorText("[note](source.txt)")
  const original = host.ui.getEditorTextIdentity()
  await host.key("\x1b[D")
  assert.strictEqual(host.ui.getEditorTextIdentity(), original)

  assert.equal(host.ui.captureEditorEdit(7, 17).replace("retained.txt"), true)
  const first = host.ui.getEditorTextIdentity()
  assert.notStrictEqual(first, original)
  assert.equal(host.ui.captureEditorEdit(7, 19).replace("retained.txt"), true)
  const second = host.ui.getEditorTextIdentity()
  assert.notStrictEqual(second, first)

  await host.key("\x1b[122;9u")
  assert.strictEqual(host.ui.getEditorTextIdentity(), first)
  await host.key("\x1b[122;9u")
  assert.strictEqual(host.ui.getEditorTextIdentity(), original)
  await host.key("\x1b[122;10u")
  assert.strictEqual(host.ui.getEditorTextIdentity(), first)
  await host.key("\x1b[122;10u")
  assert.strictEqual(host.ui.getEditorTextIdentity(), second)

  host.ui.setEditorText("another draft")
  assert.notStrictEqual(host.ui.getEditorTextIdentity(), second)
})

test("public same-text draft replacement gets a distinct undoable identity", async (t) => {
  const host = await openHost(t)
  host.ui.setEditorText("draft")
  await host.key("\x1b[D")
  const before = host.ui.getEditorTextIdentity()

  host.ui.setEditorText("draft")
  const after = host.ui.getEditorTextIdentity()
  assert.notStrictEqual(after, before)
  assert.equal(host.ui.getEditorText(), "draft")

  await host.key("\x1b[122;9u")
  assert.strictEqual(host.ui.getEditorTextIdentity(), before)
  assert.equal(host.ui.getEditorText(), "draft")
  await host.key("\x1b[122;10u")
  assert.strictEqual(host.ui.getEditorTextIdentity(), after)

  await host.key("!")
  assert.equal(host.ui.getEditorText(), "draf!t")
})
