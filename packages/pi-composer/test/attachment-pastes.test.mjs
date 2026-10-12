import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import fs, { readFile, readdir, stat, writeFile } from "node:fs/promises"
import { syncBuiltinESMExports } from "node:module"
import { join } from "node:path"
import { beforeEach, test } from "node:test"
import { fileURLToPath } from "node:url"
import { CustomEditor } from "@earendil-works/pi-coding-agent"
import { getNativeClipboard, StdinBuffer } from "@earendil-works/pi-tui"
import {
  nativePi,
  retainedRequest,
  snapshotPath,
  waitFor,
} from "../../pi-attachments/test-support/native-pi.mjs"

const composerPath = fileURLToPath(new URL("../src/index.ts", import.meta.url))
const pastePath = fileURLToPath(
  new URL("../../pi-paste/src/index.ts", import.meta.url),
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

function holdSnapshotWrite(t, host) {
  const write = fs.writeFile
  const gate = Promise.withResolvers()
  let path
  const mocked = t.mock.method(fs, "writeFile", async (...args) => {
    if (
      !path &&
      String(args[0]).startsWith(join(host.agentDir, "pi-attachments")) &&
      String(args[0]).endsWith("/paste.txt")
    ) {
      path = args[0]
      const failure = await gate.promise
      if (failure) throw failure
    }
    return write(...args)
  })
  syncBuiltinESMExports()
  t.after(() => {
    gate.resolve()
    mocked.mock.restore()
    syncBuiltinESMExports()
  })
  return {
    started: () =>
      waitFor(() => {
        assert.ok(path, "the attachment snapshot write must start")
        return path
      }),
    release: gate.resolve,
  }
}

test("snapshot failure preserves the selected draft and captured bytes for one undoable retry", async (t) => {
  const host = await nativePi(t, [composerPath, pastePath])
  const capture = holdSnapshotWrite(t, host)
  await host.runtime.session.sendUserMessage("/attach-text Existing context", {
    expandPromptTemplates: true,
  })
  const originalReference = host.ui.getEditorText().trim()
  const originalPath = snapshotPath(originalReference)
  const before = `Keep\n${originalReference}\nselected`
  const sessionId = host.runtime.session.sessionManager.getSessionId()
  host.ui.setEditorText(before)
  host.input("\x1b[1;10D")
  const text = `\n\t${"captured context\r\n".repeat(350)}`
  host.ui.pasteToEditor(text)
  const failedPath = await capture.started()
  capture.release(new Error("Controlled snapshot write failure"))
  await waitFor(() => assert.match(host.render(), /Could not attach/))
  assert.equal(host.ui.getEditorText(), before)
  await assert.rejects(stat(failedPath), { code: "ENOENT" })
  assert.equal(await readFile(originalPath, "utf8"), "Existing context")
  const staging = join(host.agentDir, "pi-paste")
  const staged = (await readdir(staging, { recursive: true })).filter((path) =>
    path.endsWith("/text.txt"),
  )
  assert.equal(staged.length, 1)
  assert.equal(await readFile(join(staging, staged[0]), "utf8"), text)
  const request = await readFile(
    join(staging, staged[0], "../request.md"),
    "utf8",
  )
  assert.ok(request.includes(sessionId))
  assert.ok(request.includes(before))

  host.input("\r")
  const reference = await waitFor(() => {
    const draft = host.ui.getEditorText()
    assert.notEqual(draft, before)
    return draft.slice(`Keep\n${originalReference}\n`.length).trim()
  })
  const path = snapshotPath(reference)
  const after = `Keep\n${originalReference}\n\n${reference}\n`
  assert.equal(host.ui.getEditorText(), after)
  assert.equal(await readFile(path, "utf8"), text)
  assert.match(host.render(), /Attachments \(2\): text\.txt, paste\.txt/)
  host.input("\x1b[122;9u")
  assert.equal(host.ui.getEditorText(), before)
  assert.match(host.render(), /Attachments \(1\): text\.txt/)
  host.input("\x1b[122;10u")
  assert.equal(host.ui.getEditorText(), after)
  assert.equal(await readFile(path, "utf8"), text)
})

for (const [route, extensions] of [
  ["extension", [composerPath, pastePath]],
  ["terminal", [composerPath, attachmentsPath, pastePath]],
  ["Command+V", [composerPath, pastePath]],
]) {
  for (const view of ["source", "formatted"]) {
    test(`${route} attachment paste replaces ${view} text and membership in one captured edit`, async (t) => {
      const text = `\t${"😀".repeat(2499)}\r\n`
      if (route === "Command+V") {
        const clipboard = getNativeClipboard()
        assert.ok(clipboard)
        t.mock.method(clipboard, "getText", async () => text)
      }
      const host = await nativePi(t, extensions)
      const capture = holdSnapshotWrite(t, host)
      const edits = []
      const previous = host.ui.getEditorComponent()
      host.ui.setEditorComponent((...args) => {
        const editor = previous(...args)
        return new Proxy(editor, {
          set(target, property, value) {
            if (property === "onChange") {
              target.onChange = (draft) => {
                edits.push({
                  text: draft,
                  contents: [
                    ...draft.matchAll(/\[Attachment: [^\]]+\]\(<([^>]+)>\)/g),
                  ].map((match) => readFileSync(match[1], "utf8")),
                })
                value?.(draft)
              }
              return true
            }
            return Reflect.set(target, property, value)
          },
        })
      })
      const source = join(host.directory, "original.txt")
      await writeFile(source, "Original attachment contents\n")
      await host.runtime.session.sendUserMessage(`/attach-file ${source}`, {
        expandPromptTemplates: true,
      })
      const originalReference = host.ui.getEditorText().trim()
      const originalPath = snapshotPath(originalReference)
      const before = `Keep /skill:review @"source file.md"\n${originalReference} **old**\nTail`
      host.ui.setEditorText(before)
      if (view === "source") host.input("\x1b[109;10u")
      host.input("\x1b[1;9D")
      host.input("\x1b[D")
      host.input("\x1b[1;10D")
      edits.length = 0

      if (route === "extension") host.ui.pasteToEditor(text)
      else if (route === "Command+V") host.input("\x1b[118;9u")
      else {
        const stdin = new StdinBuffer()
        t.after(() => stdin.destroy())
        stdin.on("data", host.input)
        stdin.on("paste", (payload) =>
          host.input(`\x1b[200~${payload}\x1b[201~`),
        )
        stdin.process("\x1b[2")
        stdin.process("00~" + text.slice(0, 2000))
        stdin.process(text.slice(2000) + "\x1b[20")
        assert.equal(host.ui.getEditorText(), before)
        assert.deepEqual(edits, [])
        stdin.process("1~")
      }
      const pendingPath = await capture.started()
      assert.equal(host.ui.getEditorText(), before)
      assert.deepEqual(edits, [])
      assert.match(host.render(), /Attachments \(1\): original\.txt/)
      await assert.rejects(stat(pendingPath), { code: "ENOENT" })

      capture.release()
      const path = await waitFor(() => {
        const candidate = snapshotPath(host.ui.getEditorText())
        assert.notEqual(candidate, originalPath)
        return candidate
      })
      const reference = `[Attachment: paste.txt](<${path}>)`
      const after = `Keep /skill:review @"source file.md"\n\n${reference}\n\nTail`
      assert.deepEqual(
        edits.map((edit) => edit.text),
        [after],
      )
      assert.deepEqual(edits[0].contents, [text])
      assert.equal(await readFile(path, "utf8"), text)
      assert.equal(
        await readFile(originalPath, "utf8"),
        "Original attachment contents\n",
      )
      assert.match(host.render(), /Attachments \(1\): paste\.txt/)
      assert.equal(host.requests.length, 0)

      host.input("\x1b[109;10u")
      host.input("\x1b[122;9u")
      assert.equal(host.ui.getEditorText(), before)
      assert.match(host.render(), /Attachments \(1\): original\.txt/)
      assert.equal(await readFile(path, "utf8"), text)
      host.input("\x1b[122;10u")
      assert.equal(host.ui.getEditorText(), after)
      assert.match(host.render(), /Attachments \(1\): paste\.txt/)
      assert.equal(await readFile(path, "utf8"), text)
    })
  }
}

