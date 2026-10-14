/* eslint-disable no-await-in-loop -- Native host cases share process environment and must close in order. */
import assert from "node:assert/strict"
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises"
import { join } from "node:path"
import test from "node:test"
import { openNativeHost } from "../../../fixtures/native-host.ts"
import {
  call,
  completed,
  extension,
  output,
  providerApi,
} from "./fixtures/model-loop.ts"

function result(host: Awaited<ReturnType<typeof openNativeHost>>, id: string) {
  const text = output(host, id)
  assert.match(text, /^Script completed/)
  return JSON.parse(text.slice(text.indexOf("{"))) as {
    output: string
    session_id?: number
    exit_code?: number
    original_token_count: number
    wall_time_seconds: number
    chunk_id: string
  }
}

async function request(
  host: Awaited<ReturnType<typeof openNativeHost>>,
  source: string,
  id: string,
) {
  host.queueResponse(...call(source, id))
  host.queueResponse(completed)
  await host.session.prompt(id)
  return output(host, id)
}

test("a PTY continues through fresh tool calls and ordinary prompts", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
  })
  host.queueResponse(
    ...call(
      `text(await tools.exec_command(${JSON.stringify({
        cmd: 'printf "READY\\n"; IFS= read -r first; printf "ONE:%s\\n" "$first"; IFS= read -r second; printf "TWO:%s\\n" "$second"; exit 7',
        shell: "/bin/sh",
        login: false,
        tty: true,
        yield_time_ms: 250,
      })}));`,
      "start",
    ),
  )
  host.queueResponse(completed)
  await host.session.prompt("Start an interactive command")
  const initial = result(host, "start")
  assert.equal(initial.output, "READY\r\n")
  assert.equal(initial.original_token_count, 2)
  assert.equal(typeof initial.session_id, "number")
  assert(initial.session_id! > 0 && initial.session_id! <= 2147483647)
  assert.equal("exit_code" in initial, false)
  const outgoing = host.requests[0] as unknown as {
    tools: { name: string; tools?: { description: string }[] }[]
  }
  const description = outgoing.tools.find((tool) => tool.name === "functions")!
    .tools![0]!.description
  assert.match(description, /### `write_stdin`/)

  host.queueResponse(
    ...call(
      `text(await tools.write_stdin({session_id:${initial.session_id}, chars:"alpha\\n"}));`,
      "first",
    ),
  )
  host.queueResponse(completed)
  await host.session.prompt("Send the first line")
  const first = result(host, "first")
  assert.equal(first.output, "alpha\r\nONE:alpha\r\n")
  assert.equal(first.original_token_count, 5)
  assert.equal(first.session_id, initial.session_id)
  assert.equal("exit_code" in first, false)

  host.queueResponse(
    ...call(
      `text(await tools.write_stdin({session_id:${initial.session_id}, chars:"beta\\n"}));`,
      "second",
    ),
  )
  host.queueResponse(completed)
  await host.session.prompt("Finish the command")
  const second = result(host, "second")
  assert.equal(second.output, "beta\r\nTWO:beta\r\n")
  assert.equal(second.original_token_count, 4)
  assert.equal(second.exit_code, 7)
  assert.equal("session_id" in second, false)

  host.queueResponse(
    ...call(
      `try { await tools.write_stdin({session_id:${initial.session_id}}); } catch (error) { text(error); }`,
      "stale",
    ),
  )
  host.queueResponse(completed)
  await host.session.prompt("Report the completed handle")
  assert.match(output(host, "stale"), /Unknown process id/)
})

test("interrupt input preserves terminal output and the observed exit status", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
  })
  host.queueResponse(
    ...call(
      `text(await tools.exec_command(${JSON.stringify({
        cmd: 'printf "READY\\n"; sleep 30; printf "AFTER\\n"',
        shell: "/bin/sh",
        login: false,
        tty: true,
        yield_time_ms: 250,
      })}));`,
      "start",
    ),
  )
  host.queueResponse(completed)
  await host.session.prompt("Start an interruptible command")
  const initial = result(host, "start")
  host.queueResponse(
    ...call(
      `text(await tools.write_stdin(${JSON.stringify({ session_id: initial.session_id, chars: "\u0003" })}));`,
      "interrupt",
    ),
  )
  host.queueResponse(completed)
  await host.session.prompt("Interrupt the terminal command")
  const interrupted = result(host, "interrupt")
  assert.equal(interrupted.exit_code, 1)
  assert.equal(interrupted.output, "^C")
  assert.equal(interrupted.original_token_count, 1)
  assert.equal("session_id" in interrupted, false)
})

