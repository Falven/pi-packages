/* eslint-disable no-await-in-loop -- Real producers must reach their synchronized output phase before release. */
import assert from "node:assert/strict";
import test from "node:test";
import { access, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";
import { stripVTControlCharacters } from "node:util";
import { visibleWidth } from "@earendil-works/pi-tui";
import { activityType, type ActivityUpdate } from "../src/activity.ts";
import { openNativeHost } from "../../../fixtures/native-host.ts";
import {
  call,
  completed,
  extension,
  functionCall,
  output,
  providerApi,
} from "./fixtures/model-loop.ts";

test("completed execution cards expand readable commands while retaining orchestration", async (t) => {
  const operations: ActivityUpdate[] = [];
  const activity: {
    events: {
      type: string;
      presentation?: { command?: string; order?: number };
    }[];
  }[] = [];
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
    rows: 100,
    columns: 100,
    extension(pi) {
      pi.events.on(activityType, (event) => {
        operations.push(event as ActivityUpdate);
      });
      pi.events.on("core-tools.activity", (event) => {
        activity.push(event as (typeof activity)[number]);
      });
    },
  });
  const source = 'await tools.exec_command({cmd: "printf readable-command", login: false});';
  host.queueResponse(...call(source));
  host.queueResponse(completed);
  await host.session.prompt("Run a command");
  await setTimeout(60);
  const compact = stripVTControlCharacters(host.screenLines().join("\n"));
  assert.doesNotMatch(compact, /await tools|Execution cell|Wall time|chunk_id/);
  assert.match(compact, /Command.*completed/i);
  assert.doesNotMatch(compact, /readable-command/);
  await host.key("\x0f");
  await setTimeout(60);
  const expanded = stripVTControlCharacters(host.screenLines().join("\n"));
  assert.match(expanded, /printf readable-command/);
  assert.match(expanded, /Directory: .*native-host/);
  assert.match(expanded, /Exit status: 0/);
  assert.match(expanded, /readable-command/);
  assert.doesNotMatch(expanded, /await tools|Execution cell|Wall time|chunk_id/);
  assert.doesNotMatch(output(host), /readable-command/);
  assert(
    operations.some((update) =>
      update.operations.some(
        (operation) =>
          operation.kind === "command" &&
          operation.commands[0] === "printf readable-command" &&
          operation.status === "completed" &&
          operation.output === "readable-command",
      ),
    ),
    "a consumer without chat receives semantic command facts",
  );
  assert(
    activity.some((batch) =>
      batch.events.some(
        (event) =>
          event.type === "presentation" &&
          event.presentation?.command === "printf readable-command" &&
          event.presentation.order === 0,
      ),
    ),
  );
  await host.reload();
  await setTimeout(60);
  assert.match(stripVTControlCharacters(host.screenLines().join("\n")), /Command · completed/);
  const branch = host.session.sessionManager.getBranch();
  assert(
    branch.some((entry) => entry.type === "custom" && entry.customType === "core-tools.activity"),
  );
  assert(host.requestBodies.at(-1)?.includes(source.replaceAll('"', '\\"')));
});

test("command cards use effective arguments and hook-processed returned output", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
    rows: 100,
    columns: 100,
    extension(pi) {
      pi.on("tool_call", (event) => {
        if (event.toolName === "exec_command") event.input["cmd"] = "printf secret-payload";
      });
      pi.on("tool_result", (event) => {
        if (event.toolName === "exec_command")
          return { content: [{ type: "text", text: "redacted-result" }] };
        return undefined;
      });
    },
  });
  host.queueResponse(
    ...call('text(await tools.exec_command({cmd:"original-command",login:false}));'),
  );
  host.queueResponse(completed);
  await host.session.prompt("Run a command");
  await host.key("\x0f");
  await setTimeout(60);
  const expanded = stripVTControlCharacters(host.screenLines().join("\n"));
  assert.match(expanded, /\$ printf secret-payload/);
  assert.match(expanded, /redacted-result/);
  assert.doesNotMatch(expanded, /original-command|Exit status/);
  assert.doesNotMatch(output(host), /secret-payload/);
  assert.match(output(host), /redacted-result/);
  const result = host.session.sessionManager
    .getBranch()
    .findLast(
      (entry) =>
        entry.type === "message" &&
        entry.message.role === "toolResult" &&
        entry.message.toolName === "exec",
    );
  assert(result?.type === "message" && result.message.role === "toolResult");
  const operation = (
    result.message.details as {
      execution: {
        operations: { effectiveArgs?: { cmd?: string }; resultText?: string }[];
      };
    }
  ).execution.operations[0];
  assert.equal(operation?.effectiveArgs?.cmd, "printf secret-payload");
  assert.equal(operation?.resultText, "redacted-result");
});

