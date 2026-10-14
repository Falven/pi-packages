/* eslint-disable no-await-in-loop -- Native host cases share process environment and must close in order. */
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import { createBashToolDefinition } from "@earendil-works/pi-coding-agent"
import { Type } from "typebox"
import { openNativeHost } from "../../../fixtures/native-host.ts"

import {
  call,
  completed,
  extension,
  functionCall,
  output,
  providerApi,
} from "./fixtures/model-loop.ts"
const baseline = JSON.parse(
  await readFile(new URL("../src/contract.json", import.meta.url), "utf8"),
)
const canonical = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.entries(value)
            .toSorted(([a], [b]) => a.localeCompare(b, "en"))
            .map(([key, entry]) => [key, canonical(entry)]),
        )
      : value
test("the outgoing request declares the frozen raw execution contract", async (t) => {
  assert.equal(
    baseline.source_sha256,
    "c96638241baa0167c3603823374d67a616a4d4df5142496a1d13971ece498843",
  )
  assert.equal(
    createHash("sha256")
      .update(JSON.stringify(canonical(baseline.namespace)))
      .digest("hex"),
    "fcfd6138dc219b03fd1afde6c0c0e981bed7ef1041096557cf61c583bc0935b7",
  )
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
  })
  host.queueResponse(completed)
  await host.session.prompt("Use the selected core tools")
  const request = host.requests[0] as unknown as {
    tools: {
      type: string
      name: string
      tools?: { description: string; [key: string]: unknown }[]
    }[]
  }
  const namespace = request.tools.find((tool) => tool.name === "functions")
  assert(namespace)
  assert.equal(namespace.type, "namespace")
  assert.equal(namespace.tools?.length, 1)
  const declared = namespace.tools[0]!
  const { description: frozen, ...shape } = baseline.namespace.tools[0]
  assert.deepEqual(
    { ...declared, description: undefined },
    { ...shape, description: undefined },
  )
  assert(
    declared.description.includes(
      frozen.split("### `exec_command`\n")[1].split("\n### `")[0],
    ),
  )
  assert.doesNotMatch(
    declared.description,
    /`(?:wait|image|store|load|notify|setTimeout|clearTimeout|yield_control|apply_patch|view_image|write_stdin)`/,
  )
  assert.match(declared.description, /completed scripts/i)
  assert.equal(
    request.tools.some((tool) =>
      ["bash", "grep", "find", "ls", "exec_command"].includes(tool.name),
    ),
    false,
  )
  assert(request.tools.some((tool) => tool.name === "read"))
})

test("raw execution runs a real command and retains its raw call in the next request", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
  })
  const source =
    '// @exec: {"yield_time_ms": 10000, "max_output_tokens": 1000}\ntext(await tools.exec_command({cmd: "printf short-command", login: false}));'
  host.queueResponse(...call(source))
  host.queueResponse(completed)
  await host.session.prompt("Run the short command")
  assert.equal(host.requests.length, 2)
  const request = host.requests[1] as unknown as {
    input: Record<string, unknown>[]
  }
  const replay = request.input.find((item) => item["call_id"] === "call_one")
  assert.equal(replay?.["type"], "custom_tool_call")
  assert.equal(replay["namespace"], "functions")
  assert.equal(replay["input"], source)
  assert.equal("arguments" in replay, false)
  const result = request.input.find(
    (item) => item["type"] === "custom_tool_call_output",
  )
  assert(result)
  assert(Array.isArray(result["output"]))
  assert.equal(result["output"].length, 2)
  assert.deepEqual(result["output"][0], {
    type: "input_text",
    text: result["output"][0].text,
  })
  assert.match(
    result["output"][0].text,
    /^Script completed\nWall time \d+\.\d seconds\nOutput:\n$/,
  )
  assert.match(JSON.stringify(result["output"]), /short-command/)
  assert.match(JSON.stringify(result["output"]), /exit_code/)
})

test("a nonzero command bounds Unicode output and retains completion metadata", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
  })
  const command = `printf '${"🙂".repeat(40)}END\\n'; exit 7`
  host.queueResponse(
    ...call(
      `text(await tools.exec_command(${JSON.stringify({ cmd: command, login: false, max_output_tokens: 5 })}));`,
    ),
  )
  host.queueResponse(completed)
  await host.session.prompt("Run the bounded command")
  const text = output(host)
  const result = JSON.parse(text.slice(text.indexOf("{")))
  assert.equal(result.exit_code, 7)
  assert.equal(result.original_token_count, 41)
  assert.equal(
    result.output,
    "Warning: truncated output (original token count: 41)\nTotal output lines: 1\n\n🙂🙂…36 tokens truncated…🙂END\n",
  )
  assert.match(result.chunk_id, /^[a-f0-9]+$/)
  assert.equal(typeof result.wall_time_seconds, "number")
  assert.equal("session_id" in result, false)
})

