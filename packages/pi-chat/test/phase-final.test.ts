import assert from "node:assert/strict"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import { ModelRuntime } from "@earendil-works/pi-coding-agent"
import {
  getNativeClipboard,
  stripTerminalSequences,
  type NativeClipboard,
} from "@earendil-works/pi-tui"
import { openNativeHost } from "../../../fixtures/native-host.ts"

const chat = new URL("../src/index.ts", import.meta.url).pathname
function writableClipboard(
  clipboard: NativeClipboard | undefined,
): asserts clipboard is NativeClipboard &
  Required<Pick<NativeClipboard, "setText">> {
  assert(clipboard?.setText)
}

function message(id: string, phase?: "commentary" | "final_answer", text = "") {
  return {
    id,
    type: "message",
    role: "assistant",
    status: text ? "completed" : "in_progress",
    ...(phase ? { phase } : {}),
    content: text ? [{ type: "output_text", text, annotations: [] }] : [],
  }
}

const added = (
  output_index: number,
  id: string,
  phase?: "commentary" | "final_answer",
) => ({
  event: {
    type: "response.output_item.added",
    output_index,
    item: message(id, phase),
  },
})
const delta = (output_index: number, text: string) => ({
  event: {
    type: "response.output_text.delta",
    output_index,
    content_index: 0,
    delta: text,
  },
})
const ended = (
  output_index: number,
  id: string,
  phase: "commentary" | "final_answer" | undefined,
  text: string,
) => ({
  event: {
    type: "response.output_item.done",
    output_index,
    item: message(id, phase, text),
  },
})
const completed = {
  event: {
    type: "response.completed",
    response: { id: "r1", status: "completed" },
  },
}
const failed = {
  event: {
    type: "response.failed",
    response: {
      id: "r1",
      status: "failed",
      error: { code: "test_error", message: "Controlled failure" },
    },
  },
}

async function submit(
  host: Awaited<ReturnType<typeof openNativeHost>>,
  prompt = "Do the work",
) {
  await host.type(prompt)
  await host.key("\r")
}

test("phase-bearing final text collapses identical commentary while it streams", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    providerApi: "openai-responses",
    rows: 36,
  })
  host.queueResponse(
    added(2, "comment", "commentary"),
    delta(2, "Done"),
    ended(2, "comment", "commentary", "Done"),
    added(5, "answer", "final_answer"),
    delta(5, "Done"),
    { pause: true },
    ended(5, "answer", "final_answer", "Done"),
    completed,
  )
  await host.type("Do the work")
  await host.key("\r")
  await t.waitFor(() => assert.equal(host.requests.length, 1))
  const streaming = await host.frame()
  assert.match(streaming, /Worked for \d+m \d+s ▶/)
  assert.equal((streaming.match(/Done/g) ?? []).length, 1)
  assert.match(JSON.stringify(host.requests[0]), /Do the work/)
  assert.doesNotMatch(JSON.stringify(host.requests[0]), /Worked/)

  host.resumeResponse()
  await host.settled()
  const settled = await host.frame()
  assert.match(settled, /Worked for \d+m \d+s ▶/)
  assert.equal((settled.match(/Done/g) ?? []).length, 1)
  const assistant = host.session.messages.at(-1)
  assert.equal(assistant?.role, "assistant")
  assert.deepEqual(
    assistant.content.map((part) => (part.type === "text" ? part.text : "")),
    ["Done", "Done"],
  )
  await host.session.abort()
  const afterIdleAbort = await host.frame()
  assert.match(afterIdleAbort, /Worked for \d+m \d+s ▶/)
  assert.equal((afterIdleAbort.match(/Done/g) ?? []).length, 1)
  host.queueResponse(
    added(0, "next", "final_answer"),
    delta(0, "Next answer"),
    ended(0, "next", "final_answer", "Next answer"),
    completed,
  )
  await submit(host, "Next request")
  await host.settled()
  const nextInput = JSON.stringify(host.requests[1])
  assert.equal((nextInput.match(/"text":"Done"/g) ?? []).length, 2)
  assert.doesNotMatch(nextInput, /Worked/)

  await host.runtime.newSession()
  const requestsBeforeRead = host.requests.length
  await writeFile(join(host.directory, "phase.txt"), "Native phase output")
  host.queueResponse(
    {
      event: {
        type: "response.output_item.done",
        output_index: 0,
        item: {
          id: "read-item",
          call_id: "read-phase",
          type: "function_call",
          name: "read",
          arguments: '{"path":"phase.txt"}',
        },
      },
    },
    completed,
  )
  host.queueResponse(
    { pause: true },
    added(0, "read-answer", "final_answer"),
    delta(0, "Read finished"),
    { pause: true },
    ended(0, "read-answer", "final_answer", "Read finished"),
    completed,
  )
  await submit(host, "Read before the final phase")
  await t.waitFor(() =>
    assert.equal(host.requests.length, requestsBeforeRead + 2),
  )
  const open = await host.frame()
  assert.match(open, /> Reading phase\.txt/)
  assert.doesNotMatch(open, /Read phase\.txt/)
  host.resumeResponse()
  await t.waitFor(async () => assert.match(await host.frame(), /Read finished/))
  assert.equal(host.session.isStreaming, true)
  assert.match(await host.frame(), /Worked for \d+m \d+s ▶/)
  await host.key("\x1bg")
  await host.key("\r")
  const closedSlice = await host.frame()
  assert.match(closedSlice, /> Read phase\.txt/)
  assert.doesNotMatch(closedSlice, /Read files|Native phase output/)
  host.resumeResponse()
  await host.settled()
  const source = JSON.stringify(host.session.messages)
  const requests = host.requests.length
  await host.reload()
  await host.frame()
  await host.key("\x1bg")
  await host.key("\r")
  const replayed = await host.frame()
  assert.match(replayed, /> Read phase\.txt/)
  assert.doesNotMatch(replayed, /Read files|Native phase output/)
  assert.equal(JSON.stringify(host.session.messages), source)
  assert.equal(host.requests.length, requests)
})