test("expanded execution keeps emitted results readable and reports script and command failures", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
    rows: 100,
    columns: 100,
  });
  host.queueResponse(
    ...call(
      'text(await tools.exec_command({cmd:"printf command-failed; exit 7",login:false})); text("command-failed"); text("script-note"); throw new Error("script-failed");',
    ),
  );
  host.queueResponse(completed);
  await host.session.prompt("Run a command");
  await host.key("\x0f");
  await setTimeout(60);
  const expanded = stripVTControlCharacters(host.screenLines().join("\n"));
  assert.match(expanded, /Exit status: 7/);
  assert.match(expanded, /Command · failed/);
  assert.match(expanded, /script-failed/);
  assert.match(expanded, /script-note/);
  const result = host.session.sessionManager
    .getBranch()
    .findLast(
      (entry) =>
        entry.type === "message" &&
        entry.message.role === "toolResult" &&
        entry.message.toolName === "exec",
    );
  assert(result?.type === "message" && result.message.role === "toolResult");
  const script = (result.message.details as { execution: { output?: string } }).execution.output;
  assert.equal(script, "command-failed\nscript-note");
  assert.doesNotMatch(expanded, /chunk_id|wall_time_seconds|original_token_count|await tools/);
});

test("parent result redaction also controls the returned operation presentation", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
    rows: 100,
    columns: 100,
    extension(pi) {
      pi.on("tool_result", (event) => {
        if (event.toolName === "exec")
          return { content: [{ type: "text", text: "parent-redacted" }] };
        return undefined;
      });
    },
  });
  host.queueResponse(
    ...call('await tools.exec_command({cmd:"printf hidden-after-return",login:false});'),
  );
  host.queueResponse(completed);
  await host.session.prompt("Run a command");
  await host.key("\x0f");
  await setTimeout(60);
  const expanded = stripVTControlCharacters(host.screenLines().join("\n"));
  assert.match(expanded, /parent-redacted/);
  assert.doesNotMatch(expanded, /hidden-after-return/);
  assert.match(output(host), /parent-redacted/);
  assert.doesNotMatch(output(host), /hidden-after-return/);
});

for (const edited of [true, false]) {
  test(`parent result ${edited ? "edits" : "removal"} owns presentation after late activity and reload`, async (t) => {
    const host = await openNativeHost(t, {
      extensionPaths: [extension],
      providerApi,
      rows: 100,
      columns: 100,
      extension(pi) {
        pi.on("tool_result", (event) => {
          if (event.toolName !== "exec") return undefined;
          if (!edited) return { details: {} };
          const details = event.details as {
            execution: Record<string, unknown>;
          };
          return {
            details: {
              ...details,
              execution: {
                ...details.execution,
                operations: [],
                output: "PUBLIC-SUMMARY",
              },
            },
          };
        });
      },
    });
    host.queueResponse(
      ...call(
        'await tools.exec_command({cmd:"printf PRIVATE-BEFORE",login:false}); text("RETURNED-SCRIPT"); await yield_control(); await new Promise(resolve=>setTimeout(resolve,120)); await tools.exec_command({cmd:"printf PRIVATE-AFTER",login:false}); text("PRIVATE-LATE");',
      ),
    );
    host.queueResponse(completed);
    await host.session.prompt("Use the returned presentation");
    await host.key("\x0f");
    await setTimeout(220);
    const assertReturned = () => {
      const frame = stripVTControlCharacters(host.screenLines().join("\n"));
      assert.match(frame, edited ? /PUBLIC-SUMMARY/ : /RETURNED-SCRIPT/);
      assert.doesNotMatch(frame, /PRIVATE-BEFORE|PRIVATE-AFTER|PRIVATE-LATE/);
    };
    assertReturned();
    assert.match(output(host), /RETURNED-SCRIPT/);
    await host.reload();
    await setTimeout(70);
    assertReturned();
  });
}

test("compact command status reports a nonzero exit without changing script success", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
    rows: 40,
    columns: 60,
  });
  host.queueResponse(...call('await tools.exec_command({cmd:"exit 9",login:false});'));
  host.queueResponse(completed);
  await host.session.prompt("Run a command");
  await setTimeout(60);
  assert.match(stripVTControlCharacters(host.screenLines().join("\n")), /Command · failed/);
  assert.match(output(host), /Script completed/);
});

test("script errors before any operation remain readable without showing their source", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
    rows: 60,
    columns: 40,
  });
  host.queueResponse(...call('text("before-child"); throw new Error("before-dispatch-failed");'));
  host.queueResponse(completed);
  await host.session.prompt("Run a script");
  await host.key("\x0f");
  await setTimeout(60);
  const expanded = stripVTControlCharacters(host.screenLines().join("\n"));
  assert.match(expanded, /Execution · failed/);
  assert.match(expanded, /before-child/);
  assert.match(expanded, /before-dispatch-failed/);
  assert.doesNotMatch(expanded, /throw new|text\(/);
});

test("large command previews show omissions and wrap within narrow terminal cells", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
    rows: 1600,
    columns: 24,
  });
  host.queueResponse(
    ...call(
      'await tools.exec_command({cmd:"printf \\\"界🙂\\\"; printf \\\"%050000d\\\" 0",login:false,max_output_tokens:100000});',
    ),
  );
  host.queueResponse(completed);
  await host.session.prompt("Run a command");
  await host.key("\x0f");
  await setTimeout(60);
  const expanded = stripVTControlCharacters(host.screenLines().join("\n"));
  assert.match(expanded, /界🙂/);
  assert.match(expanded, /output omitted/);
  assert.match(expanded, /Exit status: 0/);
  assert.doesNotMatch(expanded, /�|Wall time|chunk_id/);
  assert(host.screenLines().every((line) => visibleWidth(line) <= 24));
});

