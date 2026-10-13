import assert from "node:assert/strict"
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import { createReadToolDefinition } from "@earendil-works/pi-coding-agent"
import {
  getCapabilities,
  getNativeClipboard,
  setCapabilities,
  stripTerminalSequences,
  Text,
  type NativeClipboard,
} from "@earendil-works/pi-tui"
import { openNativeHost } from "../../../fixtures/native-host.ts"

/* oxlint-disable eslint/no-control-regex -- Assert Pi's native Kitty image sequences. */

const chat = new URL("../src/index.ts", import.meta.url).pathname
const composer = new URL("../../pi-composer/src/index.ts", import.meta.url)
  .pathname
const attachments = new URL(
  "../../pi-attachments/src/index.ts",
  import.meta.url,
).pathname
const skills = new URL(
  "../../pi-skill-references/src/index.ts",
  import.meta.url,
).pathname
const acceptance = new URL(
  "../../pi-composer/fixtures/mixed-acceptance.ts",
  import.meta.url,
).pathname
const png =
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAADUlEQVR4nGP4zwAE/wEHAAH/4iOeWQAAAABJRU5ErkJggg=="
const call = {
  event: {
    choices: [
      {
        index: 0,
        delta: {
          role: "assistant",
          tool_calls: [
            {
              index: 0,
              id: "image-call",
              type: "function",
              function: { name: "read", arguments: '{"path":"image"}' },
            },
          ],
        },
        finish_reason: null,
      },
    ],
  },
}
const finish = (reason = "stop") => ({
  event: { choices: [{ index: 0, delta: {}, finish_reason: reason }] },
})
const done = { event: "[DONE]" }
const responseMessage = (
  id: string,
  phase: "commentary" | "final_answer",
  text = "",
) => ({
  id,
  type: "message",
  role: "assistant",
  status: text ? "completed" : "in_progress",
  phase,
  content: text ? [{ type: "output_text", text, annotations: [] }] : [],
})
const started = (
  index: number,
  id: string,
  phase: "commentary" | "final_answer",
) => ({
  event: {
    type: "response.output_item.added",
    output_index: index,
    item: responseMessage(id, phase),
  },
})
const textDelta = (index: number, text: string) => ({
  event: {
    type: "response.output_text.delta",
    output_index: index,
    content_index: 0,
    delta: text,
  },
})
const ended = (
  index: number,
  id: string,
  phase: "commentary" | "final_answer",
  text: string,
) => ({
  event: {
    type: "response.output_item.done",
    output_index: index,
    item: responseMessage(id, phase, text),
  },
})
const completed = {
  event: { type: "response.completed", response: { status: "completed" } },
}
const completion = (delta: Record<string, unknown>) => ({
  event: {
    choices: [
      { index: 0, delta: { role: "assistant", ...delta }, finish_reason: null },
    ],
  },
})
const toolCalls = (paths: string[], names: string[]) =>
  paths.map((path, index) => ({
    index,
    id: `mixed-${path}`,
    type: "function",
    function: { name: names[index], arguments: JSON.stringify({ path }) },
  }))

async function skillCatalog(t: Parameters<typeof openNativeHost>[0]) {
  const directory = await mkdtemp(join(tmpdir(), "pi-chat-mixed-skill-"))
  t.after(() => rm(directory, { recursive: true, force: true }))
  await mkdir(join(directory, "review"))
  await writeFile(
    join(directory, "review", "SKILL.md"),
    "---\nname: review\ndescription: Review mixed requests\n---\nReview the mixed request exactly once.\n",
  )
  return directory
}

function writableClipboard(
  clipboard: NativeClipboard | undefined,
): asserts clipboard is NativeClipboard &
  Required<Pick<NativeClipboard, "setText">> {
  assert(clipboard?.setText)
}