test("nested commands keep native blocking, argument edits, result redaction, and events", async (t) => {
  const events: { type: string; name: string; parent: string | undefined }[] =
    []
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
    extension(pi) {
      pi.on("tool_call", (event) => {
        if (event.toolName !== "exec_command") return undefined
        if (event.input["cmd"] === "original")
          event.input["cmd"] = "printf discarded-secret"
        else return { block: true, reason: "Command denied by the test policy" }
        return undefined
      })
      pi.on("tool_result", (event) => {
        if (event.toolName === "exec_command" && !event.isError)
          return { content: [{ type: "text", text: "processed-command" }] }
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
  const blockedPath = join(host.directory, "blocked.txt")
  host.queueResponse(
    ...call(`text(await tools.exec_command({cmd: "original", login: false}));
try { await tools.exec_command({cmd: ${JSON.stringify(`touch '${blockedPath}'`)}, login: false}); }
catch (error) { text(String(error)); }`),
  )
  host.queueResponse(completed)
  await host.session.prompt("Apply native policy to the selected command")
  assert.match(output(host), /processed-command/)
  assert.match(output(host), /Command denied by the test policy/)
  assert.doesNotMatch(output(host), /discarded-secret/)
  await assert.rejects(readFile(blockedPath), { code: "ENOENT" })
  assert(
    events.some(
      (event) =>
        event.type === "tool_execution_start" &&
        event.name === "exec_command" &&
        event.parent?.startsWith("call_one"),
    ),
  )
  assert(
    events.some(
      (event) =>
        event.type === "tool_execution_end" &&
        event.name === "exec_command" &&
        event.parent?.startsWith("call_one"),
    ),
  )
})

test("raw result encoding preserves later context edits and removals", async (t) => {
  for (const mode of ["changed", "removed"] as const) {
    await t.test(mode, async (caseContext) => {
      const host = await openNativeHost(caseContext, {
        extensionPaths: [extension],
        providerApi,
        extension(pi) {
          pi.on("tool_result", (event) =>
            event.toolName === "exec"
              ? {
                  content: [
                    { type: "text", text: "retained-first" },
                    { type: "text", text: "retained-second" },
                  ],
                }
              : undefined,
          )
          pi.on("context", (event) => ({
            messages: event.messages.map((message) =>
              message.role === "toolResult" && message.toolName === "exec"
                ? {
                    ...message,
                    content:
                      mode === "changed"
                        ? [{ type: "text", text: "context-visible" }]
                        : [],
                  }
                : message,
            ),
          }))
        },
      })
      host.queueResponse(...call('text("discarded-secret");'))
      host.queueResponse(completed)
      await host.session.prompt("Keep only the processed result")
      assert.doesNotMatch(
        output(host),
        /discarded-secret|retained-first|retained-second/,
      )
      if (mode === "changed") assert.equal(output(host), "context-visible")
      const retained = host.session.messages.find(
        (message) =>
          message.role === "toolResult" && message.toolName === "exec",
      )
      assert.match(JSON.stringify(retained), /retained-first/)
    })
  }
})

test("explicit selections remain authoritative for direct and nested tools", async (t) => {
  for (const tools of [["exec"], ["exec", "exec_command"], ["bash"]]) {
    await t.test(tools.join(","), async (caseContext) => {
      const host = await openNativeHost(caseContext, {
        extensionPaths: [extension],
        providerApi,
        tools,
      })
      if (tools.includes("exec")) {
        host.queueResponse(
          ...call(
            tools.includes("exec_command")
              ? 'text((await tools.exec_command({cmd: "printf explicitly-selected", login: false})).output);'
              : 'text(ALL_TOOLS); try { await tools.exec_command({cmd: "true"}); } catch { text("unavailable"); }',
          ),
        )
      }
      host.queueResponse(completed)
      await host.session.prompt("Use only the explicitly selected tools")
      const request = host.requests[0] as unknown as {
        tools: { name: string }[]
      }
      assert.deepEqual(
        request.tools.map((tool) => tool.name),
        tools.includes("exec") ? ["functions"] : ["bash"],
      )
      if (tools.includes("exec"))
        assert.match(
          output(host),
          tools.includes("exec_command")
            ? /explicitly-selected$/
            : /\[\]\nunavailable$/,
        )
    })
  }
})

test("deselecting execution preserves raw history and unrelated calls", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
  })
  await writeFile(join(host.directory, "foreign.txt"), "native-content")
  host.queueResponse(
    ...functionCall("read", { path: "foreign.txt" }, "foreign"),
  )
  host.queueResponse(
    ...call(
      'text((await tools.exec_command({cmd: "printf retained-raw-input", login: false})).output);',
    ),
  )
  host.queueResponse(completed)
  await host.session.prompt("Retain a raw call and an unrelated native call")
  const request = host.requests.at(-1) as unknown as {
    input: Record<string, unknown>[]
  }
  const calls = request.input.filter((item) =>
    ["call_one", "call_foreign"].includes(String(item["call_id"])),
  )
  assert.equal(calls.length, 4)
  assert(calls.some((item) => item["type"] === "custom_tool_call"))
  assert(calls.some((item) => item["type"] === "custom_tool_call_output"))
  const retained = structuredClone(host.session.messages)
  for (const tools of [["read"], []]) {
    host.session.setActiveToolsByName(tools)
    host.queueResponse(completed)
    await host.session.prompt("Use only the remaining selection")
    const next = host.requests.at(-1) as unknown as {
      input: Record<string, unknown>[]
      tools?: { name: string }[]
    }
    assert.deepEqual(next.tools?.map((tool) => tool.name) ?? [], tools)
    assert.deepEqual(
      next.input.filter((item) =>
        ["call_one", "call_foreign"].includes(String(item["call_id"])),
      ),
      calls,
    )
    assert.deepEqual(host.session.messages.slice(0, retained.length), retained)
  }
})

