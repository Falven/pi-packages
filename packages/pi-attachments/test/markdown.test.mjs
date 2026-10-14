import assert from "node:assert/strict"
import fs, { readFile, writeFile } from "node:fs/promises"
import { syncBuiltinESMExports } from "node:module"
import { join } from "node:path"
import { test } from "node:test"
import { fileURLToPath, pathToFileURL } from "node:url"
import {
  holdFileRead,
  nativePi,
  retainedRequest,
  snapshotPath,
  waitFor,
} from "../fixtures/native-pi.mjs"

const composerPath = fileURLToPath(
  new URL("../../pi-composer/src/index.ts", import.meta.url),
)
const expandedInput = fileURLToPath(
  new URL("../fixtures/expanded-input.ts", import.meta.url),
)
const PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAADUlEQVR4nGP4zwAE/wEHAAH/4iOeWQAAAABJRU5ErkJggg=="

test("a local Markdown link captures once and preserves its label and surrounding draft", async (t) => {
  const host = await nativePi(t)
  const source = join(host.directory, "notes.txt")
  await writeFile(source, "Captured notes\n")
  host.ui.setEditorText('Lead [Review notes](notes.txt "Read these") tail')
  await waitFor(() =>
    assert.match(host.ui.getEditorText(), /pi-attachments\/snapshot-/),
  )
  const draft = host.ui.getEditorText()
  const [, path] =
    /\[Review notes\]\(<([^>]+)> "Read these"\)/.exec(draft) ?? []
  assert.ok(path)
  assert.equal(draft, `Lead [Review notes](<${path}> "Read these") tail`)
  assert.equal(await readFile(path, "utf8"), "Captured notes\n")
  assert.match(host.render(), /Manage attachments/)
  await writeFile(source, "Later source contents")
  host.resize(70)
  host.render()
  assert.equal(host.ui.getEditorText(), draft)
  host.submit()
  await waitFor(() => assert.equal(host.requests.length, 1))
  assert.equal(await readFile(path, "utf8"), "Captured notes\n")
  assert.ok(
    host.requests[0].messages.some(
      (message) =>
        message.role === "user" &&
        message.content.some((content) => content.text === draft),
    ),
  )
})

test("reference-style links capture through their used definition and leave equal unused definitions alone", async (t) => {
  const host = await nativePi(t)
  await writeFile(
    join(host.directory, "notes.txt"),
    "Shared reference contents",
  )
  const before =
    '[unused]: notes.txt\n\n[Review][chosen] and ![Diagram][chosen]\n\n[chosen]: <notes.txt> "Read these"\n[spare]: notes.txt\n'
  host.ui.setEditorText(before)
  await waitFor(() =>
    assert.match(host.ui.getEditorText(), /pi-attachments\/snapshot-/),
  )
  const draft = host.ui.getEditorText()
  const [, path] = /\[chosen\]: <([^>]+)>/.exec(draft) ?? []
  assert.ok(path)
  assert.equal(draft, before.replace("<notes.txt>", `<${path}>`))
  assert.equal(await readFile(path, "utf8"), "Shared reference contents")
  host.input("\x1b[97;7u")
  await waitFor(() => assert.match(host.render(), /Choose attachment/))
  assert.match(host.render(), /1\. notes\.txt/)
  assert.doesNotMatch(host.render(), /2\. notes\.txt/)
  host.input("\x1b")
})

test("a local file autolink preserves its visible source label when the destination is captured", async (t) => {
  const host = await nativePi(t)
  const source = join(host.directory, "notes with spaces.txt")
  await writeFile(source, "Autolink contents")
  const url = pathToFileURL(source).href.replaceAll("_", "%5F")
  host.ui.setEditorText(`Read <${url}> next`)
  await waitFor(() =>
    assert.match(host.ui.getEditorText(), /pi-attachments\/snapshot-/),
  )
  const [, path] = /\]\(<([^>]+)>\)/.exec(host.ui.getEditorText()) ?? []
  assert.ok(path)
  assert.equal(host.ui.getEditorText(), `Read [${url}](<${path}>) next`)
  assert.equal(await readFile(path, "utf8"), "Autolink contents")
  assert.match(host.render(), /Manage attachments/)
})

for (const spelling of [
  "a&amp;b.txt",
  "a&#38;b.txt",
  "a&#x26;b.txt",
  "a&copy;b.txt",
]) {
  test(`Markdown destination ${spelling} captures decoded contents and restores membership`, async (t) => {
    const host = await nativePi(t)
    const filename = spelling.includes("copy") ? "a©b.txt" : "a&b.txt"
    await writeFile(join(host.directory, filename), "Decoded destination")
    await writeFile(
      join(host.directory, spelling),
      "Wrong literal entity destination",
    )
    host.ui.setEditorText(
      spelling.includes("copy")
        ? `[notes][target]\n\n[target]: <${spelling}>`
        : `[notes](<${spelling}>)`,
    )
    await waitFor(() =>
      assert.match(host.ui.getEditorText(), /pi-attachments\/snapshot-/),
    )
    const [, escapedPath] = /<([^>]+)>/.exec(host.ui.getEditorText())
    const path = escapedPath.replaceAll("\\&", "&")
    assert.equal(await readFile(path, "utf8"), "Decoded destination")
    host.ui.setEditorText(path)
    assert.doesNotMatch(host.render(), /Manage attachments/)
    const restored = `[notes](<${path.replace(filename, spelling)}>)`
    host.ui.setEditorText(restored)
    assert.match(host.render(), /Manage attachments/)
    host.submit()
    await waitFor(() => assert.equal(host.requests.length, 1))
    assert.equal(host.ui.getEditorText(), "")
    assert.ok(
      host.requests[0].messages.some(
        (message) =>
          message.role === "user" &&
          message.content.some((content) => content.text === restored),
      ),
    )
    assert.equal(await readFile(path, "utf8"), "Decoded destination")
  })
}

