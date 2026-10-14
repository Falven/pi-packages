import assert from "node:assert/strict"
import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { test } from "node:test"
import { setImmediate } from "node:timers/promises"
import { fileURLToPath } from "node:url"
import { openNativeHost } from "../../../fixtures/native-host.ts"
import { holdFileRead, retainedRequest } from "../fixtures/native-pi.mjs"
import { nativePi } from "../fixtures/native-pi.mjs"
import piAttachments from "../src/index.ts"
import { fileReferences } from "../src/references.ts"

const PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAADUlEQVR4nGP4zwAE/wEHAAH/4iOeWQAAAABJRU5ErkJggg=="
const composerPath = fileURLToPath(
  new URL("../../pi-composer/src/index.ts", import.meta.url),
)

function userText(request) {
  return request.messages
    .findLast(({ role }) => role === "user")
    .content.filter(({ type }) => type === "text")
    .map(({ text }) => text)
    .join("\n")
}

for (const composer of [false, true]) {
  test(`${composer ? "composer" : "native"} plain-text Send clears before immediately typed text`, async (t) => {
    const host = await nativePi(t, composer ? [composerPath] : [])
    host.ui.setEditorText("First")
    host.submit()
    host.input("N")
    assert.equal(host.ui.getEditorText(), "N")
    await t.waitFor(() => assert.equal(host.requests.length, 1))
    assert.equal(userText(host.requests[0]), "First")
    await t.waitFor(() => assert.equal(host.runtime.session.isStreaming, false))
    assert.equal(host.ui.getEditorText(), "N")
  })
}

for (const composer of [false, true]) {
  for (const route of ["normal", "steer", "followUp"]) {
    for (const failure of [false, true]) {
      test(`${composer ? "composer" : "native"} ${route}: Send waits for ${failure ? "failed" : "successful"} image preparation before later text`, async (t) => {
        const inputGate = Promise.withResolvers()
        t.after(() => inputGate.resolve())
        let firstAtHandler = false
        const inputs = []
        const host = await openNativeHost(t, {
          noTools: "all",
          holdResponses: true,
          extension: piAttachments,
          extensionPaths: composer ? [composerPath] : [],
          extensionFactories: [
            (pi) =>
              pi.on("input", async (event) => {
                if (!/^(First|Second)/.test(event.text)) return undefined
                if (event.text.startsWith("First")) {
                  firstAtHandler = true
                  await inputGate.promise
                  if (globalThis.gc) {
                    for (let attempt = 0; attempt < 5; attempt++) {
                      // eslint-disable-next-line no-await-in-loop -- Exercise cache collection between editor preparation and public input.
                      await setImmediate()
                      globalThis.gc()
                    }
                  }
                }
                inputs.push(event.text)
                return {
                  action: "transform",
                  text: `accepted ${event.streamingBehavior ?? "normal"}: ${event.text}`,
                  ...(event.text.startsWith("First")
                    ? {
                        images: [
                          { type: "image", data: PNG, mimeType: "image/png" },
                        ],
                      }
                    : {}),
                }
              }),
          ],
        })
        const active = route === "normal" ? 0 : 1
        if (active) {
          host.ui.setEditorText("Keep the original run active")
          await host.key("\r")
          await t.waitFor(() => assert.equal(host.requests.length, 1))
        }
        const source = join(host.directory, "image.png")
        const bytes = failure
          ? Buffer.from(PNG, "base64").subarray(0, 33)
          : Buffer.from(PNG, "base64")
        await writeFile(source, bytes)
        host.ui.setEditorText("First [image](image.png)")
        const reference = await t.waitFor(() => {
          const [captured] = fileReferences(
            host.ui.getEditorText(),
            host.directory,
          )
          assert.ok(
            captured?.path.startsWith(join(host.directory, "pi-attachments")),
          )
          return captured
        })
        const draft = host.ui.getEditorText()
        const held = holdFileRead(t, reference.path)
        const send = route === "followUp" ? "\x1b\r" : "\r"
        await host.key(send)
        await held.started()
        assert.equal(host.ui.getEditorText(), draft)
        assert.equal(host.requests.length, active)
        host.ui.setEditorText("Second text")
        await host.key(send)
        host.ui.setEditorText("Later draft")
        assert.deepEqual(inputs, [])
        held.release()

        if (failure) {
          await t.waitFor(async () =>
            assert.match(await host.output(), /Attachment request not sent/),
          )
          assert.equal(firstAtHandler, false)
          const recovery = await retainedRequest(
            { agentDir: host.directory },
            draft,
          )
          assert.ok(recovery.text.includes(draft))
        } else {
          await t.waitFor(() => assert.equal(firstAtHandler, true))
          assert.deepEqual(inputs, [])
          inputGate.resolve()
        }
        if (active) {
          await t.waitFor(() => assert.equal(inputs.length, failure ? 1 : 2))
          host.reply()
        }
        const deliveries = failure ? 1 : 2
        // Each native delivery needs its preceding controlled response to finish.
        for (let count = 1; count <= deliveries; count++) {
          // eslint-disable-next-line no-await-in-loop
          await t.waitFor(() =>
            assert.equal(host.requests.length, active + count),
          )
          host.reply()
        }
        await host.settled()
        assert.equal(
          userText(host.requests.at(-1)),
          `accepted ${route}: Second text`,
        )
        assert.equal(host.ui.getEditorText(), "Later draft")
        assert.deepEqual(await readFile(reference.path), bytes)
        if (failure) {
          assert.deepEqual(inputs, ["Second text"])
          assert.ok(!JSON.stringify(host.requests).includes(reference.path))
        } else {
          assert.deepEqual(inputs, [draft, "Second text"])
          const first = host.requests[active]
          assert.equal(userText(first), `accepted ${route}: ${draft}`)
          assert.equal(
            first.messages
              .findLast(({ role }) => role === "user")
              .content.filter(({ type }) => type === "image_url").length,
            2,
          )
        }
      })
    }
  }
}
