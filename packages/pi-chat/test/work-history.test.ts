import assert from "node:assert/strict"
import { copyFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import test from "node:test"
import {
  getNativeClipboard,
  Text,
  stripTerminalSequences,
  type NativeClipboard,
} from "@earendil-works/pi-tui"
import { openNativeHost } from "../../../fixtures/native-host.ts"

const chat = new URL("../src/index.ts", import.meta.url).pathname
function assertWritableClipboard(
  clipboard: NativeClipboard | undefined,
): asserts clipboard is NativeClipboard &
  Required<Pick<NativeClipboard, "setText">> {
  assert(clipboard?.setText)
}
const delta = (content: string, toolPath?: string) => ({
  event: {
    choices: [
      {
        index: 0,
        delta: {
          role: "assistant",
          content,
          ...(toolPath
            ? {
                tool_calls: [
                  {
                    index: 0,
                    id: `read-${toolPath}`,
                    type: "function",
                    function: {
                      name: "read",
                      arguments: JSON.stringify({ path: toolPath }),
                    },
                  },
                ],
              }
            : {}),
        },
        finish_reason: null,
      },
    ],
  },
})
const finish = (reason = "stop") => ({
  event: { choices: [{ index: 0, delta: {}, finish_reason: reason }] },
})
const done = { event: "[DONE]" }

test("settled work hides the earlier identical text and retains the final occurrence", async (t) => {
  const host = await openNativeHost(t, { extensionPaths: [chat], rows: 36 })
  await writeFile(join(host.directory, "one.txt"), "native tool result")
  host.queueResponse(delta("Done", "one.txt"), finish("tool_calls"), done)
  host.queueResponse(delta("Done"), finish(), done)
  await host.type("Do the work")
  await host.key("\r")
  await host.settled()

  const collapsed = await host.frame()
  assert.match(collapsed, /▸ Worked/)
  assert.equal((collapsed.match(/\bDone\b/g) ?? []).length, 1)
  assert.doesNotMatch(collapsed, /read one\.txt/)
  assert.match(collapsed, /Do the work/)
  assert.equal(host.requests.length, 2)
  assert.match(JSON.stringify(host.requests[1]), /Done/)
  const source = JSON.stringify(host.session.messages)
  assert.equal((source.match(/"text":"Done"/g) ?? []).length, 2)
  assert.doesNotMatch(source, /Worked|pi-chat/)

  await host.key("\x1bg")
  await host.key("\r")
  await host.key("\x1b")
  await host.frame()
  const expanded = host.screenLines().map(stripTerminalSequences).join("\n")
  assert.match(expanded, /▾ Worked/)
  assert.equal((expanded.match(/\bDone\b/g) ?? []).length, 2)
  assert.match(expanded, /read one\.txt/)
})

test("identical delivered steering and follow-up retain separate request relationships", async (t) => {
  const host = await openNativeHost(t, { extensionPaths: [chat], rows: 52 })
  await writeFile(join(host.directory, "one.txt"), "one native result")
  await writeFile(join(host.directory, "two.txt"), "two native result")
  await writeFile(join(host.directory, "three.txt"), "three native result")
  host.queueResponse(
    delta("Before steering", "one.txt"),
    { pause: true },
    finish("tool_calls"),
    done,
  )
  host.queueResponse(
    delta("After steering", "two.txt"),
    finish("tool_calls"),
    done,
  )
  host.queueResponse(delta("First answer"), finish(), done)
  host.queueResponse(
    delta("Followup progress", "three.txt"),
    finish("tool_calls"),
    done,
  )
  host.queueResponse(delta("Second answer"), finish(), done)
  await host.type("Original request")
  await host.key("\r")
  await t.waitFor(() => assert.equal(host.requests.length, 1))
  await host.session.steer("Same queued text")
  await host.session.followUp("Same queued text")
  host.resumeResponse()
  await host.settled()

  const frame = await host.frame()
  assert.equal(host.requests.length, 5)
  assert.equal(
    (JSON.stringify(host.requests[1]).match(/Same queued text/g) ?? []).length,
    1,
  )
  assert.equal(
    (JSON.stringify(host.requests[3]).match(/Same queued text/g) ?? []).length,
    2,
  )
  assert.equal((frame.match(/▸ Worked/g) ?? []).length, 2)
  assert.equal((frame.match(/Same queued text/g) ?? []).length, 1)
  assert.match(frame, /Original request/)
  assert.match(frame, /First answer/)
  assert.match(frame, /Second answer/)
  assert.doesNotMatch(frame, /Before steering|After steering|Followup progress/)

  const row = host
    .screenLines()
    .findIndex((line) => stripTerminalSequences(line).includes("▸ Worked"))
  assert(row >= 0)
  await host.key(`\x1b[<0;2;${row + 1}M`)
  await host.key(`\x1b[<0;2;${row + 1}m`)
  const expanded = await host.frame()
  assert.equal((expanded.match(/Same queued text/g) ?? []).length, 2)
  assert.match(expanded, /Before steering/)
  assert.match(expanded, /After steering/)
  assert.doesNotMatch(expanded, /Followup progress/)

  await host.reload()
  const replayed = await host.frame()
  assert.equal((replayed.match(/▸ Worked/g) ?? []).length, 2)
  assert.equal((replayed.match(/Same queued text/g) ?? []).length, 1)
  assert.match(replayed, /First answer|Second answer/)
})

test("without provider phase evidence work stays visible until the final stream settles", async (t) => {
  const host = await openNativeHost(t, { extensionPaths: [chat], rows: 34 })
  await writeFile(join(host.directory, "one.txt"), "native result")
  host.queueResponse(
    delta("Earlier commentary", "one.txt"),
    finish("tool_calls"),
    done,
  )
  host.queueResponse(
    delta("A partial final"),
    { pause: true },
    delta(" becomes complete."),
    finish(),
    done,
  )
  await host.type("Finish this")
  await host.key("\r")
  await t.waitFor(() => assert.equal(host.requests.length, 2))
  const streaming = await host.frame()
  assert.match(streaming, /Earlier commentary/)
  assert.match(streaming, /A partial final/)
  assert.doesNotMatch(streaming, /Worked/)
  host.resumeResponse()
  await host.settled()
  const settled = await host.frame()
  assert.match(settled, /▸ Worked/)
  assert.doesNotMatch(settled, /Earlier commentary/)
  assert.match(settled, /A partial final becomes complete\./)
})

test("native user replacement preserves the delivered request relationship and persisted content", async (t) => {
  const content = [
    { type: "text" as const, text: "Forwarded second part" },
    { type: "text" as const, text: "Forwarded first part" },
  ]
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    rows: 30,
    extensionFactories: [
      (pi) => {
        pi.on("message_end", ({ message }) => {
          if (message.role === "user")
            return { message: { ...message, content } }
          return undefined
        })
      },
    ],
  })
  await writeFile(join(host.directory, "one.txt"), "native result")
  host.queueResponse(
    delta("Original work", "one.txt"),
    finish("tool_calls"),
    done,
  )
  host.queueResponse(delta("Forwarded answer"), finish(), done)
  await host.type("Original request")
  await host.key("\r")
  await host.settled()
  const frame = await host.frame()
  assert.match(frame, /▸ Worked/)
  assert.match(frame, /Forwarded answer/)
  assert.doesNotMatch(frame, /Original work/)
  const entry = host.session.sessionManager
    .getBranch()
    .find((item) => item.type === "message" && item.message.role === "user")
  assert(entry?.type === "message" && entry.message.role === "user")
  assert.deepEqual(entry.message.content, content)
  const requested = host.requests[0]?.messages.find(
    ({ role }) => role === "user",
  )
  assert.match(
    JSON.stringify(requested),
    /Forwarded second part[\s\S]*Forwarded first part/,
  )
  assert.doesNotMatch(
    JSON.stringify(requested),
    /Original request|Worked|pi-chat/,
  )
  await host.reload()
  assert.match(await host.frame(), /▸ Worked/)
})