for (const autolink of [false, true]) {
  test(`${autolink ? "autolink" : "escaped ampersand"} preserves literal entity filename`, async (t) => {
    const host = await nativePi(t)
    const source = join(host.directory, "a&amp;b.txt")
    await writeFile(source, "Literal entity destination")
    await writeFile(
      join(host.directory, "a&b.txt"),
      "Wrong decoded destination",
    )
    const draft = autolink
      ? `<${pathToFileURL(source).href}>`
      : String.raw`[notes](a\&amp;b.txt)`
    host.ui.setEditorText(draft)
    await waitFor(() =>
      assert.match(host.ui.getEditorText(), /pi-attachments\/snapshot-/),
    )
    const [, escapedPath] = /\]\(<([^>]+)>\)/.exec(host.ui.getEditorText())
    const path = escapedPath.replaceAll("\\&", "&")
    assert.equal(await readFile(path, "utf8"), "Literal entity destination")
    assert.match(host.render(), /Manage attachments/)
    await writeFile(
      path.replace("a&amp;b.txt", "a&b.txt"),
      "Wrong decoded retained contents",
    )
    const legacy = `[Attachment: a&amp;b.txt](<${path}>)`
    host.ui.setEditorText(legacy)
    await waitFor(() => assert.ok(host.ui.getEditorText().includes("\\&")))
    const normalized = host.ui.getEditorText()
    assert.match(host.render(), /Manage attachments/)
    host.submit()
    await waitFor(() => assert.equal(host.requests.length, 1))
    assert.ok(
      host.requests[0].messages.some(
        (message) =>
          message.role === "user" &&
          message.content.some((content) => content.text === normalized),
      ),
    )
  })
}

for (const filename of ["a&b.txt", "a&amp;b.txt", "&copy;.txt"]) {
  test(`Attach writes an unambiguous reference for ${filename}`, async (t) => {
    const host = await nativePi(t)
    const source = join(host.directory, filename)
    await writeFile(source, "Generated reference contents")
    await host.attachFile(source)
    const draft = host.ui.getEditorText()
    const [, escapedPath] = /\]\(<([^>]+)>\)/.exec(draft)
    const path = escapedPath.replaceAll("\\&", "&")
    assert.equal(await readFile(path, "utf8"), "Generated reference contents")
    assert.ok(
      draft.includes(`[Attachment: ${filename.replaceAll("&", "\\&")}]`),
    )
    assert.match(host.render(), /Manage attachments/)
    if (filename === "a&b.txt") {
      host.ui.setEditorText(
        `[Attachment: a&amp;b.txt](<${path.replaceAll("&", "&amp;")}>)`,
      )
      await waitFor(() => assert.match(host.render(), /Manage attachments/))
      await fs.mkdir(path.replaceAll("&", "&amp;"))
      host.ui.setEditorText(host.ui.getEditorText())
      await waitFor(() => assert.match(host.render(), /Manage attachments/))
    }
    const submitted = host.ui.getEditorText().trim()
    host.submit()
    await waitFor(() => assert.equal(host.requests.length, 1))
    assert.ok(
      host.requests[0].messages.some(
        (message) =>
          message.role === "user" &&
          message.content.some((content) => content.text === submitted),
      ),
    )
  })
}

for (const imageSyntax of [false, true]) {
  test(`renamed historical ${imageSyntax ? "image" : "link"} label preserves literal retained image with a conflicting filename`, async (t) => {
    const host = await nativePi(t, [], {
      settings: {
        images: { autoResize: false },
        terminal: { showImages: false },
      },
    })
    const directory = join(host.agentDir, "pi-attachments", "legacy")
    await fs.mkdir(directory, { recursive: true })
    const path = join(directory, "a&amp;b.png")
    await writeFile(path, Buffer.from(PNG, "base64"))
    await writeFile(
      join(directory, "a&b.png"),
      "Wrong decoded retained content",
    )
    const label = `${imageSyntax ? "!" : ""}[Attachment: Renamed diagram]`
    host.ui.setEditorText(`Review ${label}(<${path}>)`)
    await waitFor(() =>
      assert.equal(
        host.ui.getEditorText(),
        `Review ${label}(<${path.replaceAll("&", "\\&")}>)`,
      ),
    )
    const draft = host.ui.getEditorText()
    assert.match(host.render(), /Manage attachments/)
    host.submit()
    await waitFor(() => assert.equal(host.requests.length, 1))
    const user = host.requests[0].messages.findLast(
      (message) => message.role === "user",
    )
    assert.equal(user.content[0].text, draft)
    assert.equal(user.content[1].type, "image_url")
    assert.equal(user.content[1].image_url.url, `data:image/png;base64,${PNG}`)
    assert.equal(await readFile(path, "base64"), PNG)
  })
}