test("empty polls default to five seconds and clamp short waits without consuming input", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
  })
  await request(
    host,
    `text(await tools.exec_command(${JSON.stringify({
      cmd: 'printf "READY\\n"; while IFS= read -r line; do [ "$line" = quit ] && break; printf "ACK:%s\\n" "$line"; done; exit 7',
      shell: "/bin/sh",
      login: false,
      tty: true,
      yield_time_ms: 0,
    })}));`,
    "start",
  )
  const initial = result(host, "start")
  assert.equal(initial.output, "READY\r\n")
  assert(initial.wall_time_seconds >= 0.24)
  assert(initial.wall_time_seconds < 2)
  await request(
    host,
    `text(await tools.write_stdin({session_id:${initial.session_id}}));`,
    "default",
  )
  const defaultPoll = result(host, "default")
  assert.equal(defaultPoll.session_id, initial.session_id)
  assert.equal(defaultPoll.output, "")
  assert.equal(defaultPoll.original_token_count, 0)
  assert(defaultPoll.wall_time_seconds >= 4.9)
  assert(defaultPoll.wall_time_seconds < 7)
  await request(
    host,
    `text(await tools.write_stdin({session_id:${initial.session_id}, chars:"", yield_time_ms:0}));`,
    "minimum",
  )
  const minimumPoll = result(host, "minimum")
  assert.equal(minimumPoll.output, "")
  assert.equal(minimumPoll.session_id, initial.session_id)
  assert(minimumPoll.wall_time_seconds >= 4.9)
  assert(minimumPoll.wall_time_seconds < 7)
  await request(
    host,
    `text(await tools.write_stdin({session_id:${initial.session_id}, chars:"alpha\\n", yield_time_ms:0}));`,
    "input",
  )
  const input = result(host, "input")
  assert.equal(input.output, "alpha\r\nACK:alpha\r\n")
  assert(input.wall_time_seconds >= 0.24)
  assert(input.wall_time_seconds < 2)
  await request(
    host,
    `text(await tools.write_stdin({session_id:${initial.session_id}, chars:"quit\\n"}));`,
    "finish",
  )
  assert.equal(result(host, "finish").exit_code, 7)
})

test("pipe mode closes stdin and keeps unread completion output after failed input", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
  })
  const gate = join(host.directory, "finish")
  const pidFile = join(host.directory, "owned.pid")
  await request(
    host,
    `text(await tools.exec_command(${JSON.stringify({
      cmd: `echo $$ > '${pidFile}'; printf 'EARLY\\n'; IFS= read -r line; printf 'EOF:%s\\n' "$?"; while [ ! -e '${gate}' ]; do sleep 0.02; done; printf 'LATE\\n'; exit 7`,
      shell: "/bin/sh",
      login: false,
      yield_time_ms: 250,
    })}));`,
    "start",
  )
  const initial = result(host, "start")
  assert.equal(initial.output, "EARLY\nEOF:1\n")
  await writeFile(gate, "finish")
  const pid = Number(await readFile(pidFile, "utf8"))
  await t.waitFor(() =>
    assert.throws(() => process.kill(pid, 0), { code: "ESRCH" }),
  )
  const failed = await request(
    host,
    `try { await tools.write_stdin({session_id:${initial.session_id}, chars:"unused\\n"}); } catch (error) { text(error); }`,
    "failed",
  )
  assert.match(
    failed,
    /stdin is closed for this session; rerun exec_command with tty=true to keep stdin open/,
  )
  await request(
    host,
    `text(await tools.write_stdin({session_id:${initial.session_id}}));`,
    "drain",
  )
  const drained = result(host, "drain")
  assert.equal(drained.output, "LATE\n")
  assert.equal(drained.exit_code, 7)
  assert.equal(drained.original_token_count, 2)
  assert.equal("session_id" in drained, false)
})

