import assert from "node:assert/strict"
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import { createReadToolDefinition } from "@earendil-works/pi-coding-agent"
import {
  getNativeClipboard,
  stripTerminalSequences,
  type NativeClipboard,
  visibleWidth,
} from "@earendil-works/pi-tui"
import {
  activityType,
  type ActivityUpdate,
} from "../src/tool-adapters/activity-contract.ts"
import { activityDetails } from "../../../fixtures/activity.ts"
import { openNativeHost } from "../../../fixtures/native-host.ts"

const chat = new URL("../src/index.ts", import.meta.url).pathname
function assertWritableClipboard(
  clipboard: NativeClipboard | undefined,
): asserts clipboard is NativeClipboard &
  Required<Pick<NativeClipboard, "setText">> {
  assert(clipboard?.setText)
}
const response = (
  content: string,
  name?: string,
  args: unknown = { path: "original-argument" },
) => [
  {
    event: {
      choices: [
        {
          index: 0,
          delta: {
            role: "assistant",
            content,
            ...(name
              ? {
                  tool_calls: [
                    {
                      index: 0,
                      id: `call-${name}`,
                      type: "function",
                      function: {
                        name,
                        arguments: JSON.stringify(args),
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
  },
  {
    event: {
      choices: [
        { index: 0, delta: {}, finish_reason: name ? "tool_calls" : "stop" },
      ],
    },
  },
  { event: "[DONE]" },
]

test("pending calls stay out of activity until dispatch and retain generic outcomes", async (t) => {
  let received = false
  let started = false
  const gate = Promise.withResolvers<void>()
  t.after(() => gate.resolve())
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    rows: 80,
    extensionFactories: [
      (pi) => {
        pi.on("message_update", ({ assistantMessageEvent }) => {
          if ("partial" in assistantMessageEvent)
            received ||= assistantMessageEvent.partial.content.some(
              (part) => part.type === "toolCall",
            )
        })
        pi.registerTool({
          name: "inspect_workspace",
          label: "Inspect workspace",
          description: "An unrelated tool without activity metadata",
          parameters: createReadToolDefinition(".").parameters,
          async execute() {
            started = true
            await gate.promise
            return {
              content: [{ type: "text", text: "Inspection result" }],
              details: undefined,
            }
          },
        })
      },
    ],
  })
  const steps = response("", "inspect_workspace")
  host.queueResponse(steps[0]!, { pause: true }, ...steps.slice(1))
  host.queueResponse(...response("Finished"))
  const work = host.session.prompt("Inspect the workspace")
  await t.waitFor(() => assert(received))
  await host.key("\x0f")
  await host.frame()
  const screen = () => host.screenLines().map(stripTerminalSequences).join("\n")
  assert.equal(started, false)
  assert.doesNotMatch(
    screen(),
    /Called|Calling|status unknown|inspect_workspace/,
  )
  host.resumeResponse()
  await t.waitFor(() => assert(started))
  await host.frame()
  assert.match(screen(), /Calling inspect_workspace/)
  assert.equal(
    screen()
      .split("\n")
      .find((line) => line.trimStart().startsWith("▼ "))
      ?.trim(),
    "▼ Calling inspect_workspace",
  )
  gate.resolve()
  await work
  await host.frame()
  assert.match(screen(), /Called inspect_workspace/)
  assert.doesNotMatch(screen(), /status unknown/)
})

test("cancellation and unknown historical outcomes remain visible after reload", async (t) => {
  let received = false
  let executions = 0
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    rows: 80,
    persistSession: true,
    extensionFactories: [
      (pi) => {
        pi.on("message_update", ({ assistantMessageEvent }) => {
          if ("partial" in assistantMessageEvent)
            received ||= assistantMessageEvent.partial.content.some(
              (part) => part.type === "toolCall",
            )
        })
        pi.registerTool({
          name: "inspect_workspace",
          label: "Inspect workspace",
          description: "Unrelated tool",
          parameters: createReadToolDefinition(".").parameters,
          async execute() {
            executions++
            return {
              content: [{ type: "text", text: "Result" }],
              details: undefined,
            }
          },
        })
      },
    ],
  })
  const steps = response("", "inspect_workspace")
  host.queueResponse(steps[0]!, { pause: true }, ...steps.slice(1))
  const work = host.session.prompt("Inspect the workspace")
  await t.waitFor(() => assert(received))
  await host.frame()
  assert.match(
    host.screenLines().map(stripTerminalSequences).join("\n"),
    /─+ [^\n]*Thinking/,
  )
  await host.session.abort()
  await work
  await host.key("\x0f")
  await host.frame()
  const screen = () => host.screenLines().map(stripTerminalSequences).join("\n")
  assert.equal(executions, 0)
  assert.match(screen(), /Called inspect_workspace \(failed\)/)
  assert.doesNotMatch(screen(), /Called a tool/)
  assert.match(screen(), /Operation aborted/)
  assert.doesNotMatch(screen(), /─+ [^\n]*(Thinking|Working)/)
  await host.reload()
  await host.key("\x0f")
  await host.key("\x0f")
  await host.frame()
  assert.match(screen(), /Called inspect_workspace \(failed\)/)
  assert.doesNotMatch(screen(), /Called a tool/)
  assert.equal(executions, 0)
  const source = host.session.messages.find(
    (message) => message.role === "assistant",
  )
  assert(source?.role === "assistant")
  const historical: typeof source = {
    ...source,
    stopReason: "toolUse",
    content: [
      {
        type: "toolCall",
        id: "unobserved",
        name: "unobserved_job",
        arguments: {},
      },
    ],
  }
  delete historical.errorMessage
  host.session.sessionManager.appendMessage({
    role: "user",
    content: "Unobserved history",
    timestamp: Date.now(),
  })
  host.session.sessionManager.appendMessage(historical)
  await host.reload()
  await host.frame()
  assert.match(screen(), /Called unobserved_job \(status unknown\)/)
  assert.match(screen(), /Called a tool/)
  assert.equal(executions, 0)
  host.session.sessionManager.appendMessage({
    role: "toolResult",
    toolCallId: "unobserved",
    toolName: "unobserved_job",
    content: [{ type: "text", text: "Retained result" }],
    isError: false,
    timestamp: Date.now(),
  })
  await host.reload()
  await host.frame()
  assert.match(
    screen(),
    /Called a tool[\s\S]*Called unobserved_job[\s\S]*Retained result/,
  )
  assert.doesNotMatch(screen(), /status unknown/)
  assert.equal(executions, 0)
})

test("native reads and an unrelated command provider share skill labels and retain source Find", async (t) => {
  const catalog = await mkdtemp(join(tmpdir(), "pi-chat-skills-"))
  t.after(() => rm(catalog, { recursive: true, force: true }))
  const directory = join(catalog, "review")
  const path = join(directory, "SKILL.md")
  let replaceReads = false
  let replacements = 0
  await mkdir(directory)
  await writeFile(
    path,
    "---\nname: review\ndescription: Review work\n---\nInspect the requested work.\n",
  )
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    skillPaths: [catalog],
    rows: 110,
    persistSession: true,
    keybindings: { "tui.altScreen.search": "ctrl+f" },
    extensionFactories: [
      (pi) =>
        pi.registerTool({
          name: "opaque_read",
          label: "Opaque read",
          description: "An independent activity publisher",
          parameters: createReadToolDefinition(".").parameters,
          async execute(callId, _args, _signal, _onUpdate, ctx) {
            const content = [
              { type: "text" as const, text: "opaque-source-needle" },
            ]
            const update: ActivityUpdate = {
              version: 1,
              id: "opaque-read-source",
              callId,
              sessionId: ctx.sessionManager.getSessionId(),
              revision: 1,
              operations: [
                {
                  id: callId,
                  order: 0,
                  revision: 1,
                  kind: "command",
                  commands: [`cat '${path}'`],
                  status: "completed",
                  output: "Independent skill contents.",
                },
              ],
            }
            return { content, details: activityDetails(update, content) }
          },
        }),
      (pi) => {
        if (replaceReads)
          pi.registerTool({
            ...createReadToolDefinition("."),
            async execute() {
              replacements++
              return {
                content: [{ type: "text", text: "Replacement tool output" }],
                details: undefined,
              }
            },
          })
      },
    ],
  })
  host.queueResponse(...response("", "read", { path }))
  host.queueResponse(
    { pause: true },
    ...response("", "bash", {
      command: `printf '\\n--- skill ---\\n'; cat '${path}'`,
    }),
  )
  host.queueResponse({ pause: true }, ...response("", "opaque_read"))
  host.queueResponse({ pause: true }, ...response("Finished"))
  const work = host.session.prompt("Read the registered skill")
  for (const requests of [2, 3, 4]) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- Check each native/declared skill read before the next request proceeds.
    await t.waitFor(() => assert.equal(host.requests.length, requests))
    // oxlint-disable-next-line eslint/no-await-in-loop -- Paint the paused native indicator.
    await host.frame()
    assert.match(
      host.screenLines().map(stripTerminalSequences).join("\n"),
      /─+ [^\n]*Reading review skill/,
    )
    assert(
      host
        .screenLines()
        .some(
          (line) =>
            stripTerminalSequences(line).trim() === "> Reading review skill",
        ),
    )
    host.resumeResponse()
  }
  await work
  await host.frame()
  await host.key("\x0f")
  await host.frame()
  const screen = () => host.screenLines().map(stripTerminalSequences).join("\n")
  assert.equal((screen().match(/▼ Read review skill/g) ?? []).length, 3)
  await host.key("\x06")
  await host.type("opaque-source-needle")
  await host.frame()
  assert.match(screen(), /1\/1/)
  assert.match(screen(), /opaque_read/)
  await host.key("\x1b")
  await host.frame()
  assert.doesNotMatch(screen(), /opaque-source-needle|opaque_read/)
  assert.equal((screen().match(/▼ Read review skill/g) ?? []).length, 3)
  replaceReads = true
  await host.reload()
  await host.key("\x0f")
  await host.key("\x0f")
  await host.frame()
  assert.equal((screen().match(/▼ Read review skill/g) ?? []).length, 3)
  host.queueResponse(...response("", "read", { path }))
  host.queueResponse(...response("Finished"))
  await host.session.prompt("Use the replacement")
  await host.frame()
  await host.key("\x0f")
  await host.key("\x0f")
  await host.frame()
  assert.match(screen(), /▼ Called read/)
  assert.equal((screen().match(/▼ Read review skill/g) ?? []).length, 3)
  const requests = host.requests.length
  const fork = await host.runtime.fork(
    host.session.sessionManager.getLeafId()!,
    { position: "at" },
  )
  assert.equal(fork.cancelled, false)
  await host.key("\x0f")
  await host.key("\x0f")
  await host.frame()
  assert.match(screen(), /▼ Called read/)
  assert.equal((screen().match(/▼ Read review skill/g) ?? []).length, 3)
  assert.equal(host.requests.length, requests)
  assert.equal(replacements, 1)
})

test("an unrelated provider presents semantic operations and late updates without tool-name mappings", async (t) => {
  const clipboard = getNativeClipboard()
  assertWritableClipboard(clipboard)
  const copied: string[] = []
  t.mock.method(clipboard, "setText", async (text: string) => {
    copied.push(text)
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
  const longOutput =
    Array.from(
      { length: 240 },
      (_, index) => `  generic-evidence ${index}`,
    ).join("\n") + "\n"
  let publish: ((operations?: ActivityUpdate["operations"]) => void) | undefined
  const runningCommand = {
    id: "job-command",
    order: 0,
    revision: 1,
    kind: "command" as const,
    commands: ["printf generic-evidence"],
    status: "running" as const,
    output: "generic-evidence",
  }
  let initial: ActivityUpdate["operations"] | undefined
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    rows: 140,
    columns: 110,
    persistSession: true,
    settings: { fullscreenCopyOnSelect: false },
    keybindings: { "tui.altScreen.search": "ctrl+f" },
    extensionFactories: [
      (pi) => {
        pi.registerEntryRenderer(activityType, () => undefined)
        pi.registerTool({
          parameters: createReadToolDefinition(".").parameters,
          description: "A provider with its own name and semantic activity",
          name: "opaque_job",
          label: "Opaque job",
          async execute(callId, _args, _signal, _onUpdate, ctx) {
            const update: ActivityUpdate = {
              version: 1,
              id: "unrelated-work",
              callId,
              sessionId: ctx.sessionManager.getSessionId(),
              revision: 1,
              operations: initial ?? [
                {
                  ...runningCommand,
                  output: `\x1b[31m${longOutput}\x1b[0m`,
                },
              ],
            }
            let revision = update.revision
            publish = (
              operations = [
                {
                  ...update.operations[0]!,
                  status: "failed",
                  output: "late-generic-failure",
                },
              ],
            ) => {
              const later: ActivityUpdate = {
                ...update,
                revision: ++revision,
                operations: operations.map((operation) => ({
                  ...operation,
                  revision,
                })),
              }
              pi.events.emit(activityType, later)
              pi.appendEntry(activityType, { activity: later })
            }
            const content = [
              { type: "text" as const, text: "original transport result" },
            ]
            pi.events.emit(activityType, update)
            return { content, details: activityDetails(update, content) }
          },
        })
      },
    ],
  })
  host.queueResponse(...response("", "opaque_job"))
  const final = response("Finished")
  host.queueResponse(
    { pause: true },
    final[0]!,
    { pause: true },
    ...final.slice(1),
  )
  const work = host.session.prompt("Start work")
  await t.waitFor(() => assert.equal(host.requests.length, 2))
  const screen = () => host.screenLines().map(stripTerminalSequences).join("\n")
  const header = () =>
    screen()
      .split("\n")
      .find((line) => line.trimStart().startsWith("> "))
      ?.trim()
  const click = async (text: string, label?: string) => {
    await host.frame()
    const lines = host.screenLines().map(stripTerminalSequences)
    const start = lines.findIndex((line) => line.includes(text))
    assert(start >= 0, `Missing ${text}\n${lines.join("\n")}`)
    const row = label
      ? lines.findIndex(
          (line, index) =>
            index >= start &&
            (line.includes(label) || line.trim() === "[Copied]"),
        )
      : start
    assert(row >= 0, `Missing ${label}`)
    const column = label
      ? lines[row]!.indexOf(lines[row]!.includes(label) ? label : "[Copied]") +
        1
      : 3
    await host.key(`\x1b[<0;${column};${row + 1}M`)
    await host.key(`\x1b[<0;${column};${row + 1}m`)
    await host.frame()
  }
  const status = async (label: string, groupLabel = label) => {
    await host.frame()
    const indicator = host
      .screenLines()
      .map(stripTerminalSequences)
      .findLast((line) => line.startsWith("── "))
    assert(
      indicator?.includes(label),
      `Expected working label ${label}, got ${indicator}`,
    )
    assert(indicator)
    assert.doesNotMatch(indicator, /Working|opaque_job/)
    assert.equal(header(), `> ${groupLabel}`)
  }
  await status("Running printf generic-evidence")
  host.terminal.resize(24, 140)
  await host.frame()
  assert.match(header()!, /^> Running printf.*\.\.\.$/)
  assert.doesNotMatch(header()!, /generic-evidence/)
  host.terminal.resize(110, 140)
  await status("Running printf generic-evidence")
  assert.doesNotMatch(screen(), /\[Copy (?:command|output)\]/)
  await click("> Running printf generic-evidence")
  await click("> Running printf generic-evidence")
  assert.match(screen(), /\[Copy command\]/)
  assert.doesNotMatch(screen(), /generic-evidence 239/)
  await click("printf generic-evidence", "[Copy output]")
  await t.waitFor(() => assert.equal(copied.at(-1), longOutput))
  assert.match(screen(), /▼ Running printf generic-evidence/)
  assert.doesNotMatch(screen(), /generic-evidence 239/)
  assert(publish)
  publish([
    {
      id: "job-command",
      order: 0,
      revision: 1,
      kind: "command",
      commands: ["printf generic-evidence"],
      status: "running",
      output: "  updated output\nsecond line\n",
    },
  ])
  await host.frame()
  await host.key("\r")
  await t.waitFor(() =>
    assert.equal(copied.at(-1), "  updated output\nsecond line\n"),
  )
  await click("▼ Running printf generic-evidence")
  await host.key("\x14")
  await status("Running printf generic-evidence")
  await host.key("\x14")
  assert(publish)
  publish([{ ...runningCommand, commands: [" \n "] }])
  await status("Running command")
  publish([runningCommand])
  await status("Running printf generic-evidence")
  const firstRead = {
    id: "read-a",
    order: 1,
    revision: 1,
    kind: "command" as const,
    commands: ["head /tmp/first.log"],
    status: "running" as const,
  }
  const lastRead = {
    id: "read-b",
    order: 2,
    revision: 1,
    kind: "command" as const,
    commands: ["tail /tmp/second.log"],
    status: "running" as const,
  }
  publish([firstRead, lastRead])
  await status("Reading second.log")
  publish([{ ...lastRead, status: "completed" }])
  await status("Reading first.log")
  publish([{ ...firstRead, status: "completed" }])
  await status("Reading second.log")
  const edit = {
    id: "edit",
    order: 3,
    revision: 1,
    kind: "edit" as const,
    path: "example.ts",
    status: "running" as const,
  }
  publish([edit])
  await status("Editing files")
  publish([{ ...edit, status: "completed" }])
  await status("Running printf generic-evidence")
  for (const [order, command, label] of [
    [4, "rg needle ./packages", "Searching files in packages folder"],
    [5, "rg needle", "Searching for needle"],
    [6, "rg", "Searching files"],
    [7, "ls ./packages", "Listing files in packages folder"],
    [8, "ls", "Listing files"],
    [9, "cat /tmp/pi-command-red.log", "Reading pi-command-red.log"],
  ] as const) {
    publish([
      {
        id: `explore-${order}`,
        order,
        revision: 1,
        kind: "command",
        commands: [command],
        status: "completed",
      },
    ])
    // oxlint-disable-next-line eslint/no-await-in-loop -- Observe each published operation in source order.
    await status(label)
  }
  host.resumeResponse()
  await t.waitFor(() => assert.match(screen(), /Finished/))
  await status("Thinking", "Edited a file, read files, running a command")
  host.resumeResponse()
  await work
  await host.frame()
  await host.key("\x0f")
  await host.frame()
  const before = host.screenLines().map(stripTerminalSequences).join("\n")
  assert.match(before, /printf generic-evidence/)
  assert.doesNotMatch(
    before,
    /opaque_job|original-argument|original transport result/,
  )
  publish()
  await host.frame()
  const after = host.screenLines().map(stripTerminalSequences).join("\n")
  assert.match(after, /late-generic-failure/)
  assert.match(after, /Ran command \(failed\)/)
  assert.match(after, /^\s*▼ Edited a file, read files, ran a command\s*$/m)
  assert.doesNotMatch(after, /─+ [^\n]*(Thinking|Working|Running)/)
  assert.equal((after.match(/late-generic-failure/g) ?? []).length, 1)
  await click("printf generic-evidence", "[Copy output]")
  await t.waitFor(() => assert.equal(copied.at(-1), "late-generic-failure"))
  publish([
    {
      id: "job-command",
      order: 0,
      revision: 1,
      kind: "command",
      commands: ["printf generic-evidence"],
      status: "failed",
      output: "  retained failure\n",
      outputOmitted: true,
    },
    {
      id: "call-error",
      order: 10,
      revision: 1,
      kind: "output",
      status: "failed",
      output: "actual call error\n",
      outputOmitted: true,
    },
  ])
  await host.frame()
  await host.key("\r")
  await t.waitFor(() =>
    assert.equal(copied.at(-1), "  retained failure\n\nactual call error\n"),
  )
  assert.match(await host.frame(), /Only retained output copied/)
  assert.doesNotMatch(copied.at(-1)!, /Earlier|omitted|Call error/)
  publish([
    {
      id: "job-command",
      order: 0,
      revision: 1,
      kind: "command",
      commands: ["printf generic-evidence"],
      status: "failed",
      output: "late-generic-failure",
    },
    {
      id: "call-error",
      order: 10,
      revision: 1,
      kind: "output",
      status: "completed",
    },
  ])
  await host.frame()
  const patch = "@@ -1 +1,2 @@\n context\n+added\n"
  publish([
    {
      ...edit,
      status: "failed",
      files: [
        { id: "first", path: "first.ts", status: "completed", output: patch },
        {
          id: "second",
          path: "second.ts",
          status: "completed",
          changes: { added: 2, removed: 0 },
          output: "+beta\n+  delta\n",
        },
        {
          id: "failure",
          path: "failure.ts",
          status: "failed",
          output: "- permission denied\n",
        },
        {
          id: "counted",
          path: "counted.ts",
          status: "completed",
          changes: { added: 7, removed: 2 },
          output: "Saved without retained diff",
        },
        {
          id: "omitted",
          path: "omitted.ts",
          status: "completed",
          outputOmitted: true,
        },
      ],
    },
    {
      id: "shared-command",
      order: 11,
      revision: 1,
      kind: "command",
      status: "completed",
      commands: ["printf first-operation", "printf second-operation"],
      output: "shared operation output\n",
    },
  ])
  await host.frame()
  assert.equal((screen().match(/\[Copy diff\]/g) ?? []).length, 2)
  await click("Edited first.ts", "[Copy diff]")
  assert.equal(copied.at(-1), patch)
  await click("Edited second.ts", "[Copy diff]")
  assert.equal(copied.at(-1), "+beta\n+  delta\n")
  await click("failure.ts", "[Copy output]")
  assert.equal(copied.at(-1), "- permission denied\n")
  await click("Edited counted.ts", "[Copy output]")
  assert.equal(copied.at(-1), "Saved without retained diff")
  const writes = copied.length
  await click("Edited omitted.ts", "[Copy output]")
  assert.equal(copied.length, writes)
  await click("printf first-operation", "[Copy output]")
  assert.equal(copied.at(-1), "shared operation output\n")
  await click("printf second-operation", "[Copy output]")
  assert.equal(copied.at(-1), "shared operation output\n")
  await click("printf second-operation", "[Copy command]")
  assert.equal(copied.at(-1), "printf second-operation")
  const fork = await host.runtime.fork(
    host.session.sessionManager.getLeafId()!,
    { position: "at" },
  )
  assert.equal(fork.cancelled, false)
  await host.key("\x06")
  await host.type("late-generic-failure")
  await host.frame()
  const inherited = host.screenLines().map(stripTerminalSequences).join("\n")
  assert.match(inherited, /1\/1/)
  assert.match(inherited, /late-generic-failure/)
  await host.key("\x1b")
  await host.key("\x06")
  await host.type("Copy command")
  assert.match(await host.frame(), /No matches/)

  await host.key("\x1b")
  await host.runtime.newSession()
  const file = {
    id: "single-file",
    path: "single.ts",
    status: "completed" as const,
    output:
      Array.from({ length: 40 }, (_, index) => `patch-row-${index}`).join(
        "\n",
      ) + "\npatch-visible-needle",
  }
  const singlePatch = {
    id: "patch",
    order: 0,
    revision: 1,
    kind: "edit" as const,
    status: "completed" as const,
    files: [file],
  }
  initial = [singlePatch]
  host.queueResponse(...response("", "opaque_job"))
  host.queueResponse(...response("Patch finished"))
  await host.session.prompt("Verify patch provenance")
  await host.frame()
  const workRow = host
    .screenLines()
    .findIndex((line) => /Worked for .*▶/.test(stripTerminalSequences(line)))
  assert(workRow >= 0)
  await host.key(`\x1b[<0;2;${workRow + 1}M`)
  await host.key(`\x1b[<0;2;${workRow + 1}m`)
  await host.frame()
  assert.doesNotMatch(screen(), /Edited a file/)
  assert.match(screen(), /Edited single\.ts/)
  publish([
    {
      ...singlePatch,
      status: "failed",
      files: [{ ...file, status: "unattempted" }],
    },
  ])
  await host.frame()
  assert.doesNotMatch(screen(), /Edited a file/)
  assert.match(screen(), /Not edited single\.ts \(not attempted\)/)
  const source = JSON.stringify(host.session.messages)
  const requests = host.requests.length
  for (const outcome of ["running", "unknown", "unattempted"] as const) {
    publish([{ ...singlePatch, status: outcome }])
    // oxlint-disable-next-line eslint/no-await-in-loop -- Each operation revision must receive a fresh visible frame.
    await host.frame()
    assert.match(screen(), /Edited a file/)
  }
  publish([
    {
      id: singlePatch.id,
      order: 0,
      revision: 1,
      kind: "edit",
      status: "completed",
      path: "single.ts",
    },
  ])
  await host.frame()
  assert.match(screen(), /Edited a file/)
  publish([{ ...singlePatch, files: [] }])
  await host.frame()
  assert.doesNotMatch(screen(), /Edited|single\.ts|Worked/)
  publish([singlePatch])
  await host.frame()
  assert.doesNotMatch(screen(), /Edited a file/)
  assert.match(screen(), /Edited single\.ts/)
  assert.equal(JSON.stringify(host.session.messages), source)
  assert.equal(host.requests.length, requests)
  const clickItem = async (pattern: RegExp) => {
    await host.frame()
    const row = host
      .screenLines()
      .findIndex((line) => pattern.test(stripTerminalSequences(line)))
    assert(row >= 0, screen())
    await host.key(`\x1b[<0;2;${row + 1}M`)
    await host.key(`\x1b[<0;2;${row + 1}m`)
    await host.frame()
  }
  const select = async (text: string) => {
    await host.frame()
    const lines = host.screenLines().map(stripTerminalSequences)
    const row = lines.findIndex((line) => line.includes(text))
    assert(row >= 0, screen())
    const column = lines[row]!.indexOf(text) + 1
    await host.key(`\x1b[<0;${column};${row + 1}M`)
    await host.key(`\x1b[<32;${column + text.length};${row + 1}M`)
    await host.key(`\x1b[<0;${column + text.length};${row + 1}m`)
    copied.length = 0
    await host.key("\x18")
    await t.waitFor(() => assert.equal(copied.at(-1), text))
  }
  await host.key("\x0f")
  await clickItem(/Worked for .*▶/)
  assert.match(screen(), /> Edited single\.ts/)
  await clickItem(/> Edited single\.ts/)
  assert.doesNotMatch(screen(), /patch-visible-needle/)
  await clickItem(/^\s*single\.ts\s*$/)
  assert.match(screen(), /patch-visible-needle/)
  const multiple = {
    ...singlePatch,
    files: [
      file,
      {
        ...file,
        id: "second-file",
        path: "other.ts",
        output: "OTHER PATCH BODY",
      },
    ],
  }
  publish([multiple])
  await host.frame()
  assert.match(screen(), /> Edited files/)
  assert.doesNotMatch(screen(), /Edited single\.ts|patch-visible-needle/)
  await clickItem(/> Edited files/)
  assert.match(
    screen(),
    /▼ Edited single\.ts[\s\S]*patch-visible-needle[\s\S]*> Edited other\.ts/,
  )
  await host.key("\x1b")
  host.terminal.resize(110, 24)
  await host.frame()
  await host.key("\x1b[<64;3;10M")
  await host.key("\x1b[<64;3;10M")
  await host.frame()
  const anchor = host
    .screenLines()
    .map(stripTerminalSequences)
    .find((line) => /patch-row-\d/.test(line))
    ?.match(/patch-row-\d+/)?.[0]
  assert(anchor)
  await select(anchor)
  const anchorFrame = screen()
  publish([singlePatch])
  await host.frame()
  assert.equal(
    host
      .screenLines()
      .map(stripTerminalSequences)
      .find((line) => /patch-row-\d/.test(line))
      ?.match(/patch-row-\d+/)?.[0],
    anchor,
    `${anchorFrame}\nAFTER WRAPPER REMOVAL\n${screen()}`,
  )
  copied.length = 0
  await host.key("\x18")
  await t.waitFor(() => assert.equal(copied.at(-1), anchor))
  host.terminal.resize(110, 140)
  await host.frame()
  assert.doesNotMatch(screen(), /Edited a file|Edited files/)
  assert.match(screen(), /patch-visible-needle/)
  publish([multiple])
  await host.frame()
  assert.match(screen(), /▼ Edited files[\s\S]*patch-visible-needle/)
  await select("▼ Edited files")
  publish([singlePatch])
  await host.frame()
  copied.length = 0
  await host.key("\x18")
  await t.waitFor(() => assert.equal(copied.at(-1), "Patch finished"))
  publish([multiple])
  await host.frame()
  await clickItem(/▼ Edited files/)
  publish([singlePatch])
  await host.frame()
  assert.match(screen(), /patch-visible-needle/)
  await host.key("\x1b")
  await host.key("\x06")
  await host.type("patch-visible-needle")
  await t.waitFor(async () => assert.match(await host.frame(), /1\/1/), {
    timeout: 2000,
  })
  await host.key("\x1b")
  publish([multiple])
  await host.frame()
  assert.match(screen(), /> Edited files/)
  assert.doesNotMatch(screen(), /patch-visible-needle/)
  assert.equal(JSON.stringify(host.session.messages), source)
  assert.equal(host.requests.length, requests)

  await host.runtime.newSession()
  const earlierCommand = {
    id: "running-command",
    order: 0,
    revision: 1,
    kind: "command" as const,
    commands: ["printf command-evidence"],
    status: "running" as const,
  }
  initial = [earlierCommand]
  host.queueResponse(...response("", "opaque_job"))
  const later = response("Later activity")
  host.queueResponse(later[0]!, { pause: true }, ...later.slice(1))
  const running = host.session.prompt("Keep earlier running work grouped")
  await t.waitFor(() => assert.equal(host.requests.length, requests + 2))
  await host.frame()
  assert.match(screen(), /> Running a command[\s\S]*Later activity/)
  assert.doesNotMatch(screen(), /Running printf/)
  publish([{ ...earlierCommand, status: "failed" }])
  await host.frame()
  assert.equal(host.session.isStreaming, true)
  assert.match(
    screen(),
    /> Ran printf command-evidence \(failed\)[\s\S]*Later activity/,
  )
  assert.doesNotMatch(screen(), /Ran a command/)
  publish([{ ...earlierCommand, status: "unknown" }])
  await host.frame()
  assert.match(screen(), /> Ran a command[\s\S]*Later activity/)
  host.resumeResponse()
  await running
  await host.reload()
  await host.frame()
  const unknownWorkRow = host
    .screenLines()
    .findIndex((line) => /Worked for .*▶/.test(stripTerminalSequences(line)))
  assert(unknownWorkRow >= 0)
  await host.key(`\x1b[<0;2;${unknownWorkRow + 1}M`)
  await host.key(`\x1b[<0;2;${unknownWorkRow + 1}m`)
  assert.match(await host.frame(), /> Ran a command/)

  /* oxlint-disable eslint/no-await-in-loop -- Native edit outcomes are observed in separate sessions in order. */
  for (const operation of [
    {
      name: "write",
      args: { path: "native.ts", content: "native file" },
      label: /> Edited native\.ts/,
    },
    {
      name: "edit",
      args: {
        path: "native.ts",
        oldText: "missing old text",
        newText: "new text",
      },
      label: /> Edit failed: native\.ts/,
    },
  ]) {
    await host.runtime.newSession()
    host.queueResponse(...response("", operation.name, operation.args))
    host.queueResponse(...response("Native edit finished"))
    await host.session.prompt("Inspect the native edit outcome")
    await clickItem(/Worked for .*▶/)
    assert.match(screen(), operation.label)
    assert.doesNotMatch(screen(), /Edited a file/)
  }
  /* oxlint-enable eslint/no-await-in-loop */
})

for (const legacy of [false, true])
  test(`Find temporarily reveals retained source for ${legacy ? "old output metadata" : "an explicitly empty activity"}`, async (t) => {
    let calls = 0
    const host = await openNativeHost(t, {
      extensionPaths: [chat],
      rows: 70,
      persistSession: true,
      keybindings: { "tui.altScreen.search": "ctrl+f" },
      extensionFactories: [
        (pi) =>
          pi.registerTool({
            name: "gather_receipt",
            label: "Gather receipt",
            description: "Collect existing work",
            parameters: createReadToolDefinition(".").parameters,
            async execute(callId, _args, _signal, _onUpdate, ctx) {
              calls++
              const content = [
                { type: "text" as const, text: "retained-poll-needle" },
              ]
              return {
                content,
                details: activityDetails(
                  {
                    version: 1,
                    id: "empty-source",
                    callId,
                    sessionId: ctx.sessionManager.getSessionId(),
                    revision: 1,
                    operations: legacy
                      ? [
                          {
                            id: "legacy-output",
                            order: 0,
                            revision: 1,
                            kind: "output",
                            status: "completed",
                            output: "old-result-body",
                          },
                        ]
                      : [],
                  },
                  content,
                ),
              }
            },
          }),
      ],
    })
    host.queueResponse(...response("", "gather_receipt"))
    host.queueResponse(...response("Finished"))
    await host.type("Collect existing work")
    await host.key("\r")
    await host.settled()
    await host.frame()
    await host.key("\x0f")
    await host.frame()
    assert.doesNotMatch(
      host.screenLines().join("\n"),
      /gather_receipt|retained-poll-needle|old-result-body/,
    )
    const messages = () =>
      host.session.sessionManager
        .getBranch()
        .filter((entry) => entry.type === "message")
    const before = JSON.stringify(messages())
    const requests = host.requests.length
    await host.key("\x06")
    await host.type("retained-poll-needle")
    await host.frame()
    let screen = host.screenLines().map(stripTerminalSequences).join("\n")
    assert.match(screen, /1\/1/)
    assert.match(screen, /gather_receipt/)
    assert.match(screen, /retained-poll-needle/)
    await host.key("\x1b")
    await host.frame()
    assert.doesNotMatch(
      host.screenLines().join("\n"),
      /gather_receipt|retained-poll-needle|old-result-body/,
    )
    assert.equal(JSON.stringify(messages()), before)
    await host.reload()
    await host.key("\x06")
    await host.type("original-argument")
    await host.frame()
    screen = host.screenLines().map(stripTerminalSequences).join("\n")
    assert.match(screen, /1\/1/)
    assert.match(screen, /gather_receipt/)
    assert.match(screen, /path: original-argument/)
    await host.key("\x1b")
    const file = host.session.sessionFile!
    host.session.sessionManager.appendCompaction(
      "Compressed context",
      null,
      100,
    )
    await host.runtime.newSession()
    await host.runtime.switchSession(file)
    await host.key("\x06")
    await host.type("retained-poll-needle")
    await host.frame()
    screen = host.screenLines().map(stripTerminalSequences).join("\n")
    assert.match(screen, /1\/1/)
    assert.match(screen, /retained-poll-needle/)
    assert.equal(calls, 1)
    assert.equal(host.requests.length, requests)
    await host.key("\x1b")
    const leaf = host.session.sessionManager.getLeafId()!
    const fork = await host.runtime.fork(leaf, { position: "at" })
    assert.equal(fork.cancelled, false)
    await host.frame()
    await host.key("\x0f")
    await host.frame()
    assert.doesNotMatch(
      host.screenLines().join("\n"),
      /gather_receipt|retained-poll-needle|old-result-body/,
    )
    await host.key("\x06")
    await host.type("retained-poll-needle")
    await host.frame()
    assert.match(
      host.screenLines().map(stripTerminalSequences).join("\n"),
      /1\/1/,
    )
    assert.equal(calls, 1)
  })

test("processed output invalidates metadata and cannot regain an earlier live body", async (t) => {
  let publish: (() => void) | undefined
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    rows: 60,
    extensionFactories: [
      (pi) => {
        pi.on("tool_result", (event) =>
          event.toolName === "transformed_job"
            ? { content: [{ type: "text", text: "sanitized-only" }] }
            : undefined,
        )
        pi.registerTool({
          name: "transformed_job",
          label: "Transformed job",
          description: "A transformed result",
          parameters: createReadToolDefinition(".").parameters,
          async execute(callId, _args, _signal, _onUpdate, ctx) {
            const update: ActivityUpdate = {
              version: 1,
              id: "transformed-work",
              callId,
              sessionId: ctx.sessionManager.getSessionId(),
              revision: 1,
              operations: [
                {
                  id: "hidden-body",
                  order: 0,
                  revision: 1,
                  kind: "command",
                  commands: ["printf discarded-body"],
                  status: "completed",
                  output: "discarded-body",
                },
              ],
            }
            const content = [
              { type: "text" as const, text: "original transport" },
            ]
            pi.events.emit(activityType, update)
            publish = () =>
              pi.events.emit(activityType, {
                ...update,
                revision: 2,
                operations: update.operations.map((item) => ({
                  ...item,
                  revision: 2,
                })),
              })
            return { content, details: activityDetails(update, content) }
          },
        })
      },
    ],
  })
  host.queueResponse(...response("", "transformed_job"))
  host.queueResponse(...response("Finished"))
  await host.type("Transform the result")
  await host.key("\r")
  await host.settled()
  await host.frame()
  await host.key("\x0f")
  assert(publish)
  publish()
  await host.frame()
  const screen = host.screenLines().map(stripTerminalSequences).join("\n")
  assert.match(screen, /transformed_job/)
  assert.match(screen, /sanitized-only/)
  assert.doesNotMatch(screen, /discarded-body|original transport/)
})

