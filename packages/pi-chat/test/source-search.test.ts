import assert from "node:assert/strict"
import { writeFile } from "node:fs/promises"
import { join } from "node:path"
import test from "node:test"
import { stripTerminalSequences, Text } from "@earendil-works/pi-tui"
import { createReadToolDefinition } from "@earendil-works/pi-coding-agent"
import { openNativeHost } from "../../../fixtures/native-host.ts"

/* oxlint-disable eslint/no-control-regex -- Assert Pi's native terminal highlight sequences. */

const chat = new URL("../src/index.ts", import.meta.url).pathname
const delta = (content: string, tool?: string) => ({
  event: {
    choices: [
      {
        index: 0,
        delta: {
          role: "assistant",
          content,
          ...(tool
            ? {
                tool_calls: [
                  {
                    index: 0,
                    id: "read-one",
                    type: "function",
                    function: {
                      name: "read",
                      arguments: JSON.stringify({ path: tool }),
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

test("native Find reveals a matching occurrence inside closed work", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    rows: 34,
    keybindings: { "tui.altScreen.search": "ctrl+f" },
  })
  await writeFile(join(host.directory, "one.txt"), "tool output")
  host.queueResponse(
    delta("Hidden telescope", "one.txt"),
    finish("tool_calls"),
    done,
  )
  host.queueResponse(delta("Final response"), finish(), done)
  await host.type("Look up the text")
  await host.key("\r")
  await host.settled()
  const before = await host.frame()
  assert.match(before, /▸ Worked/)
  assert.doesNotMatch(before, /Hidden telescope/)

  await host.key("\x06")
  await host.type("telescope")
  await host.frame()
  const screen = host.screenLines().map(stripTerminalSequences).join("\n")
  assert.match(screen, /▾ Worked/)
  assert.match(screen, /Hidden telescope/)
  assert.match(screen, /1\/1/)
  const matched = host
    .screenLines()
    .find((line) => stripTerminalSequences(line).includes("Hidden telescope"))
  assert.match(matched ?? "", /\x1b\[48;5;52m[^\n]*telescope/)
})

test("Find opens a closed tool group and keeps the native result presenter", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    rows: 40,
    keybindings: { "tui.altScreen.search": "ctrl+f" },
  })
  await writeFile(join(host.directory, "one.txt"), "ordinary output")
  await writeFile(join(host.directory, "two.txt"), "rare telescope output")
  host.queueResponse(
    {
      event: {
        choices: [
          {
            index: 0,
            delta: {
              role: "assistant",
              tool_calls: ["one.txt", "two.txt"].map((path, index) => ({
                index,
                id: `read-${index}`,
                type: "function",
                function: { name: "read", arguments: JSON.stringify({ path }) },
              })),
            },
            finish_reason: null,
          },
        ],
      },
    },
    finish("tool_calls"),
    done,
  )
  host.queueResponse(delta("Finished"), finish(), done)
  await host.type("Read two files")
  await host.key("\r")
  await host.settled()
  assert.match(await host.frame(), /▸ Worked/)

  await host.key("\x06")
  await host.type("telescope")
  await host.frame()
  const screen = host.screenLines().map(stripTerminalSequences).join("\n")
  assert.match(screen, /▾ Worked/)
  assert.match(screen, /▾ 2 tool calls/)
  assert.match(screen, /rare telescope output/)
  assert.match(screen, /1\/1/)
  const result = host
    .screenLines()
    .find((line) =>
      stripTerminalSequences(line).includes("rare telescope output"),
    )
  assert.match(result ?? "", /\x1b\[48;5;52m[^\n]*telescope/)
})

test("Find includes the native tool-call name", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    rows: 34,
    keybindings: { "tui.altScreen.search": "ctrl+f" },
  })
  await writeFile(join(host.directory, "one.txt"), "ordinary output")
  host.queueResponse(delta("", "one.txt"), finish("tool_calls"), done)
  host.queueResponse(delta("Done"), finish(), done)
  await host.type("Run the tool")
  await host.key("\r")
  await host.settled()
  await host.key("\x06")
  await host.type("read")
  await host.frame()
  assert.match(
    host.screenLines().map(stripTerminalSequences).join("\n"),
    /1\/1/,
  )
  const call = host
    .screenLines()
    .find((line) => stripTerminalSequences(line).includes("read one.txt"))
  assert.match(call ?? "", /\x1b\[48;5;52m[^\n]*read/)
})

test("Find searches original tool argument values with escapes", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    rows: 34,
    keybindings: { "tui.altScreen.search": "ctrl+f" },
  })
  const path = 'C:\\work\\file".txt'
  await writeFile(join(host.directory, path), "ordinary output")
  host.queueResponse(delta("", path), finish("tool_calls"), done)
  host.queueResponse(delta("Done"), finish(), done)
  await host.type("Run the tool")
  await host.key("\r")
  await host.settled()
  await host.key("\x06")
  await host.type(path)
  assert.match(await host.frame(), /1\/1/)
})

test("Find searches readable Markdown and literal command syntax", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    rows: 40,
    keybindings: { "tui.altScreen.search": "ctrl+f" },
  })
  host.queueResponse(
    delta(
      "**Bright** [telescope](https://hidden.example/secret-path)\n\n```sh\nprintf 'orbit'\n```\n\n- **alpha** comet\n- beta planet\n\n| Header | Value |\n| --- | --- |\n| gamma | telescope |\n\n> first galaxy\n> second galaxy",
    ),
    finish(),
    done,
  )
  await host.type("Describe it")
  await host.key("\r")
  await host.settled()
  const query = async (value: string) => {
    await host.key("\x06")
    await host.type(value)
    await host.frame()
    return host.screenLines().map(stripTerminalSequences).join("\n")
  }
  assert.match(await query("Bright telescope"), /1\/1/)
  const label = host
    .screenLines()
    .find(
      (line) =>
        stripTerminalSequences(line).includes("Bright telescope") &&
        !stripTerminalSequences(line).includes("│"),
    )
  assert.match(label ?? "", /\x1b\[48;5;52m[^\n]*Bright/)
  assert.match(label ?? "", /\x1b\[48;5;52m[^\n]*telescope/)
  await host.key("\x1b")
  assert.match(await query("printf 'orbit'"), /1\/1/)
  await host.key("\x1b")
  assert.match(await query("alpha comet"), /1\/1/)
  await host.key("\x1b")
  assert.match(await query("gamma telescope"), /1\/1/)
  await host.key("\x1b")
  assert.match(await query("first galaxy second galaxy"), /1\/1/)
  await host.key("\x1b")
  assert.match(await query("secret-path"), /No matches/)
})

for (const { name, source, rendered, escaped, escapedQuery } of [
  {
    name: "code span",
    source: "[a `b]` c](https://hidden.example/secret-path)",
    rendered: "a b] c",
    escaped: false,
    escapedQuery: "",
  },
  {
    name: "escaped brackets and code span",
    source: "[a \\[x\\] `b]` c](https://hidden.example/secret-path)",
    rendered: "a [x] b] c",
    escaped: true,
    escapedQuery: "[x]",
  },
  {
    name: "escaped closing bracket and code span",
    source: "[a \\] `b]` c](https://hidden.example/secret-path)",
    rendered: "a ] b] c",
    escaped: true,
    escapedQuery: "",
  },
  {
    name: "escaped brackets and double-backtick code span",
    source: "[a \\[x\\] ``b]`` c](https://hidden.example/secret-path)",
    rendered: "a [x] b] c",
    escaped: true,
    escapedQuery: "[x]",
  },
] as const) {
  test(`Find includes an entire Markdown link label with ${name}`, async (t) => {
    const host = await openNativeHost(t, {
      extensionPaths: [chat],
      rows: 34,
      keybindings: { "tui.altScreen.search": "ctrl+f" },
    })
    host.queueResponse(delta(source), finish(), done)
    await host.type("Show link")
    await host.key("\r")
    await host.settled()
    assert.ok((await host.frame()).includes(rendered))

    const query = async (value: string) => {
      await host.key("\x06")
      await host.type(value)
      const frame = await host.frame()
      const lines = host.screenLines()
      await host.key("\x1b")
      return { frame, lines }
    }
    const code = await query("b]")
    assert.match(code.frame, /1\/1/)
    if (!escaped) assert.match(code.lines.join("\n"), /\x1b\[48;5;52m[^\n]*b\]/)
    assert.match((await query("c")).frame, /1\/1/)
    if (escapedQuery) assert.match((await query(escapedQuery)).frame, /1\/1/)
    assert.match((await query("secret-path")).frame, /No matches/)
  })
}

test("native Find navigation keeps duplicate occurrences distinct", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    rows: 32,
    keybindings: {
      "tui.altScreen.search": "ctrl+f",
      "tui.altScreen.searchPrevious": "ctrl+p",
    },
  })
  host.queueResponse(delta("Orbit and orbit"), finish(), done)
  await host.type("Repeat")
  await host.key("\r")
  await host.settled()
  await host.key("\x06")
  await host.type("orbit")
  assert.match(await host.frame(), /1\/2/)
  await host.key("\r")
  assert.match(await host.frame(), /2\/2/)
  await host.key("\x10")
  assert.match(await host.frame(), /1\/2/)
})