test("excluded or extension-owned command tools cannot be bypassed through execution", async (t) => {
  for (const mode of ["excluded", "overridden"] as const) {
    await t.test(mode, async (caseContext) => {
      const host = await openNativeHost(caseContext, {
        extensionPaths: [extension],
        providerApi,
        ...(mode === "excluded" ? { excludeTools: ["bash"] } : {}),
        extension(pi) {
          if (mode === "overridden")
            pi.registerTool({
              ...createBashToolDefinition(process.cwd()),
              description: "Extension-owned command",
            })
          pi.registerTool({
            name: "companion",
            label: "Companion",
            description: "Preserved companion tool",
            parameters: Type.Object({}),
            async execute() {
              return {
                content: [{ type: "text", text: "companion" }],
                details: undefined,
              }
            },
          })
        },
      })
      host.queueResponse(
        ...call("text(ALL_TOOLS); text(typeof tools.exec_command);"),
      )
      host.queueResponse(completed)
      await host.session.prompt("Keep the selected tools")
      assert.match(output(host), /\[\]\nundefined/)
      const request = host.requests[0] as unknown as {
        tools: {
          name: string
          description?: string
          tools?: { description: string }[]
        }[]
      }
      assert(request.tools.some((tool) => tool.name === "companion"))
      assert.equal(
        request.tools.some((tool) => tool.name === "bash"),
        mode === "overridden",
      )
      const declared = request.tools.find((tool) => tool.name === "functions")!
        .tools![0]!.description
      assert.doesNotMatch(declared, /### `exec_command`/)
    })
  }
})

test("commands use effective settings, current session environment, and per-call overrides", async (t) => {
  const keys = [
    "CORE_INHERITED",
    "PI_SESSION_ID",
    "PI_SESSION_FILE",
    "PI_PROVIDER",
    "PI_MODEL",
    "PI_REASONING_LEVEL",
  ]
  const previous = keys.map((key) => process.env[key])
  keys.forEach((key) => {
    process.env[key] = "stale-value"
  })
  process.env["CORE_INHERITED"] = "inherited-value"
  t.after(() =>
    keys.forEach((key, index) => {
      if (previous[index] === undefined) delete process.env[key]
      else process.env[key] = previous[index]
    }),
  )
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
    settings: {
      shellPath: "/missing-initial-shell",
      shellCommandPrefix: "export CORE_PREFIX=initial",
    },
  })
  const shell = join(host.directory, "selected-shell")
  await writeFile(
    shell,
    '#!/bin/sh\nprintf "shell-option:%s\\n" "$1"\nexec /bin/sh "$@"\n',
    { mode: 0o755 },
  )
  const workdir = join(host.directory, "explicit-directory")
  await mkdir(workdir)
  host.session.settingsManager.setShellPath(shell)
  host.session.settingsManager.setShellCommandPrefix(
    "export CORE_PREFIX=current; export CORE_PREFIX_COUNT=$(( ${CORE_PREFIX_COUNT:-0} + 1 ))",
  )
  const command =
    'printf "%s\\n" "$PWD" "$CORE_INHERITED" "$CORE_PREFIX" "$CORE_PREFIX_COUNT" "$PI_SESSION_ID" "$PI_SESSION_FILE" "$PI_PROVIDER" "$PI_MODEL" "$PI_REASONING_LEVEL"; case ":$PATH:" in *":' +
    host.directory +
    '/bin:"*) printf managed-path;; esac'
  const calls = [
    { cmd: command, login: false },
    { cmd: "printf default-login" },
    {
      cmd: 'printf "%s\\n" "$PWD" "$CORE_PREFIX"',
      shell: "/bin/sh",
      workdir,
      login: false,
    },
  ]
  host.queueResponse(
    ...call(
      calls
        .map(
          (args) =>
            `text((await tools.exec_command(${JSON.stringify(args)})).output);`,
        )
        .join("\n"),
    ),
  )
  host.queueResponse(completed)
  await host.session.prompt("Use the effective command context")
  const text = output(host)
  assert(
    text.includes(
      `shell-option:-c\n${await realpath(host.directory)}\ninherited-value\ncurrent\n1\n${host.session.sessionManager.getSessionId()}\n\ncomposer-test\ndraft-test\n`,
    ),
    text,
  )
  assert.match(text, /managed-path/)
  assert(text.includes("shell-option:-lc\ndefault-login"))
  assert(text.includes(`${await realpath(workdir)}\ncurrent\n`))
  assert.doesNotMatch(text, /stale-value|initial/)
})

