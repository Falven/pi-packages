/* eslint-disable no-control-regex -- Inspect native terminal frames and mouse coordinates. */
import assert from "node:assert/strict"
import childProcess from "node:child_process"
import {
  chmod,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises"
import { syncBuiltinESMExports } from "node:module"
import { join } from "node:path"
import { test } from "node:test"
import { fileURLToPath, pathToFileURL } from "node:url"
import { promisify, stripVTControlCharacters } from "node:util"
import {
  getCapabilities,
  getImageDimensions,
  getOsc8LinkAtColumn,
  setCapabilities,
} from "@earendil-works/pi-tui"
import {
  assertAttachments,
  holdFileRead,
  nativePi,
  retainedRequest,
  snapshotPath,
  waitFor,
} from "../fixtures/native-pi.mjs"

// Two pixels: red, blue. The fixture is decoded by Pi's real image helpers.
const PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAADUlEQVR4nGP4zwAE/wEHAAH/4iOeWQAAAABJRU5ErkJggg=="
const BMP =
  "Qk06AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABABgAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAD/AA=="
const TALL_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAACCAIAAAAW4yFwAAAADUlEQVR4nGP4zwAC/wEIAAH/2ZC7NQAAAABJRU5ErkJggg=="
const inputExtension = fileURLToPath(
  new URL("../fixtures/image-input.ts", import.meta.url),
)
const composerPath = fileURLToPath(
  new URL("../../pi-composer/src/index.ts", import.meta.url),
)

async function chooseThumbnailSize(host, size) {
  const labels = { small: "Small", medium: "Medium", large: "Large" }
  const pending = host.runtime.session.prompt("/attachments")
  await waitFor(() => assert.match(host.render(), /Settings/))
  host.input("\x1b[A")
  host.input("\r")
  await waitFor(() => assert.match(host.render(), /Attachment thumbnail size/))
  for (let attempt = 0; attempt < 3; attempt++) {
    if (host.render().includes(labels[size])) break
    host.input("\r")
  }
  assert.ok(host.render().includes(labels[size]))
  host.input("\x1b")
  await pending
}

for (const [name, extensions] of [
  ["native", []],
  ["composer", [composerPath]],
]) {
  test(`${name} preview follows effective image visibility without changing its snapshot`, async (t) => {
    const caps = getCapabilities()
    setCapabilities({ ...caps, images: "kitty" })
    t.after(() => setCapabilities(caps))
    const host = await nativePi(t, extensions, {
      settings: { terminal: { showImages: false } },
    })
    const source = join(host.directory, "hidden.png")
    await writeFile(source, Buffer.from(PNG, "base64"))
    await host.attachFile(source)
    const draft = host.ui.getEditorText()
    const path = snapshotPath(draft)
    await waitFor(() => assert.match(host.render(), /\[Image: hidden\.png/))
    assert.doesNotMatch(host.output, /\x1b_Ga=p/)
    host.runtime.session.settingsManager.applyOverrides({
      terminal: { showImages: true },
    })
    await waitFor(() => {
      host.render()
      assert.match(host.output, /\x1b_Ga=p/)
    })
    assert.equal(host.ui.getEditorText(), draft)
    assert.equal((await readFile(path)).toString("base64"), PNG)
  })
}

test("image previews link retained files through native click handling beside the editor and other widgets", async (t) => {
  const caps = getCapabilities()
  setCapabilities({ ...caps, images: "kitty", hyperlinks: true })
  t.after(() => setCapabilities(caps))
  const host = await nativePi(t)
  setCapabilities({ ...caps, images: null, hyperlinks: true })
  const name = "preview % # 界.png"
  const source = join(host.directory, name)
  await writeFile(source, Buffer.from(PNG, "base64"))
  host.ui.setEditorText("Review this picture")
  await host.attachFile(source)
  const draft = host.ui.getEditorText()
  const path = snapshotPath(draft)
  const target = pathToFileURL(path).href.replace(
    /^file:\/\/\//,
    "file://localhost/",
  )
  await waitFor(() =>
    assert.ok(host.render().includes(`[Image: ${name} [image/png] 2x1]`)),
  )
  assert.doesNotMatch(host.render(), /Attachments \(1\):/)
  assert.match(host.render(), /Manage attachments/)
  assert.match(host.render(), /Other extension widget/)
  assert.equal(host.ui.getEditorText(), draft)
  assert.equal((await readFile(path)).toString("base64"), PNG)
  host.input("\x1b[97;7u")
  await waitFor(() => assert.match(host.render(), /Choose attachment/))
  assert.ok(host.render().includes(name))
  host.input("\x1b")
  await waitFor(() => assert.doesNotMatch(host.render(), /Choose attachment/))
  assert.equal(host.ui.getEditorText(), draft)
  assert.equal(host.requests.length, 0)
  await rm(source)

  const spawn = t.mock.method(
    childProcess,
    "spawn",
    () => new childProcess.ChildProcess(),
  )
  syncBuiltinESMExports()
  t.after(() => {
    spawn.mock.restore()
    syncBuiltinESMExports()
  })
  const rows = () => {
    host.render()
    return [
      ...host.output.matchAll(
        /\x1b\[(\d+);1H\x1b\[2K(.*?)(?=\x1b\[\d+;\d+H|$)/gs,
      ),
    ].map((match) => ({ row: Number(match[1]), line: match[2] }))
  }
  const click = (column, row) => {
    const before = spawn.mock.callCount()
    host.input(`\x1b[<0;${column + 1};${row}M`)
    host.input(`\x1b[<0;${column + 1};${row}m`)
    assert.equal(spawn.mock.callCount(), before + 1)
    assert.equal(spawn.mock.calls.at(-1).arguments[1].at(-1), target)
    assert.equal(host.ui.getEditorText(), draft)
  }
  const hint = rows().find(({ line }) =>
    stripVTControlCharacters(line).includes("Manage attachments"),
  )
  assert.ok(hint)
  assert.equal(getOsc8LinkAtColumn(hint.line, 0), undefined)
  const fallback = rows().find(({ line }) =>
    stripVTControlCharacters(line).includes("[Image:"),
  )
  assert.ok(fallback)
  assert.equal(getOsc8LinkAtColumn(fallback.line, 0), target)
  click(0, fallback.row)

  setCapabilities({ ...caps, images: "kitty", hyperlinks: true })
  host.resize(60, 40)
  assert.ok(rows().some(({ line }) => line.includes("\x1b_G")))
  host.resize(22, 40)
  const thumbnails = rows().filter(
    ({ line }) =>
      line.includes("\x1b_G") ||
      (!stripVTControlCharacters(line).trim() &&
        getOsc8LinkAtColumn(line, 0) === target),
  )
  assert.ok(thumbnails.length > 0 && thumbnails.length <= 4)
  for (const { line } of thumbnails) {
    assert.equal(getOsc8LinkAtColumn(line, 0), target)
    assert.equal(getOsc8LinkAtColumn(line, 19), target)
    assert.equal(getOsc8LinkAtColumn(line, 20), undefined)
  }
  click(0, thumbnails.at(-1).row)
  assert.equal((await readFile(path)).toString("base64"), PNG)

  setCapabilities({ ...caps, images: "kitty", hyperlinks: false })
  host.render()
  assert.ok(!host.output.includes(target))
  setCapabilities({ ...caps, images: "kitty", hyperlinks: true })
  host.resize(100, 30)
  host.input("!")
  assert.equal(host.ui.getEditorText(), `${draft}!`)

  host.ui.setEditorText("Review this picture")
  assert.doesNotMatch(host.render(), /\[Image:/)
  assert.ok(!host.output.includes(target))
  assert.match(host.render(), /Other extension widget/)
  assert.equal((await readFile(path)).toString("base64"), PNG)
})

test("native image-only submission sends the captured image after its source is changed and removed", async (t) => {
  const host = await nativePi(t)
  const source = join(host.directory, "picture.data")
  await writeFile(source, Buffer.from(PNG, "base64"))
  await host.attachFile(source)
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

test("native submission keeps original attachment dimensions when effective auto-resize is off", async (t) => {
  const host = await nativePi(t, [], {
    settings: { images: { autoResize: true } },
  })
  await host.runtime.session.setModel({
    ...host.runtime.session.model,
    inputLimits: { images: { resize: { maxWidth: 1, maxHeight: 1 } } },
  })
  const source = join(host.directory, "unresized.png")
  await writeFile(source, Buffer.from(PNG, "base64"))
  await host.attachFile(source)
  const path = snapshotPath(host.ui.getEditorText())
  host.runtime.session.settingsManager.applyOverrides({
    images: { autoResize: false },
  })
  host.submit()
  await waitFor(() => assert.equal(host.requests.length, 1))
  const user = host.requests[0].messages.find(
    (message) => message.role === "user",
  )
  assert.equal(user.content[1].image_url.url, `data:image/png;base64,${PNG}`)
  assert.doesNotMatch(user.content[0].text, /displayed at/)
  assert.equal((await readFile(path)).toString("base64"), PNG)
})

test("native image-only steering converts the captured image before queueing the intended request", async (t) => {
  const response = Promise.withResolvers()
  t.after(() => response.resolve())
  const host = await nativePi(t)
  host.replies.push(response.promise)
  host.submit("Hold the response")
  await waitFor(() => assert.equal(host.requests.length, 1))
  const source = join(host.directory, "steer.bmp")
  await writeFile(source, Buffer.from(BMP, "base64"))
  await host.attachFile(source)
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
  await host.attachFile(source)
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
  await host.attachFile(source)
  const path = snapshotPath(host.ui.getEditorText())
  const draft = host.ui.getEditorText().trim()
  const sessionId = host.runtime.session.sessionId
  await rm(source)
  host.submit()
  await waitFor(() => assert.match(host.render(), /Image request not sent/))
  assert.equal(host.requests.length, 0)
  assert.equal(host.users.length, 0)
  assert.equal(host.ui.getEditorText(), "")
  const recovery = await retainedRequest(host, "Delivery:")
  assert.ok(recovery.text.includes(sessionId))
  assert.ok(recovery.text.includes(draft))
  assert.deepEqual(await readFile(path), broken)
})

test("an image preview decode failure stays visible without removing its captured contents or membership", async (t) => {
  const host = await nativePi(t)
  const source = join(host.directory, "unrenderable.png")
  const broken = Buffer.from(PNG, "base64").subarray(0, 33)
  await writeFile(source, broken)
  await host.attachFile(source)
  const draft = host.ui.getEditorText()
  const path = snapshotPath(draft)
  await waitFor(() =>
    assert.match(host.render(), /Preview unavailable: unrenderable\.png/),
  )
  assert.equal(host.ui.getEditorText(), draft)
  assert.deepEqual(await readFile(path), broken)
  assertAttachments(host.ui.getEditorText(), host.render(), [
    "unrenderable.png",
  ])
  assert.match(host.render(), /Other extension widget/)
})

test("native image delivery preserves earlier images, handler order, and unique snapshot membership", async (t) => {
  const host = await nativePi(t, [inputExtension], {
    settings: { images: { autoResize: false } },
    extensionFactories: [
      (pi) =>
        pi.on("input", (event) => ({
          action: "transform",
          text: `${event.text}\nAfter attachments`,
        })),
    ],
  })
  const source = join(host.directory, "ordered.bmp")
  await writeFile(source, Buffer.from(BMP, "base64"))
  await host.attachFile(source)
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
  await host.attachFile(source)
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
  await host.attachFile(source)
  const draft = host.ui.getEditorText().trim()
  host.submit()
  await waitFor(() => assert.match(host.render(), /Image request not sent/))
  assert.equal(host.requests.length, 0)
  const recovery = await retainedRequest(host, "Delivery:")
  assert.ok(recovery.text.includes(`Before attachments\n${draft}`))
  const incoming = /\[Attachment: input-image-1\.png\]\(<([^>]+)>\)/.exec(
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
  await host.attachFile(source)
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
  const recovery = await retainedRequest(host, "Delivery:")
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
  await host.attachFile(source)
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

test("effective image width caps native preview graphics without recapturing the attachment", async (t) => {
  const caps = getCapabilities()
  setCapabilities({ ...caps, images: "kitty" })
  t.after(() => setCapabilities(caps))
  const host = await nativePi(t, [], {
    settings: { terminal: { imageWidthCells: 2 } },
  })
  const bytes = await readFile(new URL("../fixtures/wide.png", import.meta.url))
  const source = join(host.directory, "wide.png")
  await writeFile(source, bytes)
  await host.attachFile(source)
  const draft = host.ui.getEditorText()
  const path = snapshotPath(draft)
  const dimensions = () => {
    host.render()
    const match = /\x1b_Ga=p,[^;]*c=(\d+),r=(\d+)/.exec(host.output)
    assert.ok(match, "native preview emitted image graphics")
    return { columns: Number(match[1]), rows: Number(match[2]) }
  }
  const narrow = await waitFor(() => dimensions())
  assert.ok(narrow.columns <= 2)
  assert.ok(narrow.rows <= 4)
  host.runtime.session.settingsManager.applyOverrides({
    terminal: { imageWidthCells: 8 },
  })
  const wider = await waitFor(() => {
    const next = dimensions()
    assert.ok(next.columns > narrow.columns)
    return next
  })
  assert.ok(wider.columns <= 8)
  assert.ok(wider.rows <= 4)
  assert.equal(host.ui.getEditorText(), draft)
  assert.deepEqual(await readFile(path), bytes)
})

test("attachment management offers native thumbnail settings for an empty draft", async (t) => {
  const host = await nativePi(t)
  const pending = host.runtime.session.prompt("/attachments")
  await waitFor(() => assert.match(host.render(), /Manage attachments/))
  assert.match(host.render(), /Settings/)
  host.input("\r")
  await waitFor(() => assert.match(host.render(), /Attachment thumbnail size/))
  assert.match(host.render(), /Medium/)
  host.input("\r")
  assert.match(host.render(), /Large/)
  host.input(" ")
  assert.match(host.render(), /Small/)
  host.input("\x1b")
  await pending
  assert.equal(host.ui.getEditorText(), "")
  host.input("After settings")
  assert.equal(host.ui.getEditorText(), "After settings")
  assert.equal(host.requests.length, 0)
})

test("attachment thumbnail settings persist and reread manual edits on reload", async (t) => {
  const host = await nativePi(t)
  async function settings() {
    const pending = host.runtime.session.prompt("/attachments")
    await waitFor(() => assert.match(host.render(), /Manage attachments/))
    host.input("\r")
    await waitFor(() =>
      assert.match(host.render(), /Attachment thumbnail size/),
    )
    return { pending }
  }
  let dialog = await settings()
  host.input("\r")
  host.input("\x1b")
  await dialog.pending
  await host.runtime.session.reload()
  dialog = await settings()
  assert.match(host.render(), /Large/)
  host.input("\x1b")
  await dialog.pending

  await writeFile(
    join(host.agentDir, "pi-attachments.json"),
    JSON.stringify({ thumbnailSize: "small" }),
  )
  dialog = await settings()
  assert.match(host.render(), /Large/)
  host.input("\x1b")
  await dialog.pending
  await host.runtime.session.reload()
  dialog = await settings()
  assert.match(host.render(), /Small/)
  host.input("\x1b")
  await dialog.pending
  assert.equal(host.ui.getEditorText(), "")
  await host.close()
  await promisify(childProcess.execFile)(
    process.execPath,
    [
      fileURLToPath(
        new URL("../fixtures/restart-settings.mjs", import.meta.url),
      ),
      JSON.stringify({ directory: host.directory, thumbnailSize: "Small" }),
    ],
    { timeout: 30_000 },
  )
})

test("attachment thumbnail migration retains the saved user preference without rewriting Pi settings", async (t) => {
  const host = await nativePi(t)
  const legacyPath = join(host.agentDir, "settings.json")
  const original = JSON.stringify({
    editorPaddingX: 3,
    extensionSettings: {
      "pi-attachments.thumbnailSize": "large",
      "another.preference": "unchanged",
    },
  })
  await writeFile(legacyPath, original)
  await host.runtime.session.reload()
  let pending = host.runtime.session.prompt("/attachments")
  await waitFor(() => assert.match(host.render(), /Settings/))
  host.input("\r")
  await waitFor(() => assert.match(host.render(), /Attachment thumbnail size/))
  assert.match(host.render(), /Large/)
  host.input("\x1b")
  await pending
  assert.equal(await readFile(legacyPath, "utf8"), original)
  assert.deepEqual(
    JSON.parse(
      await readFile(join(host.agentDir, "pi-attachments.json"), "utf8"),
    ),
    { thumbnailSize: "large" },
  )
  await writeFile(
    legacyPath,
    JSON.stringify({
      extensionSettings: { "pi-attachments.thumbnailSize": "small" },
    }),
  )
  await host.runtime.session.reload()
  pending = host.runtime.session.prompt("/attachments")
  await waitFor(() => assert.match(host.render(), /Settings/))
  host.input("\r")
  await waitFor(() => assert.match(host.render(), /Attachment thumbnail size/))
  assert.match(host.render(), /Large/)
  host.input("\x1b")
  await pending
})

test("a failed thumbnail settings save reports the error and retains the saved choice", async (t) => {
  const host = await nativePi(t)
  await chooseThumbnailSize(host, "large")
  await chmod(host.agentDir, 0o500)
  try {
    const pending = host.runtime.session.prompt("/attachments")
    await waitFor(() => assert.match(host.render(), /Settings/))
    host.input("\r")
    await waitFor(() =>
      assert.match(host.render(), /Attachment thumbnail size/),
    )
    host.input("\r")
    assert.match(host.render(), /Large/)
    host.input("\x1b")
    await pending
    assert.match(host.render(), /Could not save attachment settings/)
  } finally {
    await chmod(host.agentDir, 0o700)
  }
  await host.runtime.session.reload()
  const pending = host.runtime.session.prompt("/attachments")
  await waitFor(() => assert.match(host.render(), /Settings/))
  host.input("\r")
  await waitFor(() => assert.match(host.render(), /Attachment thumbnail size/))
  assert.match(host.render(), /Large/)
  host.input("\x1b")
  await pending
})

for (const [saved, error] of [
  ["{", /Could not read attachment settings/],
  ["null", /Expected a settings object/],
  [JSON.stringify({ thumbnailSize: "huge" }), /Invalid thumbnail size/],
]) {
  test(`invalid attachment thumbnail settings fail explicitly: ${saved}`, async (t) => {
    const host = await nativePi(t)
    await host.close()
    await writeFile(join(host.agentDir, "pi-attachments.json"), saved)
    await assert.rejects(nativePi(t, [], { directory: host.directory }), error)
    assert.equal(
      await readFile(join(host.agentDir, "pi-attachments.json"), "utf8"),
      saved,
    )
  })
}

test("invalid legacy thumbnail settings are not overwritten during migration", async (t) => {
  const host = await nativePi(t)
  await host.close()
  const legacyPath = join(host.agentDir, "settings.json")
  const saved = JSON.stringify({
    extensionSettings: { "pi-attachments.thumbnailSize": false },
  })
  await writeFile(legacyPath, saved)
  await assert.rejects(
    nativePi(t, [], { directory: host.directory }),
    /Invalid thumbnail size/,
  )
  assert.equal(await readFile(legacyPath, "utf8"), saved)
  await assert.rejects(readFile(join(host.agentDir, "pi-attachments.json")), {
    code: "ENOENT",
  })
})

for (const [shape, image, expected] of [
  ["wide", PNG, { small: [8, 2], medium: [16, 4], large: [32, 8] }],
  ["tall", TALL_PNG, { small: [2, 2], medium: [4, 4], large: [8, 8] }],
]) {
  test(`${shape} native thumbnails follow the effective size and width ceilings without changing the snapshot`, async (t) => {
    const caps = getCapabilities()
    setCapabilities({ ...caps, images: "kitty" })
    t.after(() => setCapabilities(caps))
    const host = await nativePi(t, [], {
      settings: { images: { autoResize: false } },
    })
    const source = join(host.directory, `${shape}.png`)
    const bytes = Buffer.from(image, "base64")
    await writeFile(source, bytes)
    await host.attachFile(source)
    const draft = host.ui.getEditorText()
    const path = snapshotPath(draft)
    const dimensions = () => {
      host.render()
      const match = /\x1b_Ga=p,[^;]*c=(\d+),r=(\d+)/.exec(host.output)
      assert.ok(match, "native preview emitted image graphics")
      return [Number(match[1]), Number(match[2])]
    }

    assert.deepEqual(await waitFor(dimensions), expected.medium)
    for (const size of ["small", "large", "medium"]) {
      // eslint-disable-next-line no-await-in-loop -- Each choice changes the same native dialog.
      await chooseThumbnailSize(host, size)
      // eslint-disable-next-line no-await-in-loop -- Each selection changes the same live view.
      assert.deepEqual(await waitFor(dimensions), expected[size])
    }
    await chooseThumbnailSize(host, "large")
    host.runtime.session.settingsManager.applyOverrides({
      terminal: { imageWidthCells: 6 },
    })
    assert.ok((await waitFor(dimensions))[0] <= 6)
    host.runtime.session.settingsManager.applyOverrides({
      terminal: { imageWidthCells: 60 },
    })
    host.resize(14, 40)
    for (const size of ["small", "medium", "large"]) {
      host.resize(100, 40)
      // eslint-disable-next-line no-await-in-loop -- Each choice changes the same native dialog.
      await chooseThumbnailSize(host, size)
      host.resize(14, 40)
      // eslint-disable-next-line no-await-in-loop -- Each selection changes the same live view.
      await waitFor(() => {
        const [columns, rows] = dimensions()
        assert.ok(columns <= Math.min(14, expected[size][0]))
        assert.ok(rows <= expected[size][1])
      })
    }
    assert.equal(host.ui.getEditorText(), draft)
    assert.deepEqual(await readFile(path), bytes)
  })
}
/* eslint-enable no-control-regex */

test("a delayed image preview cannot replace previews for the current draft", async (t) => {
  const host = await nativePi(t)
  const source = join(host.directory, "old.png")
  await writeFile(source, Buffer.from(PNG, "base64"))
  await host.attachFile(source)
  const path = snapshotPath(host.ui.getEditorText())
  const held = holdFileRead(t, path)
  host.render()
  await held.started()
  host.ui.setEditorText("New draft")
  const newer = join(host.directory, "new.bmp")
  await writeFile(newer, Buffer.from(BMP, "base64"))
  await host.attachFile(newer)
  const currentDraft = host.ui.getEditorText()
  await waitFor(() => assert.match(host.render(), /\[Image: new\.bmp/))
  held.release()
  await waitFor(() => assert.equal(host.ui.getEditorText(), currentDraft))
  assert.doesNotMatch(host.render(), /\[Image: old\.png/)
  assertAttachments(host.ui.getEditorText(), host.render(), ["new.bmp"])
  assert.equal((await readFile(path)).toString("base64"), PNG)
})

test("delayed image delivery uses the submitted references while a newer draft is edited", async (t) => {
  const host = await nativePi(t)
  const source = join(host.directory, "submitted.png")
  await writeFile(source, Buffer.from(PNG, "base64"))
  await host.attachFile(source)
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
  const recordedSessions = []
  const host = await nativePi(t, [], {
    extensionFactories: [
      (pi) => {
        pi.registerCommand("new-test-session", {
          description: "Switch the native session during an image read",
          handler: async (_args, ctx) => {
            await ctx.newSession()
          },
        })
        pi.on("message_end", (event, ctx) => {
          if (event.message.role === "user")
            recordedSessions.push(ctx.sessionManager.getSessionId())
        })
      },
    ],
  })
  const source = join(host.directory, "old-session.png")
  await writeFile(source, Buffer.from(PNG, "base64"))
  await host.attachFile(source)
  const draft = host.ui.getEditorText().trim()
  const sessionId = host.runtime.session.sessionId
  const held = holdFileRead(t, snapshotPath(draft))
  host.submit()
  await held.started()
  const switching = host.runtime.session.prompt("/new-test-session")
  held.release()
  await switching
  host.ui.setEditorText("New session's draft")
  const recovery = await waitFor(() => retainedRequest(host, "Delivery:"))
  assert.ok(recovery.text.includes(sessionId))
  assert.ok(recovery.text.includes(draft))
  assert.notEqual(host.runtime.session.sessionId, sessionId)
  assert.equal(host.ui.getEditorText(), "New session's draft")
  assert.equal(host.requests.length, 0)
  assert.deepEqual(recordedSessions, [sessionId])
  assert.equal(host.users[0].content[0].text, draft)
  assert.equal(
    host.runtime.session.messages.filter((message) => message.role === "user")
      .length,
    0,
  )
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
    await host.attachFile(source)
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
  const host = await nativePi(t, [], {
    extensionFactories: [
      (pi) =>
        pi.on("input", (event) => {
          if (event.text.includes("[Attachment:")) return { action: "handled" }
          return undefined
        }),
    ],
  })
  host.submit("Create a persisted session")
  await waitFor(() => assert.equal(host.requests.length, 1))
  await waitFor(() => assert.equal(host.runtime.session.isStreaming, false))
  const source = join(host.directory, "checkpoint.png")
  await writeFile(source, Buffer.from(PNG, "base64"))
  await host.attachFile(source)
  const draft = host.ui.getEditorText().trim()
  const sessionFile = host.runtime.session.sessionFile
  await chmod(sessionFile, 0o400)
  try {
    host.submit()
    const recovery = await waitFor(() => retainedRequest(host, "Delivery:"))
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
  await host.attachFile(source)
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
  await waitFor(() => assert.match(host.render(), /Request saved:/))
  const saved = await readFile(host.runtime.session.sessionFile, "utf8")
  assert.ok(saved.includes(draft))
  assert.ok(
    saved.includes(PNG),
    "incoming image bytes survive in the native session file",
  )
})

test("failed image recovery and native append are durably retried in an already-written session", async (t) => {
  const host = await nativePi(t, [inputExtension])
  host.submit("Start a persisted session")
  await waitFor(() => assert.equal(host.requests.length, 1))
  await waitFor(() => assert.equal(host.runtime.session.isStreaming, false))
  const sessionId = host.runtime.session.sessionManager.getSessionId()
  const sessionFile = host.runtime.session.sessionFile
  await readFile(sessionFile)

  const source = join(host.directory, "retry.bmp")
  await writeFile(source, Buffer.from(BMP, "base64"))
  await host.attachFile(source)
  const draft = host.ui.getEditorText()
  const snapshot = snapshotPath(draft)
  const storage = join(host.agentDir, "pi-attachments")
  await chmod(storage, 0o500)
  await chmod(sessionFile, 0o400)
  try {
    host.submit()
    host.ui.setEditorText("Later work after both writes failed")
    await waitFor(() =>
      assert.match(host.render(), /Could not checkpoint the request/),
    )
    assert.equal(host.requests.length, 1)
    assert.equal(host.ui.getEditorText(), "Later work after both writes failed")
    assert.equal((await readFile(snapshot)).toString("base64"), BMP)
    assert.ok(!(await readFile(sessionFile, "utf8")).includes(PNG))
  } finally {
    await chmod(storage, 0o700)
    await chmod(sessionFile, 0o600)
  }

  host.submit("A later ordinary request")
  host.ui.setEditorText("Unrelated current draft")
  await waitFor(() => assert.equal(host.requests.length, 2))
  await waitFor(() => assert.equal(host.runtime.session.isStreaming, false))
  const recovery = await waitFor(() => retainedRequest(host, "Delivery:"))
  assert.ok(recovery.text.includes(sessionId))
  assert.ok(recovery.text.includes(sessionFile))
  assert.ok(recovery.text.includes(`Before attachments\n${draft.trim()}`))
  const incoming = recovery.text.match(
    /\[Attachment: input-image-1\.png\]\(<([^>]+)>\)/,
  )?.[1]
  assert.ok(incoming, "The retried request must expose its incoming image")
  assert.equal((await readFile(incoming)).toString("base64"), PNG)
  assert.equal((await readFile(snapshot)).toString("base64"), BMP)
  assert.equal(host.ui.getEditorText(), "Unrelated current draft")
  await host.runtime.session.reload()
  assert.equal(await readFile(recovery.path, "utf8"), recovery.text)
  assert.equal((await readFile(incoming)).toString("base64"), PNG)
})

test("a provider rejection retains the image request and leaves later draft edits intact", async (t) => {
  const response = Promise.withResolvers()
  t.after(() => response.resolve())
  const host = await nativePi(t)
  const source = join(host.directory, "rejected.png")
  await writeFile(source, Buffer.from(PNG, "base64"))
  await host.attachFile(source)
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
  const recovery = await retainedRequest(host, "Delivery:")
  assert.ok(recovery.text.includes(draft))
  assert.equal(
    (await readFile(snapshotPath(recovery.text))).toString("base64"),
    PNG,
  )
})

test("composer image insertion, membership, undo, and redo use the same retained snapshot", async (t) => {
  const host = await nativePi(t, [
    fileURLToPath(new URL("../../pi-composer/src/index.ts", import.meta.url)),
  ])
  const source = join(host.directory, "selection.png")
  await writeFile(source, Buffer.from(PNG, "base64"))
  host.ui.setEditorText("Keep draft")
  for (let index = 0; index < 5; index++) host.input("\x1b[1;2D")
  await host.attachFile(source)
  const draft = host.ui.getEditorText()
  const path = snapshotPath(draft)
  assert.match(draft, /^Keep \n\[Attachment:/)
  await waitFor(() => assert.match(host.render(), /\[Image: selection\.png/))
  await rm(source)
  host.input("\x1b[122;9u")
  assert.equal(host.ui.getEditorText(), "Keep draft")
  assert.doesNotMatch(host.render(), /Manage attachments|\[Image:/)
  host.input("\x1b[122;10u")
  assert.equal(host.ui.getEditorText(), draft)
  assertAttachments(host.ui.getEditorText(), host.render(), ["selection.png"])
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
