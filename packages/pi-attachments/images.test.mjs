import assert from "node:assert/strict"
import {
  chmod,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises"
import { join } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"
import {
  getCapabilities,
  getImageDimensions,
  setCapabilities,
} from "@earendil-works/pi-tui"
import {
  holdFileRead,
  nativePi,
  retainedRequest,
  snapshotPath,
  waitFor,
} from "./test-support/native-pi.mjs"

// Two pixels: red, blue. The fixture is decoded by Pi's real image helpers.
const PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAADUlEQVR4nGP4zwAE/wEHAAH/4iOeWQAAAABJRU5ErkJggg=="
const BMP =
  "Qk06AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABABgAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAD/AA=="
const inputExtension = fileURLToPath(
  new URL("./test-support/image-input.ts", import.meta.url),
)

test("image previews identify current membership beside the native editor and other widgets", async (t) => {
  const caps = getCapabilities()
  setCapabilities({ ...caps, images: null })
  t.after(() => setCapabilities(caps))
  const host = await nativePi(t)
  const source = join(host.directory, "preview.png")
  await writeFile(source, Buffer.from(PNG, "base64"))
  host.ui.setEditorText("Review this picture")
  await host.runtime.session.prompt(`/attach-file ${source}`)
  const draft = host.ui.getEditorText()
  const path = snapshotPath(draft)
  await waitFor(() => assert.match(host.render(), /\[Image: preview\.png.*2x1/))
  assert.match(host.render(), /Attachments \(1\): preview\.png/)
  assert.match(host.render(), /Other extension widget/)
  assert.equal(host.ui.getEditorText(), draft)
  assert.equal((await readFile(path)).toString("base64"), PNG)

  host.ui.setEditorText("Review this picture")
  assert.doesNotMatch(host.render(), /\[Image:/)
  assert.match(host.render(), /Other extension widget/)
  assert.equal((await readFile(path)).toString("base64"), PNG)
})

test("native image-only submission sends the captured image after its source is changed and removed", async (t) => {
  const host = await nativePi(t)
  const source = join(host.directory, "picture.data")
  await writeFile(source, Buffer.from(PNG, "base64"))
  host.submit(`/attach-file ${source}`)
  const path = await waitFor(() => snapshotPath(host.ui.getEditorText()))
  const draft = host.ui.getEditorText().trim()
  assert.equal((await readFile(path)).toString("base64"), PNG)
  await writeFile(source, "Changed source")
  await rm(source)

  host.submit()
  await waitFor(() => assert.equal(host.requests.length, 1))
  const user = host.requests[0].messages.find(
    (message) => message.role === "user",
  )
  assert.deepEqual(user.content, [
    { type: "text", text: draft },
    { type: "image_url", image_url: { url: `data:image/png;base64,${PNG}` } },
  ])
  assert.equal((await readFile(path)).toString("base64"), PNG)
  await waitFor(() => assert.equal(host.runtime.session.isStreaming, false))
  assert.equal(host.ui.getEditorText(), "")
})

test("native image-only steering converts the captured image before queueing it for the intended request", async (t) => {
  const response = Promise.withResolvers()
  t.after(() => response.resolve())
  const host = await nativePi(t)
  host.replies.push(response.promise)
  host.submit("Hold the response")
  await waitFor(() => assert.equal(host.requests.length, 1))
  const source = join(host.directory, "steer.bmp")
  await writeFile(source, Buffer.from(BMP, "base64"))
  await host.runtime.session.prompt(`/attach-file ${source}`)
  const draft = host.ui.getEditorText().trim()
  const path = snapshotPath(draft)
  await rm(source)
  host.submit()
  await waitFor(() =>
    assert.equal(host.runtime.session.getSteeringMessages().length, 1),
  )
  host.ui.setEditorText("A later draft")
  response.resolve()
  await waitFor(() => assert.equal(host.requests.length, 2))
  const user = host.requests[1].messages.findLast(
    (message) => message.role === "user",
  )
  assert.equal(user.content[0].text, draft)
  assert.match(user.content[1].image_url.url, /^data:image\/png;base64,/)
  assert.deepEqual(
    getImageDimensions(
      user.content[1].image_url.url.split(",")[1],
      "image/png",
    ),
    { widthPx: 1, heightPx: 1 },
  )
  assert.equal(host.inputs.at(-1).source, "interactive")
  assert.equal(host.inputs.at(-1).streamingBehavior, "steer")
  assert.equal((await readFile(path)).toString("base64"), BMP)
  await waitFor(() => assert.equal(host.runtime.session.isStreaming, false))
  assert.equal(host.ui.getEditorText(), "A later draft")
})

test("native image-only follow-up resizes for the current model while retaining the original snapshot", async (t) => {
  const response = Promise.withResolvers()
  t.after(() => response.resolve())
  const host = await nativePi(t)
  await host.runtime.session.setModel({
    ...host.runtime.session.model,
    inputLimits: { images: { resize: { maxWidth: 1, maxHeight: 1 } } },
  })
  host.replies.push(response.promise)
  host.submit("Hold the response")
  await waitFor(() => assert.equal(host.requests.length, 1))
  const source = join(host.directory, "follow-up.png")
  await writeFile(source, Buffer.from(PNG, "base64"))
  await host.runtime.session.prompt(`/attach-file ${source}`)
  const draft = host.ui.getEditorText().trim()
  const path = snapshotPath(draft)
  host.input("\x1b\r")
  await waitFor(() =>
    assert.equal(host.runtime.session.getFollowUpMessages().length, 1),
  )
  host.ui.setEditorText("Keep this later draft")
  response.resolve()
  await waitFor(() => assert.equal(host.requests.length, 2))
  const user = host.requests[1].messages.findLast(
    (message) => message.role === "user",
  )
  const imageUrl = user.content[1].image_url.url
  const [, mimeType, data] = /^data:([^;]+);base64,(.+)$/.exec(imageUrl)
  assert.deepEqual(getImageDimensions(data, mimeType), {
    widthPx: 1,
    heightPx: 1,
  })
  assert.ok(user.content[0].text.startsWith(draft))
  assert.match(user.content[0].text, /original 2x1, displayed at 1x1/)
  assert.equal(host.inputs.at(-1).source, "interactive")
  assert.equal(host.inputs.at(-1).streamingBehavior, "followUp")
  assert.equal((await readFile(path)).toString("base64"), PNG)
  await waitFor(() => assert.equal(host.runtime.session.isStreaming, false))
  assert.equal(host.ui.getEditorText(), "Keep this later draft")
})

test("an image preparation failure stops native submission and retains a readable request after the editor clears", async (t) => {
  const host = await nativePi(t)
  const source = join(host.directory, "broken.png")
  const broken = Buffer.from(PNG, "base64").subarray(0, 33)
  await writeFile(source, broken)
  await host.runtime.session.prompt(`/attach-file ${source}`)
  const path = snapshotPath(host.ui.getEditorText())
  const draft = host.ui.getEditorText().trim()
  const sessionId = host.runtime.session.sessionId
  await rm(source)
  host.submit()
  await waitFor(() => assert.match(host.render(), /Image request not sent/))
  assert.equal(host.requests.length, 0)
  assert.equal(host.users.length, 0)
  assert.equal(host.ui.getEditorText(), "")
  const recovery = await retainedRequest(host)
  assert.ok(recovery.text.includes(sessionId))
  assert.ok(recovery.text.includes(draft))
  assert.deepEqual(await readFile(path), broken)
})

test("an image preview decode failure stays visible without removing its captured contents or membership", async (t) => {
  const host = await nativePi(t)
  const source = join(host.directory, "unrenderable.png")
  const broken = Buffer.from(PNG, "base64").subarray(0, 33)
  await writeFile(source, broken)
  await host.runtime.session.prompt(`/attach-file ${source}`)
  const draft = host.ui.getEditorText()
  const path = snapshotPath(draft)
  await waitFor(() =>
    assert.match(host.render(), /Preview unavailable: unrenderable\.png/),
  )
  assert.equal(host.ui.getEditorText(), draft)
  assert.deepEqual(await readFile(path), broken)
  assert.match(host.render(), /Attachments \(1\): unrenderable\.png/)
  assert.match(host.render(), /Other extension widget/)
})

test("native image delivery preserves earlier images, handler order, and unique snapshot membership", async (t) => {
  const host = await nativePi(
    t,
    [inputExtension],
    [
      (pi) =>
        pi.on("input", (event) => ({
          action: "transform",
          text: `${event.text}\nAfter attachments`,
        })),
    ],
  )
  const source = join(host.directory, "ordered.bmp")
  await writeFile(source, Buffer.from(BMP, "base64"))
  await host.runtime.session.prompt(`/attach-file ${source}`)
  const reference = host.ui.getEditorText().trim()
  const draft = `${reference}\n${reference}`
  host.submit(draft)
  await waitFor(() => assert.equal(host.requests.length, 1))
  const user = host.requests[0].messages.find(
    (message) => message.role === "user",
  )
  assert.equal(
    user.content[0].text,
    `Before attachments\n${draft}\nAfter attachments`,
  )
  assert.equal(user.content.length, 3)
  assert.equal(user.content[1].image_url.url, `data:image/png;base64,${PNG}`)
  const [, mimeType, data] = /^data:([^;]+);base64,(.+)$/.exec(
    user.content[2].image_url.url,
  )
  assert.deepEqual(getImageDimensions(data, mimeType), {
    widthPx: 1,
    heightPx: 1,
  })
  assert.deepEqual(host.inputs[0].images[0], {
    type: "image",
    data: PNG,
    mimeType: "image/png",
  })
  assert.equal(host.inputs[0].images.length, 2)
  await waitFor(() => assert.equal(host.runtime.session.isStreaming, false))
})

test("an earlier handled input keeps native precedence over attachment delivery", async (t) => {
  const host = await nativePi(t, [inputExtension])
  const source = join(host.directory, "handled.png")
  await writeFile(source, Buffer.from(PNG, "base64"))
  await host.runtime.session.prompt(`/attach-file ${source}`)
  const path = snapshotPath(host.ui.getEditorText())
  host.submit(`Handled here\n${host.ui.getEditorText()}`)
  await waitFor(() =>
    assert.match(host.render(), /Earlier input handler handled the request/),
  )
  assert.equal(host.inputs.length, 0)
  assert.equal(host.users.length, 0)
  assert.equal(host.requests.length, 0)
  assert.equal((await readFile(path)).toString("base64"), PNG)
})

test("image preparation failure retains incoming images as readable snapshots with the requesting draft", async (t) => {
  const host = await nativePi(t, [inputExtension])
  const source = join(host.directory, "broken-with-incoming.png")
  await writeFile(source, Buffer.from(PNG, "base64").subarray(0, 33))
  await host.runtime.session.prompt(`/attach-file ${source}`)
  const draft = host.ui.getEditorText().trim()
  host.submit()
  await waitFor(() => assert.match(host.render(), /Image request not sent/))
  assert.equal(host.requests.length, 0)
  const recovery = await retainedRequest(host)
  assert.ok(recovery.text.includes(`Before attachments\n${draft}`))
  const incoming = /\[Attachment: input-image-1\]\(<([^>]+)>\)/.exec(
    recovery.text,
  )
  assert.ok(
    incoming,
    "incoming native image is recoverable from the saved request",
  )
  assert.equal((await readFile(incoming[1])).toString("base64"), PNG)
})

test("a first-turn native auth failure preserves image request files without overwriting a newer draft", async (t) => {
  const host = await nativePi(t)
  const source = join(host.directory, "auth-failure.png")
  await writeFile(source, Buffer.from(PNG, "base64"))
  await host.runtime.session.prompt(`/attach-file ${source}`)
  const draft = host.ui.getEditorText().trim()
  const path = snapshotPath(draft)
  const sessionFile = host.runtime.session.sessionFile
  const modelsPath = join(host.agentDir, "models.json")
  const models = JSON.parse(await readFile(modelsPath, "utf8"))
  delete models.providers["attachment-test"].apiKey
  await writeFile(modelsPath, JSON.stringify(models))
  await host.runtime.services.modelRuntime.refresh()
  host.submit()
  host.ui.setEditorText("Newer draft remains mine")
  await waitFor(() => assert.match(host.render(), /No API key/))
  assert.equal(host.requests.length, 0)
  assert.equal(host.users.length, 0)
  assert.equal(host.ui.getEditorText(), "Newer draft remains mine")
  await assert.rejects(readFile(sessionFile), { code: "ENOENT" })
  const recovery = await retainedRequest(host)
  assert.ok(recovery.text.includes(draft))
  assert.equal((await readFile(path)).toString("base64"), PNG)
})

/* eslint-disable no-control-regex -- Verify the native terminal graphics protocol bytes. */
test("the native fullscreen widget emits small PNG graphics for converted image previews", async (t) => {
  const caps = getCapabilities()
  setCapabilities({ ...caps, images: "kitty" })
  t.after(() => setCapabilities(caps))
  const host = await nativePi(t)
  const source = join(host.directory, "graphics.bmp")
  await writeFile(source, Buffer.from(BMP, "base64"))
  await host.runtime.session.prompt(`/attach-file ${source}`)
  const path = snapshotPath(host.ui.getEditorText())
  await waitFor(() => {
    host.render()
    assert.match(host.output, /\x1b_Ga=T,f=100/)
  })
  const [, columns, rows, data] =
    /\x1b_Ga=T,f=100[^;]*,c=(\d+),r=(\d+)[^;]*;([^\x1b]+)/.exec(host.output)
  assert.ok(Number(columns) <= 24)
  assert.ok(Number(rows) <= 4)
  assert.deepEqual(getImageDimensions(data, "image/png"), {
    widthPx: 1,
    heightPx: 1,
  })
  assert.match(host.render(), /Other extension widget/)
  assert.equal((await readFile(path)).toString("base64"), BMP)
})
/* eslint-enable no-control-regex */

test("a delayed image preview cannot replace previews for the current draft", async (t) => {
  const host = await nativePi(t)
  const source = join(host.directory, "old.png")
  await writeFile(source, Buffer.from(PNG, "base64"))
  await host.runtime.session.prompt(`/attach-file ${source}`)
  const path = snapshotPath(host.ui.getEditorText())
  const held = holdFileRead(t, path)
  host.render()
  await held.started()
  host.ui.setEditorText("New draft")
  const newer = join(host.directory, "new.bmp")
  await writeFile(newer, Buffer.from(BMP, "base64"))
  await host.runtime.session.prompt(`/attach-file ${newer}`)
  const currentDraft = host.ui.getEditorText()
  await waitFor(() => assert.match(host.render(), /\[Image: new\.bmp/))
  held.release()
  await waitFor(() => assert.equal(host.ui.getEditorText(), currentDraft))
  assert.doesNotMatch(host.render(), /\[Image: old\.png/)
  assert.match(host.render(), /Attachments \(1\): new\.bmp/)
  assert.equal((await readFile(path)).toString("base64"), PNG)
})

test("delayed image delivery uses the submitted references while a newer draft is edited", async (t) => {
  const host = await nativePi(t)
  const source = join(host.directory, "submitted.png")
  await writeFile(source, Buffer.from(PNG, "base64"))
  await host.runtime.session.prompt(`/attach-file ${source}`)
  const draft = host.ui.getEditorText().trim()
  const path = snapshotPath(draft)
  const held = holdFileRead(t, path)
  host.submit()
  await held.started()
  host.ui.setEditorText("New draft during image preparation")
  held.release()
  await waitFor(() => assert.equal(host.requests.length, 1))
  const user = host.requests[0].messages.find(
    (message) => message.role === "user",
  )
  assert.equal(user.content[0].text, draft)
  assert.equal(user.content[1].image_url.url, `data:image/png;base64,${PNG}`)
  assert.equal(host.ui.getEditorText(), "New draft during image preparation")
  await waitFor(() => assert.equal(host.runtime.session.isStreaming, false))
})

test("a native session switch during image preparation retains the old request without sending into the new session", async (t) => {
  const host = await nativePi(
    t,
    [],
    [
      (pi) =>
        pi.registerCommand("new-test-session", {
          description: "Switch the native session during an image read",
          handler: async (_args, ctx) => {
            await ctx.newSession()
          },
        }),
    ],
  )
  const source = join(host.directory, "old-session.png")
  await writeFile(source, Buffer.from(PNG, "base64"))
  await host.runtime.session.prompt(`/attach-file ${source}`)
  const draft = host.ui.getEditorText().trim()
  const sessionId = host.runtime.session.sessionId
  const held = holdFileRead(t, snapshotPath(draft))
  host.submit()
  await held.started()
  await host.runtime.session.prompt("/new-test-session")
  host.ui.setEditorText("New session's draft")
  held.release()
  const recovery = await waitFor(() => retainedRequest(host))
  assert.ok(recovery.text.includes(sessionId))
  assert.ok(recovery.text.includes(draft))
  assert.notEqual(host.runtime.session.sessionId, sessionId)
  assert.equal(host.ui.getEditorText(), "New session's draft")
  assert.equal(host.requests.length, 0)
  assert.equal(host.users.length, 0)
  host.submit("A request in the new session")
  await waitFor(() => assert.equal(host.requests.length, 1))
  const user = host.requests[0].messages.find(
    (message) => message.role === "user",
  )
  assert.deepEqual(user.content, [
    { type: "text", text: "A request in the new session" },
  ])
  await waitFor(() => assert.equal(host.runtime.session.isStreaming, false))
})

for (const behavior of ["steer", "followUp"]) {
  test(`native dequeue and resubmit regenerates the image from a ${behavior} request`, async (t) => {
    const response = Promise.withResolvers()
    t.after(() => response.resolve())
    const host = await nativePi(t)
    host.replies.push(response.promise)
    host.submit("Hold the response")
    await waitFor(() => assert.equal(host.requests.length, 1))
    const source = join(host.directory, "dequeued.png")
    await writeFile(source, Buffer.from(PNG, "base64"))
    await host.runtime.session.prompt(`/attach-file ${source}`)
    const reference = host.ui.getEditorText().trim()
    host.input(behavior === "steer" ? "\r" : "\x1b\r")
    await waitFor(() =>
      assert.equal(
        host.runtime.session.getSteeringMessages().length +
          host.runtime.session.getFollowUpMessages().length,
        1,
      ),
    )
    await rm(source)
    host.ui.setEditorText("More context")
    host.input("\x1b[1;3A")
    await waitFor(() => assert.ok(host.ui.getEditorText().includes(reference)))
    assert.equal(
      host.runtime.session.getSteeringMessages().length +
        host.runtime.session.getFollowUpMessages().length,
      0,
    )
    response.resolve()
    await waitFor(() => assert.equal(host.runtime.session.isStreaming, false))
    assert.equal(host.requests.length, 1)
    host.submit()
    await waitFor(() => assert.equal(host.requests.length, 2))
    const user = host.requests[1].messages.findLast(
      (message) => message.role === "user",
    )
    assert.equal(user.content[0].text, `${reference}\n\nMore context`)
    assert.equal(user.content[1].image_url.url, `data:image/png;base64,${PNG}`)
    await waitFor(() => assert.equal(host.runtime.session.isStreaming, false))
  })
}

test("image recovery remains writable when the native session checkpoint cannot be written", async (t) => {
  const host = await nativePi(
    t,
    [],
    [
      (pi) =>
        pi.on("input", (event) => {
          if (event.text.includes("[Attachment:")) return { action: "handled" }
          return undefined
        }),
    ],
  )
  host.submit("Create a persisted session")
  await waitFor(() => assert.equal(host.requests.length, 1))
  await waitFor(() => assert.equal(host.runtime.session.isStreaming, false))
  const source = join(host.directory, "checkpoint.png")
  await writeFile(source, Buffer.from(PNG, "base64"))
  await host.runtime.session.prompt(`/attach-file ${source}`)
  const draft = host.ui.getEditorText().trim()
  const sessionFile = host.runtime.session.sessionFile
  await chmod(sessionFile, 0o400)
  try {
    host.submit()
    const recovery = await waitFor(() => retainedRequest(host))
    assert.ok(recovery.text.includes(draft))
    assert.equal(
      (await readFile(snapshotPath(recovery.text))).toString("base64"),
      PNG,
    )
    assert.equal(host.requests.length, 1)
  } finally {
    await chmod(sessionFile, 0o600)
  }
})

test("a failed image recovery write stops delivery and preserves incoming images in the live session", async (t) => {
  const host = await nativePi(t, [inputExtension])
  const source = join(host.directory, "disk-failure.bmp")
  await writeFile(source, Buffer.from(BMP, "base64"))
  await host.runtime.session.prompt(`/attach-file ${source}`)
  const draft = host.ui.getEditorText().trim()
  const path = snapshotPath(draft)
  const storage = join(host.agentDir, "pi-attachments")
  await chmod(storage, 0o500)
  try {
    host.submit()
    host.ui.setEditorText("Keep the new draft")
    await waitFor(() =>
      assert.match(host.render(), /Request retained in session memory/),
    )
    assert.equal(host.requests.length, 0)
    assert.equal(host.users.length, 0)
    assert.equal(host.ui.getEditorText(), "Keep the new draft")
    assert.equal((await readFile(path)).toString("base64"), BMP)
  } finally {
    await chmod(storage, 0o700)
  }
  host.submit("Persist the recovered session")
  await waitFor(() => assert.equal(host.requests.length, 1))
  await waitFor(() => assert.equal(host.runtime.session.isStreaming, false))
  const saved = await readFile(host.runtime.session.sessionFile, "utf8")
  assert.ok(saved.includes(draft))
  assert.ok(
    saved.includes(PNG),
    "incoming image bytes survive in the native session file",
  )
})

test("a provider rejection retains the image request and leaves later draft edits intact", async (t) => {
  const response = Promise.withResolvers()
  t.after(() => response.resolve())
  const host = await nativePi(t)
  const source = join(host.directory, "rejected.png")
  await writeFile(source, Buffer.from(PNG, "base64"))
  await host.runtime.session.prompt(`/attach-file ${source}`)
  const draft = host.ui.getEditorText().trim()
  host.replies.push(response.promise)
  host.submit()
  await waitFor(() => assert.equal(host.requests.length, 1))
  host.ui.setEditorText("Work started after submitting")
  response.resolve(new Error("Controlled image provider rejection"))
  await waitFor(() =>
    assert.match(host.render(), /Controlled image provider rejection/),
  )
  await waitFor(() => assert.equal(host.runtime.session.isStreaming, false))
  assert.equal(host.ui.getEditorText(), "Work started after submitting")
  const recovery = await retainedRequest(host)
  assert.ok(recovery.text.includes(draft))
  assert.equal(
    (await readFile(snapshotPath(recovery.text))).toString("base64"),
    PNG,
  )
})

test("composer image insertion, membership, undo, and redo use the same retained snapshot", async (t) => {
  const host = await nativePi(t, [
    fileURLToPath(new URL("../pi-composer/src/index.ts", import.meta.url)),
  ])
  const source = join(host.directory, "selection.png")
  await writeFile(source, Buffer.from(PNG, "base64"))
  host.ui.setEditorText("Keep draft")
  for (let index = 0; index < 5; index++) host.input("\x1b[1;2D")
  await host.runtime.session.prompt(`/attach-file ${source}`)
  const draft = host.ui.getEditorText()
  const path = snapshotPath(draft)
  assert.match(draft, /^Keep \n\[Attachment:/)
  await waitFor(() => assert.match(host.render(), /\[Image: selection\.png/))
  await rm(source)
  host.input("\x1b[122;9u")
  assert.equal(host.ui.getEditorText(), "Keep draft")
  assert.doesNotMatch(host.render(), /Attachments \(|\[Image:/)
  host.input("\x1b[122;10u")
  assert.equal(host.ui.getEditorText(), draft)
  assert.match(host.render(), /Attachments \(1\): selection\.png/)
  assert.equal((await readFile(path)).toString("base64"), PNG)
  host.submit()
  await waitFor(() => assert.equal(host.requests.length, 1))
  const user = host.requests[0].messages.find(
    (message) => message.role === "user",
  )
  assert.equal(user.content[1].image_url.url, `data:image/png;base64,${PNG}`)
  await waitFor(() => assert.equal(host.runtime.session.isStreaming, false))
})

test("a snapshot reference cannot deliver an image through a symlink outside retained storage", async (t) => {
  const host = await nativePi(t)
  const outside = join(host.directory, "outside.png")
  await writeFile(outside, Buffer.from(PNG, "base64"))
  const storage = join(host.agentDir, "pi-attachments")
  await mkdir(storage)
  const link = join(storage, "escape.png")
  await symlink(outside, link)
  host.submit(`[Attachment: escape.png](<${link}>)`)
  await waitFor(() => assert.match(host.render(), /Image request not sent/))
  assert.equal(host.requests.length, 0)
  assert.equal(host.users.length, 0)
  assert.equal((await readFile(outside)).toString("base64"), PNG)
})