test("a settled terminal assistant keeps its native thoughts in work and its text as one answer", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    rows: 38,
    settings: { hideThinkingBlock: false },
  })
  await writeFile(join(host.directory, "one.txt"), "native result")
  host.queueResponse(delta("Done", "one.txt"), finish("tool_calls"), done)
  host.queueResponse(
    {
      event: {
        choices: [
          {
            index: 0,
            delta: {
              role: "assistant",
              reasoning_content: "Private thought body",
            },
            finish_reason: null,
          },
        ],
      },
    },
    delta(
      "Done\n\n" +
        Array.from({ length: 18 }, (_, index) => `answer-row-${index}`).join(
          "\n",
        ),
    ),
    finish(),
    done,
  )
  await host.type("Keep thoughts separate")
  await host.key("\r")
  await host.settled()
  const collapsed = await host.frame()
  assert.equal((collapsed.match(/\bDone\b/g) ?? []).length, 1)
  assert.match(collapsed, /▸ Worked/)
  assert.doesNotMatch(collapsed, /Private thought body/)
  await host.key("\x1bg")
  await host.key("\r")
  const expanded = await host.frame()
  assert.equal((expanded.match(/\bDone\b/g) ?? []).length, 2)
  assert.match(expanded, /Private thought body/)
  assert.equal((expanded.match(/Worked/g) ?? []).length, 1)
  await host.key("\r")
  await host.key("\x1b")
  host.terminal.resize(60, 14)
  await host.frame()
  await host.key("\x1b[F")
  await host.key("\x1b[1;5A")
  await host.frame()
  assert.match(stripTerminalSequences(host.screenLines()[0] ?? ""), /Done/)
})

