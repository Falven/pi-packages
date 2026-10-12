import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import fs, {
  chmod,
  mkdir,
  readFile,
  rm,
  utimes,
  writeFile,
} from "node:fs/promises"
import { syncBuiltinESMExports } from "node:module"
import { join } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import {
  holdFileRead,
  nativePi,
  retainedRequest,
  snapshotPath,
  waitFor,
} from "./test-support/native-pi.mjs"

async function restart(host, expected) {
  await host.close()
  await promisify(execFile)(
    process.execPath,
    [
      fileURLToPath(new URL("./test-support/restart-pi.mjs", import.meta.url)),
      JSON.stringify({ directory: host.directory, ...expected }),
    ],
    { timeout: 15000 },
  )
}

test("an unsaved native session keeps its captured attachment and requesting draft across a process restart", async (t) => {
  const host = await nativePi(t)
  const sessionId = host.runtime.session.sessionManager.getSessionId()
  const sessionFile = host.runtime.session.sessionFile
  host.ui.setEditorText("Unsent native draft")
  await host.runtime.session.prompt("/attach-text Captured before any reply")
  const path = snapshotPath(host.ui.getEditorText())

  await assert.rejects(readFile(sessionFile), { code: "ENOENT" })
  const recovery = await retainedRequest(host)
  assert.ok(recovery.text.includes(sessionId))
  assert.ok(recovery.text.includes(sessionFile))
  assert.match(recovery.text, /Unsent native draft/)
  assert.equal(snapshotPath(recovery.text), path)
  assert.equal(await readFile(path, "utf8"), "Captured before any reply")
  await restart(host, {
    sessionId,
    sessionFile,
    persisted: false,
    history: [],
    snapshot: path,
    contents: "Captured before any reply",
    recovery,
  })
})

