import assert from "node:assert/strict"
import { promises as fs } from "node:fs"
import { readFile, writeFile } from "node:fs/promises"
import { syncBuiltinESMExports } from "node:module"
import { join } from "node:path"
import { test } from "node:test"
import { openNativeHost } from "../../../fixtures/native-host.ts"
import { fileReferences } from "../src/references.ts"
import { holdFileRead, retainedRequest } from "./native-pi.mjs"
import { preclearProbe } from "./preclear-probe.mjs"

const PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAADUlEQVR4nGP4zwAE/wEHAAH/4iOeWQAAAABJRU5ErkJggg=="

function userText(request) {
  const message = request.messages.findLast((entry) => entry.role === "user")
  return typeof message.content === "string"
    ? message.content
    : message.content
        .filter((part) => part.type === "text")
        .map((part) => part.text)
        .join("\n")
}

for (const composer of [false, true])
  test(`${composer ? "composer" : "native"}: deferring run settlement keeps follow-up /reload as text after earlier preparation fails`, async (t) => {
    let starts = 0
    const inputs = []
    const ended = Promise.withResolvers()
    const host = await openNativeHost(t, {
      noTools: "all",
      holdResponses: true,
      extension: preclearProbe({ waitForStreamingAtEnd: true }),
      extensionFactories: [
        (pi) => {
          pi.on("agent_end", () => ended.resolve())
          pi.on("session_start", () => {
            starts++
          })
          pi.on("input", (event) => {
            inputs.push(event.text)
          })
        },
      ],
      extensionPaths: composer
        ? [new URL("../../pi-composer/src/index.ts", import.meta.url).pathname]
        : [],
    })
    host.ui.setEditorText("Original run")
    await host.key("\r")
    await t.waitFor(() => assert.equal(host.requests.length, 1))
    await writeFile(
      join(host.directory, "broken.png"),
      Buffer.from(PNG, "base64").subarray(0, 33),
    )
    host.ui.setEditorText("Failed [image](broken.png)")
    await t.waitFor(() => assert.match(host.ui.getEditorText(), /snapshot-/))
    const failed = host.ui.getEditorText()
    const [reference] = fileReferences(failed, host.directory)
    const held = holdFileRead(t, reference.path)
    await host.key("\x1b\r")
    await held.started()
    host.ui.setEditorText("/reload")
    await host.key("\x1b\r")
    host.ui.setEditorText("Later untouched draft")
    host.reply()
    await ended.promise
    assert.deepEqual(inputs, ["Original run"])
    held.release()
    await t.waitFor(() => assert.ok(starts > 1 || host.requests.length === 2))
    assert.equal(
      starts,
      1,
      "The original follow-up is message text, not a native reload command",
    )
    assert.equal(userText(host.requests[1]), "/reload")
    assert.deepEqual(inputs, ["Original run", "/reload"])
    assert.equal(host.ui.getEditorText(), "Later untouched draft")
    const recovery = await retainedRequest({ agentDir: host.directory }, failed)
    assert.ok(recovery.text.includes(failed))
    host.reply()
    await host.settled()
  })

for (const composer of [false, true])
  test(`${composer ? "composer" : "native"}: deferring run settlement remains abortable while a streaming Send prepares`, async (t) => {
    const ended = Promise.withResolvers()
    const host = await openNativeHost(t, {
      noTools: "all",
      holdResponses: true,
      extension: preclearProbe({ waitForStreamingAtEnd: true }),
      extensionFactories: [(pi) => pi.on("agent_end", () => ended.resolve())],
      extensionPaths: composer
        ? [new URL("../../pi-composer/src/index.ts", import.meta.url).pathname]
        : [],
    })
    host.ui.setEditorText("Original run")
    await host.key("\r")
    await t.waitFor(() => assert.equal(host.requests.length, 1))
    const source = join(host.directory, "source.txt")
    await writeFile(source, "Retain after abort")
    const held = holdFileRead(t, source)
    const original = "Waiting [file](source.txt)"
    host.ui.setEditorText(original)
    await held.started()
    await host.key("\x1b\r")
    host.ui.setEditorText("Later draft")
    host.reply()
    await ended.promise
    assert.equal(host.session.isStreaming, true)
    await host.key("\x1b")
    await host.settled()
    held.release()
    const recovery = await t.waitFor(async () =>
      retainedRequest({ agentDir: host.directory }, original),
    )
    assert.ok(recovery.text.includes(original))
    assert.equal(host.requests.length, 1)
    assert.equal(host.ui.getEditorText(), "Later draft")
  })

