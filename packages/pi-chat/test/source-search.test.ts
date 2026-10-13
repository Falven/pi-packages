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
})

test("Find opens a closed thought at its source occurrence", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    providerApi: "openai-responses",
    rows: 38,
    settings: { hideThinkingBlock: true },
    keybindings: { "tui.altScreen.search": "ctrl+f" },
  })
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
        delta: "The hidden telescope",
      },
    },
    {
      event: {
        type: "response.output_item.done",
        output_index: 0,
        item: {
          type: "reasoning",
          id: "thought",
          summary: [{ type: "summary_text", text: "The hidden telescope" }],
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
  await host.type("telescope")
  await host.frame()
  const lines = host.screenLines()
  assert.match(lines.map(stripTerminalSequences).join("\n"), /1\/1/)
  assert.match(
    lines.map(stripTerminalSequences).join("\n"),
    /▾ Worked[\s\S]*▾ Thought[\s\S]*The hidden telescope/,
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
  await t.waitFor(() =>
    assert.match(
      host.screenLines().map(stripTerminalSequences).join("\n"),
      /shell-telescope/,
    ),
  )
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
