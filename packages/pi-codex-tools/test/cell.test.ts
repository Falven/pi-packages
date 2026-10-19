/* eslint-disable no-await-in-loop -- Each model request must finish before the next request in the same host. */
import assert from "node:assert/strict";
import { mkdir, open, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Worker } from "node:worker_threads";
import test from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { openNativeHost } from "../../../fixtures/native-host.ts";
import {
  call,
  completed,
  extension,
  functionCall,
  output,
  providerApi,
} from "./fixtures/model-loop.ts";

type Host = Awaited<ReturnType<typeof openNativeHost>>;

async function execute(host: Host, source: string, id: string) {
  host.queueResponse(...call(source, id));
  host.queueResponse(completed);
  await host.session.prompt(`Execute ${id}`);
  return output(host, id);
}

async function collect(host: Host, cell: string, id: string, options = {}) {
  host.queueResponse(...functionCall("wait", { cell_id: cell, ...options }, id, "functions"));
  host.queueResponse(completed);
  await host.session.prompt(`Collect ${id}`);
  return output(host, id);
}

function cellId(result: string) {
  const id = result.match(/Script running with cell ID (\S+)/)?.[1];
  assert(id, result);
  return id;
}

test("frame-only execution and waiting retain native string results", async (t) => {
  const gate = Promise.withResolvers<void>();
  t.after(() => gate.resolve());
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
    extension(pi) {
      pi.on("tool_call", async (event) => {
        if (event.toolName === "exec_command") await gate.promise;
      });
    },
  });
  host.queueResponse(
    ...call(
      'await yield_control(); await tools.exec_command({cmd: "true", login: false});',
      "empty-yield",
      null,
    ),
  );
  host.queueResponse(completed);
  await host.session.prompt("Yield before emitting output");
  const cell = cellId(output(host, "empty-yield"));
  host.queueResponse(...functionCall("wait", { cell_id: cell, yield_time_ms: 0 }, "empty-wait"));
  host.queueResponse(completed);
  await host.session.prompt("Collect while no output is ready");
  assert.match(output(host, "empty-wait"), /Script running with cell ID/);
  gate.resolve();
  assert.match(await collect(host, cell, "empty-final"), /Script completed/);
  assert.match(await execute(host, "void 0;", "empty-exec"), /Script completed/);
  const request = host.requests.at(-1) as unknown as {
    input: Record<string, unknown>[];
  };
  for (const id of ["empty-yield", "empty-wait", "empty-final", "empty-exec"]) {
    const result = request.input.find(
      (item) =>
        item["call_id"] === `call_${id}` &&
        ["custom_tool_call_output", "function_call_output"].includes(String(item["type"])),
    );
    assert(result);
    assert.equal(typeof result["output"], "string", id);
  }
});

