/* eslint-disable no-await-in-loop -- Drive each native action to completion before the next edit. */
import assert from "node:assert/strict"
import { execFile, spawn } from "node:child_process"
import { once } from "node:events"
import {
  chmod,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, join } from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import {
  getImageDimensions,
  getNativeClipboard,
  StdinBuffer,
} from "@earendil-works/pi-tui"
import { CustomEditor } from "@earendil-works/pi-coding-agent"
import {
  nativePi,
  retainedRequest,
  snapshotPath,
  waitFor,
} from "../../pi-attachments/test-support/native-pi.mjs"

const composerPath = fileURLToPath(new URL("../src/index.ts", import.meta.url))
const pastePath = fileURLToPath(
  new URL("../../pi-paste/src/index.ts", import.meta.url),
)
const attachmentsPath = fileURLToPath(
  new URL("../../pi-attachments/src/index.ts", import.meta.url),
)
const skillsPath = fileURLToPath(
  new URL("../../pi-skill-references/src/index.ts", import.meta.url),
)
const extensions = [composerPath, pastePath, attachmentsPath, skillsPath]
const acceptancePath = fileURLToPath(
  new URL("../fixtures/mixed-acceptance.ts", import.meta.url),
)
const imageInputPath = fileURLToPath(
  new URL("../../pi-attachments/test-support/image-input.ts", import.meta.url),
)
const PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAADUlEQVR4nGP4zwAE/wEHAAH/4iOeWQAAAABJRU5ErkJggg=="
const BMP =
  "Qk06AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABABgAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAD/AA=="
const undo = "\x1b[122;9u"
const redo = "\x1b[122;10u"
const submit = "\x1b[13;9u"

async function catalog(t) {
  const directory = await mkdtemp(join(tmpdir(), "pi-mixed-skills-"))
  t.after(() => rm(directory, { recursive: true, force: true }))
  await Promise.all(
    [
      ["review", "Review the combined request exactly once."],
      ["audit", "Audit the captured context exactly once."],
      ["literal", "Literal code must not invoke these instructions."],
    ].map(async ([name, body]) => {
      const path = join(directory, name)
      await mkdir(path)
      await writeFile(
        join(path, "SKILL.md"),
        `---\nname: ${name}\ndescription: Mixed ${name} acceptance\n---\n${body}\n`,
      )
    }),
  )
  return directory
}

async function attachmentAction(host, action) {
  host.input("\x1b[97;7u")
  await waitFor(() => assert.match(host.render(), /Choose attachment/))
  host.input("\r")
  await waitFor(() => assert.ok(host.render().includes(action)))
  const index = ["Preview text", "Restore Inline", "Remove from draft"].indexOf(
    action,
  )
  for (let item = 0; item < index; item++) host.input("\x1b[B")
  host.input("\r")
}

