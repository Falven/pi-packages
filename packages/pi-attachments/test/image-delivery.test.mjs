import assert from "node:assert/strict"
import { readFile, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import { getImageDimensions } from "@earendil-works/pi-tui"
import {
  nativePi,
  retainedRequest,
  snapshotPath,
  waitFor,
} from "../fixtures/native-pi.mjs"

const PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAADUlEQVR4nGP4zwAE/wEHAAH/4iOeWQAAAABJRU5ErkJggg=="
const inputExtension = fileURLToPath(
  new URL("../fixtures/image-input.ts", import.meta.url),
)

test("blocked images still undergo preparation and a failure keeps the requesting contents recoverable", async (t) => {
  const host = await nativePi(t, [inputExtension], {
    settings: { images: { blockImages: true } },
  })
  const source = join(host.directory, "blocked.png")
  const broken = Buffer.from(PNG, "base64").subarray(0, 33)
  await writeFile(source, broken)
  host.ui.pasteToEditor(source)
  const path = await waitFor(() => snapshotPath(host.ui.getEditorText()))
  const draft = host.ui.getEditorText().trim()
  await rm(source)

  host.submit()
  await waitFor(() => assert.match(host.render(), /Image request not sent/))
  assert.equal(host.requests.length, 0)
  assert.equal(host.users.length, 0)
  assert.equal(host.runtime.session.pendingMessageCount, 0)
  assert.deepEqual(await readFile(path), broken)
  const recovery = await retainedRequest(host, "Delivery:")
  assert.ok(recovery.text.includes(draft))
  const supplied = /\[Attachment: input-image-1\.png\]\(<([^>]+)>\)/.exec(
    recovery.text,
  )
  assert.ok(supplied, "the earlier handler's image remains recoverable")
  assert.equal((await readFile(supplied[1])).toString("base64"), PNG)
})

for (const behavior of ["steer", "followUp"]) {
  for (const blockedAtQueue of [true, false]) {
    test(`${behavior} delivery follows image blocking changed from ${blockedAtQueue} while queued`, async (t) => {
      const response = Promise.withResolvers()
      t.after(() => response.resolve())
      const host = await nativePi(t, [], {
        settings: {
          images: { blockImages: blockedAtQueue, autoResize: false },
        },
      })
      host.replies.push(response.promise)
      host.submit("Finish the active request")
      await waitFor(() => assert.equal(host.requests.length, 1))
      const source = join(host.directory, "queued.png")
      const bytes = Buffer.from(PNG, "base64")
      await writeFile(source, bytes)
      await host.attachFile(source)
      const draft = host.ui.getEditorText().trim()
      const path = snapshotPath(draft)
      host.input(behavior === "steer" ? "\r" : "\x1b\r")
      await waitFor(() =>
        assert.equal(host.runtime.session.pendingMessageCount, 1),
      )
      assert.deepEqual(host.inputs.at(-1).images, [
        { type: "image", mimeType: "image/png", data: PNG },
      ])
      host.runtime.session.settingsManager.applyOverrides({
        images: { blockImages: !blockedAtQueue },
      })
      await rm(source)
      host.ui.setEditorText("Unrelated later work")
      response.resolve()

      await waitFor(() => assert.equal(host.requests.length, 2))
      const user = host.requests[1].messages.findLast(
        (message) => message.role === "user",
      )
      assert.equal(user.content[0].text, draft)
      const images = user.content.filter((part) => part.type === "image_url")
      if (blockedAtQueue) {
        assert.deepEqual(images, [
          {
            type: "image_url",
            image_url: { url: `data:image/png;base64,${PNG}` },
          },
        ])
      } else assert.deepEqual(images, [])
      assert.deepEqual(await readFile(path), bytes)
      const recovery = await retainedRequest(host, `Delivery: ${behavior}`)
      assert.ok(recovery.text.includes(draft))
      await waitFor(() => assert.equal(host.runtime.session.isStreaming, false))
      assert.equal(host.ui.getEditorText(), "Unrelated later work")
      assert.doesNotMatch(host.render(), /Image request not sent/)
    })
  }

  test(`${behavior} keeps the resize policy used before queueing when settings change later`, async (t) => {
    const response = Promise.withResolvers()
    t.after(() => response.resolve())
    const host = await nativePi(t, [], {
      settings: { images: { autoResize: false } },
    })
    await host.runtime.session.setModel({
      ...host.runtime.session.model,
      inputLimits: { images: { resize: { maxWidth: 1, maxHeight: 1 } } },
    })
    host.replies.push(response.promise)
    host.submit("Finish the active request")
    await waitFor(() => assert.equal(host.requests.length, 1))
    const source = join(host.directory, "resize.png")
    await writeFile(source, Buffer.from(PNG, "base64"))
    await host.attachFile(source)
    const path = snapshotPath(host.ui.getEditorText())
    host.input(behavior === "steer" ? "\r" : "\x1b\r")
    await waitFor(() =>
      assert.equal(host.runtime.session.pendingMessageCount, 1),
    )
    host.runtime.session.settingsManager.applyOverrides({
      images: { autoResize: true },
    })
    response.resolve()

    await waitFor(() => assert.equal(host.requests.length, 2))
    const user = host.requests[1].messages.findLast(
      (message) => message.role === "user",
    )
    const [, mimeType, data] = /^data:([^;]+);base64,(.+)$/.exec(
      user.content[1].image_url.url,
    )
    assert.deepEqual(getImageDimensions(data, mimeType), {
      widthPx: 2,
      heightPx: 1,
    })
    assert.equal(data, PNG)
    assert.doesNotMatch(user.content[0].text, /displayed at/)
    assert.equal((await readFile(path)).toString("base64"), PNG)
    await waitFor(() => assert.equal(host.runtime.session.isStreaming, false))
  })

  test(`${behavior} preparation failure stops before queue acceptance and preserves active work, history, and recovery`, async (t) => {
    const response = Promise.withResolvers()
    t.after(() => response.resolve())
    const host = await nativePi(t)
    host.replies.push(response.promise)
    host.submit("Finish the active request")
    await waitFor(() => assert.equal(host.requests.length, 1))
    const source = join(host.directory, "broken-queued.png")
    const bytes = Buffer.from(PNG, "base64").subarray(0, 33)
    await writeFile(source, bytes)
    await host.attachFile(source)
    const draft = host.ui.getEditorText().trim()
    const path = snapshotPath(draft)
    host.input(behavior === "steer" ? "\r" : "\x1b\r")
    await waitFor(() => assert.match(host.render(), /Image request not sent/))
    assert.equal(host.runtime.session.pendingMessageCount, 0)
    assert.equal(host.runtime.session.isStreaming, true)
    assert.equal(host.requests.length, 1)
    host.ui.setEditorText("The next valid request")
    host.input(behavior === "steer" ? "\r" : "\x1b\r")
    await waitFor(() =>
      assert.equal(host.runtime.session.pendingMessageCount, 1),
    )
    host.ui.setEditorText("Unrelated later work")
    response.resolve()

    await waitFor(() => assert.equal(host.requests.length, 2))
    await waitFor(() => assert.equal(host.runtime.session.isStreaming, false))
    assert.equal(host.runtime.session.pendingMessageCount, 0)
    assert.equal(host.users.length, 2)
    const user = host.requests[1].messages.findLast(
      (message) => message.role === "user",
    )
    assert.deepEqual(user.content, [
      { type: "text", text: "The next valid request" },
    ])
    assert.ok(!JSON.stringify(host.requests).includes(path))
    assert.equal(host.ui.getEditorText(), "Unrelated later work")
    assert.match(host.render(), /Image request not sent/)
    const recovery = await retainedRequest(host, `Delivery: ${behavior}`)
    assert.ok(recovery.text.includes(draft))
    assert.deepEqual(await readFile(path), bytes)
    host.ui.setEditorText("")
    host.input("\x1b[A")
    host.input("\x1b[A")
    assert.ok(host.ui.getEditorText().includes(draft))
  })
}

test("image failure retains its snapshot and request when session-file persistence is disabled", async (t) => {
  const host = await nativePi(t, [], { noSession: true })
  const source = join(host.directory, "unpersisted.png")
  const bytes = Buffer.from(PNG, "base64").subarray(0, 33)
  await writeFile(source, bytes)
  await host.attachFile(source)
  const draft = host.ui.getEditorText().trim()
  const path = snapshotPath(draft)
  host.submit()
  await waitFor(() => assert.match(host.render(), /Image request not sent/))
  await waitFor(() => assert.equal(host.runtime.session.isStreaming, false))

  assert.equal(host.requests.length, 0)
  assert.equal(host.runtime.session.sessionFile, undefined)
  const recovery = await retainedRequest(host, "Delivery: normal")
  assert.ok(recovery.text.includes(draft))
  await host.close()
  assert.deepEqual(await readFile(path), bytes)
  assert.equal(await readFile(recovery.path, "utf8"), recovery.text)
})