test("raw execution yields once and structured wait collects late processed output", async (t) => {
  const calls: string[] = [];
  const gate = Promise.withResolvers<void>();
  t.after(() => gate.resolve());
  let workers = 0;
  const started = () => workers++;
  process.on("worker", started);
  t.after(() => process.off("worker", started));
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
    extension(pi) {
      pi.on("tool_call", async (event) => {
        if (event.toolName !== "exec_command") return;
        calls.push(String(event.input["cmd"]));
        if (event.input["cmd"] === "late-command") {
          await gate.promise;
          event.input["cmd"] = "printf removed-secret";
        }
      });
      pi.on("tool_result", (event) => {
        if (event.toolName === "exec_command")
          return { content: [{ type: "text", text: "processed-late-command" }] };
        return undefined;
      });
    },
  });
  host.queueResponse(
    ...call(
      `text("BEFORE_YIELD"); await yield_control();
text(await tools.exec_command({cmd: "late-command", login: false}));
text("FINAL_OUTPUT");`,
    ),
  );
  host.queueResponse(completed);
  await host.session.prompt("Start a continuing script");
  const initial = output(host);
  const cell = initial.match(/Script running with cell ID (\S+)/)?.[1];
  assert(cell, initial);
  assert.match(initial, /BEFORE_YIELD/);
  assert.doesNotMatch(initial, /FINAL_OUTPUT/);
  assert.equal(workers, 1);
  gate.resolve();
  host.queueResponse(...functionCall("wait", { cell_id: cell }, "collected", "functions"));
  host.queueResponse(completed);
  await host.session.prompt("Collect the continuing script");
  assert.match(output(host, "collected"), /Script completed/);
  assert.match(output(host, "collected"), /processed-late-command\nFINAL_OUTPUT/);
  assert.doesNotMatch(output(host, "collected"), /BEFORE_YIELD|removed-secret/);
  assert.deepEqual(calls, ["late-command"]);
  assert.equal(workers, 1);
  const contract = JSON.parse(
    await readFile(new URL("../src/contract.json", import.meta.url), "utf8"),
  );
  const request = host.requests.at(-1) as unknown as {
    tools: { name: string; tools?: unknown[] }[];
    input: Record<string, unknown>[];
  };
  const namespace = request.tools.find((tool) => tool.name === "functions");
  assert.deepEqual(namespace?.tools?.[1], contract.namespace.tools[1]);
  const waiting = request.input.find((item) => item["call_id"] === "call_collected");
  assert.equal(waiting?.["type"], "function_call");
  assert.equal(waiting["namespace"], "functions");
  assert.deepEqual(JSON.parse(String(waiting["arguments"])), { cell_id: cell });
  const result = request.input.find(
    (item) => item["call_id"] === "call_collected" && item["type"] === "function_call_output",
  );
  assert(result && Array.isArray(result["output"]));
  assert.deepEqual(
    result["output"].map((part) => part.type),
    ["input_text", "input_text", "input_text"],
  );
  assert.equal(result["output"][2].text, "FINAL_OUTPUT");
});

test("overlapping cells commit only changed keys and load independent copies", async (t) => {
  const gate = Promise.withResolvers<void>();
  t.after(() => gate.resolve());
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
    extension(pi) {
      pi.on("tool_call", async (event) => {
        if (event.toolName === "exec_command" && event.input["cmd"] === "true") await gate.promise;
      });
    },
  });
  await execute(host, 'store("object", {items:[1]}); store("shared", "original");', "seed");
  const first = cellId(
    await execute(
      host,
      `store("shared", "first"); store("pending", 7);
await yield_control(); await tools.exec_command({cmd:"true", login:false});
text(load("second"));`,
      "first",
    ),
  );
  const second = await execute(
    host,
    `text([load("pending"),load("shared")]);
const copy = load("object"); copy.items.push(2); text(load("object"));
store("second", "retained"); store("shared", "second");`,
    "second",
  );
  assert.match(second, /\[null,"original"\]\n\{"items":\[1\]\}/);
  gate.resolve();
  assert.match(await collect(host, first, "finish"), /undefined$/);
  const merged = await execute(
    host,
    'text([load("second"),load("shared"),load("pending"),load("object")]);',
    "merged",
  );
  assert.match(merged, /\["retained","first",7,\{"items":\[1\]\}\]$/);
  assert.match(await collect(host, first, "stale"), /not found/);
});