test("mixed snapshots stay opaque until Restore Inline invokes prose while restored code stays literal", async (t) => {
  const host = await nativePi(t, extensions, {
    skillPaths: [await catalog(t)],
  })
  const body = [
    "Attached /skill:review and /skill:review.",
    "",
    "```text",
    "\t/skill:literal",
    "```",
    "captured context ".repeat(340),
    "",
  ].join("\n")
  host.ui.pasteToEditor(body)
  const textPath = await waitFor(() => snapshotPath(host.ui.getEditorText()))
  const textReference = host.ui.getEditorText().trim()
  const beforeImage = host.ui.getEditorText()
  const imageSource = join(host.directory, "diagram.png")
  await writeFile(imageSource, Buffer.from(PNG, "base64"))
  await host.runtime.session.sendUserMessage(`/attach-file ${imageSource}`, {
    expandPromptTemplates: true,
  })
  const imageReference = host.ui
    .getEditorText()
    .slice(beforeImage.length)
    .trim()
  const imagePath = snapshotPath(imageReference)
  await rm(imageSource)
  const draft = `# Mixed request\n\n**Review** this \`example\`.\n${textReference}\n${imageReference}\nREPLACE`
  host.ui.setEditorText(draft)
  await waitFor(() => assert.match(host.render(), /\[Image: .*2x1/))
  assert.match(host.render(), /Attachments \(2\): paste.txt, diagram.png/)
  assert.match(host.render(), /Other extension widget/)

  host.input(submit)
  await waitFor(() => assert.equal(host.requests.length, 1))
  await host.runtime.session.waitForIdle()
  const opaque = host.users.at(-1)
  assert.deepEqual(opaque.content, [
    { type: "text", text: draft },
    { type: "image", data: PNG, mimeType: "image/png" },
  ])
  host.input(undo)
  assert.equal(host.ui.getEditorText(), draft)

  await attachmentAction(host, "Preview text")
  await waitFor(() => assert.match(host.render(), /Preview: paste.txt/))
  assert.match(host.render(), /Attached \/skill:review and \/skill:review/)
  host.input("\x1b")
  assert.equal(host.ui.getEditorText(), draft)
  for (let index = 0; index < "REPLACE".length; index++) host.input("\x1b[1;2D")
  await attachmentAction(host, "Restore Inline")
  const restored = draft.replace(textReference, "").replace("REPLACE", body)
  await waitFor(() => assert.equal(host.ui.getEditorText(), restored))
  assert.match(host.render(), /Attachments \(1\): diagram.png/)
  host.input(undo)
  assert.equal(host.ui.getEditorText(), draft)
  host.input(redo)
  assert.equal(host.ui.getEditorText(), restored)
  assert.equal(await readFile(textPath, "utf8"), body)

  host.input(submit)
  await waitFor(() => assert.equal(host.requests.length, 2))
  await host.runtime.session.waitForIdle()
  const delivered = host.users.at(-1).content
  const text = delivered.find((item) => item.type === "text").text
  assert.equal(text.match(/<skill name="review"/g)?.length, 1)
  assert.ok(text.endsWith(restored.trim()))
  assert.match(text, /Review the combined request exactly once\./)
  assert.doesNotMatch(
    text,
    /<skill name="literal"|Literal code must not invoke/,
  )
  assert.deepEqual(
    delivered.filter((item) => item.type === "image"),
    [{ type: "image", data: PNG, mimeType: "image/png" }],
  )

  host.input(undo)
  await attachmentAction(host, "Remove from draft")
  await waitFor(() =>
    assert.equal(host.ui.getEditorText(), restored.replace(imageReference, "")),
  )
  host.input(undo)
  assert.equal(host.ui.getEditorText(), restored)
  await host.runtime.session.sendUserMessage("/attachments-cleanup", {
    expandPromptTemplates: true,
  })
  assert.equal(await readFile(textPath, "utf8"), body)
  assert.deepEqual(await readFile(imagePath), Buffer.from(PNG, "base64"))
})

for (const [route, paste] of [
  [
    "fragmented terminal text",
    (host, text) => {
      const stdin = new StdinBuffer()
      try {
        stdin.on("data", host.input)
        stdin.on("paste", (payload) =>
          host.input(`\x1b[200~${payload}\x1b[201~`),
        )
        stdin.process("\x1b[2")
        stdin.process(`00~${text.slice(0, 2500)}`)
        stdin.process(`${text.slice(2500)}\x1b[20`)
        stdin.process("1~")
      } finally {
        stdin.destroy()
      }
    },
  ],
  ["extension text", (host, text) => host.ui.pasteToEditor(text)],
  ["native clipboard shortcut", (host) => host.input("\x16")],
  ["Command V", (host) => host.input("\x1b[118;9u")],
  [
    "fullscreen right click",
    (host) => {
      host.render()
      host.input("\x1b[<2;10;27M")
      host.input("\x1b[<2;10;27m")
    },
  ],
]) {
  for (const order of ["paste then attachments", "attachments then paste"]) {
    test(`all packages preserve cutoff, selection, and history through ${route}, ${order}`, async (t) => {
      const clipboard = getNativeClipboard()
      assert.ok(clipboard?.getFilePaths)
      let text
      t.mock.method(clipboard, "getFilePaths", async () => null)
      t.mock.method(clipboard, "getImage", async () => null)
      t.mock.method(clipboard, "getText", async () => text)
      const host = await nativePi(
        t,
        [
          composerPath,
          skillsPath,
          ...(order === "paste then attachments"
            ? [pastePath, attachmentsPath]
            : [attachmentsPath, pastePath]),
        ],
        { skillPaths: [await catalog(t)] },
      )
      const original =
        '# Mixed\n\n**Keep** `code` /skill:review @"source file.md"\nSelected'
      for (const length of [4999, 5000]) {
        text = "\t/skill:review\r\n😀".padEnd(length, "x")
        host.ui.setEditorText(original)
        for (let index = 0; index < "Selected".length; index++)
          host.input("\x1b[1;2D")
        paste(host, text)
        let path
        if (length === 4999) {
          await waitFor(() =>
            assert.equal(
              host.ui.getEditorText(),
              original.replace("Selected", text.replaceAll("\r\n", "\n")),
            ),
          )
          assert.doesNotMatch(host.render(), /Attachments \(/)
        } else {
          path = await waitFor(() => snapshotPath(host.ui.getEditorText()))
          assert.equal(
            host.ui.getEditorText(),
            original.replace(
              "Selected",
              `\n[Attachment: paste.txt](<${path}>)\n`,
            ),
          )
          assert.equal(await readFile(path, "utf8"), text)
          assert.match(host.render(), /Attachments \(1\): paste.txt/)
        }
        const after = host.ui.getEditorText()
        host.input(undo)
        assert.equal(host.ui.getEditorText(), original)
        assert.doesNotMatch(host.render(), /Attachments \(/)
        host.input(redo)
        assert.equal(host.ui.getEditorText(), after)
        if (path) assert.equal(await readFile(path, "utf8"), text)
      }
      assert.equal(host.requests.length, 0)
    })
  }
}

test("copied files, clipboard images, copied references, and explicit overrides share the mixed draft history", async (t) => {
  const clipboard = getNativeClipboard()
  assert.ok(clipboard?.setText)
  let copied = "Accompanying clipboard text"
  let files
  t.mock.method(clipboard, "getFilePaths", async () => files)
  t.mock.method(clipboard, "getImage", async () => Buffer.from(PNG, "base64"))
  t.mock.method(clipboard, "getText", async () => copied)
  t.mock.method(clipboard, "setText", async (text) => {
    copied = text
  })
  const host = await nativePi(t, extensions, {
    skillPaths: [await catalog(t)],
  })
  const source = join(host.directory, "Résumé 你好 notes.txt")
  const picture = join(host.directory, "copied picture.png")
  files = [source, picture]
  await writeFile(source, "Captured file /skill:literal")
  await writeFile(picture, Buffer.from(PNG, "base64"))
  const before = '# Files\n\n**Review** @"Résumé 你好 notes.txt"\nSelected'
  host.ui.setEditorText(before)
  for (let index = 0; index < "Selected".length; index++)
    host.input("\x1b[1;2D")
  host.input("\x1b[118;9u")
  const paths = await waitFor(() => {
    const references = [
      ...host.ui
        .getEditorText()
        .matchAll(/\[Attachment: [^\]]+\]\(<([^>]+)>\)/g),
    ]
    assert.equal(references.length, 2)
    return references.map((reference) => reference[1])
  })
  const attached = host.ui.getEditorText()
  assert.deepEqual(
    paths.map((path) => basename(path)),
    [basename(source), basename(picture)],
  )
  assert.doesNotMatch(attached, /Selected|Accompanying clipboard text/)
  assert.equal(await readFile(paths[0], "utf8"), "Captured file /skill:literal")
  assert.deepEqual(await readFile(paths[1]), Buffer.from(PNG, "base64"))
  host.input(undo)
  assert.equal(host.ui.getEditorText(), before)
  host.input(redo)
  assert.equal(host.ui.getEditorText(), attached)
  await writeFile(source, "Current file after capture")
  await rm(picture)

  files = null
  host.input("\x16")
  await waitFor(() => assert.match(host.render(), /Attachments \(3\):/))
  const withImage = host.ui.getEditorText()
  const imagePath = snapshotPath(withImage.slice(attached.length))
  assert.deepEqual(await readFile(imagePath), Buffer.from(PNG, "base64"))

  const references = '**/skill:review** @"Résumé 你好 notes.txt" 👩‍💻'
  host.ui.setEditorText(`${withImage}\n${references}`)
  host.input("\x1b[109;10u")
  host.input("\x1b[1;10D")
  host.input("\x1b[99;9u")
  await waitFor(() => assert.equal(copied, references))
  host.input("\x1b[120;9u")
  await waitFor(() => assert.equal(host.ui.getEditorText(), `${withImage}\n`))
  host.input("\x1b[118;7u")
  await waitFor(() =>
    assert.equal(host.ui.getEditorText(), `${withImage}\n${references}`),
  )
  host.input(undo)
  assert.equal(host.ui.getEditorText(), `${withImage}\n`)
  host.input(undo)
  assert.equal(host.ui.getEditorText(), `${withImage}\n${references}`)
  host.input("\x1b[109;10u")

  const code = `${withImage}\n\`\`\`text\nOLD`
  host.ui.setEditorText(code)
  for (let index = 0; index < 3; index++) host.input("\x1b[1;2D")
  copied = "\t/skill:literal\n".padEnd(5001, "x")
  files = [source]
  host.input("\x1b[118;7u")
  await waitFor(() =>
    assert.equal(host.ui.getEditorText(), code.replace("OLD", copied)),
  )
  assert.match(host.render(), /Attachments \(3\):/)
  host.input(undo)
  assert.equal(host.ui.getEditorText(), code)
  host.input("\x1b[116;7u")
  await waitFor(() => assert.match(host.render(), /Attach text/))
  host.input("\x1b[200~Short /skill:literal\x1b[201~")
  host.input("\r")
  await waitFor(() => assert.match(host.render(), /Attachments \(4\):/))
  assert.doesNotMatch(host.ui.getEditorText(), /OLD/)
  host.input(undo)
  assert.equal(host.ui.getEditorText(), code)

  host.ui.setEditorText(`${withImage}\n${references}`)
  host.replies.push({
    index: 0,
    delta: {
      role: "assistant",
      tool_calls: [source, paths[0]].map((path, index) => ({
        index,
        id: `mixed-read-${index}`,
        type: "function",
        function: { name: "read", arguments: JSON.stringify({ path }) },
      })),
    },
    finish_reason: "tool_calls",
  })
  host.input(submit)
  await waitFor(() => assert.equal(host.requests.length, 2))
  await host.runtime.session.waitForIdle()
  assert.deepEqual(
    host.requests[1].messages
      .filter((message) => message.role === "tool")
      .map((message) => message.content),
    ["Current file after capture", "Captured file /skill:literal"],
  )
  const content = host.users.at(-1).content
  assert.equal(content.filter((item) => item.type === "image").length, 2)
  assert.equal(content[0].text.match(/<skill name="review"/g)?.length, 1)
  assert.doesNotMatch(content[0].text, /<skill name="literal"/)
})

test("mixed drafts retain early and updated native providers, character editing, custom pickers, listeners, and widgets", async (t) => {
  const host = await nativePi(t, [acceptancePath, ...extensions], {
    skillPaths: [await catalog(t)],
  })
  await Promise.all(
    ["current one.md", "current two.md"].map((name) =>
      writeFile(join(host.directory, name), "Current source"),
    ),
  )
  await host.runtime.session.sendUserMessage(
    "/attach-text Opaque /skill:literal",
    {
      expandPromptTemplates: true,
    },
  )
  const reference = host.ui.getEditorText().trim()
  const prefix = `# Mixed\n\n**Context** \`/skill:literal\`\n${reference}\n`
  host.ui.setEditorText(`${prefix}Read @current`)
  host.input("\t")
  await waitFor(() => assert.match(host.render(), /early current one.md/))
  host.input("\r")
  assert.equal(host.ui.getEditorText(), `${prefix}Read @"current one.md" `)
  host.input("\x7f")
  host.input("\x1b[D")
  host.input("\x7f")
  assert.equal(host.ui.getEditorText(), `${prefix}Read @"current one.m"`)
  host.input("d")
  assert.equal(host.ui.getEditorText(), `${prefix}Read @"current one.md"`)
  assert.equal(host.requests.length, 0)

  host.input("\x1b[117;7u")
  await waitFor(() =>
    assert.match(host.render(), /Acceptance provider updated/),
  )
  host.ui.setEditorText(`${prefix}Apply /rev`)
  host.input("i")
  await waitFor(() => assert.match(host.render(), /updated.*review/))
  host.input("\r")
  assert.equal(host.ui.getEditorText(), `${prefix}Apply /skill:review `)
  host.input("\x7f")
  host.input("\x7f")
  assert.equal(host.ui.getEditorText(), `${prefix}Apply /skill:revie`)
  host.input("w")
  assert.equal(host.ui.getEditorText(), `${prefix}Apply /skill:review`)

  host.ui.setEditorText(`${prefix}Keep OLD`)
  for (let index = 0; index < 3; index++) host.input("\x1b[1;2D")
  host.input("\x1b[112;7u")
  await waitFor(() => assert.match(host.render(), /Review mixed request/))
  assert.match(host.render(), /Literal example skill/)
  host.input("\x1b[B")
  host.input("\x1b[A")
  host.input("\r")
  await waitFor(() =>
    assert.equal(host.ui.getEditorText(), `${prefix}Keep /skill:review`),
  )
  host.input("!")
  assert.equal(host.ui.getEditorText(), `${prefix}Keep /skill:review!`)
  host.input(undo)
  host.input(undo)
  assert.equal(host.ui.getEditorText(), `${prefix}Keep OLD`)
  host.input("\x1b[108;7u")
  assert.equal(host.ui.getEditorText(), `${prefix}Keep LISTENER`)
  host.input("\x1b[115;7u")
  await waitFor(() =>
    assert.match(host.render(), /Acceptance shortcut received/),
  )
  assert.equal(host.ui.getEditorText(), `${prefix}Keep LISTENER`)
  assert.match(host.render(), /Mixed acceptance fixture ready/)
  assert.match(host.render(), /Other extension widget/)
  assert.match(host.render(), /Attachments \(1\): text.txt/)
  assert.equal(
    await readFile(snapshotPath(reference), "utf8"),
    "Opaque /skill:literal",
  )
  host.input("\x1b[121;7u")
  await waitFor(() =>
    assert.match(host.render(), /Reloaded keybindings, extensions/),
  )
  assert.equal(host.ui.getEditorText(), `${prefix}Keep LISTENER`)
  host.input("\x1b[99;7u")
  await waitFor(() =>
    assert.match(host.render(), /Attachment cleanup: removed/),
  )
  assert.equal(host.ui.getEditorText(), `${prefix}Keep LISTENER`)
  host.ui.setEditorText("")
  host.ui.setEditorText("Later work")
  host.input("\x1b[100;7u")
  await waitFor(() => assert.match(host.render(), /Recover draft/))
  host.input("\r")
  await waitFor(() =>
    assert.equal(host.ui.getEditorText(), `${prefix}Keep LISTENER`),
  )
  host.input(undo)
  assert.equal(host.ui.getEditorText(), "Later work")
})

test("mixed dequeue replay preserves skills, opaque text, images, and input transformations", async (t) => {
  const skills = await catalog(t)
  await writeFile(
    join(skills, "review", "SKILL.md"),
    "---\nname: review\ndescription: Review changes\n---\nReview without invoking /skill:audit.\n",
  )
  const host = await nativePi(
    t,
    [composerPath, pastePath, imageInputPath, skillsPath, attachmentsPath],
    {
      skillPaths: [skills],
      extensionFactories: [
        (pi) => {
          pi.on("input", (event) => {
            if (event.text.includes("[Attachment:"))
              return {
                action: "transform",
                text: `${event.text}\nAfter replay transformation.`,
              }
            return undefined
          })
        },
      ],
    },
  )
  const response = Promise.withResolvers()
  t.after(() => response.resolve())
  host.replies.push(response.promise)
  host.submit("Hold the first response")
  await waitFor(() => assert.equal(host.requests.length, 1))
  host.ui.setEditorText(
    "Apply /skill:review with **surrounding prose** @source.md",
  )
  const body = "Opaque /skill:audit\n".repeat(300)
  host.ui.pasteToEditor(body)
  const textPath = await waitFor(() => snapshotPath(host.ui.getEditorText()))
  const beforeImage = host.ui.getEditorText()
  const source = join(host.directory, "replay.bmp")
  await writeFile(source, Buffer.from(BMP, "base64"))
  await host.runtime.session.sendUserMessage(`/attach-file ${source}`, {
    expandPromptTemplates: true,
  })
  const imagePath = snapshotPath(
    host.ui.getEditorText().slice(beforeImage.length),
  )
  const draft = host.ui.getEditorText().trim()
  await rm(source)
  host.input("\x1b\r")
  const queued = await waitFor(() => {
    const messages = host.runtime.session.getFollowUpMessages()
    assert.equal(messages.length, 1)
    return messages[0]
  })
  assert.equal(queued.match(/<skill name="review"/g)?.length, 1)
  assert.doesNotMatch(queued, /<skill name="audit"/)
  host.input("\x1b[1;3A")
  assert.deepEqual(host.runtime.session.getFollowUpMessages(), [])
  assert.equal(host.ui.getEditorText(), queued)
  response.resolve()
  await host.runtime.session.waitForIdle()
  host.input(submit)
  await waitFor(() => assert.equal(host.requests.length, 2))
  await host.runtime.session.waitForIdle()
  const content = host.users.at(-1).content
  assert.equal(
    content[0].text,
    `Before attachments\n${queued}\nAfter replay transformation.`,
  )
  assert.ok(content[0].text.includes(draft))
  assert.equal(content[0].text.match(/<skill name="review"/g)?.length, 1)
  assert.doesNotMatch(
    content[0].text,
    /<skill name="audit"|Opaque \/skill:audit/,
  )
  const images = content.filter((item) => item.type === "image")
  assert.equal(images.length, 2)
  assert.equal(images[0].data, PNG)
  assert.deepEqual(getImageDimensions(images[1].data, images[1].mimeType), {
    widthPx: 1,
    heightPx: 1,
  })
  assert.equal(await readFile(textPath, "utf8"), body)
  assert.deepEqual(await readFile(imagePath), Buffer.from(BMP, "base64"))
})

for (const delivery of ["normal", "steer", "followUp"]) {
  test(`native ${delivery} composes skills, opaque text, snapshot images, and ordered input transforms`, async (t) => {
    const observed = []
    const host = await nativePi(
      t,
      [composerPath, pastePath, imageInputPath, skillsPath, attachmentsPath],
      {
        skillPaths: [await catalog(t)],
        extensionFactories: [
          (pi) => {
            pi.on("input", (event) => {
              if (!event.text.includes("[Attachment:")) return
              observed.push(event)
              return {
                action: "transform",
                text: `${event.text}\nAfter mixed transformations.`,
              }
            })
          },
        ],
      },
    )
    const body = "Opaque /skill:literal\n".repeat(250)
    host.ui.pasteToEditor(body)
    const textPath = await waitFor(() => snapshotPath(host.ui.getEditorText()))
    const textReference = host.ui.getEditorText().trim()
    const beforeImage = host.ui.getEditorText()
    const source = join(host.directory, "delivery.bmp")
    await writeFile(source, Buffer.from(BMP, "base64"))
    await host.runtime.session.sendUserMessage(`/attach-file ${source}`, {
      expandPromptTemplates: true,
    })
    const imageReference = host.ui
      .getEditorText()
      .slice(beforeImage.length)
      .trim()
    const imagePath = snapshotPath(imageReference)
    await rm(source)
    const draft = [
      "/skill:review Apply /skill:audit and /skill:review, /skill:audit.",
      "",
      "**Mixed context** @current.md",
      "```text",
      "/skill:literal",
      "```",
      textReference,
      imageReference,
      imageReference,
    ].join("\n")
    const response = Promise.withResolvers()
    t.after(() => response.resolve())
    if (delivery !== "normal") {
      host.replies.push(response.promise)
      host.submit("Hold the first response")
      await waitFor(() => assert.equal(host.requests.length, 1))
    }
    host.ui.setEditorText(draft)
    host.input(delivery === "followUp" ? "\x1b\r" : submit)
    if (delivery !== "normal") {
      await waitFor(() =>
        assert.equal(
          delivery === "steer"
            ? host.runtime.session.getSteeringMessages().length
            : host.runtime.session.getFollowUpMessages().length,
          1,
        ),
      )
      host.ui.setEditorText("Later **draft** /skill:review")
      response.resolve()
    }
    await waitFor(() =>
      assert.equal(host.requests.length, delivery === "normal" ? 1 : 2),
    )
    await host.runtime.session.waitForIdle()
    assert.equal(observed.length, 1)
    assert.equal(observed[0].source, "interactive")
    assert.equal(
      observed[0].streamingBehavior,
      delivery === "normal" ? undefined : delivery,
    )
    assert.equal(observed[0].images.length, 2)
    const text = host.users.at(-1).content[0].text
    assert.equal(text, `${observed[0].text}\nAfter mixed transformations.`)
    assert.equal(text.match(/<skill name="review"/g)?.length, 1)
    assert.equal(text.match(/<skill name="audit"/g)?.length, 1)
    assert.ok(
      text.indexOf('<skill name="review"') <
        text.indexOf('<skill name="audit"'),
    )
    assert.ok(
      text.endsWith(
        `Before attachments\n${draft}\nAfter mixed transformations.`,
      ),
    )
    assert.doesNotMatch(text, /<skill name="literal"|Opaque \/skill:literal/)
    const images = host.users
      .at(-1)
      .content.filter((item) => item.type === "image")
    assert.equal(images.length, 2)
    assert.deepEqual(images[0], {
      type: "image",
      data: PNG,
      mimeType: "image/png",
    })
    assert.equal(images[1].mimeType, "image/png")
    assert.deepEqual(getImageDimensions(images[1].data, images[1].mimeType), {
      widthPx: 1,
      heightPx: 1,
    })
    assert.equal(
      host.requests
        .at(-1)
        .messages.findLast((message) => message.role === "user")
        .content.filter((item) => item.type === "image_url").length,
      2,
    )
    assert.equal(await readFile(textPath, "utf8"), body)
    assert.deepEqual(await readFile(imagePath), Buffer.from(BMP, "base64"))
    assert.equal(
      host.ui.getEditorText(),
      delivery === "normal" ? "" : "Later **draft** /skill:review",
    )
  })
}

test("a pending mixed paste stays with its session through reload, recovery, cleanup, and a fresh process", async (t) => {
  const skills = await catalog(t)
  const host = await nativePi(t, extensions, { skillPaths: [skills] })
  host.submit("Persist session A")
  await waitFor(() => assert.equal(host.requests.length, 1))
  await host.runtime.session.waitForIdle()
  const sessionA = host.runtime.session.sessionFile
  const sessionId = host.runtime.session.sessionManager.getSessionId()
  host.ui.setEditorText(
    '# Session A\n\n**Review** /skill:review @"current file.md"\n',
  )
  const body = "Opaque /skill:literal\n".repeat(250)
  host.ui.pasteToEditor(body)
  const textPath = await waitFor(() => snapshotPath(host.ui.getEditorText()))
  const beforeImage = host.ui.getEditorText()
  const imageSource = join(host.directory, "resumed.png")
  await writeFile(imageSource, Buffer.from(PNG, "base64"))
  await host.runtime.session.sendUserMessage(`/attach-file ${imageSource}`, {
    expandPromptTemplates: true,
  })
  const imagePath = snapshotPath(
    host.ui.getEditorText().slice(beforeImage.length),
  )
  await rm(imageSource)
  host.ui.pasteToEditor("\n```text\n\t/skill:literal\n```\nSelected")
  const draftA = host.ui.getEditorText()
  const clipboard = getNativeClipboard()
  assert.ok(clipboard)
  const read = Promise.withResolvers()
  let reading = false
  t.mock.method(clipboard, "getFilePaths", async () => null)
  t.mock.method(clipboard, "getImage", async () => null)
  t.mock.method(clipboard, "getText", () => {
    reading = true
    return read.promise
  })
  t.after(() => read.resolve(null))
  for (let index = 0; index < "Selected".length; index++)
    host.input("\x1b[1;2D")
  host.input("\x1b[118;9u")
  await waitFor(() => assert.ok(reading))
  assert.deepEqual(await host.runtime.newSession(), { cancelled: false })
  host.submit("Persist session B")
  await waitFor(() => assert.equal(host.requests.length, 2))
  await host.runtime.session.waitForIdle()
  const sessionB = host.runtime.session.sessionFile
  host.ui.setEditorText("Session B /skill:audit")
  await host.runtime.session.sendUserMessage(
    "/attach-text B captured context",
    {
      expandPromptTemplates: true,
    },
  )
  const draftB = host.ui.getEditorText()
  const pathB = snapshotPath(draftB)
  await host.runtime.session.reload()
  assert.equal(host.ui.getEditorText(), draftB)
  const lateText = "Late /skill:literal\n".repeat(300)
  read.resolve(lateText)
  const recovery = await waitFor(() => retainedRequest(host, draftA, "Paste"))
  assert.match(recovery.text, new RegExp(`Session: ${sessionId}`))
  assert.doesNotMatch(recovery.text, /Session B/)
  const latePath = /^Paste: (.+)$/m.exec(recovery.text)[1]
  assert.equal(await readFile(latePath, "utf8"), lateText)
  assert.equal(host.ui.getEditorText(), draftB)
  host.ui.pasteToEditor("B later edit")
  host.input(undo)
  assert.equal(host.ui.getEditorText(), draftB)

  await host.runtime.switchSession(sessionA)
  assert.equal(host.ui.getEditorText(), draftA)
  await host.runtime.session.sendUserMessage(`/attach-file ${latePath}`, {
    expandPromptTemplates: true,
  })
  await waitFor(() => assert.match(host.render(), /Attachments \(3\):/))
  host.input(undo)
  assert.equal(host.ui.getEditorText(), draftA)
  await host.runtime.session.reload()
  assert.equal(host.ui.getEditorText(), draftA)
  host.input(redo)
  assert.doesNotMatch(host.ui.getEditorText(), /Selected/)
  host.input(undo)
  assert.equal(host.ui.getEditorText(), draftA)
  const unknown = join(host.agentDir, "pi-attachments", "unclassified.txt")
  await writeFile(unknown, "Unclassified data remains retained")
  await host.runtime.session.sendUserMessage("/attachments-cleanup", {
    expandPromptTemplates: true,
  })
  assert.match(host.render(), /removed 0 files \(0 bytes\); 0 failures/)
  await host.runtime.switchSession(sessionB)
  assert.equal(host.ui.getEditorText(), draftB)
  host.input(redo)
  assert.equal(host.ui.getEditorText(), `${draftB}B later edit`)
  await host.close()

  const environment = { ...process.env }
  delete environment.NODE_TEST_CONTEXT
  const restarted = await promisify(execFile)(
    process.execPath,
    [
      fileURLToPath(new URL("../fixtures/restart-session.ts", import.meta.url)),
      JSON.stringify({
        directory: host.agentDir,
        sessionFile: sessionA,
        cwd: host.directory,
        text: draftA,
        extensionPaths: extensions,
        skillPaths: [skills],
        attachments: [
          { path: textPath, data: Buffer.from(body).toString("base64") },
          { path: imagePath, data: PNG },
        ],
      }),
    ],
    { env: environment, timeout: 15000 },
  )
  assert.match(restarted.stdout, /pass 1/)
  assert.equal(await readFile(recovery.path, "utf8"), recovery.text)
  assert.equal(await readFile(latePath, "utf8"), lateText)
  assert.equal(await readFile(pathB, "utf8"), "B captured context")
  assert.equal(
    await readFile(unknown, "utf8"),
    "Unclassified data remains retained",
  )
})

test("real model and filesystem failures keep mixed requests recoverable without replacing later work", async (t) => {
  const host = await nativePi(t, extensions, { skillPaths: [await catalog(t)] })
  host.submit("Persist before failure")
  await waitFor(() => assert.equal(host.requests.length, 1))
  await host.runtime.session.waitForIdle()
  const sessionFile = host.runtime.session.sessionFile
  host.ui.setEditorText("# Failed mixed request\n\n**Review** /skill:review\n")
  const body = "Captured /skill:literal\n".repeat(250)
  host.ui.pasteToEditor(body)
  const textPath = await waitFor(() => snapshotPath(host.ui.getEditorText()))
  const beforeImage = host.ui.getEditorText()
  const source = join(host.directory, "failed.png")
  await writeFile(source, Buffer.from(PNG, "base64"))
  await host.runtime.session.sendUserMessage(`/attach-file ${source}`, {
    expandPromptTemplates: true,
  })
  const imagePath = snapshotPath(
    host.ui.getEditorText().slice(beforeImage.length),
  )
  await rm(source)
  host.ui.pasteToEditor("\n```text\n/skill:literal\n```\nSend this")
  const draft = host.ui.getEditorText()
  const response = Promise.withResolvers()
  t.after(() => response.resolve())
  host.replies.push(response.promise)
  host.input(submit)
  await waitFor(() => assert.equal(host.requests.length, 2))
  const later = "Later **work** /skill:audit"
  host.ui.setEditorText(later)
  response.resolve(new Error("Combined provider rejection"))
  await host.runtime.session.waitForIdle()
  assert.match(host.render(), /Combined provider rejection/)
  assert.equal(host.ui.getEditorText(), later)
  const retained = await retainedRequest(host, "Delivery: normal")
  assert.ok(retained.text.includes(textPath))
  assert.ok(retained.text.includes(imagePath))
  const recover = host.runtime.session.sendUserMessage("/composer-recover", {
    expandPromptTemplates: true,
  })
  await waitFor(() => assert.match(host.render(), /Recover draft/))
  host.input("\r")
  await recover
  assert.equal(host.ui.getEditorText(), draft)
  host.input(undo)
  assert.equal(host.ui.getEditorText(), later)
  host.input(redo)
  assert.equal(host.ui.getEditorText(), draft)

  await chmod(textPath, 0o000)
  try {
    await attachmentAction(host, "Restore Inline")
    await waitFor(() =>
      assert.match(host.render(), /Could not restore.*EACCES/),
    )
    assert.equal(host.ui.getEditorText(), draft)
    assert.match(host.render(), /Attachments \(2\):/)
  } finally {
    await chmod(textPath, 0o600)
  }
  await host.runtime.session.reload()
  const storage = join(host.agentDir, "pi-composer", "drafts")
  const checkpoints = await Promise.all(
    (await readdir(storage)).map(async (name) => ({
      path: join(storage, name),
      bytes: await readFile(join(storage, name)),
    })),
  )
  const persisted = await readFile(sessionFile)
  await chmod(storage, 0o500)
  await chmod(sessionFile, 0o400)
  const unsaved = `${draft}\nLater correction /skill:audit`
  try {
    host.ui.setEditorText(unsaved)
    assert.deepEqual(await host.runtime.newSession(), { cancelled: true })
    assert.equal(host.ui.getEditorText(), unsaved)
    assert.match(host.render(), /Could not save draft recovery.*EACCES/)
    assert.match(host.render(), /Could not save session draft.*EACCES/)
    assert.deepEqual(await readFile(sessionFile), persisted)
    await Promise.all(
      checkpoints.map(async ({ path, bytes }) =>
        assert.deepEqual(await readFile(path), bytes),
      ),
    )
  } finally {
    await chmod(storage, 0o700)
    await chmod(sessionFile, 0o600)
  }
  assert.deepEqual(await host.runtime.newSession(), { cancelled: false })
  await host.runtime.switchSession(sessionFile)
  assert.equal(host.ui.getEditorText(), unsaved)
  await host.runtime.session.sendUserMessage("/attachments-cleanup", {
    expandPromptTemplates: true,
  })
  assert.equal(host.ui.getEditorText(), unsaved)
  assert.equal(await readFile(retained.path, "utf8"), retained.text)
  assert.equal(await readFile(textPath, "utf8"), body)
  assert.deepEqual(await readFile(imagePath), Buffer.from(PNG, "base64"))
})

test("a denied snapshot write retries a captured mixed paste as one selection edit", async (t) => {
  const host = await nativePi(t, extensions, { skillPaths: [await catalog(t)] })
  await host.runtime.session.sendUserMessage(
    "/attach-text Retain this attachment",
    {
      expandPromptTemplates: true,
    },
  )
  const reference = host.ui.getEditorText().trim()
  const keptPath = snapshotPath(reference)
  const draft = `# Mixed\n\n**Apply** /skill:review @current.md\n${reference}\nOLD`
  const body = "Captured /skill:literal\n".repeat(250)
  const storage = join(host.agentDir, "pi-attachments")
  host.ui.setEditorText(draft)
  for (let index = 0; index < 3; index++) host.input("\x1b[1;2D")
  await chmod(storage, 0o500)
  try {
    host.ui.pasteToEditor(body)
    await waitFor(() => assert.match(host.render(), /Retry save/))
    assert.match(host.render(), /EACCES/)
    assert.equal(host.ui.getEditorText(), draft)
    const captured = await retainedRequest(host, draft, "Paste")
    const capturedPath = /^Paste: (.+)$/m.exec(captured.text)[1]
    assert.equal(await readFile(capturedPath, "utf8"), body)
  } finally {
    await chmod(storage, 0o700)
  }
  host.input("\r")
  await waitFor(() => assert.match(host.render(), /Attachments \(2\):/))
  const after = host.ui.getEditorText()
  const path = snapshotPath(
    after.slice(after.indexOf(reference) + reference.length),
  )
  assert.doesNotMatch(after, /OLD/)
  assert.ok(after.includes(reference))
  host.input(undo)
  assert.equal(host.ui.getEditorText(), draft)
  host.input(redo)
  assert.equal(host.ui.getEditorText(), after)
  assert.equal(await readFile(keptPath, "utf8"), "Retain this attachment")
  assert.equal(await readFile(path, "utf8"), body)
})

test("native editing alone combines canonical completion, paste policy, restored text, and image delivery", async (t) => {
  const host = await nativePi(t, [pastePath, skillsPath], {
    skillPaths: [await catalog(t)],
  })
  host.ui.setEditorText("Apply /rev")
  host.input("\t")
  await waitFor(() =>
    assert.equal(host.ui.getEditorText(), "Apply /skill:review "),
  )
  host.input("\x7f")
  host.input("\x7f")
  assert.equal(host.ui.getEditorText(), "Apply /skill:revie")
  host.input("w")
  const body = "Opaque /skill:literal\n".repeat(250)
  host.ui.pasteToEditor(body)
  const textPath = await waitFor(() => snapshotPath(host.ui.getEditorText()))
  const beforeImage = host.ui.getEditorText()
  const clipboard = getNativeClipboard()
  assert.ok(clipboard)
  t.mock.method(clipboard, "getFilePaths", async () => null)
  t.mock.method(clipboard, "getImage", async () => Buffer.from(PNG, "base64"))
  t.mock.method(clipboard, "getText", async () => "Ignore icon text")
  host.input("\x16")
  await waitFor(() => assert.match(host.render(), /Attachments \(2\):/))
  const draft = host.ui.getEditorText().trim()
  const imagePath = snapshotPath(
    host.ui.getEditorText().slice(beforeImage.length),
  )
  host.submit()
  await waitFor(() => assert.equal(host.requests.length, 1))
  await host.runtime.session.waitForIdle()
  const content = host.users.at(-1).content
  assert.equal(content[0].text.match(/<skill name="review"/g)?.length, 1)
  assert.ok(content[0].text.endsWith(draft))
  assert.doesNotMatch(content[0].text, /<skill name="literal"/)
  assert.deepEqual(content[1], {
    type: "image",
    data: PNG,
    mimeType: "image/png",
  })

  host.ui.setEditorText(`${draft}\n\`\`\`text\n`)
  await attachmentAction(host, "Restore Inline")
  await waitFor(() => assert.ok(host.ui.getEditorText().includes(body)))
  assert.match(host.render(), /Attachments \(1\): clipboard-image/)
  host.ui.pasteToEditor("```\n")
  host.submit()
  await waitFor(() => assert.equal(host.requests.length, 2))
  await host.runtime.session.waitForIdle()
  assert.doesNotMatch(
    host.users.at(-1).content[0].text,
    /<skill name="literal"/,
  )
  await host.runtime.session.sendUserMessage("/attachments-cleanup", {
    expandPromptTemplates: true,
  })
  assert.equal(await readFile(textPath, "utf8"), body)
  assert.deepEqual(await readFile(imagePath), Buffer.from(PNG, "base64"))
})

test("replacing the editor and disabling composition extensions leave saved Markdown and snapshots readable", async (t) => {
  const loaded = [...extensions]
  const host = await nativePi(t, loaded, { skillPaths: [await catalog(t)] })
  host.submit("Persist before replacement")
  await waitFor(() => assert.equal(host.requests.length, 1))
  await host.runtime.session.waitForIdle()
  host.ui.setEditorText(
    '# Saved Markdown\n\n**Apply** /skill:review @"current file.md"\n',
  )
  const body = "Retained /skill:literal\r\n\t".repeat(220)
  host.ui.pasteToEditor(body)
  const textPath = await waitFor(() => snapshotPath(host.ui.getEditorText()))
  const beforeImage = host.ui.getEditorText()
  const source = join(host.directory, "replace.png")
  await writeFile(source, Buffer.from(PNG, "base64"))
  await host.runtime.session.sendUserMessage(`/attach-file ${source}`, {
    expandPromptTemplates: true,
  })
  const imagePath = snapshotPath(
    host.ui.getEditorText().slice(beforeImage.length),
  )
  host.ui.pasteToEditor("\n```text\n/skill:literal\n```\nKeep editing")
  const draft = host.ui.getEditorText()
  await host.runtime.session.reload()
  const sessionFile = host.runtime.session.sessionFile
  assert.ok(
    (await readFile(sessionFile, "utf8")).includes(JSON.stringify(draft)),
  )
  const draftsDirectory = join(host.agentDir, "pi-composer", "drafts")
  const saved = await Promise.all(
    (await readdir(draftsDirectory)).map(async (name) => ({
      path: join(draftsDirectory, name),
      bytes: await readFile(join(draftsDirectory, name)),
    })),
  )
  host.ui.setEditorComponent(
    (tui, theme, keybindings) => new CustomEditor(tui, theme, keybindings),
  )
  assert.equal(host.ui.getEditorText(), draft)
  loaded.splice(0, loaded.length, attachmentsPath)
  await host.runtime.switchSession(sessionFile)
  assert.equal(host.ui.getEditorText(), draft)
  assert.match(host.render(), /Attachments \(2\):/)
  await rm(source)
  await host.runtime.session.sendUserMessage("/attachments-cleanup", {
    expandPromptTemplates: true,
  })
  await Promise.all(
    saved.map(async ({ path, bytes }) =>
      assert.deepEqual(await readFile(path), bytes),
    ),
  )
  assert.equal(await readFile(textPath, "utf8"), body)
  assert.deepEqual(await readFile(imagePath), Buffer.from(PNG, "base64"))
  host.submit()
  await waitFor(() => assert.equal(host.requests.length, 2))
  await host.runtime.session.waitForIdle()
  assert.deepEqual(host.users.at(-1).content, [
    { type: "text", text: draft.trim() },
    { type: "image", data: PNG, mimeType: "image/png" },
  ])
  loaded.splice(0, loaded.length, ...extensions)
  await host.runtime.switchSession(sessionFile)
  assert.equal(host.ui.getEditorText(), draft)
  host.input(submit)
  await waitFor(() => assert.equal(host.requests.length, 3))
  await host.runtime.session.waitForIdle()
  assert.equal(
    host.users.at(-1).content[0].text.match(/<skill name="review"/g)?.length,
    1,
  )
  assert.equal(await readFile(textPath, "utf8"), body)
  assert.deepEqual(await readFile(imagePath), Buffer.from(PNG, "base64"))
})

test("the isolated terminal acceptance fixture records real CLI skill delivery and model failures", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "pi-terminal-acceptance-"))
  const serverProcess = spawn(
    process.execPath,
    [
      fileURLToPath(
        new URL("../fixtures/terminal-acceptance.mjs", import.meta.url),
      ),
      directory,
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  )
  let errors = ""
  serverProcess.stderr.on("data", (chunk) => {
    errors += chunk
  })
  t.after(async () => {
    if (serverProcess.exitCode === null && serverProcess.signalCode === null) {
      const exited = once(serverProcess, "exit")
      serverProcess.kill()
      await exited
    }
    await rm(directory, { recursive: true, force: true })
  })
  const ready = await waitFor(async () => {
    assert.equal(serverProcess.exitCode, null, errors)
    return JSON.parse(await readFile(join(directory, "ready.json"), "utf8"))
  })
  assert.equal(
    (await readFile(join(directory, "files", "small-4999.txt"), "utf8")).length,
    4999,
  )
  assert.equal(
    (await readFile(join(directory, "files", "large-5000.txt"), "utf8")).length,
    5000,
  )
  const printed = promisify(execFile)(
    fileURLToPath(new URL("../../../node_modules/.bin/pi", import.meta.url)),
    [
      "--no-extensions",
      "--no-skills",
      "--offline",
      "--no-tools",
      "--session-dir",
      join(directory, "sessions"),
      "--skill",
      join(directory, "skills"),
      ...[acceptancePath, ...extensions].flatMap((path) => ["-e", path]),
      "--provider",
      "ticket22",
      "--model",
      "mixed-acceptance",
      "--print",
      "Apply /skill:review and /skill:review with `/skill:literal`.",
    ],
    {
      cwd: join(directory, "files"),
      env: { ...process.env, PI_CODING_AGENT_DIR: join(directory, "agent") },
      timeout: 15000,
    },
  )
  printed.child.stdin.end()
  const result = await printed
  assert.match(result.stdout, /images=0; review=1, audit=0, literal=0/)
  const captured = JSON.parse(
    await readFile(join(directory, "request-1.json"), "utf8"),
  )
  assert.ok(captured.messages.some((message) => message.role === "user"))
  await writeFile(join(directory, "model.hold"), "")
  let responded = false
  const held = fetch(`${ready.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      messages: [{ role: "user", content: "Held request" }],
    }),
  }).then((response) => {
    responded = true
    return response
  })
  await waitFor(() => readFile(join(directory, "request-2.json")))
  assert.equal(responded, false)
  await rm(join(directory, "model.hold"))
  assert.match(await (await held).text(), /Local request 2: images=0/)
  await writeFile(join(directory, "model.fail"), "")
  const failure = await fetch(`${ready.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", content: "Fail" }] }),
  })
  assert.equal(failure.status, 500)
  assert.match(await failure.text(), /Acceptance model failure/)
})