test("all terminal text parts share one answer when a native extension interleaves thought blocks", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    rows: 32,
    settings: { hideThinkingBlock: false },
    extensionFactories: [
      (pi) => {
        pi.on("message_end", ({ message }) => {
          if (message.role !== "assistant" || message.stopReason !== "stop")
            return
          return {
            message: {
              ...message,
              content: [
                { type: "text", text: "First answer part" },
                { type: "thinking", thinking: "Interleaved native thought" },
                { type: "text", text: "Last answer part" },
              ],
            },
          }
        })
      },
    ],
  })
  host.queueResponse(delta("Replaced at native message end"), finish(), done)
  await host.type("Keep one answer")
  await host.key("\r")
  await host.settled()
  const frame = await host.frame()
  assert.equal((frame.match(/Worked/g) ?? []).length, 1)
  assert.match(frame, /▸ Worked[\s\S]*First answer part[\s\S]*Last answer part/)
  assert.doesNotMatch(frame, /Interleaved native thought/)
  await host.key("\x1bg")
  await host.key("\r")
  const expanded = await host.frame()
  assert.equal((expanded.match(/Worked/g) ?? []).length, 1)
  assert.match(
    expanded,
    /Interleaved native thought[\s\S]*First answer part[\s\S]*Last answer part/,
  )
  const final = host.session.messages.at(-1)
  assert.equal(final?.role, "assistant")
  assert.deepEqual(final?.content, [
    { type: "text", text: "First answer part" },
    { type: "thinking", thinking: "Interleaved native thought" },
    { type: "text", text: "Last answer part" },
  ])
})

test("native tool inspection keeps work open and work toggles preserve tool details", async (t) => {
  const host = await openNativeHost(t, { extensionPaths: [chat], rows: 34 })
  await writeFile(join(host.directory, "one.txt"), "INSPECTED BODY")
  host.queueResponse(
    delta("Inspected commentary", "one.txt"),
    finish("tool_calls"),
    done,
  )
  host.queueResponse(delta("Final text"), { pause: true }, finish(), done)
  await host.type("Inspect the tool")
  await host.key("\r")
  await t.waitFor(() => assert.equal(host.requests.length, 2))
  await host.frame()
  const call = host
    .screenLines()
    .findIndex((line) => stripTerminalSequences(line).includes("read one.txt"))
  assert(call >= 0)
  await host.key(`\x1b[<0;3;${call + 1}M`)
  await host.key(`\x1b[<0;3;${call + 1}m`)
  assert.match(await host.frame(), /INSPECTED BODY/)
  host.resumeResponse()
  await host.settled()
  const settled = await host.frame()
  assert.match(settled, /▾ Worked/)
  assert.match(settled, /Inspected commentary/)
  assert.match(settled, /INSPECTED BODY/)

  const header = host
    .screenLines()
    .findIndex((line) => stripTerminalSequences(line).includes("Worked"))
  assert(header >= 0)
  await host.key(`\x1b[<0;3;${header + 1}M`)
  await host.key(`\x1b[<0;3;${header + 1}m`)
  assert.doesNotMatch(await host.frame(), /INSPECTED BODY|Inspected commentary/)
  host.terminal.resize(55, 34)
  assert.doesNotMatch(await host.frame(), /INSPECTED BODY/)
  await host.key("\r")
  assert.match(await host.frame(), /INSPECTED BODY/)
  await host.key("\x0f")
  await host.key("\x0f")
  assert.match(await host.frame(), /Worked/)
  await host.key("\r")
  assert.doesNotMatch(await host.frame(), /INSPECTED BODY|Inspected commentary/)
  await host.key("\x0f")
  assert.doesNotMatch(await host.frame(), /INSPECTED BODY|Inspected commentary/)
})