for (const sample of [
  {
    name: "head boundary",
    source: 'process.stdout.write("x".repeat(8189)+"\\x1b[31mRED-END\\x1b[0m")',
    expected: /RED-END/,
    fragment: /1mRED-END/,
  },
  {
    name: "tail boundary",
    source: 'process.stdout.write("x".repeat(8192)+"a".repeat(1000)+"\\x1b[31m"+"R".repeat(8189))',
    expected: /output omitted/,
    fragment: /31mR/,
  },
  {
    name: "split output events",
    source:
      'process.stdout.write("SPLIT-START\\n\\x1b[3"); setTimeout(()=>{process.stdout.write("1mSPLIT-END\\x1b[0m\\x1b]8;;hidden-link");setTimeout(()=>process.stdout.write("\\x1b\\\\LINK\\x1b]8;;\\x1b\\\\"),80)},80)',
    expected: /SPLIT-ENDLINK/,
    fragment: /1mSPLIT|hidden-link/,
  },
]) {
  test(`command preview strips terminal controls before clipping at ${sample.name}`, async (t) => {
    const host = await openNativeHost(t, {
      extensionPaths: [extension],
      providerApi,
      rows: 400,
      columns: 100,
    });
    const producer = join(host.directory, "ansi-producer.cjs");
    await writeFile(producer, sample.source);
    host.queueResponse(
      ...call(
        `text(await tools.exec_command(${JSON.stringify({ cmd: `${process.execPath} ${producer}`, login: false, max_output_tokens: 10000 })}));`,
      ),
    );
    host.queueResponse(completed);
    await host.session.prompt("Show readable terminal output");
    await host.key("\x0f");
    await setTimeout(60);
    const frame = stripVTControlCharacters(host.screenLines().join("\n"));
    assert.match(frame, sample.expected);
    assert.doesNotMatch(frame, sample.fragment);
    assert.match(output(host), /\\u001b\[31m/);
  });
}

for (const sample of [
  {
    name: "combining mark",
    prefix: "x".repeat(8191) + "e",
    suffix: "\u0301",
    split: /x+e\s*\n\s*… \[output omitted\]/,
  },
  {
    name: "joined emoji",
    prefix: "x".repeat(8188) + "👩",
    suffix: "\u200d💻",
    split: /👩\s*\n\s*… \[output omitted\]/,
  },
]) {
  test(`streamed preview keeps a ${sample.name} whole across the head boundary`, async (t) => {
    const host = await openNativeHost(t, {
      extensionPaths: [extension],
      providerApi,
      rows: 400,
      columns: 100,
    });
    const producer = join(host.directory, "grapheme-producer.cjs");
    await writeFile(
      producer,
      `process.stdout.write(${JSON.stringify(sample.prefix)}); setTimeout(()=>process.stdout.write(${JSON.stringify(sample.suffix)}+"y".repeat(10000)+"GRAPHEME-END"),80)`,
    );
    host.queueResponse(
      ...call(
        `await tools.exec_command(${JSON.stringify({ cmd: `${process.execPath} ${producer}`, login: false })});`,
      ),
    );
    host.queueResponse(completed);
    await host.session.prompt("Keep whole graphemes");
    await host.key("\x0f");
    await setTimeout(60);
    const frame = stripVTControlCharacters(host.screenLines().join("\n"));
    assert.match(frame, /output omitted/);
    assert.match(frame, /GRAPHEME-END/);
    assert.doesNotMatch(frame, sample.split);
  });
}

test("a failed wait shows its collection error without transport details", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
    rows: 60,
    columns: 100,
  });
  host.queueResponse(...functionCall("wait", { cell_id: "missing" }, "missing", "functions"));
  host.queueResponse(completed);
  await host.session.prompt("Collect output");
  await host.key("\x0f");
  await setTimeout(60);
  assert.match(
    stripVTControlCharacters(host.screenLines().join("\n")),
    /exec cell missing not found/,
  );
  assert.match(output(host, "missing"), /exec cell missing not found/);
});

for (const tty of [false, true]) {
  test(`command output appears before ${tty ? "PTY" : "pipe"} collection returns`, async (t) => {
    const host = await openNativeHost(t, {
      extensionPaths: [extension],
      providerApi,
      rows: 100,
      columns: 100,
    });
    await host.key("\x0f");
    const ready = join(host.directory, "ready");
    const release = join(host.directory, "release");
    const command = `printf 'EARLY-OUTPUT\\n'; touch '${ready}'; until test -f '${release}'; do sleep 0.02; done; printf 'FINAL-OUTPUT\\n'`;
    host.queueResponse(
      ...call(
        `text(await tools.exec_command(${JSON.stringify({ cmd: command, login: false, tty, yield_time_ms: 30000 })}));`,
      ),
    );
    host.queueResponse(completed);
    let finished = false;
    const pending = host.session.prompt("Run live command").then(() => {
      finished = true;
    });
    try {
      for (let attempt = 0; attempt < 200; attempt++) {
        if (
          await access(ready).then(
            () => true,
            () => false,
          )
        )
          break;
        await setTimeout(10);
      }
      await setTimeout(80);
      assert.equal(finished, false);
      const frame = stripVTControlCharacters(host.screenLines().join("\n"));
      assert.match(frame, /\n\s*EARLY-OUTPUT\s*\n/);
      assert.match(frame, /Command · running/);
    } finally {
      await writeFile(release, "");
      await pending;
    }
    assert.match(output(host), /EARLY-OUTPUT/);
    assert.match(output(host), /FINAL-OUTPUT/);
  });
}

