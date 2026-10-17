import assert from "node:assert/strict"
import test from "node:test"
import {
  Editor,
  getNativeClipboard,
  stripTerminalSequences,
  Text,
  type NativeClipboard,
} from "@earendil-works/pi-tui"
import { openNativeHost } from "../../../fixtures/native-host.ts"

const chat = new URL("../src/index.ts", import.meta.url).pathname
const thoughtStart = (index: number) => ({
  event: {
    type: "response.output_item.added",
    output_index: index,
    item: { type: "reasoning", id: `thought-${index}`, summary: [] },
  },
})
const thoughtDelta = (index: number, text: string) => ({
  event: {
    type: "response.reasoning_summary_text.delta",
    output_index: index,
    delta: text,
  },
})
const thoughtEnd = (index: number, text: string) => ({
  event: {
    type: "response.output_item.done",
    output_index: index,
    item: {
      type: "reasoning",
      id: `thought-${index}`,
      summary: [{ type: "summary_text", text }],
    },
  },
})
const answerStart = {
  event: {
    type: "response.output_item.added",
    output_index: 9,
    item: { type: "message", id: "answer", role: "assistant", content: [] },
  },
}
const answerDelta = (text: string) => ({
  event: {
    type: "response.output_text.delta",
    output_index: 9,
    content_index: 0,
    delta: text,
  },
})
const answerEnd = (text: string) => ({
  event: {
    type: "response.output_item.done",
    output_index: 9,
    item: {
      type: "message",
      id: "answer",
      role: "assistant",
      content: [{ type: "output_text", text }],
    },
  },
})
const start = { event: { type: "response.created", response: { id: "reply" } } }
const done = {
  event: {
    type: "response.completed",
    response: { id: "reply", status: "completed" },
  },
}
const chunk = (
  delta: Record<string, string>,
  finishReason: string | null = null,
) => ({
  event: { choices: [{ index: 0, delta, finish_reason: finishReason }] },
})

const end = { end: true } as const

function writableClipboard(
  clipboard: NativeClipboard | undefined,
): asserts clipboard is NativeClipboard &
  Required<Pick<NativeClipboard, "setText">> {
  assert(clipboard?.setText)
}

