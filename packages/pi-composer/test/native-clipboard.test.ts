import assert from "node:assert/strict"
import { readFile, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { beforeEach, test } from "node:test"
import { getNativeClipboard } from "@earendil-works/pi-tui"
import { CustomEditor } from "@earendil-works/pi-coding-agent"
import { openHost } from "../fixtures/host.ts"

beforeEach((t) => {
  assert("mock" in t)
  const clipboard = getNativeClipboard()
  assert(clipboard?.getFilePaths)
  t.mock.method(
    clipboard as { getFilePaths: NonNullable<typeof clipboard.getFilePaths> },
    "getFilePaths",
    async () => null,
  )
  t.mock.method(clipboard, "getImage", async () => null)
  t.mock.method(clipboard, "getText", async () => "Unrelated clipboard")
})

test("the configured clipboard action and Command V both use the supplied handler", async (t) => {
  const host = await openHost(t, {
    extension: (pi) => {
      pi.on("session_start", (_event, ctx) => {
        const previous = ctx.ui.getEditorComponent()
        assert(previous)
        ctx.ui.setEditorComponent((...args) => {
          const editor = previous(...args)
          assert(editor instanceof CustomEditor)
          editor.onPasteImage = () => editor.insertTextAtCursor?.("Supplied")
          return editor
        })
      })
    },
  })
  host.ui.setEditorText("Original")
  await host.key("\x1b[97;9u")
  await host.key("\x1b[118;9u")
  assert.equal(host.ui.getEditorText(), "Supplied")
  await host.key("\x1b[122;9u")
  assert.equal(host.ui.getEditorText(), "Original")
  await host.key("\x16")
  assert.equal(host.ui.getEditorText(), "Supplied")
  assert.equal(host.requests.length, 0)
})

test("Command V uses Pi's file identity before clipboard images and text", async (t) => {
  const host = await openHost(t)
  const source = join(host.directory, "Résumé 你好.txt")
  await writeFile(source, "Copied file")
  const clipboard = getNativeClipboard()
  assert(clipboard?.getFilePaths)
  t.mock.method(
    clipboard as { getFilePaths: NonNullable<typeof clipboard.getFilePaths> },
    "getFilePaths",
    async () => [source],
  )
  t.mock.method(clipboard, "getImage", async () => {
    throw new Error("File identity must precede image reads")
  })
  await host.key("\x1b[118;9u")
  await t.waitFor(() => assert.equal(host.ui.getEditorText(), source))
  assert.equal(host.requests.length, 0)
})

test("Command V preserves Pi's native image-path result", async (t) => {
  const bytes = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAADUlEQVR4nGP4zwAE/wEHAAH/4iOeWQAAAABJRU5ErkJggg==",
    "base64",
  )
  const clipboard = getNativeClipboard()
  assert(clipboard)
  t.mock.method(clipboard, "getImage", async () => bytes)
  const host = await openHost(t)
  await host.key("\x1b[118;9u")
  await t.waitFor(() =>
    assert.match(host.ui.getEditorText(), /pi-clipboard-[\w-]+\.png$/),
  )
  const path = host.ui.getEditorText()
  t.after(() => rm(path))
  assert.deepEqual(await readFile(path), bytes)
  await host.key("\x1b[122;9u")
  assert.equal(host.ui.getEditorText(), "")
  assert.equal(host.requests.length, 0)
})

for (const laterEdit of [false, true]) {
  test(`a supplied clipboard handler can insert in stages${laterEdit ? " until the user edits" : ""}`, async (t) => {
    const next = Promise.withResolvers<void>()
    t.after(() => next.resolve())
    const host = await openHost(t, {
      columns: 240,
      extension: (pi) => {
        pi.on("session_start", (_event, ctx) => {
          const previous = ctx.ui.getEditorComponent()
          assert(previous)
          ctx.ui.setEditorComponent((...args) => {
            const editor = previous(...args)
            assert(editor instanceof CustomEditor)
            editor.onPasteImage = async () => {
              ctx.ui.pasteToEditor("First")
              await next.promise
              ctx.ui.pasteToEditor(" second")
            }
            return editor
          })
        })
      },
    })
    host.ui.setEditorText("Original")
    await host.key("\x1b[97;9u")
    await host.key("\x1b[118;9u")
    assert.equal(host.ui.getEditorText(), "First")
    if (laterEdit) await host.type(" user's work")
    next.resolve()
    if (laterEdit) {
      await t.waitFor(() =>
        assert(host.terminal.output.includes("Clipboard paste saved to ")),
      )
      assert.equal(host.ui.getEditorText(), "First user's work")
    } else {
      await t.waitFor(() =>
        assert.equal(host.ui.getEditorText(), "First second"),
      )
    }
    assert.equal(host.requests.length, 0)
  })
}