test("late command completion stays in its original card without consuming model output", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
    rows: 160,
    columns: 100,
  });
  await host.key("\x0f");
  const release = join(host.directory, "release");
  const command = `printf 'FIRST-CHUNK\\n'; until test -f '${release}'; do sleep 0.02; done; printf 'LAST-CHUNK\\n'; exit 7`;
  host.queueResponse(
    ...call(
      `const process = await tools.exec_command(${JSON.stringify({ cmd: command, login: false, yield_time_ms: 250 })}); store("process", process.session_id); text(process);`,
    ),
  );
  host.queueResponse(completed);
  await host.session.prompt("Start command");
  const initial = output(host);
  assert.match(initial, /FIRST-CHUNK/);
  const requestsBefore = host.requests.length;
  await writeFile(release, "");
  await setTimeout(150);
  const frame = stripVTControlCharacters(host.screenLines().join("\n"));
  assert.match(frame, /Command · failed/);
  assert.match(frame, /Exit status: 7/);
  assert.match(frame, /\n\s*LAST-CHUNK\s*\n/);
  assert.equal(host.requests.length, requestsBefore);
  host.queueResponse(
    ...call('text(await tools.write_stdin({session_id:load("process")}));', "collect"),
  );
  host.queueResponse(completed);
  await host.session.prompt("Collect command");
  const collected = output(host, "collect");
  assert.match(collected, /LAST-CHUNK/);
  assert.doesNotMatch(collected, /FIRST-CHUNK/);
  await setTimeout(60);
  const final = stripVTControlCharacters(host.screenLines().join("\n"));
  assert.equal(final.split("\n").filter((line) => line.trim() === "LAST-CHUNK").length, 1);
});

test("bounded operation history keeps active commands and their late failure in the originating card", async (t) => {
  const activity: {
    events: {
      type: string;
      presentation?: {
        id: string;
        order: number;
        outputOmitted?: boolean;
      };
    }[];
  }[] = [];
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
    rows: 180,
    columns: 100,
    extension(pi) {
      pi.events.on("core-tools.activity", (event) => {
        activity.push(event as (typeof activity)[number]);
      });
    },
  });
  const producer = join(host.directory, "origin-producer.cjs");
  const release = join(host.directory, "release");
  await writeFile(
    producer,
    `const fs=require("node:fs"); console.log("ORIGIN-EARLY"); const timer=setInterval(()=>{if(fs.existsSync(${JSON.stringify(release)})){clearInterval(timer);console.log("ORIGIN-LATE-FAILURE");process.exitCode=9;}},10);`,
  );
  host.queueResponse(
    ...call(
      `const result=await tools.exec_command(${JSON.stringify({ cmd: `${process.execPath} ${producer}`, login: false, yield_time_ms: 250 })}); store("process",result.session_id); for(let index=0;index<8;index++) await tools.exec_command({cmd:":",login:false});`,
    ),
  );
  host.queueResponse(completed);
  await host.session.prompt("Keep the background operation visible");
  await host.key("\x0f");
  await setTimeout(60);
  assert.match(stripVTControlCharacters(host.screenLines().join("\n")), /Command · running/);
  const requests = host.requests.length;
  await writeFile(release, "");
  await setTimeout(150);
  const assertOrigin = () => {
    const frame = stripVTControlCharacters(host.screenLines().join("\n"));
    assert.match(frame, /operations · failed/);
    assert.match(frame, /ORIGIN-LATE-FAILURE/);
    assert.match(frame, /Exit status: 9/);
    assert.match(frame, /earlier activity bodies omitted/);
  };
  assertOrigin();
  assert.equal(host.requests.length, requests);
  assert(
    activity.some((batch) =>
      batch.events.some(
        (event) =>
          event.type === "presentation" &&
          event.presentation?.outputOmitted === true &&
          event.presentation.order > 0,
      ),
    ),
  );
  host.queueResponse(
    ...call('text(await tools.write_stdin({session_id:load("process")}));', "collect"),
  );
  host.queueResponse(completed);
  await host.session.prompt("Collect the process outcome");
  assert.match(output(host, "collect"), /ORIGIN-LATE-FAILURE/);
  await host.reload();
  await setTimeout(70);
  assertOrigin();
});

test("input in another execution updates the originating PTY card without duplicate output", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
    rows: 160,
    columns: 100,
  });
  await host.key("\x0f");
  host.queueResponse(
    ...call(
      'const process = await tools.exec_command({cmd:"printf \'PTY-READY\\n\'; read answer; printf \'PTY-ANSWER:%s\\n\' \\"$answer\\"",tty:true,login:false,yield_time_ms:250}); store("process",process.session_id); text(process);',
    ),
  );
  host.queueResponse(completed);
  await host.session.prompt("Start terminal");
  host.queueResponse(
    ...call(
      'text(await tools.write_stdin({session_id:load("process"),chars:"hello\\n"}));',
      "input",
    ),
  );
  host.queueResponse(completed);
  await host.session.prompt("Send input");
  assert.match(output(host, "input"), /PTY-ANSWER:hello/);
  await setTimeout(60);
  const frame = stripVTControlCharacters(host.screenLines().join("\n"));
  assert.equal(frame.split("\n").filter((line) => line.trim() === "PTY-ANSWER:hello").length, 1);
  assert.match(frame, /write_stdin · completed/);
  assert.match(frame, /Exit status: 0/);
});

