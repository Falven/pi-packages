import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import type { PathLike } from "node:fs"
import filesystem, {
  access,
  chmod,
  mkdir,
  readFile,
  readdir,
} from "node:fs/promises"
import { syncBuiltinESMExports } from "node:module"
import { join } from "node:path"
import { test } from "node:test"
import { promisify } from "node:util"
import { openHost } from "../fixtures/host.ts"

const restart = (options: {
  directory: string
  sessionFile: string
  text: string
  recover?: boolean
}) => {
  const environment = { ...process.env }
  delete environment["NODE_TEST_CONTEXT"]
  return promisify(execFile)(
    process.execPath,
    [
      new URL("../fixtures/restart-session.ts", import.meta.url).pathname,
      JSON.stringify(options),
    ],
    { env: environment },
  )
}

test("native session switches restore each draft with its reference text intact", async (t) => {
  const host = await openHost(t, { persistSession: true })
  host.ui.setEditorText("Start session A")
  await host.key("\r")
  await host.settled()
  const sessionA = host.session.sessionFile!
  const draftA =
    "Read @src/index.ts with /skill:review\n[Attachment: notes](</tmp/saved notes.txt>)"
  host.ui.setEditorText(draftA)

  assert.deepEqual(await host.runtime.newSession(), { cancelled: false })
  assert.equal(host.ui.getEditorText(), "")
  host.ui.setEditorText("Start session B")
  await host.key("\r")
  await t.waitFor(() => assert.equal(host.requests.length, 2))
  await host.settled()
  const sessionB = host.session.sessionFile!
  host.ui.setEditorText("Only session B")

  assert.deepEqual(await host.runtime.switchSession(sessionA), {
    cancelled: false,
  })
  assert.equal(host.ui.getEditorText(), draftA)
  await host.runtime.switchSession(sessionB)
  assert.equal(host.ui.getEditorText(), "Only session B")
  await host.close()
  await restart({
    directory: host.directory,
    sessionFile: sessionA,
    text: draftA,
  })
  await restart({
    directory: host.directory,
    sessionFile: sessionB,
    text: "Only session B",
  })
})

test("undo and redo stay in memory with their own session across replacements", async (t) => {
  const host = await openHost(t, { persistSession: true })
  host.ui.setEditorText("Start session A")
  await host.key("\r")
  await host.settled()
  const sessionA = host.session.sessionFile!
  host.ui.setEditorText("A base")
  host.ui.pasteToEditor(" + A edit")
  await host.key("\x1b[122;9u")
  assert.equal(host.ui.getEditorText(), "A base")

  await host.runtime.newSession()
  await host.key("\x1b[122;9u")
  assert.equal(host.ui.getEditorText(), "")
  host.ui.setEditorText("Start session B")
  await host.key("\r")
  await t.waitFor(() => assert.equal(host.requests.length, 2))
  await host.settled()
  const sessionB = host.session.sessionFile!
  host.ui.setEditorText("B base")
  host.ui.pasteToEditor(" + B edit")

  await host.runtime.switchSession(sessionA)
  await host.key("\x1b[122;10u")
  assert.equal(host.ui.getEditorText(), "A base + A edit")
  await host.key("\x1b[122;9u")
  assert.equal(host.ui.getEditorText(), "A base")
  await host.runtime.switchSession(sessionB)
  await host.key("\x1b[122;9u")
  assert.equal(host.ui.getEditorText(), "B base")
  await host.key("\x1b[122;10u")
  assert.equal(host.ui.getEditorText(), "B base + B edit")
})

