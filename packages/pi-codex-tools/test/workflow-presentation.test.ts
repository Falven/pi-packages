/* eslint-disable no-await-in-loop -- Native companion sessions share host state and controls. */
import assert from "node:assert/strict"
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import { setTimeout } from "node:timers/promises"
import { stripVTControlCharacters } from "node:util"
import { Text, visibleWidth } from "@earendil-works/pi-tui"
import {
  activityType,
  readActivity,
  readActivityUpdate,
  type ActivityUpdate,
} from "../../pi-chat/src/tool-adapters/activity-contract.ts"
import { openNativeHost } from "../../../fixtures/native-host.ts"
import {
  call,
  extension,
  functionCall,
  output,
  providerApi,
} from "./fixtures/model-loop.ts"

const companions = [
  "pi-composer",
  "pi-attachments",
  "pi-skill-references",
  "pi-chat",
  "pi-goal",
].map((name) => new URL(`../../${name}/src/index.ts`, import.meta.url).pathname)
const tiny =
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAADUlEQVR4nGNQqLgERAAIiQLVbsGVSQAAAABJRU5ErkJggg=="

async function openWork(host: Awaited<ReturnType<typeof openNativeHost>>) {
  await host.frame()
  let row = host
    .screenLines()
    .findIndex((line) => /Worked for .*▶/.test(stripVTControlCharacters(line)))
  while (row >= 0) {
    await host.key(`\x1b[<0;2;${row + 1}M`)
    await host.key(`\x1b[<0;2;${row + 1}m`)
    await host.key("\x1b")
    await host.frame()
    row = host
      .screenLines()
      .findIndex((line) =>
        /Worked for .*▶/.test(stripVTControlCharacters(line)),
      )
  }
  return stripVTControlCharacters(host.screenLines().join("\n"))
}

test("the companion-only control loads without extension errors", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: companions,
    rows: 80,
  })
  await host.session.prompt("Companion control")
  assert.match(await host.frame(), /Received\./)
})

test("streaming exec arguments stay quiet until the command starts", async (t) => {
  let received = false
  let argumentsReceived = false
  let commandStarted = false
  const host = await openNativeHost(t, {
    extensionPaths: [extension, ...companions],
    providerApi,
    providerProtocol: "responses",
    rows: 80,
    extensionFactories: [
      (pi) => {
        pi.on("message_update", ({ assistantMessageEvent }) => {
          if (!("partial" in assistantMessageEvent)) return
          for (const part of assistantMessageEvent.partial.content) {
            if (part.type !== "toolCall") continue
            received = true
            argumentsReceived ||= JSON.stringify(part.arguments).includes(
              "setTimeout",
            )
          }
        })
        pi.on("tool_execution_start", (event) => {
          commandStarted ||= event.toolName === "exec_command"
        })
      },
    ],
  })
  const command = "node -e 'setTimeout(() => {}, 700)'"
  const steps = call(
    `text(await tools.exec_command({cmd:${JSON.stringify(command)},login:false}));`,
    "pending",
  )
  host.queueResponse(
    steps[0]!,
    { pause: true },
    steps[1]!,
    { pause: true },
    ...steps.slice(2),
  )
  const work = host.session.prompt("Run the command")
  await t.waitFor(() => assert(received))
  await host.key("\x0f")
  await host.frame()
  const screen = () => stripVTControlCharacters(host.screenLines().join("\n"))
  assert.doesNotMatch(screen(), /Called|Calling|status unknown/)
  assert.match(screen(), /[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏][^\n]*Thinking/)
  host.resumeResponse()
  await t.waitFor(() => assert(argumentsReceived))
  await host.frame()
  assert.equal(commandStarted, false)
  assert.doesNotMatch(screen(), /Called|Calling|status unknown/)
  host.resumeResponse()
  await t.waitFor(() => assert(commandStarted))
  await host.frame()
  assert.match(screen(), /Running (?:node|command)/)
  assert.equal(
    screen()
      .split("\n")
      .find((line) => line.trimStart().startsWith("▼ "))
      ?.trim(),
    `▼ Running ${command}`,
  )
  assert.match(screen(), /[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏][^\n]*Running node/)
  assert.doesNotMatch(screen(), /(?:Called|Calling) exec|status unknown/)
  await work
  await openWork(host)
  await host.frame()
  assert.match(screen(), /Ran command/)
  assert.doesNotMatch(screen(), /[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏][^\n]*(Thinking|Running)/)
  assert.doesNotMatch(screen(), /(?:Called|Calling) exec|status unknown/)
  const commandFacts = host.session.messages
    .flatMap((message) =>
      message.role === "toolResult"
        ? (readActivity(message)?.update.operations ?? [])
        : [],
    )
    .find((operation) => operation.kind === "command")
  assert(commandFacts?.kind === "command")
  assert.equal(typeof commandFacts.shell?.[0], "string")
  assert.deepEqual(commandFacts.shell?.slice(1), ["-c"])
})