test("the subscription Responses API carries the same explicit final phase over SSE", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "pi-chat-provider-"))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const models = await ModelRuntime.create({
    authPath: join(directory, "auth.json"),
    modelsPath: null,
    modelsStorePath: join(directory, "models.json"),
    refreshOnCreate: false,
  })
  const providerApi = models
    .getModels()
    .find(
      (model) =>
        model.api.endsWith("-responses") && model.api !== "openai-responses",
    )?.api
  assert(providerApi)
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    providerApi,
    settings: { transport: "sse" },
    rows: 36,
  })
  host.queueResponse(
    added(1, "progress", "commentary"),
    delta(1, "Prior work"),
    ended(1, "progress", "commentary", "Prior work"),
    added(4, "answer", "final_answer"),
    delta(4, "Visible answer"),
    { pause: true },
    ended(4, "answer", "final_answer", "Visible answer"),
    completed,
  )
  await submit(host)
  await t.waitFor(() => assert.equal(host.requests.length, 1))
  const streaming = await host.frame()
  assert.match(streaming, /Worked for \d+m \d+s ▶/)
  assert.match(streaming, /Visible answer/)
  assert.doesNotMatch(streaming, /Prior work/)
  host.resumeResponse()
  await host.settled()
  assert.match(await host.frame(), /Worked for \d+m \d+s ▶/)
})

test("a failed stream keeps an established partial final and Pi's native error notice", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    providerApi: "openai-responses",
    rows: 36,
  })
  host.queueResponse(
    added(0, "progress", "commentary"),
    delta(0, "Prior work"),
    ended(0, "progress", "commentary", "Prior work"),
    added(8, "answer", "final_answer"),
    delta(8, "Partial answer"),
    { pause: true },
    failed,
  )
  await submit(host)
  await t.waitFor(() => assert.equal(host.requests.length, 1))
  assert.match(await host.frame(), /Worked for \d+m \d+s ▶/)
  host.resumeResponse()
  await host.settled()
  const frame = await host.frame()
  assert.match(frame, /Worked for \d+m \d+s ▶/)
  assert.match(frame, /Partial answer/)
  assert.match(frame, /Error:/)
  assert.doesNotMatch(frame, /Prior work/)
  await host.reload()
  const replay = await host.frame()
  assert.match(replay, /Worked for \d+m \d+s ▶/)
  assert.match(replay, /Partial answer/)
  assert.match(replay, /Error:/)
  assert.doesNotMatch(replay, /Prior work/)
})

test("a phase correction removes an explicitly closed activity disclosure and restores composer focus", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    providerApi: "openai-responses",
    rows: 36,
    keybindings: { "app.tools.expand": "ctrl+e" },
  })
  host.queueResponse(
    added(0, "progress", "commentary"),
    delta(0, "Prior work"),
    ended(0, "progress", "commentary", "Prior work"),
    added(4, "answer", "final_answer"),
    delta(4, "Provisional answer"),
    { pause: true },
    ended(4, "answer", "commentary", "Provisional answer"),
    failed,
  )
  await submit(host)
  await t.waitFor(() => assert.equal(host.requests.length, 1))
  assert.match(await host.frame(), /Worked for \d+m \d+s ▶/)
  await host.key("\x1bg")
  await host.key("\r")
  assert.match(await host.frame(), /Worked for \d+m \d+s ▼/)
  await host.key("\r")
  assert.match(await host.frame(), /Worked for \d+m \d+s ▶/)
  host.resumeResponse()
  await host.settled()
  const frame = await host.frame()
  assert.doesNotMatch(frame, /Worked|Copy response/)
  assert.match(frame, /Prior work/)
  assert.match(frame, /Provisional answer/)
  assert.match(frame, /Error:/)
  await host.type("Draft after correction")
  assert.match(await host.frame(), /Draft after correction/)
  await host.key("\x05")
  await host.key("\x05")
  const globallyClosed = await host.frame()
  assert.doesNotMatch(globallyClosed, /Worked|Copy response/)
  assert.match(globallyClosed, /Prior work/)
  assert.match(globallyClosed, /Provisional answer/)
  await host.reload()
  const reloaded = await host.frame()
  assert.doesNotMatch(reloaded, /Worked|Copy response/)
  assert.match(reloaded, /Prior work/)
  assert.match(reloaded, /Provisional answer/)
})

