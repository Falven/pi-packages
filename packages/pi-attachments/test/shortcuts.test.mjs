import assert from "node:assert/strict"
import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { test } from "node:test"
import { registerShortcuts } from "../src/shortcuts.ts"
import { nativePi, waitFor } from "../fixtures/native-pi.mjs"

function actions(pi) {
  registerShortcuts(pi, {
    attach: (ctx) => ctx.ui.setEditorText("Attach action"),
    manage: (ctx) => ctx.ui.setEditorText("Manage action"),
  })
}

test("attachment shortcuts use the default keys in Pi's native dispatch", async (t) => {
  const host = await nativePi(t, [], {
    attachments: false,
    extensionFactories: [actions],
  })
  host.input("\x1b[102;7u")
  assert.equal(host.ui.getEditorText(), "Attach action")
  host.input("\x1b[97;7u")
  assert.equal(host.ui.getEditorText(), "Manage action")
  assert.equal(host.requests.length, 0)
})

test("an active-agent binding replaces the default with every configured key", async (t) => {
  const keybindings = {
    "extension.attachments.attach": "ctrl+alt+x",
    "extension.attachments.manage": ["ctrl+alt+m", "ctrl+alt+n"],
    "app.clipboard.pasteImage": [],
    "extension.unrelated.action": "super+k",
  }
  const host = await nativePi(t, [], {
    attachments: false,
    keybindings,
    extensionFactories: [actions],
  })
  host.ui.setEditorText("Unchanged")
  host.input("\x1b[102;7u")
  host.input("\x1b[97;7u")
  assert.equal(host.ui.getEditorText(), "Unchanged")
  host.input("\x1b[120;7u")
  assert.equal(host.ui.getEditorText(), "Attach action")
  for (const input of ["\x1b[109;7u", "\x1b[110;7u"]) {
    host.ui.setEditorText("Unchanged")
    host.input(input)
    assert.equal(host.ui.getEditorText(), "Manage action")
  }
  assert.deepEqual(
    JSON.parse(await readFile(join(host.agentDir, "keybindings.json"), "utf8")),
    keybindings,
  )
})

test("file edits and unbinding apply after reload without old shortcuts", async (t) => {
  const host = await nativePi(t, [], {
    attachments: false,
    extensionFactories: [actions],
  })
  await writeFile(
    join(host.agentDir, "keybindings.json"),
    JSON.stringify({
      "extension.attachments.attach": "ctrl+alt+x",
      "extension.attachments.manage": [],
    }),
  )
  host.input("\x1b[102;7u")
  assert.equal(host.ui.getEditorText(), "Attach action")
  host.submit("/reload")
  await waitFor(() => assert.match(host.render(), /Reloaded/))
  host.ui.setEditorText("Unchanged")
  host.input("\x1b[102;7u")
  host.input("\x1b[97;7u")
  assert.equal(host.ui.getEditorText(), "Unchanged")
  host.input("\x1b[120;7u")
  assert.equal(host.ui.getEditorText(), "Attach action")
  assert.equal(host.requests.length, 0)
})

test("invalid attachment bindings report the entry and preserve the other action", async (t) => {
  const host = await nativePi(t, [], {
    attachments: false,
    keybindings: {
      "extension.attachments.attach": 42,
      "extension.attachments.manage": "ctrl+alt+m",
    },
    extensionFactories: [actions],
  })
  assert.match(host.render(), /extension\.attachments\.attach/)
  assert.match(host.render(), /key or a list of keys/)
  host.ui.setEditorText("Unchanged")
  host.input("\x1b[102;7u")
  assert.equal(host.ui.getEditorText(), "Unchanged")
  host.input("\x1b[109;7u")
  assert.equal(host.ui.getEditorText(), "Manage action")
})

test("an invalid key name disables the entire action binding and reports the problem", async (t) => {
  const host = await nativePi(t, [], {
    attachments: false,
    keybindings: {
      "extension.attachments.attach": ["ctrl+alt+x", "ctrl+unknown-key"],
    },
    extensionFactories: [actions],
  })
  assert.match(host.render(), /extension\.attachments\.attach/)
  assert.match(host.render(), /key or a list of keys/)
  host.ui.setEditorText("Unchanged")
  host.input("\x1b[120;7u")
  host.input("\x1b[102;7u")
  assert.equal(host.ui.getEditorText(), "Unchanged")
})