test("unread output stays private and a later budget preserves split UTF-8 and trailing bytes", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
  })
  const previousTmp = process.env["TMPDIR"]
  const spills = join(host.directory, "temporary")
  await mkdir(spills)
  process.env["TMPDIR"] = spills
  t.after(() => {
    if (previousTmp === undefined) delete process.env["TMPDIR"]
    else process.env["TMPDIR"] = previousTmp
  })
  const program = join(host.directory, "output.mjs")
  const gate = join(host.directory, "finish")
  const pidFile = join(host.directory, "owned.pid")
  await writeFile(
    program,
    `
import { existsSync, writeFileSync } from "node:fs";
writeFileSync(${JSON.stringify(pidFile)}, String(process.pid));
process.stdout.write("FIRST\\n");
const waiting = setInterval(() => {
  if (!existsSync(${JSON.stringify(gate)})) return;
  clearInterval(waiting);
  process.stdout.write(Buffer.from([0xf0, 0x9f]));
  setTimeout(() => {
    process.stdout.write(Buffer.from([0x99, 0x82]));
    process.stdout.write("🙂".repeat(39) + "END\\n");
    process.exitCode = 7;
  }, 20);
}, 10);
`,
  )
  await request(
    host,
    `text(await tools.exec_command(${JSON.stringify({ cmd: `exec node '${program}'`, shell: "/bin/sh", login: false, yield_time_ms: 250, max_output_tokens: 1 })}));`,
    "start",
  )
  const initial = result(host, "start")
  assert.equal(initial.original_token_count, 2)
  assert.equal(
    initial.output,
    "Warning: truncated output (original token count: 2)\nTotal output lines: 1\n\nFI…1 tokens truncated…T\n",
  )
  const directories = await readdir(spills)
  assert.equal(directories.length, 1)
  const directory = join(spills, directories[0]!)
  assert.equal((await stat(directory)).mode & 0o777, 0o700)
  const files = await readdir(directory)
  assert.equal(files.length, 1)
  assert.equal((await stat(join(directory, files[0]!))).mode & 0o777, 0o600)
  await writeFile(gate, "finish")
  const pid = Number(await readFile(pidFile, "utf8"))
  await t.waitFor(() =>
    assert.throws(() => process.kill(pid, 0), { code: "ESRCH" }),
  )
  await request(
    host,
    `text(await tools.write_stdin({session_id:${initial.session_id}, max_output_tokens:100}));`,
    "drain",
  )
  const drained = result(host, "drain")
  assert.equal(drained.output, "🙂".repeat(40) + "END\n")
  assert.equal(drained.original_token_count, 41)
  assert.equal(drained.exit_code, 7)
  assert.deepEqual(await readdir(spills), [])
})

test("reload awaits the PTY and its waiting child and makes the old handle stale", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
  })
  const pidFile = join(host.directory, "owned.pids")
  await request(
    host,
    `text(await tools.exec_command(${JSON.stringify({
      cmd: `trap '' HUP; sleep 30 & child=$!; printf '%s %s' $$ "$child" > '${pidFile}'; printf 'PARTIAL\\n'; wait`,
      shell: "/bin/sh",
      login: false,
      tty: true,
      yield_time_ms: 250,
    })}));`,
    "start",
  )
  const initial = result(host, "start")
  assert.equal(initial.output, "PARTIAL\r\n")
  const pids = (await readFile(pidFile, "utf8")).split(" ").map(Number)
  assert.equal(pids.length, 2)
  const messages = structuredClone(host.session.messages)
  await host.reload()
  for (const pid of pids)
    assert.throws(() => process.kill(pid, 0), { code: "ESRCH" })
  assert.deepEqual(host.session.messages, messages)
  const stale = await request(
    host,
    `try { await tools.write_stdin({session_id:${initial.session_id}}); } catch (error) { text(error); }`,
    "stale",
  )
  assert.match(stale, /Unknown process id/)
})

test("process identifiers accept signed integers and reject values outside the observed range", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
  })
  const unknown = await request(
    host,
    "try { await tools.write_stdin({session_id:-1}); } catch (error) { text(error); }",
    "unknown",
  )
  assert.match(unknown, /write_stdin failed: Unknown process id -1/)
  const invalid = await request(
    host,
    "for (const args of [{session_id:1.5}, {session_id:4294967296}, {session_id:-1, yield_time_ms:1.5}, {session_id:-1, yield_time_ms:-1}, {session_id:-1, max_output_tokens:1.5}, {session_id:-1, max_output_tokens:-1}]) { try { await tools.write_stdin(args); } catch (error) { text(error); } }",
    "invalid",
  )
  assert.doesNotMatch(invalid, /Unknown process id/)
  assert.match(invalid, /session_id/)
})