test("cancelling a queued wait returns promptly without consuming another collector's output", async (t) => {
  let api: ExtensionAPI | undefined;
  let cell = "";
  let started = 0;
  const bothStarted = Promise.withResolvers<void>();
  const managerSettled = Promise.withResolvers<void>();
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
    extension(pi) {
      api = pi;
      pi.on("tool_execution_start", (event) => {
        if (event.toolName === "wait_probe" && ++started === 2) bothStarted.resolve();
      });
      pi.registerTool({
        name: "collect_pair",
        label: "Collect pair",
        description: "Exercise independent public callers",
        parameters: Type.Object({}),
        async execute(_id, _args, _signal, _update, ctx) {
          const first = new AbortController();
          const second = new AbortController();
          const active = ctx.executeTool(
            "wait_probe",
            { cell_id: cell, yield_time_ms: 10000 },
            { signal: first.signal },
          );
          const queued = ctx.executeTool(
            "wait_probe",
            { cell_id: cell, yield_time_ms: 10000 },
            { signal: second.signal },
          );
          await bothStarted.promise;
          await new Promise<void>((resolve) => setImmediate(resolve));
          second.abort();
          let prompt = false;
          let timer: NodeJS.Timeout | undefined;
          try {
            prompt = await Promise.race([
              managerSettled.promise.then(() => true),
              new Promise<false>((resolve) => {
                timer = setTimeout(() => resolve(false), 1000);
              }),
            ]);
          } finally {
            clearTimeout(timer);
            first.abort();
          }
          const outcomes = await Promise.all([active, queued]);
          const drained = await Promise.all([
            ctx.executeTool("wait_probe", { cell_id: cell, yield_time_ms: 0 }),
            ctx.executeTool("wait_probe", { cell_id: cell, yield_time_ms: 0 }),
          ]);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  prompt,
                  outcomes: outcomes.map((entry) => entry.result.content),
                  drained: drained.map((entry) => entry.result.content),
                }),
              },
            ],
            details: undefined,
          };
        },
      });
    },
  });
  cell = cellId(
    await execute(
      host,
      'await yield_control(); text("UNREAD"); await new Promise(() => {});',
      "start",
    ),
  );
  const definition = host.session.getToolDefinition("wait");
  assert(definition);
  api!.registerTool({
    ...definition,
    name: "wait_probe",
    exposure: "codemode",
    executionMode: "parallel",
    async execute(...args) {
      const result = await definition.execute(...args);
      managerSettled.resolve();
      return result;
    },
  });
  host.queueResponse(...functionCall("collect_pair", {}, "pair"));
  host.queueResponse(completed);
  await host.session.prompt("Cancel only the queued collector");
  const result = JSON.parse(output(host, "pair")) as {
    prompt: boolean;
    outcomes: unknown[];
    drained: unknown[][];
  };
  assert.equal(result.prompt, true);
  assert.doesNotMatch(JSON.stringify(result.outcomes), /UNREAD/);
  assert.match(JSON.stringify(result.drained[0]), /UNREAD/);
  assert.doesNotMatch(JSON.stringify(result.drained[1]), /UNREAD/);
  assert(result.drained.every((content) => /Script running/.test(JSON.stringify(content))));
  const final = await collect(host, cell, "finish", { terminate: true });
  assert.match(final, /Script terminated/);
  assert.doesNotMatch(final, /UNREAD/);
});

test("early exit and ordinary exceptions commit writes while timers alone do not retain a worker", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
  });
  assert.match(
    await execute(
      host,
      'store("exit", 1); setTimeout(() => store("discarded", true), 0); exit();',
      "exit",
    ),
    /Script completed/,
  );
  assert.match(
    await execute(
      host,
      '// @exec: {}\nstore("exception", 2); const error = new Error("ordinary-failure"); void error.stack; throw error;',
      "exception",
    ),
    /^Script failed\nWall time \d+\.\d seconds\nOutput:\n\nScript error:\nError: ordinary-failure\n    at exec_main\.mjs:1:38$/,
  );
  assert.match(
    await execute(
      host,
      'store("timer", 3); setTimeout(() => { throw new Error("timer-failure") }, 0); await new Promise(() => {});',
      "timer",
    ),
    /Script error:\nError: timer-failure\n    at exec_main\.mjs:1:45$/,
  );
  const cleared = await execute(
    host,
    `clearTimeout(setTimeout(() => { throw new Error("cleared-failure") }, 0));
await new Promise(resolve => setTimeout(resolve, 0));
text([load("exit"), load("exception"), load("timer"), load("discarded")]);`,
    "read",
  );
  assert.match(cleared, /\[1,2,3,null\]$/);
  assert.doesNotMatch(cleared, /cleared-failure/);
  const invalid = await execute(
    host,
    `const cycle = {}; cycle.self = cycle;
for (const value of [undefined, () => {}, 1n, cycle, "x".repeat(262144)]) {
  try { store("invalid", value); } catch (error) { text({type:typeof error,error:String(error)}); }
}
text(load("invalid"));`,
    "invalid",
  );
  assert.match(
    invalid,
    /"type":"string","error":"Unable to store \\"invalid\\"\. Only plain serializable objects can be stored\."/,
  );
  assert.match(
    invalid,
    /"type":"string","error":"TypeError: Do not know how to serialize a BigInt\\n    at exec_main\.mjs:3:9"/,
  );
  assert.match(invalid, /circular/i);
  assert.doesNotMatch(invalid, /node:internal|worker\.mjs|evalmachine|JSON\.stringify/);
  assert.match(invalid, /Stored value exceeds 256 KiB/);
  assert.match(invalid, /undefined$/);
});