test("undo and redo survive session round trips across working directories", async (t) => {
  const host = await openHost(t, { persistSession: true })
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
  })
  seed.ui.setEditorText("Start session B")
  await seed.key("\r")
  await seed.settled()
  const sessionB = seed.session.sessionFile!
  await seed.close()

  host.ui.setEditorText("A base @source.ts")
  host.ui.pasteToEditor(" + A edit")
  await host.key("\x1b[122;9u")
  assert.equal(host.ui.getEditorText(), "A base @source.ts")
  assert.deepEqual(await host.runtime.switchSession(sessionB), {
    cancelled: false,
  })
  assert.equal(host.runtime.cwd, cwdB)
  assert.equal(host.ui.getEditorText(), "")
  host.ui.setEditorText("B base /skill:review")
  host.ui.pasteToEditor(" + B edit")

  assert.deepEqual(await host.runtime.switchSession(sessionA), {
    cancelled: false,
  })
  assert.equal(host.runtime.cwd, host.directory)
  assert.equal(host.ui.getEditorText(), "A base @source.ts")
  await host.key("\x1b[122;10u")
  assert.equal(host.ui.getEditorText(), "A base @source.ts + A edit")
  await host.key("\x1b[122;9u")
  assert.equal(host.ui.getEditorText(), "A base @source.ts")
  await host.runtime.switchSession(sessionB)
  assert.equal(host.runtime.cwd, cwdB)
  assert.equal(host.ui.getEditorText(), "B base /skill:review + B edit")
  await host.key("\x1b[122;9u")
  assert.equal(host.ui.getEditorText(), "B base /skill:review")
  await host.key("\x1b[122;10u")
  assert.equal(host.ui.getEditorText(), "B base /skill:review + B edit")

  await host.runtime.switchSession(sessionA)
  await restart({
    directory: host.directory,
    sessionFile: sessionA,
    text: "A base @source.ts",
  })
  await restart({
    directory: host.directory,
    sessionFile: sessionB,
    text: "B base /skill:review + B edit",
  })
  await host.key("\x1b[122;10u")
  assert.equal(host.ui.getEditorText(), "A base @source.ts + A edit")
})

test("resource reload preserves the active and inactive sessions' undo and redo", async (t) => {
  const host = await openHost(t, { persistSession: true })
  host.ui.setEditorText("Start session A")
  await host.key("\r")
  await host.settled()
  const sessionA = host.session.sessionFile!
  host.ui.setEditorText("A base")
  host.ui.pasteToEditor(" + A edit")
  await host.key("\x1b[122;9u")

  await host.runtime.newSession()
  host.ui.setEditorText("B base")
  host.ui.pasteToEditor(" + B edit")
  await host.session.reload()
  assert.equal(host.ui.getEditorText(), "B base + B edit")
  await host.key("\x1b[122;9u")
  assert.equal(host.ui.getEditorText(), "B base")
  await host.key("\x1b[122;10u")
  assert.equal(host.ui.getEditorText(), "B base + B edit")

  await host.runtime.switchSession(sessionA)
  assert.equal(host.ui.getEditorText(), "A base")
  await host.key("\x1b[122;10u")
  assert.equal(host.ui.getEditorText(), "A base + A edit")
  await host.key("\x1b[122;9u")
  assert.equal(host.ui.getEditorText(), "A base")
})

test("reloading and closing a concurrent host preserves the other host's session histories", async (t) => {
  const host = await openHost(t, { persistSession: true })
  host.ui.setEditorText("Start session A")
  await host.key("\r")
  await host.settled()
  const sessionA = host.session.sessionFile!
  host.ui.setEditorText("A base")
  host.ui.pasteToEditor(" + A edit")
  await host.key("\x1b[122;9u")
  await host.runtime.newSession()
  host.ui.setEditorText("A current draft")

  await t.test(
    "both live editors keep their own undo and redo",
    async (otherTest) => {
      const other = await openHost(otherTest, {
        directory: host.directory,
        persistSession: true,
      })
      other.ui.setEditorText("B base")
      other.ui.pasteToEditor(" + B edit")
      await other.key("\x1b[122;9u")
      await other.session.reload()
      assert.equal(other.ui.getEditorText(), "B base")
      await other.key("\x1b[122;10u")
      assert.equal(other.ui.getEditorText(), "B base + B edit")
      assert.equal(host.ui.getEditorText(), "A current draft")

      await host.runtime.switchSession(sessionA)
      await host.key("\x1b[122;10u")
      assert.equal(host.ui.getEditorText(), "A base + A edit")
      assert.equal(other.ui.getEditorText(), "B base + B edit")
      await host.key("\x1b[122;9u")
      await host.runtime.newSession()
      await other.close()
    },
  )

  await host.runtime.switchSession(sessionA)
  await host.key("\x1b[122;10u")
  assert.equal(host.ui.getEditorText(), "A base + A edit")
  await host.key("\x1b[122;9u")
  assert.equal(host.ui.getEditorText(), "A base")
})