test("Find highlights the owning call when a custom renderer omits source text", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    persistSession: true,
    rows: 40,
    keybindings: { "tui.altScreen.search": "ctrl+f" },
    extensionFactories: [
      (pi) =>
        pi.registerTool({
          ...createReadToolDefinition("."),
          name: "mystery",
          label: "Mystery",
          renderCall: () => new Text("CUSTOM CALL", 0, 0),
          renderResult: () => new Text("CUSTOM RESULT", 0, 0),
        }),
    ],
  })
  await writeFile(join(host.directory, "secret.txt"), "unrendered telescope")
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
                  id: "custom",
                  type: "function",
                  function: {
                    name: "mystery",
                    arguments: JSON.stringify({
                      path: join(host.directory, "secret.txt"),
                    }),
                  },
                },
              ],
            },
            finish_reason: null,
          },
        ],
      },
    },
    finish("tool_calls"),
    done,
  )
  host.queueResponse(delta("Done"), finish(), done)
  await host.type("Read it")
  await host.key("\r")
  await host.settled()
  await host.key("\x06")
  await host.type("telescope")
  await host.frame()
  const lines = host.screenLines()
  const call = lines.find((line) =>
    stripTerminalSequences(line).includes("CUSTOM CALL"),
  )
  assert.match(lines.map(stripTerminalSequences).join("\n"), /1\/1/)
  assert.match(call ?? "", /\x1b\[48;5;52m/)
  assert.doesNotMatch(
    lines.map(stripTerminalSequences).join("\n"),
    /unrendered telescope/,
  )
  await host.key("\x1b")
  const file = host.session.sessionFile!
  host.session.sessionManager.appendCompaction("Compressed context", null, 100)
  await host.runtime.newSession()
  await host.runtime.switchSession(file)
  assert.doesNotMatch(await host.frame(), /CUSTOM CALL/)
  await host.key("\x06")
  await host.type("telescope")
  await host.frame()
  const retained = host.screenLines()
  assert.match(retained.map(stripTerminalSequences).join("\n"), /1\/1/)
  assert.match(
    retained.find((line) =>
      stripTerminalSequences(line).includes("CUSTOM CALL"),
    ) ?? "",
    /\x1b\[48;5;52m/,
  )
})