test("a paste over a complete formatted attachment replaces its reference without nesting links", async (t) => {
  const host = await nativePi(t, [composerPath, attachmentsPath, pastePath])
  await host.runtime.session.sendUserMessage("/attach-text Original context", {
    expandPromptTemplates: true,
  })
  const originalReference = host.ui.getEditorText().trim()
  const originalPath = snapshotPath(originalReference)
  const before = `Keep\n${originalReference}\nTail`
  host.ui.setEditorText(before)
  host.input("\x1b[1;9D")
  host.input("\x1b[D")
  host.input("\x1b[1;10D")
  const text = "New context\n".repeat(500)
  host.ui.pasteToEditor(text)
  const path = await waitFor(() => {
    const candidate = snapshotPath(host.ui.getEditorText())
    assert.notEqual(candidate, originalPath)
    return candidate
  })
  const after = `Keep\n\n[Attachment: paste.txt](<${path}>)\n\nTail`
  assert.equal(host.ui.getEditorText(), after)
  assert.match(host.render(), /Attachments \(1\): paste\.txt/)
  host.input("\x1b[122;9u")
  assert.equal(host.ui.getEditorText(), before)
  host.input("\x1b[122;10u")
  assert.equal(host.ui.getEditorText(), after)
  assert.equal(await readFile(path, "utf8"), text)
  assert.equal(await readFile(originalPath, "utf8"), "Original context")
})