test("legacy normalization reuses its pending lookup across typing and redraws", async (t) => {
  const host = await nativePi(t)
  const directory = join(host.agentDir, "pi-attachments", "legacy")
  await fs.mkdir(directory, { recursive: true })
  const path = join(directory, "a&amp;b.txt")
  await writeFile(path, "Legacy retained contents")
  await writeFile(join(directory, "a&b.txt"), "Wrong decoded retained contents")
  const ready = Promise.withResolvers()
  const original = fs.stat
  let lookups = 0
  t.mock.method(fs, "stat", async (file, ...options) => {
    if (file === path) {
      lookups++
      await ready.promise
    }
    return original(file, ...options)
  })
  syncBuiltinESMExports()
  t.after(() => {
    t.mock.restoreAll()
    syncBuiltinESMExports()
  })
  host.ui.setEditorText(`[Attachment: a&amp;b.txt](<${path}>)`)
  await waitFor(() => assert.equal(lookups, 1))
  host.input(" tail")
  host.resize(70)
  host.render()
  assert.equal(lookups, 1)
  assert.doesNotMatch(host.render(), /Manage attachments/)
  ready.resolve()
  await waitFor(() => assert.ok(host.ui.getEditorText().includes("\\&")))
  assert.ok(host.ui.getEditorText().endsWith(" tail"))
  assert.match(host.render(), /Manage attachments/)
  assert.equal(lookups, 1)
  assert.equal(await readFile(path, "utf8"), "Legacy retained contents")
})

test("local path characters and file-URL encoding preserve the actual filename", async (t) => {
  const host = await nativePi(t)
  const source = join(host.directory, "notes%20literal.txt")
  await writeFile(source, "Literal percent characters")
  host.ui.setEditorText(
    `[path](<notes%20literal.txt>) and [URL](${pathToFileURL(source).href})`,
  )
  await waitFor(() =>
    assert.equal(
      [...host.ui.getEditorText().matchAll(/<[^>]+snapshot-[^>]+>/g)].length,
      2,
    ),
  )
  const draft = host.ui.getEditorText()
  const [, path] = /\[path\]\(<([^>]+)>\)/.exec(draft)
  assert.equal(draft, `[path](<${path}>) and [URL](<${path}>)`)
  assert.ok(path.endsWith("/notes%20literal.txt"))
  assert.equal(await readFile(path, "utf8"), "Literal percent characters")
  assert.match(host.render(), /Manage attachments/)
  host.submit()
  await waitFor(() => assert.equal(host.requests.length, 1))
  const user = host.requests[0].messages.findLast(
    (message) => message.role === "user",
  )
  assert.equal(user.content[0].text, draft)
})

test("image syntax captures while previews are hidden and ordinary Markdown controls retained membership", async (t) => {
  const host = await nativePi(t, [], {
    settings: { terminal: { showImages: false } },
  })
  const source = join(host.directory, "picture.png")
  const contents = Buffer.from(PNG, "base64")
  await writeFile(source, contents)
  host.ui.setEditorText("![A picture](picture.png)")
  await waitFor(() =>
    assert.match(host.ui.getEditorText(), /pi-attachments\/snapshot-/),
  )
  const [, path] =
    /!\[A picture\]\(<([^>]+)>\)/.exec(host.ui.getEditorText()) ?? []
  assert.ok(path)
  assert.deepEqual(await readFile(path), contents)
  const link = `[Retained picture](<${path}>)`
  const literal = `${path}\n\n\`${link}\`\n\n\`\`\`md\n${link}\n\`\`\`\n\n    ${link}\n\n\\${link}\n\n[unused]: <${path}>\n\n[Remote](https://example.invalid/picture.png)`
  host.ui.setEditorText(literal)
  assert.doesNotMatch(host.render(), /Manage attachments/)
  host.resize(60)
  host.runtime.session.settingsManager.applyOverrides({
    terminal: { showImages: true },
  })
  assert.equal(host.ui.getEditorText(), literal)
  assert.doesNotMatch(host.render(), /Manage attachments/)
  host.ui.setEditorText(link)
  assert.equal(host.ui.getEditorText(), link)
  assert.match(host.render(), /Manage attachments/)
  host.submit()
  await waitFor(() => assert.equal(host.requests.length, 1))
  const images = host.requests[0].messages.flatMap((message) =>
    message.role === "user"
      ? message.content.filter((content) => content.type === "image_url")
      : [],
  )
  assert.equal(images.length, 1)
  assert.deepEqual(await readFile(path), contents)
})