test("cancelling a partial final leaves work expanded", async (t) => {
  const host = await openNativeHost(t, { extensionPaths: [chat], rows: 32 })
  await writeFile(join(host.directory, "one.txt"), "native result")
  host.queueResponse(
    delta("Before cancellation", "one.txt"),
    finish("tool_calls"),
    done,
  )
  host.queueResponse(delta("Partial answer"), { pause: true }, finish(), done)
  await host.type("Cancel this work")
  await host.key("\r")
  await t.waitFor(() => assert.equal(host.requests.length, 2))
  assert.match(await host.frame(), /Partial answer/)
  await host.session.abort()
  const frame = await host.frame()
  assert.match(frame, /Before cancellation/)
  assert.match(frame, /Partial answer/)
  assert.match(frame, /Operation aborted/)
  assert.doesNotMatch(frame, /Worked/)
})

test("a terminal stream error leaves earlier work and its partial text visible", async (t) => {
  const host = await openNativeHost(t, { extensionPaths: [chat], rows: 32 })
  await writeFile(join(host.directory, "one.txt"), "native result")
  host.queueResponse(
    delta("Before failure", "one.txt"),
    finish("tool_calls"),
    done,
  )
  host.queueResponse(
    delta("Partial before failure"),
    { pause: true },
    { disconnect: true },
  )
  await host.type("Handle a failed stream")
  await host.key("\r")
  await t.waitFor(() => assert.equal(host.requests.length, 2))
  assert.match(await host.frame(), /Partial before failure/)
  host.resumeResponse()
  await host.settled()
  const frame = await host.frame()
  assert.match(frame, /Before failure/)
  assert.match(frame, /Partial before failure/)
  assert.match(frame, /Error:/)
  assert.doesNotMatch(frame, /Worked/)
})

test("cleared and consumed inputs never create work relationships", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    rows: 34,
    extensionFactories: [
      (pi) => {
        pi.on("input", (event) =>
          event.text.startsWith("ignored") ? { action: "handled" } : undefined,
        )
      },
    ],
  })
  await writeFile(join(host.directory, "one.txt"), "native result")
  host.queueResponse(
    delta("Real progress", "one.txt"),
    { pause: true },
    finish("tool_calls"),
    done,
  )
  host.queueResponse(delta("Real answer"), finish(), done)
  await host.type("Real request")
  await host.key("\r")
  await t.waitFor(() => assert.equal(host.requests.length, 1))
  await host.session.steer("cleared same text")
  await host.session.followUp("cleared same text")
  assert.deepEqual(host.session.clearQueue(), {
    steering: ["cleared same text"],
    followUp: ["cleared same text"],
  })
  assert.equal(await host.session.steer("ignored steering"), "handled")
  assert.equal(await host.session.followUp("ignored follow-up"), "handled")
  host.resumeResponse()
  await host.settled()
  await host.type("ignored initial")
  await host.key("\r")
  const frame = await host.frame()
  assert.equal(host.requests.length, 2)
  assert.equal((frame.match(/Worked/g) ?? []).length, 1)
  assert.match(frame, /Real answer/)
  assert.doesNotMatch(
    frame,
    /cleared same text|ignored steering|ignored follow-up/,
  )
  assert.doesNotMatch(
    JSON.stringify(host.requests),
    /cleared same text|ignored/,
  )
  assert.doesNotMatch(
    JSON.stringify(host.session.messages),
    /cleared same text|ignored/,
  )
})

