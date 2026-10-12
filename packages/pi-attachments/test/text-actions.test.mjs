import assert from "node:assert/strict"
import { chmod, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import { Text } from "@earendil-works/pi-tui"
import { CustomEditor } from "@earendil-works/pi-coding-agent"
import {
  holdFileRead,
  nativePi,
  snapshotPath,
  waitFor,
} from "../fixtures/native-pi.mjs"

const composerPath = fileURLToPath(
  new URL("../../pi-composer/src/index.ts", import.meta.url),
)
const attachmentsPath = fileURLToPath(
  new URL("../src/index.ts", import.meta.url),
)
const skillsPath = fileURLToPath(
  new URL("../../pi-skill-references/src/index.ts", import.meta.url),
)

async function startAction(host, action, index = 0) {
  const pending = host.runtime.session.sendUserMessage("/attachments", {
    expandPromptTemplates: true,
  })
  await waitFor(() => assert.match(host.render(), /Choose attachment/))
  for (let item = 0; item < index; item++) host.input("\x1b[B")
  host.input("\r")
  await waitFor(() => assert.ok(host.render().includes(action)))
  for (
    let item = 0;
    item <
    ["Preview text", "Restore Inline", "Remove from draft"].indexOf(action);
    item++
  )
    host.input("\x1b[B")
  host.input("\r")
  return { pending }
}

test("native attachment preview shows the captured text without changing the draft", async (t) => {
  const host = await nativePi(t)
  const source = join(host.directory, "notes.md")
  const contents = "# Captured notes\n\n```js\n\tconst answer = 42;\n```\n"
  await writeFile(source, contents)
  host.ui.setEditorText("Review this")
  await host.runtime.session.sendUserMessage(`/attach-file ${source}`, {
    expandPromptTemplates: true,
  })
  const before = host.ui.getEditorText()
  const path = snapshotPath(before)
  await writeFile(source, "Changed original")

  const pending = host.runtime.session.sendUserMessage("/attachments", {
    expandPromptTemplates: true,
  })
  await waitFor(() => assert.match(host.render(), /Choose attachment/))
  host.input("\r")
  await waitFor(() => assert.match(host.render(), /Preview text/))
  host.input("\r")
  await waitFor(() => assert.match(host.render(), /Preview: notes\.md/))
  const preview = host.render()
  assert.match(preview, /# Captured notes/)
  assert.match(preview, /```js/)
  assert.match(preview, /const answer = 42;/)
  assert.doesNotMatch(preview, /Changed original/)
  assert.equal(host.ui.getEditorText(), before)
  host.input("\x1b")
  await pending
  assert.equal(host.ui.getEditorText(), before)
  assert.match(host.render(), /Attachments \(1\): notes\.md/)
  assert.match(host.render(), /Other extension widget/)
  assert.equal(await readFile(path, "utf8"), contents)
  assert.equal(host.requests.length, 0)
})

test("Restore Inline replaces composer selection after cleanup and keeps membership undoable", async (t) => {
  const host = await nativePi(t, [composerPath])
  const source = join(host.directory, "context.txt")
  const contents = `\t// ${"context ".repeat(720)}\r\nconst answer = 42;\r\n`
  await writeFile(source, contents)
  await host.runtime.session.sendUserMessage(`/attach-file ${source}`, {
    expandPromptTemplates: true,
  })
  const reference = host.ui.getEditorText().trim()
  const path = snapshotPath(reference)
  const before = `Lead\n${reference}\nKeep old\nTail`
  host.ui.setEditorText(before)
  host.input("\x1b[1;9D")
  host.input("\x1b[D")
  for (let i = 0; i < 3; i++) host.input("\x1b[1;2D")
  await host.runtime.session.sendUserMessage("/attachments-cleanup", {
    expandPromptTemplates: true,
  })
  const { pending } = await startAction(host, "Restore Inline")
  await pending

  const after = `Lead\n\nKeep ${contents.replaceAll("\r\n", "\n")}\nTail`
  assert.equal(host.ui.getEditorText(), after)
  assert.doesNotMatch(host.render(), /Attachments \(|\[paste #/)
  await host.runtime.session.sendUserMessage("/attachments-cleanup", {
    expandPromptTemplates: true,
  })
  host.input("!")
  assert.equal(host.ui.getEditorText(), after.replace("\nTail", "!\nTail"))
  host.input("\x1b[122;9u")
  assert.equal(host.ui.getEditorText(), after)
  host.input("\x1b[122;9u")
  assert.equal(host.ui.getEditorText(), before)
  assert.match(host.render(), /Attachments \(1\): context\.txt/)
  host.input("\x1b[122;10u")
  assert.equal(host.ui.getEditorText(), after)
  host.input("\x1b[122;9u")
  host.input("selected")
  assert.equal(
    host.ui.getEditorText(),
    before.replace("Keep old", "Keep selected"),
  )
  assert.equal(await readFile(path, "utf8"), contents)
  assert.equal(host.requests.length, 0)
})

for (const selection of ["prose", "attachment"]) {
  test(`Restore Inline across preserved Markdown delimiters from ${selection} removes original references in one edit`, async (t) => {
    const host = await nativePi(t, [composerPath, skillsPath])
    await host.runtime.session.sendUserMessage("/attach-text CAPTURED", {
      expandPromptTemplates: true,
    })
    const chosen = host.ui.getEditorText().trim()
    host.ui.setEditorText("")
    await host.runtime.session.sendUserMessage(
      "/attach-text Other captured text",
      {
        expandPromptTemplates: true,
      },
    )
    const other = host.ui.getEditorText().trim()
    const line =
      selection === "prose" ? "**aa bb** cc" : `**aa ${chosen} bb** cc`
    const before = `${line}\n${chosen}\nKeep /skill:review @current.md\n${other}\n${chosen}\nTail`
    host.ui.setEditorText(before)
    host.input("\x1b[97;9u")
    host.input("\x1b[D")
    const prefix = selection === "prose" ? "aa " : "aa Attachment: "
    const selected = selection === "prose" ? "bb cc" : "text.txt bb cc"
    for (let index = 0; index < prefix.length; index++) host.input("\x1b[C")
    for (let index = 0; index < selected.length; index++)
      host.input("\x1b[1;2C")
    const { pending } = await startAction(host, "Restore Inline")
    await pending
    const after = `**aa CAPTURED**\n\nKeep /skill:review @current.md\n${other}\n\nTail`
    assert.equal(host.ui.getEditorText(), after)
    assert.doesNotMatch(host.render(), /Could not restore/)
    assert.match(host.render(), /Attachments \(1\): text\.txt/)
    host.input("\x1b[122;9u")
    assert.equal(host.ui.getEditorText(), before)
    assert.match(host.render(), /Attachments \(2\): text\.txt, text\.txt/)
    host.input("\x1b[122;10u")
    assert.equal(host.ui.getEditorText(), after)
    host.input("!")
    assert.equal(
      host.ui.getEditorText(),
      after.replace("CAPTURED", "CAPTURED!"),
    )
    host.input("\x1b[122;9u")
    host.input("\x1b[122;9u")
    assert.equal(host.ui.getEditorText(), before)
    host.input("replaced")
    assert.equal(
      host.ui.getEditorText(),
      before.replace(
        line,
        selection === "prose"
          ? "**aa replaced**"
          : `**aa ${chosen.replace("text.txt", "replaced")}**`,
      ),
    )
    assert.equal(await readFile(snapshotPath(chosen), "utf8"), "CAPTURED")
    assert.equal(
      await readFile(snapshotPath(other), "utf8"),
      "Other captured text",
    )
  })
}

test("Remove from draft removes repeated membership in one composer edit and retains other files", async (t) => {
  const host = await nativePi(t, [composerPath])
  await host.runtime.session.sendUserMessage(
    "/attach-text Remove this membership",
    { expandPromptTemplates: true },
  )
  const first = host.ui.getEditorText().trim()
  const firstPath = snapshotPath(first)
  host.ui.setEditorText("")
  await host.runtime.session.sendUserMessage(
    "/attach-text Keep this membership",
    { expandPromptTemplates: true },
  )
  const second = host.ui.getEditorText().trim()
  const secondPath = snapshotPath(second)
  const before = `Head\n${first}\n${second}\n${first}\nTail`
  host.ui.setEditorText(before)
  host.input("\x1b[1;10D")
  const { pending } = await startAction(host, "Remove from draft")
  await pending
  const after = `Head\n\n${second}\n\nTail`
  assert.equal(host.ui.getEditorText(), after)
  assert.match(host.render(), /Attachments \(1\): text\.txt/)
  host.input("\x1b[122;9u")
  assert.equal(host.ui.getEditorText(), before)
  assert.match(host.render(), /Attachments \(2\): text\.txt, text\.txt/)
  host.input("\x1b[122;10u")
  assert.equal(host.ui.getEditorText(), after)
  host.input("\x1b[122;9u")
  host.input("Selected tail")
  assert.equal(
    host.ui.getEditorText(),
    `Head\n${first}\n${second}\n${first}\nSelected tail`,
  )
  assert.equal(await readFile(firstPath, "utf8"), "Remove this membership")
  assert.equal(await readFile(secondPath, "utf8"), "Keep this membership")
})

test("a pending restore cannot replace a newer composer selection", async (t) => {
  const host = await nativePi(t, [composerPath])
  await host.runtime.session.sendUserMessage(
    "/attach-text Captured before moving",
    { expandPromptTemplates: true },
  )
  const reference = host.ui.getEditorText().trim()
  const path = snapshotPath(reference)
  const before = `${reference}\nMove here`
  host.ui.setEditorText(before)
  const read = holdFileRead(t, path)
  const { pending } = await startAction(host, "Restore Inline")
  await read.started()
  host.input("\x1b[1;2D")
  read.release()
  await pending
  assert.equal(host.ui.getEditorText(), before)
  assert.match(host.render(), /requesting draft changed/i)
  host.input("!")
  assert.equal(host.ui.getEditorText(), `${reference}\nMove her!`)
  assert.equal(await readFile(path, "utf8"), "Captured before moving")
})

test("a native text rendering failure leaves preview content and membership recoverable", async (t) => {
  const host = await nativePi(t, [composerPath])
  await host.runtime.session.sendUserMessage(
    "/attach-text Captured preview body",
    { expandPromptTemplates: true },
  )
  const before = host.ui.getEditorText()
  const path = snapshotPath(before)
  const { pending } = await startAction(host, "Preview text")
  await waitFor(() => assert.match(host.render(), /Captured preview body/))
  const render = Text.prototype.render
  t.mock.method(Text.prototype, "render", function (width) {
    const lines = render.call(this, width)
    if (lines.some((line) => line.includes("Captured preview body")))
      throw new Error("Controlled native Text render failure")
    return lines
  })
  assert.match(
    host.render(),
    /Preview unavailable.*Controlled native Text render failure/,
  )
  assert.equal(host.ui.getEditorText(), before)
  host.input("\x1b")
  await pending
  assert.match(host.render(), /Attachments \(1\): text\.txt/)
  assert.equal(await readFile(path, "utf8"), "Captured preview body")
})

for (const view of ["formatted", "source"]) {
  for (const position of ["before", "inside", "after", "repeated"]) {
    test(`Restore Inline maps ${position} references across a ${view} code selection`, async (t) => {
      const host = await nativePi(t, [composerPath])
      const source = join(host.directory, "code.txt")
      const contents = `\tconst literal = \`/skill:sample @file **literal**\`;\r\n// ${"x".repeat(5001)}\r\n`
      await writeFile(source, contents)
      await host.runtime.session.sendUserMessage(`/attach-file ${source}`, {
        expandPromptTemplates: true,
      })
      const reference = host.ui.getEditorText().trim()
      const path = snapshotPath(reference)
      const prefix =
        position === "before" || position === "repeated"
          ? `Head\n${reference}\n`
          : "Head\n"
      const selected =
        position === "inside" ? `${reference}\nKeep old` : "Keep old"
      const suffix =
        position === "after" || position === "repeated"
          ? `\n${reference}\nTail`
          : "\nTail"
      const before = `${prefix}\`\`\`text\n${selected}\n\`\`\`${suffix}`
      host.ui.setEditorText(before)
      if (view === "source") host.input("\x1b[109;10u")
      const trailingLines =
        position === "after" || position === "repeated" ? 3 : 2
      for (let line = 0; line < trailingLines; line++) {
        host.input("\x1b[1;9D")
        host.input("\x1b[D")
      }
      if (position === "inside") {
        host.input("\x1b[1;10D")
        host.input("\x1b[1;2D")
        host.input("\x1b[1;10D")
      } else {
        for (let i = 0; i < 3; i++) host.input("\x1b[1;2D")
      }
      const { pending } = await startAction(host, "Restore Inline")
      await pending
      const inline = contents.replaceAll("\r\n", "\n")
      const after = `${prefix.replaceAll(reference, "")}\`\`\`text\n${position === "inside" ? "" : "Keep "}${inline}\n\`\`\`${suffix.replaceAll(reference, "")}`
      assert.equal(host.ui.getEditorText(), after)
      assert.doesNotMatch(host.render(), /Attachments \(|\[paste #/)
      host.input("!")
      assert.equal(
        host.ui.getEditorText(),
        after.replace("\n```\n", "!\n```\n"),
      )
      host.input("\x1b[122;9u")
      host.input("\x1b[109;10u")
      host.input("\x1b[122;9u")
      assert.equal(host.ui.getEditorText(), before)
      assert.match(host.render(), /Attachments \(1\): code\.txt/)
      host.input("\x1b[122;10u")
      assert.equal(host.ui.getEditorText(), after)
      host.input("\x1b[122;9u")
      host.input("chosen")
      const reselected =
        position === "inside"
          ? before.replace(`${reference}\nKeep old`, "chosen")
          : before.replace("Keep old", "Keep chosen")
      assert.equal(host.ui.getEditorText(), reselected)
      assert.equal(await readFile(path, "utf8"), contents)
      assert.equal(host.requests.length, 0)
    })
  }
}

test("native Restore Inline removes an empty captured text attachment", async (t) => {
  const host = await nativePi(t)
  const source = join(host.directory, "empty.txt")
  await writeFile(source, "")
  await host.runtime.session.sendUserMessage(`/attach-file ${source}`, {
    expandPromptTemplates: true,
  })
  const reference = host.ui.getEditorText().trim()
  const path = snapshotPath(reference)
  host.ui.setEditorText(`Keep\n${reference}\nTail`)
  const { pending } = await startAction(host, "Restore Inline")
  await pending
  assert.equal(host.ui.getEditorText(), "Keep\n\nTail")
  assert.doesNotMatch(host.render(), /Attachments \(/)
  assert.equal((await readFile(path)).length, 0)
})

for (const editor of ["native", "composer"]) {
  test(`${editor} Restore Inline inserts complete captured text at the caret with native whitespace rules`, async (t) => {
    const host = await nativePi(t, editor === "composer" ? [composerPath] : [])
    const source = join(host.directory, "utf8.txt")
    const contents = `\ufeff\tconst value = "😀";\r\n// ${"x".repeat(5001)}\r\n`
    await writeFile(source, contents)
    await host.runtime.session.sendUserMessage(`/attach-file ${source}`, {
      expandPromptTemplates: true,
    })
    const reference = host.ui.getEditorText().trim()
    const path = snapshotPath(reference)
    host.ui.setEditorText(`Keep\n${reference}\nTail`)
    for (let i = 0; i < 4; i++) host.input("\x1b[D")
    const { pending } = await startAction(host, "Restore Inline")
    await pending
    const inline =
      editor === "composer"
        ? contents.replaceAll("\r\n", "\n")
        : contents.replaceAll("\r\n", "\n").replaceAll("\t", "    ")
    assert.equal(host.ui.getEditorText(), `Keep\n\n${inline}Tail`)
    assert.doesNotMatch(host.render(), /Attachments \(|\[paste #/)
    assert.deepEqual(await readFile(path), Buffer.from(contents))
    assert.equal(host.requests.length, 0)
  })

  test(`${editor} Restore Inline keeps the captured body when the caret is inside its reference`, async (t) => {
    const host = await nativePi(t, editor === "composer" ? [composerPath] : [])
    await host.runtime.session.sendUserMessage("/attach-text CAPTURED", {
      expandPromptTemplates: true,
    })
    const reference = host.ui.getEditorText().trim()
    const path = snapshotPath(reference)
    const before = `Keep\n${reference}\nTail`
    host.ui.setEditorText(before)
    if (editor === "composer") host.input("\x1b[109;10u")
    host.input("\x01")
    host.input("\x1b[D")
    host.input("\x01")
    for (let i = 0; i < "[Attachment: te".length; i++) host.input("\x1b[C")
    const { pending } = await startAction(host, "Restore Inline")
    await pending
    assert.equal(host.ui.getEditorText(), "Keep\nCAPTURED\nTail")
    assert.doesNotMatch(host.render(), /Attachments \(/)
    assert.equal(await readFile(path, "utf8"), "CAPTURED")
    if (editor === "composer") {
      host.input("\x1b[122;9u")
      assert.equal(host.ui.getEditorText(), before)
      host.input("!")
      assert.equal(
        host.ui.getEditorText(),
        before.replace("[Attachment: text", "[Attachment: te!xt"),
      )
    }
  })
}

test("the attachment widget exposes its shortcut and composer preview scrolls without editing", async (t) => {
  const host = await nativePi(t, [composerPath])
  const source = join(host.directory, "long.txt")
  const contents =
    "First captured line\r\n" +
    "A middle captured line\r\n".repeat(60) +
    "Final captured line\r\n"
  await writeFile(source, contents)
  await host.runtime.session.sendUserMessage(`/attach-file ${source}`, {
    expandPromptTemplates: true,
  })
  const reference = host.ui.getEditorText().trim()
  const path = snapshotPath(reference)
  const before = `${reference}\nKeep old`
  host.ui.setEditorText(before)
  for (let i = 0; i < 3; i++) host.input("\x1b[1;2D")
  assert.match(host.render(), /\/attachments/)
  host.input("\x1b[97;7u")
  await waitFor(() => assert.match(host.render(), /Choose attachment/))
  host.input("\r")
  await waitFor(() => assert.match(host.render(), /Preview text/))
  host.input("\r")
  await waitFor(() => assert.match(host.render(), /First captured line/))
  assert.match(host.render(), /next page/)
  assert.doesNotMatch(host.render(), /Final captured line/)
  for (let i = 0; i < 3; i++) host.input("\x1b[6~")
  assert.match(host.render(), /Final captured line/)
  assert.equal(host.ui.getEditorText(), before)
  host.input("\x1b")
  await waitFor(() => assert.doesNotMatch(host.render(), /Preview: long\.txt/))
  host.input("new")
  assert.equal(host.ui.getEditorText(), `${reference}\nKeep new`)
  host.input("\x1b[122;9u")
  assert.equal(host.ui.getEditorText(), before)
  assert.equal(await readFile(path, "utf8"), contents)
})

for (const action of ["Preview text", "Restore Inline"]) {
  test(`${action} preserves the selected draft when the snapshot is unreadable`, async (t) => {
    const host = await nativePi(t, [composerPath])
    await host.runtime.session.sendUserMessage(
      "/attach-text Recoverable bytes",
      { expandPromptTemplates: true },
    )
    const reference = host.ui.getEditorText().trim()
    const path = snapshotPath(reference)
    const before = `${reference}\nKeep old`
    host.ui.setEditorText(before)
    for (let i = 0; i < 3; i++) host.input("\x1b[1;2D")
    await chmod(path, 0o000)
    try {
      const { pending } = await startAction(host, action)
      await pending
      assert.equal(host.ui.getEditorText(), before)
      assert.match(host.render(), /Could not (?:preview|restore).*EACCES/)
      assert.match(host.render(), /Attachments \(1\): text\.txt/)
      host.input("new")
      assert.equal(host.ui.getEditorText(), `${reference}\nKeep new`)
    } finally {
      await chmod(path, 0o600)
    }
    assert.equal(await readFile(path, "utf8"), "Recoverable bytes")
  })

  for (const change of ["session", "editor", "same-text edit"]) {
    test(`late ${action} cannot overwrite a replacement ${change}`, async (t) => {
      const host = await nativePi(
        t,
        change === "same-text edit" ? [composerPath] : [],
      )
      await host.runtime.session.sendUserMessage(
        "/attach-text Retained delayed bytes",
        { expandPromptTemplates: true },
      )
      const before = host.ui.getEditorText()
      const path = snapshotPath(before)
      const read = holdFileRead(t, path)
      const { pending } = await startAction(host, action)
      await read.started()
      if (change === "session") await host.runtime.newSession()
      if (change === "editor")
        host.ui.setEditorComponent(
          (tui, theme, keybindings) =>
            new CustomEditor(tui, theme, keybindings),
        )
      host.ui.setEditorText("Replacement draft")
      if (change === "same-text edit") host.ui.setEditorText(before)
      read.release()
      await pending
      assert.equal(
        host.ui.getEditorText(),
        change === "same-text edit" ? before : "Replacement draft",
      )
      assert.doesNotMatch(host.render(), /Preview: text\.txt/)
      assert.equal(await readFile(path, "utf8"), "Retained delayed bytes")
    })
  }
}

test("a changed draft cancels removal while the attachment picker is open", async (t) => {
  const host = await nativePi(t, [composerPath])
  await host.runtime.session.sendUserMessage("/attach-text Keep membership", {
    expandPromptTemplates: true,
  })
  const before = host.ui.getEditorText()
  const path = snapshotPath(before)
  const pending = host.runtime.session.sendUserMessage("/attachments", {
    expandPromptTemplates: true,
  })
  await waitFor(() => assert.match(host.render(), /Choose attachment/))
  host.ui.setEditorText("Later draft")
  host.ui.setEditorText(before)
  host.input("\r")
  await pending
  assert.equal(host.ui.getEditorText(), before)
  assert.match(host.render(), /requesting draft changed/i)
  assert.equal(await readFile(path, "utf8"), "Keep membership")
})

test("Remove from draft preserves a snapshot used by a submitted request and another session draft", async (t) => {
  const host = await nativePi(t, [composerPath])
  await host.runtime.session.sendUserMessage(
    "/attach-text Shared captured bytes",
    { expandPromptTemplates: true },
  )
  const reference = host.ui.getEditorText().trim()
  const path = snapshotPath(reference)
  const sessionFile = host.runtime.session.sessionFile
  host.submit()
  await waitFor(() => assert.equal(host.requests.length, 1))
  await waitFor(() => assert.equal(host.runtime.session.isStreaming, false))
  const submitted = host.requests[0].messages.find(
    (message) => message.role === "user",
  ).content[0].text
  assert.equal(snapshotPath(submitted), path)
  const draftA = `Draft A\n${reference}`
  host.ui.setEditorText(draftA)
  await host.runtime.newSession()
  host.ui.setEditorText(`Draft B\n${reference}`)
  const { pending } = await startAction(host, "Remove from draft")
  await pending
  assert.equal(host.ui.getEditorText(), "Draft B\n")
  assert.equal(await readFile(path, "utf8"), "Shared captured bytes")
  await host.runtime.switchSession(sessionFile)
  assert.equal(host.ui.getEditorText(), draftA)
  assert.match(host.render(), /Attachments \(1\): text\.txt/)
  assert.equal(
    await readFile(snapshotPath(submitted), "utf8"),
    "Shared captured bytes",
  )
})

test("all three packages preserve one native change callback, formatted selection, and other attachment membership", async (t) => {
  const host = await nativePi(t, [composerPath, attachmentsPath, skillsPath])
  const source = join(host.directory, "chosen.txt")
  const contents = "\tCAPTURED\n`literal code`\n"
  await writeFile(source, contents)
  await host.runtime.session.sendUserMessage(`/attach-file ${source}`, {
    expandPromptTemplates: true,
  })
  const first = host.ui.getEditorText().trim()
  host.ui.setEditorText("")
  await host.runtime.session.sendUserMessage("/attach-text Other attachment", {
    expandPromptTemplates: true,
  })
  const second = host.ui.getEditorText().trim()
  const edits = []
  let nativeEditor
  const previous = host.ui.getEditorComponent()
  host.ui.setEditorComponent((...args) => {
    nativeEditor = previous(...args)
    return new Proxy(nativeEditor, {
      set(target, property, value) {
        if (property === "onChange") {
          target.onChange = (text) => {
            edits.push({
              text,
              visible: host.ui.getEditorText(),
              cursor: target.getCursor(),
            })
            value?.(text)
          }
          return true
        }
        return Reflect.set(target, property, value)
      },
    })
  })
  const before = `Keep\n${first} **old**\n${first}\nTail\n${second}`
  host.ui.setEditorText(before)
  for (let line = 0; line < 3; line++) {
    host.input("\x1b[1;9D")
    host.input("\x1b[D")
  }
  host.input("\x1b[1;10D")
  edits.length = 0
  const { pending } = await startAction(host, "Restore Inline")
  await pending
  const after = `Keep\n${contents}\n\nTail\n${second}`
  assert.equal(host.ui.getEditorText(), after)
  assert.deepEqual(edits, [
    { text: after, visible: after, cursor: { line: 3, col: 0 } },
  ])
  assert.match(host.render(), /Attachments \(1\): text\.txt/)
  host.input("\x1b[122;9u")
  assert.equal(host.ui.getEditorText(), before)
  host.input("\x1b[122;10u")
  assert.equal(host.ui.getEditorText(), after)
  assert.deepEqual(nativeEditor.getCursor(), { line: 3, col: 0 })
  assert.equal(await readFile(snapshotPath(first), "utf8"), contents)
  assert.equal(await readFile(snapshotPath(second), "utf8"), "Other attachment")
})

test("native Restore Inline retains pasted text around the caret and removes membership inside it", async (t) => {
  const host = await nativePi(t)
  await host.runtime.session.sendUserMessage("/attach-text CAPTURED", {
    expandPromptTemplates: true,
  })
  const reference = host.ui.getEditorText().trim()
  const path = snapshotPath(reference)
  host.ui.setEditorText("Left ")
  const first = "first ".repeat(200)
  const second = "second ".repeat(200)
  host.ui.pasteToEditor(`${first}${reference}\n`)
  host.input(" middle ")
  host.ui.pasteToEditor(second)
  host.input(" Tail")
  assert.equal(
    host.ui.getEditorText(),
    `Left ${first}${reference}\n middle ${second} Tail`,
  )
  host.input("\x01")
  for (let i = 0; i < " middle ".length; i++) host.input("\x1b[C")
  const { pending } = await startAction(host, "Restore Inline")
  await pending
  assert.equal(
    host.ui.getEditorText(),
    `Left ${first}\n middle CAPTURED${second} Tail`,
  )
  assert.doesNotMatch(host.render(), /Attachments \(/)
  assert.equal(await readFile(path, "utf8"), "CAPTURED")
})

test("native Restore Inline keeps pasted text when inserting inside a visible reference", async (t) => {
  const host = await nativePi(t)
  await host.runtime.session.sendUserMessage("/attach-text CAPTURED", {
    expandPromptTemplates: true,
  })
  const reference = host.ui.getEditorText().trim()
  const path = snapshotPath(reference)
  const pasted = "Earlier paste ".repeat(100)
  host.ui.setEditorText("")
  host.ui.pasteToEditor(pasted)
  host.ui.pasteToEditor(`\n${reference}\nTail`)
  host.input("\x01")
  host.input("\x1b[D")
  host.input("\x01")
  for (let i = 0; i < "[Attachment: te".length; i++) host.input("\x1b[C")
  const { pending } = await startAction(host, "Restore Inline")
  await pending
  assert.equal(host.ui.getEditorText(), `${pasted}\nCAPTURED\nTail`)
  assert.doesNotMatch(host.render(), /Attachments \(/)
  assert.equal(await readFile(path, "utf8"), "CAPTURED")
})

test("attachment pickers and text preview honor effective native keybindings", async (t) => {
  const host = await nativePi(t, [composerPath])
  const contents = "First line\n" + "Middle line\n".repeat(25) + "Last line"
  await host.runtime.session.sendUserMessage(`/attach-text ${contents}`, {
    expandPromptTemplates: true,
  })
  const before = host.ui.getEditorText()
  const path = snapshotPath(before)
  await writeFile(
    join(host.agentDir, "keybindings.json"),
    JSON.stringify({
      "tui.select.confirm": "ctrl+j",
      "tui.select.cancel": "ctrl+q",
      "tui.select.pageDown": "ctrl+f",
    }),
  )
  const previous = host.ui.getEditorComponent()
  host.ui.setEditorComponent((tui, theme, keybindings) => {
    keybindings.reload()
    return previous(tui, theme, keybindings)
  })
  const pending = host.runtime.session.sendUserMessage("/attachments", {
    expandPromptTemplates: true,
  })
  await waitFor(() => assert.match(host.render(), /Choose attachment/))
  host.input("\r")
  assert.match(host.render(), /Choose attachment/)
  host.input("\n")
  await waitFor(() => assert.match(host.render(), /Preview text/))
  host.input("\n")
  await waitFor(() => assert.match(host.render(), /Preview: text\.txt/))
  assert.match(host.render(), /First line/)
  assert.doesNotMatch(host.render(), /Last line/)
  host.input("\x06")
  assert.match(host.render(), /Last line/)
  host.input("\x11")
  await pending
  assert.equal(host.ui.getEditorText(), before)
  assert.equal(await readFile(path, "utf8"), contents)
})