test("links nested in Markdown containers rewrite the destination in the source draft", async (t) => {
  const host = await nativePi(t)
  await writeFile(join(host.directory, "notes.txt"), "Nested contents")
  const before = '> - Read [**notes**](\n>   <notes.txt> "Kept title") now\n'
  host.ui.setEditorText(before)
  await waitFor(() =>
    assert.match(host.ui.getEditorText(), /pi-attachments\/snapshot-/),
  )
  const [, path] = /<([^>]+snapshot-[^>]+)>/.exec(host.ui.getEditorText()) ?? []
  assert.ok(path)
  assert.equal(
    host.ui.getEditorText(),
    before.replace("<notes.txt>", `<${path}>`),
  )
  assert.equal(await readFile(path, "utf8"), "Nested contents")
  assert.match(host.render(), /Manage attachments/)
})

test("Markdown list capture preserves literal tabs and every reference in the list", async (t) => {
  const host = await nativePi(t, [composerPath])
  await writeFile(join(host.directory, "notes.txt"), "List contents")
  const before = "- [first](notes.txt)\n\t[second](notes.txt)\n\tKeep 😀"
  host.ui.setEditorText(before)
  await waitFor(() =>
    assert.equal(
      [...host.ui.getEditorText().matchAll(/<[^>]+snapshot-[^>]+>/g)].length,
      2,
    ),
  )
  const [, path] = /<([^>]+)>/.exec(host.ui.getEditorText())
  assert.equal(
    host.ui.getEditorText(),
    before.replaceAll("notes.txt", `<${path}>`),
  )
  assert.equal(await readFile(path, "utf8"), "List contents")
})

test("undo leaves a source destination alone and a newly added link captures its later contents", async (t) => {
  const host = await nativePi(t, [composerPath])
  const source = join(host.directory, "notes.txt")
  await writeFile(source, "First captured contents")
  const original = "Read [notes](notes.txt)"
  host.ui.setEditorText(original)
  await waitFor(() =>
    assert.match(host.ui.getEditorText(), /pi-attachments\/snapshot-/),
  )
  const captured = host.ui.getEditorText()
  const [, first] = /<([^>]+)>/.exec(captured)
  host.input("\x1b[122;9u")
  assert.equal(host.ui.getEditorText(), original)
  host.input("\x1b[122;10u")
  assert.equal(host.ui.getEditorText(), captured)
  host.input("\x1b[122;9u")
  await writeFile(source, "Later captured contents")
  host.ui.pasteToEditor("\nLater [new](notes.txt)")
  await waitFor(() =>
    assert.match(host.ui.getEditorText(), /Later \[new\]\(<[^>]+>\)/),
  )
  const draft = host.ui.getEditorText()
  const [, second] = /Later \[new\]\(<([^>]+)>\)/.exec(draft)
  assert.ok(draft.startsWith(`${original}\nLater `))
  assert.notEqual(second, first)
  assert.equal(await readFile(first, "utf8"), "First captured contents")
  assert.equal(await readFile(second, "utf8"), "Later captured contents")
})

test("table cells and a local image inside a remote link keep their Markdown destinations distinct", async (t) => {
  const host = await nativePi(t)
  await writeFile(join(host.directory, "table.txt"), "Table contents")
  await writeFile(join(host.directory, "photo.txt"), "Image contents")
  const before =
    "| Material | Detail |\n| - | - |\n| [table](table.txt) | Keep |\n\n[![photo](photo.txt)](https://example.invalid/view)"
  host.ui.setEditorText(before)
  await waitFor(() =>
    assert.equal(
      [...host.ui.getEditorText().matchAll(/<[^>]+snapshot-[^>]+>/g)].length,
      2,
    ),
  )
  const draft = host.ui.getEditorText()
  const [, table] = /\[table\]\(<([^>]+)>\)/.exec(draft)
  const [, photo] = /!\[photo\]\(<([^>]+)>\)/.exec(draft)
  assert.equal(
    draft,
    before
      .replace("(table.txt)", `(<${table}>)`)
      .replace("(photo.txt)", `(<${photo}>)`),
  )
  assert.equal(await readFile(table, "utf8"), "Table contents")
  assert.equal(await readFile(photo, "utf8"), "Image contents")
  assert.match(host.render(), /Manage attachments/)
})

