import assert from "node:assert/strict"
import test from "node:test"
import { createReadToolDefinition } from "@earendil-works/pi-coding-agent"
import { stripTerminalSequences } from "@earendil-works/pi-tui"
import { activityDetails, activityType, type ActivityUpdate } from "pi-activity"
import { openNativeHost } from "../../../fixtures/native-host.ts"

const chat = new URL("../src/index.ts", import.meta.url).pathname
const response = (content: string, name?: string) => [
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
                        arguments: JSON.stringify({
                          path: "original-argument",
                        }),
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

test("an unrelated provider presents semantic operations and late updates without tool-name mappings", async (t) => {
  let publish: (() => void) | undefined
  const host = await openNativeHost(t, {
    extensionPaths: [chat],
    rows: 64,
    persistSession: true,
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
              operations: [
                {
                  id: "job-command",
                  order: 0,
                  revision: 1,
                  kind: "command",
                  commands: ["printf generic-evidence"],
                  status: "running",
                  output: "generic-evidence",
                },
              ],
            }
            publish = () => {
              const later: ActivityUpdate = {
                ...update,
                revision: 2,
                operations: [
                  {
                    ...update.operations[0]!,
                    revision: 2,
                    status: "failed",
                    output: "late-generic-failure",
                  },
                ],
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
  host.queueResponse(...response("Finished"))
  await host.type("Start work")
  await host.key("\r")
  await host.settled()
  await host.frame()
  await host.key("\x0f")
  await host.frame()
  const before = host.screenLines().map(stripTerminalSequences).join("\n")
  assert.match(before, /printf generic-evidence/)
  assert.doesNotMatch(
    before,
    /opaque_job|original-argument|original transport result/,
  )
  assert(publish)
  publish()
  await host.frame()
  const after = host.screenLines().map(stripTerminalSequences).join("\n")
  assert.match(after, /late-generic-failure/)
  assert.match(after, /Ran command \(failed\)/)
  assert.equal((after.match(/late-generic-failure/g) ?? []).length, 1)
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
})

test("Find temporarily reveals retained source for an explicitly empty activity", async (t) => {
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
                  operations: [],
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
    /gather_receipt|retained-poll-needle/,
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
    /gather_receipt|retained-poll-needle/,
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
  host.session.sessionManager.appendCompaction("Compressed context", null, 100)
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
    /gather_receipt|retained-poll-needle/,
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
