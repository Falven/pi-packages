import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { test } from "node:test"
import { openHost } from "./host.ts"

const options: {
  directory: string
  sessionFile: string
  text: string
  recover?: boolean
  clearedText?: string
  clearedIndex?: number
  extensionPaths?: string[]
  cwd?: string
  attachments?: { path: string; data: string }[]
} = JSON.parse(process.argv[2]!)

test("a fresh Pi process restores the saved draft", async (t) => {
  const host = await openHost(t, options)
  assert.equal(host.runtime.cwd, host.session.sessionManager.getCwd())
  if (options.cwd) assert.equal(host.runtime.cwd, options.cwd)
  if (options.recover) {
    assert.equal(host.ui.getEditorText(), "")
    assert.match(await host.output(), /composer-recover/)
    const recovery = host.session.sendUserMessage("/composer-recover", {
      expandPromptTemplates: true,
    })
    await t.waitFor(async () =>
      assert.match(await host.output(), /Recover draft/),
    )
    await host.key("\r")
    await recovery
    assert.equal(host.ui.getEditorText(), options.text)
    await host.key("\x1b[122;9u")
    assert.equal(host.ui.getEditorText(), "")
    await host.key("\x1b[122;10u")
  } else {
    assert.equal(host.ui.getEditorText(), options.text)
    await host.key("\x1b[122;9u")
    assert.equal(host.ui.getEditorText(), options.text)
    await host.key("\x1b[122;10u")
  }
  assert.equal(host.ui.getEditorText(), options.text)
  if (options.attachments) {
    assert(
      (await host.output()).includes(
        `Attachments (${options.attachments.length}):`,
      ),
    )
    await Promise.all(
      options.attachments.map(async ({ path, data }) => {
        assert.deepEqual(await readFile(path), Buffer.from(data, "base64"))
      }),
    )
  }
  if (options.clearedText) {
    const recovery = host.session.sendUserMessage("/composer-recover", {
      expandPromptTemplates: true,
    })
    assert((await host.output()).includes("Recover draft"))
    for (let index = 0; index < (options.clearedIndex ?? 1); index++) {
      // oxlint-disable-next-line no-await-in-loop -- Navigate the native picker in order.
      await host.key("\x1b[B")
    }
    await host.key("\r")
    await recovery
    assert.equal(host.ui.getEditorText(), options.clearedText)
    await host.key("\x1b[122;9u")
    assert.equal(host.ui.getEditorText(), options.text)
  }
})