test("an all-at-once follow-up batch does not invent an answer for every queued user", async (t) => {
  const host = await openNativeHost(t, { extensionPaths: [chat], rows: 40 })
  host.session.setFollowUpMode("all")
  await writeFile(join(host.directory, "one.txt"), "one native result")
  await writeFile(join(host.directory, "two.txt"), "two native result")
  host.queueResponse(
    delta("Initial progress", "one.txt"),
    { pause: true },
    finish("tool_calls"),
    done,
  )
  host.queueResponse(delta("Initial answer"), finish(), done)
  host.queueResponse(
    delta("Batched progress", "two.txt"),
    finish("tool_calls"),
    done,
  )
  host.queueResponse(delta("Shared queued answer"), finish(), done)
  await host.type("Initial request")
  await host.key("\r")
  await t.waitFor(() => assert.equal(host.requests.length, 1))
  await host.session.followUp("Same batch text")
  await host.session.followUp("Same batch text")
  host.resumeResponse()
  await host.settled()
  const frame = await host.frame()
  assert.equal(host.requests.length, 4)
  assert.equal(
    (JSON.stringify(host.requests[2]).match(/Same batch text/g) ?? []).length,
    2,
  )
  assert.equal((frame.match(/Worked/g) ?? []).length, 2)
  assert.equal((frame.match(/Same batch text/g) ?? []).length, 2)
  assert.equal((frame.match(/Shared queued answer/g) ?? []).length, 1)
  assert.match(frame, /Initial answer/)
})

test("cancellation after agent_end stays expanded through the next request", async (t) => {
  const gate = Promise.withResolvers<void>()
  let waiting = false
  t.after(() => gate.resolve())
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    rows: 38,
    extensionFactories: [
      (pi) => {
        pi.on("agent_before_settle", async () => {
          if (waiting) return
          waiting = true
          await gate.promise
        })
      },
    ],
  })
  await writeFile(join(host.directory, "one.txt"), "native result")
  host.queueResponse(
    delta("Work before late cancellation", "one.txt"),
    finish("tool_calls"),
    done,
  )
  host.queueResponse(delta("Text before settlement"), finish(), done)
  await host.type("First request")
  await host.key("\r")
  await t.waitFor(() => assert(waiting))
  assert.equal(host.session.isStreaming, true)
  assert.doesNotMatch(await host.frame(), /Worked/)
  const abort = host.session.abort()
  gate.resolve()
  await abort
  const cancelled = await host.frame()
  assert.match(cancelled, /Work before late cancellation/)
  assert.match(cancelled, /Text before settlement/)
  assert.doesNotMatch(cancelled, /Worked/)
  await host.type("Next request")
  await host.key("\r")
  await host.settled()
  const next = await host.frame()
  assert.match(next, /Work before late cancellation/)
  assert.match(next, /Text before settlement/)
  assert.doesNotMatch(next, /Worked/)
})

test("a terminal response without answer text leaves work expanded", async (t) => {
  const host = await openNativeHost(t, { extensionPaths: [chat], rows: 30 })
  await writeFile(join(host.directory, "one.txt"), "native result")
  host.queueResponse(
    delta("Visible work without answer", "one.txt"),
    finish("tool_calls"),
    done,
  )
  host.queueResponse(finish(), done)
  await host.type("No answer")
  await host.key("\r")
  await host.settled()
  const frame = await host.frame()
  assert.match(frame, /Visible work without answer/)
  assert.match(frame, /read one\.txt/)
  assert.doesNotMatch(frame, /Worked/)
})

test("a truncated terminal text can be the final answer without hiding its native notice", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    rows: 30,
    settings: { hideThinkingBlock: false },
  })
  await writeFile(join(host.directory, "one.txt"), "native result")
  host.queueResponse(
    delta("Work before truncated answer", "one.txt"),
    finish("tool_calls"),
    done,
  )
  host.queueResponse(
    {
      event: {
        choices: [
          {
            index: 0,
            delta: {
              role: "assistant",
              reasoning_content: "Thought before truncation",
            },
            finish_reason: null,
          },
        ],
      },
    },
    delta("Truncated answer"),
    finish("length"),
    done,
  )
  await host.type("A length limit")
  await host.key("\r")
  await host.settled()
  const frame = await host.frame()
  assert.match(frame, /▸ Worked/)
  assert.match(frame, /Truncated answer/)
  assert.match(frame, /Response was truncated before completion/)
  assert.doesNotMatch(
    frame,
    /Work before truncated answer|Thought before truncation/,
  )
})