for (const action of ["Preview text", "Restore Inline", "Remove from draft"]) {
  test(`${action} handles repeated ordinary Markdown references as one retained file`, async (t) => {
    const host = await nativePi(t, [composerPath])
    await writeFile(join(host.directory, "shared.txt"), "CAPTURED\n")
    host.ui.setEditorText("[capture](shared.txt)")
    await waitFor(() => assert.match(host.ui.getEditorText(), /snapshot-/))
    const [, path] = /<([^>]+)>/.exec(host.ui.getEditorText())
    const before = `Start [first][file] mid [second](<${path}>) [![image](<${path}>)](<${path}>)\n\n[file]: <${path}> "Title"\nEnd`
    host.ui.setEditorText(before)
    for (let index = 0; index < 3; index++) host.input("\x1b[1;2D")
    const pending = host.runtime.session.prompt("/attachments")
    await waitFor(() => assert.match(host.render(), /Choose attachment/))
    assert.match(host.render(), /1\. shared\.txt/)
    assert.doesNotMatch(host.render(), /2\. shared\.txt/)
    host.input("\r")
    await waitFor(() => assert.match(host.render(), /Restore Inline/))
    for (
      let index = 0;
      index <
      ["Preview text", "Restore Inline", "Remove from draft"].indexOf(action);
      index++
    )
      host.input("\x1b[B")
    host.input("\r")
    if (action === "Preview text") {
      await waitFor(() => assert.match(host.render(), /Preview: shared\.txt/))
      assert.match(host.render(), /CAPTURED/)
      host.input("x")
      assert.equal(host.ui.getEditorText(), before)
      host.input("\x1b")
    }
    await pending
    if (action === "Preview text") {
      assert.equal(host.ui.getEditorText(), before)
      host.input("chosen")
      assert.equal(host.ui.getEditorText(), before.slice(0, -3) + "chosen")
    } else {
      const after = `Start  mid  \n\n[file]: <${path}> "Title"\n${action === "Restore Inline" ? "CAPTURED\n" : "End"}`
      assert.equal(host.ui.getEditorText(), after)
      assert.doesNotMatch(host.render(), /Manage attachments/)
      host.input("\x1b[122;9u")
      assert.equal(host.ui.getEditorText(), before)
    }
    assert.equal(await readFile(path, "utf8"), "CAPTURED\n")
  })
}

test("Send awaits an existing capture and recalls its retained destination without changing the newer draft", async (t) => {
  const host = await nativePi(t)
  const source = join(host.directory, "pending.txt")
  await writeFile(source, "Contents captured before Send")
  const read = holdFileRead(t, source)
  const original = "Read [pending](pending.txt)"
  host.ui.setEditorText(original)
  await read.started()
  host.submit()
  assert.equal(host.ui.getEditorText(), original)
  host.ui.setEditorText("A newer unrelated draft")
  await writeFile(source, "Later source contents")
  assert.equal(host.requests.length, 0)
  read.release()
  await waitFor(() => assert.equal(host.requests.length, 1, host.render()))
  const user = host.requests[0].messages.findLast(
    (message) => message.role === "user",
  )
  const submitted = user.content.find((content) => content.type === "text").text
  const [, path] = /\[pending\]\(<([^>]+)>\)/.exec(submitted) ?? []
  assert.ok(path, "submission uses the already-started snapshot")
  assert.equal(await readFile(path, "utf8"), "Contents captured before Send")
  assert.equal(host.ui.getEditorText(), "A newer unrelated draft")
  await waitFor(() => assert.equal(host.runtime.session.isStreaming, false))
  host.ui.setEditorText("")
  host.input("\x1b[A")
  assert.equal(host.ui.getEditorText(), submitted)
})

test("pending Send preserves an earlier input transformation and its supplied images", async (t) => {
  const host = await nativePi(t, [expandedInput])
  const source = join(host.directory, "pending.png")
  await writeFile(source, Buffer.from(PNG, "base64"))
  const read = holdFileRead(t, source)
  const original = "Please $review [picture](pending.png) now"
  host.ui.setEditorText(original)
  await read.started()
  host.submit()
  host.ui.setEditorText("A newer draft")
  read.release()
  await waitFor(() => assert.equal(host.requests.length, 1))
  const user = host.requests[0].messages.findLast(
    (message) => message.role === "user",
  )
  const text = user.content.find((content) => content.type === "text").text
  const [, path] = /\[picture\]\(<([^>]+)>\)/.exec(text) ?? []
  assert.ok(path, "transformed input keeps the already-started snapshot")
  assert.equal(
    text,
    `Please Use the review instructions [picture](<${path}>) now`,
  )
  assert.equal(
    user.content.filter((content) => content.type === "image_url").length,
    2,
  )
  assert.equal((await readFile(path)).toString("base64"), PNG)
  assert.equal(host.ui.getEditorText(), "A newer draft")
})