test("native Hide thinking controls prose while the working label retains a single thought title", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    providerApi: "openai-responses",
    rows: 36,
    settings: { hideThinkingBlock: true },
    keybindings: { "app.thinking.toggle": "ctrl+t" },
  })
  const plain = "Unheaded reasoning must remain hidden."
  const partial = `${plain}\n\n**Analyzing the `
  const initial =
    partial +
    "`tools` schema**\n\nOriginal thought with **inline emphasis**. This is a long reasoning paragraph that must remain in the thought body while its short title stays in the progress indicator. More detail must not replace that title or expand the indicator into several rows.\n\n```text\n**Code sample**\n```\n<!-- retained metadata -->"
  const nextHeading = "\n\nMore thought prose.\n\n**Considering documentation "
  const continuation = nextHeading + "needs**\n\n<!"
  const full = initial + continuation
  host.queueResponse(
    start,
    thoughtStart(0),
    thoughtDelta(0, plain),
    { pause: true },
    thoughtDelta(0, partial.slice(plain.length)),
    { pause: true },
    thoughtDelta(0, initial.slice(partial.length)),
    { pause: true },
    thoughtDelta(0, nextHeading),
    { pause: true },
    thoughtDelta(0, continuation.slice(nextHeading.length)),
    { pause: true },
    thoughtEnd(0, full),
    thoughtStart(1),
    thoughtDelta(1, "<!-- pending reasoning metadata"),
    { pause: true },
    thoughtEnd(1, "<!-- pending reasoning metadata"),
    answerStart,
    answerDelta("Answer in progress"),
    { pause: true },
    answerEnd("Answer in progress"),
    done,
    end,
  )
  await host.type("Think here")
  await host.key("\r")
  const screen = () => host.screenLines().map(stripTerminalSequences).join("\n")
  await t.waitFor(() => assert.equal(host.requests.length, 1))
  await host.frame()
  assert.match(screen(), /Thinking/)
  assert.doesNotMatch(screen(), /Working|Unheaded reasoning/)
  assert.doesNotMatch(screen(), /Analyzing the|Thought|thinking hidden/)
  host.resumeResponse()
  await host.frame()
  assert.match(screen(), /Thinking/)
  assert.doesNotMatch(screen(), /Working|Unheaded reasoning|Analyzing the/)
  host.resumeResponse()
  await t.waitFor(() => assert.match(screen(), /Analyzing the tools schema/))
  assert.doesNotMatch(screen(), /Original thought|Code sample|Thought/)
  host.terminal.resize(24, 36)
  await host.frame()
  assert.match(screen(), /Analyzing the tools…/)
  assert.doesNotMatch(screen(), /schema|Original thought|Code sample/)
  host.ui.setEditorComponent((tui, theme) => new Editor(tui, theme))
  await host.frame()
  assert.match(screen(), /Analyzing the tools…/)
  assert.doesNotMatch(screen(), /schema|Original thought|Code sample/)
  host.terminal.resize(60, 36)
  await host.frame()
  assert.match(screen(), /Analyzing the tools schema/)
  host.ui.setEditorComponent(undefined)
  await host.key("\x14")
  await host.frame()
  assert.match(
    screen(),
    /Think here[\s\S]*Original thought with inline emphasis/,
  )
  assert.match(screen(), /\*\*Code sample\*\*/)
  assert.equal(screen().match(/Analyzing the tools schema/g)?.length, 1)
  assert.doesNotMatch(screen(), /Thought/)
  host.resumeResponse()
  await t.waitFor(() => assert.match(screen(), /More thought prose/))
  assert.match(screen(), /[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏][^\n]*Analyzing the tools schema/)
  host.resumeResponse()
  await t.waitFor(() =>
    assert.match(screen(), /Considering documentation needs/),
  )
  assert.doesNotMatch(screen(), /Analyzing the tools schema/)
  assert.equal(screen().match(/Considering documentation needs/g)?.length, 1)
  await host.key("\x14")
  await host.frame()
  assert.doesNotMatch(screen(), /Original thought|More thought prose/)
  assert.match(screen(), /Considering documentation needs/)
  host.resumeResponse()
  await host.frame()
  assert.match(screen(), /Considering documentation needs/)
  assert.doesNotMatch(screen(), /Working/)
  host.resumeResponse()
  await t.waitFor(() => assert.match(screen(), /Answer in progress/))
  assert.equal(host.session.isStreaming, true)
  assert.doesNotMatch(screen(), /Original thought|More thought prose|Thought/)
  assert.match(screen(), /Considering documentation needs/)
  assert.doesNotMatch(screen(), /Working|Analyzing the tools schema/)
  await host.key("\x14")
  await host.frame()
  assert.match(screen(), /Original thought[\s\S]*Answer in progress/)
  const thoughtRow = host
    .screenLines()
    .findIndex((row) => row.includes("Original thought"))
  assert(thoughtRow >= 0)
  await host.key(`\x1b[<0;3;${thoughtRow + 1}M`)
  await host.key(`\x1b[<0;3;${thoughtRow + 1}m`)
  assert.match(await host.frame(), /Original thought/)
  host.resumeResponse()
  await host.settled()
  assert.match(await host.frame(), /Worked for \d+m \d+s ▶/)
  await host.key("\x1bg")
  await host.key("\r")
  await host.frame()
  assert.match(screen(), /Original thought/)
  assert.doesNotMatch(
    screen(),
    /Thought|Analyzing the tools schema|Considering documentation needs/,
  )
  const message = host.session.messages.at(-1)
  assert.equal(message?.role, "assistant")
  if (message?.role === "assistant")
    assert.equal(
      message.content.find((block) => block.type === "thinking")?.thinking,
      full,
    )
  assert.doesNotMatch(JSON.stringify(host.session.messages.at(-1)), /▼|▶/)

  host.queueResponse(start, { pause: true }, done, end)
  const next = host.session.prompt("Start a new request")
  await t.waitFor(() => assert.equal(host.requests.length, 2))
  await host.frame()
  assert.match(screen(), /Thinking/)
  assert.doesNotMatch(screen(), /Working|Considering documentation needs/)
  host.resumeResponse()
  await next
  await host.reload()
  await host.frame()
  assert.doesNotMatch(screen(), /Working|Considering documentation needs/)
})

