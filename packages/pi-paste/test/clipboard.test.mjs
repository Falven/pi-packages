import assert from "node:assert/strict"
import fs, { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { syncBuiltinESMExports } from "node:module"
import { basename, join } from "node:path"
import { beforeEach, test } from "node:test"
import { fileURLToPath } from "node:url"
import { getNativeClipboard } from "@earendil-works/pi-tui"
import { CustomEditor } from "@earendil-works/pi-coding-agent"
import { openHost } from "../../pi-composer/fixtures/host.ts"
import piAttachments from "../../pi-attachments/src/index.ts"
import piPaste from "../src/index.ts"
import {
  nativePi,
  retainedRequest,
  snapshotPath,
  waitFor,
} from "../../pi-attachments/fixtures/native-pi.mjs"

const pastePath = fileURLToPath(new URL("../src/index.ts", import.meta.url))
const composerPath = fileURLToPath(
  new URL("../../pi-composer/src/index.ts", import.meta.url),
)
const PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAADUlEQVR4nGP4zwAE/wEHAAH/4iOeWQAAAABJRU5ErkJggg=="

beforeEach((t) => {
  const clipboard = getNativeClipboard()
  assert.ok(clipboard?.getFilePaths)
  t.mock.method(clipboard, "getFilePaths", async () => null)
  t.mock.method(clipboard, "getImage", async () => null)
  t.mock.method(clipboard, "getText", async () => null)
})

test("native copied files win over their icon and text as one paste with preserved names", async (t) => {
  const clipboard = getNativeClipboard()
  assert.ok(
    clipboard?.getFilePaths,
    "Pi must supply native copied-file identity",
  )
  const host = await nativePi(t, [pastePath])
  const names = ["Résumé 你好 notes.txt", "Résumé 你好 notes.txt"]
  const directories = [
    join(host.directory, "first"),
    join(host.directory, "second"),
  ]
  await Promise.all(directories.map((directory) => mkdir(directory)))
  const sources = names.map((name, index) => join(directories[index], name))
  await writeFile(sources[0], "Captured first file")
  await writeFile(sources[1], "Captured second file")
  t.mock.method(clipboard, "getFilePaths", async () => sources)
  t.mock.method(clipboard, "getImage", async () => Buffer.from(PNG, "base64"))
  t.mock.method(clipboard, "getText", async () => "Unrelated accompanying text")
  host.ui.setEditorText("Review these files")
  host.input("\x16")
  const paths = await waitFor(() => {
    const references = host.ui
      .getEditorText()
      .split("\n")
      .filter((line) => line.startsWith("[Attachment:"))
    assert.equal(references.length, 2)
    return references.map(snapshotPath)
  })
  assert.deepEqual(
    paths.map((path) => basename(path)),
    names,
  )
  assert.deepEqual(
    await Promise.all(paths.map((path) => readFile(path, "utf8"))),
    ["Captured first file", "Captured second file"],
  )
  assert.match(
    host.render(),
    /Attachments \(2\): Résumé 你好 notes\.txt, Résumé 你好 notes\.txt/,
  )
  assert.doesNotMatch(host.render(), /\[Image:/)
  assert.equal(host.requests.length, 0)
})

test("composer Command+V reads original file identity and replaces its selection with one undoable attachment", async (t) => {
  const clipboard = getNativeClipboard()
  assert.ok(clipboard?.getFilePaths)
  const host = await nativePi(t, [composerPath, pastePath])
  const source = join(host.directory, "Command file.txt")
  await writeFile(source, "Command snapshot")
  t.mock.method(clipboard, "getFilePaths", async () => [source])
  t.mock.method(clipboard, "getImage", async () => Buffer.from(PNG, "base64"))
  t.mock.method(clipboard, "getText", async () => source)
  host.ui.setEditorText("Keep selected")
  for (let index = 0; index < 8; index++) host.input("\x1b[1;2D")
  host.input("\x1b[118;9u")
  const path = await waitFor(() => snapshotPath(host.ui.getEditorText()))
  assert.match(host.ui.getEditorText(), /^Keep \n\[Attachment:/)
  assert.equal(await readFile(path, "utf8"), "Command snapshot")
  host.input("\x1b[122;9u")
  assert.equal(host.ui.getEditorText(), "Keep selected")
  assert.doesNotMatch(host.render(), /Attachments \(/)
  host.input("\x1b[122;10u")
  assert.equal(snapshotPath(host.ui.getEditorText()), path)
})

test("an image-only native paste has an attachment preview and delivers the captured image", async (t) => {
  const clipboard = getNativeClipboard()
  t.mock.method(clipboard, "getImage", async () => Buffer.from(PNG, "base64"))
  t.mock.method(clipboard, "getText", async () => "Ignore accompanying text")
  const host = await nativePi(t, [pastePath])
  host.input("\x16")
  const path = await waitFor(() => snapshotPath(host.ui.getEditorText()))
  assert.equal((await readFile(path)).toString("base64"), PNG)
  await waitFor(() => assert.match(host.render(), /\[Image: .*2x1/))
  const draft = host.ui.getEditorText().trim()
  host.submit()
  await waitFor(() => assert.equal(host.requests.length, 1))
  const user = host.requests[0].messages.find(({ role }) => role === "user")
  assert.deepEqual(user.content, [
    { type: "text", text: draft },
    { type: "image_url", image_url: { url: `data:image/png;base64,${PNG}` } },
  ])
  await waitFor(() => assert.equal(host.runtime.session.isStreaming, false))
})

test("a copied file set whose references exceed the text cutoff stays one image-bearing draft edit", async (t) => {
  const host = await nativePi(t, [composerPath, pastePath])
  const sources = Array.from({ length: 18 }, (_, index) =>
    join(host.directory, `${index}-${"Long file name ".repeat(8)}.png`),
  )
  await Promise.all(
    sources.map((source) => writeFile(source, Buffer.from(PNG, "base64"))),
  )
  t.mock.method(getNativeClipboard(), "getFilePaths", async () => sources)
  host.ui.setEditorText("Keep selected")
  for (let index = 0; index < 8; index++) host.input("\x1b[1;2D")
  host.input("\x1b[118;9u")
  const draft = await waitFor(() => {
    const text = host.ui.getEditorText()
    assert.equal(text.match(/\[Attachment:/g)?.length, 18)
    return text
  })
  assert.ok(draft.length > 5000)
  assert.match(draft, /^Keep \n\[Attachment:/)
  host.input("\x1b[122;9u")
  assert.equal(host.ui.getEditorText(), "Keep selected")
  assert.doesNotMatch(host.render(), /Attachments \(/)
  host.input("\x1b[122;10u")
  assert.equal(host.ui.getEditorText(), draft)
  host.submit()
  await waitFor(() => assert.equal(host.requests.length, 1))
  const user = host.requests[0].messages.find(({ role }) => role === "user")
  assert.equal(user.content[0].text, draft.trim())
  assert.equal(
    user.content.filter(({ type }) => type === "image_url").length,
    18,
  )
  await waitFor(() => assert.equal(host.runtime.session.isStreaming, false))
})

test("native copied paths preserve surrounding spaces and quotes through the attachment action", async (t) => {
  const host = await nativePi(t, [pastePath])
  const directory = join(host.directory, "資料 folder")
  await mkdir(directory)
  const name = ' Résumé "quoted" notes.txt '
  const source = join(directory, name)
  await writeFile(source, "Exact path identity")
  t.mock.method(getNativeClipboard(), "getFilePaths", async () => [source])
  host.input("\x16")
  const path = await waitFor(() => snapshotPath(host.ui.getEditorText()))
  assert.equal(basename(path), name)
  assert.equal(await readFile(path, "utf8"), "Exact path identity")
})

test("a failed staging write retains all copied bytes across reload even if the original files disappear", async (t) => {
  const host = await nativePi(t, [composerPath, pastePath])
  const sources = [
    join(host.directory, "first.txt"),
    join(host.directory, "second.png"),
  ]
  await writeFile(sources[0], "Retained copied text")
  await writeFile(sources[1], Buffer.from(PNG, "base64"))
  t.mock.method(getNativeClipboard(), "getFilePaths", async () => sources)
  const storage = join(host.agentDir, "pi-paste")
  await mkdir(storage)
  await chmod(storage, 0o500)
  const sessionId = host.runtime.session.sessionManager.getSessionId()
  host.ui.setEditorText("Original file draft")
  try {
    host.input("\x1b[118;9u")
    await waitFor(() => assert.match(host.render(), /Could not preserve paste/))
    assert.equal(host.ui.getEditorText(), "Original file draft")
    await Promise.all(sources.map((source) => rm(source)))
    await host.runtime.session.reload()
    host.ui.setEditorText("Later draft")
  } finally {
    await chmod(storage, 0o700)
  }
  await host.runtime.session.prompt("/paste-recover")
  const recovery = await retainedRequest(host, sessionId, "Paste")
  assert.match(recovery.text, /Original file draft/)
  assert.doesNotMatch(recovery.text, /Later draft/)
  const paths = recovery.text
    .split("\n")
    .filter((line) => line.startsWith("Paste: "))
    .map((line) => line.slice(7))
  assert.equal(await readFile(paths[0], "utf8"), "Retained copied text")
  assert.equal((await readFile(paths[1])).toString("base64"), PNG)
  assert.equal(host.ui.getEditorText(), "Later draft")
  assert.equal(host.requests.length, 0)
})

test("invalid native image bytes report a recoverable error without replacing the selection or pasting text", async (t) => {
  const bytes = Buffer.from("Invalid clipboard image bytes")
  const clipboard = getNativeClipboard()
  t.mock.method(clipboard, "getImage", async () => bytes)
  t.mock.method(clipboard, "getText", async () => "Do not fall through")
  const host = await nativePi(t, [composerPath, pastePath])
  host.ui.setEditorText("Keep selected")
  for (let index = 0; index < 8; index++) host.input("\x1b[1;2D")
  host.input("\x1b[118;9u")
  await waitFor(() =>
    assert.match(host.render(), /Clipboard image format is unsupported/),
  )
  assert.equal(host.ui.getEditorText(), "Keep selected")
  const recovery = await retainedRequest(host, "Keep selected", "Paste")
  const path = recovery.text
    .split("\n")
    .find((line) => line.startsWith("Paste: "))
    .slice(7)
  assert.deepEqual(await readFile(path), bytes)
  host.input("!")
  assert.equal(host.ui.getEditorText(), "Keep !")
  assert.equal(host.requests.length, 0)
})

for (const composer of [false, true]) {
  for (const kind of ["files", "image", "text"]) {
    test(`${composer ? "composer" : "native"} fullscreen right-click preserves clipboard ${kind} identity`, async (t) => {
      const host = await nativePi(t, [
        ...(composer ? [composerPath] : []),
        pastePath,
      ])
      const source = join(host.directory, "Clipboard path 你好.txt")
      await writeFile(source, "Copied file body")
      const clipboard = getNativeClipboard()
      t.mock.method(clipboard, "getFilePaths", async () =>
        kind === "files" ? [source] : null,
      )
      t.mock.method(clipboard, "getImage", async () =>
        kind === "text" ? null : Buffer.from(PNG, "base64"),
      )
      t.mock.method(clipboard, "getText", async () => source)
      host.ui.setEditorText("Draft ")
      host.render()
      host.input("\x1b[<2;10;27M")
      host.input("\x1b[<2;10;27m")
      if (kind === "text") {
        await waitFor(() =>
          assert.equal(host.ui.getEditorText(), `Draft ${source}`),
        )
        assert.doesNotMatch(host.render(), /Attachments \(/)
      } else {
        const path = await waitFor(() => snapshotPath(host.ui.getEditorText()))
        if (kind === "files") {
          assert.equal(basename(path), "Clipboard path 你好.txt")
          assert.equal(await readFile(path, "utf8"), "Copied file body")
        } else {
          assert.equal((await readFile(path)).toString("base64"), PNG)
          await waitFor(() => assert.match(host.render(), /\[Image: .*2x1/))
        }
      }
    })
  }

  for (const method of ["getFilePaths", "getImage", "getText"]) {
    test(`${composer ? "composer Command+V" : "native clipboard"} surfaces ${method} errors without falling through`, async (t) => {
      const clipboard = getNativeClipboard()
      if (method === "getFilePaths")
        t.mock.method(clipboard, "getImage", async () =>
          Buffer.from(PNG, "base64"),
        )
      t.mock.method(
        clipboard,
        "getText",
        async () => "Never insert fallback text",
      )
      t.mock.method(clipboard, method, async () => {
        throw new Error(`${method} transfer failed`)
      })
      const host = await nativePi(t, [
        ...(composer ? [composerPath] : []),
        pastePath,
      ])
      host.ui.setEditorText("Keep selected")
      if (composer)
        for (let index = 0; index < 8; index++) host.input("\x1b[1;2D")
      host.input(composer ? "\x1b[118;9u" : "\x16")
      await waitFor(() =>
        assert.ok(host.render().includes(`${method} transfer failed`)),
      )
      assert.equal(host.ui.getEditorText(), "Keep selected")
      assert.doesNotMatch(host.render(), /Attachments \(/)
      if (composer) {
        host.input("!")
        assert.equal(host.ui.getEditorText(), "Keep !")
      }
    })
  }
}

for (const target of [
  "missing",
  "directory",
  "unreadable",
  "control character",
]) {
  test(`a copied ${target} target preserves the whole draft and reports the error`, async (t) => {
    const host = await nativePi(t, [composerPath, pastePath])
    const first = join(host.directory, "Retained file.txt")
    let second = join(host.directory, "Invalid target")
    await writeFile(first, "Recoverable first file")
    if (target === "directory") await mkdir(second)
    if (target === "unreadable") {
      await writeFile(second, "Unreadable file")
      await chmod(second, 0o000)
    }
    if (target === "control character") second += "\nInjected path"
    const clipboard = getNativeClipboard()
    t.mock.method(clipboard, "getFilePaths", async () => [first, second])
    t.mock.method(clipboard, "getImage", async () => Buffer.from(PNG, "base64"))
    t.mock.method(clipboard, "getText", async () => "Do not substitute text")
    host.ui.setEditorText("Keep selected")
    for (let index = 0; index < 8; index++) host.input("\x1b[1;2D")
    host.input("\x1b[118;9u")
    await waitFor(() =>
      assert.match(host.render(), /Could not (?:paste|preserve paste)/),
    )
    assert.equal(host.ui.getEditorText(), "Keep selected")
    assert.doesNotMatch(host.render(), /Attachments \(/)
    host.input("!")
    assert.equal(host.ui.getEditorText(), "Keep !")
    assert.equal(host.requests.length, 0)
  })
}

test("Attach File accepts a user-entered list of paths as one native attachment action", async (t) => {
  const host = await nativePi(t)
  const first = join(host.directory, "First user file.txt")
  const second = join(host.directory, "Second user file 你好.txt")
  await writeFile(first, "First user body")
  await writeFile(second, "Second user body")
  host.submit(`/attach-file ${first}\n${second}`)
  const paths = await waitFor(() => {
    const references = host.ui
      .getEditorText()
      .split("\n")
      .filter((line) => line.startsWith("[Attachment:"))
    assert.equal(references.length, 2)
    return references.map(snapshotPath)
  })
  assert.deepEqual(
    await Promise.all(paths.map((path) => readFile(path, "utf8"))),
    ["First user body", "Second user body"],
  )
  assert.match(host.render(), /Attachments \(2\)/)
  assert.equal(host.requests.length, 0)
})

for (const kind of ["files", "image"]) {
  for (const change of ["selection", "edit", "session"]) {
    test(`a delayed ${kind} clipboard read retains its original request when the ${change} changes`, async (t) => {
      const gate = Promise.withResolvers()
      const started = Promise.withResolvers()
      t.after(() => gate.resolve(null))
      t.mock.method(
        getNativeClipboard(),
        kind === "files" ? "getFilePaths" : "getImage",
        () => {
          started.resolve()
          return gate.promise
        },
      )
      const host = await nativePi(t, [composerPath, pastePath])
      const sources = [
        join(host.directory, "first.txt"),
        join(host.directory, "second.png"),
      ]
      await writeFile(sources[0], "Original copied file")
      await writeFile(sources[1], Buffer.from(PNG, "base64"))
      const sessionId = host.runtime.session.sessionManager.getSessionId()
      host.ui.setEditorText("Keep selected")
      for (let index = 0; index < 8; index++) host.input("\x1b[1;2D")
      host.input("\x1b[118;9u")
      await started.promise
      assert.equal(host.ui.getEditorText(), "Keep selected")
      if (change === "session") await host.runtime.newSession()
      if (change === "selection") host.input("\x1b[1;2C")
      else host.ui.setEditorText("Later draft")
      gate.resolve(kind === "files" ? sources : Buffer.from(PNG, "base64"))
      const recovery = await waitFor(() =>
        retainedRequest(host, sessionId, "Paste"),
      )
      assert.match(recovery.text, /Keep selected/)
      assert.doesNotMatch(recovery.text, /Later draft/)
      const paths = recovery.text
        .split("\n")
        .filter((line) => line.startsWith("Paste: "))
        .map((line) => line.slice(7))
      assert.equal(paths.length, kind === "files" ? 2 : 1)
      if (kind === "files")
        assert.equal(await readFile(paths[0], "utf8"), "Original copied file")
      assert.equal((await readFile(paths.at(-1))).toString("base64"), PNG)
      assert.equal(
        host.ui.getEditorText(),
        change === "selection" ? "Keep selected" : "Later draft",
      )
      assert.doesNotMatch(host.render(), /Attachments \(/)
      if (change === "selection") {
        host.input("!")
        assert.equal(host.ui.getEditorText(), "Keep s!")
      }
      assert.equal(host.requests.length, 0)
    })
  }
}

for (const behavior of ["steer", "followUp"]) {
  for (const kind of ["files", "image"]) {
    test(`${kind} paste follows native ${behavior} delivery and leaves the later draft intact`, async (t) => {
      const response = Promise.withResolvers()
      t.after(() => response.resolve())
      const host = await nativePi(t, [
        ...(behavior === "followUp" ? [composerPath] : []),
        pastePath,
      ])
      const sources = [
        join(host.directory, "Context notes.txt"),
        join(host.directory, "Visual context.png"),
      ]
      await writeFile(sources[0], "Read this file on demand")
      await writeFile(sources[1], Buffer.from(PNG, "base64"))
      const clipboard = getNativeClipboard()
      t.mock.method(clipboard, "getFilePaths", async () =>
        kind === "files" ? sources : null,
      )
      t.mock.method(clipboard, "getImage", async () =>
        Buffer.from(PNG, "base64"),
      )
      host.replies.push(response.promise)
      host.submit("Hold the response")
      await waitFor(() => assert.equal(host.requests.length, 1))
      host.ui.setEditorText("Use this context")
      host.input(behavior === "followUp" ? "\x1b[118;9u" : "\x16")
      const draft = await waitFor(() => {
        const text = host.ui.getEditorText()
        assert.equal(
          text.match(/\[Attachment:/g)?.length,
          kind === "files" ? 2 : 1,
        )
        return text.trim()
      })
      await Promise.all(sources.map((source) => rm(source)))
      host.input(behavior === "followUp" ? "\x1b\r" : "\r")
      await waitFor(() =>
        assert.equal(
          (behavior === "followUp"
            ? host.runtime.session.getFollowUpMessages()
            : host.runtime.session.getSteeringMessages()
          ).length,
          1,
        ),
      )
      host.ui.setEditorText("A later draft")
      response.resolve()
      await waitFor(() => assert.equal(host.requests.length, 2))
      const user = host.requests[1].messages.findLast(
        ({ role }) => role === "user",
      )
      assert.deepEqual(user.content, [
        { type: "text", text: draft },
        {
          type: "image_url",
          image_url: { url: `data:image/png;base64,${PNG}` },
        },
      ])
      assert.equal(host.inputs.at(-1).streamingBehavior, behavior)
      await waitFor(() => assert.equal(host.runtime.session.isStreaming, false))
      assert.equal(host.ui.getEditorText(), "A later draft")
    })
  }
}

test("a copied file set deferred during settlement cannot attach any part to a later draft", async (t) => {
  const gate = Promise.withResolvers()
  let settling = false
  t.after(() => gate.resolve())
  const host = await openHost(t, {
    extension(pi) {
      pi.on("agent_settled", async () => {
        settling = true
        await gate.promise
      })
      piAttachments(pi)
      piPaste(pi)
    },
  })
  const sources = [
    join(host.directory, "First deferred.txt"),
    join(host.directory, "Second deferred.png"),
  ]
  await writeFile(sources[0], "Deferred file set")
  await writeFile(sources[1], Buffer.from(PNG, "base64"))
  t.mock.method(getNativeClipboard(), "getFilePaths", async () => sources)
  host.ui.setEditorText("Initial prompt")
  await host.key("\r")
  await waitFor(() => assert.ok(settling))
  host.ui.setEditorText("Requesting file draft")
  await host.key("\x1b[118;9u")
  const recovery = await waitFor(() =>
    retainedRequest(
      { agentDir: host.directory },
      "Requesting file draft",
      "Paste",
    ),
  )
  await host.output()
  host.ui.setEditorText("Later draft")
  gate.resolve()
  await waitFor(async () =>
    assert.match(await host.output(), /Could not attach/),
  )
  assert.equal(host.ui.getEditorText(), "Later draft")
  const paths = recovery.text
    .split("\n")
    .filter((line) => line.startsWith("Paste: "))
    .map((line) => line.slice(7))
  assert.equal(paths.length, 2)
  assert.equal(await readFile(paths[0], "utf8"), "Deferred file set")
  assert.equal((await readFile(paths[1])).toString("base64"), PNG)
  assert.equal(host.requests.length, 1)
})

for (const priority of [
  "terminal",
  "extension",
  "application",
  "clipboard handler",
]) {
  test(`Command+V preserves the earlier native ${priority} action`, async (t) => {
    t.mock.method(getNativeClipboard(), "getFilePaths", async () => {
      throw new Error("Unexpected clipboard read")
    })
    const host = await openHost(t, {
      ...(priority === "application"
        ? { keybindings: { "app.clear": "super+v" } }
        : {}),
      extension(pi) {
        if (priority === "extension")
          pi.registerShortcut("super+v", {
            handler: (ctx) => ctx.ui.setEditorText("Earlier action"),
          })
        pi.on("session_start", (_event, ctx) => {
          if (priority === "terminal")
            ctx.ui.onTerminalInput((data) => {
              if (data === "\x1b[118;9u") {
                ctx.ui.setEditorText("Earlier action")
                return { consume: true }
              }
            })
          if (priority === "clipboard handler")
            ctx.ui.setEditorComponent((...args) => {
              const editor = new CustomEditor(...args)
              editor.onPasteImage = () => editor.setText("Earlier action")
              return editor
            })
        })
        piPaste(pi)
      },
    })
    host.ui.setEditorText("Original draft")
    await host.key("\x1b[118;9u")
    assert.equal(
      host.ui.getEditorText(),
      priority === "application" ? "" : "Earlier action",
    )
    assert.doesNotMatch(await host.output(), /Unexpected clipboard read/)
  })
}

test("Paste Inline bypasses file/image classification and measures no attachment cutoff", async (t) => {
  const clipboard = getNativeClipboard()
  t.mock.method(clipboard, "getFilePaths", async () => {
    throw new Error("Must not classify files")
  })
  t.mock.method(clipboard, "getImage", async () => {
    throw new Error("Must not classify images")
  })
  const text = "\t".repeat(5001)
  t.mock.method(clipboard, "getText", async () => text)
  const host = await nativePi(t, [composerPath, pastePath])
  host.ui.setEditorText("Keep selected")
  for (let index = 0; index < 8; index++) host.input("\x1b[1;2D")
  host.input("\x1b[118;7u")
  await waitFor(() => assert.equal(host.ui.getEditorText(), `Keep ${text}`))
  assert.doesNotMatch(host.render(), /Attachments \(/)
  host.input("\x1b[122;9u")
  assert.equal(host.ui.getEditorText(), "Keep selected")
})

for (const kind of ["files", "image"]) {
  test(`unavailable attachment handling retains the ${kind} paste without changing its selection`, async (t) => {
    const host = await openHost(t, { extension: piPaste })
    const source = join(host.directory, "Copied context.png")
    await writeFile(source, Buffer.from(PNG, "base64"))
    const clipboard = getNativeClipboard()
    t.mock.method(clipboard, "getFilePaths", async () =>
      kind === "files" ? [source] : null,
    )
    t.mock.method(clipboard, "getImage", async () => Buffer.from(PNG, "base64"))
    host.ui.setEditorText("Keep selected")
    await host.key("\x1b[1;4D")
    await host.key("\x1b[118;9u")
    await waitFor(async () =>
      assert.match(await host.output(), /Attach File is unavailable/),
    )
    assert.equal(host.ui.getEditorText(), "Keep selected")
    const recovery = await retainedRequest(
      { agentDir: host.directory },
      "Keep selected",
      "Paste",
    )
    const path = recovery.text
      .split("\n")
      .find((line) => line.startsWith("Paste: "))
      .slice(7)
    assert.equal((await readFile(path)).toString("base64"), PNG)
    await host.type("!")
    assert.equal(host.ui.getEditorText(), "Keep !")
    assert.equal(host.requests.length, 0)
  })
}

test("a failed snapshot save retries the whole copied set from captured bytes in one edit", async (t) => {
  const host = await nativePi(t, [composerPath, pastePath])
  const sources = [
    join(host.directory, "Retry text.txt"),
    join(host.directory, "Retry image.png"),
  ]
  await writeFile(sources[0], "Retry both files")
  await writeFile(sources[1], Buffer.from(PNG, "base64"))
  t.mock.method(getNativeClipboard(), "getFilePaths", async () => sources)
  const storage = join(host.agentDir, "pi-attachments")
  await mkdir(storage)
  await chmod(storage, 0o500)
  host.ui.setEditorText("Keep selected")
  for (let index = 0; index < 8; index++) host.input("\x1b[1;2D")
  try {
    host.input("\x1b[118;9u")
    await waitFor(() => assert.match(host.render(), /Retry save/))
    assert.equal(host.ui.getEditorText(), "Keep selected")
    const recovery = await retainedRequest(host, "Keep selected", "Paste")
    assert.equal(recovery.text.match(/^Paste: /gm)?.length, 2)
    await Promise.all(sources.map((source) => rm(source)))
  } finally {
    await chmod(storage, 0o700)
  }
  host.input("\r")
  const paths = await waitFor(() => {
    const references = host.ui
      .getEditorText()
      .split("\n")
      .filter((line) => line.startsWith("[Attachment:"))
    assert.equal(references.length, 2)
    return references.map(snapshotPath)
  })
  assert.equal(await readFile(paths[0], "utf8"), "Retry both files")
  assert.equal((await readFile(paths[1])).toString("base64"), PNG)
  host.input("\x1b[122;9u")
  assert.equal(host.ui.getEditorText(), "Keep selected")
  assert.doesNotMatch(host.render(), /Attachments \(/)
})

test("image recovery remains available when its read and storage failure arrive after session replacement and reload", async (t) => {
  const gate = Promise.withResolvers()
  const started = Promise.withResolvers()
  t.after(() => gate.resolve(null))
  t.mock.method(getNativeClipboard(), "getImage", () => {
    started.resolve()
    return gate.promise
  })
  const host = await nativePi(t, [composerPath, pastePath])
  const storage = join(host.agentDir, "pi-paste")
  await mkdir(storage)
  await chmod(storage, 0o500)
  const sessionId = host.runtime.session.sessionManager.getSessionId()
  host.ui.setEditorText("Outgoing image draft")
  try {
    host.input("\x1b[118;9u")
    await started.promise
    await host.runtime.newSession()
    await host.runtime.session.reload()
    host.ui.setEditorText("Live session draft")
    await host.runtime.session.prompt("/paste-recover")
    assert.match(host.render(), /No unsaved pastes/)
    gate.resolve(Buffer.from(PNG, "base64"))
    await waitFor(async () => {
      await host.runtime.session.prompt("/paste-recover")
      assert.match(host.render(), /Could not preserve paste/)
    })
  } finally {
    await chmod(storage, 0o700)
  }
  await host.runtime.session.prompt("/paste-recover")
  const recovery = await retainedRequest(host, sessionId, "Paste")
  assert.match(recovery.text, /Outgoing image draft/)
  assert.doesNotMatch(recovery.text, /Live session draft/)
  const path = recovery.text
    .split("\n")
    .find((line) => line.startsWith("Paste: "))
    .slice(7)
  assert.equal((await readFile(path)).toString("base64"), PNG)
  assert.equal(host.ui.getEditorText(), "Live session draft")
})

test("an older copied-file read cannot replace a newer image paste", async (t) => {
  const gate = Promise.withResolvers()
  const started = Promise.withResolvers()
  let first = true
  t.after(() => gate.resolve(null))
  const clipboard = getNativeClipboard()
  t.mock.method(clipboard, "getFilePaths", () => {
    if (!first) return Promise.resolve(null)
    first = false
    started.resolve()
    return gate.promise
  })
  t.mock.method(clipboard, "getImage", async () => Buffer.from(PNG, "base64"))
  const host = await nativePi(t, [composerPath, pastePath])
  const source = join(host.directory, "Older file.txt")
  await writeFile(source, "Older copied file")
  host.ui.setEditorText("Original draft")
  host.input("\x1b[118;9u")
  await started.promise
  host.input("\x1b[118;9u")
  const newerImage = await waitFor(() => snapshotPath(host.ui.getEditorText()))
  const newerDraft = host.ui.getEditorText()
  gate.resolve([source])
  await waitFor(() => assert.match(host.render(), /Paste retained/))
  const recovery = await retainedRequest(host, "Older file.txt", "Paste")
  assert.match(recovery.text, /Original draft/)
  assert.ok(!recovery.text.includes(newerImage))
  const path = recovery.text
    .split("\n")
    .find((line) => line.startsWith("Paste: "))
    .slice(7)
  assert.equal(await readFile(path, "utf8"), "Older copied file")
  assert.equal(host.ui.getEditorText(), newerDraft)
  assert.equal((await readFile(newerImage)).toString("base64"), PNG)
})

for (const files of [null, undefined, []]) {
  test(`native clipboard text stays text when copied-file identity is ${JSON.stringify(files)}`, async (t) => {
    const clipboard = getNativeClipboard()
    t.mock.method(clipboard, "getFilePaths", async () => files)
    t.mock.method(clipboard, "getImage", async () => undefined)
    t.mock.method(clipboard, "getText", async () => "/tmp/Plain path 你好.txt")
    const host = await nativePi(t, [pastePath])
    host.ui.setEditorText("Draft ")
    host.input("\x16")
    await waitFor(() =>
      assert.equal(host.ui.getEditorText(), "Draft /tmp/Plain path 你好.txt"),
    )
    assert.doesNotMatch(host.render(), /Attachments \(/)
  })
}

for (const phase of ["staging", "snapshot"]) {
  for (const change of ["none", "selection", "edit", "session"]) {
    test(`a delayed ${phase} write keeps the entire copied set with its target (${change})`, async (t) => {
      const gate = Promise.withResolvers()
      let started = false
      t.after(() => gate.resolve())
      const host = await nativePi(t, [composerPath, pastePath])
      const sources = [
        join(host.directory, "first.txt"),
        join(host.directory, "second.png"),
      ]
      await writeFile(sources[0], "Whole copied set")
      await writeFile(sources[1], Buffer.from(PNG, "base64"))
      t.mock.method(getNativeClipboard(), "getFilePaths", async () => sources)
      const storage = join(
        host.agentDir,
        phase === "staging" ? "pi-paste" : "pi-attachments",
      )
      const write = fs.writeFile
      const mocked = t.mock.method(fs, "writeFile", async (...args) => {
        await write(...args)
        if (
          String(args[0]).startsWith(storage) &&
          String(args[0]).endsWith("/second.png")
        ) {
          started = true
          await gate.promise
        }
      })
      syncBuiltinESMExports()
      t.after(() => {
        mocked.mock.restore()
        syncBuiltinESMExports()
      })
      const sessionId = host.runtime.session.sessionManager.getSessionId()
      host.ui.setEditorText("Keep selected")
      for (let index = 0; index < 8; index++) host.input("\x1b[1;2D")
      host.input("\x1b[118;9u")
      await waitFor(() => assert.ok(started))
      assert.equal(host.ui.getEditorText(), "Keep selected")
      assert.doesNotMatch(host.render(), /Attachments \(/)
      if (change === "session") await host.runtime.newSession()
      if (change === "selection") host.input("\x1b[1;2C")
      else if (change !== "none") host.ui.setEditorText("Later draft")
      gate.resolve()
      if (change === "none") {
        await waitFor(() =>
          assert.equal(
            host.ui.getEditorText().match(/\[Attachment:/g)?.length,
            2,
          ),
        )
        const draft = host.ui.getEditorText()
        assert.match(draft, /^Keep \n\[Attachment:/)
        host.input("\x1b[122;9u")
        assert.equal(host.ui.getEditorText(), "Keep selected")
        assert.doesNotMatch(host.render(), /Attachments \(/)
        host.input("\x1b[122;10u")
        assert.equal(host.ui.getEditorText(), draft)
      } else {
        const recovery = await waitFor(() =>
          retainedRequest(
            host,
            sessionId,
            phase === "staging" ? "Paste" : "Attachment",
          ),
        )
        assert.match(recovery.text, /Keep selected/)
        assert.doesNotMatch(recovery.text, /Later draft/)
        const paths =
          phase === "staging"
            ? recovery.text
                .split("\n")
                .filter((line) => line.startsWith("Paste: "))
                .map((line) => line.slice(7))
            : recovery.text
                .split("\n")
                .filter((line) => line.startsWith("[Attachment:"))
                .map(snapshotPath)
        assert.equal(paths.length, 2)
        assert.equal(await readFile(paths[0], "utf8"), "Whole copied set")
        assert.equal((await readFile(paths[1])).toString("base64"), PNG)
        assert.equal(
          host.ui.getEditorText(),
          change === "selection" ? "Keep selected" : "Later draft",
        )
        if (change === "selection") {
          host.input("!")
          assert.equal(host.ui.getEditorText(), "Keep s!")
        }
      }
      assert.equal(host.requests.length, 0)
    })
  }
}