test("Find opens work history for a thought body or an extracted activity heading", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    providerApi: "openai-responses",
    rows: 38,
    settings: { hideThinkingBlock: true },
    keybindings: { "tui.altScreen.search": "ctrl+f" },
  })
  const reasoning = "**Investigating optics**\n\nThe hidden telescope"
  host.queueResponse(
    { event: { type: "response.created", response: { id: "reply" } } },
    {
      event: {
        type: "response.output_item.added",
        output_index: 0,
        item: { type: "reasoning", id: "thought", summary: [] },
      },
    },
    {
      event: {
        type: "response.reasoning_summary_text.delta",
        output_index: 0,
        delta: reasoning,
      },
    },
    {
      event: {
        type: "response.output_item.done",
        output_index: 0,
        item: {
          type: "reasoning",
          id: "thought",
          summary: [{ type: "summary_text", text: reasoning }],
        },
      },
    },
    {
      event: {
        type: "response.output_item.added",
        output_index: 1,
        item: { type: "message", id: "answer", role: "assistant", content: [] },
      },
    },
    {
      event: {
        type: "response.output_text.delta",
        output_index: 1,
        content_index: 0,
        delta: "Answer",
      },
    },
    {
      event: {
        type: "response.output_item.done",
        output_index: 1,
        item: {
          type: "message",
          id: "answer",
          role: "assistant",
          content: [{ type: "output_text", text: "Answer" }],
        },
      },
    },
    {
      event: {
        type: "response.completed",
        response: { id: "reply", status: "completed" },
      },
    },
    { end: true },
  )
  await host.type("Think")
  await host.key("\r")
  await host.settled()
  const before = await host.frame()
  assert.match(before, /▸ Worked/)
  assert.doesNotMatch(before, /The hidden telescope/)
  await host.key("\x06")
  await host.type("optics")
  await host.frame()
  const headingHit = host.screenLines().map(stripTerminalSequences).join("\n")
  assert.match(headingHit, /1\/1/)
  assert.match(headingHit, /▾ Worked[\s\S]*The hidden telescope/)
  assert.doesNotMatch(headingHit, /Investigating optics/)
  await host.key("\x1b")
  await host.key("\x06")
  await host.type("telescope")
  await host.frame()
  const lines = host.screenLines()
  assert.match(lines.map(stripTerminalSequences).join("\n"), /1\/1/)
  assert.match(
    lines.map(stripTerminalSequences).join("\n"),
    /▾ Worked[\s\S]*The hidden telescope/,
  )
  const thought = lines.find((line) =>
    stripTerminalSequences(line).includes("The hidden telescope"),
  )
  assert.match(thought ?? "", /\x1b\[48;5;52m[^\n]*telescope/)
})