for (const [name, paths] of [
  ["chat first", [chat, composer, skills, attachments, acceptance]],
  ["chat last", [composer, attachments, skills, acceptance, chat]],
] as const) {
  test(`mixed ${name} session keeps the draft, native dock, and streaming final`, async (t) => {
    const host = await openNativeHost(t, {
      extensionPaths: [...paths],
      skillPaths: [await skillCatalog(t)],
      providerApi: "openai-responses",
      persistSession: true,
      rows: 44,
      keybindings: { "tui.altScreen.search": "ctrl+f" },
    })
    const image = join(host.directory, "diagram.png")
    await writeFile(image, Buffer.from(png, "base64"))
    await host.type(`/attach-file ${image}`)
    await host.key("\r")
    await t.waitFor(() => assert.match(host.ui.getEditorText(), /diagram\.png/))
    const reference = host.ui.getEditorText().trim()
    host.ui.setEditorText(`**Review** /skill:review\n${reference}`)
    host.queueResponse(
      started(0, "progress", "commentary"),
      textDelta(0, "Mixed progress"),
      ended(0, "progress", "commentary", "Mixed progress"),
      started(4, "final", "final_answer"),
      textDelta(4, "Mixed answer"),
      { pause: true },
      ended(4, "final", "final_answer", "Mixed answer"),
      completed,
    )
    await host.key("\r")
    await t.waitFor(() => assert.equal(host.requests.length, 1))
    const streaming = await host.frame()
    assert.match(streaming, /Worked for \d+m \d+s ▸/)
    assert.match(streaming, /Mixed answer/)
    assert.doesNotMatch(streaming, /Mixed progress/)
    assert.match(streaming, /Mixed acceptance fixture ready/)
    const request = JSON.stringify(host.requests[0])
    assert.equal(request.match(/<skill name=\\?"review/g)?.length, 1)
    assert.match(request, /Review the mixed request exactly once/)
    assert.match(request, /iVBORw0KGgo/)
    assert.doesNotMatch(request, /Worked|Mixed progress|Mixed answer/)
    host.resumeResponse()
    await host.settled()
    assert.match(await host.frame(), /Mixed answer/)
    assert.match(JSON.stringify(host.session.messages), /diagram\.png/)
    await host.key("\x1b[112;7u")
    assert.match(await host.frame(), /Review mixed request/)
    await host.key("\x1b")
    await host.type("x")
    assert.equal(host.ui.getEditorText(), "x")
    const file = host.session.sessionFile!
    await host.reload()
    assert.match(await host.frame(), /Mixed answer/)
    assert.equal(host.ui.getEditorText(), "x")
    assert.equal(host.ui.setTheme("light").success, true)
    assert.match(await host.frame(), /Mixed acceptance fixture ready/)
    host.session.sessionManager.appendCompaction(
      "Compressed mixed session",
      null,
      100,
    )
    await host.runtime.newSession()
    await host.runtime.switchSession(file)
    assert.doesNotMatch(await host.frame(), /Mixed progress/)
    await host.key("\x06")
    await host.type("Mixed progress")
    assert.match(await host.frame(), /1\/1/)
    assert.match(
      host.screenLines().map(stripTerminalSequences).join("\n"),
      /Mixed progress/,
    )
    await host.key("\x1b")
    assert.equal(host.switchMode("regular"), true)
    await host.frame()
    assert.equal(host.switchMode("fullscreen"), true)
    assert.match(await host.frame(), /Mixed progress/)
    assert.equal(host.requests.length, 1)
  })
}

test("mixed live work keeps native and custom tools, queued requests, search, and copy operable", async (t) => {
  const clipboard = getNativeClipboard()
  writableClipboard(clipboard)
  let copied = ""
  t.mock.method(clipboard, "setText", async (text: string) => {
    copied = text
  })
  const catalog = await skillCatalog(t)
  const host = await openNativeHost(t, {
    extensionPaths: [composer, attachments, skills, acceptance, chat],
    skillPaths: [catalog],
    rows: 52,
    settings: {
      fullscreenCopyOnSelect: false,
      retry: {
        enabled: true,
        maxRetries: 1,
        baseDelayMs: 1,
        provider: { maxRetries: 0 },
      },
    },
    keybindings: { "tui.altScreen.search": "ctrl+f" },
    extensionFactories: [
      (pi) => {
        pi.registerTool({
          ...createReadToolDefinition("."),
          name: "mystery",
          label: "Mystery",
          renderCall: () => new Text("CUSTOM CALL", 0, 0),
          renderResult: () => new Text("CUSTOM RESULT", 0, 0),
        })
        pi.registerMarkdownTransformer((markdown, context) =>
          context.messageType === "assistant"
            ? markdown.replaceAll("Recovered answer", "Shown answer")
            : markdown,
        )
      },
    ],
  })
  await writeFile(join(host.directory, "one.txt"), "native result")
  await writeFile(join(host.directory, "two.txt"), "hidden telescope")
  await writeFile(join(host.directory, "three.txt"), "later result")
  host.queueResponse(
    completion({
      reasoning_content: "Mixed thought preview",
      content: "Before steering",
      tool_calls: toolCalls(
        [join(catalog, "review", "SKILL.md"), "one.txt", "two.txt"],
        ["read", "read", "mystery"],
      ),
    }),
    { pause: true },
    finish("tool_calls"),
    done,
  )
  host.queueResponse(
    completion({
      content: "After steering",
      tool_calls: toolCalls(["three.txt"], ["read"]),
    }),
    finish("tool_calls"),
    done,
  )
  host.queueResponse(completion({ content: "First answer" }), finish(), done)
  host.queueResponse(
    completion({
      content: "Followup work",
      tool_calls: toolCalls(["one.txt"], ["read"]),
    }),
    finish("tool_calls"),
    done,
  )
  host.queueResponse(completion({ content: "Second answer" }), finish(), done)
  host.ui.setEditorText("Review /skill:review")
  await host.key("\r")
  await t.waitFor(() => assert.equal(host.requests.length, 1))
  assert.match(await host.frame(), /Mixed thought preview/)
  await host.session.steer("Same queued text")
  await host.session.followUp("Same queued text")
  host.resumeResponse()
  await host.settled()
  const frame = await host.frame()
  assert.equal(host.requests.length, 5)
  assert.match(frame, /First answer/)
  assert.match(frame, /Second answer/)
  assert.equal((frame.match(/Worked for \d+m \d+s ▸/g) ?? []).length, 2)
  assert.equal((frame.match(/Same queued text/g) ?? []).length, 2)
  assert.doesNotMatch(frame, /Before steering|After steering|Followup work/)
  assert.equal(
    (JSON.stringify(host.requests[0]).match(/<skill name=\\?"review/g) ?? [])
      .length,
    1,
  )

  const row = host
    .screenLines()
    .findIndex((line) =>
      /Worked for \d+m \d+s ▸/.test(stripTerminalSequences(line)),
    )
  assert(row >= 0)
  await host.key(`\x1b[<0;2;${row + 1}M`)
  await host.key(`\x1b[<0;2;${row + 1}m`)
  await host.frame()
  assert.match(await host.frame(), /Mixed thought preview/)
  const groupRow = host
    .screenLines()
    .findIndex((line) =>
      stripTerminalSequences(line).includes(
        "Loaded a tool, called a tool, read files",
      ),
    )
  assert(groupRow >= 0)
  await host.key(`\x1b[<0;2;${groupRow + 1}M`)
  await host.key(`\x1b[<0;2;${groupRow + 1}m`)
  await host.key("\x1bg")
  const expanded = await host.frame()
  assert.match(expanded, /CUSTOM CALL/)
  assert.match(expanded, /CUSTOM RESULT/)
  assert.match(expanded, /read one\.txt/)
  const nativeRow = host
    .screenLines()
    .findIndex((line) => stripTerminalSequences(line).includes("read one.txt"))
  assert(nativeRow >= 0)
  await host.key(`\x1b[<0;2;${nativeRow + 1}M`)
  await host.key(`\x1b[<0;2;${nativeRow + 1}m`)
  assert.match(await host.frame(), /native result/)

  await host.key("\x06")
  await host.type("hidden telescope")
  assert.match(await host.frame(), /1\/1/)
  assert.match(
    host.screenLines().map(stripTerminalSequences).join("\n"),
    /CUSTOM CALL/,
  )
  await host.key("\x1b")
  await host.frame()
  const answerRow = host
    .screenLines()
    .findIndex((line) => stripTerminalSequences(line).includes("First answer"))
  assert(answerRow >= 0)
  await host.key(`\x1b[<0;2;${answerRow + 1}M`)
  await host.key(`\x1b[<32;14;${answerRow + 1}M`)
  await host.key(`\x1b[<0;14;${answerRow + 1}m`)
  await host.key("\x18")
  await t.waitFor(() => assert.match(copied, /First answer/))

  await host.key("\x1b")
  host.queueResponse(
    completion({ content: "Partial interrupted" }),
    { pause: true },
    finish(),
    done,
  )
  host.ui.setEditorText("Interrupt this request")
  await host.key("\r")
  await t.waitFor(() => assert.equal(host.requests.length, 6))
  assert.match(await host.frame(), /Partial interrupted/)
  await host.session.abort()
  assert.match(await host.frame(), /Operation aborted/)

  host.queueResponse({ status: 503 })
  host.queueResponse(
    completion({ content: "Recovered answer" }),
    finish(),
    done,
  )
  host.ui.setEditorText("Retry this request")
  await host.key("\r")
  await t.waitFor(() => assert.equal(host.requests.length, 8))
  await host.settled()
  assert.match(await host.frame(), /Shown answer/)
  assert.match(JSON.stringify(host.session.messages.at(-1)), /Recovered answer/)
})

test("revealed retained tool images follow native image settings", async (t) => {
  const capabilities = getCapabilities()
  setCapabilities({ ...capabilities, images: "kitty" })
  t.after(() => setCapabilities(capabilities))
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    persistSession: true,
    columns: 100,
    rows: 42,
    keybindings: { "tui.altScreen.search": "ctrl+f" },
    extensionFactories: [
      (pi) =>
        pi.registerTool({
          ...createReadToolDefinition("."),
          execute: async () => ({
            content: [
              { type: "text", text: "image-needle" },
              { type: "image", data: png, mimeType: "image/png" },
            ],
            details: {},
          }),
        }),
    ],
  })
  host.queueResponse(call, finish("tool_calls"), done)
  host.queueResponse(
    {
      event: {
        choices: [
          { index: 0, delta: { content: "Done" }, finish_reason: null },
        ],
      },
    },
    finish(),
    done,
  )
  await host.type("Read the image")
  await host.key("\r")
  await host.settled()
  const file = host.session.sessionFile!
  host.session.sessionManager.appendCompaction("Compressed context", null, 100)
  await host.runtime.newSession()
  await host.runtime.switchSession(file)
  await host.key("\x06")
  await host.type("image-needle")
  assert.match(await host.frame(), /1\/1/)
  assert.match(host.screenLines().join("\n"), /\x1b_G[^;]*c=60/)
  await host.key("\x1b")

  await host.type("/settings")
  await host.key("\r")
  assert.match(await host.frame(), /Show images/)
  await host.key("\x1b[B")
  await host.key("\r")
  await host.key("\x1b")
  const hidden = host.screenLines().map(stripTerminalSequences).join("\n")
  assert.match(hidden, /image-needle/)
  assert.doesNotMatch(host.screenLines().join("\n"), /\x1b_G/)

  await host.type("/settings")
  await host.key("\r")
  await host.key("\x1b[B")
  await host.key("\r")
  await host.key("\x1b")
  await host.frame()
  assert.match(host.screenLines().join("\n"), /\x1b_G[^;]*c=60/)

  await host.type("/settings")
  await host.key("\r")
  await host.key("\x1b[B")
  await host.key("\x1b[B")
  await host.key("\r")
  await host.key("\x1b")
  await host.frame()
  assert.match(host.screenLines().join("\n"), /\x1b_G[^;]*c=80/)
  assert.equal(host.ui.setTheme("light").success, true)
  await host.frame()
  assert.match(host.screenLines().join("\n"), /\x1b_G[^;]*c=80/)
})