test("concurrent final polls drain once and reject the retired handle", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
  })
  await request(
    host,
    `text(await tools.exec_command(${JSON.stringify({
      cmd: "printf 'START\\n'; sleep 1; printf 'END\\n'; exit 7",
      shell: "/bin/sh",
      login: false,
      yield_time_ms: 250,
    })}));`,
    "start",
  )
  const initial = result(host, "start")
  const text = await request(
    host,
    `text(await Promise.allSettled([tools.write_stdin({session_id:${initial.session_id}}), tools.write_stdin({session_id:${initial.session_id}})]));`,
    "drain",
  )
  const outcomes = JSON.parse(text.slice(text.indexOf("[")))
  assert.equal(outcomes[0].status, "fulfilled")
  assert.equal(outcomes[0].value.output, "END\n")
  assert.equal(outcomes[0].value.exit_code, 7)
  assert.equal("session_id" in outcomes[0].value, false)
  assert.deepEqual(outcomes[1], {
    status: "rejected",
    reason: `write_stdin failed: Unknown process id ${initial.session_id}`,
  })
})

test("concurrent writes deliver input and collect output in call order", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
  })
  await request(
    host,
    `text(await tools.exec_command(${JSON.stringify({
      cmd: 'printf "READY\\n"; IFS= read -r first; printf "ONE:%s\\n" "$first"; IFS= read -r second; printf "TWO:%s\\n" "$second"; exit 7',
      shell: "/bin/sh",
      login: false,
      tty: true,
      yield_time_ms: 250,
    })}));`,
    "start",
  )
  const initial = result(host, "start")
  const text = await request(
    host,
    `text(await Promise.all([tools.write_stdin({session_id:${initial.session_id}, chars:"alpha\\n"}), tools.write_stdin({session_id:${initial.session_id}, chars:"beta\\n"})]));`,
    "input",
  )
  const outcomes = JSON.parse(text.slice(text.indexOf("[")))
  assert.equal(outcomes[0].output, "alpha\r\nONE:alpha\r\n")
  assert.equal(outcomes[0].session_id, initial.session_id)
  assert.equal("exit_code" in outcomes[0], false)
  assert.equal(outcomes[1].output, "beta\r\nTWO:beta\r\n")
  assert.equal(outcomes[1].exit_code, 7)
  assert.equal("session_id" in outcomes[1], false)
})

test("later input preserves native policy edits, redaction, events, and call ownership", async (t) => {
  const events: { type: string; name: string; parent: string | undefined }[] =
    []
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
    extension(pi) {
      pi.on("tool_call", (event) => {
        if (event.toolName !== "write_stdin") return undefined
        if (event.input["chars"] === "blocked\n")
          return { block: true, reason: "Input denied by the test policy" }
        event.input["chars"] = "edited\n"
        return undefined
      })
      pi.on("tool_result", (event) => {
        if (event.toolName === "write_stdin" && !event.isError)
          return { content: [{ type: "text", text: "processed-input" }] }
        return undefined
      })
      pi.on("tool_execution_start", (event) => {
        events.push({
          type: event.type,
          name: event.toolName,
          parent: event.parentToolCallId,
        })
      })
      pi.on("tool_execution_end", (event) => {
        events.push({
          type: event.type,
          name: event.toolName,
          parent: event.parentToolCallId,
        })
      })
    },
  })
  const delivered = join(host.directory, "delivered")
  await request(
    host,
    `text(await tools.exec_command(${JSON.stringify({
      cmd: `printf 'READY\\n'; IFS= read -r line; printf '%s' "$line" > '${delivered}'; printf 'discarded-secret'; exit 7`,
      shell: "/bin/sh",
      login: false,
      tty: true,
      yield_time_ms: 250,
    })}));`,
    "start",
  )
  const initial = result(host, "start")
  const blocked = await request(
    host,
    `try { await tools.write_stdin({session_id:${initial.session_id}, chars:"blocked\\n"}); } catch (error) { text(error); }`,
    "blocked",
  )
  assert.match(blocked, /Input denied by the test policy/)
  await assert.rejects(readFile(delivered), { code: "ENOENT" })
  const finished = await request(
    host,
    `text(await tools.write_stdin({session_id:${initial.session_id}, chars:"original\\n"}));`,
    "finish",
  )
  assert.match(finished, /processed-input$/)
  assert.doesNotMatch(finished, /discarded-secret|edited/)
  assert.equal(await readFile(delivered, "utf8"), "edited")
  assert.deepEqual(
    events
      .filter(
        (event) =>
          event.name === "write_stdin" &&
          event.parent?.startsWith("call_finish"),
      )
      .map((event) => event.type),
    ["tool_execution_start", "tool_execution_end"],
  )
  const retained = host.session.messages.find(
    (message) =>
      message.role === "toolResult" &&
      message.toolCallId.startsWith("call_finish"),
  )
  assert(retained?.role === "toolResult")
  assert.equal(retained.nestedCalls?.complete, true)
  assert.equal(retained.nestedCalls.calls.length, 1)
  assert.notEqual(retained.nestedCalls.calls[0]!.status, "unfinished")
})