test("an unsent first draft is recoverable after restart without creating native JSONL", async (t) => {
  const host = await openHost(t, { persistSession: true })
  const sessionFile = host.session.sessionFile!
  const text =
    "Unsent @source.ts /skill:review\n[Attachment: saved](</tmp/saved.txt>)"
  host.ui.setEditorText(text)
  await host.close()
  assert.equal(host.requests.length, 0)
  await assert.rejects(access(sessionFile), { code: "ENOENT" })
  await restart({ directory: host.directory, sessionFile, text, recover: true })
  await assert.rejects(access(sessionFile), { code: "ENOENT" })
})

test("a failed recovery write cancels a native switch without losing text or the last saved file", async (t) => {
  const host = await openHost(t, { persistSession: true })
  host.ui.setEditorText("Start session")
  await host.key("\r")
  await host.settled()
  const sessionFile = host.session.sessionFile!
  const recoveryDirectory = join(host.directory, "pi-composer", "drafts")
  host.ui.setEditorText("Last saved draft")
  let savedPath = ""
  await t.waitFor(async () => {
    const files = await readdir(recoveryDirectory)
    savedPath = join(
      recoveryDirectory,
      files.find((name) => !name.includes(".pending."))!,
    )
    assert.equal(
      JSON.parse(await readFile(savedPath, "utf8")).text,
      "Last saved draft",
    )
  })
  const previous = await readFile(savedPath, "utf8")
  await chmod(recoveryDirectory, 0o500)
  try {
    host.ui.setEditorText("Keep this unsaved edit")
    assert.deepEqual(await host.runtime.newSession(), { cancelled: true })
    assert.equal(host.session.sessionFile, sessionFile)
    assert.equal(host.ui.getEditorText(), "Keep this unsaved edit")
    assert.match(await host.output(), /Could not save draft recovery/)
    assert.equal(await readFile(savedPath, "utf8"), previous)
  } finally {
    await chmod(recoveryDirectory, 0o700)
  }
  await host.runtime.newSession()
  await host.runtime.switchSession(sessionFile)
  assert.equal(host.ui.getEditorText(), "Keep this unsaved edit")
})

test("native checkpoint failures keep recovery usable through noncancellable shutdown and restart", async (t) => {
  const host = await openHost(t, { persistSession: true })
  host.ui.setEditorText("Start session")
  await host.key("\r")
  await host.settled()
  const sessionFile = host.session.sessionFile!
  host.ui.setEditorText("Previous draft")
  await host.runtime.newSession()
  await host.runtime.switchSession(sessionFile)
  const nativeBefore = await readFile(sessionFile, "utf8")
  await chmod(sessionFile, 0o400)
  try {
    host.ui.setEditorText("Recover after native write failure")
    assert.deepEqual(await host.runtime.newSession(), { cancelled: true })
    assert.equal(host.session.sessionFile, sessionFile)
    assert.equal(host.ui.getEditorText(), "Recover after native write failure")
    assert.match(await host.output(), /Could not save session draft/)
    assert.equal(await readFile(sessionFile, "utf8"), nativeBefore)
    await host.close()
    await restart({
      directory: host.directory,
      sessionFile,
      text: "Recover after native write failure",
    })
    assert.equal(await readFile(sessionFile, "utf8"), nativeBefore)
  } finally {
    await chmod(sessionFile, 0o600)
  }
})

