import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import { nativePi, waitFor } from "./native-pi.mjs"

const expected = JSON.parse(process.argv[2])

test("restarted native Pi reads retained snapshots", async (t) => {
  const host = await nativePi(t, [], expected)
  const sessionId = host.runtime.session.sessionManager.getSessionId()
  if (expected.persisted) assert.equal(sessionId, expected.sessionId)
  else {
    assert.notEqual(sessionId, expected.sessionId)
    await assert.rejects(readFile(expected.sessionFile), { code: "ENOENT" })
  }
  assert.equal(host.ui.getEditorText(), "")
  assert.deepEqual(
    host.runtime.session.getUserMessagesForForking().map(({ text }) => text),
    expected.history,
  )
  assert.equal(
    await readFile(expected.recovery.path, "utf8"),
    expected.recovery.text,
  )
  assert.equal(await readFile(expected.snapshot, "utf8"), expected.contents)

  host.replies.push({
    index: 0,
    delta: {
      role: "assistant",
      tool_calls: [
        {
          index: 0,
          id: "read-after-restart",
          type: "function",
          function: {
            name: "read",
            arguments: JSON.stringify({ path: expected.snapshot }),
          },
        },
      ],
    },
    finish_reason: "tool_calls",
  })
  host.submit("Read the retained snapshot.")
  await waitFor(() => assert.equal(host.requests.length, 2))
  assert.equal(
    host.requests[1].messages.find(({ role }) => role === "tool").content,
    expected.contents,
  )
  await waitFor(() => assert.equal(host.runtime.session.isStreaming, false))
  assert.equal(
    await readFile(expected.recovery.path, "utf8"),
    expected.recovery.text,
  )
})