test("Find refreshes results as a represented assistant message streams", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    rows: 32,
    keybindings: { "tui.altScreen.search": "ctrl+f" },
  })
  host.queueResponse(
    delta("First"),
    { pause: true },
    delta(" telescope"),
    { pause: true },
    finish(),
    done,
  )
  await host.type("Stream")
  await host.key("\r")
  await t.waitFor(() =>
    assert.match(
      host.screenLines().map(stripTerminalSequences).join("\n"),
      /First/,
    ),
  )
  await host.key("\x06")
  await host.type("telescope")
  assert.match(await host.frame(), /No matches/)
  host.resumeResponse()
  await t.waitFor(() =>
    assert.match(
      host.screenLines().map(stripTerminalSequences).join("\n"),
      /First telescope/,
    ),
  )
  assert.equal(host.session.isStreaming, true)
  assert.match(await host.frame(), /1\/1/)
  host.resumeResponse()
  await host.settled()
  await host.frame()
  const lines = host.screenLines()
  assert.match(lines.map(stripTerminalSequences).join("\n"), /1\/1/)
  const match = lines.find((line) =>
    stripTerminalSequences(line).includes("First telescope"),
  )
  assert.match(match ?? "", /\x1b\[48;5;52m[^\n]*telescope/)
})

test("Find excludes source text outside the active branch after tree navigation", async (t) => {
  let target = ""
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    rows: 32,
    keybindings: { "tui.altScreen.search": "ctrl+f" },
    extensionFactories: [
      (pi) =>
        pi.registerCommand("test-tree", {
          handler: async (_args, ctx) => {
            await ctx.navigateTree(target)
          },
        }),
    ],
  })
  host.queueResponse(delta("Old telescope"), finish(), done)
  await host.type("Old request")
  await host.key("\r")
  await host.settled()
  const request = host.session.sessionManager
    .getBranch()
    .find((entry) => entry.type === "message" && entry.message.role === "user")
  assert(request)
  target = request.id
  await host.key("\x06")
  await host.type("telescope")
  assert.match(await host.frame(), /1\/1/)
  await host.key("\x1b")
  await host.type("/test-tree")
  await host.key("\r")
  assert.doesNotMatch(await host.frame(), /Old telescope/)
  await host.key("\x06")
  await host.type("telescope")
  assert.match(await host.frame(), /No matches/)
})

test("Find indexes the literal native shell command and output", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    rows: 32,
    keybindings: { "tui.altScreen.search": "ctrl+f" },
  })
  await host.type("!printf 'shell-telescope'")
  await host.key("\r")
  await t.waitFor(() => {
    assert(
      host.session.sessionManager
        .getBranch()
        .some(
          (entry) =>
            entry.type === "message" &&
            entry.message.role === "bashExecution" &&
            entry.message.output.includes("shell-telescope"),
        ),
    )
  })
  await host.key("\x06")
  await host.type("printf 'shell-telescope'")
  assert.match(await host.frame(), /1\/1/)
  await host.key("\x1b")
  await host.key("\x06")
  await host.type("shell-telescope")
  assert.match(await host.frame(), /1\/2/)
  await host.key("\r")
  assert.match(await host.frame(), /2\/2/)
})