test("a full inline thought follows chat scrolling, preserves an anchor, and keeps native Markdown caches", async (t) => {
  let transformations = 0
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    providerApi: "openai-responses",
    columns: 64,
    rows: 36,
    extensionFactories: [
      (pi) =>
        pi.registerMarkdownTransformer((markdown, context) => {
          if (context.messageType !== "assistant-thinking") return markdown
          transformations++
          return markdown.replaceAll("source-", "shown-")
        }),
    ],
  })
  const initial =
    "```text\n" +
    Array.from({ length: 40 }, (_, row) => `source-${row}`).join("\n")
  const full = initial + "\nsource-40\nsource-41\n```"
  host.queueResponse(
    start,
    thoughtStart(0),
    thoughtDelta(0, initial),
    { pause: true },
    thoughtDelta(0, "\nsource-40"),
    { pause: true },
    thoughtDelta(0, "\nsource-41\n```"),
    { pause: true },
    thoughtEnd(0, full),
    { pause: true },
    done,
    end,
  )
  await host.type("A thought in this position")
  await host.key("\r")
  const screen = () => host.screenLines().map(stripTerminalSequences)
  await t.waitFor(() =>
    assert(screen().some((row) => row.includes("shown-39"))),
  )
  assert(!screen().some((row) => row.includes("A thought in this position")))
  assert(!screen().some((row) => row.includes("shown-0")))
  assert(!screen().some((row) => row.includes("Thought")))
  assert(screen().filter((row) => /shown-\d/.test(row)).length > 16)
  const last = screen().findIndex((row) => row.includes("shown-39"))
  const cached = transformations
  await host.key(`\x1b[<64;3;${last + 1}M`)
  await host.output()
  const anchor = screen()
    .find((row) => /shown-\d/.test(row))
    ?.match(/shown-\d+/)?.[0]
  assert(anchor)
  assert.equal(transformations, cached)
  host.resumeResponse()
  await host.output()
  assert.equal(
    screen()
      .find((row) => /shown-\d/.test(row))
      ?.match(/shown-\d+/)?.[0],
    anchor,
  )
  host.terminal.resize(52, 32)
  await host.output()
  assert.equal(
    screen()
      .find((row) => /shown-\d/.test(row))
      ?.match(/shown-\d+/)?.[0],
    anchor,
  )
  const body = screen().findIndex((row) => /shown-\d/.test(row))
  for (let count = 0; count < 10; count++) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- Deliver terminal wheel events in order.
    await host.key(`\x1b[<65;3;${body + 1}M`)
  }
  await host.output()
  assert(screen().some((row) => row.includes("shown-40")))
  host.resumeResponse()
  await t.waitFor(() =>
    assert(screen().some((row) => row.includes("shown-41"))),
  )
  host.resumeResponse()
  await host.output()
  assert.equal(host.session.isStreaming, true)
  assert(screen().some((row) => row.includes("shown-41")))
  assert(!screen().some((row) => row.includes("Thought")))
  host.terminal.resize(52, 70)
  await host.output()
  assert(screen().some((row) => row.includes("A thought in this position")))
  assert.equal(screen().filter((row) => /shown-\d/.test(row)).length, 42)
  host.resumeResponse()
  await host.settled()
  assert.match(JSON.stringify(host.session.messages.at(-1)), /source-41/)
  assert.doesNotMatch(JSON.stringify(host.session.messages.at(-1)), /shown-/)
})