test("forwarded and combined results stay out of activity while mixed source remains searchable", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension, ...companions],
    providerApi,
    providerProtocol: "responses",
    rows: 110,
    columns: 120,
    persistSession: true,
    keybindings: { "tui.altScreen.search": "ctrl+f" },
  })
  host.queueResponse(
    ...call(
      'const a = await tools.exec_command({cmd:"printf first-value",login:false}); const b = await tools.exec_command({cmd:"printf second-value",login:false}); text(a); text(a.output); text([a,b]); text("raw-"+"source-needle");',
      "forwarded",
    ),
  )
  await host.session.prompt("Read both results")
  assert.match(output(host, "forwarded"), /raw-source-needle/)
  await openWork(host)
  await host.key("\x0f")
  await host.frame()
  const screen = () => stripVTControlCharacters(host.screenLines().join("\n"))
  assert.doesNotMatch(screen(), /(?:>|▼) Output|raw-source-needle/)
  for (const value of ["first-value", "second-value"])
    assert.equal(
      screen()
        .split("\n")
        .filter((line) => line.trim() === value).length,
      1,
    )
  const firstCommand = host
    .screenLines()
    .findIndex(
      (line) => stripVTControlCharacters(line).trim() === "▼ Ran command",
    )
  assert(firstCommand >= 0)
  await host.key(`\x1b[<0;2;${firstCommand + 1}M`)
  await host.key(`\x1b[<0;2;${firstCommand + 1}m`)
  await host.frame()
  const messages = () =>
    JSON.stringify(
      host.session.sessionManager
        .getBranch()
        .filter((entry) => entry.type === "message"),
    )
  const before = messages()
  const requests = host.requests.length
  await host.key("\x06")
  await host.type("raw-source-needle")
  await host.frame()
  assert.match(screen(), /1\/1/)
  assert.match(screen(), /\bexec\b/)
  assert.equal((screen().match(/raw-source-needle/g) ?? []).length, 2)
  await host.key("\x1b")
  await host.frame()
  assert.doesNotMatch(screen(), /raw-source-needle|\bexec\b/)
  assert.equal(
    screen()
      .split("\n")
      .filter((line) => line.trim() === "first-value").length,
    0,
  )
  assert.equal(
    screen()
      .split("\n")
      .filter((line) => line.trim() === "second-value").length,
    1,
  )
  assert.equal(messages(), before)
  assert.equal(host.requests.length, requests)
})

test("a failed command keeps its activity while a distinct script error stays in source", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension, ...companions],
    providerApi,
    providerProtocol: "responses",
    rows: 90,
    columns: 120,
    persistSession: true,
    keybindings: { "tui.altScreen.search": "ctrl+f" },
  })
  host.queueResponse(
    ...call(
      'await tools.exec_command({cmd:"printf unsuccessful-child; exit 7",login:false}); throw new Error("distinct-call-failure");',
      "failed-child",
    ),
  )
  await host.session.prompt("Run work with a failing command and script")
  assert.match(output(host, "failed-child"), /distinct-call-failure/)
  await openWork(host)
  await host.key("\x0f")
  await host.frame()
  const screen = () => stripVTControlCharacters(host.screenLines().join("\n"))
  assert.match(screen(), /Ran command \(failed\)/)
  assert.match(screen(), /unsuccessful-child/)
  assert.doesNotMatch(
    screen(),
    /(?:>|▼) Error|Call error:|distinct-call-failure/,
  )
  await host.key("\x06")
  await host.type("Error: distinct-call-failure")
  await host.frame()
  assert.match(screen(), /1\/1/)
  assert.match(screen(), /Script error:/)
  await host.key("\x1b")
  await host.reload()
  await openWork(host)
  await host.frame()
  assert.match(screen(), /Ran command \(failed\)/)
  assert.doesNotMatch(
    screen(),
    /(?:>|▼) Error|Call error:|distinct-call-failure/,
  )
})

test("a script failure with no message remains in model results and source without an activity", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension, ...companions],
    providerApi,
    providerProtocol: "responses",
    rows: 60,
    persistSession: true,
    keybindings: { "tui.altScreen.search": "ctrl+f" },
  })
  host.queueResponse(...call('throw "";', "empty-error"))
  await host.session.prompt("Run a script that fails without a message")
  assert.equal(output(host, "empty-error"), "Script error:\n")
  await openWork(host)
  await host.key("\x0f")
  await host.frame()
  const screen = () => stripVTControlCharacters(host.screenLines().join("\n"))
  assert.doesNotMatch(screen(), /(?:>|▼) Error|Called exec/)
  const failure = host.session.messages.find(
    (message) =>
      message.role === "toolResult" &&
      message.toolCallId.startsWith("call_empty-error"),
  )
  assert(failure?.role === "toolResult" && failure.isError)
  assert.deepEqual(readActivity(failure)?.update.operations, [])
  await host.key("\x06")
  await host.type("Script error:")
  await host.frame()
  assert.match(screen(), /1\/1/)
  await host.key("\x1b")
  await host.reload()
  await openWork(host)
  await host.frame()
  assert.doesNotMatch(screen(), /(?:>|▼) Error|Called exec/)
  assert.equal(output(host, "empty-error"), "Script error:\n")
})