test("live previews retain trailing large output independently of a small model budget", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
    rows: 1000,
    columns: 100,
  });
  await host.key("\x0f");
  host.queueResponse(
    ...call(
      'text(await tools.exec_command({cmd:"node -e \'process.stdout.write(\\\"BEGIN\\\\n\\\" + \\\"X\\\".repeat(262144) + \\\"\\\\nTRAILING\\\\n\\\")\'",login:false,max_output_tokens:32}));',
    ),
  );
  host.queueResponse(completed);
  await host.session.prompt("Run large output");
  await setTimeout(60);
  const frame = stripVTControlCharacters(host.screenLines().join("\n"));
  assert.match(frame, /\n\s*BEGIN\s*\n/);
  assert.match(frame, /\n\s*TRAILING\s*\n/);
  assert.match(frame, /output omitted/);
  const model = output(host);
  assert.match(model, /tokens truncated/);
  assert.match(model, /TRAILING/);
});

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
      );
    },
  });
  await host.key("\x0f");
  const ready = join(host.directory, "ready");
  const release = join(host.directory, "release");
  const command = `printf 'VISIBLE-BEFORE-HOOK\\n'; touch '${ready}'; until test -f '${release}'; do sleep 0.02; done`;
  host.queueResponse(
    ...call(
      `text(await tools.exec_command(${JSON.stringify({ cmd: command, login: false, yield_time_ms: 30000 })}));`,
    ),
  );
  host.queueResponse(completed);
  const pending = host.session.prompt("Run with output hook");
  try {
    for (let attempt = 0; attempt < 200; attempt++) {
      if (
        await access(ready).then(
          () => true,
          () => false,
        )
      )
        break;
      await setTimeout(10);
    }
    await setTimeout(60);
    assert.match(
      stripVTControlCharacters(host.screenLines().join("\n")),
      /\n\s*VISIBLE-BEFORE-HOOK\s*\n/,
    );
  } finally {
    await writeFile(release, "");
    await pending;
  }
  await setTimeout(60);
  const frame = stripVTControlCharacters(host.screenLines().join("\n"));
  assert.doesNotMatch(frame, /\n\s*VISIBLE-BEFORE-HOOK\s*\n/);
  assert.match(frame, /REMOVED-BY-HOOK/);
  assert.match(output(host), /REMOVED-BY-HOOK/);
  assert.doesNotMatch(output(host), /VISIBLE-BEFORE-HOOK/);
  const result = host.session.sessionManager
    .getBranch()
    .findLast(
      (entry) =>
        entry.type === "message" &&
        entry.message.role === "toolResult" &&
        entry.message.toolName === "exec",
    );
  assert(result?.type === "message" && result.message.role === "toolResult");
  const operation = (
    result.message.details as {
      execution: { operations: { output?: string; exitCode?: number }[] };
    }
  ).execution.operations[0];
  assert.equal(operation?.output, "REMOVED-BY-HOOK");
  assert.equal(operation?.exitCode, undefined);
});

test("cancelled command presentation preserves live output and its terminal failure", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
    rows: 100,
    columns: 100,
  });
  await host.key("\x0f");
  const ready = join(host.directory, "ready");
  const command = `printf 'BEFORE-CANCEL\\n'; touch '${ready}'; sleep 30`;
  host.queueResponse(
    ...call(
      `text(await tools.exec_command(${JSON.stringify({ cmd: command, login: false, yield_time_ms: 30000 })}));`,
    ),
  );
  host.queueResponse(completed);
  const pending = host.session.prompt("Cancel running command");
  for (let attempt = 0; attempt < 200; attempt++) {
    if (
      await access(ready).then(
        () => true,
        () => false,
      )
    )
      break;
    await setTimeout(10);
  }
  await host.session.abort();
  await pending;
  await setTimeout(60);
  const frame = stripVTControlCharacters(host.screenLines().join("\n"));
  assert.match(frame, /Command · failed/);
  assert.match(frame, /\n\s*BEFORE-CANCEL\s*\n/);
  assert.match(frame, /Exit status: 1/);
});