test("automatic folding clears a selected progress range even while reading scrollback", async (t) => {
  const clipboard = getNativeClipboard()
  assertWritableClipboard(clipboard)
  let copied = ""
  t.mock.method(clipboard, "setText", async (text: string) => {
    copied = text
  })
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    rows: 16,
    settings: { fullscreenCopyOnSelect: false },
  })
  await writeFile(join(host.directory, "one.txt"), "native result")
  host.queueResponse(
    delta(
      "Selected progress\n\n" +
        Array.from({ length: 24 }, (_, i) => `progress-row-${i}`).join("\n"),
      "one.txt",
    ),
    finish("tool_calls"),
    done,
  )
  host.queueResponse(delta("Visible final"), { pause: true }, finish(), done)
  await host.type("Read old work")
  await host.key("\r")
  await t.waitFor(() => assert.equal(host.requests.length, 2))
  await host.key("\x1b[H")
  await host.frame()
  const lines = host.screenLines().map(stripTerminalSequences)
  const row = lines.findIndex((line) => line.includes("Selected progress"))
  assert(row >= 0)
  const column = lines[row]!.indexOf("Selected progress") + 1
  await host.key(`\x1b[<0;${column};${row + 1}M`)
  await host.key(`\x1b[<32;${column + 8};${row + 1}M`)
  await host.key(`\x1b[<0;${column + 8};${row + 1}m`)
  await host.key("\x18")
  await t.waitFor(() => assert.equal(copied, "Selected"))
  host.resumeResponse()
  await host.settled()
  const frame = await host.frame()
  assert.match(frame, /▸ Worked/)
  assert.match(frame, /Visible final/)
  assert.doesNotMatch(frame, /Selected progress/)
  await host.key("\x18")
  await t.waitFor(() => assert.equal(copied, "Visible final"))
})

test("certified work relationships survive native journal reload", async (t) => {
  const host = await openNativeHost(t, { extensionPaths: [chat], rows: 32 })
  await writeFile(join(host.directory, "one.txt"), "native result")
  host.queueResponse(
    delta("Live progress", "one.txt"),
    finish("tool_calls"),
    done,
  )
  host.queueResponse(delta("Live answer"), finish(), done)
  await host.type("Uncertain replay")
  await host.key("\r")
  await host.settled()
  assert.doesNotMatch(await host.frame(), /Live progress/)
  const entries = host.session.sessionManager.getEntries()
  const facts = entries.filter(
    (entry) =>
      entry.type === "custom" && entry.customType === "pi-chat.relationship",
  )
  assert(facts.length > 0)
  assert.doesNotMatch(
    JSON.stringify(facts),
    /Live progress|Live answer|Uncertain replay/,
  )
  await host.key("\x1bg")
  await host.key("\r")
  await host.key("\x1b")
  assert.match(await host.frame(), /Live progress/)
  await host.reload()
  const reloaded = await host.frame()
  assert.doesNotMatch(reloaded, /Live progress/)
  assert.match(reloaded, /Live answer/)
  assert.match(reloaded, /▸ Worked/)
})

test("history without delivery records leaves uncertain work unfolded", async (t) => {
  const source = await openNativeHost(t, { persistSession: true, rows: 32 })
  await writeFile(join(source.directory, "one.txt"), "native result")
  source.queueResponse(
    delta("Old progress", "one.txt"),
    finish("tool_calls"),
    done,
  )
  source.queueResponse(delta("Old answer"), finish(), done)
  await source.type("Old request")
  await source.key("\r")
  await source.settled()
  const sessionFile = source.session.sessionFile
  assert(sessionFile)
  await source.close()

  const restored = await openNativeHost(t, {
    extensionPaths: [chat],
    sessionFile,
    directory: source.directory,
    rows: 32,
  })
  const frame = await restored.frame()
  assert.match(frame, /Old progress/)
  assert.match(frame, /Old answer/)
  assert.doesNotMatch(frame, /Worked/)
})

