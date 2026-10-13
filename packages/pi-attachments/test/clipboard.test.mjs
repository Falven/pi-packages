/* eslint-disable no-await-in-loop -- Each paste spelling waits for its native draft before the next paste. */
import assert from "node:assert/strict"
import fs, {
  chmod,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises"
import { syncBuiltinESMExports } from "node:module"
import { homedir } from "node:os"
import { basename, join, relative } from "node:path"
import { beforeEach, test } from "node:test"
import { fileURLToPath, pathToFileURL } from "node:url"
import { getNativeClipboard } from "@earendil-works/pi-tui"
import { convertToPng, CustomEditor } from "@earendil-works/pi-coding-agent"
import { openHost } from "../../pi-composer/fixtures/host.ts"
import piAttachments from "../src/index.ts"
import {
  holdFileRead,
  nativePi,
  retainedRequest,
  snapshotPath,
  waitFor,
} from "../fixtures/native-pi.mjs"

const composerPath = fileURLToPath(
  new URL("../../pi-composer/src/index.ts", import.meta.url),
)
const PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAADUlEQVR4nGP4zwAE/wEHAAH/4iOeWQAAAABJRU5ErkJggg=="
const BMP =
  "Qk06AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABABgAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAD/AA=="

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
  const host = await nativePi(t)
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
  const saved = await readdir(host.agentDir, {
    recursive: true,
    withFileTypes: true,
  })
  assert.deepEqual(
    saved
      .filter((entry) => entry.isFile() && entry.name === names[0])
      .map((entry) => join(entry.parentPath, entry.name))
      .toSorted(),
    paths.toSorted(),
    "Each copied file has one retained content copy",
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
  const host = await nativePi(t, [composerPath])
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

for (const [extension, contents] of [
  ["png", PNG],
  ["bmp", BMP],
]) {
  test(`an image-only ${extension} native paste retains its file type, previews, and delivers the captured image`, async (t) => {
    const clipboard = getNativeClipboard()
    t.mock.method(clipboard, "getImage", async () =>
      Buffer.from(contents, "base64"),
    )
    t.mock.method(clipboard, "getText", async () => "Ignore accompanying text")
    const host = await nativePi(t)
    host.input("\x16")
    const path = await waitFor(() => snapshotPath(host.ui.getEditorText()))
    assert.equal(basename(path), `clipboard-image.${extension}`)
    assert.equal((await readFile(path)).toString("base64"), contents)
    await waitFor(() => assert.match(host.render(), /\[Image:/))
    const draft = host.ui.getEditorText().trim()
    host.submit()
    await waitFor(() => assert.equal(host.requests.length, 1))
    const user = host.requests[0].messages.find(({ role }) => role === "user")
    const delivered = await convertToPng(contents, `image/${extension}`)
    assert.ok(delivered)
    assert.deepEqual(user.content, [
      { type: "text", text: draft },
      {
        type: "image_url",
        image_url: { url: `data:image/png;base64,${delivered.data}` },
      },
    ])
    await waitFor(() => assert.equal(host.runtime.session.isStreaming, false))
  })
}

test("a copied file set whose references exceed the text cutoff stays one image-bearing draft edit", async (t) => {
  const host = await nativePi(t, [composerPath])
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
  const host = await nativePi(t)
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

test("one pasted path accepts terminal escaping, whole-path quotes, file URLs, and working-directory names", async (t) => {
  const host = await nativePi(t)
  const name = "CleanShot 2026-10-12 at 9.48.56 PM@2x.png"
  const source = join(host.directory, name)
  await writeFile(source, Buffer.from(PNG, "base64"))
  for (const text of [
    `${host.directory}/CleanShot\\ 2026-10-12\\ at\\ 9.48.56\\ PM@2x.png`,
    `'${source}'`,
    `"${source}"`,
    pathToFileURL(source).href,
    `file:${pathToFileURL(source).pathname}`,
    `~/${relative(homedir(), source)}`,
    name,
    `./${name}`,
    `../${basename(host.directory)}/${name}`,
  ]) {
    host.ui.setEditorText("")
    host.ui.pasteToEditor(text)
    const path = await waitFor(() => snapshotPath(host.ui.getEditorText()))
    assert.equal(basename(path), name)
    assert.equal((await readFile(path)).toString("base64"), PNG)
  }
})

test("unsuitable single-path pastes stay text silently and Paste Inline leaves readable paths literal", async (t) => {
  const host = await nativePi(t)
  const source = join(host.directory, "Readable file.txt")
  const unreadable = join(host.directory, "Unreadable file.txt")
  await writeFile(source, "File contents")
  await writeFile(unreadable, "Unavailable contents")
  await chmod(unreadable, 0o000)
  for (const text of [
    join(host.directory, "Missing file.txt"),
    unreadable,
    host.directory,
    `Look at ${source}`,
    `${source} ${source}`,
    `${source}\n${source}`,
    `\`${source}\``,
    `file://remote${source}`,
    "file:///%GG",
  ]) {
    host.ui.setEditorText("")
    host.ui.pasteToEditor(text)
    await waitFor(() => assert.equal(host.ui.getEditorText(), text))
    assert.doesNotMatch(
      host.render(),
      /Attachments \(|Could not (paste|attach)/,
    )
  }
  t.mock.method(getNativeClipboard(), "getText", async () => source)
  host.ui.setEditorText("")
  await host.runtime.session.prompt("/paste-inline")
  assert.equal(host.ui.getEditorText(), source)
  host.ui.setEditorText("")
  host.input(source)
  assert.equal(host.ui.getEditorText(), source)
  host.ui.setEditorText(source)
  assert.equal(host.ui.getEditorText(), source)
  assert.doesNotMatch(host.render(), /Attachments \(/)
  await assert.rejects(readdir(join(host.agentDir, "pi-attachments")), {
    code: "ENOENT",
  })
})

test("a fragmented image-path paste replaces a composer selection in code and its reference can become plain path text", async (t) => {
  const host = await nativePi(t, [composerPath])
  const source = join(host.directory, "Pasted image.png")
  await writeFile(source, Buffer.from(PNG, "base64"))
  const before = "```text\nKeep selected"
  host.ui.setEditorText(before)
  for (let index = 0; index < 8; index++) host.input("\x1b[1;2D")
  host.input(`\x1b[200~${host.directory}/Pasted\\ `)
  assert.equal(host.ui.getEditorText(), before)
  host.input("image.png\x1b[201~")
  const path = await waitFor(() => snapshotPath(host.ui.getEditorText()))
  const after = host.ui.getEditorText()
  assert.match(after, /^```text\nKeep \n\[Attachment:/)
  await waitFor(() => assert.match(host.render(), /\[Image: .*2x1/))
  host.input("\x1b[122;9u")
  assert.equal(host.ui.getEditorText(), before)
  assert.doesNotMatch(host.render(), /Attachments \(/)
  host.input("\x1b[122;10u")
  assert.equal(host.ui.getEditorText(), after)

  const reference = after.trim().split("\n").at(-1)
  host.ui.setEditorText(reference)
  host.input("\x1b[109;10u")
  host.input("\x7f")
  host.input("\x7f")
  host.input("\x01")
  for (let index = 0; index < reference.indexOf(path); index++)
    host.input("\x1b[3~")
  assert.equal(host.ui.getEditorText(), path)
  assert.doesNotMatch(host.render(), /Attachments \(/)
  host.submit()
  await waitFor(() => assert.equal(host.requests.length, 1))
  const user = host.requests[0].messages.find(({ role }) => role === "user")
  assert.deepEqual(user.content, [{ type: "text", text: path }])
  assert.equal((await readFile(path)).toString("base64"), PNG)
  await waitFor(() => assert.equal(host.runtime.session.isStreaming, false))
})

test("a delayed text-path capture retains the requesting draft without overwriting later edits", async (t) => {
  const host = await nativePi(t, [composerPath])
  const source = join(host.directory, "Delayed file.txt")
  await writeFile(source, "Captured before the source changed")
  const capture = holdFileRead(t, source)
  host.ui.setEditorText("Original draft")
  host.ui.pasteToEditor(source)
  await capture.started()
  host.ui.setEditorText("Later draft")
  await rm(source)
  capture.release()
  await waitFor(() => assert.match(host.render(), /Snapshot retained/))
  const recovery = await retainedRequest(host, "Original draft")
  assert.equal(
    await readFile(snapshotPath(recovery.text), "utf8"),
    "Captured before the source changed",
  )
  assert.equal(host.ui.getEditorText(), "Later draft")
  assert.doesNotMatch(host.render(), /Attachments \(/)
})

test("a failed snapshot write retains all copied bytes across reload even if the original files disappear", async (t) => {
  const host = await nativePi(t, [composerPath])
  const sources = [
    join(host.directory, "first.txt"),
    join(host.directory, "second.png"),
  ]
  await writeFile(sources[0], "Retained copied text")
  await writeFile(sources[1], Buffer.from(PNG, "base64"))
  t.mock.method(getNativeClipboard(), "getFilePaths", async () => sources)
  const storage = join(host.agentDir, "pi-attachments")
  await mkdir(storage)
  await chmod(storage, 0o500)
  const sessionId = host.runtime.session.sessionManager.getSessionId()
  host.ui.setEditorText("Original file draft")
  try {
    host.input("\x1b[118;9u")
    await waitFor(() => assert.match(host.render(), /Retry save/))
    assert.equal(host.ui.getEditorText(), "Original file draft")
    await Promise.all(sources.map((source) => rm(source)))
    await host.runtime.session.reload()
    host.ui.setEditorText("Later draft")
  } finally {
    await chmod(storage, 0o700)
  }
  await host.runtime.session.prompt("/paste-recover")
  const recovery = await retainedRequest(host, sessionId)
  assert.match(recovery.text, /Original file draft/)
  assert.doesNotMatch(recovery.text, /Later draft/)
  const paths = recovery.text
    .split("\n")
    .filter((line) => line.startsWith("[Attachment:"))
    .map(snapshotPath)
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
  const host = await nativePi(t, [composerPath])
  host.ui.setEditorText("Keep selected")
  for (let index = 0; index < 8; index++) host.input("\x1b[1;2D")
  host.input("\x1b[118;9u")
  await waitFor(() =>
    assert.match(host.render(), /Clipboard image format is unsupported/),
  )
  assert.equal(host.ui.getEditorText(), "Keep selected")
  const recovery = await retainedRequest(host, "Keep selected")
  const path = snapshotPath(recovery.text)
  assert.deepEqual(await readFile(path), bytes)
  host.input("!")
  assert.equal(host.ui.getEditorText(), "Keep !")
  assert.equal(host.requests.length, 0)
})

for (const composer of [false, true]) {
  test(`${composer ? "composer" : "native"} clipboard action captures both a copied image file and the same path as text`, async (t) => {
    const host = await nativePi(t, composer ? [composerPath] : [])
    const source = join(host.directory, "Clipboard image 你好.png")
    await writeFile(source, Buffer.from(PNG, "base64"))
    const clipboard = getNativeClipboard()
    t.mock.method(clipboard, "getText", async () => source)
    host.ui.setEditorText("Path ")
    host.input("\x16")
    const textPath = await waitFor(() => snapshotPath(host.ui.getEditorText()))
    assert.equal(basename(textPath), basename(source))
    assert.equal((await readFile(textPath)).toString("base64"), PNG)
    await waitFor(() => assert.match(host.render(), /\[Image: .*2x1/))

    t.mock.method(clipboard, "getFilePaths", async () => [source])
    host.ui.setEditorText("Image ")
    host.input("\x16")
    const path = await waitFor(() => snapshotPath(host.ui.getEditorText()))
    assert.notEqual(path, textPath)
    assert.equal(basename(path), basename(source))
    assert.equal((await readFile(path)).toString("base64"), PNG)
    await waitFor(() => assert.match(host.render(), /\[Image: .*2x1/))
    assert.equal(host.requests.length, 0)
  })

  for (const route of ["terminal", "extension"]) {
    test(`${composer ? "composer" : "native"} ${route} paste captures one image path without reading clipboard metadata`, async (t) => {
      const host = await nativePi(t, composer ? [composerPath] : [])
      const source = join(host.directory, "Literal image 你好.png")
      await writeFile(source, Buffer.from(PNG, "base64"))
      let reads = 0
      for (const method of ["getFilePaths", "getImage", "getText"]) {
        t.mock.method(getNativeClipboard(), method, async () => {
          reads++
          throw new Error("Text paste must not read the clipboard")
        })
      }
      host.ui.setEditorText("Path ")
      if (route === "terminal") host.input(`\x1b[200~${source}\x1b[201~`)
      else host.ui.pasteToEditor(source)
      const path = await waitFor(() => snapshotPath(host.ui.getEditorText()))
      assert.notEqual(path, source)
      assert.equal(basename(path), basename(source))
      assert.equal((await readFile(path)).toString("base64"), PNG)
      assert.equal(reads, 0)
      await waitFor(() => assert.match(host.render(), /\[Image: .*2x1/))
      assert.equal(host.requests.length, 0)
      host.submit()
      await waitFor(() => assert.equal(host.requests.length, 1))
      const user = host.requests[0].messages.find(({ role }) => role === "user")
      assert.deepEqual(
        user.content.find(({ type }) => type === "image_url"),
        {
          type: "image_url",
          image_url: { url: `data:image/png;base64,${PNG}` },
        },
      )
      await waitFor(() => assert.equal(host.runtime.session.isStreaming, false))
    })
  }

  for (const kind of ["files", "image", "text"]) {
    test(`${composer ? "composer" : "native"} fullscreen right-click preserves clipboard ${kind} identity`, async (t) => {
      const host = await nativePi(t, composer ? [composerPath] : [])
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
      const path = await waitFor(() => snapshotPath(host.ui.getEditorText()))
      if (kind === "files" || kind === "text") {
        assert.equal(basename(path), "Clipboard path 你好.txt")
        assert.equal(await readFile(path, "utf8"), "Copied file body")
      } else {
        assert.equal((await readFile(path)).toString("base64"), PNG)
        await waitFor(() => assert.match(host.render(), /\[Image: .*2x1/))
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
      const host = await nativePi(t, composer ? [composerPath] : [])
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
    const host = await nativePi(t, [composerPath])
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
      assert.match(host.render(), /Could not (?:paste|attach)/),
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
      const host = await nativePi(t, [composerPath])
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
      await waitFor(async () => {
        const recovery = await retainedRequest(host, sessionId)
        assert.match(recovery.text, /Keep selected/)
        assert.doesNotMatch(recovery.text, /Later draft/)
        const paths = recovery.text
          .split("\n")
          .filter((line) => line.startsWith("[Attachment:"))
          .map(snapshotPath)
        assert.equal(paths.length, kind === "files" ? 2 : 1)
        if (kind === "files")
          assert.equal(await readFile(paths[0], "utf8"), "Original copied file")
        assert.equal((await readFile(paths.at(-1))).toString("base64"), PNG)
      })
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
      const host = await nativePi(
        t,
        behavior === "followUp" ? [composerPath] : [],
      )
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

test("a copied file set attaches directly while agent settlement is pending", async (t) => {
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
    },
  })
  const sources = [
    join(host.directory, "First captured.txt"),
    join(host.directory, "Second captured.png"),
  ]
  await writeFile(sources[0], "Captured file set")
  await writeFile(sources[1], Buffer.from(PNG, "base64"))
  t.mock.method(getNativeClipboard(), "getFilePaths", async () => sources)
  host.ui.setEditorText("Initial prompt")
  await host.key("\r")
  await waitFor(() => assert.ok(settling))
  host.ui.setEditorText("Requesting file draft")
  await host.key("\x1b[118;9u")
  const paths = await waitFor(() => {
    const references = host.ui
      .getEditorText()
      .split("\n")
      .filter((line) => line.startsWith("[Attachment:"))
    assert.equal(references.length, 2)
    return references.map(snapshotPath)
  })
  const recovery = await retainedRequest(
    { agentDir: host.directory },
    "Requesting file draft",
  )
  assert.ok(paths.every((path) => recovery.text.includes(path)))
  assert.equal(await readFile(paths[0], "utf8"), "Captured file set")
  assert.equal((await readFile(paths[1])).toString("base64"), PNG)
  host.ui.setEditorText("Later draft")
  gate.resolve()
  await waitFor(() => assert.equal(host.runtime.session.isStreaming, false))
  assert.doesNotMatch(await host.output(), /Could not attach/)
  assert.equal(host.ui.getEditorText(), "Later draft")
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
        piAttachments(pi)
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
  const host = await nativePi(t, [composerPath])
  host.ui.setEditorText("Keep selected")
  for (let index = 0; index < 8; index++) host.input("\x1b[1;2D")
  host.input("\x1b[118;7u")
  await waitFor(() => assert.equal(host.ui.getEditorText(), `Keep ${text}`))
  assert.doesNotMatch(host.render(), /Attachments \(/)
  host.input("\x1b[122;9u")
  assert.equal(host.ui.getEditorText(), "Keep selected")
})

test("a failed snapshot save retries the whole copied set from captured bytes in one edit", async (t) => {
  const host = await nativePi(t, [composerPath])
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
  const host = await nativePi(t, [composerPath])
  const storage = join(host.agentDir, "pi-attachments")
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
    assert.match(host.render(), /No unsaved attachment requests/)
    gate.resolve(Buffer.from(PNG, "base64"))
    await waitFor(async () => {
      await host.runtime.session.prompt("/paste-recover")
      assert.match(host.render(), /Attachment recovery incomplete/)
    })
  } finally {
    await chmod(storage, 0o700)
  }
  await host.runtime.session.prompt("/paste-recover")
  const recovery = await retainedRequest(host, sessionId)
  assert.match(recovery.text, /Outgoing image draft/)
  assert.doesNotMatch(recovery.text, /Live session draft/)
  const path = snapshotPath(recovery.text)
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
  const host = await nativePi(t, [composerPath])
  const source = join(host.directory, "Older file.txt")
  await writeFile(source, "Older copied file")
  host.ui.setEditorText("Original draft")
  host.input("\x1b[118;9u")
  await started.promise
  host.input("\x1b[118;9u")
  const newerImage = await waitFor(() => snapshotPath(host.ui.getEditorText()))
  const newerDraft = host.ui.getEditorText()
  gate.resolve([source])
  await waitFor(() => assert.match(host.render(), /Snapshot retained/))
  const recovery = await retainedRequest(host, "Older file.txt")
  assert.match(recovery.text, /Original draft/)
  assert.ok(!recovery.text.includes(newerImage))
  const path = snapshotPath(recovery.text)
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
    const host = await nativePi(t)
    host.ui.setEditorText("Draft ")
    host.input("\x16")
    await waitFor(() =>
      assert.equal(host.ui.getEditorText(), "Draft /tmp/Plain path 你好.txt"),
    )
    assert.doesNotMatch(host.render(), /Attachments \(/)
  })
}

for (const change of ["none", "selection", "edit", "session"]) {
  test(`a delayed snapshot write keeps the entire copied set with its target (${change})`, async (t) => {
    const gate = Promise.withResolvers()
    let started = false
    t.after(() => gate.resolve())
    const host = await nativePi(t, [composerPath])
    const sources = [
      join(host.directory, "first.txt"),
      join(host.directory, "second.png"),
    ]
    await writeFile(sources[0], "Whole copied set")
    await writeFile(sources[1], Buffer.from(PNG, "base64"))
    t.mock.method(getNativeClipboard(), "getFilePaths", async () => sources)
    const storage = join(host.agentDir, "pi-attachments")
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
      await waitFor(async () => {
        const recovery = await retainedRequest(host, sessionId)
        assert.match(recovery.text, /Keep selected/)
        assert.doesNotMatch(recovery.text, /Later draft/)
        const paths = recovery.text
          .split("\n")
          .filter((line) => line.startsWith("[Attachment:"))
          .map(snapshotPath)
        assert.equal(paths.length, 2)
        assert.equal(await readFile(paths[0], "utf8"), "Whole copied set")
        assert.equal((await readFile(paths[1])).toString("base64"), PNG)
      })
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