for (const order of ["first", "last"] as const) {
  test(`input failures stay in source and Ctrl+C updates the original command with the toolset loaded ${order}`, async (t) => {
    const updates: ActivityUpdate[] = []
    const host = await openNativeHost(t, {
      extensionPaths:
        order === "first"
          ? [extension, ...companions]
          : [...companions, extension],
      providerApi,
      providerProtocol: "responses",
      rows: 120,
      columns: 120,
      persistSession: true,
      keybindings: { "tui.altScreen.search": "ctrl+f" },
      extension(pi) {
        pi.events.on(activityType, (value) => {
          const update = readActivityUpdate(value)
          if (update) updates.push(update)
        })
      },
    })
    const command =
      'trap \'printf "STOPPED\\n"; exit 23\' INT; printf "READY\\n"; sleep 30; printf "AFTER\\n"'
    host.queueResponse(
      ...call(
        `const p = await tools.exec_command(${JSON.stringify({ cmd: command, shell: "/bin/sh", login: false, yield_time_ms: 250 })}); store("process", p.session_id); text(p);`,
        "input-start",
      ),
    )
    await host.session.prompt("Start a non-terminal command")
    const latest = () =>
      updates
        .flatMap((update) => update.operations)
        .findLast((operation) => operation.kind === "command")
    const origin = latest()?.id
    assert(origin)
    const rejected =
      'await tools.write_stdin({session_id:load("process"),chars:"ordinary input\\n"});'
    for (const [id, source, expected] of [
      ["input-rejected", rejected, "stdin is closed"],
      [
        "input-caught",
        `try { ${rejected} } catch (error) { text([typeof error, error]); }`,
        '["string","write_stdin failed: stdin is closed',
      ],
      [
        "input-unknown",
        'await tools.write_stdin({session_id:2147483647,chars:""});',
        "Unknown process id 2147483647",
      ],
    ]) {
      host.queueResponse(...call(source!, id!))
      await host.session.prompt(id!)
      assert(output(host, id!).includes(expected!))
      assert.equal(latest()?.status, "running")
    }
    host.queueResponse(
      ...call(
        'text(await tools.write_stdin({session_id:load("process"),chars:"\\u0003",yield_time_ms:1000}));',
        "input-interrupt",
      ),
    )
    await host.session.prompt("Interrupt the command")
    assert.match(output(host, "input-interrupt"), /"exit_code":23/)
    await t.waitFor(() => assert.equal(latest()?.status, "failed"))
    assert.equal(latest()?.id, origin)
    assert.match(latest()?.output ?? "", /READY\nSTOPPED\n/)
    for (const update of updates)
      for (const operation of update.operations)
        assert.equal(operation.id, origin)
    for (const message of host.session.messages) {
      if (
        message.role !== "toolResult" ||
        message.toolCallId.startsWith("call_input-start")
      )
        continue
      assert.deepEqual(readActivity(message)?.update.operations, [])
    }
    await openWork(host)
    await host.key("\x0f")
    await host.frame()
    const screen = () => stripVTControlCharacters(host.screenLines().join("\n"))
    assert.match(screen(), /Ran command \(failed\)/)
    assert.match(screen(), /READY\s+STOPPED/)
    assert.doesNotMatch(
      screen(),
      /write_stdin|Called exec|(?:>|▼) Error|Call error:|stdin is closed|Unknown process id/,
    )
    const requests = host.requests.length
    await host.key("\x06")
    await host.type("Unknown process id 2147483647")
    await host.frame()
    assert.match(screen(), /1\/1/)
    assert.match(screen(), /write_stdin failed: Unknown process id 2147483647/)
    await host.key("\x1b")
    await host.reload()
    await openWork(host)
    await host.frame()
    assert.match(screen(), /Ran command \(failed\)/)
    assert.doesNotMatch(
      screen(),
      /write_stdin|Called exec|(?:>|▼) Error|Call error:/,
    )
    assert.equal(host.requests.length, requests)
  })
}