test("Find scrolls a bounded tool body to the selected source occurrence", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    rows: 30,
    keybindings: { "tui.altScreen.search": "ctrl+f" },
  })
  await writeFile(
    join(host.directory, "large.txt"),
    Array.from({ length: 90 }, (_, index) =>
      index === 82 ? "row-82 telescope" : `row-${index} ordinary`,
    ).join("\n"),
  )
  host.queueResponse(delta("Reading", "large.txt"), finish("tool_calls"), done)
  host.queueResponse(delta("Done"), finish(), done)
  await host.type("Read the file")
  await host.key("\r")
  await host.settled()
  assert.doesNotMatch(await host.frame(), /row-82 telescope/)
  await host.key("\x06")
  await host.type("telescope")
  await host.frame()
  const lines = host.screenLines()
  assert.match(lines.map(stripTerminalSequences).join("\n"), /row-82 telescope/)
  const selected = lines.find((line) =>
    stripTerminalSequences(line).includes("row-82 telescope"),
  )
  assert.match(selected ?? "", /\x1b\[48;5;52m[^\n]*telescope/)
})

test("Find uses native case, Unicode, and whitespace matching", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    rows: 32,
    keybindings: { "tui.altScreen.search": "ctrl+f" },
  })
  host.queueResponse(delta("Café   🪐 orbit"), finish(), done)
  await host.type("Describe")
  await host.key("\r")
  await host.settled()
  await host.key("\x06")
  await host.type("CAFÉ 🪐 ORBIT")
  await host.frame()
  assert.match(
    host.screenLines().map(stripTerminalSequences).join("\n"),
    /1\/1/,
  )
  const match = host
    .screenLines()
    .find((line) => stripTerminalSequences(line).includes("Café"))
  assert.match(match ?? "", /\x1b\[48;5;52m/)
})

test("Find reveals a retained message before Pi's compaction summary", async (t) => {
  let native: unknown
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    persistSession: true,
    rows: 44,
    keybindings: { "tui.altScreen.search": "ctrl+f" },
    onMount: (mode) => {
      native = mode
    },
  })
  host.queueResponse(delta("Earlier answer"), finish(), done)
  await host.type("archival-needle request")
  await host.key("\r")
  await host.settled()
  const file = host.session.sessionFile!
  host.session.sessionManager.appendCompaction("Compressed context", null, 100)
  await host.runtime.newSession()
  await host.runtime.switchSession(file)
  assert.doesNotMatch(await host.frame(), /archival-needle/)
  ;(
    native as { headerContainer: { addChild(component: Text): void } }
  ).headerContainer.addChild(new Text("Native header marker", 0, 0))

  await host.key("\x06")
  await host.type("archival-needle")
  const frame = await host.frame()
  assert.match(frame, /1\/1/)
  assert.match(frame, /archival-needle/)
  const screen = host.screenLines().map(stripTerminalSequences).join("\n")
  assert.ok(
    screen.indexOf("archival-needle") < screen.indexOf("Compacted from"),
  )
  assert.ok(
    screen.indexOf("Native header marker") < screen.indexOf("archival-needle"),
  )
  await host.key("\x1b")
  host.queueResponse(delta("New answer"), finish(), done)
  await host.type("New request")
  await host.key("\r")
  await host.settled()
  assert.doesNotMatch(JSON.stringify(host.requests.at(-1)), /archival-needle/)
})

test("revealing a retained user row does not add it to native editor history", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    persistSession: true,
    rows: 40,
    keybindings: { "tui.altScreen.search": "ctrl+f" },
  })
  host.queueResponse(delta("Seed answer"), finish(), done)
  await host.type("Seed request")
  await host.key("\r")
  await host.settled()
  const original = host.session.sessionManager
    .getBranch()
    .find((entry) => entry.type === "message" && entry.message.role === "user")
  assert(original?.type === "message" && original.message.role === "user")
  host.session.sessionManager.appendMessage({
    ...original.message,
    // Keep the match below Pi's search overlay in the recording terminal.
    content: "Earlier context\n\nMore context\n\nhistory-needle request",
  })
  const file = host.session.sessionFile!
  host.session.sessionManager.appendCompaction("Compressed context", null, 100)
  await host.runtime.newSession()
  await host.runtime.switchSession(file)

  await host.key("\x06")
  await host.type("history-needle")
  assert.match(await host.frame(), /1\/1/)
  const matched = host
    .screenLines()
    .find((line) =>
      stripTerminalSequences(line).includes("history-needle request"),
    )
  assert(matched, host.screenLines().map(stripTerminalSequences).join("\n"))
  assert.equal(
    stripTerminalSequences(matched).indexOf("history-needle request"),
    host.terminal.columns - "history-needle request".length - 1,
  )
  assert.match(matched, /\x1b\[48;5;52m[^\n]*history-needle/)
  await host.key("\x1b")
  await host.key("\x1b[A")
  await host.frame()
  assert.doesNotMatch(
    host.screenLines().slice(-6).map(stripTerminalSequences).join("\n"),
    /history-needle/,
  )
})