test("a large accepted text item crosses a collection cutoff without lost or repeated UTF-8", async (t) => {
  const start = Promise.withResolvers<void>();
  const finish = Promise.withResolvers<void>();
  const spilling = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  t.after(() => {
    start.resolve();
    finish.resolve();
    release.resolve();
  });
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
    extension(pi) {
      pi.on("tool_call", async (event) => {
        if (event.toolName === "exec_command") {
          if (event.input["cmd"] === "start-output") await start.promise;
          if (event.input["cmd"] === "finish-output") await finish.promise;
          event.input["cmd"] = "true";
        }
        if (event.toolName === "wait") setImmediate(() => release.resolve());
      });
    },
  });
  const previous = process.env["TMPDIR"];
  const spills = join(host.directory, "temporary");
  await mkdir(spills);
  process.env["TMPDIR"] = spills;
  t.after(() => {
    if (previous === undefined) delete process.env["TMPDIR"];
    else process.env["TMPDIR"] = previous;
  });
  const file = await open(join(host.directory, "boundary"), "w");
  const prototype = Object.getPrototypeOf(file) as typeof file;
  const writev = prototype.writev;
  await file.close();
  let held = false;
  t.mock.method(
    prototype,
    "writev",
    async function (this: typeof file, ...args: Parameters<typeof writev>) {
      if (!held) {
        held = true;
        spilling.resolve();
        await release.promise;
      }
      return writev.apply(this, args);
    },
  );
  const id = cellId(
    await execute(
      host,
      `await yield_control();
await tools.exec_command({cmd:"start-output",login:false});
text("🙂".repeat(600000) + "TAIL");
for (let index = 0; index < 2048; index++) text("ITEM-" + index);
await tools.exec_command({cmd:"finish-output",login:false});`,
      "start",
    ),
  );
  start.resolve();
  await spilling.promise;
  const first = await collect(host, id, "partial", {
    yield_time_ms: 0,
    max_tokens: 1000000,
  });
  assert.match(first, /Script running/);
  const firstText = first.slice(first.indexOf("Output:\n") + 9);
  assert(firstText.length > 0 && firstText.length < 1200004);
  finish.resolve();
  const last = await collect(host, id, "finish", { max_tokens: 1000000 });
  assert.match(last, /Script completed/);
  const lastText = last.slice(last.indexOf("Output:\n") + 9);
  const expected = [
    "🙂".repeat(600000) + "TAIL",
    ...Array.from({ length: 2048 }, (_, index) => `ITEM-${index}`),
  ];
  assert.equal(firstText + lastText, expected.join("\n"));
  assert.deepEqual(await readdir(spills), []);
});

test("wait validates its budget before looking up a stale string cell identifier", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
  });
  assert.match(
    await collect(host, "stale", "negative", { max_tokens: -1 }),
    /failed to parse function arguments: invalid value: integer `-1`, expected usize/,
  );
  assert.match(
    await collect(host, "stale", "fraction", { yield_time_ms: 0.5 }),
    /failed to parse function arguments: invalid type: floating point `0.5`, expected u64/,
  );
  assert.match(
    await collect(host, "stale", "unknown", { ignored: true }),
    /exec cell stale not found/,
  );
  host.queueResponse(...functionCall("wait", { cell_id: 1 }, "numeric", "functions"));
  host.queueResponse(completed);
  await host.session.prompt("Keep process and cell identifiers distinct");
  assert.match(
    output(host, "numeric"),
    /failed to parse function arguments: invalid type: integer `1`, expected a string/,
  );
});