test("cancellation removes an explicitly closed activity disclosure and restores composer focus", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    providerApi: "openai-responses",
    rows: 36,
    keybindings: { "app.tools.expand": "ctrl+e" },
  })
  host.queueResponse(
    added(0, "progress", "commentary"),
    delta(0, "Prior work"),
    ended(0, "progress", "commentary", "Prior work"),
    added(1, "answer", "final_answer"),
    delta(1, "Partial answer"),
    { pause: true },
  )
  await submit(host)
  await t.waitFor(() => assert.equal(host.requests.length, 1))
  assert.match(await host.frame(), /Worked for \d+m \d+s ▶/)
  await host.key("\x1bg")
  await host.key("\r")
  await host.key("\r")
  assert.match(await host.frame(), /Worked for \d+m \d+s ▶/)
  await host.session.abort()
  const frame = await host.frame()
  assert.doesNotMatch(frame, /Worked/)
  assert.match(frame, /Prior work/)
  assert.match(frame, /Partial answer/)
  assert.match(frame, /Operation aborted/)
  await host.type("Draft after cancellation")
  assert.match(await host.frame(), /Draft after cancellation/)
  await host.key("\x05")
  await host.key("\x05")
  const globallyClosed = await host.frame()
  assert.doesNotMatch(globallyClosed, /Worked/)
  assert.match(globallyClosed, /Prior work/)
  assert.match(globallyClosed, /Partial answer/)
  assert.match(globallyClosed, /Operation aborted/)
  host.terminal.resize(65, 36)
  assert.doesNotMatch(await host.frame(), /Worked/)
  await host.reload()
  const reloaded = await host.frame()
  assert.doesNotMatch(reloaded, /Worked/)
  assert.match(reloaded, /Prior work/)
  assert.match(reloaded, /Partial answer/)
})

test("a Responses message without phase does not collapse early", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    providerApi: "openai-responses",
    rows: 36,
  })
  host.queueResponse(
    added(0, "plain"),
    delta(0, "Plain answer"),
    { pause: true },
    ended(0, "plain", undefined, "Plain answer"),
    completed,
  )
  await submit(host)
  await t.waitFor(() => assert.equal(host.requests.length, 1))
  assert.doesNotMatch(await host.frame(), /Worked/)
  host.resumeResponse()
  await host.settled()
  assert.match(await host.frame(), /Plain answer/)
})