test("structured command result edits replace the live presentation snapshot", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
    rows: 100,
    columns: 100,
    extension(pi) {
      pi.on("tool_result", (event) => {
        if (event.toolName !== "exec_command") return undefined;
        const result = {
          output: "FILTERED-OUTPUT",
          wall_time_seconds: 0,
          exit_code: 0,
        };
        return {
          content: [{ type: "text", text: JSON.stringify(result) }],
          structuredContent: result,
        };
      });
    },
  });
  host.queueResponse(
    ...call("text(await tools.exec_command({cmd:\"printf 'ORIGINAL-OUTPUT\\n'\",login:false}));"),
  );
  host.queueResponse(completed);
  await host.session.prompt("Run with structured result hook");
  await host.key("\x0f");
  await setTimeout(60);
  const frame = stripVTControlCharacters(host.screenLines().join("\n"));
  assert.match(frame, /\n\s*FILTERED-OUTPUT\s*\n/);
  assert.doesNotMatch(frame, /\n\s*ORIGINAL-OUTPUT\s*\n/);
  assert.match(output(host), /FILTERED-OUTPUT/);
  assert.doesNotMatch(output(host), /ORIGINAL-OUTPUT/);
});

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
      );
    },
  });
  await host.key("\x0f");
  const release = join(host.directory, "release");
  const command = `printf 'BEFORE-RETURN\\n'; until test -f '${release}'; do sleep 0.02; done; printf 'AFTER-RETURN\\n'`;
  host.queueResponse(
    ...call(
      `text(await tools.exec_command(${JSON.stringify({ cmd: command, login: false, yield_time_ms: 250 })}));`,
    ),
  );
  host.queueResponse(completed);
  await host.session.prompt("Start a continued command with redaction");
  assert.match(output(host), /RETURN-REDACTED/);
  assert.doesNotMatch(output(host), /BEFORE-RETURN/);
  await writeFile(release, "");
  await setTimeout(150);
  const frame = stripVTControlCharacters(host.screenLines().join("\n"));
  assert.match(frame, /\n\s*AFTER-RETURN\s*\n/);
  assert.doesNotMatch(frame, /\n\s*BEFORE-RETURN\s*\n/);
  assert.match(frame, /Command · completed/);
});

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
      );
    },
  });
  await host.key("\x0f");
  host.queueResponse(
    ...call(
      'const process = await tools.exec_command({cmd:"printf \'INPUT-READY\\n\'; read answer; printf \'PRIOR-LIVE-OBSERVATION:%s\\n\' \\"$answer\\"",tty:true,login:false,yield_time_ms:250}); store("process",process.session_id); text(process);',
    ),
  );
  host.queueResponse(completed);
  await host.session.prompt("Start terminal");
  host.queueResponse(
    ...call(
      'text(await tools.write_stdin({session_id:load("process"),chars:"hello\\n"}));',
      "input",
    ),
  );
  host.queueResponse(completed);
  await host.session.prompt("Send input with a result hook");
  assert.match(output(host, "input"), /INPUT-RESULT-REDACTED/);
  assert.doesNotMatch(output(host, "input"), /PRIOR-LIVE-OBSERVATION/);
  await setTimeout(60);
  const frame = stripVTControlCharacters(host.screenLines().join("\n"));
  assert.equal(
    frame.split("\n").filter((line) => line.trim() === "PRIOR-LIVE-OBSERVATION:hello").length,
    1,
  );
  assert.match(frame, /write_stdin · completed/);
});

test("a yielded script keeps its original card through late output, failure, collection and reload", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
    rows: 160,
    columns: 100,
  });
  await host.key("\x0f");
  host.queueResponse(
    ...call(
      'text("BEFORE-YIELD"); await yield_control(); await new Promise(resolve => setTimeout(resolve,150)); text("AFTER-YIELD"); throw new Error("LATE-SCRIPT-FAILURE");',
    ),
  );
  host.queueResponse(completed);
  await host.session.prompt("Start script");
  const id = output(host).match(/cell ID ([^\n]+)/)?.[1];
  assert(id);
  const requests = host.requests.length;
  await setTimeout(250);
  let frame = stripVTControlCharacters(host.screenLines().join("\n"));
  assert.match(frame, /Execution · failed/);
  assert.match(frame, /AFTER-YIELD/);
  assert.match(frame, /LATE-SCRIPT-FAILURE/);
  assert.equal(host.requests.length, requests);
  host.queueResponse(...functionCall("wait", { cell_id: id }, "collect", "functions"));
  host.queueResponse(completed);
  await host.session.prompt("Collect script");
  assert.match(output(host, "collect"), /AFTER-YIELD/);
  assert.doesNotMatch(output(host, "collect"), /BEFORE-YIELD/);
  frame = stripVTControlCharacters(host.screenLines().join("\n"));
  assert.equal(frame.split("\n").filter((line) => line.trim() === "AFTER-YIELD").length, 1);
  await host.reload();
  await setTimeout(80);
  frame = stripVTControlCharacters(host.screenLines().join("\n"));
  assert.match(frame, /Execution · failed/);
  assert.match(frame, /AFTER-YIELD/);
  assert.doesNotMatch(frame, /interrupted or unknown/);
});

test("later operations and collected completion remain owned by their originating execution", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
    rows: 160,
    columns: 100,
  });
  await host.key("\x0f");
  host.queueResponse(
    ...call(
      'await yield_control(); await new Promise(resolve => setTimeout(resolve,120)); await tools.exec_command({cmd:"printf LATE-OPERATION",login:false}); text("LATE-SCRIPT-NOTE");',
      "origin",
    ),
  );
  host.queueResponse(completed);
  await host.session.prompt("Start later operation");
  const id = output(host, "origin").match(/cell ID ([^\n]+)/)?.[1];
  assert(id);
  host.queueResponse(...call('text("UNRELATED-SCRIPT");', "other"));
  host.queueResponse(completed);
  await host.session.prompt("Another prompt");
  await t.waitFor(
    () => assert.match(stripVTControlCharacters(host.screenLines().join("\n")), /LATE-SCRIPT-NOTE/),
    { timeout: 5000, interval: 20 },
  );
  let frame = stripVTControlCharacters(host.screenLines().join("\n"));
  assert.match(frame, /Command · completed/);
  assert.match(frame, /LATE-OPERATION/);
  assert.match(frame, /LATE-SCRIPT-NOTE/);
  host.queueResponse(...functionCall("wait", { cell_id: id }, "collect", "functions"));
  host.queueResponse(completed);
  await host.session.prompt("Collect later operation");
  assert.match(output(host, "collect"), /LATE-SCRIPT-NOTE/);
  await host.reload();
  await setTimeout(70);
  frame = stripVTControlCharacters(host.screenLines().join("\n"));
  assert.match(frame, /Command · completed/);
  assert.match(frame, /LATE-OPERATION/);
  assert.equal(frame.split("\n").filter((line) => line.trim() === "LATE-SCRIPT-NOTE").length, 1);
});

