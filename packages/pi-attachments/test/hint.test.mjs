import assert from "node:assert/strict"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { test } from "node:test"
import { getAgentDir } from "@earendil-works/pi-coding-agent"
import { nativePi, waitFor } from "../fixtures/native-pi.mjs"
import { registerImages } from "../src/images.ts"
import { attachmentPaths } from "../src/references.ts"
import { registerShortcuts } from "../src/shortcuts.ts"

const PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAADUlEQVR4nGP4zwAE/wEHAAH/4iOeWQAAAABJRU5ErkJggg=="

function preview(pi) {
  const storage = join(getAgentDir(), "pi-attachments")
  const lifetime = new AbortController()
  pi.on("session_shutdown", () => lifetime.abort())
  registerImages(
    pi,
    storage,
    lifetime.signal,
    (ctx) => attachmentPaths(ctx.ui.getEditorText(), storage, ctx.cwd),
    () => "medium",
  )
  registerShortcuts(pi, {
    attach: (ctx) => ctx.ui.notify("Attach action invoked"),
    manage: (ctx) => ctx.ui.notify("Manage action invoked"),
  })
}

async function retainedImage(host) {
  const storage = join(host.agentDir, "pi-attachments", "test-snapshot")
  await mkdir(storage, { recursive: true })
  const path = join(storage, "preview.png")
  await writeFile(path, Buffer.from(PNG, "base64"))
  const draft = `[Attachment: preview.png](<${path}>)`
  host.ui.setEditorText(draft)
  return { path, draft }
}

test("the native attachment preview has a stable command hint without changing the retained image or draft", async (t) => {
  const host = await nativePi(t, [], {
    attachments: false,
    settings: { terminal: { showImages: false } },
    extensionFactories: [preview],
  })
  const { path, draft } = await retainedImage(host)
  await waitFor(() => assert.match(host.render(), /\[Image: preview\.png/))
  assert.match(host.render(), /\/attachments Manage attachments/)
  assert.doesNotMatch(host.render(), /ctrl\+option\+a Manage attachments/)
  assert.equal(host.ui.getEditorText(), draft)
  assert.equal((await readFile(path)).toString("base64"), PNG)
})

for (const scenario of [
  {
    name: "remapping",
    keybindings: { "extension.attachments.manage": "ctrl+alt+m" },
    input: "\x1b[109;7u",
    invoked: "Manage action invoked",
    hotkey: /Ctrl\+Option\+M[^\n]*Manage attachments…/,
  },
  {
    name: "unbinding",
    keybindings: { "extension.attachments.manage": [] },
    input: "\x1b[97;7u",
  },
  {
    name: "a reserved native conflict",
    keybindings: { "app.clear": "ctrl+alt+a" },
    input: "\x1b[97;7u",
    cleared: true,
  },
  {
    name: "a competing extension",
    keybindings: {},
    input: "\x1b[97;7u",
    invoked: "Competing action invoked",
    hotkey: /Ctrl\+Option\+A[^\n]*Competing action/,
    competing: (pi) => {
      pi.registerShortcut("ctrl+alt+a", {
        description: "Competing action",
        handler: (ctx) => ctx.ui.notify("Competing action invoked"),
      })
    },
  },
]) {
  test(`the command hint stays accurate after ${scenario.name} while /hotkeys reports native shortcut ownership`, async (t) => {
    const host = await nativePi(t, [], {
      attachments: false,
      settings: { terminal: { showImages: false } },
      keybindings: scenario.keybindings,
      extensionFactories: [
        preview,
        ...(scenario.competing ? [scenario.competing] : []),
      ],
    })
    const { draft } = await retainedImage(host)
    await waitFor(() => assert.match(host.render(), /\[Image: preview\.png/))
    assert.match(host.render(), /\/attachments Manage attachments/)
    host.input(scenario.input)
    if (scenario.invoked) assert.ok(host.render().includes(scenario.invoked))
    else assert.doesNotMatch(host.render(), /Manage action invoked/)
    assert.equal(host.ui.getEditorText(), scenario.cleared ? "" : draft)
    host.submit("/hotkeys")
    host.ui.setEditorText(draft)
    const display = host.render()
    assert.match(display, /\/attachments Manage attachments/)
    assert.doesNotMatch(display, /ctrl\+option\+[am] Manage attachments/)
    if (scenario.hotkey) assert.match(display, scenario.hotkey)
    if (scenario.name !== "remapping")
      assert.doesNotMatch(display, /Manage attachments…/)
    assert.equal(host.requests.length, 0)
  })
}

test("the command hint survives reloading disabled bindings and reuses the existing image", async (t) => {
  const host = await nativePi(t, [], {
    attachments: false,
    settings: { terminal: { showImages: false } },
    extensionFactories: [preview],
  })
  const { path, draft } = await retainedImage(host)
  await waitFor(() => assert.match(host.render(), /\[Image: preview\.png/))
  await writeFile(
    join(host.agentDir, "keybindings.json"),
    JSON.stringify({ "extension.attachments.manage": [] }),
  )
  host.submit("/reload")
  await waitFor(() => assert.match(host.render(), /Reloaded/))
  host.ui.setEditorText(draft)
  await waitFor(() => assert.match(host.render(), /\[Image: preview\.png/))
  assert.match(host.render(), /\/attachments Manage attachments/)
  host.input("\x1b[97;7u")
  assert.doesNotMatch(host.render(), /Manage action invoked/)
  assert.equal(host.ui.getEditorText(), draft)
  assert.equal((await readFile(path)).toString("base64"), PNG)
})
