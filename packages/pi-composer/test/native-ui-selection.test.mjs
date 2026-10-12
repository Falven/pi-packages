/* eslint-disable no-await-in-loop, no-control-regex -- Exercise native terminal gestures and inspect the rendered selection. */
import assert from "node:assert/strict"
import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import { stripVTControlCharacters } from "node:util"
import {
  getCapabilities,
  SelectList,
  setCapabilities,
} from "@earendil-works/pi-tui"
import { getSelectListTheme } from "@earendil-works/pi-coding-agent"
import { openHost } from "../fixtures/host.ts"
import {
  holdFileRead,
  snapshotPath,
} from "../../pi-attachments/test-support/native-pi.mjs"

const attachments = fileURLToPath(
  new URL("../../pi-attachments/src/index.ts", import.meta.url),
)
const paste = fileURLToPath(
  new URL("../../pi-paste/src/index.ts", import.meta.url),
)
const skills = fileURLToPath(
  new URL("../../pi-skill-references/src/index.ts", import.meta.url),
)
const PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAADUlEQVR4nGP4zwAE/wEHAAH/4iOeWQAAAABJRU5ErkJggg=="
const undo = "\x1b[122;9u"
const redo = "\x1b[122;10u"
const toggleView = "\x1b[109;10u"

function renderedLine(host, text) {
  const lines = [
    ...host.terminal.output.matchAll(
      /\x1b\[(\d+);1H\x1b\[2K(.*?)(?=\x1b\[\d+;\d+H|$)/gs,
    ),
  ]
  const line = lines.findLast((candidate) =>
    stripVTControlCharacters(candidate[2]).includes(text),
  )
  assert(line, `Pi must render ${JSON.stringify(text)}`)
  return { row: Number(line[1]), text: line[2] }
}

for (const view of ["formatted", "source"]) {
  test(`a custom skill picker retains ${view} selection during image redraws and accepts one public insertion`, async (t) => {
    const capabilities = getCapabilities()
    setCapabilities({ ...capabilities, images: null })
    t.after(() => setCapabilities(capabilities))
    const host = await openHost(t, {
      extensionPaths: [attachments, paste, skills],
      extension: (pi) => {
        pi.registerShortcut("ctrl+shift+p", {
          description: "Choose a skill",
          handler: async (ctx) => {
            const value = await ctx.ui.custom(
              (_tui, _theme, _keys, done) => {
                const picker = new SelectList(
                  [
                    { value: "/skill:review", label: "Review skill" },
                    { value: "/skill:audit", label: "Audit skill" },
                  ],
                  5,
                  getSelectListTheme(),
                )
                picker.onSelect = (item) => done(item.value)
                picker.onCancel = () => done(undefined)
                return picker
              },
              { overlay: true },
            )
            if (value !== undefined) ctx.ui.pasteToEditor(value)
          },
        })
      },
    })
    const source = join(host.directory, "picker.png")
    await writeFile(source, Buffer.from(PNG, "base64"))
    await host.session.sendUserMessage(`/attach-file ${source}`, {
      expandPromptTemplates: true,
    })
    const reference = host.ui.getEditorText().trim()
    const path = snapshotPath(reference)
    const held = holdFileRead(t, path)
    const draft = `${reference}\nApply /skill:review\n**Keep** old`
    host.ui.setEditorText(draft)
    if (view === "source") await host.key(toggleView)
    for (let index = 0; index < 3; index++) await host.key("\x1b[1;2D")
    await held.started()
    host.terminal.output = ""
    await host.key("\x1b[112;6u")
    await t.waitFor(async () =>
      assert.match(await host.output(), /Audit skill/),
    )
    held.release()
    await t.waitFor(async () =>
      assert.match(await host.output(), /\[Image: picker\.png/),
    )
    host.terminal.resize(48, 28)
    assert.equal(host.ui.setTheme("light").success, true)
    await host.key("\x1b[B")
    await host.key("\x1b[A")
    await host.key("\x1b[13;9u")
    await host.type("Ignored by the picker")
    assert.equal(host.ui.getEditorText(), draft)
    assert.equal(host.requests.length, 0)
    await host.key("\x1b")
    await host.type("new")
    assert.equal(host.ui.getEditorText(), draft.replace(/old$/, "new"))
    await host.key(undo)
    assert.equal(host.ui.getEditorText(), draft)

    host.terminal.output = ""
    await host.key("\x1b[112;6u")
    await t.waitFor(async () =>
      assert.match(await host.output(), /Audit skill/),
    )
    await host.key("\x1b[B")
    await host.key("\r")
    const inserted = draft.replace(/old$/, "/skill:audit")
    assert.equal(host.ui.getEditorText(), inserted)
    assert.equal(host.requests.length, 0)
    await host.key(undo)
    assert.equal(host.ui.getEditorText(), draft)
    await host.key(redo)
    assert.equal(host.ui.getEditorText(), inserted)
    await host.key(undo)
    await host.type("new")
    assert.equal(host.ui.getEditorText(), draft.replace(/old$/, "new"))

    host.ui.addAutocompleteProvider((base) => ({
      triggerCharacters: ["$"],
      async getSuggestions(lines, line, col, options) {
        if (!lines[line].slice(0, col).endsWith("$late"))
          return base.getSuggestions(lines, line, col, options)
        return {
          prefix: "$late",
          items: [{ value: "/skill:later", label: "Later skill provider" }],
        }
      },
      applyCompletion: (...args) => base.applyCompletion(...args),
    }))
    await host.type(" $late")
    await t.waitFor(async () =>
      assert.match(await host.output(), /Later skill provider/),
    )
    await host.key("\r")
    assert.equal(
      host.ui.getEditorText(),
      draft.replace(/old$/, "new /skill:later"),
    )
    await host.key(undo)
    assert.equal(host.ui.getEditorText(), draft.replace(/old$/, "new $late"))
    assert.equal(host.requests.length, 0)
    assert.deepEqual(await readFile(path), Buffer.from(PNG, "base64"))
  })

  test(`native attachment management preserves ${view} selection and atomic history beside images and a provider`, async (t) => {
    const capabilities = getCapabilities()
    setCapabilities({ ...capabilities, images: null })
    t.after(() => setCapabilities(capabilities))
    const host = await openHost(t, {
      extensionPaths: [attachments, paste, skills],
    })
    host.ui.setWidget("other", ["Other native widget"])
    const contents =
      "First captured line\r\n" +
      "\tMiddle captured line\r\n".repeat(250) +
      "Last captured line"
    const source = join(host.directory, "context.txt")
    await writeFile(source, contents)
    await host.session.sendUserMessage(`/attach-file ${source}`, {
      expandPromptTemplates: true,
    })
    const textReference = host.ui.getEditorText().trim()
    const textPath = snapshotPath(textReference)
    host.ui.setEditorText("")
    const picture = join(host.directory, "context.png")
    await writeFile(picture, Buffer.from(PNG, "base64"))
    await host.session.sendUserMessage(`/attach-file ${picture}`, {
      expandPromptTemplates: true,
    })
    const imageReference = host.ui.getEditorText().trim()
    const imagePath = snapshotPath(imageReference)
    const draft = `${textReference}\n${imageReference}\nApply /skill:review\n**Keep** old`
    host.ui.setEditorText(draft)
    if (view === "source") await host.key(toggleView)
    for (let index = 0; index < 3; index++) await host.key("\x1b[1;2D")
    await t.waitFor(async () =>
      assert.match(await host.output(), /\[Image: context\.png/),
    )
    await writeFile(join(host.directory, "companion.md"), "Current file")
    host.ui.addAutocompleteProvider((base) => ({
      async getSuggestions(...args) {
        const suggestions = await base.getSuggestions(...args)
        if (!suggestions) return null
        for (const item of suggestions.items)
          item.label = `Wrapped ${item.label}`
        return suggestions
      },
      applyCompletion: (...args) => base.applyCompletion(...args),
    }))
    async function openManagement() {
      host.terminal.output = ""
      await host.key("\x1b[97;7u")
      await t.waitFor(async () =>
        assert.match(await host.output(), /Choose attachment/),
      )
    }
    async function chooseAction(action) {
      await openManagement()
      host.terminal.output = ""
      await host.key("\r")
      await t.waitFor(async () =>
        assert.match(await host.output(), /Restore Inline/),
      )
      for (
        let index = 0;
        index <
        ["Preview text", "Restore Inline", "Remove from draft"].indexOf(action);
        index++
      )
        await host.key("\x1b[B")
      await host.key("\r")
    }

    for (const stage of ["attachment", "action"]) {
      await openManagement()
      if (stage === "action") {
        host.terminal.output = ""
        await host.key("\r")
        await t.waitFor(async () =>
          assert.match(await host.output(), /Restore Inline/),
        )
      }
      await host.key("\x1b[B")
      await host.key("\x1b[A")
      await host.key("\x1b")
      assert.equal(host.ui.getEditorText(), draft)
      await host.type("new")
      assert.equal(host.ui.getEditorText(), draft.replace(/old$/, "new"))
      await host.key(undo)
      assert.equal(host.ui.getEditorText(), draft)
    }

    await chooseAction("Preview text")
    await t.waitFor(async () =>
      assert.match(await host.output(), /Preview: context\.txt/),
    )
    await host.key("\x1b[6~")
    await host.key("\x1b[B")
    await host.key("\x1b[5~")
    await host.key("\x1b[A")
    host.terminal.resize(40, 20)
    await host.key("\x1b[13;9u")
    await host.type("Ignored by preview")
    assert.equal(host.ui.getEditorText(), draft)
    assert.equal(host.requests.length, 0)
    await host.key("\x1b")
    await host.type("new")
    assert.equal(host.ui.getEditorText(), draft.replace(/old$/, "new"))
    await host.key(undo)
    assert.equal(host.ui.getEditorText(), draft)

    await chooseAction("Restore Inline")
    const restored = draft
      .replace(textReference, "")
      .replace(/old$/, contents.replaceAll("\r\n", "\n"))
    await t.waitFor(() => assert.equal(host.ui.getEditorText(), restored))
    assert.equal(await readFile(textPath, "utf8"), contents)
    await host.key(undo)
    assert.equal(host.ui.getEditorText(), draft)
    await host.key(redo)
    assert.equal(host.ui.getEditorText(), restored)
    await host.key(undo)

    await chooseAction("Remove from draft")
    const removed = draft.replace(textReference, "")
    await t.waitFor(() => assert.equal(host.ui.getEditorText(), removed))
    await host.key(undo)
    assert.equal(host.ui.getEditorText(), draft)
    await host.key(redo)
    assert.equal(host.ui.getEditorText(), removed)
    await host.key(undo)
    await host.type("new")
    assert.equal(host.ui.getEditorText(), draft.replace(/old$/, "new"))
    await host.type(" @comp")
    await t.waitFor(async () =>
      assert.match(await host.output(), /Wrapped companion\.md/),
    )
    await host.key("\r")
    assert.equal(
      host.ui.getEditorText(),
      draft.replace(/old$/, "new @companion.md "),
    )
    await host.key(undo)
    assert.equal(host.ui.getEditorText(), draft.replace(/old$/, "new @comp"))
    assert.equal(await readFile(textPath, "utf8"), contents)
    assert.deepEqual(await readFile(imagePath), Buffer.from(PNG, "base64"))
    assert.equal(host.requests.length, 0)
  })
}

function highlighted(text) {
  return [...text.matchAll(/\x1b\[7m(.*?)\x1b\[27m/gs)]
    .map((match) => stripVTControlCharacters(match[1]))
    .join("")
}

for (const view of ["formatted", "source"]) {
  for (const selection of ["partial", "full"]) {
    for (const preview of ["loaded", "failed"]) {
      test(`${preview} native image preview retains ${selection} ${view} selection through resize, scroll, and view changes`, async (t) => {
        const capabilities = getCapabilities()
        setCapabilities({ ...capabilities, images: null })
        t.after(() => setCapabilities(capabilities))
        const host = await openHost(t, { extensionPaths: [attachments] })
        let tui
        host.ui.setWidget("selection-observer", (nativeTui) => {
          tui = nativeTui
          return { render: () => ["Other native widget"], invalidate() {} }
        })
        const refresh = () => {
          host.terminal.output = ""
          tui.requestRender(true)
          tui.renderNow()
        }
        const source = join(host.directory, "selected.png")
        const bytes =
          preview === "loaded"
            ? Buffer.from(PNG, "base64")
            : Buffer.from(PNG, "base64").subarray(0, 33)
        await writeFile(source, bytes)
        await host.session.sendUserMessage(`/attach-file ${source}`, {
          expandPromptTemplates: true,
        })
        const reference = host.ui.getEditorText().trim()
        const path = snapshotPath(reference)
        const held = holdFileRead(t, path)
        const draft = [
          reference,
          ...Array.from({ length: 12 }, (_, index) => `Row ${index}`),
          "**Keep** old",
        ].join("\n")
        host.ui.setEditorText(draft)
        if (view === "source") await host.key(toggleView)
        if (selection === "full") await host.key("\x1b[97;9u")
        else for (let index = 0; index < 3; index++) await host.key("\x1b[1;2D")
        const line = view === "source" ? "**Keep** old" : "Keep old"
        const selected = selection === "full" ? line : "old"
        await held.started()
        refresh()
        assert.equal(
          highlighted(renderedLine(host, line).text).trimEnd(),
          selected,
        )

        held.release()
        await t.waitFor(async () =>
          assert.match(
            await host.output(),
            preview === "loaded"
              ? /\[Image: selected\.png.*2x1/
              : /Preview unavailable: selected\.png/,
          ),
        )
        refresh()
        assert.equal(
          highlighted(renderedLine(host, line).text).trimEnd(),
          selected,
        )
        host.terminal.resize(32, 20)
        assert.equal(host.ui.setTheme("light").success, true)
        refresh()
        const row = renderedLine(host, line).row
        await host.key(`\x1b[<64;3;${row}M`)
        refresh()
        assert.equal(
          stripVTControlCharacters(host.terminal.output).includes(line),
          false,
        )
        await host.key(toggleView)
        await host.key(toggleView)
        refresh()
        assert.equal(host.ui.getEditorText(), draft)
        assert.equal(
          highlighted(renderedLine(host, line).text).trimEnd(),
          selected,
        )

        await host.type("new")
        assert.equal(
          host.ui.getEditorText(),
          selection === "full" ? "new" : draft.replace(/old$/, "new"),
        )
        await host.key(undo)
        assert.equal(host.ui.getEditorText(), draft)
        await host.key(selection === "full" ? "\x1b[1;2D" : "\x1b[1;2C")
        await host.type("new")
        assert.equal(
          host.ui.getEditorText(),
          selection === "full" ? "newd" : draft.replace(/old$/, "onew"),
        )
        assert.deepEqual(await readFile(path), bytes)
        assert.equal(host.requests.length, 0)
      })
    }
  }
}
