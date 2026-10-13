import assert from "node:assert/strict"
import test from "node:test"
import { writeFile } from "node:fs/promises"
import { join } from "node:path"
import { Text } from "@earendil-works/pi-tui"
import { openNativeHost } from "../../../fixtures/native-host.ts"
import { installReplacement, observed } from "./fixtures/root-owner.ts"

const chat = new URL("../src/index.ts", import.meta.url).pathname
const rootOwner = new URL("./fixtures/root-owner.ts", import.meta.url).pathname
const ownedRoot = () => observed.host?.fullscreenLayoutRoot

test("native chat keeps the live answer, composer, and provider content", async (t) => {
  const host = await openNativeHost(t, { extensionPaths: [chat] })
  await host.type("Hello")
  await host.key("\r")
  await host.settled()

  const frame = await host.frame()
  assert.match(frame, /Hello/)
  assert.match(frame, /Received\./)
  assert.match(frame, /draft-test/)
  assert.equal(host.requests[0]?.messages.at(-1)?.role, "user")
  assert.match(
    JSON.stringify(host.requests[0]?.messages.at(-1)?.content),
    /Hello/,
  )
  assert.doesNotMatch(frame, /pi-chat requires|pi-chat cannot/)
})

test("native Markdown transforms still apply without changing stored or requested text", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    extensionFactories: [
      (pi) =>
        pi.registerMarkdownTransformer((markdown) =>
          markdown.replace("Received.", "Rendered by extension"),
        ),
    ],
  })
  await host.type("Transform")
  await host.key("\r")
  await host.settled()

  assert.match(await host.frame(), /Rendered by extension/)
  assert.equal(
    host.session.messages.findLast((message) => message.role === "assistant")
      ?.content[0]?.type,
    "text",
  )
  assert.match(JSON.stringify(host.session.messages.at(-1)), /Received\./)
  assert.doesNotMatch(JSON.stringify(host.requests[0]), /Rendered by extension/)
})

test("switching sessions rebuilds the visible native conversation", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    persistSession: true,
  })
  await host.type("First session")
  await host.key("\r")
  await host.settled()
  const first = host.session.sessionFile!

  await host.runtime.newSession()
  assert.doesNotMatch(await host.frame(), /First session/)
  await host.type("Second session")
  await host.key("\r")
  await host.settled()
  await host.runtime.switchSession(first)

  const frame = await host.frame()
  assert.match(frame, /First session/)
  assert.doesNotMatch(frame, /Second session/)
  assert.match(frame, /Received\./)
})

test("reloading extensions rebinds the current native conversation", async (t) => {
  const host = await openNativeHost(t, { extensionPaths: [chat] })
  await host.type("Before reload")
  await host.key("\r")
  await host.settled()

  await host.reload()
  const frame = await host.frame()
  assert.match(frame, /Before reload/)
  assert.match(frame, /Received\./)
  assert.doesNotMatch(frame, /pi-chat requires|pi-chat cannot|Reload failed/)

  await host.type("After reload")
  await host.key("\r")
  await t.waitFor(() => assert.equal(host.requests.length, 2))
  assert.match(await host.frame(), /After reload/)
})

test("Pi's compacted replay remains canonical in the owned view", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    persistSession: true,
    rows: 40,
  })
  await host.type("Retained before compaction")
  await host.key("\r")
  await host.settled()
  const file = host.session.sessionFile!
  host.session.sessionManager.appendCompaction("Compressed context", null, 100)

  await host.runtime.newSession()
  await host.runtime.switchSession(file)
  const frame = await host.frame()
  assert.match(frame, /Compacted from 100 tokens/)
  assert.doesNotMatch(frame, /Retained before compaction/)
  assert.match(
    JSON.stringify(host.session.sessionManager.getBranch()),
    /Retained before compaction/,
  )
})

test("native tool calls and results survive session replay without rerunning the tool", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    persistSession: true,
    rows: 44,
  })
  await writeFile(
    join(host.directory, "note.txt"),
    "Retained native tool result",
  )
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
                  id: "retained-call",
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
  const file = host.session.sessionFile!

  await host.runtime.newSession()
  await host.runtime.switchSession(file)
  await host.key("\u000f")
  const frame = await host.frame()
  assert.match(frame, /read note\.txt/)
  assert.match(frame, /Retained native tool result/)
  assert.equal(host.requests.length, 2)
})

