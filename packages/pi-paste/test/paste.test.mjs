/* eslint-disable no-await-in-loop -- Each scenario waits for its native draft before starting another paste. */
import assert from "node:assert/strict"
import fs, { chmod, mkdir, readFile, readdir } from "node:fs/promises"
import { syncBuiltinESMExports } from "node:module"
import { join } from "node:path"
import { beforeEach, test } from "node:test"
import { fileURLToPath } from "node:url"
import { getNativeClipboard, StdinBuffer } from "@earendil-works/pi-tui"
import { CustomEditor } from "@earendil-works/pi-coding-agent"
import { openHost } from "../../pi-composer/fixtures/host.ts"
import piPaste from "../src/index.ts"
import piAttachments from "../../pi-attachments/src/index.ts"
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
const attachmentsPath = fileURLToPath(
  new URL("../../pi-attachments/src/index.ts", import.meta.url),
)

beforeEach((t) => {
  const clipboard = getNativeClipboard()
  assert.ok(clipboard?.getFilePaths)
  t.mock.method(clipboard, "getFilePaths", async () => null)
  t.mock.method(clipboard, "getImage", async () => null)
  t.mock.method(clipboard, "getText", async () => null)
})

test("a 4,999-unit paste stays visibly inline through terminal and extension routes", async (t) => {
  const host = await nativePi(t, [pastePath])
  const text = "a".repeat(4999)
  host.input(`\x1b[200~${text}\x1b[201~`)
  assert.equal(host.ui.getEditorText(), text)
  assert.doesNotMatch(host.render(), /\[paste #|\[Attachment:/)
  host.ui.setEditorText("")
  host.ui.pasteToEditor(text)
  assert.equal(host.ui.getEditorText(), text)
  assert.doesNotMatch(host.render(), /\[paste #|\[Attachment:/)
})

test("a 5,000-unit paste reaches native Attach File without replacing the requesting draft", async (t) => {
  const host = await nativePi(t, [pastePath])
  const text = `\n\t${"x".repeat(4996)}\r\n`
  assert.equal(text.length, 5000)
  host.ui.setEditorText("Keep draft")
  host.ui.pasteToEditor(text)
  const path = await waitFor(() => snapshotPath(host.ui.getEditorText()))
  assert.match(host.ui.getEditorText(), /^Keep draft\n\[Attachment:/)
  assert.ok(path.startsWith(`${host.agentDir}/pi-attachments/`))
  assert.equal(await readFile(path, "utf8"), text)
  assert.equal(host.requests.length, 0, "the handoff is a native command")
})

test("fragmented bracketed input becomes one attachment after the closing frame", async (t) => {
  const host = await nativePi(t, [pastePath])
  const text = "😀".repeat(2500) + "!"
  assert.equal(text.length, 5001)
  host.input("\x1b[200~")
  host.input(text.slice(0, 1999))
  host.input(text.slice(1999) + "\x1b[20")
  assert.equal(host.ui.getEditorText(), "")
  host.input("1~")
  const path = await waitFor(() => snapshotPath(host.ui.getEditorText()))
  assert.equal(await readFile(path, "utf8"), text)
  assert.equal(
    [...host.ui.getEditorText().matchAll(/\[Attachment:/g)].length,
    1,
  )
})

test("the configured native clipboard shortcut applies the attachment cutoff", async (t) => {
  const clipboard = getNativeClipboard()
  assert.ok(clipboard, "this host check requires Pi's native clipboard backend")
  const text = "c".repeat(5000)
  t.mock.method(clipboard, "getImage", async () => null)
  t.mock.method(clipboard, "getText", async () => text)
  const host = await nativePi(t, [pastePath])
  host.ui.setEditorText("Clipboard draft")
  host.input("\x16")
  const path = await waitFor(() => snapshotPath(host.ui.getEditorText()))
  assert.match(host.ui.getEditorText(), /^Clipboard draft\n\[Attachment:/)
  assert.equal(await readFile(path, "utf8"), text)
})

test("Pi's stdin decoder assembles a split opening frame before applying the cutoff", async (t) => {
  const host = await nativePi(t, [pastePath])
  const stdin = new StdinBuffer()
  t.after(() => stdin.destroy())
  stdin.on("data", host.input)
  stdin.on("paste", (text) => host.input(`\x1b[200~${text}\x1b[201~`))
  stdin.process("\x1b[2")
  stdin.process("00~" + "s".repeat(2500))
  stdin.process("s".repeat(2500) + "\x1b[20")
  assert.equal(host.ui.getEditorText(), "")
  stdin.process("1~")
  const path = await waitFor(() => snapshotPath(host.ui.getEditorText()))
  assert.equal(await readFile(path, "utf8"), "s".repeat(5000))
})

test("fullscreen right-click input reaches the main editor's paste policy on macOS", async (t) => {
  const clipboard = getNativeClipboard()
  assert.ok(clipboard, "this host check requires Pi's native clipboard backend")
  const text = "r".repeat(5000)
  t.mock.method(clipboard, "getImage", async () => null)
  t.mock.method(clipboard, "getText", async () => text)
  const host = await nativePi(t, [pastePath])
  host.ui.setEditorText("Mouse draft")
  host.render()
  host.input("\x1b[<2;10;27M")
  host.input("\x1b[<2;10;27m")
  const path = await waitFor(() => snapshotPath(host.ui.getEditorText()))
  assert.match(host.ui.getEditorText(), /^Mouse draft\n\[Attachment:/)
  assert.equal(await readFile(path, "utf8"), text)
})

async function retainedPaste(host) {
  const storage = join(host.agentDir, "pi-paste")
  const entries = await readdir(storage, { recursive: true })
  const request = entries.find((path) => path.endsWith("/request.md"))
  assert.ok(request, "the requesting draft must have a readable recovery file")
  const path = join(storage, request)
  return { path, text: await readFile(path, "utf8") }
}

test("a delayed clipboard read preserves its requesting draft and leaves later text untouched", async (t) => {
  const clipboard = getNativeClipboard()
  assert.ok(clipboard)
  const read = Promise.withResolvers()
  const started = Promise.withResolvers()
  t.mock.method(clipboard, "getImage", async () => null)
  t.mock.method(clipboard, "getText", async () => {
    started.resolve()
    return read.promise
  })
  t.after(() => read.resolve("Late text"))
  const host = await nativePi(t, [pastePath])
  host.ui.setEditorText("Requesting draft")
  const sessionId = host.runtime.session.sessionManager.getSessionId()
  host.input("\x16")
  await started.promise
  host.ui.setEditorText("Later draft")
  read.resolve("Late text")
  await waitFor(() => assert.match(host.render(), /Paste retained/))
  assert.equal(host.ui.getEditorText(), "Later draft")
  const recovery = await retainedPaste(host)
  assert.ok(recovery.text.includes(sessionId))
  assert.match(recovery.text, /Requesting draft/)
  assert.doesNotMatch(recovery.text, /Later draft/)
  assert.equal(
    await readFile(join(recovery.path, "../text.txt"), "utf8"),
    "Late text",
  )
})

test("Paste Inline replaces a composer selection with long clipboard text in one edit", async (t) => {
  const clipboard = getNativeClipboard()
  assert.ok(clipboard)
  const text = "i".repeat(5001)
  t.mock.method(clipboard, "getImage", async () => null)
  t.mock.method(clipboard, "getText", async () => text)
  const host = await nativePi(t, [composerPath, pastePath])
  host.ui.setEditorText("Keep draft")
  for (let index = 0; index < 5; index++) host.input("\x1b[1;2D")
  host.input("\x1b[118;7u")
  await waitFor(() => assert.equal(host.ui.getEditorText(), `Keep ${text}`))
  assert.doesNotMatch(host.render(), /\[Attachment:|\[paste #/)
  host.input("\x1b[122;9u")
  assert.equal(host.ui.getEditorText(), "Keep draft")
})

test("a later paste decorator preserves Attach Text read observation and composer selection", async (t) => {
  const host = await nativePi(t, [composerPath, attachmentsPath, pastePath])
  host.ui.setEditorText("```text\nKeep draft")
  for (let index = 0; index < 5; index++) host.input("\x1b[1;2D")
  await host.runtime.session.prompt("/attach-text Small code context")
  const path = snapshotPath(host.ui.getEditorText())
  assert.match(host.ui.getEditorText(), /^```text\nKeep \n\[Attachment:/)
  assert.equal(await readFile(path, "utf8"), "Small code context")
  host.input("\x1b[122;9u")
  assert.equal(host.ui.getEditorText(), "```text\nKeep draft")
  assert.doesNotMatch(host.render(), /Attachments \(/)
  host.input("\x1b[122;10u")
  assert.equal(snapshotPath(host.ui.getEditorText()), path)
  assert.match(host.render(), /Attachments \(1\)/)
})

test("unavailable attachment handling reports an error and preserves the complete paste", async (t) => {
  const host = await openHost(t, { extension: piPaste })
  const agentDir = process.env.PI_CODING_AGENT_DIR
  host.ui.setEditorText("Unchanged draft")
  const text = "u".repeat(5000)
  host.ui.pasteToEditor(text)
  await waitFor(async () =>
    assert.match(await host.output(), /Attach File is unavailable/),
  )
  assert.equal(host.ui.getEditorText(), "Unchanged draft")
  assert.equal(host.requests.length, 0)
  const recovery = await retainedPaste({ agentDir })
  assert.match(recovery.text, /Unchanged draft/)
  assert.equal(await readFile(join(recovery.path, "../text.txt"), "utf8"), text)
})

test("a failed attachment snapshot write leaves the selection and staged bytes recoverable", async (t) => {
  const host = await nativePi(t, [composerPath, pastePath])
  const storage = join(host.agentDir, "pi-attachments")
  await mkdir(storage)
  await chmod(storage, 0o500)
  host.ui.setEditorText("Keep selected")
  for (let index = 0; index < 8; index++) host.input("\x1b[1;2D")
  const text = `\t${"f".repeat(4997)}\r\n`
  try {
    host.ui.pasteToEditor(text)
    await waitFor(() => assert.match(host.render(), /Could not attach/))
    assert.equal(host.ui.getEditorText(), "Keep selected")
    const recovery = await retainedPaste(host)
    assert.equal(
      await readFile(join(recovery.path, "../text.txt"), "utf8"),
      text,
    )
  } finally {
    await chmod(storage, 0o700)
  }
  host.input("\r")
  await waitFor(() => snapshotPath(host.ui.getEditorText()))
  assert.equal(
    await readFile(snapshotPath(host.ui.getEditorText()), "utf8"),
    text,
  )
})

test("a failed staging write keeps the payload available to the native recovery command", async (t) => {
  const host = await nativePi(t, [pastePath])
  const storage = join(host.agentDir, "pi-paste")
  await mkdir(storage)
  await chmod(storage, 0o500)
  host.ui.setEditorText("Keep the requesting draft")
  const text = `\t${"p".repeat(4998)}\n`
  try {
    host.ui.pasteToEditor(text)
    await waitFor(() => assert.match(host.render(), /Could not preserve paste/))
    assert.equal(host.ui.getEditorText(), "Keep the requesting draft")
    assert.match(host.render(), /\/paste-recover/)
  } finally {
    await chmod(storage, 0o700)
  }
  await host.runtime.session.prompt("/paste-recover")
  const recovery = await retainedPaste(host)
  assert.equal(await readFile(join(recovery.path, "../text.txt"), "utf8"), text)
  assert.equal(host.ui.getEditorText(), "Keep the requesting draft")
  assert.equal(host.requests.length, 0)
})

for (const change of ["session replacement", "resource reload", "cwd reload"]) {
  test(`a failed staging write survives ${change} and recovers its original draft`, async (t) => {
    const host = await nativePi(t, [pastePath])
    if (change === "cwd reload")
      await host.runtime.session.prompt("Seed a persisted session")
    const storage = join(host.agentDir, "pi-paste")
    await mkdir(storage)
    await chmod(storage, 0o500)
    const draft = "Original request\n/skill:review @notes.ts"
    const text = `\t${"😀\r\n".repeat(1250)}`
    const sessionId = host.runtime.session.sessionManager.getSessionId()
    host.ui.setEditorText(draft)
    try {
      host.ui.pasteToEditor(text)
      await waitFor(() =>
        assert.match(host.render(), /Could not preserve paste/),
      )
      assert.equal(host.ui.getEditorText(), draft)
      if (change === "session replacement") {
        assert.deepEqual(await host.runtime.newSession(), { cancelled: false })
        assert.notEqual(
          host.runtime.session.sessionManager.getSessionId(),
          sessionId,
        )
      } else if (change === "resource reload") {
        await host.runtime.session.reload()
      } else {
        const cwd = join(host.directory, "other-project")
        await mkdir(cwd)
        assert.deepEqual(
          await host.runtime.switchSession(host.runtime.session.sessionFile, {
            cwdOverride: cwd,
          }),
          { cancelled: false },
        )
        assert.equal(host.runtime.cwd, cwd)
      }
      host.ui.setEditorText("Later draft")
      await host.runtime.session.prompt("/paste-recover")
      const failureOutput = host.render()
      assert.match(failureOutput, /Could not preserve paste/)
      assert.doesNotMatch(failureOutput, /No unsaved pastes/)
      assert.equal(host.ui.getEditorText(), "Later draft")
    } finally {
      await chmod(storage, 0o700)
    }
    await host.runtime.session.prompt("/paste-recover")
    assert.match(host.render(), /Recovered paste/)
    const recovery = await retainedPaste(host)
    const path = join(recovery.path, "../text.txt")
    assert.deepEqual(await readFile(path), Buffer.from(text))
    assert.equal(
      recovery.text,
      `# Paste request\n\nSession: ${sessionId}\n\n${draft}\n\nPaste: ${path}\n`,
    )
    assert.equal(host.ui.getEditorText(), "Later draft")
    assert.equal(host.requests.length, change === "cwd reload" ? 1 : 0)
    await host.runtime.session.prompt("/paste-recover")
    assert.match(host.render(), /No unsaved pastes/)
  })
}

test("unsaved pastes stay isolated by agent storage directory", async (t) => {
  const host = await nativePi(t, [pastePath])
  const storage = join(host.agentDir, "pi-paste")
  await mkdir(storage)
  await chmod(storage, 0o500)
  const draft = "Original agent draft"
  const text = `\t${"private 😀\r\n".repeat(500)}`
  const sessionId = host.runtime.session.sessionManager.getSessionId()
  host.ui.setEditorText(draft)
  try {
    host.ui.pasteToEditor(text)
    await waitFor(() => assert.match(host.render(), /Could not preserve paste/))
    await t.test(
      "another agent directory cannot recover this payload",
      async (otherTest) => {
        const other = await nativePi(otherTest, [pastePath])
        assert.notEqual(other.agentDir, host.agentDir)
        other.ui.setEditorText("Other agent draft")
        await other.runtime.session.prompt("/paste-recover")
        assert.match(other.render(), /No unsaved pastes/)
        assert.equal(other.ui.getEditorText(), "Other agent draft")
        await assert.rejects(readdir(join(other.agentDir, "pi-paste")), {
          code: "ENOENT",
        })
      },
    )
    await host.runtime.session.reload()
    host.ui.setEditorText("Later agent draft")
  } finally {
    await chmod(storage, 0o700)
  }
  await host.runtime.session.prompt("/paste-recover")
  assert.match(host.render(), /Recovered paste/)
  const recovery = await retainedPaste(host)
  const path = join(recovery.path, "../text.txt")
  assert.deepEqual(await readFile(path), Buffer.from(text))
  assert.equal(
    recovery.text,
    `# Paste request\n\nSession: ${sessionId}\n\n${draft}\n\nPaste: ${path}\n`,
  )
  assert.equal(host.ui.getEditorText(), "Later agent draft")
  assert.equal(host.requests.length, 0)
})

test("a staging failure arriving after outgoing shutdown remains recoverable by the live session", async (t) => {
  const host = await nativePi(t, [pastePath])
  const storage = join(host.agentDir, "pi-paste")
  const write = fs.writeFile
  const gate = Promise.withResolvers()
  let source
  let failure
  const mocked = t.mock.method(fs, "writeFile", async (...args) => {
    const staging =
      String(args[0]).startsWith(storage) &&
      String(args[0]).endsWith("/text.txt")
    if (staging) {
      source = args[0]
      await gate.promise
    }
    try {
      return await write(...args)
    } catch (error) {
      if (staging) failure = error
      throw error
    }
  })
  syncBuiltinESMExports()
  t.after(() => {
    gate.resolve()
    mocked.mock.restore()
    syncBuiltinESMExports()
  })
  const draft = "Outgoing draft @before.ts\nKeep this association"
  const text = `\t${"late 😀\r\n".repeat(700)}`
  const sessionId = host.runtime.session.sessionManager.getSessionId()
  host.ui.setEditorText(draft)
  let directory
  try {
    host.ui.pasteToEditor(text)
    await waitFor(() => assert.ok(source, "the captured paste reached storage"))
    directory = join(source, "..")
    await chmod(directory, 0o500)
    assert.deepEqual(await host.runtime.newSession(), { cancelled: false })
    assert.notEqual(
      host.runtime.session.sessionManager.getSessionId(),
      sessionId,
    )
    await host.runtime.session.prompt("/paste-recover")
    assert.match(host.render(), /No unsaved pastes/)
    await host.runtime.session.reload()
    host.ui.setEditorText("Later session draft")
    gate.resolve()
    await waitFor(() => assert.equal(failure?.code, "EACCES"))
  } finally {
    gate.resolve()
    if (directory) await chmod(directory, 0o700)
  }
  await host.runtime.session.prompt("/paste-recover")
  assert.match(host.render(), /Recovered paste/)
  const recovery = await retainedPaste(host)
  const path = join(recovery.path, "../text.txt")
  assert.deepEqual(await readFile(path), Buffer.from(text))
  assert.equal(
    recovery.text,
    `# Paste request\n\nSession: ${sessionId}\n\n${draft}\n\nPaste: ${path}\n`,
  )
  assert.equal(host.ui.getEditorText(), "Later session draft")
  assert.equal(host.requests.length, 0)
})

test("the cutoff measures decoded bracketed text before native whitespace formatting", async (t) => {
  const host = await nativePi(t, [pastePath])
  host.input(`\x1b[200~\x1b[106;5u${"d".repeat(4998)}\x1b[201~`)
  assert.equal(host.ui.getEditorText(), `\n${"d".repeat(4998)}`)
  assert.doesNotMatch(host.render(), /\[paste #|\[Attachment:/)
  host.ui.setEditorText("")
  const text = "\t".repeat(4999)
  host.ui.pasteToEditor(text)
  assert.equal(host.ui.getEditorText(), "    ".repeat(4999))
  assert.doesNotMatch(host.render(), /\[paste #|\[Attachment:/)
})

for (const composer of [false, true]) {
  for (const route of ["terminal", "extension", "clipboard", "right-click"]) {
    test(`${composer ? "composer" : "native"} ${route} routes 4,999/5,000/5,001 UTF-16 units consistently`, async (t) => {
      let contents
      if (route === "clipboard" || route === "right-click") {
        const clipboard = getNativeClipboard()
        assert.ok(clipboard)
        t.mock.method(clipboard, "getImage", async () => null)
        t.mock.method(clipboard, "getText", async () => contents)
      }
      const host = await nativePi(t, [
        ...(composer ? [composerPath] : []),
        pastePath,
      ])
      const insert = (text) => {
        contents = text
        if (route === "terminal") host.input(`\x1b[200~${text}\x1b[201~`)
        else if (route === "extension") host.ui.pasteToEditor(text)
        else if (route === "clipboard") host.input("\x16")
        else {
          host.render()
          host.input("\x1b[<2;10;27M")
          host.input("\x1b[<2;10;27m")
        }
      }
      for (const [text, attached] of [
        ["a".repeat(4999), false],
        ["a".repeat(5000), true],
        ["a".repeat(5001), true],
        ["😀".repeat(2499) + "!", false],
        ["😀".repeat(2500), true],
        ["😀".repeat(2500) + "!", true],
      ]) {
        host.ui.setEditorText("```text\nKeep ")
        insert(text)
        if (attached) {
          const path = await waitFor(() =>
            snapshotPath(host.ui.getEditorText()),
          )
          assert.equal(await readFile(path, "utf8"), text)
          assert.match(
            host.ui.getEditorText(),
            /^```text\nKeep \n\[Attachment:/,
          )
        } else {
          await waitFor(() =>
            assert.equal(host.ui.getEditorText(), `\`\`\`text\nKeep ${text}`),
          )
          assert.doesNotMatch(host.render(), /\[paste #|\[Attachment:/)
        }
      }
      const draft = "long draft ".repeat(600)
      const small = "- short line\n".repeat(30)
      host.ui.setEditorText(draft)
      insert(small)
      await waitFor(() => assert.equal(host.ui.getEditorText(), draft + small))
      assert.doesNotMatch(host.render(), /\[paste #|\[Attachment:/)
    })
  }

  test(`${composer ? "composer" : "native"} typing and public replacement remain inline above the cutoff`, async (t) => {
    const host = await nativePi(t, [
      ...(composer ? [composerPath] : []),
      pastePath,
    ])
    const text = "x".repeat(5001)
    for (const character of text) host.input(character)
    assert.equal(host.ui.getEditorText(), text)
    assert.doesNotMatch(host.render(), /\[paste #|\[Attachment:/)
    host.ui.setEditorText(`replaced ${text}`)
    assert.equal(host.ui.getEditorText(), `replaced ${text}`)
    assert.doesNotMatch(host.render(), /\[paste #|\[Attachment:/)
  })

  test(`${composer ? "composer" : "native"} Paste Inline command and Attach Text shortcut work in prose and code`, async (t) => {
    const clipboard = getNativeClipboard()
    assert.ok(clipboard)
    const text = `\t${"i".repeat(4998)}\r\n`
    t.mock.method(clipboard, "getText", async () => text)
    const host = await nativePi(t, [
      ...(composer ? [composerPath] : []),
      pastePath,
    ])
    for (const prefix of ["Prose ", "```text\nCode "]) {
      host.ui.setEditorText(prefix)
      await host.runtime.session.prompt("/paste-inline")
      assert.equal(
        host.ui.getEditorText(),
        prefix + (composer ? "\t" : "    ") + "i".repeat(4998) + "\n",
      )
      assert.doesNotMatch(host.render(), /\[paste #|\[Attachment:/)
      host.ui.setEditorText(prefix)
      host.input("\x1b[116;7u")
      await waitFor(() => assert.match(host.render(), /Attach text/))
      host.input("\x1b[200~\n  Short context\n\x1b[201~")
      host.input("\r")
      const path = await waitFor(() => snapshotPath(host.ui.getEditorText()))
      assert.ok(host.ui.getEditorText().startsWith(prefix))
      assert.equal(await readFile(path, "utf8"), "\n  Short context\n")
    }
  })
}

function heldClipboard(t) {
  const clipboard = getNativeClipboard()
  assert.ok(clipboard)
  const gate = Promise.withResolvers()
  let started = false
  t.mock.method(clipboard, "getImage", async () => null)
  t.mock.method(clipboard, "getText", () => {
    started = true
    return gate.promise
  })
  t.after(() => gate.resolve(null))
  return {
    started: () =>
      waitFor(() => assert.ok(started, "the host requested clipboard text")),
    release: gate.resolve,
  }
}

test("a late clipboard result remains recoverable in its requesting session after native /new", async (t) => {
  const clipboard = heldClipboard(t)
  const host = await nativePi(t, [pastePath])
  host.ui.setEditorText("Original session draft")
  const sessionId = host.runtime.session.sessionManager.getSessionId()
  host.input("\x16")
  await clipboard.started()
  host.submit("/new")
  await waitFor(() =>
    assert.notEqual(
      host.runtime.session.sessionManager.getSessionId(),
      sessionId,
    ),
  )
  host.ui.setEditorText("Replacement session draft")
  const text = "session ".repeat(800)
  clipboard.release(text)
  const recovery = await waitFor(() => retainedPaste(host))
  assert.equal(host.ui.getEditorText(), "Replacement session draft")
  assert.ok(recovery.text.includes(sessionId))
  assert.match(recovery.text, /Original session draft/)
  assert.doesNotMatch(recovery.text, /Replacement session draft/)
  assert.equal(await readFile(join(recovery.path, "../text.txt"), "utf8"), text)
  assert.equal(host.requests.length, 0)
})

for (const change of [
  "selection",
  "reverted text",
  "recreated editor",
  "reused editor",
  "replaced editor",
]) {
  test(`a delayed clipboard result preserves the draft after ${change} changes its insertion target`, async (t) => {
    const clipboard = heldClipboard(t)
    const host = await nativePi(t, [composerPath, pastePath])
    const previous = host.ui.getEditorComponent()
    let editor
    const factory = (...args) => {
      editor = previous(...args)
      return editor
    }
    host.ui.setEditorComponent(factory)
    host.ui.setEditorText("Unchanged contents")
    host.input("\x16")
    await clipboard.started()
    if (change === "selection") host.input("\x1b[1;2D")
    else if (change === "reverted text") {
      host.ui.setEditorText("An intervening edit")
      host.ui.setEditorText("Unchanged contents")
    } else if (change === "recreated editor")
      host.ui.setEditorComponent(factory)
    else if (change === "reused editor")
      host.ui.setEditorComponent(() => editor)
    else host.ui.setEditorComponent((...args) => new CustomEditor(...args))
    clipboard.release("Targeted text")
    await waitFor(() => assert.match(host.render(), /Paste retained/))
    assert.equal(host.ui.getEditorText(), "Unchanged contents")
    const recovery = await retainedPaste(host)
    assert.equal(
      await readFile(join(recovery.path, "../text.txt"), "utf8"),
      "Targeted text",
    )
  })
}

test("a delayed clipboard attachment replaces the original selection and undoes with its membership", async (t) => {
  const clipboard = heldClipboard(t)
  const host = await nativePi(t, [composerPath, attachmentsPath, pastePath])
  host.ui.setEditorText("Keep selected")
  for (let index = 0; index < 8; index++) host.input("\x1b[1;2D")
  host.input("\x16")
  await clipboard.started()
  const text = "snapshot ".repeat(600)
  clipboard.release(text)
  const path = await waitFor(() => snapshotPath(host.ui.getEditorText()))
  assert.match(host.ui.getEditorText(), /^Keep \n\[Attachment:/)
  assert.equal(await readFile(path, "utf8"), text)
  assert.match(host.render(), /Attachments \(1\)/)
  host.input("\x1b[122;9u")
  assert.equal(host.ui.getEditorText(), "Keep selected")
  assert.doesNotMatch(host.render(), /Attachments \(/)
  host.input("\x1b[122;10u")
  assert.equal(snapshotPath(host.ui.getEditorText()), path)
  assert.match(host.render(), /Attachments \(1\)/)
})

test("a staging write that finishes after edits cannot attach to the restored-looking draft", async (t) => {
  const host = await nativePi(t, [pastePath])
  const write = fs.writeFile
  const gate = Promise.withResolvers()
  let started = false
  const mocked = t.mock.method(fs, "writeFile", async (...args) => {
    await write(...args)
    if (
      String(args[0]).startsWith(join(host.agentDir, "pi-paste")) &&
      String(args[0]).endsWith("/text.txt")
    ) {
      started = true
      await gate.promise
    }
  })
  syncBuiltinESMExports()
  t.after(() => {
    gate.resolve()
    mocked.mock.restore()
    syncBuiltinESMExports()
  })
  host.ui.setEditorText("Original draft")
  const text = "pending ".repeat(800)
  host.ui.pasteToEditor(text)
  await waitFor(() => assert.ok(started))
  host.ui.setEditorText("Later edit")
  host.ui.setEditorText("Original draft")
  gate.resolve()
  await waitFor(() => assert.match(host.render(), /Paste retained/))
  assert.equal(host.ui.getEditorText(), "Original draft")
  const recovery = await retainedPaste(host)
  assert.equal(await readFile(join(recovery.path, "../text.txt"), "utf8"), text)
})

test("terminal listeners keep native consumption and transformation ahead of paste policy", async (t) => {
  const host = await nativePi(t, [pastePath])
  host.ui.setEditorText("Draft")
  const stop = host.ui.onTerminalInput(() => ({ consume: true }))
  host.input(`\x1b[200~${"c".repeat(5000)}\x1b[201~`)
  assert.equal(host.ui.getEditorText(), "Draft")
  host.ui.pasteToEditor(" direct")
  assert.equal(host.ui.getEditorText(), "Draft direct")
  stop()
  host.ui.onTerminalInput((data) =>
    data.startsWith("\x1b[200~")
      ? { data: `\x1b[200~${"transformed ".repeat(500)}\x1b[201~` }
      : undefined,
  )
  host.input("\x1b[200~small\x1b[201~")
  const path = await waitFor(() => snapshotPath(host.ui.getEditorText()))
  assert.equal(await readFile(path, "utf8"), "transformed ".repeat(500))
})

test("native extension shortcuts take priority over the clipboard action", async (t) => {
  const clipboard = getNativeClipboard()
  assert.ok(clipboard)
  const reads = t.mock.method(
    clipboard,
    "getText",
    async () => "Unexpected paste",
  )
  t.mock.method(clipboard, "getImage", async () => null)
  const host = await openHost(t, {
    extension(pi) {
      pi.registerShortcut("ctrl+v", {
        description: "Earlier native shortcut",
        handler(ctx) {
          ctx.ui.setEditorText("Shortcut won")
        },
      })
      piPaste(pi)
    },
  })
  await host.key("\x16")
  assert.equal(host.ui.getEditorText(), "Shortcut won")
  assert.equal(reads.mock.callCount(), 0)
})

test("the effective clipboard keybinding reaches paste policy", async (t) => {
  const clipboard = getNativeClipboard()
  assert.ok(clipboard)
  const text = "k".repeat(4999)
  const reads = t.mock.method(clipboard, "getText", async () => text)
  t.mock.method(clipboard, "getImage", async () => null)
  const host = await openHost(t, {
    keybindings: { "app.clipboard.pasteImage": "ctrl+alt+p" },
    extension: piPaste,
  })
  await host.key("\x1b[112;7u")
  assert.equal(host.ui.getEditorText(), text)
  await host.key("\x16")
  assert.equal(reads.mock.callCount(), 1)
  assert.equal(host.ui.getEditorText(), text)
})

test("earlier public clipboard and mouse handlers keep control of their actions", async (t) => {
  const clipboard = getNativeClipboard()
  assert.ok(clipboard)
  const reads = t.mock.method(
    clipboard,
    "getText",
    async () => "Unexpected paste",
  )
  t.mock.method(clipboard, "getImage", async () => null)
  const host = await openHost(t, {
    extension(pi) {
      pi.on("session_start", (_event, ctx) => {
        ctx.ui.setEditorComponent((...args) => {
          const editor = new CustomEditor(...args)
          editor.onPasteImage = () =>
            editor.setText("Earlier clipboard handler")
          editor.handleMouse = (event) => {
            if (event.button === "right") {
              editor.setText("Earlier mouse handler")
              return { handled: true }
            }
          }
          return editor
        })
      })
      piPaste(pi)
    },
  })
  await host.key("\x16")
  assert.equal(host.ui.getEditorText(), "Earlier clipboard handler")
  await host.output()
  await host.key("\x1b[<2;10;21M")
  await host.key("\x1b[<2;10;21m")
  assert.equal(host.ui.getEditorText(), "Earlier mouse handler")
  assert.equal(reads.mock.callCount(), 0)
})

test("right-click paste leaves a separate native input UI in control", async (t) => {
  const clipboard = getNativeClipboard()
  assert.ok(clipboard)
  const reads = t.mock.method(
    clipboard,
    "getText",
    async () => "Unexpected paste",
  )
  t.mock.method(clipboard, "getImage", async () => null)
  const host = await nativePi(t, [pastePath])
  host.ui.setEditorText("Main draft")
  const dialog = host.ui.input("Separate input", "Type here")
  await waitFor(() => assert.match(host.render(), /Separate input/))
  host.input("\x1b[<2;10;27M")
  host.input("\x1b[<2;10;27m")
  host.input("\x1b")
  await dialog
  assert.equal(host.ui.getEditorText(), "Main draft")
  assert.equal(reads.mock.callCount(), 0)
})

for (const failure of [
  "image read",
  "text read",
  "unavailable text",
  "empty text",
]) {
  test(`clipboard ${failure} preserves the draft and the native error distinction`, async (t) => {
    const clipboard = getNativeClipboard()
    assert.ok(clipboard)
    t.mock.method(clipboard, "getImage", async () => {
      if (failure === "image read") throw new Error("Image clipboard failure")
      return null
    })
    const read = t.mock.method(clipboard, "getText", async () => {
      if (failure === "text read") throw new Error("Text clipboard failure")
      if (failure === "unavailable text") return undefined
      return null
    })
    const host = await nativePi(t, [pastePath])
    host.ui.setEditorText("Keep draft")
    host.input("\x16")
    if (failure === "empty text") {
      await waitFor(() => assert.equal(read.mock.callCount(), 1))
      assert.doesNotMatch(host.render(), /Could not paste/)
    } else {
      await waitFor(() => assert.match(host.render(), /Could not paste/))
      if (failure === "image read") assert.equal(read.mock.callCount(), 0)
    }
    assert.equal(host.ui.getEditorText(), "Keep draft")
  })
}

test("autocomplete updates and native application actions survive the paste decorator", async (t) => {
  const host = await nativePi(t, [attachmentsPath, pastePath])
  const factory = host.ui.getEditorComponent()
  host.ui.setEditorComponent((...args) => factory(...args))
  host.ui.setEditorText("!echo draft")
  host.input("\x1b")
  assert.equal(host.ui.getEditorText(), "")
  host.ui.addAutocompleteProvider((current) => ({
    async getSuggestions(...args) {
      if (args[0][args[1]] === "probe")
        return {
          prefix: "probe",
          items: [
            { value: "kept", label: "Updated completion" },
            { value: "other", label: "Other completion" },
          ],
        }
      return current.getSuggestions(...args)
    },
    applyCompletion(...args) {
      if (args[3].value === "kept")
        return { lines: ["Keep suffix"], cursorLine: 0, cursorCol: 5 }
      return current.applyCompletion(...args)
    },
  }))
  host.ui.setEditorText("probe")
  host.input("\t")
  await waitFor(() => assert.match(host.render(), /Updated completion/))
  host.input("\r")
  host.ui.pasteToEditor("inserted ")
  assert.equal(host.ui.getEditorText(), "Keep inserted suffix")
})

test("a pasted attachment submits a readable reference and Pi reads its saved body on demand", async (t) => {
  const host = await nativePi(t, [pastePath])
  const text = "Readable context ".repeat(320)
  host.ui.pasteToEditor(text)
  const path = await waitFor(() => snapshotPath(host.ui.getEditorText()))
  const draft = host.ui.getEditorText().trim()
  const recovery = await retainedPaste(host)
  assert.equal(await readFile(join(recovery.path, "../text.txt"), "utf8"), text)
  host.replies.push({
    index: 0,
    delta: {
      role: "assistant",
      tool_calls: [
        {
          index: 0,
          id: "read-paste",
          type: "function",
          function: { name: "read", arguments: JSON.stringify({ path }) },
        },
      ],
    },
    finish_reason: "tool_calls",
  })
  host.submit()
  await waitFor(() => assert.equal(host.requests.length, 2))
  const user = host.requests[0].messages.find(
    (message) => message.role === "user",
  )
  assert.deepEqual(user.content, [{ type: "text", text: draft }])
  assert.doesNotMatch(JSON.stringify(user.content), /Readable context/)
  const read = host.requests[1].messages.find(
    (message) => message.role === "tool",
  )
  assert.equal(read.content, text)
  await waitFor(() => assert.equal(host.runtime.session.isStreaming, false))
  assert.equal(await readFile(path, "utf8"), text)
  assert.equal(await readFile(join(recovery.path, "../text.txt"), "utf8"), text)
})

test("the native attachment command runs while a response streams and preserves the next draft", async (t) => {
  const host = await openHost(t, {
    holdResponses: true,
    extension(pi) {
      piAttachments(pi)
      piPaste(pi)
    },
  })
  host.ui.setEditorText("Initial request")
  await host.key("\r")
  await waitFor(() => assert.equal(host.requests.length, 1))
  host.ui.setEditorText("Next draft")
  const text = "stream ".repeat(800)
  host.ui.pasteToEditor(text)
  const path = await waitFor(() => snapshotPath(host.ui.getEditorText()))
  assert.match(host.ui.getEditorText(), /^Next draft\n\[Attachment:/)
  assert.equal(await readFile(path, "utf8"), text)
  assert.equal(host.requests.length, 1)
  host.reply()
  await host.settled()
  assert.equal(snapshotPath(host.ui.getEditorText()), path)
})

test("an attachment read finishing after session replacement retains the requesting paste and snapshot", async (t) => {
  const host = await nativePi(t, [attachmentsPath, pastePath])
  const open = fs.open
  const gate = Promise.withResolvers()
  let source
  const mocked = t.mock.method(fs, "open", async (...args) => {
    const file = await open(...args)
    if (
      String(args[0]).startsWith(join(host.agentDir, "pi-paste")) &&
      String(args[0]).endsWith("/paste.txt")
    ) {
      const read = file.readFile.bind(file)
      t.mock.method(file, "readFile", async (...options) => {
        const bytes = await read(...options)
        source = args[0]
        await gate.promise
        return bytes
      })
    }
    return file
  })
  syncBuiltinESMExports()
  t.after(() => {
    gate.resolve()
    mocked.mock.restore()
    syncBuiltinESMExports()
  })
  host.ui.setEditorText("Original attachment draft")
  const sessionId = host.runtime.session.sessionManager.getSessionId()
  const text = "late snapshot ".repeat(500)
  host.ui.pasteToEditor(text)
  await waitFor(() => assert.ok(source, "Attach File read the preserved paste"))
  host.submit("/new")
  await waitFor(() =>
    assert.notEqual(
      host.runtime.session.sessionManager.getSessionId(),
      sessionId,
    ),
  )
  host.ui.setEditorText("New draft")
  gate.resolve()
  const recovery = await waitFor(() => retainedRequest(host))
  assert.equal(host.ui.getEditorText(), "New draft")
  assert.ok(recovery.text.includes(sessionId))
  assert.match(recovery.text, /Original attachment draft/)
  // Recovery metadata precedes the asynchronous snapshot write.
  await waitFor(async () =>
    assert.equal(await readFile(snapshotPath(recovery.text), "utf8"), text),
  )
  assert.equal(await readFile(join(source, "../text.txt"), "utf8"), text)
})

test("overlapping clipboard reads cannot apply an older result to the newer draft", async (t) => {
  const clipboard = getNativeClipboard()
  assert.ok(clipboard)
  const first = Promise.withResolvers()
  const second = Promise.withResolvers()
  let reads = 0
  t.mock.method(clipboard, "getImage", async () => null)
  t.mock.method(clipboard, "getText", () =>
    ++reads === 1 ? first.promise : second.promise,
  )
  t.after(() => {
    first.resolve(null)
    second.resolve(null)
  })
  const host = await nativePi(t, [pastePath])
  host.ui.setEditorText("Draft ")
  host.input("\x16")
  await waitFor(() => assert.equal(reads, 1))
  host.input("\x16")
  await waitFor(() => assert.equal(reads, 2))
  second.resolve("second")
  await waitFor(() => assert.equal(host.ui.getEditorText(), "Draft second"))
  first.resolve("first")
  await waitFor(() => assert.match(host.render(), /Paste retained/))
  assert.equal(host.ui.getEditorText(), "Draft second")
  const recovery = await retainedPaste(host)
  assert.equal(
    await readFile(join(recovery.path, "../text.txt"), "utf8"),
    "first",
  )
})

test("adjacent bracketed frames each receive paste policy", async (t) => {
  const host = await nativePi(t, [pastePath])
  const text = "z".repeat(5000)
  host.input(`\x1b[200~Prefix \x1b[201~\x1b[200~${text}\x1b[201~`)
  const path = await waitFor(() => snapshotPath(host.ui.getEditorText()))
  assert.match(host.ui.getEditorText(), /^Prefix \n\[Attachment:/)
  assert.equal(await readFile(path, "utf8"), text)
})

test("a native command deferred during settlement cannot attach to a later draft", async (t) => {
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
  const agentDir = process.env.PI_CODING_AGENT_DIR
  host.ui.setEditorText("Initial prompt")
  await host.key("\r")
  await waitFor(() => assert.ok(settling))
  host.ui.setEditorText("Requesting draft")
  const text = "deferred ".repeat(700)
  host.ui.pasteToEditor(text)
  const recovery = await waitFor(() => retainedPaste({ agentDir }))
  await host.output()
  host.ui.setEditorText("Later draft")
  gate.resolve()
  await waitFor(async () =>
    assert.match(await host.output(), /Could not attach/),
  )
  assert.equal(host.ui.getEditorText(), "Later draft")
  assert.equal(await readFile(join(recovery.path, "../text.txt"), "utf8"), text)
})

test("the composer's Command+V action routes through native paste policy and replaces its selection", async (t) => {
  const clipboard = getNativeClipboard()
  assert.ok(clipboard)
  const text = "command ".repeat(700)
  t.mock.method(clipboard, "getText", async () => text)
  const host = await nativePi(t, [composerPath, attachmentsPath, pastePath])
  host.ui.setEditorText("Keep selected")
  for (let index = 0; index < 8; index++) host.input("\x1b[1;2D")
  host.input("\x1b[118;9u")
  const path = await waitFor(() => snapshotPath(host.ui.getEditorText()))
  assert.match(host.ui.getEditorText(), /^Keep \n\[Attachment:/)
  assert.equal(await readFile(path, "utf8"), text)
  host.input("\x1b[122;9u")
  assert.equal(host.ui.getEditorText(), "Keep selected")
})
