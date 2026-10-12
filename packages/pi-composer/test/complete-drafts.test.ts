import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import {
  chmod,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises"
import { join } from "node:path"
import { test } from "node:test"
import { promisify, stripVTControlCharacters } from "node:util"
import type { TUI } from "@earendil-works/pi-tui"
import { snapshotPath } from "../../pi-attachments/fixtures/native-pi.mjs"
import { openHost } from "../fixtures/host.ts"

const extensions = [
  new URL("../../pi-paste/src/index.ts", import.meta.url).pathname,
  new URL("../../pi-attachments/src/index.ts", import.meta.url).pathname,
]
const imageData =
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAADUlEQVR4nGP4zwAE/wEHAAH/4iOeWQAAAABJRU5ErkJggg=="

test("complete mixed drafts and their isolated histories survive cwd switches, reload, and fresh processes", async (t) => {
  let tui: TUI
  const host = await openHost(t, {
    persistSession: true,
    extensionPaths: extensions,
    extension(pi) {
      pi.on("session_start", (_event, ctx) => {
        ctx.ui.setWidget("complete-draft-observer", (nativeTui) => {
          tui = nativeTui
          return { render: () => [], invalidate() {} }
        })
      })
    },
  })
  const render = () => {
    host.terminal.output = ""
    tui.requestRender(true)
    tui.renderNow()
    return stripVTControlCharacters(host.terminal.output)
  }
  host.ui.setEditorText("Start session A")
  await host.key("\r")
  await host.settled()
  const sessionA = host.session.sessionFile!
  const cwdB = join(host.directory, "project-b")
  await mkdir(cwdB)
  const seed = await openHost(t, {
    directory: host.directory,
    cwd: cwdB,
    persistSession: true,
    extensionPaths: extensions,
  })
  seed.ui.setEditorText("Start session B")
  await seed.key("\r")
  await seed.settled()
  const sessionB = seed.session.sessionFile!
  await seed.close()

  host.ui.setEditorText(
    '## Review\n\n**Draft A** /skill:review @"source file.md"\n',
  )
  const text = `\tCaptured Markdown\r\n${"界 /skill:review\r\n".repeat(400)}\0\n`
  host.ui.pasteToEditor(text)
  const textPath = await t.waitFor(() => snapshotPath(host.ui.getEditorText()))
  assert.equal(await readFile(textPath, "utf8"), text)
  const beforeImage = host.ui.getEditorText()
  const image = join(host.directory, "image.png")
  await writeFile(image, Buffer.from(imageData, "base64"))
  await host.session.sendUserMessage(`/attach-file ${image}`, {
    expandPromptTemplates: true,
  })
  const draftA = host.ui.getEditorText()
  const imagePath = snapshotPath(draftA.slice(beforeImage.length))
  await rm(image)
  assert.match(render(), /Attachments \(2\): paste.txt, image.png/)
  await host.key("\x1b[122;9u")
  assert.equal(host.ui.getEditorText(), beforeImage)
  assert.match(render(), /Attachments \(1\): paste.txt/)
  await host.key("\x1b[122;10u")
  assert.equal(host.ui.getEditorText(), draftA)
  host.ui.pasteToEditor("A later edit")
  await host.key("\x1b[122;9u")

  await host.runtime.switchSession(sessionB)
  assert.equal(host.runtime.cwd, cwdB)
  assert.equal(host.ui.getEditorText(), "")
  await host.key("\x1b[122;10u")
  assert.equal(host.ui.getEditorText(), "")
  host.ui.setEditorText("Draft B /skill:review @src/b.ts\n")
  await host.session.sendUserMessage("/attach-text Captured B", {
    expandPromptTemplates: true,
  })
  const draftB = host.ui.getEditorText()
  const pathB = snapshotPath(draftB)
  host.ui.pasteToEditor("B later edit")
  assert.match(render(), /Attachments \(1\): text.txt/)

  await host.runtime.switchSession(sessionA)
  assert.equal(host.runtime.cwd, host.directory)
  assert.equal(host.ui.getEditorText(), draftA)
  assert.match(render(), /Attachments \(2\): paste.txt, image.png/)
  await host.session.reload()
  assert.equal(host.ui.getEditorText(), draftA)
  await host.key("\x1b[122;10u")
  assert.equal(host.ui.getEditorText(), `${draftA}A later edit`)
  await host.key("\x1b[122;9u")
  assert.equal(host.ui.getEditorText(), draftA)

  await host.runtime.switchSession(sessionB)
  assert.equal(host.runtime.cwd, cwdB)
  assert.equal(host.ui.getEditorText(), `${draftB}B later edit`)
  await host.key("\x1b[122;9u")
  assert.equal(host.ui.getEditorText(), draftB)
  await host.key("\x1b[122;10u")
  assert.equal(host.ui.getEditorText(), `${draftB}B later edit`)
  await host.close()

  const environment = { ...process.env }
  delete environment["NODE_TEST_CONTEXT"]
  const directory = join(host.directory, "pi-composer", "drafts")
  const checkpoints = await Promise.all(
    (await readdir(directory)).map(async (name) => ({
      path: join(directory, name),
      bytes: await readFile(join(directory, name)),
    })),
  )
  await chmod(directory, 0o000)
  try {
    await Promise.all(
      [
        {
          sessionFile: sessionA,
          cwd: host.directory,
          text: draftA,
          attachments: [
            { path: textPath, data: Buffer.from(text).toString("base64") },
            { path: imagePath, data: imageData },
          ],
        },
        {
          sessionFile: sessionB,
          cwd: cwdB,
          text: `${draftB}B later edit`,
          attachments: [
            { path: pathB, data: Buffer.from("Captured B").toString("base64") },
          ],
        },
      ].map((expected) =>
        promisify(execFile)(
          process.execPath,
          [
            new URL("../fixtures/restart-session.ts", import.meta.url).pathname,
            JSON.stringify({
              directory: host.directory,
              extensionPaths: extensions,
              recoveryReadError: true,
              ...expected,
            }),
          ],
          { env: environment },
        ),
      ),
    )
  } finally {
    await chmod(directory, 0o700)
  }
  await Promise.all(
    checkpoints.map(async ({ path, bytes }) => {
      assert.deepEqual(await readFile(path), bytes)
    }),
  )
  assert.equal(await readFile(textPath, "utf8"), text)
  assert.deepEqual(await readFile(imagePath), Buffer.from(imageData, "base64"))
  assert.equal(await readFile(pathB, "utf8"), "Captured B")
})

test("native forks restore mixed membership and restart independently of their parent", async (t) => {
  const host = await openHost(t, {
    persistSession: true,
    extensionPaths: extensions,
  })
  host.ui.setEditorText("Earlier request")
  await host.key("\r")
  await host.settled()
  const parent = host.session.sessionFile!
  const parentId = host.session.sessionManager.getSessionId()
  const image = join(host.directory, "forked.png")
  await writeFile(image, Buffer.from(imageData, "base64"))
  host.ui.setEditorText(
    "## Forked draft\n\n**Review** /skill:review @source.ts\n",
  )
  await host.session.sendUserMessage("/attach-text Captured fork text", {
    expandPromptTemplates: true,
  })
  const textPath = snapshotPath(host.ui.getEditorText())
  const beforeImage = host.ui.getEditorText()
  await host.session.sendUserMessage(`/attach-file ${image}`, {
    expandPromptTemplates: true,
  })
  const draft = host.ui.getEditorText().trim()
  const imagePath = snapshotPath(
    host.ui.getEditorText().slice(beforeImage.length),
  )
  await rm(image)
  await host.key("\x1b[13;9u")
  await t.waitFor(() => assert.equal(host.requests.length, 2))
  await host.settled()
  host.ui.setEditorText("Later unsent parent work")
  await host.type(" plus edit")
  await host.key("\x1b[122;9u")
  host.ui.setEditorText("/fork")
  await host.key("\r")
  await t.waitFor(async () =>
    assert.match(await host.output(), /Fork from Message/),
  )
  await host.key("\r")
  await t.waitFor(async () =>
    assert.match(await host.output(), /Forked to new session/),
  )
  const child = host.session.sessionFile!
  assert.notEqual(host.session.sessionManager.getSessionId(), parentId)
  assert.equal(host.ui.getEditorText(), draft)
  assert.match(await host.output(), /Attachments \(2\): text.txt, forked.png/)
  await host.key("\x1b[122;9u")
  assert.equal(host.ui.getEditorText(), "")
  await host.key("\x1b[122;9u")
  assert.equal(host.ui.getEditorText(), "")
  await host.key("\x1b[122;10u")
  assert.equal(host.ui.getEditorText(), draft)
  await host.close()
  await rm(parent)

  const environment = { ...process.env }
  delete environment["NODE_TEST_CONTEXT"]
  await promisify(execFile)(
    process.execPath,
    [
      new URL("../fixtures/restart-session.ts", import.meta.url).pathname,
      JSON.stringify({
        directory: host.directory,
        sessionFile: child,
        text: draft,
        extensionPaths: extensions,
        attachments: [
          {
            path: textPath,
            data: Buffer.from("Captured fork text").toString("base64"),
          },
          { path: imagePath, data: imageData },
        ],
      }),
    ],
    { env: environment },
  )
})
