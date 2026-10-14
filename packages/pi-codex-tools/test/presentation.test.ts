/* eslint-disable no-await-in-loop -- Real producers must reach their synchronized output phase before release. */
import assert from "node:assert/strict"
import test from "node:test"
import { access, writeFile } from "node:fs/promises"
import { join } from "node:path"
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

for (const tty of [false, true]) {
  test(`command output appears before ${tty ? "PTY" : "pipe"} collection returns`, async (t) => {
    const host = await openNativeHost(t, {
      extensionPaths: [extension],
      providerApi,
      rows: 100,
      columns: 100,
    })
    await host.key("\x0f")
    const ready = join(host.directory, "ready")
    const release = join(host.directory, "release")
    const command = `printf 'EARLY-OUTPUT\\n'; touch '${ready}'; until test -f '${release}'; do sleep 0.02; done; printf 'FINAL-OUTPUT\\n'`
    host.queueResponse(
      ...call(
        `text(await tools.exec_command(${JSON.stringify({ cmd: command, login: false, tty, yield_time_ms: 30000 })}));`,
      ),
    )
    host.queueResponse(completed)
    let finished = false
    const pending = host.session.prompt("Run live command").then(() => {
      finished = true
    })
    try {
      for (let attempt = 0; attempt < 200; attempt++) {
        if (
          await access(ready).then(
            () => true,
            () => false,
          )
        )
          break
        await setTimeout(10)
      }
      await setTimeout(80)
      assert.equal(finished, false)
      const frame = stripVTControlCharacters(host.screenLines().join("\n"))
      assert.match(frame, /\n\s*EARLY-OUTPUT\s*\n/)
      assert.match(frame, /Command · running/)
    } finally {
      await writeFile(release, "")
      await pending
    }
    assert.match(output(host), /EARLY-OUTPUT/)
    assert.match(output(host), /FINAL-OUTPUT/)
  })
}

test("late command completion stays in its original card without consuming model output", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
    rows: 160,
    columns: 100,
  })
  await host.key("\x0f")
  const release = join(host.directory, "release")
  const command = `printf 'FIRST-CHUNK\\n'; until test -f '${release}'; do sleep 0.02; done; printf 'LAST-CHUNK\\n'; exit 7`
  host.queueResponse(
    ...call(
      `const process = await tools.exec_command(${JSON.stringify({ cmd: command, login: false, yield_time_ms: 250 })}); store("process", process.session_id); text(process);`,
    ),
  )
  host.queueResponse(completed)
  await host.session.prompt("Start command")
  const initial = output(host)
  assert.match(initial, /FIRST-CHUNK/)
  const requestsBefore = host.requests.length
  await writeFile(release, "")
  await setTimeout(150)
  const frame = stripVTControlCharacters(host.screenLines().join("\n"))
  assert.match(frame, /Command · failed/)
  assert.match(frame, /Exit status: 7/)
  assert.match(frame, /\n\s*LAST-CHUNK\s*\n/)
  assert.equal(host.requests.length, requestsBefore)
  host.queueResponse(
    ...call(
      'text(await tools.write_stdin({session_id:load("process")}));',
      "collect",
    ),
  )
  host.queueResponse(completed)
  await host.session.prompt("Collect command")
  const collected = output(host, "collect")
  assert.match(collected, /LAST-CHUNK/)
  assert.doesNotMatch(collected, /FIRST-CHUNK/)
  await setTimeout(60)
  const final = stripVTControlCharacters(host.screenLines().join("\n"))
  assert.equal(
    final.split("\n").filter((line) => line.trim() === "LAST-CHUNK").length,
    1,
  )
})

test("input in another execution updates the originating PTY card without duplicate output", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
    rows: 160,
    columns: 100,
  })
  await host.key("\x0f")
  host.queueResponse(
    ...call(
      'const process = await tools.exec_command({cmd:"printf \'PTY-READY\\n\'; read answer; printf \'PTY-ANSWER:%s\\n\' \\"$answer\\"",tty:true,login:false,yield_time_ms:250}); store("process",process.session_id); text(process);',
    ),
  )
  host.queueResponse(completed)
  await host.session.prompt("Start terminal")
  host.queueResponse(
    ...call(
      'text(await tools.write_stdin({session_id:load("process"),chars:"hello\\n"}));',
      "input",
    ),
  )
  host.queueResponse(completed)
  await host.session.prompt("Send input")
  assert.match(output(host, "input"), /PTY-ANSWER:hello/)
  await setTimeout(60)
  const frame = stripVTControlCharacters(host.screenLines().join("\n"))
  assert.equal(
    frame.split("\n").filter((line) => line.trim() === "PTY-ANSWER:hello")
      .length,
    1,
  )
  assert.match(frame, /write_stdin · completed/)
  assert.match(frame, /Exit status: 0/)
})

