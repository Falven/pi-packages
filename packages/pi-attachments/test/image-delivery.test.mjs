import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import fs, { mkdir, readFile, realpath, writeFile } from "node:fs/promises"
import { syncBuiltinESMExports } from "node:module"
import { join } from "node:path"
import { test } from "node:test"
import { setImmediate } from "node:timers/promises"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import { getAgentDir } from "@earendil-works/pi-coding-agent"
import { getImageDimensions } from "@earendil-works/pi-tui"
import { nativePi, retainedRequest, waitFor } from "../fixtures/native-pi.mjs"
import { registerImages } from "../src/images.ts"

const PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAADUlEQVR4nGP4zwAE/wEHAAH/4iOeWQAAAABJRU5ErkJggg=="
const BMP =
  "Qk06AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABABgAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAD/AA=="
const inputExtension = fileURLToPath(
  new URL("../fixtures/image-input.ts", import.meta.url),
)

function imageSession(t, extensionPaths = [], state = {}) {
  return nativePi(t, extensionPaths, {
    ...state,
    attachments: false,
    extensionFactories: [
      (pi) => {
        const lifetime = new AbortController()
        pi.on("session_shutdown", () => lifetime.abort())
        const images = registerImages(
          pi,
          join(getAgentDir(), "pi-attachments"),
          lifetime.signal,
          () => [],
          () => "medium",
        )
        pi.registerCommand("prepare-images", {
          description: "Prepare the current draft's attachment images",
          handler: async (args, ctx) => {
            await images.prepare(
              {
                text: ctx.ui.getEditorText(),
                images: state.prewarmImages,
                streamingBehavior: args || undefined,
              },
              ctx,
            )
            ctx.ui.notify("Images prepared", "info")
          },
        })
      },
    ],
  })
}

async function retainedImage(host, name, contents) {
  const storage = join(host.agentDir, "pi-attachments", "test-snapshot")
  await mkdir(storage, { recursive: true })
  const path = join(storage, name)
  await writeFile(path, contents)
  const draft = `[Attachment: ${name}](<${path}>)`
  host.ui.setEditorText(draft)
  return { path, draft }
}

test("completed image preparation releases cached content after earlier input consumes Send", async (t) => {
  const gc = globalThis.gc
  if (!gc) {
    const environment = { ...process.env }
    delete environment.NODE_TEST_CONTEXT
    await promisify(execFile)(
      process.execPath,
      [
        "--expose-gc",
        "--test",
        "--test-name-pattern=completed image preparation releases cached content",
        fileURLToPath(import.meta.url),
      ],
      { env: environment },
    )
    return
  }
  const host = await imageSession(t, [inputExtension])
  const { path, draft } = await retainedImage(
    host,
    "consumed.bmp",
    Buffer.from(BMP, "base64"),
  )
  const file = await realpath(path)
  const read = fs.readFile
  let reads = 0
  const mocked = t.mock.method(fs, "readFile", (...args) => {
    if (args[0] === file) reads++
    return read(...args)
  })
  syncBuiltinESMExports()
  t.after(() => {
    mocked.mock.restore()
    syncBuiltinESMExports()
  })
  await host.runtime.session.prompt("/prepare-images")
  assert.equal(reads, 1)
  host.submit(`Handled here\n${draft}`)
  await waitFor(() =>
    assert.match(host.render(), /Earlier input handler handled the request/),
  )
  for (let attempt = 0; attempt < 5; attempt++) {
    // eslint-disable-next-line no-await-in-loop -- Release WeakRef's current-job keepalive before collecting.
    await setImmediate()
    gc()
  }
  host.ui.setEditorText(draft)
  await host.runtime.session.prompt("/prepare-images")
  assert.equal(reads, 2)
  assert.equal(host.requests.length, 0)
})

