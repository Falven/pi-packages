import assert from "node:assert/strict"
import { randomFillSync } from "node:crypto"
import { execFile } from "node:child_process"
import syncFs, { renameSync, symlinkSync } from "node:fs"
import fs, {
  chmod,
  cp,
  readFile,
  realpath,
  mkdir,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises"
import { syncBuiltinESMExports } from "node:module"
import { dirname, join } from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import { convertToPng } from "@earendil-works/pi-coding-agent"
import {
  assertAttachments,
  nativePi,
  retainedRequest,
  snapshotPath,
  waitFor,
} from "../fixtures/native-pi.mjs"

async function failedPreparation(t, hold = false) {
  const write = fs.writeFile
  const first = Promise.withResolvers()
  const gate = Promise.withResolvers()
  if (!hold) gate.resolve()
  const abandoned = []
  let failing = true
  const mocked = t.mock.method(
    fs,
    "writeFile",
    async (path, contents, options) => {
      if (failing && String(path).endsWith("/input-image-1.png")) {
        await write(path, contents, options)
        abandoned.push(path)
        first.resolve()
        await gate.promise
        return
      }
      if (failing && String(path).endsWith("/input-image-2.png")) {
        await first.promise
        await write(path, contents.subarray(0, 32_768), options)
        abandoned.push(path)
        throw new Error("Temporary image capture write failure")
      }
      return write(path, contents, options)
    },
  )
  syncBuiltinESMExports()
  t.after(() => {
    failing = false
    gate.resolve()
    mocked.mock.restore()
    syncBuiltinESMExports()
  })
  const host = await nativePi(t)
  const bitmap = Buffer.alloc(54 + 256 * 256 * 3)
  bitmap.write("BM")
  bitmap.writeUInt32LE(bitmap.length, 2)
  bitmap.writeUInt32LE(54, 10)
  bitmap.writeUInt32LE(40, 14)
  bitmap.writeInt32LE(256, 18)
  bitmap.writeInt32LE(256, 22)
  bitmap.writeUInt16LE(1, 26)
  bitmap.writeUInt16LE(24, 28)
  randomFillSync(bitmap, 54)
  const image = await convertToPng(bitmap.toString("base64"), "image/bmp")
  assert.ok(image)
  const bytes = Buffer.from(image.data, "base64")
  assert.ok(bytes.length > 100_000)
  const source = join(host.directory, "source.png")
  await writeFile(source, bytes)
  await host.attachFile(source)
  const draft = host.ui.getEditorText()
  const snapshot = snapshotPath(draft)
  const original = await retainedRequest(host)
  const prepare = () =>
    host.runtime.session.prompt(draft, {
      images: [
        { type: "image", ...image },
        { type: "image", ...image },
      ],
    })
  const pending = prepare()
  await waitFor(() => assert.equal(abandoned.length, 2))
  if (!hold) await pending
  assert.equal(host.requests.length, 0)
  return {
    host,
    bytes,
    draft,
    snapshot,
    original,
    abandoned,
    pending,
    prepare,
    release: gate.resolve,
    repair() {
      failing = false
    },
  }
}

async function cleanup(host) {
  await host.runtime.session.sendUserMessage("/attachments-cleanup", {
    expandPromptTemplates: true,
  })
  return host.render()
}

test("native cleanup reclaims abandoned image preparation bytes only after recovery saves them", async (t) => {
  const { host, bytes, draft, snapshot, original, abandoned, repair } =
    await failedPreparation(t)
  repair()
  assert.match(host.render(), /Temporary\s+image\s+capture\s+write\s+failure/)
  const sizes = await Promise.all(
    abandoned.map(async (path) => (await stat(path)).size),
  )
  const reclaimable = sizes.reduce((sum, size) => sum + size, 0)
  assert.ok(reclaimable > 132_768)

  await cleanup(host)
  assert.match(host.render(), /Attachment cleanup: removed 0 files \(0 bytes\)/)
  assert.deepEqual(await readFile(abandoned[0]), bytes)
  assert.deepEqual(await readFile(abandoned[1]), bytes.subarray(0, 32_768))

  await host.runtime.session.sendUserMessage("/attachments-recover", {
    expandPromptTemplates: true,
  })
  const recovery = await retainedRequest(host, "Delivery:")
  const incoming = [
    ...recovery.text.matchAll(
      /\[Attachment: input-image-\d+\.png\]\(<([^>]+)>\)/g,
    ),
  ]
  assert.equal(incoming.length, 2)
  await Promise.all(
    incoming.map(async (match) =>
      assert.deepEqual(await readFile(match[1]), bytes),
    ),
  )

  await cleanup(host)
  assert.match(
    host.render(),
    new RegExp(
      `Attachment cleanup: removed 2 files \\(${reclaimable} bytes\\)`,
    ),
  )
  await Promise.all(
    abandoned.map((path) => assert.rejects(readFile(path), { code: "ENOENT" })),
  )
  assert.equal(host.ui.getEditorText(), draft)
  assert.deepEqual(await readFile(snapshot), bytes)
  assert.equal(await readFile(original.path, "utf8"), original.text)
  assert.equal(await readFile(recovery.path, "utf8"), recovery.text)
  await Promise.all(
    incoming.map(async (match) =>
      assert.deepEqual(await readFile(match[1]), bytes),
    ),
  )
  assert.equal(host.requests.length, 0)
})

test("cleanup preserves pending writes, then reclaims their abandoned bytes after a lifecycle retry and process restart", async (t) => {
  const { host, abandoned, bytes, pending, release, repair } =
    await failedPreparation(t, true)
  assert.match(await cleanup(host), /removed 0 files \(0 bytes\)/)
  await host.runtime.session.sendUserMessage("/attachments-recover", {
    expandPromptTemplates: true,
  })
  assert.match(host.render(), /No unsaved attachment requests/)
  assert.deepEqual(await readFile(abandoned[0]), bytes)
  host.ui.setEditorText("Newer draft while the write is pending")
  release()
  await pending
  assert.equal(
    host.ui.getEditorText(),
    "Newer draft while the write is pending",
  )
  assert.match(await cleanup(host), /removed 0 files \(0 bytes\)/)
  repair()
  await host.runtime.newSession()
  await waitFor(() => retainedRequest(host, "Delivery:"))
  assert.deepEqual(await readFile(abandoned[0]), bytes)
  await host.attachText("Retained after cleanup")
  const snapshot = snapshotPath(host.ui.getEditorText())
  const recovery = await retainedRequest(host, "[Attachment: text.txt]")
  const sessionId = host.runtime.session.sessionManager.getSessionId()
  const sessionFile = host.runtime.session.sessionFile
  const sizes = await Promise.all(
    abandoned.map(async (path) => (await stat(path)).size),
  )
  await host.close()
  await promisify(execFile)(
    process.execPath,
    [
      fileURLToPath(new URL("../fixtures/restart-pi.mjs", import.meta.url)),
      JSON.stringify({
        directory: host.directory,
        sessionId,
        sessionFile,
        persisted: false,
        history: [],
        snapshot,
        contents: "Retained after cleanup",
        recovery,
        cleanup: {
          paths: abandoned,
          bytes: sizes.reduce((sum, size) => sum + size, 0),
        },
      }),
    ],
    { timeout: 15000 },
  )
})

test("cleanup reports partial filesystem failures and retries only the remaining staging files", async (t) => {
  const { host, abandoned, bytes, prepare, repair, snapshot, original } =
    await failedPreparation(t)
  await prepare()
  assert.equal(abandoned.length, 4)
  repair()
  await host.runtime.session.sendUserMessage("/attachments-recover", {
    expandPromptTemplates: true,
  })
  const blocked = dirname(abandoned[0])
  await chmod(blocked, 0o500)
  t.after(() =>
    chmod(blocked, 0o700).catch((error) => {
      if (error.code !== "ENOENT") throw error
    }),
  )
  const removed = abandoned.slice(2)
  const sizes = await Promise.all(
    removed.map(async (path) => (await stat(path)).size),
  )
  const reclaimed = sizes.reduce((sum, size) => sum + size, 0)
  const output = await cleanup(host)
  assert.match(
    output,
    new RegExp(`removed 2 files \\(${reclaimed} bytes\\); 1 failure`),
  )
  assert.match(output, /EACCES/)
  await Promise.all(
    removed.map((path) => assert.rejects(readFile(path), { code: "ENOENT" })),
  )
  assert.deepEqual(await readFile(abandoned[0]), bytes)
  assert.deepEqual(await readFile(snapshot), bytes)
  assert.equal(await readFile(original.path, "utf8"), original.text)
  await chmod(blocked, 0o700)
  assert.match(
    await cleanup(host),
    new RegExp(`removed 2 files \\(${reclaimed} bytes\\); 0 failures`),
  )
  assert.match(await cleanup(host), /removed 0 files \(0 bytes\); 0 failures/)
})

test("cleanup rechecks ownership when an eligible directory is replaced by a symlink", async (t) => {
  const read = syncFs.readFileSync
  let marker
  let swap
  const mocked = t.mock.method(syncFs, "readFileSync", (...args) => {
    const contents = read(...args)
    if (String(args[0]) === marker && swap) {
      const replace = swap
      swap = undefined
      replace()
    }
    return contents
  })
  syncBuiltinESMExports()
  t.after(() => {
    mocked.mock.restore()
    syncBuiltinESMExports()
  })
  const { host, abandoned, bytes, repair, snapshot } =
    await failedPreparation(t)
  repair()
  await host.runtime.session.sendUserMessage("/attachments-recover", {
    expandPromptTemplates: true,
  })
  const directory = await realpath(dirname(abandoned[0]))
  const outside = join(host.directory, "outside")
  const retained = join(host.directory, "retained-capture")
  await cp(directory, outside, { recursive: true })
  marker = join(directory, ".unused.json")
  swap = () => {
    renameSync(directory, retained)
    symlinkSync(outside, directory, "dir")
  }
  await cleanup(host)
  assert.deepEqual(await readFile(join(outside, "input-image-1.png")), bytes)
  assert.deepEqual(
    await readFile(join(outside, "input-image-2.png")),
    bytes.subarray(0, 32_768),
  )
  assert.deepEqual(await readFile(join(retained, "input-image-1.png")), bytes)
  assert.deepEqual(await readFile(snapshot), bytes)
})

test("cleanup is discoverable and runs as a native command without sending a prompt", async (t) => {
  const host = await nativePi(t)
  host.ui.setEditorText("/attachments-cl")
  host.input("\t")
  await waitFor(() => assert.match(host.render(), /attachments-cleanup/))
  host.input("\r")
  await waitFor(() =>
    assert.match(
      host.render(),
      /Attachment cleanup: removed 0 files \(0 bytes\); 0 failures/,
    ),
  )
  assert.equal(host.requests.length, 0)
  assert.equal(host.users.length, 0)
})

for (const changed of ["staging", "replacement"]) {
  test(`cleanup retains staging when ${changed} bytes no longer match the completed retry`, async (t) => {
    const { host, abandoned, bytes, repair } = await failedPreparation(t)
    repair()
    await host.runtime.session.sendUserMessage("/attachments-recover", {
      expandPromptTemplates: true,
    })
    const recovery = await retainedRequest(host, "Delivery:")
    const saved = recovery.text.match(
      /\[Attachment: input-image-1\.png\]\(<([^>]+)>\)/,
    )[1]
    const path = changed === "staging" ? abandoned[0] : saved
    const modified = Buffer.alloc(bytes.length, 0x7a)
    await writeFile(path, modified)
    await cleanup(host)
    assert.deepEqual(
      await readFile(abandoned[0]),
      changed === "staging" ? modified : bytes,
    )
    assert.deepEqual(await readFile(path), modified)
    assert.equal(await readFile(recovery.path, "utf8"), recovery.text)
    await writeFile(path, bytes)
    await cleanup(host)
    await Promise.all(
      abandoned.map((file) =>
        assert.rejects(readFile(file), { code: "ENOENT" }),
      ),
    )
  })
}

test("composer recovery restores attachment membership after cleanup and stays undoable", async (t) => {
  const host = await nativePi(t, [
    fileURLToPath(new URL("../../pi-composer/src/index.ts", import.meta.url)),
  ])
  host.ui.setEditorText("**Recover this complete draft**")
  await host.attachText("Retained restored text")
  const draft = host.ui.getEditorText()
  const path = snapshotPath(draft)
  host.ui.setEditorText("")
  host.ui.setEditorText("Newer work")
  await cleanup(host)
  assert.equal(host.ui.getEditorText(), "Newer work")
  const recovery = host.runtime.session.sendUserMessage("/composer-recover", {
    expandPromptTemplates: true,
  })
  await waitFor(() => assert.match(host.render(), /Recover draft/))
  host.input("\r")
  await recovery
  assert.equal(host.ui.getEditorText(), draft)
  assertAttachments(host.ui.getEditorText(), host.render(), ["text.txt"])
  host.input("\x1b[122;9u")
  assert.equal(host.ui.getEditorText(), "Newer work")
  assert.doesNotMatch(host.render(), /Manage attachments/)
  await cleanup(host)
  host.input("\x1b[122;10u")
  assert.equal(host.ui.getEditorText(), draft)
  assert.equal(await readFile(path, "utf8"), "Retained restored text")
  assertAttachments(host.ui.getEditorText(), host.render(), ["text.txt"])
})

test("an image recovery record remains readable after a late write failure, retry, and cleanup", async (t) => {
  const write = fs.writeFile
  let failing = true
  let earlier
  const mocked = t.mock.method(
    fs,
    "writeFile",
    async (path, contents, options) => {
      await write(path, contents, options)
      if (failing && String(path).endsWith("/request.draft.md")) {
        earlier = { path, text: contents }
        throw new Error("Recovery metadata flush failed")
      }
    },
  )
  syncBuiltinESMExports()
  t.after(() => {
    failing = false
    mocked.mock.restore()
    syncBuiltinESMExports()
  })
  const host = await nativePi(t, [
    fileURLToPath(new URL("../fixtures/image-input.ts", import.meta.url)),
  ])
  const bytes = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAADUlEQVR4nGP4zwAE/wEHAAH/4iOeWQAAAABJRU5ErkJggg==",
    "base64",
  )
  const source = join(host.directory, "recovery.png")
  await writeFile(source, bytes)
  await host.attachFile(source)
  const draft = host.ui.getEditorText()
  await host.runtime.session.prompt(draft)
  assert.match(host.render(), /Recovery\s+metadata\s+flush\s+failed/)
  assert.ok(earlier)
  const incoming = earlier.text.match(
    /\[Attachment: input-image-1\.png\]\(<([^>]+)>\)/,
  )[1]
  failing = false
  await host.runtime.session.sendUserMessage("/attachments-recover", {
    expandPromptTemplates: true,
  })
  assert.match(await cleanup(host), /removed 0 files \(0 bytes\); 0 failures/)
  assert.equal(await readFile(earlier.path, "utf8"), earlier.text)
  assert.deepEqual(await readFile(incoming), bytes)
  assert.deepEqual(await readFile(snapshotPath(draft)), bytes)
  assert.equal(host.requests.length, 0)
})