test("reused sparse provider slots and a reasoning slot select the exact final part", async (t) => {
  const clipboard = getNativeClipboard()
  writableClipboard(clipboard)
  let copied = ""
  let pending: Promise<void> | undefined
  t.mock.method(clipboard, "setText", async (text: string) => {
    copied = text
    await pending
  })
  const remote = ["SSH_CONNECTION", "SSH_CLIENT", "MOSH_CONNECTION"]
  const saved = remote.map((name) => process.env[name])
  t.after(() =>
    remote.forEach((name, index) => {
      if (saved[index] === undefined) delete process.env[name]
      else process.env[name] = saved[index]
    }),
  )
  for (const name of remote) delete process.env[name]
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    providerApi: "openai-responses",
    rows: 36,
  })
  const thought = {
    id: "reason",
    type: "reasoning",
    summary: [{ type: "summary_text", text: "Hidden thought" }],
    content: [],
  }
  host.queueResponse(
    {
      event: {
        type: "response.output_item.added",
        output_index: 7,
        item: thought,
      },
    },
    {
      event: {
        type: "response.output_item.done",
        output_index: 7,
        item: thought,
      },
    },
    added(19, "progress", "commentary"),
    delta(19, "Prior work"),
    ended(19, "progress", "commentary", "Prior work"),
    added(19, "answer", "final_answer"),
    delta(19, "Visible answer"),
    { pause: true },
    ended(19, "answer", "final_answer", "Visible answer"),
    ended(31, "late", "commentary", "Late commentary"),
    completed,
  )
  await submit(host)
  await t.waitFor(() => assert.equal(host.requests.length, 1))
  const streaming = await host.frame()
  assert.match(streaming, /Worked for \d+m \d+s ▶/)
  assert.match(streaming, /Visible answer/)
  assert.doesNotMatch(streaming, /Prior work|Hidden thought/)
  assert.doesNotMatch(streaming, /\[Copy response\]/)
  host.resumeResponse()
  await host.settled()
  const settled = await host.frame()
  assert.match(settled, /Worked for \d+m \d+s ▶/)
  assert.match(settled, /Visible answer/)
  assert.doesNotMatch(settled, /Prior work|Late commentary|Hidden thought/)
  assert.equal((settled.match(/\[Copy response\]/g) ?? []).length, 1)
  const copy = async () => {
    await host.frame()
    const lines = host.screenLines().map(stripTerminalSequences)
    const row = lines.findIndex((line) => line.includes("[Copy response]"))
    assert(row >= 0)
    const column = lines[row]!.indexOf("[") + 1
    await host.key(`\x1b[<0;${column};${row + 1}M`)
    await host.key(`\x1b[<0;${column};${row + 1}m`)
  }
  await copy()
  await t.waitFor(() => assert.equal(copied, "Visible answer"))
  assert.match(await host.frame(), /Worked for \d+m \d+s ▶/)
  const assistant = host.session.messages.at(-1)
  assert.equal(assistant?.role, "assistant")
  assert.deepEqual(
    assistant.content.map((part) => part.type),
    ["thinking", "text", "text", "text"],
  )
  const reloading = Promise.withResolvers<void>()
  pending = reloading.promise
  await host.key("\r")
  assert.doesNotMatch(await host.frame(), /\[Copied\]/)
  await host.reload()
  reloading.resolve()
  pending = undefined
  const replay = await host.frame()
  assert.match(replay, /Worked for \d+m \d+s ▶/)
  assert.match(replay, /Visible answer/)
  assert.doesNotMatch(replay, /Prior work|Late commentary|Hidden thought/)
  assert.equal((replay.match(/\[Copy response\]/g) ?? []).length, 1)
  assert.doesNotMatch(replay, /\[Copied\]/)
  const replacing = Promise.withResolvers<void>()
  pending = replacing.promise
  await copy()
  assert.doesNotMatch(await host.frame(), /\[Copied\]/)
  await host.runtime.newSession()
  replacing.resolve()
  pending = undefined
  assert.doesNotMatch(
    await host.frame(),
    /\[Copied\]|\[Copy response\]|Visible answer/,
  )
})

test("commentary-only phase evidence prevents settled-message fallback", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    providerApi: "openai-responses",
    rows: 36,
  })
  host.queueResponse(
    added(0, "progress", "commentary"),
    delta(0, "Only commentary"),
    ended(0, "progress", "commentary", "Only commentary"),
    completed,
  )
  await submit(host)
  await host.settled()
  const frame = await host.frame()
  assert.doesNotMatch(frame, /Worked|\[Copy response\]/)
  assert.match(frame, /Only commentary/)
  await host.reload()
  assert.doesNotMatch(await host.frame(), /Worked|\[Copy response\]/)
})

test("an explicit final remains selected when the response is incomplete", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    providerApi: "openai-responses",
    rows: 36,
  })
  host.queueResponse(
    added(0, "progress", "commentary"),
    delta(0, "Prior work"),
    ended(0, "progress", "commentary", "Prior work"),
    added(1, "answer", "final_answer"),
    delta(1, "Partial answer"),
    ended(1, "answer", "final_answer", "Partial answer"),
    {
      event: {
        type: "response.incomplete",
        response: {
          id: "r1",
          status: "incomplete",
          incomplete_details: { reason: "max_output_tokens" },
        },
      },
    },
  )
  await submit(host)
  await host.settled()
  const frame = await host.frame()
  assert.match(frame, /Worked for \d+m \d+s ▶/)
  assert.match(frame, /Partial answer/)
  assert.doesNotMatch(frame, /Prior work/)
})

