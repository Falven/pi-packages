import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import { ModelRuntime } from "@earendil-works/pi-coding-agent"
import { openNativeHost } from "../../../fixtures/native-host.ts"

const chat = new URL("../src/index.ts", import.meta.url).pathname

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
  assert.match(streaming, /▸ Worked/)
  assert.equal((streaming.match(/Done/g) ?? []).length, 1)
  assert.match(JSON.stringify(host.requests[0]), /Do the work/)
  assert.doesNotMatch(JSON.stringify(host.requests[0]), /Worked/)

  host.resumeResponse()
  await host.settled()
  const settled = await host.frame()
  assert.match(settled, /▸ Worked/)
  assert.equal((settled.match(/Done/g) ?? []).length, 1)
  const assistant = host.session.messages.at(-1)
  assert.equal(assistant?.role, "assistant")
  assert.deepEqual(
    assistant.content.map((part) => (part.type === "text" ? part.text : "")),
    ["Done", "Done"],
  )
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
  assert.match(streaming, /▸ Worked/)
  assert.match(streaming, /Visible answer/)
  assert.doesNotMatch(streaming, /Prior work/)
  host.resumeResponse()
  await host.settled()
  assert.match(await host.frame(), /▸ Worked/)
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
  assert.match(await host.frame(), /▸ Worked/)
  host.resumeResponse()
  await host.settled()
  const frame = await host.frame()
  assert.match(frame, /▸ Worked/)
  assert.match(frame, /Partial answer/)
  assert.match(frame, /Error:/)
  assert.doesNotMatch(frame, /Prior work/)
  await host.reload()
  const replay = await host.frame()
  assert.match(replay, /▸ Worked/)
  assert.match(replay, /Partial answer/)
  assert.match(replay, /Error:/)
  assert.doesNotMatch(replay, /Prior work/)
})

test("an explicit phase correction disqualifies the selected final", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    providerApi: "openai-responses",
    rows: 36,
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
  assert.match(await host.frame(), /▸ Worked/)
  host.resumeResponse()
  await host.settled()
  const frame = await host.frame()
  assert.doesNotMatch(frame, /Worked/)
  assert.match(frame, /Prior work/)
  assert.match(frame, /Provisional answer/)
  await host.reload()
  assert.doesNotMatch(await host.frame(), /Worked/)
})

test("cancellation opens work despite an explicit streaming final", async (t) => {
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
    { pause: true },
  )
  await submit(host)
  await t.waitFor(() => assert.equal(host.requests.length, 1))
  assert.match(await host.frame(), /▸ Worked/)
  await host.session.abort()
  const frame = await host.frame()
  assert.match(frame, /▾ Worked/)
  assert.match(frame, /Prior work/)
  assert.match(frame, /Partial answer/)
  assert.match(frame, /Operation aborted/)
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
  assert.match(streaming, /▸ Worked/)
  assert.match(streaming, /Visible answer/)
  assert.doesNotMatch(streaming, /Prior work|Hidden thought/)
  host.resumeResponse()
  await host.settled()
  const settled = await host.frame()
  assert.match(settled, /▸ Worked/)
  assert.match(settled, /Visible answer/)
  assert.doesNotMatch(settled, /Prior work|Late commentary|Hidden thought/)
  const assistant = host.session.messages.at(-1)
  assert.equal(assistant?.role, "assistant")
  assert.deepEqual(
    assistant.content.map((part) => part.type),
    ["thinking", "text", "text", "text"],
  )
  await host.reload()
  const replay = await host.frame()
  assert.match(replay, /▸ Worked/)
  assert.match(replay, /Visible answer/)
  assert.doesNotMatch(replay, /Prior work|Late commentary|Hidden thought/)
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
  assert.doesNotMatch(frame, /Worked/)
  assert.match(frame, /Only commentary/)
  await host.reload()
  assert.doesNotMatch(await host.frame(), /Worked/)
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
  assert.match(frame, /▸ Worked/)
  assert.match(frame, /Partial answer/)
  assert.doesNotMatch(frame, /Prior work/)
})

test("opening work during a final stream stays open after settlement", async (t) => {
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
    delta(1, "Visible answer"),
    { pause: true },
    ended(1, "answer", "final_answer", "Visible answer"),
    completed,
  )
  await submit(host)
  await t.waitFor(() => assert.equal(host.requests.length, 1))
  assert.match(await host.frame(), /▸ Worked/)
  const line = host.screenLines().findIndex((value) => value.includes("Worked"))
  assert(line >= 0)
  await host.key(`\x1b[<0;3;${line + 1}M`)
  await host.key(`\x1b[<0;3;${line + 1}m`)
  assert.match(await host.frame(), /▾ Worked/)
  const selectedBg = host.ui.theme.getBgAnsi("selectedBg")
  const workRow = () =>
    host.screenLines().find((value) => value.includes("Worked")) ?? ""
  assert(workRow().includes(selectedBg))
  host.resumeResponse()
  await host.settled()
  const settled = await host.frame()
  assert.match(settled, /▾ Worked/)
  assert(workRow().includes(selectedBg))
  assert.match(settled, /Prior work/)
  assert.match(settled, /Visible answer/)
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
  assert.match(await host.frame(), /▸ Worked/)
  host.resumeResponse()
  await host.settled()
  const frame = await host.frame()
  assert.doesNotMatch(frame, /Worked|Temporary answer/)
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
  assert.match(await host.frame(), /▸ Worked/)
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
  assert.match(await host.frame(), /▸ Worked/)
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

test("an agent retry starts a fresh provider phase index", async (t) => {
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
    added(0, "failed", "final_answer"),
    delta(0, "Failed candidate"),
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
    ended(0, "retry", undefined, "Retry answer"),
    completed,
  )
  await submit(host)
  await t.waitFor(() => assert.equal(host.requests.length, 2))
  await host.settled()
  assert.equal(turns, 2)
  const frame = await host.frame()
  assert.match(frame, /▸ Worked/)
  assert.match(frame, /Retry answer/)
  assert.doesNotMatch(frame, /Failed candidate/)
})