test("old submitted references survive draft removal, source loss, native resume, and process restart", async (t) => {
  const host = await nativePi(t)
  const source = join(host.directory, "retained.txt")
  await writeFile(source, "Captured file contents.\n")
  host.ui.setEditorText("Use the captured file")
  await host.runtime.session.prompt(`/attach-file ${source}`)
  const draft = host.ui.getEditorText().trim()
  const path = snapshotPath(draft)
  const recovery = await retainedRequest(host)
  const sessionId = host.runtime.session.sessionManager.getSessionId()
  const sessionFile = host.runtime.session.sessionFile
  host.submit()
  await waitFor(() => assert.equal(host.requests.length, 1))
  await waitFor(() => assert.equal(host.runtime.session.isStreaming, false))
  assert.ok((await readFile(sessionFile, "utf8")).includes(path))

  await writeFile(source, "Changed working file")
  await rm(source)
  const old = new Date("2000-01-01T00:00:00Z")
  await utimes(path, old, old)
  host.ui.setEditorText(draft)
  host.ui.setEditorText("")
  assert.doesNotMatch(host.render(), /Attachments \(/)
  host.input("\x1b[45;5u")
  assert.equal(host.ui.getEditorText(), draft)
  assert.match(host.render(), /Attachments \(1\): retained\.txt/)
  assert.equal(await readFile(path, "utf8"), "Captured file contents.\n")
  host.submit("A later request without attachments")
  await waitFor(() => assert.equal(host.requests.length, 2))
  await waitFor(() => assert.equal(host.runtime.session.isStreaming, false))

  host.submit("/new")
  await waitFor(() =>
    assert.notEqual(
      host.runtime.session.sessionManager.getSessionId(),
      sessionId,
    ),
  )
  host.submit("/resume")
  await waitFor(() => assert.match(host.render(), /Use the captured file/))
  host.input("\r")
  await waitFor(() => assert.match(host.render(), /Resumed session/))
  assert.equal(host.runtime.session.sessionManager.getSessionId(), sessionId)
  assert.equal(host.ui.getEditorText(), "")
  const history = [draft, "A later request without attachments"]
  assert.deepEqual(
    host.runtime.session.getUserMessagesForForking().map(({ text }) => text),
    history,
  )
  assert.equal(await readFile(path, "utf8"), "Captured file contents.\n")
  await restart(host, {
    sessionId,
    sessionFile,
    persisted: true,
    history,
    snapshot: path,
    contents: "Captured file contents.\n",
    recovery,
  })
})

test("native fork prefills the submitted reference and the child survives restart without its parent file", async (t) => {
  const host = await nativePi(t)
  host.submit("Earlier request")
  await waitFor(() => assert.equal(host.requests.length, 1))
  await waitFor(() => assert.equal(host.runtime.session.isStreaming, false))
  const source = join(host.directory, "forked.txt")
  await writeFile(source, "Captured for the fork.\n")
  host.ui.setEditorText("Review the captured file")
  await host.runtime.session.prompt(`/attach-file ${source}`)
  const draft = host.ui.getEditorText().trim()
  const path = snapshotPath(draft)
  const recovery = await retainedRequest(host)
  const parentId = host.runtime.session.sessionManager.getSessionId()
  const parentFile = host.runtime.session.sessionFile
  host.submit()
  await waitFor(() => assert.equal(host.requests.length, 2))
  await waitFor(() => assert.equal(host.runtime.session.isStreaming, false))
  await writeFile(source, "Changed after submission")
  await rm(source)

  host.ui.setEditorText("Later unsent parent draft")
  host.submit("/fork")
  await waitFor(() => assert.match(host.render(), /Fork from Message/))
  host.input("\r")
  await waitFor(() => assert.match(host.render(), /Forked to new session/))
  const sessionId = host.runtime.session.sessionManager.getSessionId()
  const sessionFile = host.runtime.session.sessionFile
  assert.notEqual(sessionId, parentId)
  assert.equal(host.ui.getEditorText(), draft)
  assert.match(host.render(), /Attachments \(1\): forked\.txt/)
  assert.equal(await readFile(path, "utf8"), "Captured for the fork.\n")
  assert.deepEqual(
    host.runtime.session.getUserMessagesForForking().map(({ text }) => text),
    ["Earlier request"],
  )

  host.submit()
  await waitFor(() => assert.equal(host.requests.length, 3))
  await waitFor(() => assert.equal(host.runtime.session.isStreaming, false))
  const history = ["Earlier request", draft]
  assert.deepEqual(
    host.runtime.session.getUserMessagesForForking().map(({ text }) => text),
    history,
  )
  await rm(parentFile)
  await restart(host, {
    sessionId,
    sessionFile,
    persisted: true,
    history,
    snapshot: path,
    contents: "Captured for the fork.\n",
    recovery,
  })
})

test("native clone retains submitted references after its parent and original source are removed", async (t) => {
  const host = await nativePi(t)
  const source = join(host.directory, "cloned.txt")
  await writeFile(source, "Captured for both sessions.\n")
  await host.runtime.session.prompt(`/attach-file ${source}`)
  const draft = host.ui.getEditorText().trim()
  const path = snapshotPath(draft)
  const recovery = await retainedRequest(host)
  const parentId = host.runtime.session.sessionManager.getSessionId()
  const parentFile = host.runtime.session.sessionFile
  host.submit()
  await waitFor(() => assert.equal(host.requests.length, 1))
  await waitFor(() => assert.equal(host.runtime.session.isStreaming, false))
  await rm(source)

  host.ui.setEditorText("Unsent parent draft")
  host.submit("/clone")
  await waitFor(() => assert.match(host.render(), /Cloned to new session/))
  const sessionId = host.runtime.session.sessionManager.getSessionId()
  const sessionFile = host.runtime.session.sessionFile
  assert.notEqual(sessionId, parentId)
  assert.equal(host.ui.getEditorText(), "")
  assert.deepEqual(
    host.runtime.session.getUserMessagesForForking().map(({ text }) => text),
    [draft],
  )
  assert.equal(await readFile(path, "utf8"), "Captured for both sessions.\n")
  await rm(parentFile)
  await restart(host, {
    sessionId,
    sessionFile,
    persisted: true,
    history: [draft],
    snapshot: path,
    contents: "Captured for both sessions.\n",
    recovery,
  })
})

test("a pending capture keeps its original unsaved draft association after session replacement and restart", async (t) => {
  const host = await nativePi(t)
  const source = join(host.directory, "pending.txt")
  await writeFile(source, "Captured before replacement.\n")
  host.ui.setEditorText("Requesting draft")
  const sessionId = host.runtime.session.sessionManager.getSessionId()
  const sessionFile = host.runtime.session.sessionFile
  const held = holdFileRead(t, source)
  const pending = host.runtime.session.prompt(`/attach-file ${source}`)
  await held.started()
  await rm(source)
  host.submit("/new")
  await waitFor(() =>
    assert.notEqual(
      host.runtime.session.sessionManager.getSessionId(),
      sessionId,
    ),
  )
  host.ui.setEditorText("Unrelated replacement draft")
  held.release()
  await pending

  assert.equal(host.ui.getEditorText(), "Unrelated replacement draft")
  const recovery = await retainedRequest(host)
  assert.ok(recovery.text.includes(sessionId))
  assert.ok(recovery.text.includes(sessionFile))
  assert.match(recovery.text, /Requesting draft/)
  assert.doesNotMatch(recovery.text, /Unrelated replacement draft/)
  await assert.rejects(readFile(sessionFile), { code: "ENOENT" })
  const path = snapshotPath(recovery.text)
  assert.equal(await readFile(path, "utf8"), "Captured before replacement.\n")
  await restart(host, {
    sessionId,
    sessionFile,
    persisted: false,
    history: [],
    snapshot: path,
    contents: "Captured before replacement.\n",
    recovery,
  })
})

test("a late snapshot write error preserves saved bytes and their original draft association", async (t) => {
  const host = await nativePi(t)
  const source = join(host.directory, "uncertain-write.txt")
  await writeFile(source, "Bytes saved before the write reported failure.\n")
  host.ui.setEditorText("Draft before the failed write")
  const sessionId = host.runtime.session.sessionManager.getSessionId()
  const sessionFile = host.runtime.session.sessionFile
  const write = fs.writeFile
  const gate = Promise.withResolvers()
  let started = false
  const mocked = t.mock.method(fs, "writeFile", async (...args) => {
    await write(...args)
    if (
      typeof args[0] === "string" &&
      args[0].startsWith(host.agentDir) &&
      args[0].endsWith("/uncertain-write.txt")
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
  const pending = host.runtime.session.prompt(`/attach-file ${source}`)
  await waitFor(() => assert.ok(started))
  await rm(source)
  await host.runtime.newSession()
  host.ui.setEditorText("Unrelated replacement draft")
  gate.reject(new Error("Snapshot write failed after saving bytes"))
  await pending

  assert.equal(host.ui.getEditorText(), "Unrelated replacement draft")
  assert.match(host.render(), /Snapshot write failed/)
  const recovery = await retainedRequest(host)
  assert.ok(recovery.text.includes(sessionId))
  assert.ok(recovery.text.includes(sessionFile))
  assert.match(recovery.text, /Draft before the failed write/)
  assert.doesNotMatch(recovery.text, /Unrelated replacement draft/)
  const path = snapshotPath(recovery.text)
  assert.equal(
    await readFile(path, "utf8"),
    "Bytes saved before the write reported failure.\n",
  )
})

test("a captured file remains recoverable when all snapshot writes fail after shutdown", async (t) => {
  const host = await nativePi(t, [
    fileURLToPath(new URL("../pi-composer/src/index.ts", import.meta.url)),
    fileURLToPath(new URL("../pi-paste/src/index.ts", import.meta.url)),
  ])
  const source = join(host.directory, "late.bin")
  const bytes = Buffer.from([0, 1, 255, 13, 10, 9, 128])
  await writeFile(source, bytes)
  const draft = "**Requesting draft** /skill:review @source.ts"
  host.ui.setEditorText(draft)
  host.input("\x1b[97;9u")
  const sessionId = host.runtime.session.sessionManager.getSessionId()
  const sessionFile = host.runtime.session.sessionFile
  const storage = join(host.agentDir, "pi-attachments")
  await mkdir(storage)
  const held = holdFileRead(t, source)
  const pending = host.runtime.session.sendUserMessage(
    `/attach-file ${source}`,
    {
      expandPromptTemplates: true,
    },
  )
  await held.started()
  await rm(source)
  await host.runtime.newSession()
  host.ui.setEditorText("Unrelated current draft")
  await chmod(storage, 0o500)
  try {
    held.release()
    await pending
    assert.equal(host.ui.getEditorText(), "Unrelated current draft")
    await host.runtime.session.reload()
    assert.equal(host.ui.getEditorText(), "Unrelated current draft")
  } finally {
    await chmod(storage, 0o700)
  }

  host.input("\x1b[1;4D")
  await host.runtime.session.sendUserMessage("/attachments-recover", {
    expandPromptTemplates: true,
  })
  const recovery = await retainedRequest(host, draft)
  assert.ok(recovery.text.includes(sessionId))
  assert.ok(recovery.text.includes(sessionFile))
  assert.ok(recovery.text.includes(host.directory))
  assert.deepEqual(await readFile(snapshotPath(recovery.text)), bytes)
  assert.equal(host.ui.getEditorText(), "Unrelated current draft")
  host.input("kept")
  assert.equal(host.ui.getEditorText(), "Unrelated current kept")
  assert.deepEqual(await readFile(snapshotPath(recovery.text)), bytes)
})