test("individual and configured global choices persist during a final stream and settlement", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    providerApi: "openai-responses",
    rows: 36,
    keybindings: { "app.tools.expand": "ctrl+e" },
  })
  host.queueResponse(
    added(0, "progress", "commentary"),
    delta(0, "Prior work"),
    ended(0, "progress", "commentary", "Prior work"),
    added(1, "answer", "final_answer"),
    delta(1, "Visible answer"),
    { pause: true },
    delta(1, " grows"),
    ended(1, "answer", "final_answer", "Visible answer grows"),
    completed,
  )
  await submit(host)
  await t.waitFor(() => assert.equal(host.requests.length, 1))
  assert.match(await host.frame(), /Worked for \d+m \d+s ▶/)
  const line = host.screenLines().findIndex((value) => value.includes("Worked"))
  assert(line >= 0)
  await host.key(`\x1b[<0;3;${line + 1}M`)
  await host.key(`\x1b[<0;3;${line + 1}m`)
  assert.match(await host.frame(), /Worked for \d+m \d+s ▼/)
  const selectedBg = host.ui.theme.getBgAnsi("selectedBg")
  const workRow = () =>
    host.screenLines().find((value) => value.includes("Worked")) ?? ""
  assert(!workRow().includes(selectedBg))
  assert(
    workRow().includes(
      host.ui.theme.underline(stripTerminalSequences(workRow()).trim()),
    ),
  )
  await host.key("\x05")
  await host.key("\x05")
  const globallyClosed = await host.frame()
  assert.match(globallyClosed, /Worked for \d+m \d+s ▶/)
  assert.match(globallyClosed, /Visible answer/)
  assert.doesNotMatch(globallyClosed, /Prior work/)
  await host.key("\x05")
  assert.match(await host.frame(), /Worked for \d+m \d+s ▼/)
  host.resumeResponse()
  await host.settled()
  const settled = await host.frame()
  assert.match(settled, /Worked for \d+m \d+s ▼/)
  assert(!workRow().includes(selectedBg))
  assert(
    workRow().includes(
      host.ui.theme.underline(stripTerminalSequences(workRow()).trim()),
    ),
  )
  assert.match(settled, /Prior work/)
  assert.match(settled, /Visible answer grows/)
})

for (const expanded of [false, true])
  test(`requalification restores an explicitly ${expanded ? "open" : "closed"} parent without changing descendant choices`, async (t) => {
    const host = await openNativeHost(t, {
      extensionPaths: [chat],
      providerApi: "openai-responses",
      rows: 44,
      keybindings: { "app.tools.expand": "ctrl+e" },
    })
    await writeFile(join(host.directory, "one.txt"), "RETAINED NATIVE BODY")
    await writeFile(join(host.directory, "two.txt"), "SECOND NATIVE BODY")
    const calls = ["one.txt", "two.txt"].map((path, index) => ({
      type: "function_call",
      id: `fc_read_${index}`,
      call_id: `read-${index}`,
      name: "read",
      arguments: JSON.stringify({ path }),
    }))
    host.queueResponse(
      added(0, "progress", "commentary"),
      delta(0, "Earlier commentary"),
      ended(0, "progress", "commentary", "Earlier commentary"),
      ...calls.flatMap((call, index) => [
        {
          event: {
            type: "response.output_item.added",
            output_index: index + 1,
            item: call,
          },
        },
        {
          event: {
            type: "response.output_item.done",
            output_index: index + 1,
            item: call,
          },
        },
      ]),
      completed,
    )
    host.queueResponse(
      added(0, "provisional", "final_answer"),
      { pause: true },
      delta(0, "Provisional answer"),
      { pause: true },
      ended(0, "provisional", "commentary", "Provisional answer"),
      { pause: true },
      added(1, "answer", "final_answer"),
      delta(1, "Final answer"),
      { pause: true },
      ended(1, "answer", "final_answer", "Final answer"),
      completed,
    )
    await submit(host)
    await t.waitFor(() => assert.equal(host.requests.length, 2))
    assert.doesNotMatch(await host.frame(), /Worked/)
    await host.key("\x05")
    assert.match(await host.frame(), /RETAINED NATIVE BODY/)
    host.resumeResponse()
    await t.waitFor(async () =>
      assert.match(await host.frame(), /Worked for \d+m \d+s ▶/),
    )
    await host.key("\x1bg")
    await host.key("\r")
    assert.match(await host.frame(), /RETAINED NATIVE BODY/)
    if (!expanded) await host.key("\r")
    host.resumeResponse()
    await t.waitFor(async () => {
      const revoked = await host.frame()
      assert.doesNotMatch(revoked, /Worked/)
      assert.match(revoked, /Earlier commentary/)
      assert.match(revoked, /Provisional answer/)
      assert.match(revoked, /RETAINED NATIVE BODY/)
    })
    await host.key("\x05")
    const closedChildren = await host.frame()
    assert.doesNotMatch(closedChildren, /Worked|RETAINED NATIVE BODY/)
    assert.match(closedChildren, /> Read files/)
    if (!expanded) {
      await host.key("\x05")
      assert.match(await host.frame(), /RETAINED NATIVE BODY/)
    }
    host.resumeResponse()
    const preferred = expanded
      ? /Worked for \d+m \d+s ▼/
      : /Worked for \d+m \d+s ▶/
    await t.waitFor(async () => assert.match(await host.frame(), preferred))
    host.resumeResponse()
    await host.settled()
    const settled = await host.frame()
    assert.match(settled, preferred)
    assert.match(settled, /Final answer/)
    assert.doesNotMatch(settled, /RETAINED NATIVE BODY/)
    if (expanded) {
      assert.match(settled, /Earlier commentary/)
      assert.match(settled, /> Read files/)
    } else {
      assert.doesNotMatch(settled, /Earlier commentary|Provisional answer/)
      await host.key("\x1bg")
      await host.key("\r")
      assert.match(await host.frame(), /RETAINED NATIVE BODY/)
    }
    const canonical = JSON.stringify(host.session.messages)
    assert.match(canonical, /Earlier commentary/)
    assert.match(canonical, /RETAINED NATIVE BODY/)
    assert.match(canonical, /Provisional answer/)
    assert.doesNotMatch(canonical, /Worked/)
    await host.reload()
    assert.match(await host.frame(), /Worked for \d+m \d+s ▶/)
  })