test("adjacent thinking blocks share one body and every thought stays visible through cancellation and reload", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    providerApi: "openai-responses",
    rows: 40,
    settings: { hideThinkingBlock: false },
    keybindings: { "app.thinking.toggle": "ctrl+t" },
  })
  const later = "**Figuring out file processing**\n\nLater thought"
  host.queueResponse(
    {
      event: {
        type: "response.output_item.done",
        output_index: 0,
        item: {
          id: "read-item",
          call_id: "read-before-thoughts",
          type: "function_call",
          name: "read",
          arguments: '{"path":"missing-thought.txt"}',
        },
      },
    },
    done,
    end,
  )
  host.queueResponse(
    start,
    thoughtStart(8),
    thoughtEnd(8, ""),
    { pause: true },
    thoughtStart(0),
    thoughtDelta(0, "First adjacent block"),
    thoughtEnd(0, "First adjacent block"),
    thoughtStart(2),
    thoughtDelta(2, "Second adjacent block"),
    { pause: true },
    thoughtEnd(2, "Second adjacent block"),
    answerStart,
    answerDelta("Boundary between thoughts"),
    thoughtStart(7),
    thoughtDelta(7, later),
    { pause: true },
    thoughtEnd(7, later),
    done,
    end,
  )
  await host.type("Keep thought positions")
  await host.key("\r")
  const screen = () => host.screenLines().map(stripTerminalSequences)
  await t.waitFor(() => assert.equal(host.requests.length, 2))
  assert.match(await host.frame(), /Reading missing-thought\.txt >/)
  host.resumeResponse()
  await t.waitFor(() =>
    assert(screen().some((row) => row.includes("Second adjacent block"))),
  )
  assert(!screen().some((row) => row.includes("Thought")))
  assert.match(
    screen().join("\n"),
    /First adjacent block[\s\S]*Second adjacent block/,
  )
  await host.frame()
  assert.match(screen().join("\n"), /Read missing-thought\.txt \(failed\) >/)
  assert.doesNotMatch(screen().join("\n"), /Read files/)
  host.resumeResponse()
  await t.waitFor(() =>
    assert(screen().some((row) => row.includes("Later thought"))),
  )
  assert.equal(
    screen().filter((row) => row.includes("Figuring out file processing"))
      .length,
    1,
  )
  assert.match(
    screen().join("\n"),
    /[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏][^\n]*Figuring out file processing/,
  )
  assert.doesNotMatch(screen().join("\n"), /[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏][^\n]*Later thought/)
  assert(!screen().some((row) => row.includes("Thought")))
  assert(screen().some((row) => row.includes("First adjacent block")))
  assert(screen().some((row) => row.includes("Second adjacent block")))
  const first = screen().findIndex((row) =>
    row.includes("First adjacent block"),
  )
  await host.key(`\x1b[<0;3;${first + 1}M`)
  await host.key(`\x1b[<0;3;${first + 1}m`)
  await host.frame()
  assert.match(
    screen().join("\n"),
    /First adjacent block[\s\S]*Second adjacent block[\s\S]*Boundary between thoughts[\s\S]*Later thought/,
  )
  await host.key("\x1b")
  await host.session.abort()
  await host.settled()
  await host.frame()
  assert(screen().some((row) => row.includes("First adjacent block")))
  assert(screen().some((row) => row.includes("Later thought")))
  assert(!screen().some((row) => row.includes("Figuring out file processing")))
  const stored = JSON.stringify(host.session.messages)
  await host.key("\x14")
  const hidden = await host.frame()
  assert.doesNotMatch(hidden, /First adjacent block|Later thought/)
  assert.match(hidden, /Boundary between thoughts/)
  assert.match(hidden, /Operation aborted/)
  await host.reload()
  assert.doesNotMatch(await host.frame(), /First adjacent block|Later thought/)
  await host.key("\x14")
  await host.frame()
  assert(!screen().some((row) => row.includes("Thought")))
  assert(!screen().some((row) => row.includes("Figuring out file processing")))
  assert.match(
    screen().join("\n"),
    /First adjacent block[\s\S]*Second adjacent block[\s\S]*Boundary between thoughts[\s\S]*Later thought/,
  )
  assert.equal(JSON.stringify(host.session.messages), stored)
})