test("input selection and exclusion remain authoritative", async (t) => {
  for (const mode of ["command-only", "input-only", "excluded"] as const) {
    await t.test(mode, async (caseContext) => {
      const host = await openNativeHost(caseContext, {
        extensionPaths: [extension],
        providerApi,
        ...(mode === "command-only" ? { tools: ["exec", "exec_command"] } : {}),
        ...(mode === "input-only" ? { tools: ["exec", "write_stdin"] } : {}),
        ...(mode === "excluded" ? { excludeTools: ["write_stdin"] } : {}),
      })
      const text = await request(
        host,
        "text(ALL_TOOLS); text([typeof tools.exec_command, typeof tools.write_stdin]);",
        "selected",
      )
      const outgoing = host.requests[0] as unknown as {
        tools: { name: string; tools?: { description: string }[] }[]
      }
      const declared = outgoing.tools.find((tool) => tool.name === "functions")!
        .tools![0]!.description
      if (mode === "input-only") {
        assert.match(text, /\["undefined","function"\]/)
        assert.match(declared, /### `write_stdin`/)
        assert.doesNotMatch(declared, /### `exec_command`/)
      } else {
        assert.match(text, /\["function","undefined"\]/)
        assert.doesNotMatch(declared, /### `write_stdin`/)
      }
    })
  }
})

test("cancelling a later poll awaits owned children and retains that call's partial output", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
  })
  const pidFile = join(host.directory, "owned.pids")
  await request(
    host,
    `text(await tools.exec_command(${JSON.stringify({
      cmd: `printf 'READY\\n'; IFS= read -r line; sleep 30 & child=$!; printf '%s %s' $$ "$child" > '${pidFile}'; printf 'PARTIAL:%s\\n' "$line"; wait`,
      shell: "/bin/sh",
      login: false,
      tty: true,
      yield_time_ms: 250,
    })}));`,
    "start",
  )
  const initial = result(host, "start")
  host.queueResponse(
    ...call(
      `text(await tools.write_stdin({session_id:${initial.session_id}, chars:"go\\n", yield_time_ms:10000}));`,
      "poll",
    ),
  )
  const running = host.session.prompt("Send input and wait")
  let pids: number[] = []
  await t.waitFor(async () => {
    pids = (await readFile(pidFile, "utf8")).split(" ").map(Number)
    assert.equal(pids.length, 2)
  })
  await host.session.abort()
  await running
  for (const pid of pids)
    assert.throws(() => process.kill(pid, 0), { code: "ESRCH" })
  const retained = host.session.messages.find(
    (message) =>
      message.role === "toolResult" &&
      message.toolCallId.startsWith("call_poll"),
  )
  assert(retained?.role === "toolResult")
  assert.equal(retained.nestedCalls?.complete, true)
  assert.equal(retained.nestedCalls.calls.length, 1)
  assert.notEqual(retained.nestedCalls.calls[0]!.status, "unfinished")
  assert.match(JSON.stringify(retained.content), /PARTIAL:go/)
  const stale = await request(
    host,
    `try { await tools.write_stdin({session_id:${initial.session_id}}); } catch (error) { text(error); }`,
    "stale",
  )
  assert.match(stale, /Unknown process id/)
})

