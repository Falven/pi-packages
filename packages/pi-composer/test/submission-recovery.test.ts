import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { access, chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { test } from "node:test"
import { promisify } from "node:util"
import { openHost } from "../fixtures/host.ts"

const attachments = new URL(
  "../../pi-attachments/src/index.ts",
  import.meta.url,
).pathname

const imageData =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg=="

async function attachDraft(
  host: Awaited<ReturnType<typeof openHost>>,
  name: string,
  contents: string,
) {
  const source = join(host.directory, `${name}.txt`)
  await writeFile(source, contents)
  host.ui.setEditorText(`  ${name} request\t\n`)
  await host.attachFile(source)
  const text = host.ui.getEditorText()
  const path = /\[Attachment: [^\]]+\]\(<([^>]+)>\)/.exec(text)?.[1]
  assert(path, "The native attachment action must publish a readable snapshot")
  await rm(source)
  return { text, path }
}

for (const mode of ["normal", "idleFollowUp", "steer", "followUp"] as const) {
  test(`failed native ${mode} submission remains recoverable without losing a later draft`, async (t) => {
    const streaming = mode === "steer" || mode === "followUp"
    let hasRecovery = false
    const sources: string[] = []
    const host = await openHost(t, {
      extensionPaths: [attachments],
      holdResponses: true,
      responseStatus: 400,
      extension: (pi) => {
        pi.on("session_start", () => {
          hasRecovery = pi
            .getCommands()
            .some(({ name }) => name === "composer-recover")
        })
        pi.on("input", (event) => {
          sources.push(`${event.source}:${event.streamingBehavior ?? "normal"}`)
          return {
            action: "transform",
            text: event.text,
            images: [
              ...(event.images ?? []),
              { type: "image", data: imageData, mimeType: "image/png" },
            ],
          }
        })
        pi.on("input", (event) => ({
          action: "transform",
          text: `Transformed: ${event.text}`,
        }))
      },
    })
    if (streaming) {
      host.ui.setEditorText("Start a controlled turn")
      await host.key("\r")
      await t.waitFor(() => assert.equal(host.requests.length, 1))
    }
    const source = join(host.directory, "original.txt")
    await writeFile(source, "Captured before submission.\n\tExact bytes.\r\n")
    host.ui.setEditorText("  Original request\t\n")
    await host.attachFile(source)
    const original = host.ui.getEditorText()
    const snapshot = /\[Attachment: original.txt\]\(<([^>]+)>\)/.exec(
      original,
    )?.[1]
    assert(
      snapshot,
      "The native attachment action must insert a retained reference",
    )
    await rm(source)

    await host.key(
      mode === "followUp" || mode === "idleFollowUp" ? "\x1b\r" : "\r",
    )
    if (!streaming) {
      await t.waitFor(() => assert.equal(host.requests.length, 1))
    } else {
      await t.waitFor(() =>
        assert.deepEqual(
          mode === "steer"
            ? host.session.getSteeringMessages()
            : host.session.getFollowUpMessages(),
          [`Transformed: ${original.trim()}`],
        ),
      )
    }
    assert.equal(host.ui.getEditorText(), "")
    host.ui.setEditorText("Later draft stays available")
    if (streaming) {
      host.reply(200)
      await t.waitFor(() => assert.equal(host.requests.length, 2))
    }
    host.reply()
    await host.settled()
    assert.deepEqual(
      sources,
      !streaming
        ? ["interactive:normal"]
        : ["interactive:normal", `interactive:${mode}`],
    )
    assert.deepEqual(
      host.requests
        .at(-1)
        ?.messages.filter((message) => message.role === "user")
        .slice(-1),
      [
        {
          role: "user",
          content: [
            { type: "text", text: `Transformed: ${original.trim()}` },
            {
              type: "image_url",
              image_url: { url: `data:image/png;base64,${imageData}` },
            },
          ],
        },
      ],
    )
    assert.match(await host.output(), /Controlled model failure/)
    assert.equal(host.ui.getEditorText(), "Later draft stays available")

    assert(hasRecovery, "Pi must provide a public recovery action")
    const recovering = host.session.sendUserMessage("/composer-recover", {
      expandPromptTemplates: true,
    })
    assert(
      (await host.output()).includes("Recover draft"),
      "Recovery must offer the cleared draft",
    )
    assert.equal(host.ui.getEditorText(), "Later draft stays available")
    await host.key("\r")
    await recovering
    assert.equal(host.ui.getEditorText(), original)
    await host.key("\x1b[122;9u")
    assert.equal(host.ui.getEditorText(), "Later draft stays available")
    assert.equal(
      await readFile(snapshot, "utf8"),
      "Captured before submission.\n\tExact bytes.\r\n",
    )
  })
}