test("Find reopens a hidden retained thought using the native Markdown environment", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    persistSession: true,
    rows: 42,
    settings: { hideThinkingBlock: true },
    keybindings: { "tui.altScreen.search": "ctrl+f" },
    extensionFactories: [
      (pi) => {
        pi.registerMarkdownTransformer((markdown, context) =>
          context.messageType === "assistant-thinking"
            ? markdown.replaceAll("source-", "shown-")
            : markdown,
        )
        pi.on("message_end", ({ message }) => {
          if (message.role !== "assistant") return
          return {
            message: {
              ...message,
              content: [
                { type: "thinking", thinking: "source-historical telescope" },
                { type: "text", text: "Visible answer" },
              ],
            },
          }
        })
      },
    ],
  })
  host.queueResponse(delta("Original answer"), finish(), done)
  await host.type("Think about history")
  await host.key("\r")
  await host.settled()
  const file = host.session.sessionFile!
  host.session.sessionManager.appendCompaction("Compressed context", null, 100)
  await host.runtime.newSession()
  await host.runtime.switchSession(file)
  assert.doesNotMatch(await host.frame(), /historical telescope/)

  await host.key("\x06")
  await host.type("historical")
  await host.frame()
  const lines = host.screenLines()
  const screen = lines.map(stripTerminalSequences).join("\n")
  assert.match(screen, /1\/1/)
  assert.match(screen, /shown-historical/)
  const thought = lines.find((line) =>
    stripTerminalSequences(line).includes("shown-historical"),
  )
  assert.match(thought ?? "", /\x1b\[48;5;52m[^\n]*historical/)
})

test("Find restores separate retained calls with reused IDs and their own results", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    persistSession: true,
    rows: 50,
    keybindings: { "tui.altScreen.search": "ctrl+f" },
  })
  await writeFile(join(host.directory, "first.txt"), "first-needle output")
  await writeFile(join(host.directory, "second.txt"), "second-needle output")
  const run = async (prompt: string, file: string) => {
    host.queueResponse(delta("", file), finish("tool_calls"), done)
    host.queueResponse(delta(`Completed ${prompt}`), finish(), done)
    await host.type(prompt)
    await host.key("\r")
    await host.settled()
  }
  await run("First request", "first.txt")
  await run("Second request", "second.txt")
  const requests = host.requests.length
  const file = host.session.sessionFile!
  host.session.sessionManager.appendCompaction("Compressed context", null, 100)
  await host.runtime.newSession()
  await host.runtime.switchSession(file)
  assert.doesNotMatch(await host.frame(), /first-needle|second-needle/)

  await host.key("\x06")
  await host.type("first-needle")
  assert.match(await host.frame(), /1\/1/)
  assert.match(
    host.screenLines().map(stripTerminalSequences).join("\n"),
    /read first\.txt[\s\S]*first-needle output/,
  )
  await host.key("\x1b")
  await host.key("\x06")
  await host.type("second-needle")
  assert.match(await host.frame(), /1\/1/)
  const screen = host.screenLines().map(stripTerminalSequences).join("\n")
  assert.match(screen, /read second\.txt[\s\S]*second-needle output/)
  assert.doesNotMatch(screen, /2 tool calls/)
  assert.equal(host.requests.length, requests)
})

test("native global tool expansion reaches a revealed retained call", async (t) => {
  let native: { setToolsExpanded(expanded: boolean): void } | undefined
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    persistSession: true,
    rows: 44,
    keybindings: { "tui.altScreen.search": "ctrl+f" },
    onMount: (mode) => {
      native = mode as unknown as typeof native
    },
  })
  await writeFile(
    join(host.directory, "older.txt"),
    "retained-tool-needle output",
  )
  host.queueResponse(delta("", "older.txt"), finish("tool_calls"), done)
  host.queueResponse(delta("Done"), finish(), done)
  await host.type("Read older file")
  await host.key("\r")
  await host.settled()
  const file = host.session.sessionFile!
  host.session.sessionManager.appendCompaction("Compressed context", null, 100)
  await host.runtime.newSession()
  await host.runtime.switchSession(file)

  await host.key("\x06")
  await host.type("retained-tool-needle")
  assert.match(await host.frame(), /retained-tool-needle output/)
  await host.key("\x1b")
  assert(native)
  native.setToolsExpanded(true)
  assert.match(await host.frame(), /retained-tool-needle output/)
  native.setToolsExpanded(false)
  assert.doesNotMatch(await host.frame(), /retained-tool-needle output/)
})

