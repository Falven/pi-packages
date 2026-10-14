/* eslint-disable no-await-in-loop -- Native hosts share environment and must close in order. */
import assert from "node:assert/strict"
import { writeFile } from "node:fs/promises"
import { join } from "node:path"
import test from "node:test"
import { setTimeout } from "node:timers/promises"
import { stripVTControlCharacters } from "node:util"
import { getCapabilities, setCapabilities } from "@earendil-works/pi-tui"
import { openNativeHost } from "../../../fixtures/native-host.ts"
import {
  call,
  completed,
  extension,
  output,
  providerApi,
} from "./fixtures/model-loop.ts"

const tiny =
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAADUlEQVR4nGNQqLgERAAIiQLVbsGVSQAAAABJRU5ErkJggg=="

test("image cards show effective paths and mixed text without exposing encoded envelopes", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
    rows: 100,
    columns: 100,
    settings: { terminal: { showImages: false } },
    extension(pi) {
      pi.on("tool_call", (event) => {
        if (event.toolName === "view_image") event.input["path"] = "actual.png"
      })
    },
  })
  const capabilities = getCapabilities()
  setCapabilities({ ...capabilities, images: "kitty" })
  t.after(() => setCapabilities(capabilities))
  await writeFile(
    join(host.directory, "actual.png"),
    Buffer.from(tiny, "base64"),
  )
  host.queueResponse(
    ...call(
      'text("before-image"); const value = await tools.view_image({path:"original.png"}); text(value); image(value); text("after-image");',
    ),
  )
  host.queueResponse(completed)
  await host.session.prompt("Inspect a local image")
  await setTimeout(60)
  assert.match(
    stripVTControlCharacters(host.screenLines().join("\n")),
    /Image · completed/,
  )
  await host.key("\x0f")
  await setTimeout(60)
  const screen = stripVTControlCharacters(host.screenLines().join("\n"))
  assert.match(screen, /Image · completed/)
  assert.match(screen, /Path: .*actual\.png/)
  assert.match(screen, /before-image/)
  assert.match(screen, /after-image/)
  assert.doesNotMatch(
    screen,
    /original\.png|image_url|base64|iVBOR|await tools/,
  )
  assert.match(output(host), /image_url/)
  assert(!host.terminal.output.includes("\x1b_G"))
  assert.match(JSON.stringify(host.requests.at(-1)), /"type":"input_image"/)
  const records = host.session.sessionManager
    .getBranch()
    .filter(
      (entry) =>
        entry.type === "custom" && entry.customType === "core-tools.activity",
    )
  assert.doesNotMatch(JSON.stringify(records), /iVBOR|base64/)
})

test("missing and blocked image cards retain readable failures without image payloads", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
    rows: 100,
    columns: 100,
  })
  host.queueResponse(
    ...call(
      'try { await tools.view_image({path:"missing.png"}); } catch (error) { text(error); }',
    ),
  )
  host.queueResponse(completed)
  await host.session.prompt("Inspect the missing image")
  await host.key("\x0f")
  await setTimeout(60)
  let screen = stripVTControlCharacters(host.screenLines().join("\n"))
  assert.match(screen, /Image · failed/)
  assert.match(screen, /Path: .*missing\.png/)
  assert.match(screen, /No such\s+file or directory/)
  host.session.settingsManager.setBlockImages(true)
  host.queueResponse(
    ...call(
      'try { await tools.view_image({path:"blocked.png"}); } catch (error) { text(error); }',
      "blocked",
    ),
  )
  host.queueResponse(completed)
  await host.session.prompt("Inspect the blocked image")
  await setTimeout(60)
  screen = stripVTControlCharacters(host.screenLines().join("\n"))
  assert.match(screen, /Image reading is disabled/)
  assert.doesNotMatch(screen, /base64|image_url/)
  assert.doesNotMatch(
    JSON.stringify(host.requests.at(-1)),
    /"type":"input_image"/,
  )
})

