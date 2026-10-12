import assert from "node:assert/strict"
import { beforeEach, test } from "node:test"
import { setTimeout as delay } from "node:timers/promises"
import { fileURLToPath } from "node:url"
import { getNativeClipboard } from "@earendil-works/pi-tui"
import { nativePi, waitFor } from "../pi-attachments/test-support/native-pi.mjs"

const pastePath = fileURLToPath(new URL("./src/index.ts", import.meta.url))
const composerPath = fileURLToPath(
  new URL("../pi-composer/src/index.ts", import.meta.url),
)
const attachmentsPath = fileURLToPath(
  new URL("../pi-attachments/src/index.ts", import.meta.url),
)

beforeEach((t) => {
  const clipboard = getNativeClipboard()
  assert.ok(clipboard?.getFilePaths)
  t.mock.method(clipboard, "getFilePaths", async () => null)
  t.mock.method(clipboard, "getImage", async () => null)
  t.mock.method(clipboard, "getText", async () => " clipboard text")
})

for (const [editor, extensions] of [
  ["native", [pastePath]],
  ["composer, paste then attachments", [composerPath, pastePath]],
  [
    "composer, attachments then paste",
    [composerPath, attachmentsPath, pastePath],
  ],
]) {
  for (const [description, binding, input] of [
    ["cleared", [], undefined],
    ["repeated default", "ctrl+v", "\x16"],
    ["remapped", "ctrl+shift+v", "\x1b[118;6u"],
  ]) {
    test(`${editor} explicit ${description} clipboard binding suppresses raw Command V only`, async (t) => {
      const host = await nativePi(t, extensions, {
        keybindings: { "app.clipboard.pasteImage": binding },
      })
      host.ui.setEditorText("Original")
      host.input("\x1b[118;9u")
      await delay(0)
      assert.equal(host.ui.getEditorText(), "Original")
      host.input("\x1b[200~ terminal text\x1b[201~")
      assert.equal(host.ui.getEditorText(), "Original terminal text")
      host.ui.pasteToEditor(" extension text")
      assert.equal(
        host.ui.getEditorText(),
        "Original terminal text extension text",
      )
      if (input) {
        host.input(input)
        await waitFor(() =>
          assert.equal(
            host.ui.getEditorText(),
            "Original terminal text extension text clipboard text",
          ),
        )
      }
      assert.equal(host.requests.length, 0)
      assert.doesNotMatch(host.render(), /Attachments \(/)
    })
  }

  test(`${editor} preserves a supplied handler's deliberate inline insertion`, async (t) => {
    let reads = 0
    t.mock.method(getNativeClipboard(), "getFilePaths", async () => {
      reads++
      return null
    })
    const text = "inline ".repeat(800)
    const host = await nativePi(t, extensions, {
      extensionFactories: [
        (pi) => {
          pi.on("session_start", (_event, ctx) => {
            const previous = ctx.ui.getEditorComponent()
            assert.ok(previous)
            ctx.ui.setEditorComponent((...args) => {
              const component = previous(...args)
              component.onPasteImage = () => component.insertTextAtCursor(text)
              return component
            })
          })
        },
      ],
    })
    host.ui.setEditorText("Draft ")
    host.input("\x1b[118;9u")
    await waitFor(() => assert.equal(host.ui.getEditorText(), `Draft ${text}`))
    host.input("\x16")
    await waitFor(() =>
      assert.equal(host.ui.getEditorText(), `Draft ${text}${text}`),
    )
    assert.equal(reads, 0)
    assert.doesNotMatch(host.render(), /Attachments \(/)
  })

  test(`${editor} leaves clipboard keys with a focused native input`, async (t) => {
    let reads = 0
    t.mock.method(getNativeClipboard(), "getFilePaths", async () => {
      reads++
      return null
    })
    const host = await nativePi(t, extensions)
    host.ui.setEditorText("Main draft")
    const input = host.ui.input("Separate input", "Type here")
    await waitFor(() => assert.match(host.render(), /Separate input/))
    host.input("\x1b[118;9u")
    host.input("\x16")
    await delay(0)
    host.input("\x1b")
    await input
    assert.equal(host.ui.getEditorText(), "Main draft")
    assert.equal(reads, 0)
    assert.equal(host.requests.length, 0)
  })

  for (const owner of ["editing", "application", "extension", "listener"]) {
    test(`${editor} leaves Command V to its native ${owner} owner`, async (t) => {
      let reads = 0
      t.mock.method(getNativeClipboard(), "getFilePaths", async () => {
        reads++
        return null
      })
      const host = await nativePi(t, extensions, {
        keybindings:
          owner === "editing"
            ? { "tui.editor.deleteCharBackward": "super+v" }
            : owner === "application"
              ? { "app.clear": "super+v" }
              : {},
        extensionFactories: [
          (pi) => {
            if (owner === "extension")
              pi.registerShortcut("super+v", {
                handler: (ctx) => ctx.ui.setEditorText("Extension owns key"),
              })
            if (owner === "listener")
              pi.on("session_start", (_event, ctx) => {
                ctx.ui.onTerminalInput((data) => {
                  if (data === "\x1b[118;9u") {
                    ctx.ui.setEditorText("Listener owns key")
                    return { consume: true }
                  }
                })
              })
          },
        ],
      })
      host.ui.setEditorText("Original")
      host.input("\x1b[118;9u")
      await delay(0)
      assert.equal(
        host.ui.getEditorText(),
        {
          editing: "Origina",
          application: "",
          extension: "Extension owns key",
          listener: "Listener owns key",
        }[owner],
      )
      assert.equal(reads, 0)
      assert.equal(host.requests.length, 0)
      assert.doesNotMatch(host.render(), /Attachments \(/)
    })
  }

  test(`${editor} processes only terminal and extension paste payloads without clipboard metadata`, async (t) => {
    let reads = 0
    t.mock.method(getNativeClipboard(), "getFilePaths", async () => {
      reads++
      return ["/tmp/unrelated clipboard file.txt"]
    })
    const host = await nativePi(t, extensions)
    const text = "/tmp/Plain path 你好.txt"
    host.input(`\x1b[200~${text}\x1b[201~`)
    assert.equal(host.ui.getEditorText(), text)
    host.ui.pasteToEditor(`\n${text}`)
    assert.equal(host.ui.getEditorText(), `${text}\n${text}`)
    assert.equal(reads, 0)
    assert.doesNotMatch(host.render(), /Attachments \(/)
  })
}
