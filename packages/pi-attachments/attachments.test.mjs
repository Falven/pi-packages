import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { chmod, readFile, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"
import { CustomEditor } from "@earendil-works/pi-coding-agent"
import {
  holdFileRead,
  nativePi,
  retainedRequest,
  snapshotPath,
  waitFor,
} from "./test-support/native-pi.mjs"

test("native Attach Text preserves text before inserting its snapshot reference", async (t) => {
  const host = await nativePi(t)
  host.submit("/attach-text Captured text\nconst answer = 42;")
  const path = await waitFor(() => snapshotPath(host.ui.getEditorText()))
  assert.equal(
    await readFile(path, "utf8"),
    "Captured text\nconst answer = 42;",
  )
})

test("native Attach File keeps captured bytes after the source changes or is removed", async (t) => {
  const host = await nativePi(t)
  const source = join(host.directory, "source note.txt")
  await writeFile(source, "Original file\r\nSnowman: ☃\0\n")
  host.submit(`/attach-file ${source}`)
  const path = await waitFor(() => snapshotPath(host.ui.getEditorText()))
  assert.notEqual(path, source)
  await writeFile(source, "Changed source")
  assert.equal(await readFile(path, "utf8"), "Original file\r\nSnowman: ☃\0\n")
  await rm(source)
  assert.equal(await readFile(path, "utf8"), "Original file\r\nSnowman: ☃\0\n")
})

test(
  "native Attach File and recovery reject a FIFO without waiting for a writer",
  { timeout: 15000 },
  async (t) => {
    const host = await nativePi(t)
    const source = join(host.directory, "input.fifo")
    execFileSync("/usr/bin/mkfifo", [source])
    host.ui.setEditorText("Keep this draft")
    await host.runtime.session.prompt("/attach-text Already captured")
    const draft = host.ui.getEditorText()
    const retained = snapshotPath(draft)
    /* eslint-disable no-await-in-loop -- Recovery retries the same rejected attachment request. */
    for (const command of [`/attach-file ${source}`, "/attachments-recover"]) {
      let completed = false
      const pending = host.runtime.session
        .sendUserMessage(command, {
          expandPromptTemplates: true,
        })
        .finally(() => {
          completed = true
        })
      try {
        await waitFor(() =>
          assert.equal(
            completed,
            true,
            "The source must be rejected without a FIFO writer",
          ),
        )
        assert.match(host.render(), /Not a regular file/)
        assert.equal(host.ui.getEditorText(), draft)
        assert.equal(await readFile(retained, "utf8"), "Already captured")
      } finally {
        if (!completed)
          await writeFile(source, "Release a blocked regression probe")
        await pending
      }
    }
    /* eslint-enable no-await-in-loop */
  },
)

test("native draft membership follows references and coexists with other widgets and actions", async (t) => {
  const host = await nativePi(t)
  host.ui.setEditorText("Review the draft")
  await host.runtime.session.prompt("/attach-text Supporting material")
  assert.match(host.ui.getEditorText(), /^Review the draft\n/)
  assert.match(host.render(), /Attachments \(1\): text\.txt/)
  assert.match(host.render(), /Other extension widget/)

  host.ui.setEditorText("Review the draft")
  assert.doesNotMatch(host.render(), /Attachments \(/)
  assert.match(host.render(), /Other extension widget/)
  host.submit("/other-action")
  await waitFor(() =>
    assert.equal(host.ui.getEditorText(), "Other action worked"),
  )
})

test("Attach Text dialog preserves leading whitespace and final newlines", async (t) => {
  const host = await nativePi(t)
  host.submit("/attach-text")
  await waitFor(() => assert.match(host.render(), /Attach text/))
  host.input("\x1b[200~\n  const answer = 42;\n\n\x1b[201~")
  host.input("\r")
  const path = await waitFor(() => snapshotPath(host.ui.getEditorText()))
  assert.equal(await readFile(path, "utf8"), "\n  const answer = 42;\n\n")
})

test("native attachment shortcuts add to the active draft and allow cancellation", async (t) => {
  const host = await nativePi(t)
  const source = join(host.directory, "chosen.txt")
  await writeFile(source, "Chosen file")
  host.ui.setEditorText("Existing draft")
  host.input("\x1b[102;7u")
  await waitFor(() => assert.match(host.render(), /Attach file/))
  host.input(`\x1b[200~${source}\x1b[201~`)
  host.input("\r")
  const path = await waitFor(() => snapshotPath(host.ui.getEditorText()))
  assert.equal(await readFile(path, "utf8"), "Chosen file")
  assert.match(host.ui.getEditorText(), /^Existing draft\n/)

  const draft = host.ui.getEditorText()
  host.input("\x1b[116;7u")
  await waitFor(() => assert.match(host.render(), /Attach text/))
  host.input("\x1b")
  await waitFor(() => assert.doesNotMatch(host.render(), /Attach text/))
  assert.equal(host.ui.getEditorText(), draft)
})

test("a failed text snapshot write keeps the draft and entered text available for retry", async (t) => {
  const host = await nativePi(t)
  host.ui.setEditorText("Keep this draft")
  await chmod(host.agentDir, 0o500)
  try {
    host.input("\x1b[116;7u")
    await waitFor(() => assert.match(host.render(), /Attach text/))
    host.input("\x1b[200~\n  Recover every byte.\n\x1b[201~")
    host.input("\r")
    await waitFor(() => assert.match(host.render(), /Could not attach/))
    assert.equal(host.ui.getEditorText(), "Keep this draft")
    assert.match(host.render(), /Attach text/)
    assert.match(host.render(), /Recover every byte\./)
  } finally {
    await chmod(host.agentDir, 0o700)
  }
  host.input("\r")
  const path = await waitFor(() => snapshotPath(host.ui.getEditorText()))
  assert.equal(await readFile(path, "utf8"), "\n  Recover every byte.\n")
})

test("native attachment-only submission sends a reference and Pi reads its text on demand", async (t) => {
  const host = await nativePi(t)
  host.submit("/attach-text This body stays out of the initial prompt.")
  const path = await waitFor(() => snapshotPath(host.ui.getEditorText()))
  const draft = host.ui.getEditorText().trim()
  host.replies.push({
    index: 0,
    delta: {
      role: "assistant",
      tool_calls: [
        {
          index: 0,
          id: "read-snapshot",
          type: "function",
          function: { name: "read", arguments: JSON.stringify({ path }) },
        },
      ],
    },
    finish_reason: "tool_calls",
  })
  host.submit()
  await waitFor(() => assert.equal(host.requests.length, 2))
  const user = host.requests[0].messages.find(
    (message) => message.role === "user",
  )
  assert.deepEqual(user.content, [{ type: "text", text: draft }])
  assert.doesNotMatch(JSON.stringify(user.content), /This body stays out/)
  const read = host.requests[1].messages.find(
    (message) => message.role === "tool",
  )
  assert.equal(read.content, "This body stays out of the initial prompt.")
  await waitFor(() => assert.equal(host.runtime.session.isStreaming, false))
  assert.equal(host.ui.getEditorText(), "")
  assert.doesNotMatch(host.render(), /Attachments \(/)
  assert.equal(
    await readFile(path, "utf8"),
    "This body stays out of the initial prompt.",
  )
})

test("ordinary file references still read the current source beside a submitted file snapshot", async (t) => {
  const host = await nativePi(t)
  const source = join(host.directory, "working.txt")
  await writeFile(source, "Captured version")
  host.ui.setEditorText(`Compare @${source}`)
  await host.runtime.session.prompt(`/attach-file ${source}`)
  const path = snapshotPath(host.ui.getEditorText())
  await writeFile(source, "Current working version")
  host.replies.push({
    index: 0,
    delta: {
      role: "assistant",
      tool_calls: [
        {
          index: 0,
          id: "read-captured",
          type: "function",
          function: { name: "read", arguments: JSON.stringify({ path }) },
        },
        {
          index: 1,
          id: "read-working",
          type: "function",
          function: {
            name: "read",
            arguments: JSON.stringify({ path: source }),
          },
        },
      ],
    },
    finish_reason: "tool_calls",
  })
  host.submit()
  await waitFor(() => assert.equal(host.requests.length, 2))
  const user = host.requests[0].messages.find(
    (message) => message.role === "user",
  )
  assert.ok(user.content[0].text.startsWith(`Compare @${source}\n`))
  assert.equal(snapshotPath(user.content[0].text), path)
  assert.doesNotMatch(
    JSON.stringify(user.content),
    /Captured version|Current working version/,
  )
  const reads = host.requests[1].messages.filter(
    (message) => message.role === "tool",
  )
  assert.deepEqual(
    reads.map((message) => message.content),
    ["Captured version", "Current working version"],
  )
  await waitFor(() => assert.equal(host.runtime.session.isStreaming, false))
})

test("a delayed attachment cannot enter the fresh draft after native submission", async (t) => {
  const host = await nativePi(t)
  const source = join(host.directory, "delayed.txt")
  await writeFile(source, "Bytes from the requesting draft")
  const held = holdFileRead(t, source)
  const requestingSession = host.runtime.session.sessionManager.getSessionId()
  const pending = host.runtime.session.prompt(`/attach-file ${source}`)
  await held.started()
  assert.equal(host.ui.getEditorText(), "")
  host.submit("An independent request")
  await waitFor(() => assert.equal(host.requests.length, 1))
  await waitFor(() => assert.equal(host.runtime.session.isStreaming, false))
  held.release()
  await pending
  assert.equal(host.ui.getEditorText(), "")
  const recovery = await retainedRequest(host)
  assert.ok(recovery.text.includes(requestingSession))
  assert.equal(
    await readFile(snapshotPath(recovery.text), "utf8"),
    "Bytes from the requesting draft",
  )
  assert.match(host.render(), /Snapshot retained/)
})

test("a delayed snapshot stays with its requesting draft across native session replacement", async (t) => {
  const host = await nativePi(t)
  const source = join(host.directory, "previous-session.txt")
  await writeFile(source, "Previous session bytes")
  host.ui.setEditorText("Draft in the original session")
  const requestingSession = host.runtime.session.sessionManager.getSessionId()
  const held = holdFileRead(t, source)
  const pending = host.runtime.session.prompt(`/attach-file ${source}`)
  await held.started()
  await host.runtime.newSession()
  host.ui.setEditorText("Draft in the replacement session")
  held.release()
  await pending
  assert.equal(host.ui.getEditorText(), "Draft in the replacement session")
  const recovery = await retainedRequest(host)
  assert.ok(recovery.text.includes(requestingSession))
  assert.match(recovery.text, /Draft in the original session/)
  assert.doesNotMatch(recovery.text, /Draft in the replacement session/)
  assert.equal(
    await readFile(snapshotPath(recovery.text), "utf8"),
    "Previous session bytes",
  )
})

test("an unreadable file leaves the draft and existing snapshots intact", async (t) => {
  const host = await nativePi(t)
  const source = join(host.directory, "unreadable.txt")
  await writeFile(source, "Available after permissions are repaired")
  host.ui.setEditorText("Keep this work")
  await host.runtime.session.prompt("/attach-text Already attached")
  const draft = host.ui.getEditorText()
  const retained = snapshotPath(draft)
  await chmod(source, 0o000)
  try {
    await host.runtime.session.prompt(`/attach-file ${source}`)
    assert.equal(host.ui.getEditorText(), draft)
    assert.match(host.render(), /Could not attach.*EACCES/)
    assert.equal(await readFile(retained, "utf8"), "Already attached")
  } finally {
    await chmod(source, 0o600)
  }
  await host.runtime.session.prompt(`/attach-file ${source}`)
  assert.match(host.render(), /Attachments \(2\): text\.txt, unreadable\.txt/)
})

test("clearing the native editor during a file read keeps the resulting snapshot out of the new draft", async (t) => {
  const host = await nativePi(t)
  const source = join(host.directory, "cancelled-draft.txt")
  await writeFile(source, "Recover after clearing")
  const held = holdFileRead(t, source)
  const pending = host.runtime.session.prompt(`/attach-file ${source}`)
  await held.started()
  host.input("\x03")
  held.release()
  await pending
  assert.equal(host.ui.getEditorText(), "")
  const recovery = await retainedRequest(host)
  assert.equal(
    await readFile(snapshotPath(recovery.text), "utf8"),
    "Recover after clearing",
  )
})

test("native session replacement closes the old attachment dialog", async (t) => {
  const host = await nativePi(t)
  host.ui.setEditorText("Original draft")
  let finished = false
  const pending = host.runtime.session.prompt("/attach-text").then(() => {
    finished = true
  })
  await waitFor(() => assert.match(host.render(), /Attach text/))
  await host.runtime.newSession()
  host.ui.setEditorText("Replacement draft")
  await waitFor(() => assert.doesNotMatch(host.render(), /Attach text/))
  await waitFor(() =>
    assert.equal(
      finished,
      true,
      "the old action finishes when its session is replaced",
    ),
  )
  await pending
  assert.equal(host.ui.getEditorText(), "Replacement draft")
})

test("retrying a failed file write uses the captured bytes even after the source is removed", async (t) => {
  const host = await nativePi(t)
  const source = join(host.directory, "retry.txt")
  await writeFile(source, "Captured before the failed write")
  host.ui.setEditorText("Keep my draft")
  await chmod(host.agentDir, 0o500)
  let pending
  try {
    pending = host.runtime.session.prompt(`/attach-file ${source}`)
    await waitFor(() => assert.match(host.render(), /Could not attach/))
    assert.equal(host.ui.getEditorText(), "Keep my draft")
    assert.match(host.render(), /Retry save/)
    await rm(source)
  } finally {
    await chmod(host.agentDir, 0o700)
  }
  host.input("\r")
  await pending
  const path = snapshotPath(host.ui.getEditorText())
  assert.equal(await readFile(path, "utf8"), "Captured before the failed write")
})

test("finishing the text dialog preserves subsequent edits to the main draft", async (t) => {
  const host = await nativePi(t)
  host.ui.setEditorText("Requesting draft")
  const pending = host.runtime.session.prompt("/attach-text")
  await waitFor(() => assert.match(host.render(), /Attach text/))
  host.input("\x1b[200~Captured in the dialog\x1b[201~")
  host.ui.setEditorText("Later edits to preserve")
  host.input("\r")
  await pending
  assert.equal(host.ui.getEditorText(), "Later edits to preserve")
  const recovery = await retainedRequest(host)
  assert.match(recovery.text, /Requesting draft/)
  assert.equal(
    await readFile(snapshotPath(recovery.text), "utf8"),
    "Captured in the dialog",
  )
})

test("a programmatic clear to the original text cancels pending automatic attachment insertion", async (t) => {
  const host = await nativePi(t)
  const source = join(host.directory, "cleared-draft.txt")
  await writeFile(source, "Captured before the programmatic clear")
  const held = holdFileRead(t, source)
  const pending = host.runtime.session.prompt(`/attach-file ${source}`)
  await held.started()
  host.ui.setEditorText("A different draft")
  host.ui.setEditorText("")
  held.release()
  await pending
  assert.equal(host.ui.getEditorText(), "")
  const recovery = await retainedRequest(host)
  assert.equal(
    await readFile(snapshotPath(recovery.text), "utf8"),
    "Captured before the programmatic clear",
  )
})

test("a later transparent editor factory attaches to the unchanged native draft", async (t) => {
  const host = await nativePi(t)
  host.ui.setEditorText("Current draft")
  const previous = host.ui.getEditorComponent()
  host.ui.setEditorComponent((...args) => previous(...args))

  await host.runtime.session.prompt("/attach-text Composed snapshot")
  const path = snapshotPath(host.ui.getEditorText())
  assert.match(host.ui.getEditorText(), /^Current draft\n\[Attachment:/)
  assert.equal(await readFile(path, "utf8"), "Composed snapshot")
  assert.match(host.render(), /Attachments \(1\): text\.txt/)
})

for (const replacement of ["before", "during"]) {
  test(`an editor factory replaced ${replacement} attachment preparation preserves the request for recovery`, async (t) => {
    const host = await nativePi(t)
    const replace = () =>
      host.ui.setEditorComponent(
        (tui, theme, keybindings) => new CustomEditor(tui, theme, keybindings),
      )
    if (replacement === "before") replace()
    const source = join(host.directory, "replaced-editor.txt")
    await writeFile(source, "Captured for the requesting editor")
    const held = holdFileRead(t, source)
    const pending = host.runtime.session.prompt(`/attach-file ${source}`)
    await held.started()
    if (replacement === "during") replace()
    host.ui.setEditorText("A different draft in the replacement editor")
    host.ui.setEditorText("")
    held.release()
    await pending
    assert.equal(host.ui.getEditorText(), "")
    const recovery = await retainedRequest(host)
    assert.equal(
      await readFile(snapshotPath(recovery.text), "utf8"),
      "Captured for the requesting editor",
    )
    assert.match(host.render(), /Snapshot retained/)
  })
}

for (const installation of ["recreated", "reused"]) {
  test(`an observed editor ${installation} during attachment preparation retains the requesting snapshot`, async (t) => {
    const host = await nativePi(t, [
      fileURLToPath(new URL("../pi-composer/src/index.ts", import.meta.url)),
    ])
    const previous = host.ui.getEditorComponent()
    let editor
    const factory = (...args) => {
      editor = previous(...args)
      return editor
    }
    host.ui.setEditorComponent(factory)
    const source = join(host.directory, "reinstalled-editor.txt")
    await writeFile(source, "Captured before editor installation")
    const held = holdFileRead(t, source)
    const pending = host.runtime.session.prompt(`/attach-file ${source}`)
    await held.started()
    host.ui.setEditorComponent(
      installation === "reused" ? () => editor : factory,
    )
    held.release()
    await pending

    assert.equal(host.ui.getEditorText(), "")
    const recovery = await retainedRequest(host)
    assert.equal(
      await readFile(snapshotPath(recovery.text), "utf8"),
      "Captured before editor installation",
    )
    assert.match(host.render(), /Snapshot retained/)
  })
}

test("a later factory keeps composer selection replacement and undo when attaching a snapshot", async (t) => {
  const host = await nativePi(t, [
    fileURLToPath(new URL("../pi-composer/src/index.ts", import.meta.url)),
  ])
  const previous = host.ui.getEditorComponent()
  host.ui.setEditorComponent((...args) => previous(...args))
  host.ui.setEditorText("Keep draft")
  for (let index = 0; index < 5; index++) host.input("\x1b[1;2D")
  await host.runtime.session.prompt("/attach-text Selected snapshot")
  const path = snapshotPath(host.ui.getEditorText())
  assert.match(host.ui.getEditorText(), /^Keep \n\[Attachment:/)
  assert.match(host.render(), /Attachments \(1\): text\.txt/)

  host.input("\x1b[122;9u")
  assert.equal(host.ui.getEditorText(), "Keep draft")
  assert.doesNotMatch(host.render(), /Attachments \(/)
  host.input("source")
  assert.equal(host.ui.getEditorText(), "Keep source")
  assert.equal(await readFile(path, "utf8"), "Selected snapshot")
})

test("native callbacks, ordinary text, and autocomplete updates survive attachment observation", async (t) => {
  const host = await nativePi(t)
  const previous = host.ui.getEditorComponent()
  host.ui.setEditorComponent((...args) => previous(...args))
  host.ui.setEditorText("!echo draft")
  host.input("\x1b")
  assert.equal(
    host.ui.getEditorText(),
    "",
    "Escape cancels the native bash draft",
  )

  host.ui.setEditorText("Code\tbefore\r\na paste: ")
  host.ui.pasteToEditor("x".repeat(1100))
  assert.equal(
    host.ui.getEditorText(),
    `Code    before\na paste: ${"x".repeat(1100)}`,
  )
  assert.match(host.render(), /\[paste #1/)
  assert.doesNotMatch(host.render(), /Attachments \(/)

  host.ui.addAutocompleteProvider((current) => ({
    async getSuggestions(...args) {
      if (args[0][args[1]] === "probe") {
        return {
          prefix: "probe",
          items: [
            { value: "kept", label: "Updated provider completion" },
            { value: "other", label: "Other completion" },
          ],
        }
      }
      return current.getSuggestions(...args)
    },
    applyCompletion(...args) {
      if (args[3].value === "kept") {
        return { lines: ["Keep suffix"], cursorLine: 0, cursorCol: 5 }
      }
      return current.applyCompletion(...args)
    },
  }))
  host.ui.setEditorText("probe")
  host.input("\t")
  await waitFor(() =>
    assert.match(host.render(), /Updated provider completion/),
  )
  host.input("\r")
  host.input("inserted ")
  assert.equal(host.ui.getEditorText(), "Keep inserted suffix")
  host.ui.setEditorText("/oth")
  host.input("\t")
  await waitFor(() => assert.match(host.render(), /other-action/))
  host.input("\r")
  await waitFor(() =>
    assert.equal(host.ui.getEditorText(), "Other action worked"),
  )
  assert.equal(host.requests.length, 0)
})