for (const composer of [false, true]) {
  for (const behavior of ["steer", "followUp"]) {
    test(`${composer ? "composer" : "native"} ${behavior} keeps two identical pending drafts in capture and receipt order`, async (t) => {
      const response = Promise.withResolvers()
      const first = Promise.withResolvers()
      const second = Promise.withResolvers()
      t.after(() => {
        response.resolve()
        first.resolve()
        second.resolve()
      })
      const host = await nativePi(t, composer ? [composerPath] : [])
      host.replies.push(response.promise)
      host.submit("Finish the active request")
      await waitFor(() => assert.equal(host.requests.length, 1))
      const source = join(host.directory, "same.txt")
      const captures = []
      const write = fs.writeFile
      const held = t.mock.method(fs, "writeFile", async (...args) => {
        const result = await write(...args)
        if (
          String(args[0]).includes("/snapshot-") &&
          String(args[0]).endsWith("/same.txt")
        ) {
          captures.push(String(args[0]))
          await (captures.length === 1 ? first.promise : second.promise)
        }
        return result
      })
      syncBuiltinESMExports()
      t.after(() => {
        held.mock.restore()
        syncBuiltinESMExports()
      })
      const original = "Read [same](same.txt)"
      const submit = behavior === "steer" ? "\r" : "\x1b\r"
      await writeFile(source, "First captured contents")
      host.ui.setEditorText(original)
      await waitFor(() => assert.equal(captures.length, 1))
      host.input(submit)
      await writeFile(source, "Second captured contents")
      host.ui.setEditorText(original)
      await waitFor(() => assert.equal(captures.length, 2))
      host.input(submit)
      host.ui.setEditorText("A newer unrelated draft")
      second.resolve()
      assert.equal(host.runtime.session.pendingMessageCount, 0)
      first.resolve()
      await waitFor(() =>
        assert.equal(host.runtime.session.pendingMessageCount, 2),
      )
      const submitted = captures.map((path) => `Read [same](<${path}>)`)
      assert.deepEqual(
        host.inputs.slice(-2).map(({ text }) => text),
        submitted,
      )
      assert.notEqual(captures[0], captures[1])
      assert.equal(
        await readFile(captures[0], "utf8"),
        "First captured contents",
      )
      assert.equal(
        await readFile(captures[1], "utf8"),
        "Second captured contents",
      )
      response.resolve()
      await waitFor(() => assert.equal(host.users.length, 3))
      await waitFor(() => assert.equal(host.runtime.session.isStreaming, false))
      assert.deepEqual(
        host.users.slice(-2).map(({ content }) => content[0].text),
        submitted,
      )
      assert.equal(host.ui.getEditorText(), "A newer unrelated draft")
      host.resize(240)
      host.ui.setEditorText("")
      host.input("\x1b[A")
      assert.equal(host.ui.getEditorText(), submitted[1])
      host.input("\x1b[A")
      assert.equal(host.ui.getEditorText(), submitted[0])
    })
  }
}

test("a pending Markdown capture keeps its identity and history through native compaction", async (t) => {
  const summary = Promise.withResolvers()
  t.after(() => summary.resolve())
  const host = await nativePi(t, [expandedInput], {
    settings: { compaction: { enabled: false, keepRecentTokens: 0 } },
  })
  host.submit("Earlier context for the summary")
  await waitFor(() => assert.equal(host.requests.length, 1))
  await waitFor(() => assert.equal(host.runtime.session.isStreaming, false))
  host.replies.push(summary.promise)
  host.submit("/compact")
  await waitFor(() => assert.equal(host.requests.length, 2, host.render()))
  assert.equal(host.runtime.session.isCompacting, true)
  const source = join(host.directory, "compacting.png")
  await writeFile(source, Buffer.from(PNG, "base64"))
  const read = holdFileRead(t, source)
  host.ui.setEditorText("Please $review [picture](compacting.png)")
  await read.started()
  host.submit()
  host.ui.setEditorText("New work after compaction")
  summary.resolve()
  await waitFor(() => assert.equal(host.runtime.session.isCompacting, false))
  assert.equal(host.requests.length, 2)
  read.release()
  await waitFor(() => assert.equal(host.requests.length, 3, host.render()))
  const user = host.requests[2].messages.findLast(
    (message) => message.role === "user",
  )
  const submitted = user.content.find((content) => content.type === "text").text
  const [, path] = /\[picture\]\(<([^>]+)>\)/.exec(submitted) ?? []
  assert.ok(path)
  assert.equal(
    submitted,
    `Please Use the review instructions [picture](<${path}>)`,
  )
  assert.equal(
    user.content.filter((content) => content.type === "image_url").length,
    2,
  )
  assert.equal((await readFile(path)).toString("base64"), PNG)
  assert.equal(host.ui.getEditorText(), "New work after compaction")
  await waitFor(() => assert.equal(host.runtime.session.isStreaming, false))
  host.ui.setEditorText("")
  host.input("\x1b[A")
  assert.equal(host.ui.getEditorText(), `Please $review [picture](<${path}>)`)
})