test("declared command actions use the app parser and retain full command bodies", async (t) => {
  const clipboard = getNativeClipboard()
  assertWritableClipboard(clipboard)
  const copied: string[] = []
  let clipboardWrite: (() => Promise<void>) | undefined
  t.mock.method(clipboard, "setText", async (text: string) => {
    copied.push(text)
    await clipboardWrite?.()
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
  const multiline = "printf 'first\\n'\n  printf \"second  value\\n\"\n"
  const uncertain = [
    "false || cat SKILL.md",
    "cat SKILL.md > result.txt",
    'cat "$HOME/SKILL.md"',
    "cat $(pwd)/SKILL.md",
    "cat *.md",
    "cat ~/SKILL.md",
    "cat 'incomplete",
    "cat one\\ file.md",
    "cat SKILL.md # comment",
    "unknown_command; cat SKILL.md",
    "cat one.md;; cat two.md",
    'for file in *.md; do cat "$file"; done',
    multiline,
  ]
  const commands = [
    "printf '\\n--- files ---\\n'; cat 'one file.md'; cat \"two.md\"",
    "cat 'literal$[];file.md'\ncat '~/SKILL.md'",
    "printf useful-output; cat notes.txt",
    "true && head -n 3 src/head.md",
    "tail -n+10 src/tail.md",
    "nl -ba src/numbered.ts | sed -n '1,20p'",
    "cd subdirectory; cat SKILL.md",
    'cat pre"fix"',
    "ls project/src",
    "rg -n Needle src/app",
    "git status --short",
    "node --test test.ts",
    ...uncertain,
  ]
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    rows: 300,
    columns: 160,
    persistSession: true,
    extensionFactories: [
      (pi) =>
        pi.registerTool({
          name: "command_report",
          label: "Command report",
          description: "An independent publisher of command facts",
          parameters: createReadToolDefinition(".").parameters,
          async execute(callId, _args, _signal, _onUpdate, ctx) {
            const content = [
              { type: "text" as const, text: "Command facts delivered" },
            ]
            const update: ActivityUpdate = {
              version: 1,
              id: "command-report",
              callId,
              sessionId: ctx.sessionManager.getSessionId(),
              revision: 1,
              operations: commands.map((command, order) => ({
                id: order === 1 ? "command-0:action:1" : `command-${order}`,
                order,
                revision: 1,
                kind: "command",
                commands: [command],
                status: "completed",
              })),
            }
            update.operations.push({
              id: "powershell-read",
              order: commands.length,
              revision: 1,
              kind: "command",
              commands: ["gc -LiteralPath 'docs/guide.md'"],
              shell: ["pwsh", "-c"],
              status: "completed",
            })
            update.operations.push({
              id: "failed-directory-change",
              order: commands.length + 1,
              revision: 1,
              kind: "command",
              commands: ["cd missing-declared-directory"],
              status: "failed",
              output: "Declared directory missing",
            })
            return { content, details: activityDetails(update, content) }
          },
        }),
    ],
  })
  await writeFile(join(host.directory, "native-edit.txt"), "context\nbefore\n")
  host.queueResponse(...response("", "command_report"))
  host.queueResponse(
    ...response("", "bash", { command: "cd missing-native-directory" }),
  )
  host.queueResponse(
    ...response("", "edit", {
      path: "native-edit.txt",
      edits: [{ oldText: "before", newText: "after" }],
    }),
  )
  host.queueResponse(...response("Finished"))
  await host.type("Inspect the command report")
  await host.key("\r")
  await host.settled()
  await host.frame()
  await host.key("\x0f")
  await host.frame()
  const screen = host.screenLines().map(stripTerminalSequences).join("\n")
  assert.match(screen, /▼ Read guide\.md/)
  assert.equal((screen.match(/▼ Read (?!files\b)/g) ?? []).length, 11)
  assert.equal(
    (screen.match(/▼ Ran command\s/g) ?? []).length,
    uncertain.length + 4,
  )
  assert.equal((screen.match(/▼ Ran command \(failed\)/g) ?? []).length, 2)
  assert.match(screen, /cd missing-native-directory/)
  assert.match(screen, /cd missing-declared-directory/)
  assert.match(screen, /Declared directory missing/)
  for (const target of [
    "one file.md",
    "two.md",
    "literal$[];file.md",
    "SKILL.md",
    "notes.txt",
    "head.md",
    "tail.md",
    "numbered.ts",
    "prefix",
  ])
    assert(screen.includes(`▼ Read ${target}`), target)
  for (const command of uncertain.slice(0, -1))
    assert(screen.includes(command), command)
  assert.match(screen, /git status --short/)
  assert.match(screen, /printf useful-output/)
  assert.match(screen, /Listed files in project/)
  assert.match(screen, /Searched for Needle in app/)
  assert.match(screen, /nl -ba src\/numbered\.ts \| sed -n '1,20p'/)
  assert.equal(
    (screen.match(/\[Copy command\]/g) ?? []).length,
    uncertain.length + 4,
  )
  assert.equal(
    (screen.match(/\[Copy output\]/g) ?? []).length,
    uncertain.length + 4,
  )
  const commandLines = host.screenLines().map(stripTerminalSequences)
  const commandRow = commandLines.findIndex((line) =>
    line.includes("printf 'first\\n'"),
  )
  assert(commandRow >= 0)
  const actionRow = commandLines.findIndex(
    (line, index) => index >= commandRow && line.includes("[Copy command]"),
  )
  const commandColumn = commandLines[actionRow]!.indexOf("[Copy command]") + 1
  await host.key(`\x1b[<0;${commandColumn};${actionRow + 1}M`)
  await host.key(`\x1b[<0;${commandColumn};${actionRow + 1}m`)
  await t.waitFor(() => assert.equal(copied.at(-1), multiline))
  assert.match(await host.frame(), /\[Copied\]/)
  const click = async (target: string, label: string) => {
    await host.frame()
    const lines = host.screenLines().map(stripTerminalSequences)
    const start = lines.findIndex((line) => line.includes(target))
    const row = lines.findIndex(
      (line, index) =>
        index >= start && (line.includes(label) || line.trim() === "[Copied]"),
    )
    assert(
      start >= 0 && row >= 0,
      `Missing ${target} ${label}\n${lines.filter((line) => line.trim()).join("\n")}`,
    )
    const column =
      lines[row]!.indexOf(lines[row]!.includes(label) ? label : "[Copied]") + 1
    await host.key(`\x1b[<0;${column};${row + 1}M`)
    await host.key(`\x1b[<0;${column};${row + 1}m`)
    await host.frame()
    return row
  }
  await click("cd missing-native-directory", "[Copy output]")
  assert.match(
    copied.at(-1)!,
    /cd: missing-native-directory: No such file or directory/,
  )
  assert.doesNotMatch(copied.at(-1)!, /Copy output|Ran command/)
  await click("Edited native-edit.txt", "[Copy diff]")
  assert.equal(
    copied.at(-1),
    "--- native-edit.txt\n+++ native-edit.txt\n@@ -1,2 +1,2 @@\n context\n-before\n+after\n",
  )
  assert.equal(
    (
      host
        .screenLines()
        .join("\n")
        .match(/\[Copy diff\]/g) ?? []
    ).length,
    0,
  )
  host.terminal.resize(18, 300)
  await host.frame()
  const narrow = host.screenLines().map(stripTerminalSequences)
  assert(narrow.every((line) => visibleWidth(line) <= 18))
  const narrowRow = narrow.findLastIndex((line) =>
    line.includes("[Copy command]"),
  )
  assert(narrowRow >= 0)
  const narrowColumn = narrow[narrowRow]!.indexOf("[Copy command]") + 1
  await host.key(`\x1b[<0;${narrowColumn};${narrowRow + 1}M`)
  await host.key(`\x1b[<0;${narrowColumn};${narrowRow + 1}m`)
  assert.equal(copied.at(-1), "cd missing-native-directory")
  await host.frame()
  assert.match(
    stripTerminalSequences(host.screenLines()[narrowRow]!),
    /\[Copied\]/,
  )
  host.terminal.resize(160, 300)
  await host.frame()
  const workRow = host
    .screenLines()
    .findIndex((line) => stripTerminalSequences(line).includes("Worked for"))
  assert(workRow >= 0)
  await host.key(`\x1b[<0;3;${workRow + 1}M`)
  await host.key(`\x1b[<0;3;${workRow + 1}m`)
  assert.doesNotMatch(
    await host.frame(),
    /\[Copy (?:command|output|diff)\]|\[Copied\]/,
  )
  await host.key("\r")
  assert.match(await host.frame(), /\[Copy output\]/)
  if (process.platform === "darwin") {
    const safeCommands = join(host.directory, "clipboard-commands")
    await mkdir(safeCommands)
    await writeFile(join(safeCommands, "pbcopy"), "#!/bin/sh\nexit 1\n", {
      mode: 0o700,
    })
    const originalPath = process.env["PATH"]
    t.after(() => {
      if (originalPath === undefined) delete process.env["PATH"]
      else process.env["PATH"] = originalPath
    })
    process.env["PATH"] = `${safeCommands}:${originalPath}`
    clipboardWrite = async () => {
      throw new Error("Controlled clipboard failure")
    }
    const failedRow = await click(
      "cd missing-declared-directory",
      "[Copy output]",
    )
    await t.waitFor(async () =>
      assert.match(await host.frame(), /Copy failed:/),
    )
    assert.match(
      stripTerminalSequences(host.screenLines()[failedRow]!),
      /\[Copy output\]/,
    )
  }
  let complete: (() => void) | undefined
  clipboardWrite = () =>
    new Promise<void>((resolve) => {
      complete = resolve
    })
  await click("Edited native-edit.txt", "[Copy diff]")
  assert(complete)
  assert.match(
    host.screenLines().map(stripTerminalSequences).join("\n"),
    /\[Copy diff\]/,
  )
  await host.reload()
  complete()
  assert.doesNotMatch(await host.frame(), /\[Copied\]|Copy failed:/)
  await host.key("\x0f")
  await host.key("\x0f")
  await host.frame()
  await click("Edited native-edit.txt", "[Copy diff]")
  assert(complete)
  await host.runtime.newSession()
  complete()
  assert.doesNotMatch(
    await host.frame(),
    /\[Copied\]|Copy failed:|\[Copy diff\]/,
  )
  clipboardWrite = undefined
  let processing: "tool" | "message" | undefined
  const native = await openNativeHost(t, {
    extensionPaths: [chat],
    rows: 60,
    columns: 120,
    persistSession: true,
    keybindings: { "tui.altScreen.search": "ctrl+f" },
    extensionFactories: [
      (pi) => {
        pi.on("tool_result", (event) =>
          processing === "tool" && event.toolName === "bash"
            ? { content: [{ type: "text", text: "sanitized-native-only" }] }
            : undefined,
        )
        pi.on("message_end", (event) =>
          processing === "message" && event.message.role === "toolResult"
            ? {
                message: {
                  ...event.message,
                  content: [{ type: "text", text: "processed-message-only" }],
                },
              }
            : undefined,
        )
      },
    ],
  })
  const run = async (command: string) => {
    await native.key("\x1b")
    native.queueResponse(...response("", "bash", { command }))
    native.queueResponse(...response("Finished native output"))
    await native.type("Inspect native command output")
    await native.key("\r")
    await native.settled()
    await native.frame()
    await native.key("\x1bg")
    await native.key("\r")
    await native.frame()
    await native.key("\x1b[B")
    await native.key("\r")
    await native.frame()
    await native.key("\x1b[B")
    await native.key("\r")
    await native.frame()
    await native.key("\x1b")
  }
  const copyNative = async () => {
    await native.frame()
    const lines = native.screenLines().map(stripTerminalSequences)
    const row = lines.findLastIndex(
      (line) => line.includes("[Copy output]") || line.includes("[Copied]"),
    )
    assert(row >= 0, lines.join("\n"))
    const label = lines[row]!.includes("[Copy output]")
      ? "[Copy output]"
      : "[Copied]"
    const column = lines[row]!.indexOf(label) + 1
    await native.key(`\x1b[<0;${column};${row + 1}M`)
    await native.key(`\x1b[<0;${column};${row + 1}m`)
    await native.frame()
  }
  const long =
    Array.from({ length: 2105 }, (_, index) => `  native output ${index}`).join(
      "\n",
    ) + "\n"
  await run(
    'i=0; while [ "$i" -lt 2105 ]; do printf \'  native output %s\\n\' "$i"; i=$((i+1)); done; exit 7',
  )
  await copyNative()
  assert.equal(copied.at(-1), `${long}\n\nCommand exited with code 7`)
  assert.doesNotMatch(copied.at(-1)!, /Showing lines|Full output:/)
  assert.doesNotMatch(await native.frame(), /Only retained output copied/)
  await native.key("\x1b")
  await native.key("\x06")
  await native.type("native output 2104")
  assert.match(await native.frame(), /1\/1/)
  await native.key("\x1b")
  const beforeFindCopy = copied.length
  await copyNative()
  assert.equal(copied.length, beforeFindCopy + 1)
  assert.equal(copied.at(-1), `${long}\n\nCommand exited with code 7`)
  await run("printf ''")
  const beforeEmptyCopy = copied.length
  await copyNative()
  assert.equal(copied.length, beforeEmptyCopy)
  assert.doesNotMatch(await native.frame(), /Only retained output copied/)
  const large =
    "[... 7 bytes omitted ...]\n" + "x".repeat(1_200_000) + "\nretained-end\n"
  await run(
    "printf '[... 7 bytes omitted ...]\\n'; printf '%1200000s' '' | tr ' ' x; printf '\\nretained-end\\n'",
  )
  await copyNative()
  assert.equal(copied.at(-1), large.slice(0, 524_288) + large.slice(-524_288))
  assert.match(await native.frame(), /Only retained output copied/)
  processing = "tool"
  await run("printf '%1200000s' '' | tr ' ' y")
  await copyNative()
  assert.equal(copied.at(-1), "sanitized-native-only")
  processing = "message"
  await run("printf 'original-private-native-output'")
  await native.key("\x06")
  await native.type("processed-message-only")
  assert.match(await native.frame(), /1\/1/)
  await native.key("\x1b")
  await copyNative()
  assert.equal(copied.at(-1), "processed-message-only")
  processing = undefined
  const sessionFile = native.session.sessionFile!
  native.session.sessionManager.appendCompaction(
    "Compressed native output",
    null,
    100,
  )
  await native.runtime.newSession()
  await native.runtime.switchSession(sessionFile)
  assert.doesNotMatch(await native.frame(), /native output 2104/)
  await native.key("\x06")
  await native.type("native output 2104")
  assert.match(await native.frame(), /1\/1/)
  await native.key("\x1b")
  await copyNative()
  assert.equal(
    copied.at(-1),
    long.slice(long.indexOf("  native output 105\n"), -1) +
      "\n\nCommand exited with code 7",
  )
  assert.doesNotMatch(copied.at(-1)!, /Showing lines|Full output:/)
  await t.waitFor(async () =>
    assert.match(await native.frame(), /Only retained output copied/),
  )
  if (process.platform === "darwin") {
    clipboardWrite = async () => {
      throw new Error("Controlled historical clipboard failure")
    }
    await copyNative()
    await t.waitFor(async () =>
      assert.match(await native.frame(), /Copy failed:/),
    )
  }
  const pendingCopy = Promise.withResolvers<void>()
  t.after(() => pendingCopy.resolve())
  clipboardWrite = () => pendingCopy.promise
  await copyNative()
  await native.key("\x1b")
  await native.type("/settings")
  await native.key("\r")
  await native.type("Cache miss notices")
  await native.key("\r")
  await native.key("\x1b")
  assert.doesNotMatch(await native.frame(), /native output 2104/)
  pendingCopy.resolve()
  clipboardWrite = undefined
  assert.doesNotMatch(
    await native.frame(),
    /Only retained output copied|Copy failed:/,
  )
})