test("the execution pragma bounds the combined emitted text", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
  })
  host.queueResponse(
    ...call(
      '// @exec: {"max_output_tokens": 5}\ntext("0123456789".repeat(20)); text("END");',
    ),
  )
  host.queueResponse(completed)
  await host.session.prompt("Emit bounded text")
  assert(
    output(host).endsWith(
      "Warning: truncated output (original token count: 51)\nTotal output lines: 2\n\n0123456789…46 tokens truncated…456789\nEND",
    ),
  )
})

test("a script reaching its yield deadline reports the unsupported continuation", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
  })
  host.queueResponse(
    ...call(
      '// @exec: {"yield_time_ms": 250}\ntext("partial"); const until = Date.now() + 1000; while (Date.now() < until) {} text("too-late");',
    ),
  )
  host.queueResponse(completed)
  await host.session.prompt("Observe the completion-only limit")
  assert.match(output(host), /partial/)
  assert.match(
    output(host),
    /yield deadline.*retained execution is unavailable/,
  )
  assert.doesNotMatch(output(host), /too-late/)
})

test("fresh modules expose only the selected helpers and exit immediately", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
  })
  host.queueResponse(
    ...call(
      'export const answer = 7; globalThis.previousValue = answer; text([typeof process, typeof console, typeof require, typeof fetch, tools.exec_command.constructor("return typeof process")()]); text(undefined); text(null);',
      "first",
    ),
  )
  host.queueResponse(completed)
  await host.session.prompt("Run the first module")
  assert.match(
    output(host, "first"),
    /\["undefined","undefined","undefined","undefined","undefined"\]\nundefined\nnull/,
  )
  host.queueResponse(
    ...call(
      'text(typeof globalThis.previousValue); text("before-exit"); exit(); text("after-exit");',
      "second",
    ),
  )
  host.queueResponse(completed)
  await host.session.prompt("Run a fresh module")
  assert.match(output(host, "second"), /undefined\nbefore-exit$/)
  assert.doesNotMatch(output(host, "second"), /after-exit/)
  host.queueResponse(...call("return;", "third"))
  host.queueResponse(completed)
  await host.session.prompt("Reject invalid module syntax")
  assert.match(
    output(host, "third"),
    /Script error:\nSyntaxError: Illegal return statement/,
  )
})

