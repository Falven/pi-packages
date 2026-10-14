import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import {
  assertAttachments,
  nativePi,
  snapshotPath,
} from "../../pi-attachments/fixtures/native-pi.mjs"

const composer = fileURLToPath(new URL("../src/index.ts", import.meta.url))

for (const view of ["formatted", "source"]) {
  test(`${view} yank-pop changes attachment membership in one recoverable edit`, async (t) => {
    const host = await nativePi(t, [composer])
    if (view === "source") host.input("\x1b[109;10u")
    await host.attachText("First retained bytes")
    const first = host.ui.getEditorText().trim()
    host.ui.setEditorText(first)
    host.input("\x1b[97;9u")
    host.input("\x15")
    assert.equal(host.ui.getEditorText(), "")
    assert.doesNotMatch(host.render(), /Manage attachments/)

    await host.attachText("Second retained bytes")
    const second = host.ui.getEditorText().trim()
    host.ui.setEditorText(second)
    host.input("\x1b[97;9u")
    host.input("\x15")
    host.ui.setEditorText("Keep **old**")
    host.input("\x05")
    if (view === "source") {
      host.input("\x1b[D")
      host.input("\x1b[D")
    }
    for (let index = 0; index < 3; index++) host.input("\x1b[1;2D")
    host.input("\x19")
    assert.equal(host.ui.getEditorText(), `Keep **${second}**`)
    assertAttachments(host.ui.getEditorText(), host.render(), ["text.txt"])
    host.input("\x1by")
    assert.equal(host.ui.getEditorText(), `Keep **${first}**`)
    assertAttachments(host.ui.getEditorText(), host.render(), ["text.txt"])
    host.input("\x1b[122;9u")
    assert.equal(host.ui.getEditorText(), `Keep **${second}**`)
    host.input("\x1b[122;10u")
    assert.equal(host.ui.getEditorText(), `Keep **${first}**`)
    host.input("\x1b[122;9u")
    host.input("\x1b[122;9u")
    assert.equal(host.ui.getEditorText(), "Keep **old**")
    assert.doesNotMatch(host.render(), /Manage attachments/)
    host.input("new")
    assert.equal(host.ui.getEditorText(), "Keep **new**")
    assert.equal(
      await readFile(snapshotPath(first), "utf8"),
      "First retained bytes",
    )
    assert.equal(
      await readFile(snapshotPath(second), "utf8"),
      "Second retained bytes",
    )
    assert.equal(host.requests.length, 0)
  })
}