test("concurrent preparation shares in-flight content and native input preserves earlier images", async (t) => {
  const host = await imageSession(t, [inputExtension], {
    settings: { images: { autoResize: false } },
  })
  const { path, draft } = await retainedImage(
    host,
    "prepared.bmp",
    Buffer.from(BMP, "base64"),
  )
  const file = await realpath(path)
  const read = fs.readFile
  let reads = 0
  const held = Promise.withResolvers()
  const mocked = t.mock.method(fs, "readFile", async (...args) => {
    const contents = await read(...args)
    if (args[0] === file) {
      reads++
      await held.promise
    }
    return contents
  })
  syncBuiltinESMExports()
  t.after(() => {
    held.resolve()
    mocked.mock.restore()
    syncBuiltinESMExports()
  })
  const initial = Promise.all([
    host.runtime.session.prompt("/prepare-images"),
    host.runtime.session.prompt("/prepare-images"),
  ])
  await waitFor(() => assert.equal(reads, 1))
  held.resolve()
  await initial
  assert.equal(reads, 1)
  assert.match(host.render(), /Images prepared/)
  host.submit()
  await waitFor(() => assert.equal(host.requests.length, 1))

  const user = host.requests[0].messages.find(
    (message) => message.role === "user",
  )
  assert.equal(user.content[0].text, `Before attachments\n${draft}`)
  assert.equal(user.content.length, 3)
  assert.equal(user.content[1].image_url.url, `data:image/png;base64,${PNG}`)
  const [, mimeType, data] = /^data:([^;]+);base64,(.+)$/.exec(
    user.content[2].image_url.url,
  )
  assert.deepEqual(getImageDimensions(data, mimeType), {
    widthPx: 1,
    heightPx: 1,
  })
  assert.equal((await readFile(path)).toString("base64"), BMP)
  await waitFor(() => assert.equal(host.runtime.session.isStreaming, false))
})

for (const change of ["resize preference", "model image limits"]) {
  test(`input uses the effective ${change} changed after preparation`, async (t) => {
    const host = await imageSession(t)
    await host.runtime.session.setModel({
      ...host.runtime.session.model,
      inputLimits: { images: { resize: { maxWidth: 1, maxHeight: 1 } } },
    })
    const { path, draft } = await retainedImage(
      host,
      "policy.png",
      Buffer.from(PNG, "base64"),
    )
    await host.runtime.session.prompt("/prepare-images")
    assert.match(host.render(), /Images prepared/)
    if (change === "resize preference") {
      host.runtime.session.settingsManager.applyOverrides({
        images: { autoResize: false },
      })
    } else {
      await host.runtime.session.setModel({
        ...host.runtime.session.model,
        inputLimits: { images: { resize: { maxWidth: 2, maxHeight: 1 } } },
      })
    }
    host.submit()
    await waitFor(() => assert.equal(host.requests.length, 1))
    const user = host.requests[0].messages.find(
      (message) => message.role === "user",
    )
    assert.equal(user.content[0].text, draft)
    assert.equal(user.content[1].image_url.url, `data:image/png;base64,${PNG}`)
    assert.equal((await readFile(path)).toString("base64"), PNG)
    await waitFor(() => assert.equal(host.runtime.session.isStreaming, false))
  })
}

test("failed preparation reaches its caller, preserves requesting contents, and permits retry", async (t) => {
  const host = await imageSession(t, [inputExtension], {
    settings: { images: { blockImages: true } },
    prewarmImages: [{ type: "image", mimeType: "image/png", data: PNG }],
  })
  const broken = Buffer.from(PNG, "base64").subarray(0, 33)
  const { path, draft } = await retainedImage(host, "retry.png", broken)
  await host.runtime.session.prompt("/prepare-images followUp")
  assert.match(host.render(), /Request saved:/)
  assert.doesNotMatch(host.render(), /Images prepared/)
  assert.equal(host.requests.length, 0)
  assert.equal(host.ui.getEditorText(), draft)
  assert.deepEqual(await readFile(path), broken)
  const recovery = await retainedRequest(host, "Delivery: followUp")
  assert.ok(recovery.text.includes(draft))
  const supplied = /\[Attachment: input-image-1\.png\]\(<([^>]+)>\)/.exec(
    recovery.text,
  )
  assert.ok(supplied)
  assert.equal((await readFile(supplied[1])).toString("base64"), PNG)

  await writeFile(path, Buffer.from(PNG, "base64"))
  await host.runtime.session.prompt("/prepare-images followUp")
  assert.match(host.render(), /Images prepared/)
  host.runtime.session.settingsManager.applyOverrides({
    images: { blockImages: false },
  })
  host.submit()
  await waitFor(() => assert.equal(host.requests.length, 1))
  const user = host.requests[0].messages.find(
    (message) => message.role === "user",
  )
  assert.equal(user.content[0].text, `Before attachments\n${draft}`)
  assert.equal(user.content.length, 3)
  for (const part of user.content.slice(1))
    assert.equal(part.image_url.url, `data:image/png;base64,${PNG}`)
  await waitFor(() => assert.equal(host.runtime.session.isStreaming, false))
})