test("explicit termination is shown without duplicating already displayed script output", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
    rows: 100,
    columns: 100,
  });
  await host.key("\x0f");
  host.queueResponse(
    ...call('text("ONLY-ORIGIN"); await yield_control(); await new Promise(() => {});'),
  );
  host.queueResponse(completed);
  await host.session.prompt("Start retained script");
  const id = output(host).match(/cell ID ([^\n]+)/)?.[1];
  assert(id);
  host.queueResponse(
    ...functionCall("wait", { cell_id: id, terminate: true }, "stop", "functions"),
  );
  host.queueResponse(completed);
  await host.session.prompt("Terminate script");
  await setTimeout(70);
  const frame = stripVTControlCharacters(host.screenLines().join("\n"));
  assert.match(frame, /Execution · terminated/);
  assert.match(frame, /Execution terminated/);
  assert.equal(frame.split("\n").filter((line) => line.trim() === "ONLY-ORIGIN").length, 1);
  await host.reload();
  await setTimeout(70);
  assert.match(stripVTControlCharacters(host.screenLines().join("\n")), /Execution · terminated/);
});

test("recorded process failure survives reload after its JavaScript cell was collected", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
    rows: 100,
    columns: 100,
  });
  await host.key("\x0f");
  const release = join(host.directory, "release");
  const cmd = `printf 'PROCESS-START\\n'; until test -f '${release}'; do sleep 0.02; done; printf 'LATE-PROCESS-FAILURE\\n'; exit 9`;
  host.queueResponse(
    ...call(
      `await tools.exec_command(${JSON.stringify({ cmd, login: false, yield_time_ms: 250 })});`,
    ),
  );
  host.queueResponse(completed);
  await host.session.prompt("Start independent process");
  await writeFile(release, "");
  await setTimeout(150);
  await host.reload();
  await setTimeout(70);
  const frame = stripVTControlCharacters(host.screenLines().join("\n"));
  assert.match(frame, /Command · failed/);
  assert.match(frame, /LATE-PROCESS-FAILURE/);
  assert.match(frame, /Exit status: 9/);
  assert.doesNotMatch(frame, /interrupted or unknown/);
});

test("restoration uses the selected branch and does not borrow a terminal result from another branch", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
    rows: 120,
    columns: 100,
  });
  await host.key("\x0f");
  host.queueResponse(
    ...call(
      'await yield_control(); await new Promise(resolve=>setTimeout(resolve,150)); text("BRANCH-TERMINAL");',
    ),
  );
  host.queueResponse(completed);
  await host.session.prompt("Start branch script");
  const early = host.session.sessionManager.getLeafId();
  assert(early);
  await setTimeout(250);
  const late = host.session.sessionManager.getLeafId();
  assert(late);
  assert.notEqual(late, early);
  await host.reload();
  await host.session.navigateTree(early, { summarize: false });
  await host.reload();
  await setTimeout(80);
  let frame = stripVTControlCharacters(host.screenLines().join("\n"));
  assert.match(frame, /interrupted or unknown/);
  assert.doesNotMatch(frame, /BRANCH-TERMINAL/);
  await host.session.navigateTree(late, { summarize: false });
  await host.reload();
  await setTimeout(80);
  frame = stripVTControlCharacters(host.screenLines().join("\n"));
  assert.match(frame, /Execution · completed/);
  assert.match(frame, /BRANCH-TERMINAL/);
  assert.doesNotMatch(frame, /interrupted or unknown/);
});

test("recorded completion is restored when a retained session is resumed and forked", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
    rows: 120,
    columns: 100,
    persistSession: true,
  });
  await host.key("\x0f");
  host.queueResponse(
    ...call(
      'await yield_control(); await new Promise(resolve=>setTimeout(resolve,100)); text("RESUMED-OUTCOME");',
    ),
  );
  host.queueResponse(completed);
  await host.session.prompt("Start resumable script");
  await setTimeout(200);
  const file = host.session.sessionManager.getSessionFile();
  assert(file);
  const leaf = host.session.sessionManager.getLeafId();
  assert(leaf);
  await host.close();
  const resumed = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
    rows: 120,
    columns: 100,
    sessionFile: file,
  });
  await resumed.key("\x0f");
  await setTimeout(70);
  let frame = stripVTControlCharacters(resumed.screenLines().join("\n"));
  assert.match(frame, /Execution · completed/);
  assert.match(frame, /RESUMED-OUTCOME/);
  await resumed.runtime.fork(leaf, { position: "at" });
  await resumed.reload();
  await setTimeout(70);
  frame = stripVTControlCharacters(resumed.screenLines().join("\n"));
  assert.match(frame, /Execution · completed/);
  assert.match(frame, /RESUMED-OUTCOME/);
});