test("failed native and recovery writes preserve the latest draft through noncancellable shutdown", async (t) => {
  const host = await openHost(t, { persistSession: true })
  host.ui.setEditorText("Start a persisted session")
  await host.key("\r")
  await host.settled()
  const sessionFile = host.session.sessionFile!
  host.ui.setEditorText("Last saved draft")
  await host.runtime.newSession()
  await host.runtime.switchSession(sessionFile)
  const recoveryDirectory = join(host.directory, "pi-composer", "drafts")
  const savedFiles = await Promise.all(
    (await readdir(recoveryDirectory)).map(async (name) => ({
      name,
      bytes: await readFile(join(recoveryDirectory, name)),
    })),
  )
  const nativeBefore = await readFile(sessionFile)
  await chmod(recoveryDirectory, 0o500)
  await chmod(sessionFile, 0o400)
  try {
    host.ui.setEditorText("Latest **unsaved** draft /skill:review @source.ts")
    await host.close()
    assert.deepEqual(await readFile(sessionFile), nativeBefore)
    for (const saved of savedFiles) {
      assert.deepEqual(
        // oxlint-disable-next-line no-await-in-loop -- Verify each pre-existing checkpoint remains intact.
        await readFile(join(recoveryDirectory, saved.name)),
        saved.bytes,
      )
    }
  } finally {
    await chmod(recoveryDirectory, 0o700)
    await chmod(sessionFile, 0o600)
  }

  const other = await openHost(t, {
    directory: host.directory,
    persistSession: true,
  })
  other.ui.setEditorText("Unrelated current draft")
  const recovery = other.session.sendUserMessage("/composer-recover", {
    expandPromptTemplates: true,
  })
  assert.match(await other.output(), /Latest \*\*unsaved\*\* draft/)
  await other.key("\r")
  await recovery
  assert.equal(
    other.ui.getEditorText(),
    "Latest **unsaved** draft /skill:review @source.ts",
  )
  await other.key("\x1b[122;9u")
  assert.equal(other.ui.getEditorText(), "Unrelated current draft")
  await other.close()

  const resumed = await openHost(t, {
    directory: host.directory,
    sessionFile,
  })
  assert.equal(
    resumed.ui.getEditorText(),
    "Latest **unsaved** draft /skill:review @source.ts",
  )
  await resumed.key("\x1b[122;9u")
  assert.equal(resumed.ui.getEditorText(), "Last saved draft")
  await resumed.key("\x1b[122;10u")
  await resumed.close()
  await restart({
    directory: host.directory,
    sessionFile,
    text: "Latest **unsaved** draft /skill:review @source.ts",
  })
})

test("a delayed autosave drains newer edits before switching and cannot overwrite the next draft", async (t) => {
  const host = await openHost(t, { persistSession: true })
  host.ui.setEditorText("Start session A")
  await host.key("\r")
  await host.settled()
  const sessionA = host.session.sessionFile!
  const recoveryDirectory = join(host.directory, "pi-composer", "drafts")
  const release = Promise.withResolvers<void>()
  const rename = filesystem.rename
  let held = false
  const delayed = t.mock.method(
    filesystem,
    "rename",
    async (from: PathLike, to: PathLike) => {
      if (!held && String(from).startsWith(recoveryDirectory)) {
        held = true
        await release.promise
      }
      return rename(from, to)
    },
  )
  syncBuiltinESMExports()
  try {
    host.ui.setEditorText("A delayed edit")
    await t.waitFor(() => assert(held))
    const switching = host.runtime.newSession()
    host.ui.setEditorText("A newer edit while saving")
    assert.equal(host.session.sessionFile, sessionA)
    release.resolve()
    assert.deepEqual(await switching, { cancelled: false })
    assert.equal(host.ui.getEditorText(), "")
    host.ui.setEditorText("Unrelated session B draft")
    await host.runtime.switchSession(sessionA)
    assert.equal(host.ui.getEditorText(), "A newer edit while saving")
    await host.close()
    await restart({
      directory: host.directory,
      sessionFile: sessionA,
      text: "A newer edit while saving",
    })
  } finally {
    release.resolve()
    delayed.mock.restore()
    syncBuiltinESMExports()
  }
})