test("Find includes displayed native custom messages before and after compaction", async (t) => {
  let send: (() => void) | undefined
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    persistSession: true,
    rows: 42,
    keybindings: { "tui.altScreen.search": "ctrl+f" },
    extensionFactories: [
      (pi) => {
        pi.registerMessageRenderer(
          "historical-notice",
          () => new Text("Current custom renderer", 0, 0),
        )
        send = () => {
          pi.sendMessage(
            {
              customType: "historical-notice",
              content: "custom-needle source",
              display: true,
            },
            { triggerTurn: false },
          )
          pi.sendMessage(
            {
              customType: "historical-notice",
              content: "private-needle metadata",
              display: false,
            },
            { triggerTurn: false },
          )
        }
      },
    ],
  })
  assert(send)
  host.queueResponse(delta("Seed answer"), finish(), done)
  await host.type("Seed session")
  await host.key("\r")
  await host.settled()
  send()
  assert.match(await host.frame(), /Current custom renderer/)
  assert.match(
    JSON.stringify(host.session.sessionManager.getBranch()),
    /custom-needle/,
  )
  await host.key("\x06")
  await host.type("custom-needle")
  assert.match(await host.frame(), /1\/1/)
  await host.key("\x1b")
  const file = host.session.sessionFile!
  host.session.sessionManager.appendCompaction("Compressed context", null, 100)
  await host.runtime.newSession()
  await host.runtime.switchSession(file)
  assert.doesNotMatch(await host.frame(), /Current custom renderer/)
  assert.match(
    JSON.stringify(host.session.sessionManager.getBranch()),
    /custom-needle/,
  )

  await host.key("\x06")
  await host.type("custom-needle")
  assert.match(await host.frame(), /1\/1/)
  assert.match(
    host.screenLines().map(stripTerminalSequences).join("\n"),
    /Current custom renderer/,
  )
  await host.key("\x1b")
  await host.key("\x06")
  await host.type("private-needle")
  assert.match(await host.frame(), /No matches/)
})

test("revealing retained history leaves a live native tool result attached", async (t) => {
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  t.after(() => release())
  let started = false
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    persistSession: true,
    rows: 44,
    keybindings: { "tui.altScreen.search": "ctrl+f" },
    extensionFactories: [
      (pi) =>
        pi.registerTool({
          ...createReadToolDefinition("."),
          name: "wait",
          label: "Wait",
          execute: async () => {
            started = true
            await gate
            return {
              content: [{ type: "text", text: "live-result needle" }],
              details: {},
            }
          },
        }),
    ],
  })
  host.queueResponse(delta("Old answer"), finish(), done)
  await host.type("archival-needle request")
  await host.key("\r")
  await host.settled()
  const file = host.session.sessionFile!
  host.session.sessionManager.appendCompaction("Compressed context", null, 100)
  await host.runtime.newSession()
  await host.runtime.switchSession(file)
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
                  id: "live-call",
                  type: "function",
                  function: {
                    name: "wait",
                    arguments: '{"path":"live.txt"}',
                  },
                },
              ],
            },
            finish_reason: null,
          },
        ],
      },
    },
    finish("tool_calls"),
    done,
  )
  host.queueResponse(delta("Live work done"), finish(), done)
  await host.type("Run live work")
  await host.key("\r")
  await t.waitFor(() => assert.equal(started, true))
  assert.equal(host.session.isStreaming, true)
  await host.key("\x06")
  await host.type("archival-needle")
  assert.match(await host.frame(), /1\/1/)
  await host.key("\x1b")
  release()
  await host.settled()
  await host.key("\x06")
  await host.type("live-result")
  assert.match(await host.frame(), /1\/1/)
  assert.match(
    host.screenLines().map(stripTerminalSequences).join("\n"),
    /live-result needle/,
  )
})