test("a first preflight failure keeps the original and later draft recoverable after restart", async (t) => {
  const host = await openHost(t, {
    persistSession: true,
    noAuth: true,
    extensionPaths: [attachments],
  })
  const sessionFile = host.session.sessionFile!
  const source = join(host.directory, "preflight.txt")
  await writeFile(source, "Snapshot survives a preflight failure.\n")
  host.ui.setEditorText("  First preflight draft\t\n")
  await host.attachFile(source)
  const original = host.ui.getEditorText()
  const snapshot = /\[Attachment: preflight.txt\]\(<([^>]+)>\)/.exec(
    original,
  )?.[1]
  assert(snapshot)
  await rm(source)
  await host.key("\r")
  await t.waitFor(() => assert(host.terminal.output.includes("No API key")))
  assert.equal(host.ui.getEditorText(), "")
  assert((await host.output()).includes("No API key"))
  assert.equal(host.requests.length, 0)
  host.ui.setEditorText("Later unsent draft")
  await host.close()
  await assert.rejects(access(sessionFile), { code: "ENOENT" })

  const environment = { ...process.env }
  delete environment["NODE_TEST_CONTEXT"]
  await promisify(execFile)(
    process.execPath,
    [
      new URL("../fixtures/restart-session.ts", import.meta.url).pathname,
      JSON.stringify({
        directory: host.directory,
        sessionFile,
        text: "Later unsent draft",
        recover: true,
        clearedText: original,
        extensionPaths: [attachments],
      }),
    ],
    { env: environment },
  )
  assert.equal(
    await readFile(snapshot, "utf8"),
    "Snapshot survives a preflight failure.\n",
  )
  await assert.rejects(access(sessionFile), { code: "ENOENT" })
})

test("no-session reload keeps cleared recovery in memory and leaves the later draft intact", async (t) => {
  const host = await openHost(t, { responseStatus: 400 })
  host.ui.setEditorText("  Failed in-memory request\t\n")
  await host.key("\r")
  await host.settled()
  host.ui.setEditorText("Later private draft")
  await host.session.reload()
  assert.equal(host.ui.getEditorText(), "Later private draft")
  const recovery = host.session.sendUserMessage("/composer-recover", {
    expandPromptTemplates: true,
  })
  assert(
    (await host.output()).includes("Recover draft"),
    "Reload must retain cleared recovery",
  )
  await host.key("\r")
  await recovery
  assert.equal(host.ui.getEditorText(), "  Failed in-memory request\t\n")
  await host.key("\x1b[122;9u")
  assert.equal(host.ui.getEditorText(), "Later private draft")
  await host.close()
  await assert.rejects(access(join(host.directory, "pi-composer", "drafts")), {
    code: "ENOENT",
  })
})

test("explicit recovery also preserves the draft it replaces after a fresh restart", async (t) => {
  const host = await openHost(t, { persistSession: true, responseStatus: 400 })
  host.ui.setEditorText("Original failed request")
  await host.key("\r")
  await host.settled()
  host.ui.setEditorText("Later draft before recovery")
  const sessionFile = host.session.sessionFile!
  const recovery = host.session.sendUserMessage("/composer-recover", {
    expandPromptTemplates: true,
  })
  assert((await host.output()).includes("Recover draft"))
  await host.key("\r")
  await recovery
  assert.equal(host.ui.getEditorText(), "Original failed request")
  await host.close()

  const environment = { ...process.env }
  delete environment["NODE_TEST_CONTEXT"]
  await promisify(execFile)(
    process.execPath,
    [
      new URL("../fixtures/restart-session.ts", import.meta.url).pathname,
      JSON.stringify({
        directory: host.directory,
        sessionFile,
        text: "Original failed request",
        clearedText: "Later draft before recovery",
        clearedIndex: 0,
      }),
    ],
    { env: environment },
  )
})

