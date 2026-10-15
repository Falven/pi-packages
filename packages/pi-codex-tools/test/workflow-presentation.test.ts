/* eslint-disable no-await-in-loop -- Native companion sessions share host state and controls. */
import assert from "node:assert/strict"
import { writeFile } from "node:fs/promises"
import { join } from "node:path"
import test from "node:test"
import { setTimeout } from "node:timers/promises"
import { stripVTControlCharacters } from "node:util"
import { Text, visibleWidth } from "@earendil-works/pi-tui"
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
        keybindings: order === "last" ? { "app.tools.expand": "ctrl+e" } : {},
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
        'await tools.exec_command({cmd:"printf inspect-project",login:false}); await tools.apply_patch("*** Begin Patch\\n*** Add File: changed.txt\\n+CHANGED\\n*** Add File: extra-one.txt\\n+ONE\\n*** Add File: extra-two.txt\\n+TWO\\n*** End Patch"); text(await tools.exec_command({cmd:"cat changed.txt",login:false})); image((await tools.view_image({path:"local.png"})).image_url); await yield_control(); await new Promise(resolve=>setTimeout(resolve,120)); image((await tools.view_image({path:"late.png"})).image_url); text("LATE-MIXED-RESULT"); throw new Error("LATE-MIXED-FAILURE");'
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
        /> Edited files, read files, ran a command, viewed images, executed a script/,
      )
      assert.doesNotMatch(screen, /validated-result|LATE-MIXED-RESULT/)
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
      assert.match(screen, /> Execution failed/)
      assert.doesNotMatch(screen, /validated-result|LATE-MIXED-RESULT/)
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
      assert.match(screen, /exec_command/)
      assert.match(screen, /"cmd": "cat changed\.txt"/)
      assert.match(screen, /validated-result/)
      assert.doesNotMatch(screen, /validated-line-39/)
      assert.match(screen, /more lines/)
      const nativeOutputRow = host
        .screenLines()
        .findIndex((line) =>
          stripVTControlCharacters(line).includes("exec_command"),
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
      assert.match(screen, /> Execution failed/)
      assert.doesNotMatch(screen, /LATE-MIXED-RESULT/)
      await host.key(`\x1b[<0;2;${groupRow + 1}M`)
      await host.key(`\x1b[<0;2;${groupRow + 1}m`)
      assert.doesNotMatch(await host.frame(), /validated-result/)
      await host.key(`\x1b[<0;2;${groupRow + 1}M`)
      await host.key(`\x1b[<0;2;${groupRow + 1}m`)
      await host.frame()
      screen = stripVTControlCharacters(host.screenLines().join("\n"))
      assert.match(screen, /validated-line-39/)
      assert.match(screen, /> Ran printf inspect-project/)
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
      assert.match(screen, /▼ Execution failed/)
      assert.equal((screen.match(/^ *▼ /gm) ?? []).length, 9)
      assert.match(screen, /inspect-project/)
      assert.match(screen, /validated-result/)
      assert.match(screen, /validated-line-39/)
      assert.match(screen, /local\.png/)
      assert.match(screen, /late\.png/)
      assert.match(screen, /LATE-MIXED-RESULT/)
      assert.match(screen, /LATE-MIXED-FAILURE/)
      assert.match(screen, /Unrelated workflow notice/)
      assert.match(screen, /Received\./)
      assert.match(screen, /"input": "await tools\.exec_command/)
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
      assert.match(screen, /▼ Collected output/)
      assert.match(screen, /▼ Collected output from/)
      assert.match(screen, /"cell_status": "failed"/)
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
      assert.match(screen, /> Collected output/)
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
      const executionRow = host
        .screenLines()
        .findIndex((line) =>
          stripVTControlCharacters(line).includes("Execution failed"),
        )
      assert(executionRow >= 0)
      await host.key(`\x1b[<0;2;${executionRow + 1}M`)
      await host.key(`\x1b[<0;2;${executionRow + 1}m`)
      const collectionRow = host
        .screenLines()
        .findIndex((line) =>
          stripVTControlCharacters(line).includes("Collected output"),
        )
      assert(collectionRow >= 0)
      await host.key(`\x1b[<0;2;${collectionRow + 1}M`)
      await host.key(`\x1b[<0;2;${collectionRow + 1}m`)
      await host.frame()
      const collectionItem = host
        .screenLines()
        .findIndex((line) =>
          stripVTControlCharacters(line).includes("Collected output from"),
        )
      assert(collectionItem >= 0)
      await host.key(`\x1b[<0;2;${collectionItem + 1}M`)
      await host.key(`\x1b[<0;2;${collectionItem + 1}m`)
      await host.frame()
      screen = stripVTControlCharacters(host.screenLines().join("\n"))
      assert.match(screen, /LATE-MIXED-FAILURE/)
      assert.equal((screen.match(/validated-result/g) ?? []).length, 1)
      assert.equal(
        screen.split("\n").filter((line) => line.trim() === "LATE-MIXED-RESULT")
          .length,
        1,
      )
      assert.equal(
        (screen.match(/\[Image: \[image\/png\] 2x1\]/g) ?? []).length,
        2,
      )
      assert.doesNotMatch(screen, /interrupted or unknown/)
      assert.match(screen, /Unrelated workflow notice/)
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
            /"exit_code": 9/,
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
      assert.match(collected, /> Collected output/)
      assert.equal(
        (collected.match(/STREAM-EARLYSTREAM-LATE/g) ?? []).length,
        1,
      )
    } finally {
      await writeFile(release, "go")
    }
  },
)