test("cancelling a later wait preserves work and cell termination lets its command finish without committing writes", async (t) => {
  const waiting = Promise.withResolvers<void>();
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
    extension(pi) {
      pi.on("tool_execution_start", (event) => {
        if (event.toolName === "wait") waiting.resolve();
      });
    },
  });
  const pidFile = join(host.directory, "owned.pids");
  const releaseFile = join(host.directory, "release-command");
  const marker = join(host.directory, "survived");
  const cell = cellId(
    await execute(
      host,
      `store("pending", "discarded"); await yield_control(); text("UNREAD");
text(await tools.exec_command(${JSON.stringify({ cmd: `while [ ! -e '${releaseFile}' ]; do sleep 0.01; done & child=$!; printf 'COMMAND-PARTIAL'; printf '%s %s' $$ "$child" > '${pidFile}'; wait; printf SURVIVED > '${marker}'; printf COMMAND-COMPLETE`, shell: "/bin/sh", login: false, yield_time_ms: 30000 })}));
text("DISCARDED-CONTINUATION"); store("pending", "late");`,
      "start",
    ),
  );
  const pids = await t.waitFor(async () => {
    const result = (await readFile(pidFile, "utf8")).split(" ").map(Number);
    assert.equal(result.length, 2);
    assert(result.every((pid) => Number.isInteger(pid) && pid > 0));
    return result;
  });
  host.queueResponse(...functionCall("wait", { cell_id: cell }, "cancelled", "functions"));
  const pending = host.session.prompt("Wait without cancelling the cell");
  await waiting.promise;
  await host.session.abort();
  await pending;
  for (const pid of pids) process.kill(pid, 0);
  const stopped = await collect(host, cell, "terminated", { terminate: true });
  assert.match(stopped, /Script terminated/);
  assert.match(stopped, /UNREAD/);
  assert.doesNotMatch(stopped, /COMMAND-PARTIAL|COMMAND-COMPLETE|DISCARDED-CONTINUATION/);
  for (const pid of pids) process.kill(pid, 0);
  await writeFile(releaseFile, "finish");
  await t.waitFor(async () => assert.equal(await readFile(marker, "utf8"), "SURVIVED"));
  await t.waitFor(() => {
    for (const pid of pids) assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
  });
  assert.match(
    await execute(
      host,
      'text(load("pending")); text(await tools.exec_command({cmd:"printf FRESH",login:false}));',
      "fresh",
    ),
    /undefined\n.*FRESH/,
  );
  assert.match(await collect(host, cell, "stale"), /not found/);
});

test("terminating a CPU-bound cell preserves a command handle already returned to the session", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
  });
  const initial = await execute(
    host,
    `const command = await tools.exec_command(${JSON.stringify({ cmd: "IFS= read -r line; printf 'READ:%s' \"$line\"", shell: "/bin/sh", login: false, tty: true, yield_time_ms: 250 })});
text(command.session_id); store("cpu", "discarded"); await yield_control(); while (true) {}`,
    "cpu",
  );
  const cell = cellId(initial);
  const processId = Number(initial.slice(initial.lastIndexOf("\n") + 1));
  assert(Number.isInteger(processId) && processId > 0);
  assert.match(await collect(host, cell, "terminate", { terminate: true }), /Script terminated/);
  const delivered = await execute(
    host,
    `text(load("cpu")); text(await tools.write_stdin({session_id:${processId},chars:"ok\\n"}));`,
    "process",
  );
  assert.match(delivered, /undefined\n.*READ:ok/);
  assert.match(delivered, /"exit_code":0/);
});

test("ordinary completion discards JavaScript callbacks but records a dispatched command finishing later", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
  });
  const gate = join(host.directory, "finish");
  const done = join(host.directory, "done");
  const initial = await execute(
    host,
    `tools.exec_command(${JSON.stringify({ cmd: `while [ ! -e '${gate}' ]; do sleep 0.01; done; printf 'DONE' > '${done}'; printf discarded-backend-output`, shell: "/bin/sh", login: false })}).then(() => text("DISCARDED-CALLBACK")); text("RETURNED");`,
    "unawaited",
  );
  assert.match(initial, /Script completed/);
  assert.match(initial, /RETURNED$/);
  await writeFile(gate, "finish");
  await t.waitFor(async () => assert.equal(await readFile(done, "utf8"), "DONE"));
  await t.waitFor(() => {
    const entries = host.session.sessionManager
      .getBranch()
      .filter((entry) => entry.type === "custom" && entry.customType === "core-tools.activity");
    assert(
      entries.some(
        (entry) =>
          entry.type === "custom" &&
          (entry.data as { events: { type: string; child_id?: string }[] }).events.some(
            (event) => event.type === "completed" && event.child_id,
          ),
      ),
    );
    assert.doesNotMatch(JSON.stringify(entries), /DISCARDED-CALLBACK/);
  });
  host.queueResponse(completed);
  await host.session.prompt("Keep the completed call and compact activity");
  assert.doesNotMatch(output(host, "unawaited"), /DISCARDED-CALLBACK|discarded-backend-output/);
  assert.doesNotMatch(JSON.stringify(host.requests.at(-1)), /core-tools.activity/);
});