for (const change of [
  "later edit",
  "cursor move",
  "selection change",
  "reverted edit",
]) {
  test(`a snapshot finishing after a ${change} preserves the target and requested text`, async (t) => {
    const host = await nativePi(t, [composerPath, attachmentsPath, pastePath])
    const capture = holdSnapshotWrite(t, host)
    await host.runtime.session.sendUserMessage(
      "/attach-text Existing context",
      {
        expandPromptTemplates: true,
      },
    )
    const originalReference = host.ui.getEditorText().trim()
    const originalPath = snapshotPath(originalReference)
    const before = `Keep\n${originalReference}\nselected`
    const sessionId = host.runtime.session.sessionManager.getSessionId()
    host.ui.setEditorText(before)
    host.input("\x1b[1;10D")
    const text = `\t${"captured context\r\n".repeat(350)}`
    host.ui.pasteToEditor(text)
    const path = await capture.started()
    assert.equal(host.ui.getEditorText(), before)
    if (change === "later edit") host.input("later")
    else if (change === "cursor move") host.input("\x1b[D")
    else if (change === "selection change") host.input("\x1b[97;9u")
    else {
      host.ui.setEditorText("Intervening edit")
      host.ui.setEditorText(before)
    }
    const after =
      change === "later edit" ? `Keep\n${originalReference}\nlater` : before
    assert.equal(host.ui.getEditorText(), after)
    capture.release()
    await waitFor(() => assert.match(host.render(), /Snapshot retained/))
    assert.equal(host.ui.getEditorText(), after)
    const recovery = await retainedRequest(host, before)
    assert.ok(recovery.text.includes(sessionId))
    assert.ok(recovery.text.includes(path))
    assert.equal(await readFile(path, "utf8"), text)
    assert.equal(await readFile(originalPath, "utf8"), "Existing context")
    assert.match(host.render(), /Attachments \(1\): text\.txt/)
    let edited = after
    if (change !== "later edit") {
      host.input("placed")
      edited =
        change === "cursor move"
          ? `Keep\n${originalReference}\nplacedselected`
          : change === "selection change"
            ? "placed"
            : `${before}placed`
      assert.equal(host.ui.getEditorText(), edited)
    }
    host.input("\x1b[122;9u")
    assert.equal(host.ui.getEditorText(), before)
    host.input("\x1b[122;10u")
    assert.equal(host.ui.getEditorText(), edited)
  })
}