test("image removal and mixed text redaction suppress stale operation details", async (t) => {
  for (const mode of ["image", "text", "child"] as const) {
    await t.test(mode, async (caseContext) => {
      const host = await openNativeHost(caseContext, {
        extensionPaths: [extension],
        providerApi,
        rows: 100,
        columns: 100,
        extension(pi) {
          pi.on("tool_result", (event) => {
            if (mode === "child" && event.toolName === "view_image")
              return {
                content: [{ type: "text", text: "child-image-redacted" }],
              }
            if (mode !== "child" && event.toolName === "exec")
              return {
                content:
                  mode === "image"
                    ? event.content.filter((part) => part.type !== "image")
                    : event.content.map((part) =>
                        part.type === "text"
                          ? { type: "text" as const, text: "public-text" }
                          : part,
                      ),
              }
            return undefined
          })
        },
      })
      await writeFile(
        join(host.directory, "private.png"),
        Buffer.from(tiny, "base64"),
      )
      host.queueResponse(
        ...call(
          mode === "child"
            ? 'text(await tools.view_image({path:"private.png"}));'
            : 'text("private-text"); image(await tools.view_image({path:"private.png"}));',
        ),
      )
      host.queueResponse(completed)
      await host.session.prompt("Inspect an image with result hooks")
      await host.key("\x0f")
      await setTimeout(60)
      const screen = stripVTControlCharacters(host.screenLines().join("\n"))
      assert.doesNotMatch(screen, /base64|image_url|iVBOR/)
      if (mode === "child") {
        assert.match(screen, /child-image-redacted/)
        assert.match(screen, /Path: .*private\.png/)
      } else {
        assert.doesNotMatch(screen, /Path:|view_image/)
        if (mode === "text") {
          assert.match(screen, /public-text/)
          assert.doesNotMatch(screen, /private-text/)
        }
      }
      assert.equal(
        /"type":"input_image"/.test(JSON.stringify(host.requests.at(-1))),
        mode === "text",
      )
      await host.close()
    })
  }
})

test("native image display follows terminal visibility in compact and expanded cards", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
    rows: 100,
    columns: 100,
    settings: { terminal: { showImages: true } },
  })
  const capabilities = getCapabilities()
  setCapabilities({ ...capabilities, images: "kitty" })
  t.after(() => setCapabilities(capabilities))
  await writeFile(
    join(host.directory, "visible.png"),
    Buffer.from(tiny, "base64"),
  )
  host.queueResponse(
    ...call('image(await tools.view_image({path:"visible.png"}));'),
  )
  host.queueResponse(completed)
  await host.session.prompt("Inspect the image")
  await setTimeout(60)
  assert(host.terminal.output.includes("\x1b_G"))
  assert.match(
    stripVTControlCharacters(host.screenLines().join("\n")),
    /Image · completed/,
  )
  await host.key("\x0f")
  await setTimeout(60)
  assert.match(
    stripVTControlCharacters(host.screenLines().join("\n")),
    /Path: .*visible\.png/,
  )
  assert.match(JSON.stringify(host.requests.at(-1)), /"type":"input_image"/)
})

test("truncated serialized image results remain readable without exposing payload fragments", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
    rows: 100,
    columns: 100,
  })
  await writeFile(
    join(host.directory, "image.png"),
    Buffer.from(tiny, "base64"),
  )
  host.queueResponse(
    ...call(
      '// @exec: {"max_output_tokens": 20}\ntext(await tools.view_image({path:"image.png"}));',
    ),
  )
  host.queueResponse(completed)
  await host.session.prompt("Read the image result")
  await host.key("\x0f")
  await setTimeout(60)
  const screen = stripVTControlCharacters(host.screenLines().join("\n"))
  assert.match(screen, /Path: .*image\.png/)
  assert.doesNotMatch(screen, /image_url|base64|iVBOR|JRU5ErkJggg/)
  assert.match(output(host), /truncated output/)
})

test("an image policy change after the read is shown even when script code catches it", async (t) => {
  let blockImages: (() => void) | undefined
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
    rows: 100,
    columns: 100,
    extension(pi) {
      pi.on("tool_result", (event) => {
        if (event.toolName === "view_image") blockImages?.()
      })
    },
  })
  blockImages = () => host.session.settingsManager.setBlockImages(true)
  await writeFile(
    join(host.directory, "image.png"),
    Buffer.from(tiny, "base64"),
  )
  host.queueResponse(
    ...call('try { await tools.view_image({path:"image.png"}); } catch {}'),
  )
  host.queueResponse(completed)
  await host.session.prompt("Inspect the image")
  await host.key("\x0f")
  await setTimeout(60)
  const screen = stripVTControlCharacters(host.screenLines().join("\n"))
  assert.match(screen, /Image · failed/)
  assert.match(screen, /Image reading is disabled/)
  assert.doesNotMatch(screen, /base64|image_url/)
})
