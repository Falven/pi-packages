import assert from "node:assert/strict"
import { readFile, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { test } from "node:test"
import { openHost } from "../fixtures/host.ts"

const attachments = new URL(
  "../../pi-attachments/src/index.ts",
  import.meta.url,
).pathname

const imageData =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg=="

for (const mode of ["normal", "steer", "followUp"] as const) {
  test(`failed native ${mode} submission remains recoverable without losing a later draft`, async (t) => {
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
            images: [{ type: "image", data: imageData, mimeType: "image/png" }],
          }
        })
        pi.on("input", (event) => ({
          action: "transform",
          text: `Transformed: ${event.text}`,
        }))
      },
    })
    if (mode !== "normal") {
      host.ui.setEditorText("Start a controlled turn")
      await host.key("\r")
      await t.waitFor(() => assert.equal(host.requests.length, 1))
    }
    const source = join(host.directory, "original.txt")
    await writeFile(source, "Captured before submission.\n\tExact bytes.\r\n")
    host.ui.setEditorText("  Original request\t\n")
    await host.session.sendUserMessage(`/attach-file ${source}`, {
      expandPromptTemplates: true,
    })
    const original = host.ui.getEditorText()
    const snapshot = /\[Attachment: original.txt\]\(<([^>]+)>\)/.exec(
      original,
    )?.[1]
    assert(
      snapshot,
      "The native attachment action must insert a retained reference",
    )
    await rm(source)

    await host.key(mode === "followUp" ? "\x1b\r" : "\r")
    if (mode === "normal") {
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
    if (mode !== "normal") {
      host.reply(200)
      await t.waitFor(() => assert.equal(host.requests.length, 2))
    }
    host.reply()
    await host.settled()
    assert.deepEqual(
      sources,
      mode === "normal"
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
    await t.waitFor(async () =>
      assert(
        (await host.output()).includes("Recover draft"),
        "Recovery must offer the cleared draft",
      ),
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