test("native copy includes offscreen thought rows and whole agent activity collapse clears the selection", async (t) => {
  const clipboard = getNativeClipboard()
  writableClipboard(clipboard)
  let copied = ""
  t.mock.method(clipboard, "setText", async (text: string) => {
    copied = text
  })
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    providerApi: "openai-responses",
    rows: 36,
    keybindings: { "tui.altScreen.top": "home" },
    settings: { fullscreenCopyOnSelect: false },
  })
  const body =
    "```text\n" +
    Array.from({ length: 30 }, (_, row) => `thought-${row} 界`).join("\n") +
    "\n```"
  host.queueResponse(
    start,
    thoughtStart(0),
    thoughtDelta(0, body),
    { pause: true },
    thoughtEnd(0, body),
    answerStart,
    answerDelta("Visible answer"),
    answerEnd("Visible answer"),
    done,
    end,
  )
  await host.type("Copy thought body")
  await host.key("\r")
  const screen = () => host.screenLines().map(stripTerminalSequences)
  await t.waitFor(() =>
    assert(screen().some((row) => row.includes("thought-29"))),
  )
  await host.key("\x1b[H")
  await host.frame()
  const first = screen().findIndex((row) => row.includes("Copy thought body"))
  assert(first >= 0)
  const column = screen()[first]!.indexOf("Copy thought body") + 1
  await host.key(`\x1b[<0;${column};${first + 1}M`)
  // oxlint-disable-next-line eslint/no-await-in-loop -- Deliver the selection's wheel events in order.
  for (let n = 0; n < 18; n++) await host.key(`\x1b[<65;3;${first + 1}M`)
  await host.frame()
  const last = screen().findIndex((row) => row.includes("thought-29"))
  assert(last >= 0)
  await host.key(`\x1b[<32;30;${last + 1}M`)
  await host.key(`\x1b[<0;30;${last + 1}m`)
  await host.key("\x18")
  await t.waitFor(() => assert(copied))
  assert.match(copied, /thought-0 界/)
  assert.match(copied, /thought-29 界/)
  host.resumeResponse()
  await host.settled()
  await host.frame()
  assert(!screen().some((row) => /thought-\d/.test(row)))
  copied = ""
  await host.key("\x18")
  await t.waitFor(() => assert.equal(copied, "Visible answer"))
})

test("a live thought leaves the screen with its source row during chat scrollback", async (t) => {
  let appendTail: (() => void) | undefined
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    providerApi: "openai-responses",
    rows: 32,
    extensionFactories: [
      (pi) => {
        pi.registerEntryRenderer(
          "test.thought-tail",
          () =>
            new Text(
              Array.from({ length: 50 }, (_, n) => `later-row-${n}`).join("\n"),
              0,
              0,
            ),
        )
        appendTail = () => pi.appendEntry("test.thought-tail", {})
      },
    ],
  })
  host.queueResponse(
    start,
    thoughtStart(0),
    thoughtDelta(0, "Inline thought body"),
    { pause: true },
    thoughtEnd(0, "Inline thought body"),
    done,
    end,
  )
  assert(appendTail)
  appendTail()
  await host.type("Original thought position")
  await host.key("\r")
  const screen = () => host.screenLines().map(stripTerminalSequences).join("\n")
  await t.waitFor(() => assert.match(screen(), /Inline thought body/))
  await host.key("\x1b[5~")
  await host.key("\x1b[5~")
  await host.key("\x1b[5~")
  await host.frame()
  assert.match(screen(), /later-row-0/)
  assert.doesNotMatch(screen(), /[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏][^\n]*Thinking/)
  assert.doesNotMatch(screen(), /Thought|Inline thought body/)
  await host.key("\x1b[6~")
  await host.key("\x1b[6~")
  await host.key("\x1b[6~")
  await host.frame()
  assert.match(
    screen(),
    /later-row-49[\s\S]*Original thought position[\s\S]*Inline thought body/,
  )
  host.resumeResponse()
  await host.settled()
})