test("the typed recovery command offers the cleared draft instead of recovering itself", async (t) => {
  const host = await openHost(t, { responseStatus: 400 })
  host.ui.setEditorText("Recover through native command dispatch")
  await host.key("\r")
  await host.settled()
  host.ui.setEditorText("/composer-recover")
  await host.key("\r")
  assert((await host.output()).includes("Recover draft"))
  await host.key("\r")
  assert.equal(
    host.ui.getEditorText(),
    "Recover through native command dispatch",
  )
  assert.equal(host.requests.length, 1)
})

test("dequeue and a session switch during a pending response retain each submitted draft", async (t) => {
  const host = await openHost(t, {
    persistSession: true,
    holdResponses: true,
    extensionPaths: [attachments],
    keybindings: { "app.message.dequeue": "super+q" },
  })
  host.ui.setEditorText("Persist session A")
  await host.key("\r")
  await t.waitFor(() => assert.equal(host.requests.length, 1))
  host.reply()
  await host.settled()
  const sessionA = host.session.sessionFile!

  const normal = await attachDraft(host, "Normal", "Normal snapshot\r\n")
  await host.key("\r")
  await t.waitFor(() => assert.equal(host.requests.length, 2))
  const steer = await attachDraft(host, "Steer", "Steer snapshot\t\n")
  await host.key("\r")
  await t.waitFor(() =>
    assert.deepEqual(host.session.getSteeringMessages(), [steer.text.trim()]),
  )
  const followUp = await attachDraft(host, "Follow-up", "Follow-up snapshot\n")
  await host.key("\x1b\r")
  await t.waitFor(() =>
    assert.deepEqual(host.session.getFollowUpMessages(), [
      followUp.text.trim(),
    ]),
  )
  host.ui.setEditorText("Later session A draft")
  await host.key("\x1b[113;9u")
  assert.equal(
    host.ui.getEditorText(),
    `${steer.text.trim()}\n\n${followUp.text.trim()}\n\nLater session A draft`,
  )
  assert.deepEqual(host.session.getSteeringMessages(), [])
  assert.deepEqual(host.session.getFollowUpMessages(), [])
  host.ui.setEditorText("Later session A draft")

  assert.deepEqual(await host.runtime.newSession(), { cancelled: false })
  const sessionB = host.session.sessionFile!
  assert.notEqual(sessionB, sessionA)
  host.ui.setEditorText("Unrelated session B draft")
  host.reply(400)
  assert.equal(host.ui.getEditorText(), "Unrelated session B draft")
  await host.runtime.switchSession(sessionA)
  assert.equal(host.ui.getEditorText(), "Later session A draft")

  // Each recovery also retains the later draft; navigate those new recovery choices.
  /* eslint-disable no-await-in-loop -- Drive each native recovery and its undo in order. */
  for (const [index, draft] of [followUp, steer, normal].entries()) {
    const recovery = host.session.sendUserMessage("/composer-recover", {
      expandPromptTemplates: true,
    })
    assert((await host.output()).includes("Recover draft"))
    for (let step = 0; step < index * 2; step++) {
      await host.key("\x1b[B")
    }
    await host.key("\r")
    await recovery
    assert.equal(host.ui.getEditorText(), draft.text)
    await host.key("\x1b[122;9u")
    assert.equal(host.ui.getEditorText(), "Later session A draft")
  }
  /* eslint-enable no-await-in-loop */
  assert.equal(await readFile(normal.path, "utf8"), "Normal snapshot\r\n")
  assert.equal(await readFile(steer.path, "utf8"), "Steer snapshot\t\n")
  assert.equal(await readFile(followUp.path, "utf8"), "Follow-up snapshot\n")
  await host.close()
  const environment = { ...process.env }
  delete environment["NODE_TEST_CONTEXT"]
  await promisify(execFile)(
    process.execPath,
    [
      new URL("../fixtures/restart-session.ts", import.meta.url).pathname,
      JSON.stringify({
        directory: host.directory,
        sessionFile: sessionB,
        text: "Unrelated session B draft",
        recover: true,
      }),
    ],
    { env: environment },
  )
})