for (const composer of [false, true]) {
  test(`Send after ${composer ? "composer" : "native"} undo reuses that reference's image snapshot`, async (t) => {
    const host = await nativePi(t, composer ? [composerPath] : [])
    const source = join(host.directory, "source.png")
    await writeFile(source, Buffer.from(PNG, "base64"))
    const original = "[Picture](source.png)"
    host.ui.setEditorText(original)
    await waitFor(() => assert.match(host.ui.getEditorText(), /snapshot-/))
    const captured = host.ui.getEditorText()
    const [, path] = /<([^>]+)>/.exec(captured)
    host.input(composer ? "\x1b[122;9u" : "\x1b[45;5u")
    assert.equal(host.ui.getEditorText(), original)
    await writeFile(source, "Later contents are no longer an image")
    assert.match(host.render(), /Manage attachments/)
    host.submit()
    await waitFor(() => assert.equal(host.requests.length, 1))
    const user = host.requests[0].messages.findLast(
      (message) => message.role === "user",
    )
    assert.equal(
      user.content.filter((content) => content.type === "image_url").length,
      1,
    )
    assert.equal(
      user.content.find((content) => content.type === "text").text,
      captured,
    )
    assert.deepEqual(await readFile(path), Buffer.from(PNG, "base64"))
  })

  test(`replacing a ${composer ? "composer" : "native"} draft captures a new occurrence of the same source`, async (t) => {
    const host = await nativePi(t, composer ? [composerPath] : [])
    const source = join(host.directory, "source.txt")
    await writeFile(source, "Earlier contents")
    host.ui.setEditorText("Old [file](source.txt)")
    await waitFor(() => assert.match(host.ui.getEditorText(), /snapshot-/))
    const [, earlier] = /<([^>]+)>/.exec(host.ui.getEditorText())
    host.input(composer ? "\x1b[122;9u" : "\x1b[45;5u")
    await writeFile(source, "Later contents")
    host.ui.setEditorText("New [file](source.txt)")
    await waitFor(() =>
      assert.match(host.ui.getEditorText(), /New \[file\]\(<[^>]+>\)/),
    )
    const [, later] = /<([^>]+)>/.exec(host.ui.getEditorText())
    assert.notEqual(later, earlier)
    assert.equal(await readFile(earlier, "utf8"), "Earlier contents")
    assert.equal(await readFile(later, "utf8"), "Later contents")
    const undo = composer ? "\x1b[122;9u" : "\x1b[45;5u"
    host.input(undo)
    await writeFile(source, "Third contents")
    host.ui.setEditorText("New [file](source.txt)")
    await waitFor(() => assert.match(host.ui.getEditorText(), /snapshot-/))
    const [, third] = /<([^>]+)>/.exec(host.ui.getEditorText())
    assert.notEqual(third, later)
    assert.equal(await readFile(third, "utf8"), "Third contents")
    host.input(undo)
    host.input(undo)
    assert.equal(host.ui.getEditorText(), "Old [file](source.txt)")
    host.submit()
    await waitFor(() => assert.equal(host.requests.length, 1))
    const user = host.requests[0].messages.findLast(
      (message) => message.role === "user",
    )
    assert.equal(
      user.content.find((content) => content.type === "text").text,
      `Old [file](<${earlier}>)`,
    )
  })
}

for (const split of ["inside", "typed tail", "second paste"]) {
  test(`native Markdown capture keeps expanded text with its destination ${split === "inside" ? "inside a collapsed paste" : `crossing a ${split}`}`, async (t) => {
    const host = await nativePi(t)
    await writeFile(
      join(host.directory, "source.txt"),
      "Captured from expanded text",
    )
    const prefix = "Plain text ".repeat(140)
    const before = `${prefix}[file](source.txt) tail`
    if (split === "inside") host.ui.pasteToEditor(before)
    else {
      const leading = `${prefix}[file](sour`
      host.ui.pasteToEditor(leading)
      await waitFor(() => assert.equal(host.ui.getEditorText(), leading))
      if (split === "typed tail") host.input("ce.txt) tail")
      else host.ui.pasteToEditor(`ce.txt) tail${" ending".repeat(160)}`)
    }
    await waitFor(() => assert.match(host.ui.getEditorText(), /snapshot-/))
    const [, path] = /\[file\]\(<([^>]+)>\)/.exec(host.ui.getEditorText())
    const suffix = split === "second paste" ? " ending".repeat(160) : ""
    assert.equal(
      host.ui.getEditorText(),
      before.replace("source.txt", `<${path}>`) + suffix,
    )
    assert.equal(await readFile(path, "utf8"), "Captured from expanded text")
    host.input("!")
    assert.equal(
      host.ui.getEditorText(),
      before.replace("source.txt", `<${path}>`) + suffix + "!",
    )
    host.input("\x1b[45;5u")
    host.input("\x1b[45;5u")
    assert.equal(host.ui.getEditorText(), before + suffix)
  })
}

test("a stale Markdown capture stays readable without replacing a newer draft", async (t) => {
  const host = await nativePi(t, [composerPath])
  const source = join(host.directory, "stale.txt")
  await writeFile(source, "Captured before the draft changed")
  const read = holdFileRead(t, source)
  host.ui.setEditorText("Original [file](stale.txt)")
  await read.started()
  host.ui.setEditorText("Later draft")
  host.input("\x1b[1;2D")
  read.release()
  await waitFor(() => assert.match(host.render(), /Snapshot retained/))
  assert.equal(host.ui.getEditorText(), "Later draft")
  host.input("!")
  assert.equal(host.ui.getEditorText(), "Later draf!")
  const request = await retainedRequest(host, "Original [file](stale.txt)")
  assert.equal(
    await readFile(snapshotPath(request.text), "utf8"),
    "Captured before the draft changed",
  )
  assert.doesNotMatch(host.render(), /Manage attachments/)
})