test("ordinary text and notifications do not wake a wait and explicit yielding does", async (t) => {
  const start = Promise.withResolvers<void>();
  const finish = Promise.withResolvers<void>();
  const ready = Promise.withResolvers<void>();
  const waiting = Promise.withResolvers<void>();
  t.after(() => {
    start.resolve();
    finish.resolve();
  });
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
    extension(pi) {
      pi.on("tool_call", async (event) => {
        if (event.toolName === "exec_command") {
          if (event.input["cmd"] === "phase-one") await start.promise;
          else if (event.input["cmd"] === "phase-two") {
            ready.resolve();
            await finish.promise;
          }
          event.input["cmd"] = "true";
        }
      });
      pi.on("tool_execution_start", (event) => {
        if (event.toolName === "wait") waiting.resolve();
      });
    },
  });
  const id = cellId(
    await execute(
      host,
      `await yield_control(); await tools.exec_command({cmd:"phase-one",login:false});
text("ORDINARY"); notify("NOTICE"); await tools.exec_command({cmd:"phase-two",login:false});
await yield_control(); await new Promise(() => {});`,
      "start",
    ),
  );
  const before = host.requests.length;
  let returned = false;
  const collecting = collect(host, id, "waited").then((value) => {
    returned = true;
    return value;
  });
  await waiting.promise;
  start.resolve();
  await ready.promise;
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(returned, false);
  assert.equal(
    host.session.messages.some(
      (message) => message.role === "custom" && message.content === "NOTICE",
    ),
    false,
  );
  finish.resolve();
  const collected = await collecting;
  assert.match(collected, /Script running/);
  assert.match(collected, /ORDINARY$/);
  assert.doesNotMatch(collected, /NOTICE/);
  assert.equal(host.requests.length, before + 2);
  assert(
    host.session.messages.some(
      (message) => message.role === "custom" && message.content === "NOTICE",
    ),
  );
  assert.match(await collect(host, id, "terminate", { terminate: true }), /Script terminated/);
});

test("resource overflow retains accepted output, releases workers, and leaves fresh execution usable", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
  });
  const message = await execute(
    host,
    'text("ACCEPTED"); text("x".repeat(8 * 1024 * 1024));',
    "message-limit",
  );
  assert.match(message, /ACCEPTED/);
  assert.match(message, /Worker message exceeds 8 MiB/);
  const parts = await execute(
    host,
    '// @exec: {"max_output_tokens":1}\nfor (let i=0;i<4097;i++) text("");',
    "item-limit",
  );
  assert.match(parts, /too many unread output items \(4096\)/);
  const unread = await execute(
    host,
    '// @exec: {"max_output_tokens":4}\ntext("ACCEPTED"); for (let i=0;i<17;i++) text("x".repeat(4 * 1024 * 1024));',
    "unread-limit",
  );
  assert.match(unread, /Unread output exceeds 67108864 bytes/);
  assert.match(unread, /ACCEPTED/);
  assert.match(unread, /tokens truncated/);
  const values = await execute(host, "for (let i=0;i<129;i++) store(String(i), i);", "key-limit");
  assert.match(values, /Stored values exceed the session limit/);
  const timers = await execute(
    host,
    "for (let i=0;i<257;i++) setTimeout(() => {}, 30000);",
    "timer-limit",
  );
  assert.match(timers, /Execution has too many timers/);
  assert.match(await execute(host, 'text("FRESH");', "fresh"), /FRESH$/);
});

