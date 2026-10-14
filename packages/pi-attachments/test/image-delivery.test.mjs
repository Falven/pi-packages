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

test("blocked image delivery skips unreadable attachment preparation and preserves native final enforcement", async (t) => {
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
  await waitFor(() => assert.equal(host.requests.length, 1))
  const user = host.requests[0].messages.find(
    (message) => message.role === "user",
  )
  assert.ok(user.content.some((part) => part.text?.includes(draft)))
  assert.ok(user.content.every((part) => part.type !== "image_url"))
  assert.deepEqual(host.inputs.at(-1).images, [
    { type: "image", mimeType: "image/png", data: PNG },
  ])
  assert.deepEqual(await readFile(path), broken)
  assert.ok((await retainedRequest(host, "Delivery:")).text.includes(draft))
  await waitFor(() => assert.equal(host.runtime.session.isStreaming, false))
  assert.doesNotMatch(host.render(), /Image request not sent/)
})

for (const behavior of ["steer", "followUp"]) {
  for (const blockedAtQueue of [true, false]) {
    test(`${behavior} delivery follows image blocking changed from ${blockedAtQueue} while queued`, async (t) => {
      const response = Promise.withResolvers()
      t.after(() => response.resolve())
      const host = await nativePi(t, [], {
        settings: { images: { blockImages: blockedAtQueue } },
      })
      await host.runtime.session.setModel({
        ...host.runtime.session.model,
        inputLimits: { images: { resize: { maxWidth: 1, maxHeight: 1 } } },
      })
      host.replies.push(response.promise)
      host.submit("Finish the active request")
      await waitFor(() => assert.equal(host.requests.length, 1))
      const source = join(host.directory, "queued.png")
      const original = Buffer.from(PNG, "base64")
      const bytes = blockedAtQueue ? original : original.subarray(0, 33)
      await writeFile(source, bytes)
      await host.attachFile(source)
      const draft = host.ui.getEditorText().trim()
      const path = snapshotPath(draft)
      host.input(behavior === "steer" ? "\r" : "\x1b\r")
      await waitFor(() =>
        assert.equal(host.runtime.session.pendingMessageCount, 1),
      )
      assert.equal(host.inputs.at(-1).images, undefined)
      host.runtime.session.settingsManager.applyOverrides({
        images: { blockImages: !blockedAtQueue, autoResize: false },
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

  test(`${behavior} delivery uses auto-resize enabled after queueing`, async (t) => {
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
      widthPx: 1,
      heightPx: 1,
    })
    assert.match(user.content[0].text, /original 2x1, displayed at 1x1/)
    assert.equal((await readFile(path)).toString("base64"), PNG)
    await waitFor(() => assert.equal(host.runtime.session.isStreaming, false))
  })

  test(`${behavior} preparation failure rejects only its submission and preserves draft history and recovery`, async (t) => {
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
    await waitFor(() =>
      assert.equal(host.runtime.session.pendingMessageCount, 1),
    )
    const submissionId = host.inputs.at(-1).submissionId
    host.ui.setEditorText("The next valid request")
    host.input(behavior === "steer" ? "\r" : "\x1b\r")
    await waitFor(() =>
      assert.equal(host.runtime.session.pendingMessageCount, 2),
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
    const rejected = host.runtime.session.sessionManager
      .getEntries()
      .find(
        (entry) =>
          entry.type === "custom" && entry.customType === "input-rejected",
      )
    assert.equal(rejected.data.submissionId, submissionId)
    assert.equal(rejected.data.text, draft)
    assert.equal(rejected.data.streamingBehavior, behavior)
    const recovery = await retainedRequest(host, `Submission: ${submissionId}`)
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
  const recovery = await retainedRequest(
    host,
    `Submission: ${host.inputs.at(-1).submissionId}`,
  )
  assert.ok(recovery.text.includes(draft))
  await host.close()
  assert.deepEqual(await readFile(path), bytes)
  assert.equal(await readFile(recovery.path, "utf8"), recovery.text)
})