test("a cleanup bookkeeping failure reports the saved recovery and retains the unfinished capture", async (t) => {
  const { host, abandoned, bytes, repair } = await failedPreparation(t)
  const directory = dirname(abandoned[0])
  await chmod(directory, 0o500)
  repair()
  let recovery
  try {
    await host.runtime.session.sendUserMessage("/attachments-recover", {
      expandPromptTemplates: true,
    })
    recovery = await retainedRequest(host, "Delivery:")
    assert.match(host.render(), /Request saved:/)
    assert.match(host.render(), /Could not record cleanup eligibility/)
    assert.match(await cleanup(host), /removed 0 files \(0 bytes\)/)
    assert.deepEqual(await readFile(abandoned[0]), bytes)
  } finally {
    await chmod(directory, 0o700)
  }
  await host.runtime.session.sendUserMessage("/attachments-recover", {
    expandPromptTemplates: true,
  })
  await cleanup(host)
  await assert.rejects(readFile(abandoned[0]), { code: "ENOENT" })
  assert.equal(await readFile(recovery.path, "utf8"), recovery.text)
})

test("cleanup retains unknown files and symlinks alongside actual abandoned captures", async (t) => {
  const { host, abandoned, bytes, repair, snapshot } =
    await failedPreparation(t)
  repair()
  await host.runtime.session.sendUserMessage("/attachments-recover", {
    expandPromptTemplates: true,
  })
  const storage = join(host.agentDir, "pi-attachments")
  const unknown = join(dirname(abandoned[0]), "unknown.txt")
  await writeFile(unknown, "Unclassified contents")
  const legacy = join(storage, "request-unknown")
  await mkdir(legacy)
  await writeFile(join(legacy, "input-image-1"), bytes)
  assert.match(await cleanup(host), /removed 0 files \(0 bytes\)/)
  assert.equal(await readFile(unknown, "utf8"), "Unclassified contents")
  assert.deepEqual(await readFile(abandoned[0]), bytes)
  await rm(unknown)
  const outside = join(host.directory, "outside.png")
  await writeFile(outside, bytes)
  await rm(abandoned[0])
  await symlink(outside, abandoned[0])
  await cleanup(host)
  assert.deepEqual(await readFile(outside), bytes)
  assert.deepEqual(await readFile(abandoned[0]), bytes)
  assert.deepEqual(await readFile(join(legacy, "input-image-1")), bytes)
  assert.deepEqual(await readFile(snapshot), bytes)
})