test("normal input keeps supplied images, converts BMP, and honors the effective resize override without changing retained bytes", async (t) => {
  const host = await imageSession(t, [inputExtension], {
    settings: { images: { autoResize: true } },
  })
  await host.runtime.session.setModel({
    ...host.runtime.session.model,
    inputLimits: { images: { resize: { maxWidth: 1, maxHeight: 1 } } },
  })
  const png = await retainedImage(
    host,
    "original.png",
    Buffer.from(PNG, "base64"),
  )
  const bmp = await retainedImage(
    host,
    "converted.bmp",
    Buffer.from(BMP, "base64"),
  )
  const draft = `${png.draft}\n${png.draft}\n${bmp.draft}`
  host.runtime.session.settingsManager.applyOverrides({
    images: { autoResize: false },
  })
  host.submit(draft)
  await waitFor(() => assert.equal(host.requests.length, 1))
  const user = host.requests[0].messages.find(
    (message) => message.role === "user",
  )
  assert.equal(user.content[0].text, `Before attachments\n${draft}`)
  assert.equal(user.content.length, 4)
  for (const part of user.content.slice(1, 3))
    assert.equal(part.image_url.url, `data:image/png;base64,${PNG}`)
  const [, mimeType, data] = /^data:([^;]+);base64,(.+)$/.exec(
    user.content[3].image_url.url,
  )
  assert.equal(mimeType, "image/png")
  assert.deepEqual(getImageDimensions(data, mimeType), {
    widthPx: 1,
    heightPx: 1,
  })
  assert.equal((await readFile(png.path)).toString("base64"), PNG)
  assert.equal((await readFile(bmp.path)).toString("base64"), BMP)
  await waitFor(() => assert.equal(host.runtime.session.isStreaming, false))
})

test("blocked images still undergo preparation and a failure keeps the requesting contents recoverable", async (t) => {
  const host = await imageSession(t, [inputExtension], {
    settings: { images: { blockImages: true } },
  })
  const broken = Buffer.from(PNG, "base64").subarray(0, 33)
  const { path, draft } = await retainedImage(host, "blocked.png", broken)

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
      const host = await imageSession(t, [], {
        settings: {
          images: { blockImages: blockedAtQueue, autoResize: false },
        },
      })
      host.replies.push(response.promise)
      host.submit("Finish the active request")
      await waitFor(() => assert.equal(host.requests.length, 1))
      const bytes = Buffer.from(PNG, "base64")
      const { path, draft } = await retainedImage(host, "queued.png", bytes)
      host.input(behavior === "steer" ? "\r" : "\x1b\r")
      await waitFor(() =>
        assert.equal(host.runtime.session.pendingMessageCount, 1),
      )
      host.runtime.session.settingsManager.applyOverrides({
        images: { blockImages: !blockedAtQueue },
      })
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
    const host = await imageSession(t, [], {
      settings: { images: { autoResize: false } },
    })
    await host.runtime.session.setModel({
      ...host.runtime.session.model,
      inputLimits: { images: { resize: { maxWidth: 1, maxHeight: 1 } } },
    })
    host.replies.push(response.promise)
    host.submit("Finish the active request")
    await waitFor(() => assert.equal(host.requests.length, 1))
    const { path } = await retainedImage(
      host,
      "resize.png",
      Buffer.from(PNG, "base64"),
    )
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
    const host = await imageSession(t)
    host.replies.push(response.promise)
    host.submit("Finish the active request")
    await waitFor(() => assert.equal(host.requests.length, 1))
    const bytes = Buffer.from(PNG, "base64").subarray(0, 33)
    const { path, draft } = await retainedImage(
      host,
      "broken-queued.png",
      bytes,
    )
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
  const host = await imageSession(t, [], { noSession: true })
  const bytes = Buffer.from(PNG, "base64").subarray(0, 33)
  const { path, draft } = await retainedImage(host, "unpersisted.png", bytes)
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