test("live previews retain trailing large output independently of a small model budget", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
    rows: 1000,
    columns: 100,
  })
  await host.key("\x0f")
  host.queueResponse(
    ...call(
      'text(await tools.exec_command({cmd:"node -e \'process.stdout.write(\\\"BEGIN\\\\n\\\" + \\\"X\\\".repeat(262144) + \\\"\\\\nTRAILING\\\\n\\\")\'",login:false,max_output_tokens:32}));',
    ),
  )
  host.queueResponse(completed)
  await host.session.prompt("Run large output")
  await setTimeout(60)
  const frame = stripVTControlCharacters(host.screenLines().join("\n"))
  assert.match(frame, /\n\s*BEGIN\s*\n/)
  assert.match(frame, /\n\s*TRAILING\s*\n/)
  assert.match(frame, /output omitted/)
  const model = output(host)
  assert.match(model, /tokens truncated/)
  assert.match(model, /TRAILING/)
})

test("returned redaction replaces earlier visible command output", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
    rows: 100,
    columns: 100,
    extension(pi) {
      pi.on("tool_result", (event) =>
        event.toolName === "exec_command"
          ? { content: [{ type: "text", text: "REMOVED-BY-HOOK" }] }
          : undefined,
      )
    },
  })
  await host.key("\x0f")
  const ready = join(host.directory, "ready")
  const release = join(host.directory, "release")
  const command = `printf 'VISIBLE-BEFORE-HOOK\\n'; touch '${ready}'; until test -f '${release}'; do sleep 0.02; done`
  host.queueResponse(
    ...call(
      `text(await tools.exec_command(${JSON.stringify({ cmd: command, login: false, yield_time_ms: 30000 })}));`,
    ),
  )
  host.queueResponse(completed)
  const pending = host.session.prompt("Run with output hook")
  try {
    for (let attempt = 0; attempt < 200; attempt++) {
      if (
        await access(ready).then(
          () => true,
          () => false,
        )
      )
        break
      await setTimeout(10)
    }
    await setTimeout(60)
    assert.match(
      stripVTControlCharacters(host.screenLines().join("\n")),
      /\n\s*VISIBLE-BEFORE-HOOK\s*\n/,
    )
  } finally {
    await writeFile(release, "")
    await pending
  }
  await setTimeout(60)
  const frame = stripVTControlCharacters(host.screenLines().join("\n"))
  assert.doesNotMatch(frame, /\n\s*VISIBLE-BEFORE-HOOK\s*\n/)
  assert.match(frame, /REMOVED-BY-HOOK/)
  assert.match(output(host), /REMOVED-BY-HOOK/)
  assert.doesNotMatch(output(host), /VISIBLE-BEFORE-HOOK/)
})

test("cancelled command presentation preserves live output and its terminal failure", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
    rows: 100,
    columns: 100,
  })
  await host.key("\x0f")
  const ready = join(host.directory, "ready")
  const command = `printf 'BEFORE-CANCEL\\n'; touch '${ready}'; sleep 30`
  host.queueResponse(
    ...call(
      `text(await tools.exec_command(${JSON.stringify({ cmd: command, login: false, yield_time_ms: 30000 })}));`,
    ),
  )
  host.queueResponse(completed)
  const pending = host.session.prompt("Cancel running command")
  for (let attempt = 0; attempt < 200; attempt++) {
    if (
      await access(ready).then(
        () => true,
        () => false,
      )
    )
      break
    await setTimeout(10)
  }
  await host.session.abort()
  await pending
  await setTimeout(60)
  const frame = stripVTControlCharacters(host.screenLines().join("\n"))
  assert.match(frame, /Command · failed/)
  assert.match(frame, /\n\s*BEFORE-CANCEL\s*\n/)
  assert.match(frame, /Exit status: 1/)
})