test("Find during final revocation replaces a dormant closure and permits later manual closure", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    providerApi: "openai-responses",
    rows: 36,
    keybindings: { "tui.altScreen.search": "ctrl+f" },
  })
  host.queueResponse(
    added(0, "progress", "commentary"),
    delta(0, "Searched telescope"),
    ended(0, "progress", "commentary", "Searched telescope"),
    added(1, "provisional", "final_answer"),
    delta(1, "Provisional answer"),
    { pause: true },
    ended(1, "provisional", "commentary", "Provisional answer"),
    { pause: true },
    added(2, "answer", "final_answer"),
    delta(2, "Visible answer"),
    { pause: true },
    delta(2, " grows"),
    ended(2, "answer", "final_answer", "Visible answer grows"),
    completed,
  )
  await submit(host)
  await t.waitFor(() => assert.equal(host.requests.length, 1))
  assert.match(await host.frame(), /Worked for \d+m \d+s ▶/)
  await host.key("\x1bg")
  await host.key("\r")
  await host.key("\r")
  host.resumeResponse()
  await t.waitFor(async () => {
    const corrected = await host.frame()
    assert.doesNotMatch(corrected, /Worked/)
    assert.match(corrected, /Searched telescope/)
    assert.match(corrected, /Provisional answer/)
  })
  await host.key("\x06")
  await host.type("telescope")
  assert.match(await host.frame(), /1\/1/)
  await host.key("\x1b")
  host.resumeResponse()
  await t.waitFor(async () => {
    const requalified = await host.frame()
    assert.match(requalified, /Worked for \d+m \d+s ▼/)
    assert.match(requalified, /Searched telescope/)
    assert.match(requalified, /Visible answer/)
  })
  await host.key("\x1bg")
  await host.key("\r")
  assert.match(await host.frame(), /Worked for \d+m \d+s ▶/)
  host.resumeResponse()
  await host.settled()
  const settled = await host.frame()
  assert.match(settled, /Worked for \d+m \d+s ▶/)
  assert.doesNotMatch(settled, /Searched telescope|Provisional answer/)
  assert.match(settled, /Visible answer grows/)
})

test("an exactly completed blank final collapses prior activity and preserves native errors on replay", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    providerApi: "openai-responses",
    rows: 36,
  })
  host.queueResponse(
    added(0, "progress", "commentary"),
    delta(0, "Prior work"),
    ended(0, "progress", "commentary", "Prior work"),
    added(6, "blank", "final_answer"),
    { pause: true },
    {
      event: {
        type: "response.output_item.done",
        output_index: 6,
        item: { ...message("blank", "final_answer"), status: "completed" },
      },
    },
    { pause: true },
    failed,
  )
  await submit(host)
  await t.waitFor(() => assert.equal(host.requests.length, 1))
  const unfinished = await host.frame()
  assert.doesNotMatch(unfinished, /Worked/)
  assert.match(unfinished, /Prior work/)
  host.resumeResponse()
  await t.waitFor(async () => {
    const streaming = await host.frame()
    assert.match(streaming, /Worked for \d+m \d+s ▶/)
    assert.doesNotMatch(streaming, /Prior work/)
  })
  host.resumeResponse()
  await host.settled()
  const settled = await host.frame()
  assert.match(settled, /Worked for \d+m \d+s ▶/)
  assert.match(settled, /Error:.*Controlled failure/)
  assert.doesNotMatch(settled, /Prior work/)
  const assistant = host.session.messages.at(-1)
  assert.equal(assistant?.role, "assistant")
  assert.deepEqual(
    assistant.content.map((part) => (part.type === "text" ? part.text : "")),
    ["Prior work", ""],
  )
  await host.reload()
  const replayed = await host.frame()
  assert.match(replayed, /Worked for \d+m \d+s ▶/)
  assert.match(replayed, /Error:.*Controlled failure/)
  assert.doesNotMatch(replayed, /Prior work/)
})