test("asynchronous cell spill failure preserves the accepted prefix and discards pending stores", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
  });
  const previous = process.env["TMPDIR"];
  process.env["TMPDIR"] = join(host.directory, "missing");
  t.after(() => {
    if (previous === undefined) delete process.env["TMPDIR"];
    else process.env["TMPDIR"] = previous;
  });
  const failed = await execute(
    host,
    '// @exec: {"max_output_tokens":4}\nstore("failed", true); text("ACCEPTED" + "x".repeat(2 * 1024 * 1024));',
    "spill-failure",
  );
  assert.match(failed, /ENOENT/);
  assert.match(failed, /ACCEPTED/);
  assert.match(failed, /tokens truncated/);
  assert.match(await execute(host, 'text(load("failed"));', "store"), /undefined$/);
});

test("worker and retained-cell limits reject new work without losing existing handles", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
  });
  const live: string[] = [];
  for (let index = 0; index < 8; index++)
    live.push(
      cellId(
        await execute(host, "await yield_control(); await new Promise(() => {});", `live-${index}`),
      ),
    );
  assert.match(
    await execute(host, 'text("excess");', "worker-limit"),
    /too many live workers \(8\)/,
  );
  for (const [index, id] of live.entries())
    assert.match(
      await collect(host, id, `stop-${index}`, { terminate: true }),
      /Script terminated/,
    );
  const retained: string[] = [];
  for (let index = 0; index < 32; index++)
    retained.push(
      cellId(
        await execute(host, `await yield_control(); text("KEPT-${index}");`, `retained-${index}`),
      ),
    );
  assert.equal(new Set([...live, ...retained]).size, 40);
  assert.match(
    await execute(host, 'text("excess");', "cell-limit"),
    /too many retained cells \(32\)/,
  );
  assert.match(await collect(host, retained[0]!, "free-one"), /KEPT-0$/);
  assert.match(await execute(host, 'text("FRESH");', "fresh"), /FRESH$/);
});

test("later dispatch rechecks selection despite the cell's original metadata snapshot", async (t) => {
  const gate = Promise.withResolvers<void>();
  t.after(() => gate.resolve());
  let first = true;
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
    extension(pi) {
      pi.on("tool_result", async (event) => {
        if (event.toolName === "exec_command" && first) {
          first = false;
          await gate.promise;
        }
      });
    },
  });
  const id = cellId(
    await execute(
      host,
      `text(ALL_TOOLS.map(tool=>tool.name)); await yield_control();
await tools.exec_command({cmd:"true",login:false});
try { await tools.exec_command({cmd:"printf forbidden",login:false}) } catch (error) { text(error) }`,
      "start",
    ),
  );
  await t.waitFor(() => assert.equal(first, false));
  host.session.setActiveToolsByName(["exec", "wait"]);
  gate.resolve();
  const result = await collect(host, id, "selected");
  assert.match(result, /Tool exec_command is not available/);
  assert.doesNotMatch(result, /"output":"forbidden"/);
  assert.match(
    await execute(host, "text(ALL_TOOLS); text(typeof tools.exec_command);", "fresh"),
    /\[\]\nundefined$/,
  );
});

