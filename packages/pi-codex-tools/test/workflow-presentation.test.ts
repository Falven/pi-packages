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

async function expand(host: Awaited<ReturnType<typeof openNativeHost>>) {
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
  await host.key("\x0f")
  await setTimeout(60)
  if (!host.screenLines().some((line) => line.includes("$ "))) {
    await host.key("\x0f")
    await setTimeout(60)
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
    `mixed operations retain native presentation with the toolset loaded ${order}`,
    { timeout: 15000 },
    async (t) => {
      const host = await openNativeHost(t, {
        extensionPaths:
          order === "first"
            ? [extension, ...companions]
            : [...companions, extension],
        providerApi,
        providerProtocol: "responses",
        rows: 180,
        columns: 100,
        settings: {
          theme: order === "first" ? "dark" : "light",
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
              return { content: [{ type: "text", text: "validated-result" }] }
            return undefined
          })
        },
      })
      await writeFile(
        join(host.directory, "local.png"),
        Buffer.from(tiny, "base64"),
      )
      const source =
        'await tools.exec_command({cmd:"printf inspect-project",login:false}); await tools.apply_patch("*** Begin Patch\\n*** Add File: changed.txt\\n+CHANGED\\n*** End Patch"); text(await tools.exec_command({cmd:"cat changed.txt",login:false})); image((await tools.view_image({path:"local.png"})).image_url); await yield_control(); await new Promise(resolve=>setTimeout(resolve,120)); text("LATE-MIXED-RESULT"); throw new Error("LATE-MIXED-FAILURE");'
      host.queueResponse(...call(source, "mixed"))
      await host.session.prompt(
        "Inspect, change, validate, and inspect the image",
      )
      const id = output(host, "mixed").match(/cell ID ([^\n]+)/)?.[1]
      assert(id)
      const requests = host.requests.length
      await setTimeout(220)
      assert.equal(host.requests.length, requests)
      let screen = await expand(host)
      assert.match(screen, /Called a tool/)
      assert.match(screen, /inspect-project/)
      assert.match(screen, /Added: .*changed\.txt/)
      assert.match(screen, /validated-result/)
      assert.match(screen, /Path: .*local\.png/)
      assert.match(screen, /LATE-MIXED-RESULT/)
      assert.match(screen, /LATE-MIXED-FAILURE/)
      assert.match(screen, /Unrelated workflow notice/)
      assert.match(screen, /Received\./)
      assert.doesNotMatch(
        screen,
        /await tools|chunk_id|cell_id|iVBOR|core-tools\.activity/,
      )
      assert.match(output(host, "mixed"), /validated-result/)
      assert.doesNotMatch(output(host, "mixed"), /CHANGED/)
      assert.match(JSON.stringify(host.requests.at(-1)), /"type":"input_image"/)
      host.queueResponse(
        ...functionCall("wait", { cell_id: id }, "collect-mixed", "functions"),
      )
      await host.session.prompt("Collect the execution")
      assert.match(output(host, "collect-mixed"), /LATE-MIXED-RESULT/)
      assert.match(output(host, "collect-mixed"), /LATE-MIXED-FAILURE/)
      await host.reload()
      screen = await expand(host)
      assert.match(screen, /LATE-MIXED-FAILURE/)
      assert.doesNotMatch(screen, /interrupted or unknown/)
      assert.match(screen, /Unrelated workflow notice/)
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
    await expand(host)
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
    await writeFile(join(host.directory, "release"), "go")
    await t.waitFor(
      () =>
        assert.match(
          stripVTControlCharacters(host.screenLines().join("\n")),
          /Exit status: 9/,
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
  },
)