test("native custom renderers keep equal occurrences distinct", async (t) => {
  const sendRef: { current?: () => void } = {}
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    extensionFactories: [
      (pi) => {
        pi.registerEntryRenderer(
          "test.entry",
          () => new Text("Rendered entry", 0, 0),
        )
        pi.registerMessageRenderer(
          "test.message",
          () => new Text("Repeated custom message", 0, 0),
        )
        sendRef.current = () => {
          pi.appendEntry("test.entry", { value: 1 })
          pi.sendMessage(
            { customType: "test.message", content: "same", display: true },
            { triggerTurn: false },
          )
          pi.sendMessage(
            { customType: "test.message", content: "same", display: true },
            { triggerTurn: false },
          )
        }
      },
    ],
  })
  assert(sendRef.current)
  sendRef.current()
  const frame = await host.frame()
  assert.match(frame, /Rendered entry/)
  assert.equal(frame.match(/Repeated custom message/g)?.length, 2)
  const entries = host.session.sessionManager
    .getBranch()
    .filter((entry) => entry.type === "custom_message")
  assert.equal(entries.length, 2)
  assert.notEqual(entries[0]?.id, entries[1]?.id)
  assert.equal(host.requests.length, 0)
})

test("native shell output remains a persisted standalone conversation row", async (t) => {
  const host = await openNativeHost(t, { extensionPaths: [chat] })
  await host.type("!printf ShellOwned")
  await host.key("\r")
  await t.waitFor(() => {
    assert(
      host.session.sessionManager
        .getBranch()
        .some(
          (entry) =>
            entry.type === "message" && entry.message.role === "bashExecution",
        ),
    )
  })
  const frame = await host.frame()
  assert.match(frame, /printf ShellOwned/)
  assert.match(frame, /ShellOwned/)
  assert.equal(host.requests.length, 0)
})

test("shell output queued during streaming joins its native row after persistence", async (t) => {
  const host = await openNativeHost(t, { extensionPaths: [chat] })
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
  await host.type("Start")
  await host.key("\r")
  await t.waitFor(() => assert.equal(host.session.isStreaming, true))
  await host.type("!printf DeferredShell")
  await host.key("\r")
  await t.waitFor(() => assert.equal(host.session.hasPendingBashMessages, true))
  host.resumeResponse()
  await host.settled()
  const bash = host.session.sessionManager
    .getBranch()
    .find(
      (entry) =>
        entry.type === "message" && entry.message.role === "bashExecution",
    )
  assert(
    bash && bash.type === "message" && bash.message.role === "bashExecution",
  )
  assert.match(bash.message.output, /DeferredShell/)
  assert.match(await host.frame(), /DeferredShell/)
})

test("regular mode keeps native history and switching to fullscreen mounts owned chat", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    tuiMode: "regular",
  })
  await host.type("Regular mode")
  await host.key("\r")
  await host.settled()
  assert.match(await host.frame(), /Received\./)
  assert.equal(host.switchMode("fullscreen"), true)
  const fullscreen = await host.frame()
  assert.match(fullscreen, /Regular mode/)
  assert.match(fullscreen, /Received\./)
  assert.match(fullscreen, /draft-test/)
  await host.type("Fullscreen follow-up")
  await host.key("\r")
  await t.waitFor(() => assert.equal(host.requests.length, 2))
  assert.match(await host.frame(), /Fullscreen follow-up/)
  assert.equal(host.switchMode("regular"), true)
  assert.match(await host.frame(), /Received\./)
})

test("a prior fullscreen owner prevents activation without losing its root", async (t) => {
  delete observed.host
  delete observed.replacement
  observed.notifications.length = 0
  observed.errors.length = 0
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    onMount: (interactive) => {
      const mode = interactive as unknown as {
        showError(message: string): void
      }
      const showError = mode.showError
      mode.showError = (message) => {
        observed.errors.push(message)
        showError.call(interactive, message)
      }
      installReplacement(interactive)
    },
  })
  assert.match(await host.frame(), /Other owner active/)
  assert(
    [...observed.notifications, ...observed.errors].some((message) =>
      /requires the unowned Pi 1\.0\.2 fullscreen chat host/.test(message),
    ),
  )
  assert.equal(ownedRoot(), observed.replacement)
  await host.close()
  assert.equal(ownedRoot(), observed.replacement)
})

test("cleanup leaves a later fullscreen owner's replacement intact", async (t) => {
  delete observed.host
  delete observed.replacement
  observed.notifications.length = 0
  observed.errors.length = 0
  const host = await openNativeHost(t, { extensionPaths: [chat, rootOwner] })
  assert.match(await host.frame(), /Other owner active/)
  assert.equal(ownedRoot(), observed.replacement)
  await host.close()
  assert.equal(ownedRoot(), observed.replacement)
})