test("phase-only blank history leaves activity visible without settled qualification evidence", async (t) => {
  const source = await openNativeHost(t, {
    providerApi: "openai-responses",
    persistSession: true,
    rows: 32,
  })
  source.queueResponse(
    added(0, "progress", "commentary"),
    delta(0, "Uncertain earlier work"),
    ended(0, "progress", "commentary", "Uncertain earlier work"),
    added(1, "blank", "final_answer"),
    {
      event: {
        type: "response.output_item.done",
        output_index: 1,
        item: { ...message("blank", "final_answer"), status: "completed" },
      },
    },
    completed,
  )
  await submit(source)
  await source.settled()
  const manager = source.session.sessionManager
  const branch = manager.getBranch()
  const request = branch.find(
    (entry) => entry.type === "message" && entry.message.role === "user",
  )
  const assistant = branch.find(
    (entry) => entry.type === "message" && entry.message.role === "assistant",
  )
  assert(request && assistant)
  for (const fact of [
    {
      kind: "member",
      sourceId: request.id,
      delivery: "initial",
    },
    { kind: "member", sourceId: assistant.id },
    {
      kind: "phase",
      sourceId: assistant.id,
      contentIndex: 1,
      phase: "final_answer",
    },
  ])
    manager.appendCustomEntry("pi-chat.relationship", {
      version: 1,
      requestId: request.id,
      ...fact,
    })
  const sessionFile = source.session.sessionFile
  assert(sessionFile)
  await source.close()
  const restored = await openNativeHost(t, {
    extensionPaths: [chat],
    sessionFile,
    directory: source.directory,
    rows: 32,
    keybindings: { "app.tools.expand": "ctrl+e" },
  })
  const frame = await restored.frame()
  assert.doesNotMatch(frame, /Worked/)
  assert.match(frame, /Uncertain earlier work/)
  await restored.key("\x05")
  await restored.key("\x05")
  const globallyClosed = await restored.frame()
  assert.doesNotMatch(globallyClosed, /Worked/)
  assert.match(globallyClosed, /Uncertain earlier work/)
})

test("a completed blank final cannot collapse across an unidentified native boundary", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    providerApi: "openai-responses",
    rows: 38,
  })
  await writeFile(join(host.directory, "one.txt"), "Native result")
  const call = {
    type: "function_call",
    id: "fc_read",
    call_id: "read-one",
    name: "read",
    arguments: JSON.stringify({ path: "one.txt" }),
  }
  host.queueResponse(
    added(0, "progress", "commentary"),
    delta(0, "Work before unidentified notice"),
    ended(0, "progress", "commentary", "Work before unidentified notice"),
    {
      event: {
        type: "response.output_item.added",
        output_index: 1,
        item: call,
      },
    },
    {
      event: {
        type: "response.output_item.done",
        output_index: 1,
        item: call,
      },
    },
    completed,
  )
  host.queueResponse(
    { pause: true },
    added(0, "blank", "final_answer"),
    {
      event: {
        type: "response.output_item.done",
        output_index: 0,
        item: { ...message("blank", "final_answer"), status: "completed" },
      },
    },
    failed,
  )
  await submit(host)
  await t.waitFor(() => assert.equal(host.requests.length, 2))
  host.ui.notify("Boundary without a session occurrence", "warning")
  host.resumeResponse()
  await host.settled()
  const frame = await host.frame()
  assert.doesNotMatch(frame, /Worked/)
  assert.match(
    frame,
    /Work before unidentified notice[\s\S]*Boundary without a session occurrence[\s\S]*Error:[\s\S]*\/bug sends a report/,
  )
  assert.doesNotMatch(
    JSON.stringify(host.session.messages),
    /Boundary without a session occurrence|Worked/,
  )
})

test("a blank replacement revokes a provisional final", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    providerApi: "openai-responses",
    rows: 36,
  })
  host.queueResponse(
    added(0, "progress", "commentary"),
    delta(0, "Prior work"),
    ended(0, "progress", "commentary", "Prior work"),
    added(1, "answer", "final_answer"),
    delta(1, "Temporary answer"),
    { pause: true },
    ended(1, "answer", "final_answer", ""),
    failed,
  )
  await submit(host)
  await t.waitFor(() => assert.equal(host.requests.length, 1))
  assert.match(await host.frame(), /Worked for \d+m \d+s ▶/)
  host.resumeResponse()
  await host.settled()
  const frame = await host.frame()
  assert.doesNotMatch(frame, /Worked|Temporary answer|Copy response/)
  assert.match(frame, /Prior work/)
})