test("a recovery write failure before clearing preserves the submitted and later drafts", async (t) => {
  const host = await openHost(t, {
    persistSession: true,
    noAuth: true,
    extensionPaths: [attachments],
  })
  const sessionFile = host.session.sessionFile!
  const recoveryDirectory = join(host.directory, "pi-composer", "drafts")
  await mkdir(recoveryDirectory, { recursive: true })
  await chmod(recoveryDirectory, 0o500)
  const draft = await attachDraft(
    host,
    "Unsaved",
    "Original snapshot stays readable\n",
  )
  try {
    await t.waitFor(() =>
      assert(host.terminal.output.includes("Could not save draft recovery")),
    )
    assert.equal(host.ui.getEditorText(), draft.text)
    await host.key("\r")
    await t.waitFor(() => assert(host.terminal.output.includes("No API key")))
    assert.equal(host.ui.getEditorText(), "")
    assert((await host.output()).includes("No API key"))
    host.ui.setEditorText("Later work after the save failure")
    assert.deepEqual(await host.runtime.newSession(), { cancelled: true })
    assert.equal(host.session.sessionFile, sessionFile)
    const recovery = host.session.sendUserMessage("/composer-recover", {
      expandPromptTemplates: true,
    })
    assert((await host.output()).includes("Recover draft"))
    await host.key("\r")
    await recovery
    assert.equal(host.ui.getEditorText(), draft.text)
    await host.key("\x1b[122;9u")
    assert.equal(host.ui.getEditorText(), "Later work after the save failure")
  } finally {
    await chmod(recoveryDirectory, 0o700)
  }
  await host.close()
  const environment = { ...process.env }
  delete environment["NODE_TEST_CONTEXT"]
  await promisify(execFile)(
    process.execPath,
    [
      new URL("../fixtures/restart-session.ts", import.meta.url).pathname,
      JSON.stringify({
        directory: host.directory,
        sessionFile,
        text: "Later work after the save failure",
        recover: true,
        clearedText: draft.text,
        clearedIndex: 2,
        extensionPaths: [attachments],
      }),
    ],
    { env: environment },
  )
  assert.equal(
    await readFile(draft.path, "utf8"),
    "Original snapshot stays readable\n",
  )
  assert.equal(host.requests.length, 0)
})

test("a void extension send can fail before a native clear without losing the draft", async (t) => {
  let sendResult: unknown = "not called"
  const sources: string[] = []
  const host = await openHost(t, {
    columns: 120,
    noAuth: true,
    extensionPaths: [attachments],
    extension: (pi) => {
      pi.registerShortcut("super+s", {
        handler(ctx) {
          sendResult = pi.sendUserMessage(ctx.ui.getEditorText())
        },
      })
      pi.on("input", (event) => {
        sources.push(event.source)
      })
    },
  })
  const draft = await attachDraft(
    host,
    "Before-clear",
    "Before-clear snapshot\n",
  )
  await host.key("\x1b[115;9u")
  assert.equal(sendResult, undefined)
  const output = await host.output()
  assert(/No\s+API\s+key/.test(output), output.slice(-2500))
  assert.equal(host.requests.length, 0)
  assert.deepEqual(sources, ["extension"])
  assert.equal(host.ui.getEditorText(), draft.text)
  host.ui.setEditorText("")
  host.ui.setEditorText("Later draft after the void send")
  const recovery = host.session.sendUserMessage("/composer-recover", {
    expandPromptTemplates: true,
  })
  assert((await host.output()).includes("Recover draft"))
  await host.key("\r")
  await recovery
  assert.equal(host.ui.getEditorText(), draft.text)
  await host.key("\x1b[122;9u")
  assert.equal(host.ui.getEditorText(), "Later draft after the void send")
  assert.equal(await readFile(draft.path, "utf8"), "Before-clear snapshot\n")
})