test("launch and authority failures remain processed string rejections", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
  })
  host.queueResponse(
    ...call(`for (const args of [{cmd: "true", shell: "/missing-shell"}, {cmd: "true", sandbox_permissions: "require_escalated", justification: "Run the command", prefix_rule: ["true"]}]) {
    try { await tools.exec_command(args); text("unexpected-success"); }
    catch (error) { text({type: typeof error, error}); }
  }`),
  )
  host.queueResponse(completed)
  await host.session.prompt("Report command failures")
  assert.match(output(host), /"type":"string","error":"[^\n]*ENOENT/)
  assert.match(
    output(host),
    /"type":"string","error":"Elevated execution is not available from this host"/,
  )
  assert.doesNotMatch(output(host), /unexpected-success/)
})

test("the worker runs when the extension is installed under node_modules", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "core-tools-install-"))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const installed = join(directory, "node_modules", "pi-codex-tools")
  await mkdir(installed, { recursive: true })
  await cp(new URL("../src", import.meta.url), join(installed, "src"), {
    recursive: true,
  })
  await cp(
    new URL("../package.json", import.meta.url),
    join(installed, "package.json"),
  )
  await symlink(
    new URL("../node_modules", import.meta.url).pathname,
    join(installed, "node_modules"),
    "dir",
  )
  const host = await openNativeHost(t, {
    extensionPaths: [join(installed, "src", "index.ts")],
    providerApi,
  })
  host.queueResponse(
    ...call(
      'text((await tools.exec_command({cmd: "printf installed", login: false})).output);',
    ),
  )
  host.queueResponse(completed)
  await host.session.prompt("Run the installed extension")
  assert.match(output(host), /installed$/)
})

test("reload installs the surface into an existing conversation without rewriting its old call", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "core-tools-reload-"))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const entry = join(directory, "extension.ts")
  await writeFile(entry, "export default function() {}\n")
  const host = await openNativeHost(t, { extensionPaths: [entry], providerApi })
  host.queueResponse(
    ...functionCall("bash", { command: "printf before-loading" }),
  )
  host.queueResponse(completed)
  await host.session.prompt("Run the existing command")
  const oldMessages = structuredClone(host.session.messages)
  const previousRequest = host.requests.at(-1) as unknown as {
    input: Record<string, unknown>[]
  }
  const oldCall = previousRequest.input.find(
    (item) => item["type"] === "function_call" && item["name"] === "bash",
  )
  assert(oldCall)
  await writeFile(
    entry,
    `export { default } from ${JSON.stringify(extension)};\n`,
  )
  await host.reload()
  host.queueResponse(
    ...call(
      'text((await tools.exec_command({cmd: "printf after-loading", login: false})).output);',
    ),
  )
  host.queueResponse(completed)
  await host.session.prompt("Use the loaded core toolset")
  assert.match(output(host), /after-loading$/)
  assert.deepEqual(
    host.session.messages.slice(0, oldMessages.length),
    oldMessages,
  )
  const request = host.requests.at(-1) as unknown as {
    input: Record<string, unknown>[]
  }
  assert.deepEqual(
    request.input.find(
      (item) => item["type"] === "function_call" && item["name"] === "bash",
    ),
    oldCall,
  )
})

test("cancellation closes the owned command and the next prompt can execute", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
  })
  const pidFile = join(host.directory, "owned.pid")
  host.queueResponse(
    ...call(
      `text(await tools.exec_command({cmd: ${JSON.stringify(`printf 'partial-command\\n'; echo $$ > '${pidFile}'; sleep 30`)}, login: false}));`,
    ),
  )
  const running = host.session.prompt("Start an owned command")
  let pid = 0
  await t.waitFor(async () => {
    pid = Number(await readFile(pidFile, "utf8"))
    assert(pid > 0)
  })
  await host.session.abort()
  await running
  assert.throws(() => process.kill(pid, 0), { code: "ESRCH" })
  const parent = host.session.messages.find(
    (message) => message.role === "toolResult" && message.toolName === "exec",
  )
  assert(parent?.role === "toolResult")
  assert.equal(parent.nestedCalls?.complete, true)
  assert.equal(parent.nestedCalls.calls.length, 1)
  assert.notEqual(parent.nestedCalls.calls[0]!.status, "unfinished")
  assert.match(JSON.stringify(parent.content), /partial-command/)
  host.queueResponse(...call('text("next-prompt");', "next"))
  host.queueResponse(completed)
  await host.session.prompt("Continue after cancellation")
  assert.match(output(host, "next"), /next-prompt$/)
})