for (const contents of ["{invalid", "[]", "null"]) {
  test(`malformed binding file ${contents} disables attachment shortcuts and reports the file`, async (t) => {
    const host = await nativePi(t, [], {
      attachments: false,
      extensionFactories: [actions],
    })
    await writeFile(join(host.agentDir, "keybindings.json"), contents)
    host.submit("/reload")
    await waitFor(() =>
      assert.match(host.render(), /Could not configure attachment shortcuts/),
    )
    assert.match(host.render(), /keybindings\.json/)
    assert.match(host.render(), /Commands\s+remain available/)
    host.ui.setEditorText("Unchanged")
    host.input("\x1b[102;7u")
    host.input("\x1b[97;7u")
    assert.equal(host.ui.getEditorText(), "Unchanged")
  })
}

test("Pi's remapped reserved native shortcut wins and /hotkeys omits its rejected attachment binding", async (t) => {
  const host = await nativePi(t, [], {
    attachments: false,
    keybindings: { "app.clear": "ctrl+alt+f" },
    extensionFactories: [actions],
  })
  host.ui.setEditorText("Clear this draft")
  host.input("\x1b[102;7u")
  assert.equal(host.ui.getEditorText(), "")
  host.submit("/hotkeys")
  assert.match(host.render(), /Manage attachments/)
  assert.doesNotMatch(host.render(), /Attach…/)
  assert.equal(host.requests.length, 0)
})

test("Pi allows a registered attachment shortcut to override a nonreserved native binding once", async (t) => {
  const host = await nativePi(t, [], {
    attachments: false,
    keybindings: { "tui.editor.deleteCharBackward": "ctrl+alt+a" },
    extensionFactories: [actions],
  })
  host.ui.setEditorText("Unchanged")
  host.input("\x1b[97;7u")
  assert.equal(host.ui.getEditorText(), "Manage action")
  host.submit("/hotkeys")
  assert.match(host.render(), /Manage attachments/)
})

test("Pi uses the last competing extension shortcut and reports only its description", async (t) => {
  const calls = []
  const host = await nativePi(t, [], {
    attachments: false,
    extensionFactories: [
      (pi) => {
        registerShortcuts(pi, {
          attach: () => calls.push("attach"),
          manage: () => calls.push("manage"),
        })
      },
      (pi) => {
        pi.registerShortcut("ctrl+alt+a", {
          description: "Competing action",
          handler: () => calls.push("competing"),
        })
      },
    ],
  })
  host.input("\x1b[97;7u")
  assert.deepEqual(calls, ["competing"])
  host.submit("/hotkeys")
  assert.match(host.render(), /Competing action/)
  assert.doesNotMatch(host.render(), /Manage attachments/)
})

test("Pi's read-only /hotkeys lists all remapped attachment shortcuts and omits unbound actions", async (t) => {
  const host = await nativePi(t, [], {
    attachments: false,
    keybindings: {
      "extension.attachments.attach": [],
      "extension.attachments.manage": ["ctrl+alt+m", "ctrl+alt+n"],
    },
    extensionFactories: [actions],
  })
  host.submit("/hotkeys")
  const hotkeys = host.render()
  assert.match(hotkeys, /Ctrl\+Option\+M[^\n]*Manage attachments/)
  assert.match(hotkeys, /Ctrl\+Option\+N[^\n]*Manage attachments/)
  assert.doesNotMatch(hotkeys, /Attach…/)
  assert.equal(host.requests.length, 0)
})

test("attachment bindings accept the same UTF-8 BOM as Pi's binding file", async (t) => {
  const host = await nativePi(t, [], {
    attachments: false,
    extensionFactories: [actions],
  })
  await writeFile(
    join(host.agentDir, "keybindings.json"),
    '\uFEFF{"extension.attachments.attach":"ctrl+alt+x"}',
  )
  host.submit("/reload")
  await waitFor(() => assert.match(host.render(), /Reloaded/))
  host.input("\x1b[120;7u")
  assert.equal(host.ui.getEditorText(), "Attach action")
})