test("an asynchronously handled input keeps its original draft recoverable", async (t) => {
  const gate = Promise.withResolvers<void>()
  let inputStarted = false
  let handled = false
  t.after(() => gate.resolve())
  const host = await openHost(t, {
    extensionPaths: [attachments],
    extension: (pi) => {
      pi.on("input", async () => {
        inputStarted = true
        await gate.promise
        handled = true
        return { action: "handled" }
      })
    },
  })
  const draft = await attachDraft(host, "Handled", "Handled input snapshot\n")
  await host.key("\r")
  await t.waitFor(() => assert(inputStarted))
  assert.equal(host.ui.getEditorText(), "")
  host.ui.setEditorText("Later work while input is pending")
  gate.resolve()
  await t.waitFor(() => assert(handled))
  assert.equal(host.requests.length, 0)
  assert.equal(host.ui.getEditorText(), "Later work while input is pending")
  const recovery = host.session.sendUserMessage("/composer-recover", {
    expandPromptTemplates: true,
  })
  assert((await host.output()).includes("Recover draft"))
  await host.key("\r")
  await recovery
  assert.equal(host.ui.getEditorText(), draft.text)
  await host.key("\x1b[122;9u")
  assert.equal(host.ui.getEditorText(), "Later work while input is pending")
  assert.equal(await readFile(draft.path, "utf8"), "Handled input snapshot\n")
})

test("native compaction queues preserve draft attachments through compaction and model failures", async (t) => {
  const inputs: string[] = []
  const host = await openHost(t, {
    holdResponses: true,
    extensionPaths: [attachments],
    extension: (pi) => {
      pi.on("input", (event) => {
        inputs.push(event.text)
      })
    },
  })
  host.session.settingsManager.applyOverrides({
    compaction: { enabled: false, keepRecentTokens: 1 },
  })
  host.ui.setEditorText("Seed native compaction")
  await host.key("\r")
  await t.waitFor(() => assert.equal(host.requests.length, 1))
  host.reply()
  await host.settled()
  host.ui.setEditorText("/compact")
  await host.key("\r")
  await t.waitFor(() => assert.equal(host.requests.length, 2))
  assert(host.session.isCompacting)

  const normal = await attachDraft(
    host,
    "Compaction-normal",
    "Compaction normal bytes\n",
  )
  await host.key("\r")
  const followUp = await attachDraft(
    host,
    "Compaction-follow-up",
    "Compaction follow-up bytes\n",
  )
  await host.key("\x1b\r")
  await t.waitFor(() => assert.equal(host.ui.getEditorText(), ""))
  assert.deepEqual(inputs, ["Seed native compaction"])
  host.ui.setEditorText("Later draft during compaction")
  host.reply(400)
  await t.waitFor(() => assert.equal(host.requests.length, 3))
  assert.equal(host.ui.getEditorText(), "Later draft during compaction")
  assert.deepEqual(
    host.requests[2]?.messages.findLast((message) => message.role === "user"),
    {
      role: "user",
      content: [{ type: "text", text: normal.text.trim() }],
    },
  )
  host.reply()
  await t.waitFor(() => assert.equal(host.requests.length, 4))
  assert.deepEqual(
    host.requests[3]?.messages.findLast((message) => message.role === "user"),
    {
      role: "user",
      content: [{ type: "text", text: followUp.text.trim() }],
    },
  )
  host.reply(400)
  await host.settled()
  // Pi may transform queued inputs concurrently; model delivery order is checked above.
  assert.deepEqual(
    inputs.toSorted(),
    [
      "Seed native compaction",
      normal.text.trim(),
      followUp.text.trim(),
    ].toSorted(),
  )
  assert((await host.output()).includes("Controlled model failure"))
  assert.equal(host.ui.getEditorText(), "Later draft during compaction")
  const recovery = host.session.sendUserMessage("/composer-recover", {
    expandPromptTemplates: true,
  })
  assert((await host.output()).includes("Recover draft"))
  await host.key("\r")
  await recovery
  assert.equal(host.ui.getEditorText(), followUp.text)
  await host.key("\x1b[122;9u")
  assert.equal(host.ui.getEditorText(), "Later draft during compaction")
  assert.equal(await readFile(normal.path, "utf8"), "Compaction normal bytes\n")
  assert.equal(
    await readFile(followUp.path, "utf8"),
    "Compaction follow-up bytes\n",
  )
})