test("native prompt navigation reaches a split assistant while its answer is still streaming", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    providerApi: "openai-responses",
    rows: 20,
  })
  const answer =
    "```text\n" +
    Array.from({ length: 40 }, (_, n) => `answer-${n}`).join("\n") +
    "\n```"
  host.queueResponse(
    start,
    thoughtStart(0),
    thoughtDelta(0, "Complete thought"),
    thoughtEnd(0, "Complete thought"),
    answerStart,
    answerDelta(answer),
    { pause: true },
    answerEnd(answer),
    done,
    end,
  )
  await host.type("Prompt before the thought")
  await host.key("\r")
  const screen = () => host.screenLines().map(stripTerminalSequences).join("\n")
  await t.waitFor(() => assert.match(screen(), /answer-39/))
  await host.key("\x1b[1;5A")
  await host.frame()
  assert.match(screen(), /Complete thought[\s\S]*answer-0/)
  assert.doesNotMatch(screen(), /Prompt before the thought/)
  host.resumeResponse()
  await host.settled()
})

test("native message replacement can split an earlier thinking run without stealing the final text occurrence", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    providerApi: "openai-responses",
    rows: 32,
    extensionFactories: [
      (pi) => {
        pi.on("message_end", ({ message }) => {
          if (message.role !== "assistant") return
          return {
            message: {
              ...message,
              content: [
                { type: "thinking", thinking: "Retained first thought" },
                { type: "text", text: "Visible replacement answer" },
              ],
            },
          }
        })
      },
    ],
  })
  host.queueResponse(
    start,
    thoughtStart(0),
    thoughtDelta(0, "First original"),
    thoughtEnd(0, "First original"),
    thoughtStart(2),
    thoughtDelta(2, "Second original"),
    { pause: true },
    thoughtEnd(2, "Second original"),
    done,
    end,
  )
  await host.type("Replace the run")
  await host.key("\r")
  const screen = () => host.screenLines().map(stripTerminalSequences).join("\n")
  await t.waitFor(() => assert.match(screen(), /Second original/))
  host.resumeResponse()
  await host.settled()
  await host.frame()
  assert.match(
    screen(),
    /Worked for \d+m \d+s ▶[\s\S]*Visible replacement answer/,
  )
  assert.doesNotMatch(
    screen(),
    /Retained first thought|First original|Second original/,
  )
  await host.key("\x1bg")
  await host.key("\r")
  await host.frame()
  assert.match(
    screen(),
    /Retained first thought[\s\S]*Visible replacement answer/,
  )
})

test("interleaved Completions text does not end a thought before Pi reports completion", async (t) => {
  const host = await openNativeHost(t, { extensionPaths: [chat], rows: 32 })
  host.queueResponse(
    chunk({ role: "assistant", reasoning_content: "Thinking before" }),
    { pause: true },
    chunk({ content: "Visible text" }),
    { pause: true },
    chunk({ reasoning_content: " and after text" }),
    { pause: true },
    chunk({}, "stop"),
    { event: "[DONE]" },
    end,
  )
  await host.type("Interleave response parts")
  await host.key("\r")
  const screen = () => host.screenLines().map(stripTerminalSequences).join("\n")
  await t.waitFor(() => assert.match(screen(), /Thinking before/))
  host.resumeResponse()
  await t.waitFor(() => assert.match(screen(), /Visible text/))
  assert.match(screen(), /Thinking before/)
  host.resumeResponse()
  await t.waitFor(() =>
    assert.match(screen(), /Thinking before and after text/),
  )
  host.resumeResponse()
  await host.settled()
  await host.frame()
  assert.match(screen(), /Worked for \d+m \d+s ▶[\s\S]*Visible text/)
  assert.doesNotMatch(screen(), /Thinking before/)
})