test("same-journal tree navigation restores only surviving relationships", async (t) => {
  let target = ""
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    rows: 36,
    extensionFactories: [
      (pi) =>
        pi.registerCommand("test-tree", {
          handler: async (_args, ctx) => {
            await ctx.navigateTree(target)
          },
        }),
    ],
  })
  await writeFile(join(host.directory, "one.txt"), "native result")
  host.queueResponse(
    delta("Tree progress", "one.txt"),
    finish("tool_calls"),
    done,
  )
  host.queueResponse(delta("Tree answer"), finish(), done)
  await host.type("Tree request")
  await host.key("\r")
  await host.settled()

  const entries = host.session.sessionManager.getEntries()
  const assistant = entries.filter(
    (entry) => entry.type === "message" && entry.message.role === "assistant",
  )
  assert.equal(assistant.length, 2)
  const progress = assistant[0]!
  const answer = assistant[1]!
  target = answer.id
  await host.type("/test-tree")
  await host.key("\r")
  const selected = host.session.sessionManager.getBranch()
  assert.equal(selected.at(-1)?.id, answer.id)
  assert.equal(
    selected.some(
      (entry) =>
        entry.type === "custom" &&
        entry.customType === "pi-chat.relationship" &&
        entry.parentId === answer.id,
    ),
    false,
  )
  const restored = await host.frame()
  assert.match(restored, /▸ Worked/)
  assert.match(restored, /Tree answer/)
  assert.doesNotMatch(restored, /Tree progress/)

  target = progress.id
  await host.type("/test-tree")
  await host.key("\r")
  const partial = await host.frame()
  assert.match(partial, /Tree progress/)
  assert.doesNotMatch(partial, /Tree answer|▸ Worked/)

  target = answer.id
  await host.type("/test-tree")
  await host.key("\r")
  assert.match(await host.frame(), /▸ Worked/)
})

test("native fork carries certified relationships whose sources survive", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    persistSession: true,
    rows: 36,
  })
  await writeFile(join(host.directory, "one.txt"), "native result")
  host.queueResponse(
    delta("Fork progress", "one.txt"),
    finish("tool_calls"),
    done,
  )
  host.queueResponse(delta("Fork answer"), finish(), done)
  await host.type("Fork request")
  await host.key("\r")
  await host.settled()
  const originalFile = host.session.sessionFile
  const answer = host.session.sessionManager
    .getEntries()
    .find(
      (entry) =>
        entry.type === "message" &&
        entry.message.role === "assistant" &&
        JSON.stringify(entry.message.content).includes("Fork answer"),
    )
  assert(answer)
  host.queueResponse(delta("Sibling answer"), finish(), done)
  await host.type("Sibling request")
  await host.key("\r")
  await host.settled()
  const result = await host.runtime.fork(answer.id, { position: "at" })
  assert.equal(result.cancelled, false)
  assert.notEqual(host.session.sessionFile, originalFile)
  const frame = await host.frame()
  assert.match(frame, /▸ Worked/)
  assert.match(frame, /Fork answer/)
  assert.doesNotMatch(frame, /Fork progress/)
  assert.doesNotMatch(frame, /Sibling request|Sibling answer/)
  assert.doesNotMatch(
    JSON.stringify(host.session.sessionManager.getEntries()),
    /Sibling request|Sibling answer/,
  )
  assert(
    host.session.sessionManager
      .getEntries()
      .some(
        (entry) =>
          entry.type === "custom" &&
          entry.customType === "pi-chat.relationship",
      ),
  )
})

test("a retained fork method cannot transfer a disposed adapter's relationships", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    persistSession: true,
    rows: 36,
  })
  await writeFile(join(host.directory, "one.txt"), "native result")
  host.queueResponse(
    delta("Stale progress", "one.txt"),
    finish("tool_calls"),
    done,
  )
  host.queueResponse(delta("Stale answer"), finish(), done)
  await host.type("Stale request")
  await host.key("\r")
  await host.settled()
  const retainedFork = host.runtime.fork
  const answer = host.session.sessionManager
    .getEntries()
    .find(
      (entry) =>
        entry.type === "message" &&
        entry.message.role === "assistant" &&
        JSON.stringify(entry.message.content).includes("Stale answer"),
    )
  assert(answer)
  await host.reload()

  const result = await retainedFork(answer.id, { position: "at" })
  assert.equal(result.cancelled, false)
  const frame = await host.frame()
  assert.match(frame, /Stale progress|read one\.txt/)
  assert.match(frame, /Stale answer/)
  assert.doesNotMatch(frame, /▸ Worked/)
  assert.equal(
    host.session.sessionManager
      .getEntries()
      .some(
        (entry) =>
          entry.type === "custom" &&
          entry.customType === "pi-chat.relationship" &&
          entry.data &&
          typeof entry.data === "object" &&
          "kind" in entry.data &&
          entry.data.kind === "settled",
      ),
    false,
  )
})