test("Find keeps source order when selecting a retained assistant's calls backward", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    persistSession: true,
    rows: 50,
    keybindings: { "tui.altScreen.search": "ctrl+f" },
  })
  await writeFile(join(host.directory, "one.txt"), "one-needle output")
  await writeFile(join(host.directory, "two.txt"), "two-needle output")
  host.queueResponse(
    {
      event: {
        choices: [
          {
            index: 0,
            delta: {
              role: "assistant",
              tool_calls: ["one.txt", "two.txt"].map((path, index) => ({
                index,
                id: `same-${index}`,
                type: "function",
                function: { name: "read", arguments: JSON.stringify({ path }) },
              })),
            },
            finish_reason: null,
          },
        ],
      },
    },
    finish("tool_calls"),
    done,
  )
  host.queueResponse(delta("Done"), finish(), done)
  await host.type("Read both")
  await host.key("\r")
  await host.settled()
  const file = host.session.sessionFile!
  host.session.sessionManager.appendCompaction("Compressed context", null, 100)
  await host.runtime.newSession()
  await host.runtime.switchSession(file)

  await host.key("\x06")
  await host.type("two-needle")
  assert.match(await host.frame(), /1\/1/)
  await host.key("\x1b")
  await host.key("\x06")
  await host.type("one-needle")
  assert.match(await host.frame(), /1\/1/)
  const screen = host.screenLines().map(stripTerminalSequences).join("\n")
  assert.match(screen, /2 tool calls/)
  assert.match(screen, /one-needle output/)
  assert.match(screen, /two-needle output/)
  assert.ok(
    screen.indexOf("one-needle output") < screen.indexOf("two-needle output"),
  )
})

test("historical presenters clear on reload and branch navigation", async (t) => {
  let target = ""
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    persistSession: true,
    rows: 42,
    keybindings: { "tui.altScreen.search": "ctrl+f" },
    extensionFactories: [
      (pi) =>
        pi.registerCommand("test-tree", {
          handler: async (_args, ctx) => {
            await ctx.navigateTree(target)
          },
        }),
    ],
  })
  host.queueResponse(delta("Old answer"), finish(), done)
  await host.type("archival-needle request")
  await host.key("\r")
  await host.settled()
  const user = host.session.sessionManager
    .getBranch()
    .find((entry) => entry.type === "message" && entry.message.role === "user")
  assert(user?.parentId)
  target = user.parentId
  const file = host.session.sessionFile!
  host.session.sessionManager.appendCompaction("Compressed context", null, 100)
  await host.runtime.newSession()
  await host.runtime.switchSession(file)

  await host.key("\x06")
  await host.type("archival-needle")
  assert.match(await host.frame(), /1\/1/)
  await host.key("\x1b")
  await host.reload()
  assert.doesNotMatch(await host.frame(), /archival-needle/)
  await host.key("\x06")
  await host.type("archival-needle")
  assert.match(await host.frame(), /1\/1/)
  await host.key("\x1b")
  await host.type("/test-tree")
  await host.key("\r")
  assert.doesNotMatch(await host.frame(), /archival-needle/)
  await host.key("\x06")
  await host.type("archival-needle")
  assert.match(await host.frame(), /No matches/)
})

test("retained aborted and failed calls keep Pi's historical error display", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    persistSession: true,
    rows: 44,
    keybindings: { "tui.altScreen.search": "ctrl+f" },
  })
  await writeFile(join(host.directory, "seed.txt"), "seed output")
  host.queueResponse(delta("", "seed.txt"), finish("tool_calls"), done)
  host.queueResponse(delta("Done"), finish(), done)
  await host.type("Read seed")
  await host.key("\r")
  await host.settled()
  const assistant = host.session.sessionManager
    .getBranch()
    .find(
      (entry) =>
        entry.type === "message" &&
        entry.message.role === "assistant" &&
        entry.message.content.some((part) => part.type === "toolCall"),
    )
  assert(
    assistant?.type === "message" && assistant.message.role === "assistant",
  )
  const call = assistant.message.content.find(
    (part) => part.type === "toolCall",
  )
  assert(call?.type === "toolCall")
  for (const [stopReason, path, errorMessage] of [
    ["aborted", "abort-needle", undefined],
    ["error", "error-needle", "Historical failure"],
  ] as const)
    host.session.sessionManager.appendMessage({
      ...assistant.message,
      stopReason,
      ...(errorMessage ? { errorMessage } : {}),
      content: [{ ...call, id: path, arguments: { path } }],
    })
  const file = host.session.sessionFile!
  host.session.sessionManager.appendCompaction("Compressed context", null, 100)
  await host.runtime.newSession()
  await host.runtime.switchSession(file)

  await host.key("\x06")
  await host.type("abort-needle")
  assert.match(await host.frame(), /1\/1/)
  assert.match(
    host.screenLines().map(stripTerminalSequences).join("\n"),
    /Operation aborted/,
  )
  await host.key("\x1b")
  await host.key("\x06")
  await host.type("error-needle")
  assert.match(await host.frame(), /1\/1/)
  assert.match(
    host.screenLines().map(stripTerminalSequences).join("\n"),
    /Historical failure/,
  )
})