for (const order of ["first", "last"] as const) {
  test(`skill reads keep their labels and other actions with the toolset loaded ${order}`, async (t) => {
    const catalog = await mkdtemp(join(tmpdir(), "pi-skill reads-"))
    t.after(() => rm(catalog, { recursive: true, force: true }))
    const directory = join(catalog, "domain-modeling")
    const skill = join(directory, "SKILL.md")
    await mkdir(directory)
    await writeFile(
      skill,
      "---\nname: domain-modeling\ndescription: Inspect the domain\n---\nRegistered skill instructions.\n",
    )
    const host = await openNativeHost(t, {
      extensionPaths:
        order === "first"
          ? [extension, ...companions]
          : [...companions, extension],
      skillPaths: [catalog],
      providerApi,
      providerProtocol: "responses",
      rows: 150,
      columns: 120,
      persistSession: true,
    })
    await writeFile(
      join(host.directory, "notes.txt"),
      "Ordinary file content.\n",
    )
    await mkdir(join(host.directory, "unregistered"))
    await writeFile(
      join(host.directory, "unregistered", "SKILL.md"),
      "---\nname: domain-modeling\n---\nUnregistered skill-shaped text.\n",
    )
    const command = `printf '\\n--- domain-modeling skill ---\\n'; cat '${skill}'; cat notes.txt`
    host.queueResponse(
      ...call(
        `text((await tools.exec_command({cmd:${JSON.stringify(command)},login:false})).output); await tools.exec_command({cmd:"printf separate-action",login:false}); await tools.exec_command({cmd:"cat unregistered/SKILL.md",login:false}); await tools.exec_command({cmd:${JSON.stringify(`true && cat '${skill}'`)},login:false});`,
        "skill-read",
      ),
    )
    await host.session.prompt("Read the skill and inspect the other work")
    assert.match(
      output(host, "skill-read"),
      /Registered skill instructions|Ordinary file content|separate-action/,
    )
    await openWork(host)
    const groupRow = host
      .screenLines()
      .findIndex((line) =>
        stripVTControlCharacters(line).includes(
          "> Loaded a tool, read files, ran a command",
        ),
      )
    assert(groupRow >= 0)
    await host.key(`\x1b[<0;2;${groupRow + 1}M`)
    await host.key(`\x1b[<0;2;${groupRow + 1}m`)
    await host.frame()
    const screen = () => stripVTControlCharacters(host.screenLines().join("\n"))
    assert.match(screen(), /> Read domain-modeling skill/)
    assert.match(screen(), /> Read notes\.txt/)
    assert.match(screen(), /> Read SKILL\.md/)
    assert.match(screen(), /> Ran printf separate-action/)
    assert.doesNotMatch(screen(), /> Ran true && cat/)
    assert.doesNotMatch(screen(), /(?:>|▼) Output|> Ran printf '\\n---/)
    await host.key("\x0f")
    await host.frame()
    assert.match(screen(), /Registered skill instructions/)
    assert.match(screen(), /Ordinary file content/)
    assert.match(screen(), /separate-action/)
    await host.reload()
    await openWork(host)
    assert.equal(
      (screen().match(/(?:>|▼) Read domain-modeling skill/g) ?? []).length,
      2,
    )
    const fork = await host.runtime.fork(
      host.session.sessionManager.getLeafId()!,
      { position: "at" },
    )
    assert.equal(fork.cancelled, false)
    await openWork(host)
    assert.equal(
      (screen().match(/(?:>|▼) Read domain-modeling skill/g) ?? []).length,
      2,
    )
  })
}

test(
  "terminal submissions update their origin while successful polls and execution receipts stay quiet",
  { timeout: 15000 },
  async (t) => {
    const updates: ActivityUpdate[] = []
    const host = await openNativeHost(t, {
      extensionPaths: [extension, ...companions],
      providerApi,
      providerProtocol: "responses",
      rows: 180,
      columns: 140,
      extension(pi) {
        pi.events.on(activityType, (value) => {
          const update = readActivityUpdate(value)
          if (update?.callId.startsWith("call_terminal-start"))
            updates.push(update)
        })
      },
    })
    host.queueResponse(
      ...call(
        'const p = await tools.exec_command({cmd:"read first; read second; printf \'%s:%s\' \\"$first\\" \\"$second\\"",login:false,tty:true,yield_time_ms:1}); store("terminal", p.session_id); text(p);',
        "terminal-start",
      ),
    )
    await host.session.prompt("Start terminal")
    const run = async (chars: string, id: string) => {
      host.queueResponse(
        ...call(
          `text(await tools.write_stdin({session_id:load("terminal"),chars:${JSON.stringify(chars)},yield_time_ms:1}));`,
          id,
        ),
      )
      await host.session.prompt(id)
    }
    await run("fir", "partial-input")
    await run("", "empty-poll")
    const latest = () =>
      updates
        .flatMap((update) => update.operations)
        .findLast((operation) => operation.kind === "command")
    assert.equal(latest()?.commands.length, 1)
    await run("st\nsec", "first-submission")
    assert.deepEqual(latest()?.commands.slice(1), ["first"])
    await run("ond\n", "second-submission")
    await t.waitFor(() => assert.equal(latest()?.status, "completed"))
    const command = latest()
    assert(command?.kind === "command")
    assert.deepEqual(command.commands.slice(1), ["first", "second"])
    assert.match(command.output ?? "", /first:second/)
    const history = host.session.sessionManager.getBranch()
    for (const entry of history) {
      if (
        entry.type !== "message" ||
        entry.message.role !== "toolResult" ||
        entry.message.toolCallId.startsWith("call_terminal-start")
      )
        continue
      assert.deepEqual(readActivity(entry.message)?.update.operations, [])
    }
    await openWork(host)
    await host.key("\x0f")
    await host.frame()
    const screen = stripVTControlCharacters(host.screenLines().join("\n"))
    assert.doesNotMatch(
      screen,
      /Collected output|Execution completed|write_stdin|exec_command/,
    )
    assert(screen.indexOf("first:second") < screen.indexOf("partial-input"))
  },
)

for (const order of ["first", "last"] as const) {
  test(
    `mixed operations retain native flow and disclosures with the toolset loaded ${order}`,
    { timeout: 15000 },
    async (t) => {
      const outputPad = order === "first" ? 1 : 0
      const expandKey = order === "first" ? "\x0f" : "\x05"
      const host = await openNativeHost(t, {
        extensionPaths:
          order === "first"
            ? [extension, ...companions]
            : [...companions, extension],
        providerApi,
        providerProtocol: "responses",
        rows: 260,
        columns: 100,
        keybindings: {
          "tui.altScreen.search": "ctrl+f",
          ...(order === "last" ? { "app.tools.expand": "ctrl+e" } : {}),
        },
        settings: {
          theme: order === "first" ? "dark" : "light",
          outputPad,
          terminal: { showImages: false },
        },
        extension(pi) {
          pi.registerMessageRenderer(
            "workflow-notice",
            () => new Text("Unrelated workflow notice", 0, 0),
          )
          let sent = false
          pi.on("agent_end", () => {
            if (sent) return
            sent = true
            pi.sendMessage(
              {
                customType: "workflow-notice",
                content: "Unrelated workflow notice",
                display: true,
              },
              { triggerTurn: false },
            )
          })
          pi.on("tool_result", (event) => {
            if (
              event.toolName === "exec_command" &&
              event.input["cmd"] === "cat changed.txt"
            )
              return {
                content: [
                  {
                    type: "text",
                    text: `validated-result\n${Array.from(
                      { length: 40 },
                      (_, index) => `validated-line-${index}`,
                    ).join("\n")}`,
                  },
                ],
              }
            return undefined
          })
        },
      })
      await writeFile(
        join(host.directory, "local.png"),
        Buffer.from(tiny, "base64"),
      )
      await writeFile(
        join(host.directory, "late.png"),
        Buffer.from(tiny, "base64"),
      )
      const source =
        'await tools.exec_command({cmd:"printf inspect-project",login:false}); await tools.apply_patch("*** Begin Patch\\n*** Add File: changed.txt\\n+CHANGED\\n*** Add File: extra-one.txt\\n+ONE\\n*** Add File: extra-two.txt\\n+TWO\\n*** End Patch"); text(await tools.exec_command({cmd:"cat changed.txt",login:false})); image((await tools.view_image({path:"local.png"})).image_url); await yield_control(); await new Promise(resolve=>setTimeout(resolve,120)); image((await tools.view_image({path:"late.png"})).image_url); text("LATE-MIXED-"+"RESULT"); throw new Error("LATE-MIXED-FAILURE");'
      host.queueResponse(...call(source, "mixed"))
      await host.session.prompt(
        "Inspect, change, validate, and inspect the image",
      )
      const id = output(host, "mixed").match(/cell ID ([^\n]+)/)?.[1]
      assert(id)
      const requests = host.requests.length
      await setTimeout(220)
      assert.equal(host.requests.length, requests)
      let screen = await openWork(host)
      assert.match(
        screen,
        /> Edited files, read files, ran a command, viewed images/,
      )
      assert.doesNotMatch(screen, /validated-result|LATE-MIXED|, error/)
      const groupRow = host
        .screenLines()
        .findIndex((line) =>
          stripVTControlCharacters(line).includes("Edited files"),
        )
      assert(groupRow >= 0)
      assert.equal(
        stripVTControlCharacters(host.screenLines()[groupRow]!).indexOf(">"),
        outputPad,
      )
      await host.key(`\x1b[<0;2;${groupRow + 1}M`)
      await host.key(`\x1b[<0;2;${groupRow + 1}m`)
      host.terminal.resize(160, 260)
      await host.frame()
      screen = stripVTControlCharacters(host.screenLines().join("\n"))
      assert.match(screen, /> Edited .*\/changed\.txt \+1 -0/)
      assert.match(screen, /> Edited .*\/extra-one\.txt \+1 -0/)
      assert.match(screen, /> Edited .*\/extra-two\.txt \+1 -0/)
      assert.match(screen, /> Ran printf inspect-project/)
      assert.match(screen, /> Read changed\.txt/)
      assert.match(screen, /> Viewed image .*local\.png/)
      assert.match(screen, /> Viewed image .*late\.png/)
      assert.doesNotMatch(screen, /> Error|validated-result|LATE-MIXED/)
      const commandRow = host
        .screenLines()
        .findIndex((line) =>
          stripVTControlCharacters(line).includes("Read changed.txt"),
        )
      assert(commandRow >= 0)
      assert.equal(
        stripVTControlCharacters(host.screenLines()[commandRow]!).indexOf(">"),
        outputPad,
      )
      await host.key(`\x1b[<0;2;${commandRow + 1}M`)
      await host.key(`\x1b[<0;2;${commandRow + 1}m`)
      await host.frame()
      screen = stripVTControlCharacters(host.screenLines().join("\n"))
      assert.doesNotMatch(screen, /exec_command/)
      assert.match(screen, /cat changed\.txt/)
      assert.match(screen, /validated-result/)
      assert.doesNotMatch(screen, /validated-line-39/)
      assert.match(screen, /more lines/)
      const nativeOutputRow = host
        .screenLines()
        .findIndex(
          (line) => stripVTControlCharacters(line).trim() === "cat changed.txt",
        )
      assert(nativeOutputRow > commandRow)
      await host.key(`\x1b[<0;2;${nativeOutputRow + 1}M`)
      await host.key(`\x1b[<0;2;${nativeOutputRow + 1}m`)
      await host.frame()
      screen = stripVTControlCharacters(host.screenLines().join("\n"))
      assert.equal(
        (screen.match(/^\s*validated-line-\d+\s*$/gm) ?? []).length,
        40,
      )
      assert.match(screen, /> Ran printf inspect-project/)
      assert.doesNotMatch(screen, /> Error|LATE-MIXED/)
      await host.key(`\x1b[<0;2;${groupRow + 1}M`)
      await host.key(`\x1b[<0;2;${groupRow + 1}m`)
      assert.doesNotMatch(await host.frame(), /validated-result/)
      await host.key(`\x1b[<0;2;${groupRow + 1}M`)
      await host.key(`\x1b[<0;2;${groupRow + 1}m`)
      await host.frame()
      screen = stripVTControlCharacters(host.screenLines().join("\n"))
      assert.match(screen, /validated-line-39/)
      assert.match(screen, /> Ran printf inspect-project/)
      await host.key(`\x1b[<0;2;${nativeOutputRow + 1}M`)
      await host.key(`\x1b[<0;2;${nativeOutputRow + 1}m`)
      await host.frame()
      screen = stripVTControlCharacters(host.screenLines().join("\n"))
      assert.match(screen, /▼ Edited files/)
      assert.match(screen, /▼ Read changed\.txt/)
      assert.match(screen, /more lines/)
      assert.doesNotMatch(screen, /validated-line-39/)
      const activityRow = host
        .screenLines()
        .findIndex((line) => stripVTControlCharacters(line).includes("Worked"))
      assert(activityRow >= 0)
      await host.key(`\x1b[<0;2;${activityRow + 1}M`)
      await host.key(`\x1b[<0;2;${activityRow + 1}m`)
      if (order === "last") await host.key("\x0f")
      await host.frame()
      screen = stripVTControlCharacters(host.screenLines().join("\n"))
      assert.match(screen, /Worked for \d+m \d+s ▶/)
      assert.doesNotMatch(screen, /Edited files|validated-result/)
      assert.match(screen, /Unrelated workflow notice/)
      assert.match(screen, /Received\./)
      await host.key(expandKey)
      await host.frame()
      screen = stripVTControlCharacters(host.screenLines().join("\n"))
      assert.match(screen, /Worked for \d+m \d+s ▼/)
      assert.match(screen, /▼ Edited files/)
      assert.match(screen, /▼ Ran command/)
      assert.doesNotMatch(screen, /▼ Error/)
      assert.equal((screen.match(/^ *▼ /gm) ?? []).length, 9)
      assert.match(screen, /inspect-project/)
      assert.match(screen, /validated-result/)
      assert.match(screen, /validated-line-39/)
      assert.match(screen, /local\.png/)
      assert.match(screen, /late\.png/)
      assert.doesNotMatch(screen, /LATE-MIXED/)
      assert.match(screen, /Unrelated workflow notice/)
      assert.match(screen, /Received\./)
      assert.doesNotMatch(screen, /input: await tools\.exec_command/)
      assert.doesNotMatch(
        screen,
        /Command ·|Patch ·|Image ·|chunk_id|cell_id|iVBOR|core-tools\.activity/,
      )
      assert.match(output(host, "mixed"), /validated-result/)
      assert.doesNotMatch(output(host, "mixed"), /CHANGED/)
      assert.match(JSON.stringify(host.requests.at(-1)), /"type":"input_image"/)
      await host.key(`\x1b[<0;2;${groupRow + 1}M`)
      await host.key(`\x1b[<0;2;${groupRow + 1}m`)
      assert.doesNotMatch(await host.frame(), /validated-result/)
      host.queueResponse(
        ...functionCall("wait", { cell_id: id }, "collect-mixed", "functions"),
      )
      await host.session.prompt("Collect the execution")
      assert.match(output(host, "collect-mixed"), /LATE-MIXED-RESULT/)
      assert.match(output(host, "collect-mixed"), /LATE-MIXED-FAILURE/)
      screen = await openWork(host)
      assert.match(screen, /> Edited files/)
      assert.match(screen, /▼ Viewed image/)
      assert.doesNotMatch(
        screen,
        /Collected output|cell_status|Execution completed/,
      )
      assert.equal(
        (screen.match(/\[Image: \[image\/png\] 2x1\]/g) ?? []).length,
        1,
      )
      assert.doesNotMatch(screen, /validated-result|LATE-MIXED/)
      await host.key(expandKey)
      await host.frame()
      screen = stripVTControlCharacters(host.screenLines().join("\n"))
      assert.equal((screen.match(/Worked for \d+m \d+s ▶/g) ?? []).length, 2)
      assert.doesNotMatch(screen, /Edited files|Collected output|LATE-MIXED/)
      assert.match(screen, /Unrelated workflow notice/)
      assert.equal((screen.match(/Received\./g) ?? []).length, 2)
      await host.reload()
      screen = await openWork(host)
      assert.match(screen, /> Viewed image/)
      assert.doesNotMatch(screen, /Viewed an image/)
      const retainedGroup = host
        .screenLines()
        .findIndex((line) =>
          stripVTControlCharacters(line).includes("Edited files"),
        )
      assert(retainedGroup >= 0)
      await host.key(`\x1b[<0;2;${retainedGroup + 1}M`)
      await host.key(`\x1b[<0;2;${retainedGroup + 1}m`)
      host.terminal.resize(160, 260)
      await host.frame()
      screen = stripVTControlCharacters(host.screenLines().join("\n"))
      assert.equal((screen.match(/> Read changed\.txt/g) ?? []).length, 1)
      assert.equal(
        (screen.match(/> Edited .*\/.*\.txt \+1 -0/g) ?? []).length,
        3,
      )
      assert.doesNotMatch(screen, /> Error|LATE-MIXED/)
      const originImageRow = host
        .screenLines()
        .findIndex(
          (line) => stripVTControlCharacters(line).trim() === "> Viewed image",
        )
      assert(originImageRow >= 0)
      await host.key(`\x1b[<0;2;${originImageRow + 1}M`)
      await host.key(`\x1b[<0;2;${originImageRow + 1}m`)
      await host.frame()
      const collectionRow = host
        .screenLines()
        .findIndex(
          (line, index) =>
            index > originImageRow &&
            stripVTControlCharacters(line).trim() === "> Viewed image",
        )
      assert(collectionRow >= 0)
      await host.key(`\x1b[<0;2;${collectionRow + 1}M`)
      await host.key(`\x1b[<0;2;${collectionRow + 1}m`)
      await host.frame()
      screen = stripVTControlCharacters(host.screenLines().join("\n"))
      assert.doesNotMatch(screen, /LATE-MIXED-FAILURE/)
      assert.equal((screen.match(/validated-result/g) ?? []).length, 0)
      assert.equal(
        screen.split("\n").filter((line) => line.trim() === "LATE-MIXED-RESULT")
          .length,
        0,
      )
      assert.equal(
        (screen.match(/\[Image: \[image\/png\] 2x1\]/g) ?? []).length,
        2,
      )
      assert.doesNotMatch(screen, /interrupted or unknown/)
      assert.match(screen, /Unrelated workflow notice/)
      const collectedRequests = host.requests.length
      await host.key("\x06")
      await host.type("Script error:")
      await host.frame()
      screen = stripVTControlCharacters(host.screenLines().join("\n"))
      assert.match(screen, /1\/1/)
      assert.match(screen, /LATE-MIXED-FAILURE/)
      await host.key("\x1b")
      await host.key("\x06")
      await host.type("LATE-MIXED-RESULT")
      await host.frame()
      screen = stripVTControlCharacters(host.screenLines().join("\n"))
      assert.match(screen, /\bwait\b/)
      assert.match(screen, /LATE-MIXED-RESULT/)
      assert.equal(
        (screen.match(/\[Image: \[image\/png\] 2x1\]/g) ?? []).length,
        2,
      )
      await host.key("\x1b")
      await host.frame()
      screen = stripVTControlCharacters(host.screenLines().join("\n"))
      assert.doesNotMatch(screen, /\bwait\b|LATE-MIXED-RESULT/)
      assert.equal(host.requests.length, collectedRequests)
      host.terminal.resize(100, 260)
      await host.frame()
      assert(host.screenLines().every((line) => visibleWidth(line) <= 100))
      const history = host.session.sessionManager.getBranch()
      assert(
        history.some(
          (entry) =>
            entry.type === "custom" &&
            entry.customType === "core-tools.activity",
        ),
      )
      assert(
        JSON.stringify(history).includes(JSON.stringify(source).slice(1, -1)),
      )
      assert.deepEqual(
        history.flatMap((entry) =>
          entry.type === "message" && entry.message.role === "toolResult"
            ? [
                {
                  tool: entry.message.toolName,
                  images: entry.message.content.filter(
                    (part) => part.type === "image",
                  ).length,
                },
              ]
            : [],
        ),
        [
          { tool: "exec", images: 1 },
          { tool: "wait", images: 1 },
        ],
      )
    },
  )
}

test(
  "a command keeps its original companion card while another final response streams",
  { timeout: 15000 },
  async (t) => {
    const host = await openNativeHost(t, {
      extensionPaths: [...companions, extension],
      providerApi,
      providerProtocol: "responses",
      rows: 180,
      columns: 100,
    })
    host.queueResponse(
      ...call(
        'await yield_control(); text(await tools.exec_command({cmd:"printf STREAM-EARLY; while [ ! -f release ]; do sleep 0.01; done; printf STREAM-LATE; exit 9",login:false,yield_time_ms:1000}));',
        "stream-origin",
      ),
    )
    await host.session.prompt("Start the originating command")
    const id = output(host, "stream-origin").match(/cell ID ([^\n]+)/)?.[1]
    assert(id)
    const release = join(host.directory, "release")
    try {
      await openWork(host)
      await t.waitFor(
        () =>
          assert(
            host
              .screenLines()
              .some((line) =>
                stripVTControlCharacters(line).includes("Running a command"),
              ),
          ),
        { timeout: 5000 },
      )
      const groupRow = host
        .screenLines()
        .findIndex((line) =>
          stripVTControlCharacters(line).includes("Running a command"),
        )
      assert(groupRow >= 0)
      await host.key(`\x1b[<0;2;${groupRow + 1}M`)
      await host.key(`\x1b[<0;2;${groupRow + 1}m`)
      await t.waitFor(
        () =>
          assert(
            host
              .screenLines()
              .some((line) =>
                /Running printf STREAM-EARLY/.test(
                  stripVTControlCharacters(line),
                ),
              ),
          ),
        { timeout: 5000 },
      )
      const commandRow = host
        .screenLines()
        .findIndex((line) =>
          stripVTControlCharacters(line).includes(
            "Running printf STREAM-EARLY",
          ),
        )
      assert(commandRow >= 0)
      await host.key(`\x1b[<0;2;${commandRow + 1}M`)
      await host.key(`\x1b[<0;2;${commandRow + 1}m`)
      await t.waitFor(
        () =>
          assert(
            host
              .screenLines()
              .some(
                (line) =>
                  stripVTControlCharacters(line).trim() === "STREAM-EARLY",
              ),
          ),
        { timeout: 5000 },
      )
      const nativeOutputRow = host
        .screenLines()
        .findIndex((line) =>
          stripVTControlCharacters(line)
            .trim()
            .startsWith("printf STREAM-EARLY"),
        )
      assert(nativeOutputRow > commandRow)
      await host.key(`\x1b[<0;2;${nativeOutputRow + 1}M`)
      await host.key(`\x1b[<0;2;${nativeOutputRow + 1}m`)
      const answer = {
        type: "message",
        id: "later-final",
        role: "assistant",
        content: [{ type: "output_text", text: "Later streaming final" }],
      }
      host.queueResponse(
        {
          event: {
            type: "response.output_item.added",
            output_index: 0,
            item: { ...answer, content: [] },
          },
        },
        {
          event: {
            type: "response.output_text.delta",
            output_index: 0,
            content_index: 0,
            delta: "Later streaming final",
          },
        },
        { pause: true },
        {
          event: {
            type: "response.output_item.done",
            output_index: 0,
            item: answer,
          },
        },
        {
          event: {
            type: "response.completed",
            response: { id: "later-response", status: "completed" },
          },
        },
      )
      const later = host.session.prompt("An independent later request")
      await t.waitFor(
        () =>
          assert.match(
            stripVTControlCharacters(host.screenLines().join("\n")),
            /Later streaming final/,
          ),
        { timeout: 5000 },
      )
      const requests = host.requests.length
      await writeFile(release, "go")
      await t.waitFor(
        () =>
          assert.match(
            stripVTControlCharacters(host.screenLines().join("\n")),
            /Ran command \(failed\)/,
          ),
        { timeout: 5000 },
      )
      const screen = stripVTControlCharacters(host.screenLines().join("\n"))
      assert.match(screen, /STREAM-EARLYSTREAM-LATE/)
      assert(
        screen.indexOf("STREAM-EARLYSTREAM-LATE") <
          screen.indexOf("An independent later request"),
      )
      assert.equal(host.requests.length, requests)
      host.resumeResponse()
      await later
      host.queueResponse(
        ...functionCall("wait", { cell_id: id }, "stream-collect", "functions"),
      )
      await host.session.prompt("Collect the originating command")
      assert.match(output(host, "stream-collect"), /STREAM-EARLYSTREAM-LATE/)
      assert.match(output(host, "stream-collect"), /"exit_code":9/)
      const collected = await openWork(host)
      assert.doesNotMatch(collected, /Collected output|Execution completed/)
      assert.equal(
        (collected.match(/STREAM-EARLYSTREAM-LATE/g) ?? []).length,
        1,
      )
    } finally {
      await writeFile(release, "go")
    }
  },
)
