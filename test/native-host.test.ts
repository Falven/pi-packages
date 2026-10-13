import assert from "node:assert/strict"
import { writeFile } from "node:fs/promises"
import { join } from "node:path"
import test from "node:test"
import { openNativeHost } from "../fixtures/native-host.ts"

test("the native host runs without a companion extension and captures a fresh frame", async (t) => {
  const host = await openNativeHost(t)
  assert.equal(
    host.runtime.services.resourceLoader.getExtensions().extensions.length,
    1,
  )

  await host.type("Hello")
  await host.key("\r")
  await host.settled()
  assert.equal(host.requests[0]?.messages.at(-1)?.role, "user")
  assert.match(await host.frame(), /Received\./)
  assert(host.terminal.output.includes("\x1b"))
  await host.runtime.newSession()
  assert.doesNotMatch(await host.frame(), /Received\./)
})

test("explicit extensions and native tools run through the real session", async (t) => {
  const host = await openNativeHost(t, {
    tools: ["read"],
    extensionPaths: [
      new URL("../packages/pi-composer/src/index.ts", import.meta.url).pathname,
    ],
    extensionFactories: [
      (pi) => {
        pi.on("session_start", (_event, ctx) =>
          ctx.ui.notify("Chosen extension", "info"),
        )
      },
    ],
  })
  assert.equal(
    host.runtime.services.resourceLoader.getExtensions().extensions.length,
    3,
  )
  assert.match(await host.frame(), /Chosen extension/)

  await writeFile(join(host.directory, "note.txt"), "Native tool result")
  host.queueResponse(
    {
      event: {
        choices: [
          {
            index: 0,
            delta: {
              role: "assistant",
              tool_calls: [
                {
                  index: 0,
                  id: "call-1",
                  type: "function",
                  function: { name: "read", arguments: '{"path":"note.txt"}' },
                },
              ],
            },
            finish_reason: null,
          },
        ],
      },
    },
    {
      event: {
        choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }],
      },
    },
    { event: "[DONE]" },
    { end: true },
  )
  await host.type("Read the note")
  await host.key("\r")
  await t.waitFor(() => assert.equal(host.requests.length, 2))
  await host.settled()
  assert.match(JSON.stringify(host.requests[1]), /Native tool result/)
  assert.match(await host.frame(), /read note\.txt/)
})

test("provider scripts can pause between real streamed stages", async (t) => {
  const host = await openNativeHost(t)
  host.queueResponse(
    {
      event: {
        choices: [
          {
            index: 0,
            delta: { role: "assistant", reasoning_content: "Working" },
            finish_reason: null,
          },
        ],
      },
    },
    { pause: true },
    {
      event: {
        choices: [
          { index: 0, delta: { content: "Finished" }, finish_reason: null },
        ],
      },
    },
    { event: { choices: [{ index: 0, delta: {}, finish_reason: "stop" }] } },
    { event: "[DONE]" },
    { end: true },
  )
  await host.type("Go")
  await host.key("\r")
  await t.waitFor(() => assert.equal(host.requests.length, 1))
  assert.equal(host.session.isStreaming, true)
  assert.match(await host.frame(), /Working/)
  host.resumeResponse()
  await host.settled()
  assert.match(await host.frame(), /Finished/)
})

test("scripted provider failures reach the native session", async (t) => {
  const host = await openNativeHost(t)
  host.queueResponse({ status: 503 })
  await host.type("Fail")
  await host.key("\r")
  await host.settled()
  assert.match(await host.frame(), /Controlled model failure/)

  host.queueResponse({ disconnect: true })
  await host.type("Disconnect")
  await host.key("\r")
  await t.waitFor(() => assert.equal(host.requests.length, 2))
  await host.settled()
  const answer = host.session.messages.findLast(
    (message) => message.role === "assistant",
  )
  assert(answer?.role === "assistant")
  assert.equal(answer.stopReason, "error")
})