test("switching sessions closes a pending recovery action without editing the replacement draft", async (t) => {
  const host = await openHost(t, { persistSession: true })
  host.ui.setEditorText("Orphaned first draft")
  await host.runtime.newSession()
  host.ui.setEditorText("Second session")
  let finished = false
  const recovering = host.session
    .sendUserMessage("/composer-recover", {
      expandPromptTemplates: true,
    })
    .then(() => {
      finished = true
    })
  await t.waitFor(async () =>
    assert.match(await host.output(), /Recover draft/),
  )
  await host.runtime.newSession()
  host.ui.setEditorText("New unrelated work")
  await t.waitFor(() => assert(finished))
  await recovering
  assert.equal(host.ui.getEditorText(), "New unrelated work")
})

test("a recovery selection cannot replace edits made while its picker is open", async (t) => {
  const host = await openHost(t, { persistSession: true })
  host.ui.setEditorText("Orphaned first draft")
  await host.runtime.newSession()
  host.ui.setEditorText("Original second draft")
  const recovering = host.session.sendUserMessage("/composer-recover", {
    expandPromptTemplates: true,
  })
  await t.waitFor(async () =>
    assert.match(await host.output(), /Recover draft/),
  )
  host.ui.setEditorText("Newer second draft")
  await host.key("\r")
  await recovering
  assert.equal(host.ui.getEditorText(), "Newer second draft")
  assert.match(await host.output(), /The draft changed/)
  const retry = host.session.sendUserMessage("/composer-recover", {
    expandPromptTemplates: true,
  })
  assert.match(await host.output(), /Recover draft/)
  await host.key("\r")
  await retry
  assert.equal(host.ui.getEditorText(), "Orphaned first draft")
  await host.key("\x1b[122;9u")
  assert.equal(host.ui.getEditorText(), "Newer second draft")
})

test("clearing a saved draft persists an empty checkpoint and restart has no old undo history", async (t) => {
  const host = await openHost(t, { persistSession: true })
  host.ui.setEditorText("Start session")
  await host.key("\r")
  await host.settled()
  const sessionFile = host.session.sessionFile!
  host.ui.setEditorText("This draft will be cleared")
  await host.runtime.newSession()
  await host.runtime.switchSession(sessionFile)
  assert.equal(host.ui.getEditorText(), "This draft will be cleared")
  host.ui.setEditorText("")
  await host.close()
  await restart({ directory: host.directory, sessionFile, text: "" })
})

test("no-session reload preserves draft history without writing recovery files", async (t) => {
  const host = await openHost(t)
  host.ui.setEditorText("Private in-memory draft")
  host.ui.pasteToEditor(" with a reference @private.txt")
  await host.key("\x1b[122;9u")
  await host.session.reload()
  assert.equal(host.ui.getEditorText(), "Private in-memory draft")
  await host.key("\x1b[122;10u")
  assert.equal(
    host.ui.getEditorText(),
    "Private in-memory draft with a reference @private.txt",
  )
  await host.key("\x1b[122;9u")
  assert.equal(host.ui.getEditorText(), "Private in-memory draft")
  await host.runtime.newSession()
  await host.key("\x1b[122;9u")
  assert.equal(host.ui.getEditorText(), "")
  await host.close()
  await assert.rejects(access(join(host.directory, "pi-composer", "drafts")), {
    code: "ENOENT",
  })
})

test("reinstalling the public editor factory preserves autosave and the session history", async (t) => {
  const host = await openHost(t, { persistSession: true })
  host.ui.setEditorText("Start session")
  await host.key("\r")
  await host.settled()
  const sessionFile = host.session.sessionFile!
  host.ui.setEditorText("Before editor replacement")
  await host.runtime.newSession()
  await host.runtime.switchSession(sessionFile)
  host.ui.pasteToEditor(" plus an edit")
  const factory = host.ui.getEditorComponent()
  assert(factory)
  host.ui.setEditorComponent(factory)
  await host.key("\x1b[122;9u")
  assert.equal(host.ui.getEditorText(), "Before editor replacement")
  host.ui.setEditorText("After editor replacement")
  await host.close()
  await restart({
    directory: host.directory,
    sessionFile,
    text: "After editor replacement",
  })
})