for (const replacement of ["recreated", "reused", "replaced"]) {
  test(`a snapshot prepared for a ${replacement} editor retains its original target`, async (t) => {
    const host = await nativePi(t, [composerPath, pastePath])
    const capture = holdSnapshotWrite(t, host)
    const previous = host.ui.getEditorComponent()
    let editor
    const factory = (...args) => {
      editor = previous(...args)
      return editor
    }
    host.ui.setEditorComponent(factory)
    const before = "Keep **selected**"
    host.ui.setEditorText(before)
    host.input("\x1b[1;10D")
    const text = "Prepared for the original editor\n".repeat(180)
    host.ui.pasteToEditor(text)
    const path = await capture.started()
    const originalEditor = editor
    if (replacement === "recreated") host.ui.setEditorComponent(factory)
    else if (replacement === "reused") host.ui.setEditorComponent(() => editor)
    else host.ui.setEditorComponent((...args) => new CustomEditor(...args))
    assert.equal(host.ui.getEditorText(), before)
    capture.release()
    await waitFor(() => assert.match(host.render(), /Snapshot retained/))
    assert.equal(host.ui.getEditorText(), before)
    assert.equal(originalEditor.getText(), before)
    const recovery = await retainedRequest(host, before)
    assert.ok(recovery.text.includes(path))
    assert.equal(await readFile(path, "utf8"), text)
    assert.doesNotMatch(host.render(), /Attachments \(/)
  })
}

test("a capture finishing across a native session switch preserves both drafts and the requesting snapshot", async (t) => {
  const host = await nativePi(t, [composerPath, attachmentsPath, pastePath])
  const capture = holdSnapshotWrite(t, host)
  host.submit("Persist this session")
  await waitFor(() => {
    assert.equal(host.requests.length, 1)
    assert.equal(host.runtime.session.isStreaming, false)
  })
  await host.runtime.session.sendUserMessage(
    "/attach-text Original session context",
    {
      expandPromptTemplates: true,
    },
  )
  const originalReference = host.ui.getEditorText().trim()
  const originalPath = snapshotPath(originalReference)
  const before = `Keep\n${originalReference}\nselected`
  host.ui.setEditorText(before)
  host.input("\x1b[1;10D")
  const manager = host.runtime.session.sessionManager
  const sessionId = manager.getSessionId()
  const sessionFile = manager.getSessionFile()
  const text = `\t${"Original session capture\r\n".repeat(210)}`
  host.ui.pasteToEditor(text)
  const path = await capture.started()
  assert.deepEqual(await host.runtime.newSession(), { cancelled: false })
  assert.notEqual(host.runtime.session.sessionManager.getSessionId(), sessionId)
  host.ui.setEditorText("Other session draft")
  capture.release()
  await waitFor(async () => assert.equal(await readFile(path, "utf8"), text))
  assert.equal(host.ui.getEditorText(), "Other session draft")
  assert.doesNotMatch(host.render(), /Attachments \(/)
  const recovery = await retainedRequest(host, before)
  assert.ok(recovery.text.includes(sessionId))
  assert.ok(recovery.text.includes(path))
  assert.equal(await readFile(originalPath, "utf8"), "Original session context")

  assert.deepEqual(await host.runtime.switchSession(sessionFile), {
    cancelled: false,
  })
  assert.equal(host.ui.getEditorText(), before)
  assert.match(host.render(), /Attachments \(1\): text\.txt/)
  assert.equal(await readFile(path, "utf8"), text)
})

test("submission during snapshot preparation sends the old membership and preserves the next draft", async (t) => {
  const host = await nativePi(t, [composerPath, pastePath])
  const capture = holdSnapshotWrite(t, host)
  await host.runtime.session.sendUserMessage("/attach-text Submitted context", {
    expandPromptTemplates: true,
  })
  const originalReference = host.ui.getEditorText().trim()
  const originalPath = snapshotPath(originalReference)
  const before = `Keep\n${originalReference}\nselected`
  host.ui.setEditorText(before)
  host.input("\x1b[1;10D")
  const text = "Captured before submission\n".repeat(220)
  host.ui.pasteToEditor(text)
  const path = await capture.started()
  host.submit()
  await waitFor(() => {
    assert.equal(host.requests.length, 1)
    assert.equal(host.runtime.session.isStreaming, false)
  })
  assert.deepEqual(host.users[0].content, [{ type: "text", text: before }])
  assert.equal(host.ui.getEditorText(), "")
  host.ui.setEditorText("Next draft")
  capture.release()
  await waitFor(() => assert.match(host.render(), /Snapshot retained/))
  assert.equal(host.ui.getEditorText(), "Next draft")
  const recovery = await retainedRequest(host, before)
  assert.ok(recovery.text.includes(path))
  assert.equal(await readFile(path, "utf8"), text)
  assert.equal(await readFile(originalPath, "utf8"), "Submitted context")
  assert.equal(host.requests.length, 1)
  host.input("\x1b[122;9u")
  assert.equal(host.ui.getEditorText(), "")
  host.input("\x1b[122;10u")
  assert.equal(host.ui.getEditorText(), "Next draft")
})

test("Paste Inline replaces formatted attachment membership without retaining its old link or applying the cutoff", async (t) => {
  const clipboard = getNativeClipboard()
  assert.ok(clipboard)
  const text = "inline ".repeat(750).trimEnd()
  t.mock.method(clipboard, "getText", async () => text)
  const host = await nativePi(t, [composerPath, attachmentsPath, pastePath])
  await host.runtime.session.sendUserMessage("/attach-text Original context", {
    expandPromptTemplates: true,
  })
  const originalReference = host.ui.getEditorText().trim()
  const originalPath = snapshotPath(originalReference)
  const before = `Keep\n${originalReference} **old**\nTail`
  host.ui.setEditorText(before)
  host.input("\x1b[1;9D")
  host.input("\x1b[D")
  host.input("\x1b[1;10D")
  await host.runtime.session.sendUserMessage("/paste-inline", {
    expandPromptTemplates: true,
  })
  const after = `Keep\n${text}\nTail`
  assert.equal(host.ui.getEditorText(), after)
  assert.doesNotMatch(host.render(), /Attachments \(|\[paste #/)
  host.input("\x1b[122;9u")
  assert.equal(host.ui.getEditorText(), before)
  assert.match(host.render(), /Attachments \(1\): text\.txt/)
  host.input("\x1b[122;10u")
  assert.equal(host.ui.getEditorText(), after)
  assert.equal(await readFile(originalPath, "utf8"), "Original context")
})

test("Attach Text replaces a formatted attachment selection with short captured text in one edit", async (t) => {
  const host = await nativePi(t, [composerPath, pastePath])
  await host.runtime.session.sendUserMessage("/attach-text Original context", {
    expandPromptTemplates: true,
  })
  const originalReference = host.ui.getEditorText().trim()
  const originalPath = snapshotPath(originalReference)
  const before = `Keep\n${originalReference}\nTail`
  host.ui.setEditorText(before)
  host.input("\x1b[1;9D")
  host.input("\x1b[D")
  host.input("\x1b[1;10D")
  host.input("\x1b[116;7u")
  await waitFor(() => assert.match(host.render(), /Attach text/))
  host.input("\x1b[200~\nShort context\n\x1b[201~")
  host.input("\r")
  const path = await waitFor(() => {
    const candidate = snapshotPath(host.ui.getEditorText())
    assert.notEqual(candidate, originalPath)
    return candidate
  })
  const after = `Keep\n\n[Attachment: text.txt](<${path}>)\n\nTail`
  assert.equal(host.ui.getEditorText(), after)
  assert.equal(await readFile(path, "utf8"), "\nShort context\n")
  assert.match(host.render(), /Attachments \(1\): text\.txt/)
  host.input("\x1b[122;9u")
  assert.equal(host.ui.getEditorText(), before)
  host.input("\x1b[122;10u")
  assert.equal(host.ui.getEditorText(), after)
  assert.equal(await readFile(originalPath, "utf8"), "Original context")
})

test("a deferred native attachment command cannot commit after its selected target moves", async (t) => {
  const gate = Promise.withResolvers()
  let settling = false
  t.after(() => gate.resolve())
  const host = await nativePi(t, [composerPath, attachmentsPath, pastePath], {
    extensionFactories: [
      (pi) => {
        pi.on("agent_settled", async () => {
          settling = true
          await gate.promise
        })
      },
    ],
  })
  await host.runtime.session.sendUserMessage("/attach-text Existing context", {
    expandPromptTemplates: true,
  })
  const originalReference = host.ui.getEditorText().trim()
  const originalPath = snapshotPath(originalReference)
  host.submit("Initial request")
  await waitFor(() => assert.ok(settling))
  const before = `Keep\n${originalReference}\nselected`
  host.ui.setEditorText(before)
  host.input("\x1b[1;10D")
  const text = "Deferred captured text\n".repeat(240)
  host.ui.pasteToEditor(text)
  const storage = join(host.agentDir, "pi-paste")
  const source = await waitFor(async () => {
    const entries = await readdir(storage, { recursive: true })
    const entry = entries.find((path) => path.endsWith("/paste.txt"))
    assert.ok(entry, "the native command must have its source ready")
    return join(storage, entry)
  })
  assert.equal(await readFile(source, "utf8"), text)
  assert.equal(host.ui.getEditorText(), before)
  host.input("\x1b[D")
  await assert.rejects(stat(source), { code: "ENOENT" })
  gate.resolve()
  await waitFor(() => assert.match(host.render(), /Could not attach/))
  assert.equal(host.ui.getEditorText(), before)
  assert.equal(await readFile(join(source, "../text.txt"), "utf8"), text)
  const request = await readFile(join(source, "../request.md"), "utf8")
  assert.ok(request.includes(before))
  assert.equal(await readFile(originalPath, "utf8"), "Existing context")
  assert.match(host.render(), /Attachments \(1\): text\.txt/)
  host.input("placed")
  assert.equal(
    host.ui.getEditorText(),
    `Keep\n${originalReference}\nplacedselected`,
  )
  host.input("\x1b[122;9u")
  assert.equal(host.ui.getEditorText(), before)
})

test("effective completion providers keep their edits and caret across attachment decorators", async (t) => {
  const host = await nativePi(t, [composerPath, attachmentsPath, pastePath])
  host.ui.addAutocompleteProvider((current) => ({
    getSuggestions(...args) {
      if (args[0][args[1]] === "probe")
        return {
          prefix: "probe",
          items: [
            { value: "chosen", label: "Earlier completion" },
            { value: "other", label: "Other completion" },
          ],
        }
      return current.getSuggestions(...args)
    },
    applyCompletion(...args) {
      if (args[3].value === "chosen")
        return { lines: ["Keep selected tail"], cursorLine: 0, cursorCol: 5 }
      return current.applyCompletion(...args)
    },
  }))
  const previous = host.ui.getEditorComponent()
  host.ui.setEditorComponent((...args) => previous(...args))
  host.ui.addAutocompleteProvider((current) => ({
    async getSuggestions(...args) {
      const result = await current.getSuggestions(...args)
      return (
        result && {
          ...result,
          items: result.items.map((item) =>
            Object.assign({}, item, {
              label: `Later: ${item.label}`,
            }),
          ),
        }
      )
    },
    applyCompletion: (...args) => current.applyCompletion(...args),
  }))
  host.ui.setEditorText("probe")
  host.input("\t")
  await waitFor(() => assert.match(host.render(), /Later: Earlier completion/))
  host.input("\r")
  assert.equal(host.ui.getEditorText(), "Keep selected tail")
  host.input("\x1b[1;4C")
  const text = "Completion context\n".repeat(300)
  host.ui.pasteToEditor(text)
  const path = await waitFor(() => snapshotPath(host.ui.getEditorText()))
  const after = `Keep \n[Attachment: paste.txt](<${path}>)\n tail`
  assert.equal(host.ui.getEditorText(), after)
  assert.equal(await readFile(path, "utf8"), text)
  host.input("\x1b[122;9u")
  assert.equal(host.ui.getEditorText(), "Keep selected tail")
  host.input("\x1b[122;9u")
  assert.equal(host.ui.getEditorText(), "probe")
  host.input("\x1b[122;10u")
  host.input("\x1b[122;10u")
  assert.equal(host.ui.getEditorText(), after)
})

test("native listeners retain consumption and transformation order before a selected attachment paste", async (t) => {
  const host = await nativePi(t, [composerPath, pastePath])
  const captured = "Earlier listener context\n".repeat(230)
  const text = `${captured}Later listener context\n`
  host.ui.onTerminalInput((data) => {
    if (data === "\x1b[200~blocked\x1b[201~") return { consume: true }
    if (data === "\x1b[200~raw\x1b[201~")
      return { data: `\x1b[200~${captured}\x1b[201~` }
  })
  const previous = host.ui.getEditorComponent()
  host.ui.setEditorComponent((...args) => previous(...args))
  host.ui.onTerminalInput((data) =>
    data === `\x1b[200~${captured}\x1b[201~`
      ? { data: `\x1b[200~${text}\x1b[201~` }
      : undefined,
  )
  host.ui.setEditorText("Keep selected")
  host.input("\x1b[1;4D")
  host.input("\x1b[200~blocked\x1b[201~")
  assert.equal(host.ui.getEditorText(), "Keep selected")
  host.input("\x1b[200~raw\x1b[201~")
  const path = await waitFor(() => snapshotPath(host.ui.getEditorText()))
  const after = `Keep \n[Attachment: paste.txt](<${path}>)\n`
  assert.equal(host.ui.getEditorText(), after)
  assert.equal(await readFile(path, "utf8"), text)
  host.input("\x1b[122;9u")
  assert.equal(host.ui.getEditorText(), "Keep selected")
  host.input("\x1b[122;10u")
  assert.equal(host.ui.getEditorText(), after)
})