for (const mode of ["steer", "followUp"] as const) {
  test(`snapshot images survive native ${mode} dequeue, failed replay, and restart recovery`, async (t) => {
    const host = await openHost(t, {
      persistSession: true,
      holdResponses: true,
      extensionPaths: [attachments],
      keybindings: { "app.message.dequeue": "super+q" },
    })
    host.ui.setEditorText("Hold the initial response")
    await host.key("\r")
    await t.waitFor(() => assert.equal(host.requests.length, 1))
    const source = join(host.directory, "image.png")
    await writeFile(source, Buffer.from(imageData, "base64"))
    host.ui.setEditorText(`  Image ${mode} request\t\n`)
    await host.attachFile(source)
    const original = host.ui.getEditorText()
    const snapshot = /\[Attachment: image.png\]\(<([^>]+)>\)/.exec(
      original,
    )?.[1]
    assert(snapshot)
    await rm(source)
    await host.key(mode === "followUp" ? "\x1b\r" : "\r")
    await t.waitFor(() =>
      assert.deepEqual(
        mode === "followUp"
          ? host.session.getFollowUpMessages()
          : host.session.getSteeringMessages(),
        [original.trim()],
      ),
    )
    host.ui.setEditorText("Later image draft")
    await host.key("\x1b[113;9u")
    const replay = `${original.trim()}\n\nLater image draft`
    assert.equal(host.ui.getEditorText(), replay)
    assert.deepEqual(host.session.getSteeringMessages(), [])
    assert.deepEqual(host.session.getFollowUpMessages(), [])
    host.reply()
    await host.settled()

    await host.key("\r")
    await t.waitFor(() => assert.equal(host.requests.length, 2))
    assert.deepEqual(
      host.requests[1]?.messages.findLast((message) => message.role === "user"),
      {
        role: "user",
        content: [
          { type: "text", text: replay },
          {
            type: "image_url",
            image_url: { url: `data:image/png;base64,${imageData}` },
          },
        ],
      },
    )
    host.ui.setEditorText("Later work after image replay")
    host.reply(400)
    await host.settled()
    await host.session.reload()
    assert.equal(host.ui.getEditorText(), "Later work after image replay")
    const recovery = host.session.sendUserMessage("/composer-recover", {
      expandPromptTemplates: true,
    })
    assert((await host.output()).includes("Recover draft"))
    await host.key("\x1b[B")
    await host.key("\r")
    await recovery
    assert.equal(host.ui.getEditorText(), original)
    await host.key("\x1b[122;9u")
    assert.equal(host.ui.getEditorText(), "Later work after image replay")
    const sessionFile = host.session.sessionFile!
    await host.close()
    const environment = { ...process.env }
    delete environment["NODE_TEST_CONTEXT"]
    await promisify(execFile)(
      process.execPath,
      [
        new URL("../fixtures/restart-session.ts", import.meta.url).pathname,
        JSON.stringify({
          directory: host.directory,
          sessionFile,
          text: "Later work after image replay",
          clearedText: original,
          clearedIndex: 2,
          extensionPaths: [attachments],
        }),
      ],
      { env: environment },
    )
    assert.deepEqual(await readFile(snapshot), Buffer.from(imageData, "base64"))
  })
}

test("the selected recovery stays visible when many cleared drafts are retained", async (t) => {
  const host = await openHost(t, { responseStatus: 400 })
  for (let index = 0; index < 30; index++) {
    host.ui.setEditorText(`Older draft ${index}`)
    host.ui.setEditorText("")
  }
  host.ui.setEditorText("Newest recoverable draft")
  await host.key("\r")
  await host.settled()
  host.ui.setEditorText("Later work")
  host.terminal.output = ""
  const recovery = host.session.sendUserMessage("/composer-recover", {
    expandPromptTemplates: true,
  })
  const output = await host.output()
  assert(
    output.includes("Newest recoverable draft"),
    "The selected recovery must be visible",
  )
  for (let index = 0; index < 15; index++) {
    // oxlint-disable-next-line no-await-in-loop -- Navigate beyond the first page of native choices.
    await host.key("\x1b[B")
  }
  assert((await host.output()).includes("Older draft 15"))
  await host.key("\r")
  await recovery
  assert.equal(host.ui.getEditorText(), "Older draft 15")
  await host.key("\x1b[122;9u")
  assert.equal(host.ui.getEditorText(), "Later work")
})