test("copied journal restores work without changing provider context", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    persistSession: true,
    rows: 36,
  })
  await writeFile(join(host.directory, "one.txt"), "native result")
  host.queueResponse(
    delta("Copy progress", "one.txt"),
    finish("tool_calls"),
    done,
  )
  host.queueResponse(delta("Copy answer"), finish(), done)
  await host.type("Copy request")
  await host.key("\r")
  await host.settled()
  const sourceFile = host.session.sessionFile
  assert(sourceFile)
  const copiedFile = join(host.directory, "copied-session.jsonl")
  await copyFile(sourceFile, copiedFile)
  await host.runtime.switchSession(copiedFile)

  const frame = await host.frame()
  assert.match(frame, /▸ Worked/)
  assert.match(frame, /Copy answer/)
  assert.doesNotMatch(frame, /Copy progress/)
  await host.type("Next request")
  await host.key("\r")
  await host.settled()
  const provider = JSON.stringify(host.requests.at(-1))
  assert.match(provider, /Copy request|Copy answer|Next request/)
  assert.doesNotMatch(provider, /pi-chat|Worked/)
})

test("compaction keeps certified source relationships for later tree navigation", async (t) => {
  let target = ""
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    persistSession: true,
    rows: 36,
    extensionFactories: [
      (pi) =>
        pi.registerCommand("test-tree", {
          handler: async (_args, ctx) => {
            await ctx.navigateTree(target)
          },
        }),
    ],
  })
  await writeFile(join(host.directory, "one.txt"), "native result")
  host.queueResponse(
    delta("Archived progress", "one.txt"),
    finish("tool_calls"),
    done,
  )
  host.queueResponse(delta("Archived answer"), finish(), done)
  await host.type("Archived request")
  await host.key("\r")
  await host.settled()
  const file = host.session.sessionFile
  assert(file)
  const answer = host.session.sessionManager
    .getEntries()
    .find(
      (entry) =>
        entry.type === "message" &&
        entry.message.role === "assistant" &&
        JSON.stringify(entry.message.content).includes("Archived answer"),
    )
  assert(answer)
  target = answer.id
  host.session.sessionManager.appendCompaction("Archived context", null, 100)
  await host.runtime.switchSession(file)
  assert.match(await host.frame(), /Compacted from 100 tokens/)

  await host.type("/test-tree")
  await host.key("\r")
  const restored = await host.frame()
  assert.match(restored, /▸ Worked/)
  assert.match(restored, /Archived answer/)
  assert.doesNotMatch(restored, /Archived progress/)
})

test("a standalone native message after the final keeps its source position", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    rows: 34,
    extensionFactories: [
      (pi) => {
        pi.registerMessageRenderer(
          "post-answer",
          () => new Text("Native post-answer notice", 0, 0),
        )
        pi.on("message_end", (event) => {
          if (
            event.message.role === "assistant" &&
            event.message.content.some(
              (part) =>
                part.type === "text" && part.text === "Final before notice",
            )
          )
            pi.sendMessage(
              {
                customType: "post-answer",
                content: "Native post-answer notice",
                display: true,
              },
              { triggerTurn: false },
            )
        })
      },
    ],
  })
  await writeFile(join(host.directory, "one.txt"), "native result")
  host.queueResponse(
    delta("Earlier native work", "one.txt"),
    finish("tool_calls"),
    done,
  )
  host.queueResponse(delta("Final before notice"), finish(), done)
  await host.type("Keep native order")
  await host.key("\r")
  await host.settled()
  const frame = await host.frame()
  assert.match(frame, /▸ Worked/)
  assert.match(frame, /Final before notice[\s\S]*Native post-answer notice/)
  assert.doesNotMatch(frame, /Earlier native work/)
})