for (const composer of [false, true])
  for (const waitForStreamingAtEnd of [false, true])
    test(`${composer ? "composer" : "native"}: ${waitForStreamingAtEnd ? "deferring run settlement" : "ordinary settlement"} allows an earlier input handler to await agent_settled`, async (t) => {
      const inputStarted = Promise.withResolvers()
      const settled = Promise.withResolvers()
      t.after(() => settled.resolve())
      const host = await openNativeHost(t, {
        noTools: "all",
        holdResponses: true,
        extension: preclearProbe({ waitForStreamingAtEnd }),
        extensionFactories: [
          (pi) => {
            pi.on("agent_settled", () => settled.resolve())
            pi.on("input", async (event) => {
              if (!event.text.startsWith("Follow-up ")) return undefined
              inputStarted.resolve()
              await settled.promise
              return { action: "transform", text: `Accepted ${event.text}` }
            })
          },
        ],
        extensionPaths: composer
          ? [
              new URL("../../pi-composer/src/index.ts", import.meta.url)
                .pathname,
            ]
          : [],
      })
      host.ui.setEditorText("Original run")
      await host.key("\r")
      await t.waitFor(() => assert.equal(host.requests.length, 1))
      await writeFile(join(host.directory, "source.txt"), "Prepared contents")
      host.ui.setEditorText("Follow-up [file](source.txt)")
      await t.waitFor(() => assert.match(host.ui.getEditorText(), /snapshot-/))
      const prepared = host.ui.getEditorText()
      await host.key("\x1b\r")
      await inputStarted.promise
      host.ui.setEditorText("Later draft")
      host.reply()
      let waitingError
      try {
        await t.waitFor(() => assert.equal(host.requests.length, 2), {
          timeout: 1000,
        })
      } catch (error) {
        waitingError = error
      }
      // Release the controlled handler after observing failure so cleanup cannot hang.
      settled.resolve()
      await t.waitFor(() => assert.equal(host.requests.length, 2))
      assert.equal(userText(host.requests[1]), `Accepted ${prepared}`)
      host.reply()
      await host.settled()
      assert.equal(host.ui.getEditorText(), "Later draft")
      assert.ifError(waitingError)
    })

for (const composer of [false, true])
  for (const route of ["steering", "follow-up"])
    test(`${composer ? "composer" : "native"} ${route}: deferring run settlement preserves image and text delivery order through overlapping earlier input handlers`, async (t) => {
      const inputGate = Promise.withResolvers()
      const firstAtHandler = Promise.withResolvers()
      const secondAtHandler = Promise.withResolvers()
      const ended = Promise.withResolvers()
      t.after(() => inputGate.resolve())
      const inputs = []
      const host = await openNativeHost(t, {
        noTools: "all",
        holdResponses: true,
        extension: preclearProbe({ waitForStreamingAtEnd: true }),
        extensionPaths: composer
          ? [
              new URL("../../pi-composer/src/index.ts", import.meta.url)
                .pathname,
            ]
          : [],
        extensionFactories: [
          (pi) => {
            pi.on("agent_end", () => ended.resolve())
            pi.on("input", async (event) => {
              if (!/^(First|Second)/.test(event.text)) return undefined
              if (event.text.startsWith("First")) {
                firstAtHandler.resolve()
                await inputGate.promise
              } else secondAtHandler.resolve()
              inputs.push(event.text)
              return {
                action: "transform",
                text: `accepted ${event.streamingBehavior}: ${event.text}`,
                images: event.text.startsWith("First")
                  ? [{ type: "image", data: PNG, mimeType: "image/png" }]
                  : undefined,
              }
            })
          },
        ],
      })
      host.ui.setEditorText("Keep the original run active")
      await host.key("\r")
      await t.waitFor(() => assert.equal(host.requests.length, 1))
      await writeFile(
        join(host.directory, "image.png"),
        Buffer.from(PNG, "base64"),
      )
      host.ui.setEditorText("First [image](image.png)")
      await t.waitFor(() => assert.match(host.ui.getEditorText(), /snapshot-/))
      const prepared = host.ui.getEditorText()
      const [reference] = fileReferences(prepared, host.directory)
      const held = holdFileRead(t, reference.path)
      const send = route === "follow-up" ? "\x1b\r" : "\r"
      await host.key(send)
      await held.started()
      host.ui.setEditorText("Second text")
      await host.key(send)
      host.ui.setEditorText("Later untouched draft")
      assert.deepEqual(inputs, [])
      host.reply()
      await ended.promise
      assert.equal(host.session.isStreaming, true)
      held.release()
      await firstAtHandler.promise
      await secondAtHandler.promise
      assert.deepEqual(inputs, ["Second text"])
      assert.equal(host.requests.length, 1)
      inputGate.resolve()
      await t.waitFor(() => assert.equal(inputs.length, 2))
      assert.equal(inputs[1], prepared)
      await t.waitFor(() => assert.equal(host.requests.length, 2))
      const delivery = route === "steering" ? "steer" : "followUp"
      assert.equal(
        userText(host.requests[1]),
        `accepted ${delivery}: ${prepared}`,
      )
      const message = host.requests[1].messages.findLast(
        (entry) => entry.role === "user",
      )
      assert.equal(
        message.content.filter((part) => part.type === "image_url").length,
        2,
      )
      host.reply()
      await t.waitFor(() => assert.equal(host.requests.length, 3))
      assert.equal(
        userText(host.requests[2]),
        `accepted ${delivery}: Second text`,
      )
      host.reply()
      await host.settled()
      assert.equal(host.ui.getEditorText(), "Later untouched draft")
    })