test("legacy yielded cards recover recorded status without inventing operation output", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
    rows: 100,
    columns: 100,
  });
  await host.key("\x0f");
  host.queueResponse(
    ...call(
      'await yield_control(); await new Promise(resolve=>setTimeout(resolve,80)); throw new Error("LEGACY-TERMINAL");',
    ),
  );
  host.queueResponse(completed);
  await host.session.prompt("Read legacy status");
  await setTimeout(150);
  const manager = host.session.sessionManager;
  const entries = manager.getBranch();
  manager.newSession();
  for (const entry of entries) {
    if (entry.type === "custom")
      manager.appendCustomEntry(entry.customType, structuredClone(entry.data));
    else if (entry.type === "message") {
      const message = structuredClone(entry.message);
      if (message.role === "toolResult") {
        delete message.details;
        manager.appendMessage(message);
      } else if (message.role === "user" || message.role === "assistant")
        manager.appendMessage(message);
    }
  }
  await host.reload();
  await setTimeout(70);
  const frame = stripVTControlCharacters(host.screenLines().join("\n"));
  assert.match(frame, /Execution · failed/);
  assert.match(frame, /LEGACY-TERMINAL/);
  assert.match(frame, /Earlier activity body unavailable/);
  assert.doesNotMatch(frame, /Command ·|Exit status:/);
});

test("cancelling a wait leaves its originating card live and preserves later collection", async (t) => {
  let waiting: (() => void) | undefined;
  const ready = new Promise<void>((resolve) => {
    waiting = resolve;
  });
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
    rows: 120,
    columns: 100,
    extension(pi) {
      pi.on("tool_execution_start", (event) => {
        if (event.toolName === "wait") waiting?.();
      });
    },
  });
  await host.key("\x0f");
  host.queueResponse(
    ...call(
      'await yield_control(); await new Promise(resolve=>setTimeout(resolve,500)); text("AFTER-CANCELLED-WAIT");',
    ),
  );
  host.queueResponse(completed);
  await host.session.prompt("Start cancellable wait");
  const id = output(host).match(/cell ID ([^\n]+)/)?.[1];
  assert(id);
  host.queueResponse(
    ...functionCall("wait", { cell_id: id, yield_time_ms: 5000 }, "cancel", "functions"),
  );
  const pending = host.session.prompt("Wait then cancel");
  await ready;
  await host.session.abort();
  await pending;
  await setTimeout(70);
  assert.match(stripVTControlCharacters(host.screenLines().join("\n")), /Wait cancelled/);
  await setTimeout(500);
  host.queueResponse(...functionCall("wait", { cell_id: id }, "later", "functions"));
  host.queueResponse(completed);
  await host.session.prompt("Collect after cancellation");
  assert.match(output(host, "later"), /AFTER-CANCELLED-WAIT/);
  await setTimeout(70);
  const frame = stripVTControlCharacters(host.screenLines().join("\n"));
  assert.equal(
    frame.split("\n").filter((line) => line.trim() === "AFTER-CANCELLED-WAIT").length,
    1,
  );
  assert.match(frame, /Execution · completed/);
});

test("clipped incremental script previews restore the same omission and terminal failure", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
    rows: 800,
    columns: 80,
  });
  await host.key("\x0f");
  host.queueResponse(
    ...call(
      'text("PREVIEW-START\\n"+"a".repeat(12000)); await yield_control(); await new Promise(resolve=>setTimeout(resolve,100)); text("b".repeat(12000)); throw new Error("PREVIEW-FAILURE");',
    ),
  );
  host.queueResponse(completed);
  await host.session.prompt("Start clipped script");
  await setTimeout(200);
  const preview = () =>
    stripVTControlCharacters(host.screenLines().join("\n"))
      .split("\n")
      .map((line) => line.trim())
      .filter((line) =>
        /^(?:[ab]+|.*output omitted.*|PREVIEW-START|Error: PREVIEW-FAILURE)$/.test(line),
      )
      .join("\n");
  const before = preview();
  assert.match(before, /output omitted/);
  assert.match(before, /PREVIEW-FAILURE/);
  await host.reload();
  await setTimeout(70);
  assert.equal(preview(), before);
});

test("restoring an incomplete process discloses uncertainty without mutating retained records", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
    rows: 100,
    columns: 100,
  });
  await host.key("\x0f");
  host.queueResponse(
    ...call(
      'await tools.exec_command({cmd:"printf STILL-RUNNING; sleep 30",login:false,yield_time_ms:250});',
    ),
  );
  host.queueResponse(completed);
  await host.session.prompt("Start incomplete process");
  const records = host.session.sessionManager
    .getBranch()
    .filter((entry) => entry.type === "custom" && entry.customType === "core-tools.activity");
  const saved = structuredClone(records);
  await host.reload();
  await setTimeout(80);
  assert.match(
    stripVTControlCharacters(host.screenLines().join("\n")),
    /Command · interrupted or unknown/,
  );
  for (const entry of saved)
    assert.deepEqual(host.session.sessionManager.getEntry(entry.id), entry);
});
