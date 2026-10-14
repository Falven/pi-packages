import assert from "node:assert/strict"
import { test } from "node:test"
import { nativePi, waitFor } from "./native-pi.mjs"

const expected = JSON.parse(process.argv[2])

test("restarted native Pi retains the thumbnail preference", async (t) => {
  const host = await nativePi(t, [], { directory: expected.directory })
  const pending = host.runtime.session.prompt("/attachments")
  await waitFor(() => assert.match(host.render(), /Settings/))
  host.input("\r")
  await waitFor(() => assert.match(host.render(), /Attachment thumbnail size/))
  assert.ok(host.render().includes(expected.thumbnailSize))
  host.input("\x1b")
  await pending
  assert.equal(host.ui.getEditorText(), "")
})
