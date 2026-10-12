/* eslint-disable no-await-in-loop -- Exercise native command dispatch and edits in order. */
import assert from "node:assert/strict"
import { test } from "node:test"
import {
  mkdir,
  readFile,
  readdir,
  rename,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises"
import { dirname, join } from "node:path"
import { setupHost, forwarding } from "../fixtures/ghostty-setup.ts"
import { openHost } from "../fixtures/host.ts"

test("unsupported keybinding setup arguments show usage without submitting the draft", async (t) => {
  let registered = false
  const host = await openHost(t, {
    extension: (pi) => {
      pi.on("session_start", () => {
        registered = pi
          .getCommands()
          .some(({ name }) => name === "setup-keybinds")
      })
    },
  })
  assert(registered, "Pi must expose setup through its native command API")
  host.ui.setEditorText("Retained draft")
  for (const command of [
    "/setup-keybinds",
    "/setup-keybinds kitty",
    "/setup-keybinds ghostty install",
    "/setup-keybinds ghostty remove extra",
  ]) {
    await host.session.sendUserMessage(command, { expandPromptTemplates: true })
    assert.match(await host.output(), /Usage: \/setup-keybinds ghostty/)
    assert.equal(host.ui.getEditorText(), "Retained draft")
  }
  assert.equal(host.requests.length, 0)
})

for (const [command, source] of [
  ["/setup-keybinds ghostty", false],
  ["/setup-keybinds ghostty remove", false],
  ["/setup-keybinds ghostty", true],
  ["/setup-keybinds ghostty remove", true],
] as const) {
  test(`${command} retains ${source ? "source" : "formatted"} selection and history when verification is unavailable`, async (t) => {
    const host = await openHost(t)
    host.ui.setEditorText("Original")
    await host.type(" changed")
    if (source) await host.key("\x1b[109;10u")
    await host.key("\x1b[97;9u")
    await host.session.sendUserMessage(command, { expandPromptTemplates: true })
    assert.match(await host.output(), /verification is unavailable/)
    assert.match(await host.output(), /No\s+settings\s+changed/)
    assert.equal(host.ui.getEditorText(), "Original changed")
    await host.type("Replacement")
    assert.equal(host.ui.getEditorText(), "Replacement")
    await host.key("\x1b[122;9u")
    assert.equal(host.ui.getEditorText(), "Original changed")
    await host.type("Selection survived undo")
    assert.equal(host.ui.getEditorText(), "Selection survived undo")
    await host.key("\x1b[122;9u")
    assert.equal(host.ui.getEditorText(), "Original changed")
    await host.key("\x1b[122;9u")
    assert.equal(host.ui.getEditorText(), "Original")
    assert.equal(host.requests.length, 0)
  })
}

test("verified Ghostty setup reviews persistent effects before installing its eight rules", async (t) => {
  const original = "font-size = 14\n"
  const { host, file } = await setupHost(t, original)
  host.ui.setEditorText("Retained")
  await host.type(" draft")
  await host.key("\x1b[97;9u")
  const installing = host.session.sendUserMessage("/setup-keybinds ghostty", {
    expandPromptTemplates: true,
  })
  await t.waitFor(async () =>
    assert.match(await host.output(), /Set up Ghostty keybindings/),
  )
  assert.equal(await readFile(file, "utf8"), original)
  assert.match(await host.output(), /outside Pi/)
  await host.key("\r")
  await installing
  assert.match(await readFile(file, "utf8"), /# BEGIN pi-composer keybindings/)
  assert((await readFile(file, "utf8")).includes(forwarding))
  assert.match(await host.output(), /Ghostty keybindings installed/)
  assert.equal(host.ui.getEditorText(), "Retained draft")
  await host.type("Replacement")
  assert.equal(host.ui.getEditorText(), "Replacement")
  await host.key("\x1b[122;9u")
  assert.equal(host.ui.getEditorText(), "Retained draft")
  await host.key("\x1b[122;9u")
  assert.equal(host.ui.getEditorText(), "Retained")
  assert.equal(host.requests.length, 0)
})

test("cancelling verified setup keeps configuration, selection, and undo history", async (t) => {
  const { host, file } = await setupHost(t, "font-size = 14\n")
  host.ui.setEditorText("Original")
  await host.type(" changed")
  await host.key("\x1b[97;9u")
  const command = host.session.sendUserMessage("/setup-keybinds ghostty", {
    expandPromptTemplates: true,
  })
  await t.waitFor(async () =>
    assert.match(await host.output(), /Set up Ghostty keybindings/),
  )
  await host.key("\x1b")
  await command
  assert.equal(await readFile(file, "utf8"), "font-size = 14\n")
  await host.type("Replacement")
  assert.equal(host.ui.getEditorText(), "Replacement")
  await host.key("\x1b[122;9u")
  assert.equal(host.ui.getEditorText(), "Original changed")
  assert.equal(host.requests.length, 0)
})

for (const [name, original] of [
  ["config", "font-size = 14"],
  ["config", "font-size = 14\r\n"],
  ["config.ghostty", "font-size = 14"],
  ["config.ghostty", "font-size = 14\n"],
]) {
  test(`${name} setup repeats without writing and removal preserves final-newline state and later edits (${JSON.stringify(original)})`, async (t) => {
    const { host, file } = await setupHost(t, original!, name)
    const installing = host.session.sendUserMessage("/setup-keybinds ghostty", {
      expandPromptTemplates: true,
    })
    await t.waitFor(async () =>
      assert.match(await host.output(), /Set up Ghostty keybindings/),
    )
    await host.key("\r")
    await installing
    const installed = await readFile(file, "utf8")
    assert(installed.startsWith(original!))
    assert.equal(installed.endsWith("\n"), original!.endsWith("\n"))
    const beforeRepeat = await stat(file)
    await host.session.sendUserMessage("/setup-keybinds ghostty", {
      expandPromptTemplates: true,
    })
    assert.match(await host.output(), /already installed/)
    assert.equal((await stat(file)).ino, beforeRepeat.ino)
    assert.equal((await stat(file)).mtimeMs, beforeRepeat.mtimeMs)
    assert.equal((await stat(file)).mode & 0o777, 0o640)
    const later = "\n# Later user setting\nfont-family = Example"
    await writeFile(file, installed + later)
    const removing = host.session.sendUserMessage(
      "/setup-keybinds ghostty remove",
      { expandPromptTemplates: true },
    )
    await t.waitFor(async () =>
      assert.match(await host.output(), /Remove Ghostty keybindings/),
    )
    await host.key("\r")
    await removing
    assert.equal(await readFile(file, "utf8"), original + later)
    const beforeMissingRemoval = await stat(file)
    await host.session.sendUserMessage("/setup-keybinds ghostty remove", {
      expandPromptTemplates: true,
    })
    assert.equal((await stat(file)).ino, beforeMissingRemoval.ino)
    assert.deepEqual(await readdir(dirname(file)), [name])
    assert.equal(host.requests.length, 0)
  })
}

for (const scenario of [
  "denied",
  "version",
  "includes",
  "invalid",
  "candidateInvalid",
  "extra-root",
  "edited-block",
  "duplicated-block",
  "symlink",
] as const) {
  test(`Ghostty setup leaves settings unchanged for ${scenario}`, async (t) => {
    const original = "font-size = 14\n"
    const { host, file, app, state } = await setupHost(t, original)
    if (scenario === "version") state.version = "1.4.0"
    else if (scenario === "extra-root")
      await writeFile(join(app, "config.ghostty"), "font-size = 15\n")
    else if (scenario === "edited-block")
      await writeFile(
        file,
        original +
          "# BEGIN pi-composer keybindings\nEdited\n# END pi-composer keybindings\n",
      )
    else if (scenario === "duplicated-block")
      await writeFile(
        file,
        original +
          "# BEGIN pi-composer keybindings\n# BEGIN pi-composer keybindings\n# END pi-composer keybindings\n",
      )
    else if (scenario === "symlink") {
      await rename(file, join(app, "real-config"))
      await symlink(join(app, "real-config"), file)
    } else state[scenario] = true
    const before = await readFile(file)
    await host.session.sendUserMessage("/setup-keybinds ghostty", {
      expandPromptTemplates: true,
    })
    assert.deepEqual(await readFile(file), before)
    assert.match(await host.output(), /No\s+settings\s+changed/)
    assert.doesNotMatch(await host.output(), /Ghostty keybindings installed/)
    assert.equal(host.requests.length, 0)
  })
}

test("settings changed during confirmation survive without being overwritten", async (t) => {
  const { host, file } = await setupHost(t, "font-size = 14\n")
  const command = host.session.sendUserMessage("/setup-keybinds ghostty", {
    expandPromptTemplates: true,
  })
  await t.waitFor(async () =>
    assert.match(await host.output(), /Set up Ghostty keybindings/),
  )
  const concurrent = "font-size = 20\n# Edited during review\n"
  await writeFile(file, concurrent)
  await host.key("\r")
  await command
  assert.equal(await readFile(file, "utf8"), concurrent)
  assert.match(await host.output(), /changed during review/)
  assert.deepEqual(await readdir(dirname(file)), ["config"])
})

test("an edited END marker on a no-final-newline block requires manual resolution", async (t) => {
  const { host, file } = await setupHost(t, "font-size = 14")
  const installing = host.session.sendUserMessage("/setup-keybinds ghostty", {
    expandPromptTemplates: true,
  })
  await t.waitFor(async () =>
    assert.match(await host.output(), /Set up Ghostty keybindings/),
  )
  await host.key("\r")
  await installing
  const edited = (await readFile(file, "utf8")) + " edited"
  await writeFile(file, edited)
  const removing = host.session.sendUserMessage(
    "/setup-keybinds ghostty remove",
    { expandPromptTemplates: true },
  )
  try {
    assert.match(await host.output(), /resolve it manually/)
  } finally {
    await host.key("\x1b")
    await removing
  }
  assert.equal(await readFile(file, "utf8"), edited)
})

for (const name of ["config", "config.ghostty"]) {
  test(`an XDG ${name} root prevents any installation`, async (t) => {
    const original = "font-size = 14\n"
    const { host, file, app } = await setupHost(t, original)
    const home = dirname(dirname(dirname(app)))
    const root = join(home, ".config/ghostty")
    await mkdir(root, { recursive: true })
    const xdg = join(root, name)
    await writeFile(xdg, "font-size = 16\n")
    await host.session.sendUserMessage("/setup-keybinds ghostty", {
      expandPromptTemplates: true,
    })
    assert.equal(await readFile(file, "utf8"), original)
    assert.equal(await readFile(xdg, "utf8"), "font-size = 16\n")
    assert.match(await host.output(), /no\s+other\s+default\s+roots/)
  })
}

for (const scenario of [
  "extra-argv",
  "custom-account-home",
  "unrelated-include",
] as const) {
  test(`${scenario} cannot establish a supported Ghostty context`, async (t) => {
    const original = "font-size = 14\n"
    const { host, file, state } = await setupHost(t, original)
    if (scenario === "extra-argv") state.extraArgCount = 1
    else if (scenario === "custom-account-home")
      state.accountHomeMatchesExpected = false
    else {
      state.includes = true
      state.includePath = "/resolved/font-only-include"
    }
    await host.session.sendUserMessage("/setup-keybinds ghostty", {
      expandPromptTemplates: true,
    })
    assert.equal(await readFile(file, "utf8"), original)
    assert.match(await host.output(), /verification is unavailable/)
    assert.match(await host.output(), /No\s+settings\s+changed/)
  })
}

test("an intact but ineffective managed block does not report repeat success", async (t) => {
  const { host, file, state } = await setupHost(t, "font-size = 14\n")
  const installing = host.session.sendUserMessage("/setup-keybinds ghostty", {
    expandPromptTemplates: true,
  })
  await t.waitFor(async () =>
    assert.match(await host.output(), /Set up Ghostty keybindings/),
  )
  await host.key("\r")
  await installing
  const before = await readFile(file)
  state.effective = "keybind = super+a=select_all"
  await host.session.sendUserMessage("/setup-keybinds ghostty", {
    expandPromptTemplates: true,
  })
  assert.deepEqual(await readFile(file), before)
  assert.match(await host.output(), /super\+a is not effective/)
  assert.doesNotMatch(await host.output(), /already installed/)
})

for (const failure of ["cancelled", "invalid-remaining-config"] as const) {
  test(`${failure} removal retains its intact managed block`, async (t) => {
    const { host, file, state } = await setupHost(t, "font-size = 14\n")
    const installing = host.session.sendUserMessage("/setup-keybinds ghostty", {
      expandPromptTemplates: true,
    })
    await t.waitFor(async () =>
      assert.match(await host.output(), /Set up Ghostty keybindings/),
    )
    await host.key("\r")
    await installing
    const before = await readFile(file)
    if (failure === "invalid-remaining-config") state.candidateInvalid = true
    const removing = host.session.sendUserMessage(
      "/setup-keybinds ghostty remove",
      { expandPromptTemplates: true },
    )
    if (failure === "cancelled") {
      await t.waitFor(async () =>
        assert.match(await host.output(), /Remove Ghostty keybindings/),
      )
      await host.key("\x1b")
    }
    await removing
    assert.deepEqual(await readFile(file), before)
    assert.match(await host.output(), /No\s+settings\s+changed/)
    assert.deepEqual(await readdir(dirname(file)), ["config"])
  })
}