for (const composer of [false, true])
  test(`${composer ? "composer" : "native"}: deferring run settlement keeps identical follow-ups associated after reversed captures and an earlier consuming handler`, async (t) => {
    const first = Promise.withResolvers()
    const second = Promise.withResolvers()
    t.after(() => {
      first.resolve()
      second.resolve()
    })
    const inputs = []
    const host = await openNativeHost(t, {
      noTools: "all",
      holdResponses: true,
      extension: preclearProbe({ waitForStreamingAtEnd: true }),
      extensionPaths: composer
        ? [new URL("../../pi-composer/src/index.ts", import.meta.url).pathname]
        : [],
      extensionFactories: [
        (pi) =>
          pi.on("input", async (event) => {
            if (!event.text.startsWith("Read ")) return undefined
            const index = inputs.push(event.text)
            await Promise.resolve()
            return index === 1
              ? { action: "handled" }
              : {
                  action: "transform",
                  text: `accepted ${event.streamingBehavior}: ${event.text}`,
                }
          }),
      ],
    })
    host.ui.setEditorText("Original run")
    await host.key("\r")
    await t.waitFor(() => assert.equal(host.requests.length, 1))
    const captures = []
    const write = fs.writeFile
    const held = t.mock.method(fs, "writeFile", async (...args) => {
      const result = await write(...args)
      if (
        String(args[0]).includes("/snapshot-") &&
        String(args[0]).endsWith("/same.txt")
      ) {
        captures.push(String(args[0]))
        await (captures.length === 1 ? first.promise : second.promise)
      }
      return result
    })
    syncBuiltinESMExports()
    t.after(() => {
      held.mock.restore()
      syncBuiltinESMExports()
    })
    const original = "Read [same](same.txt)"
    const source = join(host.directory, "same.txt")
    await writeFile(source, "First captured bytes")
    host.ui.setEditorText(original)
    await t.waitFor(() => assert.equal(captures.length, 1))
    await host.key("\x1b\r")
    await writeFile(source, "Second captured bytes")
    host.ui.setEditorText(original)
    await t.waitFor(() => assert.equal(captures.length, 2))
    await host.key("\x1b\r")
    host.ui.setEditorText("Later unrelated draft")
    second.resolve()
    await host.key("\x1b[D")
    assert.deepEqual(inputs, [])
    first.resolve()
    await t.waitFor(() => assert.equal(inputs.length, 2))
    const submitted = captures.map((path) => `Read [same](<${path}>)`)
    assert.deepEqual(inputs, submitted)
    assert.equal(await readFile(captures[0], "utf8"), "First captured bytes")
    assert.equal(await readFile(captures[1], "utf8"), "Second captured bytes")
    host.reply()
    await t.waitFor(() => assert.equal(host.requests.length, 2))
    assert.equal(
      userText(host.requests[1]),
      `accepted followUp: ${submitted[1]}`,
    )
    host.reply()
    await host.settled()
    assert.equal(host.ui.getEditorText(), "Later unrelated draft")
    await host.type("!")
    assert.equal(host.ui.getEditorText(), "Later unrelated draf!t")
    host.ui.setEditorText("")
    await host.key("\x1b[A")
    assert.equal(host.ui.getEditorText(), submitted[1])
    await host.key("\x1b[A")
    assert.equal(host.ui.getEditorText(), submitted[0])
  })