test("termination returns promptly and shutdown reports bounded cleanup when a public result hook has not returned", async (t) => {
  let blocked = Promise.withResolvers<void>();
  let release = Promise.withResolvers<void>();
  t.after(() => release.resolve());
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
    extension(pi) {
      pi.on("tool_result", async (event) => {
        if (event.toolName === "exec_command") {
          blocked.resolve();
          await release.promise;
        }
      });
    },
  });
  const id = cellId(
    await execute(
      host,
      'text("ACCEPTED"); await yield_control(); await tools.exec_command({cmd:"true",login:false}); text("DISCARDED-CONTINUATION");',
      "held",
    ),
  );
  await blocked.promise;
  const started = performance.now();
  const result = await collect(host, id, "terminate-held", { terminate: true });
  assert.match(result, /^Script terminated\nWall time \d+\.\d seconds\nOutput:\n$/);
  assert(performance.now() - started < 1500);
  release.resolve();
  await t.waitFor(() => {
    const entries = host.session.sessionManager
      .getBranch()
      .filter((entry) => entry.type === "custom" && entry.customType === "core-tools.activity");
    assert(
      entries.some(
        (entry) =>
          entry.type === "custom" &&
          (entry.data as { events: { type: string; child_id?: string }[] }).events.some(
            (event) => event.type === "completed" && event.child_id,
          ),
      ),
    );
  });
  assert.match(await collect(host, id, "stale-held"), /not found/);
  assert.match(await execute(host, 'text("FRESH");', "after-held"), /FRESH$/);
  assert.doesNotMatch(output(host, "terminate-held"), /DISCARDED-CONTINUATION/);
  blocked = Promise.withResolvers<void>();
  release = Promise.withResolvers<void>();
  const shutdownCell = cellId(
    await execute(
      host,
      'await yield_control(); await tools.exec_command({cmd:"true",login:false});',
      "held-shutdown",
    ),
  );
  await blocked.promise;
  assert.match(
    await collect(host, shutdownCell, "terminate-before-shutdown", { terminate: true }),
    /^Script terminated\nWall time \d+\.\d seconds\nOutput:\n$/,
  );
  const errors: string[] = [];
  await host.session.bindExtensions({
    onError(error) {
      errors.push(error.error);
    },
  });
  await host.close();
  release.resolve();
  assert.deepEqual(errors, [
    "Session cleanup failed: Execution cleanup did not finish within 2000 ms",
  ]);
});

test("reload closes live cells and values while keeping files and compact interrupted activity", async (t) => {
  let api: ExtensionAPI | undefined;
  const workers = new Set<Worker>();
  const started = (worker: Worker) => {
    workers.add(worker);
    worker.once("exit", () => workers.delete(worker));
  };
  process.on("worker", started);
  t.after(() => process.off("worker", started));
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
    extension(pi) {
      api = pi;
    },
  });
  await execute(
    host,
    'store("reload", 1); await tools.apply_patch("*** Begin Patch\\n*** Add File: kept.txt\\n+KEPT\\n*** End Patch");',
    "seed",
  );
  const id = cellId(
    await execute(
      host,
      'await Promise.all(Array.from({length:10},()=>tools.exec_command({cmd:"true",login:false}))); await yield_control(); await new Promise(() => {});',
      "live",
    ),
  );
  await t.waitFor(() => assert.equal(workers.size, 1));
  const entries = () =>
    host.session.sessionManager
      .getBranch()
      .filter((entry) => entry.type === "custom" && entry.customType === "core-tools.activity");
  const saved = entries();
  const data = saved
    .map((entry) =>
      entry.type === "custom"
        ? (entry.data as {
            cell_id: string;
            events: { type: string; child_id?: string }[];
          })
        : undefined,
    )
    .filter((entry) => entry?.cell_id === id);
  assert(data.length >= 2);
  assert(
    data.every(
      (entry) => entry!.events.length <= 16 && Buffer.byteLength(JSON.stringify(entry)) <= 8192,
    ),
  );
  const events = data.flatMap((entry) => entry!.events);
  const children = events
    .filter((event) => event.type === "started")
    .map((event) => event.child_id);
  assert.equal(children.length, 10);
  assert.equal(new Set(children).size, 10);
  assert(children.every((child) => child?.startsWith(id + "/")));
  assert.equal(events.filter((event) => event.child_id && event.type === "completed").length, 10);
  assert.doesNotMatch(await host.frame(), /Execution cell|Status: running/);
  await collect(host, id, "empty", { yield_time_ms: 0 });
  assert.deepEqual(entries(), saved);
  api!.appendEntry("core-tools.activity", {
    cell_id: "retained-interrupted",
    parent_call_id: "old-call",
    session_id: host.session.sessionId,
    status: "running",
    events: [{ type: "created" }],
  });
  await host.reload();
  assert.equal(workers.size, 0);
  assert.equal(await readFile(join(host.directory, "kept.txt"), "utf8"), "KEPT\n");
  assert.doesNotMatch(await host.frame(), /retained-interrupted|interrupted or unknown/);
  assert.match(await execute(host, 'text(load("reload"));', "new-values"), /undefined$/);
  assert.match(await collect(host, id, "old-cell"), /not found/);
  assert.doesNotMatch(
    JSON.stringify(host.requests.at(-1)),
    /retained-interrupted|core-tools.activity/,
  );
});