test("structured command result edits replace the live presentation snapshot", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
    rows: 100,
    columns: 100,
    extension(pi) {
      pi.on("tool_result", (event) => {
        if (event.toolName !== "exec_command") return undefined
        const result = {
          output: "FILTERED-OUTPUT",
          wall_time_seconds: 0,
          exit_code: 0,
        }
        return {
          content: [{ type: "text", text: JSON.stringify(result) }],
          structuredContent: result,
        }
      })
    },
  })
  host.queueResponse(
    ...call(
      "text(await tools.exec_command({cmd:\"printf 'ORIGINAL-OUTPUT\\n'\",login:false}));",
    ),
  )
  host.queueResponse(completed)
  await host.session.prompt("Run with structured result hook")
  await host.key("\x0f")
  await setTimeout(60)
  const frame = stripVTControlCharacters(host.screenLines().join("\n"))
  assert.match(frame, /\n\s*FILTERED-OUTPUT\s*\n/)
  assert.doesNotMatch(frame, /\n\s*ORIGINAL-OUTPUT\s*\n/)
  assert.match(output(host), /FILTERED-OUTPUT/)
  assert.doesNotMatch(output(host), /ORIGINAL-OUTPUT/)
})

test("a redacted command return does not hide later live output or restore its earlier bytes", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
    rows: 100,
    columns: 100,
    extension(pi) {
      pi.on("tool_result", (event) =>
        event.toolName === "exec_command"
          ? { content: [{ type: "text", text: "RETURN-REDACTED\n" }] }
          : undefined,
      )
    },
  })
  await host.key("\x0f")
  const release = join(host.directory, "release")
  const command = `printf 'BEFORE-RETURN\\n'; until test -f '${release}'; do sleep 0.02; done; printf 'AFTER-RETURN\\n'`
  host.queueResponse(
    ...call(
      `text(await tools.exec_command(${JSON.stringify({ cmd: command, login: false, yield_time_ms: 250 })}));`,
    ),
  )
  host.queueResponse(completed)
  await host.session.prompt("Start a continued command with redaction")
  assert.match(output(host), /RETURN-REDACTED/)
  assert.doesNotMatch(output(host), /BEFORE-RETURN/)
  await writeFile(release, "")
  await setTimeout(150)
  const frame = stripVTControlCharacters(host.screenLines().join("\n"))
  assert.match(frame, /\n\s*AFTER-RETURN\s*\n/)
  assert.doesNotMatch(frame, /\n\s*BEFORE-RETURN\s*\n/)
  assert.match(frame, /Command · completed/)
})

test("input result redaction preserves prior origin observations and controls the model return", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
    rows: 160,
    columns: 100,
    extension(pi) {
      pi.on("tool_result", (event) =>
        event.toolName === "write_stdin"
          ? { content: [{ type: "text", text: "INPUT-RESULT-REDACTED" }] }
          : undefined,
      )
    },
  })
  await host.key("\x0f")
  host.queueResponse(
    ...call(
      'const process = await tools.exec_command({cmd:"printf \'INPUT-READY\\n\'; read answer; printf \'PRIOR-LIVE-OBSERVATION:%s\\n\' \\"$answer\\"",tty:true,login:false,yield_time_ms:250}); store("process",process.session_id); text(process);',
    ),
  )
  host.queueResponse(completed)
  await host.session.prompt("Start terminal")
  host.queueResponse(
    ...call(
      'text(await tools.write_stdin({session_id:load("process"),chars:"hello\\n"}));',
      "input",
    ),
  )
  host.queueResponse(completed)
  await host.session.prompt("Send input with a result hook")
  assert.match(output(host, "input"), /INPUT-RESULT-REDACTED/)
  assert.doesNotMatch(output(host, "input"), /PRIOR-LIVE-OBSERVATION/)
  await setTimeout(60)
  const frame = stripVTControlCharacters(host.screenLines().join("\n"))
  assert.equal(
    frame
      .split("\n")
      .filter((line) => line.trim() === "PRIOR-LIVE-OBSERVATION:hello").length,
    1,
  )
  assert.match(frame, /write_stdin · completed/)
})
