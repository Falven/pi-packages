import assert from "node:assert/strict"
import { test } from "node:test"
import { openHost } from "./host.ts"

const options: {
  directory: string
  sessionFile: string
  text: string
  recover?: boolean
} = JSON.parse(process.argv[2]!)

test("a fresh Pi process restores the saved draft", async (t) => {
  const host = await openHost(t, options)
  assert.equal(host.runtime.cwd, host.session.sessionManager.getCwd())
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
})