test("a Markdown capture finishing after session replacement retains its original request", async (t) => {
  const host = await nativePi(t, [], { noSession: true })
  const source = join(host.directory, "previous.txt")
  await writeFile(source, "Previous session contents")
  const sessionId = host.runtime.session.sessionManager.getSessionId()
  const read = holdFileRead(t, source)
  host.ui.setEditorText("Previous [file](previous.txt)")
  await read.started()
  await host.runtime.newSession()
  host.ui.setEditorText("Current session draft")
  read.release()
  const request = await waitFor(() =>
    retainedRequest(host, `Session: ${sessionId}`),
  )
  assert.ok(request.text.includes("Previous [file](previous.txt)"))
  const path = snapshotPath(request.text)
  await waitFor(async () =>
    assert.equal(await readFile(path, "utf8"), "Previous session contents"),
  )
  assert.equal(host.ui.getEditorText(), "Current session draft")
  assert.doesNotMatch(host.render(), /Manage attachments/)
  await host.close()
  assert.equal(await readFile(path, "utf8"), "Previous session contents")
  assert.equal(await readFile(request.path, "utf8"), request.text)
})

for (const composer of [false, true]) {
  test(`pending ${composer ? "composer" : "native"} history does not enter a replacement session`, async (t) => {
    const host = await nativePi(t, composer ? [composerPath] : [])
    const source = join(host.directory, "previous.txt")
    await writeFile(source, "Previous submitted contents")
    const sessionId = host.runtime.session.sessionManager.getSessionId()
    const read = holdFileRead(t, source)
    host.ui.setEditorText("Previous [file](previous.txt)")
    await read.started()
    host.submit()
    assert.equal(host.ui.getEditorText(), "Previous [file](previous.txt)")
    await host.runtime.newSession()
    host.ui.setEditorText("Current session draft")
    read.release()
    const request = await waitFor(() =>
      retainedRequest(host, `Session: ${sessionId}`),
    )
    const path = snapshotPath(request.text)
    await waitFor(async () =>
      assert.equal(await readFile(path, "utf8"), "Previous submitted contents"),
    )
    assert.equal(host.ui.getEditorText(), "Current session draft")
    host.ui.setEditorText("")
    host.input("\x1b[A")
    assert.equal(host.ui.getEditorText(), "")
    host.submit("Current session request")
    await waitFor(() => assert.equal(host.requests.length, 1))
    const user = host.requests[0].messages.findLast(
      (message) => message.role === "user",
    )
    assert.equal(user.content[0].text, "Current session request")
  })
}

test("a delayed Markdown destination change preserves unrelated typing and the selected range", async (t) => {
  const host = await nativePi(t, [composerPath])
  const source = join(host.directory, "selected.txt")
  await writeFile(source, "Selected attachment contents")
  const read = holdFileRead(t, source)
  host.ui.setEditorText("😀 [file](selected.txt) tail")
  await read.started()
  host.input("!")
  host.input("\x1b[1;2D")
  host.input("\x1b[1;2D")
  read.release()
  await waitFor(() => assert.match(host.ui.getEditorText(), /snapshot-/))
  const [, path] = /<([^>]+)>/.exec(host.ui.getEditorText())
  assert.equal(host.ui.getEditorText(), `😀 [file](<${path}>) tail!`)
  host.input("chosen")
  assert.equal(host.ui.getEditorText(), `😀 [file](<${path}>) taichosen`)
  host.input("\x1b[122;9u")
  host.input("\x1b[122;9u")
  assert.equal(host.ui.getEditorText(), "😀 [file](selected.txt) tail!")
  host.input("chosen")
  assert.equal(host.ui.getEditorText(), "😀 [file](selected.txt) taichosen")
})

test("a failed pending capture rejects Send visibly and retains its requesting draft", async (t) => {
  const host = await nativePi(t, [], { noSession: true })
  const sessionId = host.runtime.session.sessionManager.getSessionId()
  const source = join(host.directory, "failed.txt")
  await writeFile(source, "Captured before the failed write")
  const write = fs.writeFile
  const failure = t.mock.method(fs, "writeFile", async (...args) => {
    if (
      String(args[0]).includes("/snapshot-") &&
      String(args[0]).endsWith("/failed.txt")
    )
      throw Object.assign(new Error("Attachment storage denied"), {
        code: "EACCES",
      })
    return write(...args)
  })
  syncBuiltinESMExports()
  t.after(() => {
    failure.mock.restore()
    syncBuiltinESMExports()
  })
  const read = holdFileRead(t, source)
  const original = "Save [failed](failed.txt)"
  host.ui.setEditorText(original)
  await read.started()
  host.submit()
  assert.equal(host.ui.getEditorText(), original)
  host.ui.setEditorText("Unrelated later draft")
  read.release()
  await waitFor(() =>
    assert.match(host.render(), /Attachment request not sent/),
  )
  await waitFor(() => assert.equal(host.runtime.session.isStreaming, false))
  assert.equal(host.requests.length, 0)
  assert.equal(host.ui.getEditorText(), "Unrelated later draft")
  assert.equal(host.inputs.length, 0)
  const request = await retainedRequest(host, "Delivery: normal")
  assert.ok(request.text.includes(original))
  assert.ok(request.text.includes(`Session: ${sessionId}`))
  assert.ok(request.text.includes(`Working directory: ${host.directory}`))
  assert.equal(host.runtime.session.sessionFile, undefined)
  host.submit("A later valid request")
  await waitFor(() => assert.equal(host.requests.length, 1))
  assert.ok(!JSON.stringify(host.requests).includes("failed.txt"))
})
