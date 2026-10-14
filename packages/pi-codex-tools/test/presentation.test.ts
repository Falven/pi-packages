import assert from "node:assert/strict"
import test from "node:test"
import { setTimeout } from "node:timers/promises"
import { stripVTControlCharacters } from "node:util"
import { visibleWidth } from "@earendil-works/pi-tui"
import { openNativeHost } from "../../../fixtures/native-host.ts"
import {
  call,
  completed,
  extension,
  functionCall,
  output,
  providerApi,
} from "./fixtures/model-loop.ts"

test("completed execution cards expand readable commands while retaining orchestration", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
    rows: 100,
    columns: 100,
  })
  const source =
    'await tools.exec_command({cmd: "printf readable-command", login: false});'
  host.queueResponse(...call(source))
  host.queueResponse(completed)
  await host.session.prompt("Run a command")
  await setTimeout(60)
  const compact = stripVTControlCharacters(host.screenLines().join("\n"))
  assert.doesNotMatch(compact, /await tools|Execution cell|Wall time|chunk_id/)
  assert.match(compact, /Command.*completed/i)
  assert.doesNotMatch(compact, /readable-command/)
  await host.key("\x0f")
  await setTimeout(60)
  const expanded = stripVTControlCharacters(host.screenLines().join("\n"))
  assert.match(expanded, /printf readable-command/)
  assert.match(expanded, /Directory: .*native-host/)
  assert.match(expanded, /Exit status: 0/)
  assert.match(expanded, /readable-command/)
  assert.doesNotMatch(expanded, /await tools|Execution cell|Wall time|chunk_id/)
  assert.doesNotMatch(output(host), /readable-command/)
  await host.reload()
  await setTimeout(60)
  assert.match(
    stripVTControlCharacters(host.screenLines().join("\n")),
    /Command · completed/,
  )
  const branch = host.session.sessionManager.getBranch()
  assert(
    branch.some(
      (entry) =>
        entry.type === "custom" && entry.customType === "core-tools.activity",
    ),
  )
  assert(host.requestBodies.at(-1)?.includes(source.replaceAll('"', '\\"')))
})

test("command cards use effective arguments and hook-processed returned output", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
    rows: 100,
    columns: 100,
    extension(pi) {
      pi.on("tool_call", (event) => {
        if (event.toolName === "exec_command")
          event.input["cmd"] = "printf secret-payload"
      })
      pi.on("tool_result", (event) => {
        if (event.toolName === "exec_command")
          return { content: [{ type: "text", text: "redacted-result" }] }
        return undefined
      })
    },
  })
  host.queueResponse(
    ...call(
      'text(await tools.exec_command({cmd:"original-command",login:false}));',
    ),
  )
  host.queueResponse(completed)
  await host.session.prompt("Run a command")
  await host.key("\x0f")
  await setTimeout(60)
  const expanded = stripVTControlCharacters(host.screenLines().join("\n"))
  assert.match(expanded, /\$ printf secret-payload/)
  assert.match(expanded, /redacted-result/)
  assert.doesNotMatch(expanded, /original-command|Exit status/)
  assert.doesNotMatch(output(host), /secret-payload/)
  assert.match(output(host), /redacted-result/)
})

test("expanded execution keeps emitted results readable and reports script and command failures", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
    rows: 100,
    columns: 100,
  })
  host.queueResponse(
    ...call(
      'text(await tools.exec_command({cmd:"printf command-failed; exit 7",login:false})); text("script-note"); throw new Error("script-failed");',
    ),
  )
  host.queueResponse(completed)
  await host.session.prompt("Run a command")
  await host.key("\x0f")
  await setTimeout(60)
  const expanded = stripVTControlCharacters(host.screenLines().join("\n"))
  assert.match(expanded, /Exit status: 7/)
  assert.match(expanded, /Command · failed/)
  assert.match(expanded, /script-failed/)
  assert.match(expanded, /script-note/)
  assert.doesNotMatch(
    expanded,
    /chunk_id|wall_time_seconds|original_token_count|await tools/,
  )
})

test("parent result redaction also controls the returned operation presentation", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
    rows: 100,
    columns: 100,
    extension(pi) {
      pi.on("tool_result", (event) => {
        if (event.toolName === "exec")
          return { content: [{ type: "text", text: "parent-redacted" }] }
        return undefined
      })
    },
  })
  host.queueResponse(
    ...call(
      'await tools.exec_command({cmd:"printf hidden-after-return",login:false});',
    ),
  )
  host.queueResponse(completed)
  await host.session.prompt("Run a command")
  await host.key("\x0f")
  await setTimeout(60)
  const expanded = stripVTControlCharacters(host.screenLines().join("\n"))
  assert.match(expanded, /parent-redacted/)
  assert.doesNotMatch(expanded, /hidden-after-return/)
  assert.match(output(host), /parent-redacted/)
  assert.doesNotMatch(output(host), /hidden-after-return/)
})

test("compact command status reports a nonzero exit without changing script success", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
    rows: 40,
    columns: 60,
  })
  host.queueResponse(
    ...call('await tools.exec_command({cmd:"exit 9",login:false});'),
  )
  host.queueResponse(completed)
  await host.session.prompt("Run a command")
  await setTimeout(60)
  assert.match(
    stripVTControlCharacters(host.screenLines().join("\n")),
    /Command · failed/,
  )
  assert.match(output(host), /Script completed/)
})

test("script errors before any operation remain readable without showing their source", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
    rows: 60,
    columns: 40,
  })
  host.queueResponse(
    ...call('text("before-child"); throw new Error("before-dispatch-failed");'),
  )
  host.queueResponse(completed)
  await host.session.prompt("Run a script")
  await host.key("\x0f")
  await setTimeout(60)
  const expanded = stripVTControlCharacters(host.screenLines().join("\n"))
  assert.match(expanded, /Execution · failed/)
  assert.match(expanded, /before-child/)
  assert.match(expanded, /before-dispatch-failed/)
  assert.doesNotMatch(expanded, /throw new|text\(/)
})

test("large command previews show omissions and wrap within narrow terminal cells", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
    rows: 1600,
    columns: 24,
  })
  host.queueResponse(
    ...call(
      'await tools.exec_command({cmd:"printf \\\"界🙂\\\"; printf \\\"%050000d\\\" 0",login:false,max_output_tokens:100000});',
    ),
  )
  host.queueResponse(completed)
  await host.session.prompt("Run a command")
  await host.key("\x0f")
  await setTimeout(60)
  const expanded = stripVTControlCharacters(host.screenLines().join("\n"))
  assert.match(expanded, /界🙂/)
  assert.match(expanded, /output omitted/)
  assert.match(expanded, /Exit status: 0/)
  assert.doesNotMatch(expanded, /�|Wall time|chunk_id/)
  assert(host.screenLines().every((line) => visibleWidth(line) <= 24))
})

test("a failed wait shows its collection error without transport details", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
    rows: 60,
    columns: 100,
  })
  host.queueResponse(
    ...functionCall("wait", { cell_id: "missing" }, "missing", "functions"),
  )
  host.queueResponse(completed)
  await host.session.prompt("Collect output")
  await host.key("\x0f")
  await setTimeout(60)
  assert.match(
    stripVTControlCharacters(host.screenLines().join("\n")),
    /exec cell missing not found/,
  )
  assert.match(output(host, "missing"), /exec cell missing not found/)
})