test("normal shutdown awaits pipe children and keeps the active call's partial output", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
  })
  const pidFile = join(host.directory, "owned.pids")
  host.queueResponse(
    ...call(
      `text(await tools.exec_command(${JSON.stringify({
        cmd: `trap '' HUP; sleep 30 & child=$!; printf '%s %s' $$ "$child" > '${pidFile}'; printf 'PARTIAL\\n'; wait`,
        shell: "/bin/sh",
        login: false,
      })}));`,
      "shutdown",
    ),
  )
  const session = host.session
  const running = session.prompt("Start a command before shutdown")
  let pids: number[] = []
  await t.waitFor(async () => {
    pids = (await readFile(pidFile, "utf8")).split(" ").map(Number)
    assert.equal(pids.length, 2)
  })
  await host.close()
  await running
  for (const pid of pids)
    assert.throws(() => process.kill(pid, 0), { code: "ESRCH" })
  const retained = session.messages.find(
    (message) =>
      message.role === "toolResult" &&
      message.toolCallId.startsWith("call_shutdown"),
  )
  assert(retained?.role === "toolResult")
  assert.match(JSON.stringify(retained.content), /PARTIAL/)
})

test("a completed PTY ignores late input while returning its unread final output", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
  })
  const gate = join(host.directory, "finish")
  const pidFile = join(host.directory, "owned.pid")
  await request(
    host,
    `text(await tools.exec_command(${JSON.stringify({
      cmd: `echo $$ > '${pidFile}'; printf 'EARLY\\n'; while [ ! -e '${gate}' ]; do sleep 0.02; done; printf 'LATE\\n'; exit 7`,
      shell: "/bin/sh",
      login: false,
      tty: true,
      yield_time_ms: 250,
    })}));`,
    "start",
  )
  const initial = result(host, "start")
  await writeFile(gate, "finish")
  const pid = Number(await readFile(pidFile, "utf8"))
  await t.waitFor(() =>
    assert.throws(() => process.kill(pid, 0), { code: "ESRCH" }),
  )
  await request(
    host,
    `text(await tools.write_stdin({session_id:${initial.session_id}, chars:"late\\n"}));`,
    "drain",
  )
  const drained = result(host, "drain")
  assert.equal(drained.output, "LATE\r\n")
  assert.equal(drained.exit_code, 7)
  assert.equal("session_id" in drained, false)
})

test("command defaults and command/input upper waits match the measured boundaries", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
  })
  await request(
    host,
    `text(await tools.exec_command(${JSON.stringify({
      cmd: 'stty size; IFS= read -r first; printf "ACK:%s\\n" "$first"; IFS= read -r last; exit 7',
      shell: "/bin/sh",
      login: false,
      tty: true,
      yield_time_ms: 250,
    })}));`,
    "terminal",
  )
  const terminal = result(host, "terminal")
  assert.equal(terminal.output, "24 80\r\n")
  const command = {
    cmd: "printf START; sleep 31; printf END; exit 7",
    shell: "/bin/sh",
    login: false,
  }
  const text = await request(
    host,
    `// @exec: {"yield_time_ms":60000}
text(await Promise.all([
  tools.exec_command(${JSON.stringify(command)}),
  tools.exec_command(${JSON.stringify({ ...command, yield_time_ms: 40000 })}),
  tools.write_stdin({session_id:${terminal.session_id},chars:"alpha\\n",yield_time_ms:40000}),
]));`,
    "boundaries",
  )
  const outcomes = JSON.parse(text.slice(text.indexOf("[")))
  assert(
    outcomes[0].wall_time_seconds >= 9.9 && outcomes[0].wall_time_seconds < 13,
  )
  assert.equal(outcomes[0].output, "START")
  assert.equal("exit_code" in outcomes[0], false)
  assert(
    outcomes[1].wall_time_seconds >= 29.9 && outcomes[1].wall_time_seconds < 33,
  )
  assert.equal(outcomes[1].output, "START")
  assert.equal("exit_code" in outcomes[1], false)
  assert(
    outcomes[2].wall_time_seconds >= 29.9 && outcomes[2].wall_time_seconds < 33,
  )
  assert.equal(outcomes[2].output, "alpha\r\nACK:alpha\r\n")
  assert.equal(outcomes[2].session_id, terminal.session_id)
  const final = await request(
    host,
    `text(await Promise.all([
    tools.write_stdin({session_id:${outcomes[0].session_id}}),
    tools.write_stdin({session_id:${outcomes[1].session_id}}),
    tools.write_stdin({session_id:${terminal.session_id},chars:"quit\\n"}),
  ]));`,
    "finish",
  )
  const finished = JSON.parse(final.slice(final.indexOf("[")))
  assert.deepEqual(
    finished.map((entry: { exit_code: number }) => entry.exit_code),
    [7, 7, 7],
  )
  assert.equal(finished[0].output, "END")
  assert.equal(finished[1].output, "END")
  assert.equal(finished[2].output, "quit\r\n")
})
