import assert from "node:assert/strict"
import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import { openHost } from "../fixtures/host.ts"
import { snapshotPath } from "../../pi-attachments/test-support/native-pi.mjs"

const attachments = fileURLToPath(
  new URL("../../pi-attachments/src/index.ts", import.meta.url),
)

for (const view of ["formatted", "source"]) {
  test(`native deletion restores ${view} selection and attachment membership with one undo`, async (t) => {
    const host = await openHost(t, { extensionPaths: [attachments] })
    const source = join(host.directory, "context.txt")
    const contents = "Captured context\r\n\tKeep original bytes\r\n"
    await writeFile(source, contents)
    await host.session.sendUserMessage(`/attach-file ${source}`, {
      expandPromptTemplates: true,
    })
    const reference = host.ui.getEditorText().trim()
    const snapshot = snapshotPath(reference)
    const before = `Keep\n${reference}\nTail`
    host.ui.setEditorText(before)
    if (view === "source") await host.key("\x1b[109;10u")
    await host.key("\x01")
    await host.key("\x1b[D")
    await host.key("\x1b[1;2H")
    host.terminal.output = ""
    await host.key("\x17")
    assert.equal(host.ui.getEditorText(), "Keep\n\nTail")
    assert.doesNotMatch(await host.output(), /Attachments \(/)
    host.terminal.output = ""
    await host.key("\x1b[122;9u")
    assert.equal(host.ui.getEditorText(), before)
    assert.match(await host.output(), /Attachments \(1\): context\.txt/)
    await host.key("\x1b[122;10u")
    assert.equal(host.ui.getEditorText(), "Keep\n\nTail")
    await host.key("\x1b[122;9u")
    await host.key("\x0b")
    assert.equal(host.ui.getEditorText(), "Keep\n\nTail")
    assert.equal(await readFile(snapshot, "utf8"), contents)
  })
}