test("native message replacement cannot select a reordered commentary part as final", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    providerApi: "openai-responses",
    rows: 36,
    extensionFactories: [
      (pi) => {
        pi.on("message_end", ({ message: assistant }) => {
          if (assistant.role !== "assistant") return
          return {
            message: { ...assistant, content: assistant.content.toReversed() },
          }
        })
      },
    ],
  })
  host.queueResponse(
    added(0, "progress", "commentary"),
    delta(0, "Prior work"),
    ended(0, "progress", "commentary", "Prior work"),
    added(1, "answer", "final_answer"),
    delta(1, "Visible answer"),
    ended(1, "answer", "final_answer", "Visible answer"),
    { pause: true },
    completed,
  )
  await submit(host)
  await t.waitFor(() => assert.equal(host.requests.length, 1))
  assert.match(await host.frame(), /Worked for \d+m \d+s ▶/)
  host.resumeResponse()
  await host.settled()
  const frame = await host.frame()
  assert.doesNotMatch(frame, /Worked/)
  assert.match(frame, /Visible answer/)
  assert.match(frame, /Prior work/)
  const facts = host.session.sessionManager
    .getEntries()
    .filter(
      (entry) =>
        entry.type === "custom" && entry.customType === "pi-chat.relationship",
    )
  assert.doesNotMatch(
    JSON.stringify(facts),
    /"finalParts":|"phase":"final_answer"/,
  )
  await host.reload()
  const replay = await host.frame()
  assert.doesNotMatch(replay, /Worked/)
  assert.match(replay, /Visible answer|Prior work/)
})

test("a new same-text block without native signature cannot inherit final phase", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    providerApi: "openai-responses",
    rows: 36,
    extensionFactories: [
      (pi) => {
        pi.on("message_end", ({ message: assistant }) => {
          if (assistant.role !== "assistant") return
          return {
            message: {
              ...assistant,
              content: [
                assistant.content[0]!,
                { type: "text", text: "Visible answer" },
              ],
            },
          }
        })
      },
    ],
  })
  host.queueResponse(
    added(0, "progress", "commentary"),
    delta(0, "Prior work"),
    ended(0, "progress", "commentary", "Prior work"),
    added(1, "answer", "final_answer"),
    delta(1, "Visible answer"),
    ended(1, "answer", "final_answer", "Visible answer"),
    { pause: true },
    completed,
  )
  await submit(host)
  await t.waitFor(() => assert.equal(host.requests.length, 1))
  assert.match(await host.frame(), /Worked for \d+m \d+s ▶/)
  host.resumeResponse()
  await host.settled()
  const frame = await host.frame()
  assert.doesNotMatch(frame, /Worked/)
  assert.match(frame, /Prior work/)
  assert.match(frame, /Visible answer/)
  const facts = host.session.sessionManager
    .getEntries()
    .filter(
      (entry) =>
        entry.type === "custom" && entry.customType === "pi-chat.relationship",
    )
  assert.doesNotMatch(
    JSON.stringify(facts),
    /"finalParts":|"phase":"final_answer"/,
  )
  await host.reload()
  assert.doesNotMatch(await host.frame(), /Worked/)
})

test("an agent retry discards stale phase evidence and retains the enclosing choice", async (t) => {
  let turns = 0
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    providerApi: "openai-responses",
    rows: 36,
    settings: {
      retry: {
        enabled: true,
        maxRetries: 1,
        baseDelayMs: 1,
        provider: { maxRetries: 0 },
      },
    },
    extensionFactories: [
      (pi) => {
        pi.on("turn_start", () => {
          turns++
        })
      },
    ],
  })
  host.queueResponse(
    added(0, "progress", "commentary"),
    delta(0, "Retry progress"),
    ended(0, "progress", "commentary", "Retry progress"),
    added(1, "failed", "final_answer"),
    delta(1, "Failed candidate"),
    { pause: true },
    {
      event: {
        type: "response.failed",
        response: {
          status: "failed",
          error: { code: "503", message: "server error" },
        },
      },
    },
  )
  host.queueResponse(
    added(0, "retry"),
    delta(0, "Retry answer"),
    { pause: true },
    ended(0, "retry", undefined, "Retry answer"),
    completed,
  )
  await submit(host)
  await t.waitFor(() => assert.equal(host.requests.length, 1))
  assert.match(await host.frame(), /Worked for \d+m \d+s ▶/)
  await host.key("\x1bg")
  await host.key("\r")
  assert.match(await host.frame(), /Worked for \d+m \d+s ▼/)
  host.resumeResponse()
  await t.waitFor(() => assert.equal(host.requests.length, 2))
  const retrying = await host.frame()
  assert.doesNotMatch(retrying, /Worked/)
  assert.match(retrying, /Retry progress/)
  assert.match(retrying, /Failed candidate/)
  assert.match(retrying, /Retry answer/)
  host.resumeResponse()
  await host.settled()
  assert.equal(turns, 2)
  const frame = await host.frame()
  assert.match(frame, /Worked for \d+m \d+s ▼/)
  assert.match(frame, /Retry answer/)
  assert.match(frame, /Failed candidate/)
  assert.match(frame, /Retry progress/)
})
