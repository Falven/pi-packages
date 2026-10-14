import assert from "node:assert/strict"
import { promises as fs } from "node:fs"
import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises"
import { syncBuiltinESMExports } from "node:module"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { CustomEditor } from "@earendil-works/pi-coding-agent"
import { openNativeHost } from "../../../fixtures/native-host.ts"
import { fileReferences } from "../src/references.ts"
import { holdFileRead, retainedRequest } from "./native-pi.mjs"
import { findEditor, preclearProbe } from "./preclear-probe.mjs"

const PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAADUlEQVR4nGP4zwAE/wEHAAH/4iOeWQAAAABJRU5ErkJggg=="

function userText(request) {
  const message = request.messages.findLast((entry) => entry.role === "user")
  return typeof message.content === "string"
    ? message.content
    : message.content
        .filter((part) => part.type === "text")
        .map((part) => part.text)
        .join("\n")
}

for (const order of ["native", "before-composer", "after-composer"])
  for (const firstEnable of [false, true])
    test(`${order}: ${firstEnable ? "first enable during reload" : "fresh module reload"} captures before preview with hidden images and no repeated snapshots on redraw`, async (t) => {
      const directory = await mkdtemp(
        join(tmpdir(), "attachment-module-reload-"),
      )
      const path = join(directory, "probe.ts")
      const probePath = new URL("./preclear-probe.mjs", import.meta.url)
        .pathname
      const composerPath = new URL(
        "../../pi-composer/src/index.ts",
        import.meta.url,
      ).pathname
      const source = `import { randomUUID } from "node:crypto"\nimport { preclearProbe } from ${JSON.stringify(probePath)}\nconst token = randomUUID()\nexport default function (pi) { pi.on("session_start", () => pi.events.emit("send-probe-loaded", token)); preclearProbe()(pi) }\n`
      await writeFile(
        path,
        firstEnable ? "export default function () {}\n" : source,
      )
      const modules = new Set()
      let selected
      const host = await openNativeHost(t, {
        directory,
        noTools: "all",
        settings: { terminal: { showImages: false } },
        extensionPaths:
          order === "native"
            ? [path]
            : order === "before-composer"
              ? [path, composerPath]
              : [composerPath, path],
        extensionFactories: [
          (pi) => {
            pi.events.on("send-probe-loaded", (token) => modules.add(token))
            pi.on("session_start", (_event, ctx) =>
              ctx.ui.setWidget("observe-selected-editor", (tui) => {
                selected = () => findEditor(tui)
                return { render: () => [], invalidate() {} }
              }),
            )
          },
        ],
      })
      if (firstEnable) await writeFile(path, source)
      await host.reload()
      await host.frame()
      assert.equal(modules.size, firstEnable ? 1 : 2)
      assert.equal(
        selected().constructor.name,
        order === "native" ? "CustomEditor" : "SourceEditor",
      )
      const image = join(directory, "preview.png")
      await writeFile(image, Buffer.from(PNG, "base64"))
      const held = holdFileRead(t, image)
      host.ui.setEditorText("Inspect [image](preview.png)")
      await held.started()
      assert.doesNotMatch(await host.frame(), /\[Image: preview\.png/)
      await writeFile(image, "The source has changed")
      held.release()
      await t.waitFor(() => assert.match(host.ui.getEditorText(), /snapshot-/))
      await t.waitFor(async () =>
        assert.match(
          await host.frame(),
          /\[Image: preview\.png \[image\/png\] 2x1\]/,
        ),
      )
      const captured = host.ui.getEditorText()
      const [reference] = fileReferences(captured, directory)
      assert.deepEqual(
        await readFile(reference.path),
        Buffer.from(PNG, "base64"),
      )
      await host.frame()
      host.terminal.resize(100, 40)
      await host.frame()
      await host.type(" later")
      assert.equal(host.ui.getEditorText(), `${captured} later`)
      assert.equal(
        (await readdir(join(directory, "retained"))).filter((name) =>
          name.startsWith("snapshot-"),
        ).length,
        1,
      )
      await host.key("\r")
      await host.settled()
      const message = host.requests[0].messages.findLast(
        (entry) => entry.role === "user",
      )
      assert.equal(
        message.content.find((part) => part.type === "image_url").image_url.url,
        `data:image/png;base64,${PNG}`,
      )
      assert.ok(userText(host.requests[0]).includes(reference.path))
    })

for (const composer of [false, true])
  test(`${composer ? "composer" : "native"}: one Send waits for an existing capture and preserves later edits`, async (t) => {
    const host = await openNativeHost(t, {
      noTools: "all",
      extension: preclearProbe(),
      extensionPaths: composer
        ? [new URL("../../pi-composer/src/index.ts", import.meta.url).pathname]
        : [],
    })
    const source = join(host.directory, "source.txt")
    await writeFile(source, "captured before Send\n")
    const held = holdFileRead(t, source)
    const draft = "Inspect [note](source.txt)"
    await host.key(`\x1b[200~${draft}\x1b[201~`)
    await held.started()
    await host.key("\r")
    assert.equal(host.ui.getEditorText(), draft)
    assert.equal(host.requests.length, 0)
    await host.type(" later")
    await writeFile(source, "changed after capture started\n")
    held.release()
    await host.settled()
    const sent = userText(host.requests[0])
    assert.match(
      sent,
      /^Inspect \[note\]\(<.*\/snapshot-[^/]+\/source\.txt>\)$/,
    )
    assert.doesNotMatch(sent, / later$/)
    const [reference] = fileReferences(sent, host.directory)
    assert.equal(
      await readFile(reference.path, "utf8"),
      "captured before Send\n",
    )
    assert.equal(host.ui.getEditorText(), `${sent} later`)
    await host.type("!")
    assert.equal(host.ui.getEditorText(), `${sent} later!`)
  })

for (const composer of [false, true])
  for (const installation of ["recreated", "reused", "built-in"])
    test(`${composer ? "composer" : "native"}: a ${installation} selected editor keeps later input independent of the previous capture`, async (t) => {
      let selected
      const host = await openNativeHost(t, {
        noTools: "all",
        extension: preclearProbe(),
        extensionFactories: [
          (pi) =>
            pi.on("session_start", (_event, ctx) =>
              ctx.ui.setWidget("observe-replacement-editor", (tui) => {
                selected = () => findEditor(tui)
                return { render: () => [], invalidate() {} }
              }),
            ),
        ],
        extensionPaths: composer
          ? [
              new URL("../../pi-composer/src/index.ts", import.meta.url)
                .pathname,
            ]
          : [],
      })
      if (!composer) {
        host.ui.setEditorComponent((...args) => new CustomEditor(...args))
        await host.key("")
      }
      const previous = selected()
      const factory =
        host.ui.getEditorComponent() ?? ((...args) => new CustomEditor(...args))
      const source = join(host.directory, "source.txt")
      await writeFile(source, "Previous editor capture")
      const held = holdFileRead(t, source)
      const original = "Previous [file](source.txt)"
      host.ui.setEditorText(original)
      await held.started()
      host.ui.setEditorComponent(
        installation === "built-in"
          ? undefined
          : installation === "reused"
            ? () => previous
            : factory,
      )
      host.ui.setEditorText("Current draft")
      await host.key("\x1b[D")
      if (installation === "reused") assert.equal(selected(), previous)
      else assert.notEqual(selected(), previous)
      held.release()
      const recovery = await t.waitFor(async () =>
        retainedRequest({ agentDir: host.directory }, original),
      )
      const first = fileReferences(
        recovery.text,
        host.directory,
        join(host.directory, "retained"),
      ).find(({ path }) => path.includes("/snapshot-"))
      assert.ok(first)
      assert.equal(
        await readFile(first.path, "utf8"),
        "Previous editor capture",
      )
      assert.equal(host.ui.getEditorText(), "Current draft")
      await host.type("!")
      assert.equal(host.ui.getEditorText(), "Current draf!t")
      await writeFile(source, "New editor capture")
      host.ui.setEditorText("New [file](source.txt)")
      await t.waitFor(() => assert.match(host.ui.getEditorText(), /snapshot-/))
      const captured = host.ui.getEditorText()
      const [latest] = fileReferences(captured, host.directory)
      assert.notEqual(latest.path, first.path)
      assert.equal(await readFile(latest.path, "utf8"), "New editor capture")
      await host.key(
        composer && installation !== "built-in" ? "\x1b[122;9u" : "\x1b[45;5u",
      )
      assert.equal(host.ui.getEditorText(), "New [file](source.txt)")
      await host.key("\r")
      await host.settled()
      assert.equal(userText(host.requests[0]), captured)
    })

for (const composer of [false, true])
  for (const custom of [false, true])
    test(`${composer ? "composer" : "native"}: capture survives a ${custom ? "custom" : "native"} dialog without recapturing changed source`, async (t) => {
      const host = await openNativeHost(t, {
        noTools: "all",
        extension: preclearProbe(),
        extensionPaths: composer
          ? [
              new URL("../../pi-composer/src/index.ts", import.meta.url)
                .pathname,
            ]
          : [],
      })
      const source = join(host.directory, "source.txt")
      await writeFile(source, "First captured contents")
      const held = holdFileRead(t, source)
      host.ui.setEditorText("Inspect [note](source.txt)")
      await held.started()
      let close
      const dialog = custom
        ? host.ui.custom((_tui, _theme, _keys, done) => {
            close = done
            return {
              render: () => ["Temporary custom dialog"],
              invalidate() {},
              handleInput() {},
            }
          })
        : host.ui.editor("Temporary native dialog", "Separate text")
      await t.waitFor(async () =>
        assert.match(await host.frame(), /Temporary (?:custom|native) dialog/),
      )
      held.release()
      await t.waitFor(() => assert.match(host.ui.getEditorText(), /snapshot-/))
      const captured = host.ui.getEditorText()
      await writeFile(source, "Changed before closing dialog")
      if (custom) close()
      else await host.key("\x1b")
      await dialog
      assert.equal(host.ui.getEditorText(), captured)
      const [reference] = fileReferences(captured, host.directory)
      assert.equal(
        await readFile(reference.path, "utf8"),
        "First captured contents",
      )
      assert.equal(
        (await readdir(join(host.directory, "retained"))).filter((name) =>
          name.startsWith("snapshot-"),
        ).length,
        1,
      )
      await host.key(composer ? "\x1b[122;9u" : "\x1b[45;5u")
      assert.equal(host.ui.getEditorText(), "Inspect [note](source.txt)")
      await host.key("\r")
      await host.settled()
      assert.equal(userText(host.requests[0]), captured)
    })

for (const composer of [false, true])
  test(`${composer ? "composer" : "native"}: a custom dialog restores its original capture after an unrelated draft replacement`, async (t) => {
    const host = await openNativeHost(t, {
      noTools: "all",
      extension: preclearProbe(),
      extensionPaths: composer
        ? [new URL("../../pi-composer/src/index.ts", import.meta.url).pathname]
        : [],
    })
    const source = join(host.directory, "source.txt")
    await writeFile(source, "The original snapshot")
    const held = holdFileRead(t, source)
    const original = "Inspect [note](source.txt)"
    host.ui.setEditorText(original)
    await held.started()
    let close
    const dialog = host.ui.custom((_tui, _theme, _keys, done) => {
      close = done
      return {
        render: () => ["Replacement dialog"],
        invalidate() {},
        handleInput() {},
      }
    })
    await t.waitFor(async () =>
      assert.match(await host.frame(), /Replacement dialog/),
    )
    host.ui.setEditorText("Unrelated replacement")
    held.release()
    const recovery = await t.waitFor(async () =>
      retainedRequest({ agentDir: host.directory }, original),
    )
    const reference = fileReferences(
      recovery.text,
      host.directory,
      join(host.directory, "retained"),
    ).find(({ path }) => path.includes("/snapshot-"))
    assert.ok(reference)
    assert.equal(host.ui.getEditorText(), "Unrelated replacement")
    await writeFile(source, "Source changed after capture")
    close()
    await dialog
    await t.waitFor(() =>
      assert.ok(host.ui.getEditorText().includes(reference.path)),
    )
    assert.equal(
      await readFile(reference.path, "utf8"),
      "The original snapshot",
    )
    assert.equal(
      (await readdir(join(host.directory, "retained"))).filter((name) =>
        name.startsWith("snapshot-"),
      ).length,
      1,
    )
    await host.key(composer ? "\x1b[122;9u" : "\x1b[45;5u")
    assert.equal(host.ui.getEditorText(), original)
    await host.key("\r")
    await host.settled()
    assert.ok(userText(host.requests[0]).includes(reference.path))
  })

for (const split of ["inside", "typed tail", "second paste"])
  test(`native: a destination ${split} a real collapsed paste preserves typing and undo`, async (t) => {
    let editor
    const host = await openNativeHost(t, {
      noTools: "all",
      extension: (pi) => {
        preclearProbe()(pi)
        pi.on("session_start", (_event, ctx) =>
          ctx.ui.setWidget("observe-editor", (tui) => {
            editor = findEditor(tui)
            return { render: () => [], invalidate() {} }
          }),
        )
      },
    })
    const source = join(host.directory, "source.txt")
    await writeFile(source, "Captured inside paste")
    const held = holdFileRead(t, source)
    const prefix = "Plain text ".repeat(140)
    const suffix = split === "second paste" ? " ending".repeat(160) : ""
    const original = `${prefix}[file](source.txt) tail${suffix}`
    if (split === "inside") await host.key(`\x1b[200~${original}\x1b[201~`)
    else {
      await host.key(`\x1b[200~${prefix}[file](sour\x1b[201~`)
      assert.match(editor.getText(), /^\[paste #1 \d+ chars\]$/)
      if (split === "typed tail") await host.type("ce.txt) tail")
      else await host.key(`\x1b[200~ce.txt) tail${suffix}\x1b[201~`)
    }
    await held.started()
    const raw = editor.getText()
    assert.match(raw, /^\[paste #1 \d+ chars\]/)
    if (split === "second paste") assert.match(raw, /\[paste #2 \d+ chars\]$/)
    assert.equal(host.ui.getEditorText(), original)
    held.release()
    await t.waitFor(() => assert.match(host.ui.getEditorText(), /snapshot-/))
    const captured = host.ui.getEditorText()
    await host.type("!")
    assert.equal(host.ui.getEditorText(), `${captured}!`)
    await host.key("\x1b[45;5u")
    await host.key("\x1b[45;5u")
    assert.equal(host.ui.getEditorText(), original)
    assert.equal(editor.getText(), raw)
  })

for (const composer of [false, true])
  test(`${composer ? "composer" : "native"}: delayed capture preserves caret or selection and undo`, async (t) => {
    const host = await openNativeHost(t, {
      noTools: "all",
      extension: preclearProbe(),
      extensionPaths: composer
        ? [new URL("../../pi-composer/src/index.ts", import.meta.url).pathname]
        : [],
    })
    const source = join(host.directory, "source.txt")
    await writeFile(source, "Captured selection")
    const held = holdFileRead(t, source)
    const original = "😀 [file](source.txt) tail!"
    host.ui.setEditorText(original.slice(0, -1))
    await held.started()
    await host.type("!")
    await host.key(composer ? "\x1b[1;2D" : "\x1b[D")
    await host.key(composer ? "\x1b[1;2D" : "\x1b[D")
    held.release()
    await t.waitFor(() => assert.match(host.ui.getEditorText(), /snapshot-/))
    const captured = host.ui.getEditorText()
    await host.type("chosen")
    assert.equal(
      host.ui.getEditorText(),
      `${captured.slice(0, -2)}chosen${composer ? "" : "l!"}`,
    )
    const undo = composer ? "\x1b[122;9u" : "\x1b[45;5u"
    await host.key(undo)
    assert.equal(host.ui.getEditorText(), captured)
    await host.key(undo)
    assert.equal(host.ui.getEditorText(), original)
    if (composer) {
      await host.key("\x1b[122;10u")
      assert.equal(host.ui.getEditorText(), captured)
    }
  })

for (const composer of [false, true])
  test(`${composer ? "composer" : "native"}: undo and Send reuse the captured occurrence after the source changes`, async (t) => {
    const host = await openNativeHost(t, {
      noTools: "all",
      extension: preclearProbe(),
      extensionPaths: composer
        ? [new URL("../../pi-composer/src/index.ts", import.meta.url).pathname]
        : [],
    })
    const source = join(host.directory, "source.txt")
    await writeFile(source, "Original bytes")
    const original = "Read [note](source.txt)"
    host.ui.setEditorText(original)
    await t.waitFor(() => assert.match(host.ui.getEditorText(), /snapshot-/))
    const captured = host.ui.getEditorText()
    await writeFile(source, "Changed bytes")
    await host.key(composer ? "\x1b[122;9u" : "\x1b[45;5u")
    assert.equal(host.ui.getEditorText(), original)
    await host.key("\r")
    await host.settled()
    assert.equal(userText(host.requests[0]), captured)
    const [reference] = fileReferences(captured, host.directory)
    assert.equal(await readFile(reference.path, "utf8"), "Original bytes")
  })

for (const composer of [false, true])
  for (const route of ["steering", "follow-up"])
    test(`${composer ? "composer" : "native"} ${route}: a run ending during capture preserves the frozen request and later draft`, async (t) => {
      const host = await openNativeHost(t, {
        noTools: "all",
        holdResponses: true,
        extension: preclearProbe(),
        extensionPaths: composer
          ? [
              new URL("../../pi-composer/src/index.ts", import.meta.url)
                .pathname,
            ]
          : [],
      })
      host.ui.setEditorText("Original run")
      await host.key("\r")
      await t.waitFor(() => assert.equal(host.requests.length, 1))
      const source = join(host.directory, "source.txt")
      await writeFile(source, "prepared for the original request")
      const held = holdFileRead(t, source)
      host.ui.setEditorText("Waited [note](source.txt)")
      await held.started()
      await host.key(route === "follow-up" ? "\x1b\r" : "\r")
      host.ui.setEditorText("Later draft")
      host.reply()
      await host.settled()
      held.release()
      await t.waitFor(() => assert.equal(host.requests.length, 2))
      assert.match(userText(host.requests[1]), /^Waited \[note\]\(<.*snapshot-/)
      assert.equal(host.ui.getEditorText(), "Later draft")
      host.reply()
      await host.settled()
      assert.equal(host.ui.getEditorText(), "Later draft")
    })

for (const composer of [false, true])
  for (const route of ["normal", "steering", "follow-up"])
    test(`${composer ? "composer" : "native"} ${route}: preparation failure retains the request and lets later text continue`, async (t) => {
      const host = await openNativeHost(t, {
        noTools: "all",
        holdResponses: true,
        extension: preclearProbe(),
        extensionPaths: composer
          ? [
              new URL("../../pi-composer/src/index.ts", import.meta.url)
                .pathname,
            ]
          : [],
      })
      if (route !== "normal") {
        host.ui.setEditorText("Original run")
        await host.key("\r")
        await t.waitFor(() => assert.equal(host.requests.length, 1))
      }
      const broken = Buffer.from(PNG, "base64").subarray(0, 33)
      await writeFile(join(host.directory, "broken.png"), broken)
      host.ui.setEditorText("Failed [image](broken.png)")
      await t.waitFor(() => assert.match(host.ui.getEditorText(), /snapshot-/))
      const failed = host.ui.getEditorText()
      const [reference] = fileReferences(failed, host.directory)
      const held = holdFileRead(t, reference.path)
      const send = route === "follow-up" ? "\x1b\r" : "\r"
      await host.key(send)
      await held.started()
      assert.equal(host.ui.getEditorText(), failed)
      host.ui.setEditorText("Second text")
      await host.key(send)
      host.ui.setEditorText("Later untouched draft")
      held.release()
      await t.waitFor(async () =>
        assert.match(await host.output(), /Attachment request not sent/),
      )
      const recovery = await retainedRequest(
        { agentDir: host.directory },
        failed,
      )
      assert.ok(recovery.text.includes(failed))
      assert.deepEqual(await readFile(reference.path), broken)
      if (route !== "normal") host.reply()
      await t.waitFor(() =>
        assert.equal(host.requests.length, route === "normal" ? 1 : 2),
      )
      assert.equal(userText(host.requests.at(-1)), "Second text")
      host.reply()
      await host.settled()
      assert.equal(host.requests.length, route === "normal" ? 1 : 2)
      assert.equal(host.ui.getEditorText(), "Later untouched draft")
    })

for (const composer of [false, true])
  test(`${composer ? "composer" : "native"}: a normal Send stays normal when unrelated work starts during capture`, async (t) => {
    const host = await openNativeHost(t, {
      noTools: "all",
      holdResponses: true,
      extension: preclearProbe(),
      extensionPaths: composer
        ? [new URL("../../pi-composer/src/index.ts", import.meta.url).pathname]
        : [],
      extensionFactories: [
        (pi) =>
          pi.on("input", (event) => ({
            action: "transform",
            text: `${event.streamingBehavior ?? "normal"}: ${event.text}`,
          })),
      ],
    })
    const source = join(host.directory, "source.txt")
    await writeFile(source, "frozen request")
    const held = holdFileRead(t, source)
    host.ui.setEditorText("First [note](source.txt)")
    await held.started()
    await host.key("\r")
    host.ui.setEditorText("Later untouched draft")
    const unrelated = host.session.prompt("Unrelated work")
    await t.waitFor(() => assert.equal(host.requests.length, 1))
    held.release()
    await t.waitFor(async () =>
      assert.match(await host.frame(), /Waiting for Pi to finish/),
    )
    assert.equal(host.requests.length, 1)
    assert.equal(host.ui.getEditorText(), "Later untouched draft")
    host.reply()
    await unrelated
    await t.waitFor(() => assert.equal(host.requests.length, 2))
    assert.match(
      userText(host.requests[1]),
      /^normal: First \[note\]\(<.*snapshot-/,
    )
    host.reply()
    await host.settled()
    assert.equal(host.ui.getEditorText(), "Later untouched draft")
  })

for (const composer of [false, true])
  test(`${composer ? "composer" : "native"}: a normal Send resumes after unrelated manual compaction and its asynchronous handlers`, async (t) => {
    let compacted = false
    let releaseCompacted
    const compactedHandler = new Promise((resolve) => {
      releaseCompacted = resolve
    })
    t.after(releaseCompacted)
    const host = await openNativeHost(t, {
      noTools: "all",
      holdResponses: true,
      extension: preclearProbe(),
      settings: { compaction: { enabled: false, keepRecentTokens: 10 } },
      extensionFactories: [
        (pi) =>
          pi.on("session_compact", async () => {
            compacted = true
            await compactedHandler
          }),
      ],
      extensionPaths: composer
        ? [new URL("../../pi-composer/src/index.ts", import.meta.url).pathname]
        : [],
    })
    /* eslint-disable no-await-in-loop -- Compaction requires completed prior turns. */
    for (let turn = 1; turn <= 2; turn++) {
      host.ui.setEditorText(`Turn ${turn}: ${"Earlier context ".repeat(200)}`)
      await host.key("\r")
      await t.waitFor(() => assert.equal(host.requests.length, turn))
      host.reply()
      await host.settled()
    }
    /* eslint-enable no-await-in-loop */
    await writeFile(
      join(host.directory, "source.txt"),
      "Captured before compaction",
    )
    const held = holdFileRead(t, join(host.directory, "source.txt"))
    host.ui.setEditorText("Normal [file](source.txt)")
    await held.started()
    await host.key("\r")
    host.ui.setEditorText("Later draft")
    const compaction = host.session.compact()
    let compactionError
    void compaction.catch((error) => {
      compactionError = error
    })
    await t.waitFor(() => {
      assert.ifError(compactionError)
      assert.equal(host.requests.length, 3)
    })
    held.release()
    await t.waitFor(async () =>
      assert.match(await host.output(), /Waiting for Pi to finish/),
    )
    host.reply()
    await t.waitFor(() => assert.ok(compacted))
    assert.equal(host.session.isCompacting, true)
    assert.equal(host.requests.length, 3)
    releaseCompacted()
    await compaction
    await t.waitFor(() => assert.equal(host.requests.length, 4))
    assert.match(
      userText(host.requests.at(-1)),
      /^Normal \[file\]\(<.*snapshot-/,
    )
    assert.equal(host.ui.getEditorText(), "Later draft")
    host.reply()
    await host.settled()
  })

for (const composer of [false, true])
  test(`${composer ? "composer" : "native"} normal: required image preparation keeps the draft until one Send is ready`, async (t) => {
    const host = await openNativeHost(t, {
      noTools: "all",
      extension: preclearProbe(),
      extensionPaths: composer
        ? [new URL("../../pi-composer/src/index.ts", import.meta.url).pathname]
        : [],
    })
    await writeFile(
      join(host.directory, "image.png"),
      Buffer.from(PNG, "base64"),
    )
    await host.key("\x1b[200~Inspect [image](image.png)\x1b[201~")
    await t.waitFor(() => assert.match(host.ui.getEditorText(), /snapshot-/))
    const draft = host.ui.getEditorText()
    const [reference] = fileReferences(draft, host.directory)
    const held = holdFileRead(t, reference.path)
    await host.key("\r")
    await held.started()
    assert.equal(host.ui.getEditorText(), draft)
    assert.equal(host.requests.length, 0)
    held.release()
    await host.settled()
    assert.equal(host.ui.getEditorText(), "")
    const message = host.requests[0].messages.findLast(
      (entry) => entry.role === "user",
    )
    assert.equal(
      message.content.filter((part) => part.type === "image_url").length,
      1,
    )
  })

for (const composer of [false, true])
  for (const route of ["normal", "steering", "follow-up"])
    test(`${composer ? "composer" : "native"} ${route}: later text waits behind image preparation and an earlier input handler`, async (t) => {
      const inputGate = Promise.withResolvers()
      t.after(() => inputGate.resolve())
      let firstAtHandler = false
      const inputs = []
      const host = await openNativeHost(t, {
        noTools: "all",
        holdResponses: true,
        extension: preclearProbe(),
        extensionPaths: composer
          ? [
              new URL("../../pi-composer/src/index.ts", import.meta.url)
                .pathname,
            ]
          : [],
        extensionFactories: [
          (pi) =>
            pi.on("input", async (event) => {
              if (!/^(First|Second)/.test(event.text)) return undefined
              if (event.text.startsWith("First")) {
                firstAtHandler = true
                await inputGate.promise
              }
              inputs.push(event.text)
              return {
                action: "transform",
                text: `accepted ${event.streamingBehavior ?? "normal"}: ${event.text}`,
                images: event.text.startsWith("First")
                  ? [{ type: "image", data: PNG, mimeType: "image/png" }]
                  : undefined,
              }
            }),
        ],
      })
      if (route !== "normal") {
        host.ui.setEditorText("Keep the original run active")
        await host.key("\r")
        await t.waitFor(() => assert.equal(host.requests.length, 1))
      }
      await writeFile(
        join(host.directory, "image.png"),
        Buffer.from(PNG, "base64"),
      )
      host.ui.setEditorText("First [image](image.png)")
      await t.waitFor(() => assert.match(host.ui.getEditorText(), /snapshot-/))
      const [reference] = fileReferences(
        host.ui.getEditorText(),
        host.directory,
      )
      const held = holdFileRead(t, reference.path)
      const send = route === "follow-up" ? "\x1b\r" : "\r"
      await host.key(send)
      await held.started()
      host.ui.setEditorText("Second text")
      await host.key(send)
      assert.equal(firstAtHandler, false)
      assert.deepEqual(inputs, [])
      held.release()
      await t.waitFor(() => assert.equal(firstAtHandler, true))
      assert.deepEqual(
        inputs,
        [],
        "The later text must not bypass the earlier input handler",
      )
      inputGate.resolve()
      if (route === "normal") {
        await t.waitFor(() => assert.equal(host.requests.length, 1))
        host.reply()
        await t.waitFor(() => assert.equal(host.requests.length, 2))
        host.reply()
      } else {
        await t.waitFor(() => assert.equal(inputs.length, 2))
        host.reply()
        await t.waitFor(() => assert.equal(host.requests.length, 2))
        host.reply()
        await t.waitFor(() => assert.equal(host.requests.length, 3))
        host.reply()
      }
      await host.settled()
      assert.match(inputs[0], /^First /)
      assert.equal(inputs[1], "Second text")
      const first = host.requests[route === "normal" ? 0 : 1]
      const second = host.requests.at(-1)
      const delivery =
        route === "steering"
          ? "steer"
          : route === "follow-up"
            ? "followUp"
            : "normal"
      assert.match(userText(first), new RegExp(`^accepted ${delivery}: First `))
      assert.equal(userText(second), `accepted ${delivery}: Second text`)
      const message = first.messages.findLast((entry) => entry.role === "user")
      assert.equal(
        message.content.filter((part) => part.type === "image_url").length,
        2,
      )
    })

for (const composer of [false, true])
  for (const route of ["normal", "steering", "follow-up"])
    test(`${composer ? "composer" : "native"} ${route}: identical drafts retain distinct captures when completion reverses and an earlier input is consumed`, async (t) => {
      const first = Promise.withResolvers()
      const second = Promise.withResolvers()
      t.after(() => {
        first.resolve()
        second.resolve()
      })
      const inputs = []
      const host = await openNativeHost(t, {
        noTools: "all",
        holdResponses: true,
        extension: preclearProbe(),
        extensionPaths: composer
          ? [
              new URL("../../pi-composer/src/index.ts", import.meta.url)
                .pathname,
            ]
          : [],
        extensionFactories: [
          (pi) =>
            pi.on("input", async (event) => {
              if (!event.text.startsWith("Read ")) return undefined
              inputs.push(event.text)
              await Promise.resolve()
              return inputs.length === 1
                ? { action: "handled" }
                : {
                    action: "transform",
                    text: `accepted ${event.streamingBehavior ?? "normal"}: ${event.text}`,
                  }
            }),
        ],
      })
      if (route !== "normal") {
        host.ui.setEditorText("Original run")
        await host.key("\r")
        await t.waitFor(() => assert.equal(host.requests.length, 1))
      }
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
      const source = join(host.directory, "same.txt")
      const send = route === "follow-up" ? "\x1b\r" : "\r"
      await writeFile(source, "First captured bytes")
      host.ui.setEditorText(original)
      await t.waitFor(() => assert.equal(captures.length, 1))
      await host.key(send)
      await writeFile(source, "Second captured bytes")
      host.ui.setEditorText(original)
      await t.waitFor(() => assert.equal(captures.length, 2))
      await host.key(send)
      host.ui.setEditorText("Later unrelated draft")
      second.resolve()
      await host.key("\x1b[D")
      assert.deepEqual(inputs, [])
      first.resolve()
      await t.waitFor(() => assert.equal(inputs.length, 2))
      const submitted = captures.map((path) => `Read [same](<${path}>)`)
      assert.deepEqual(inputs, submitted)
      assert.equal(await readFile(captures[0], "utf8"), "First captured bytes")
      assert.equal(await readFile(captures[1], "utf8"), "Second captured bytes")
      if (route !== "normal") host.reply()
      await t.waitFor(() =>
        assert.equal(host.requests.length, route === "normal" ? 1 : 2),
      )
      const behavior =
        route === "steering"
          ? "steer"
          : route === "follow-up"
            ? "followUp"
            : "normal"
      assert.equal(
        userText(host.requests.at(-1)),
        `accepted ${behavior}: ${submitted[1]}`,
      )
      host.reply()
      await host.settled()
      assert.equal(host.ui.getEditorText(), "Later unrelated draft")
      await host.type("!")
      assert.equal(host.ui.getEditorText(), "Later unrelated draf!t")
      host.ui.setEditorText("")
      await host.key("\x1b[A")
      assert.equal(host.ui.getEditorText(), submitted[1])
      await host.key("\x1b[A")
      assert.equal(host.ui.getEditorText(), submitted[0])
    })

for (const composer of [false, true])
  for (const transition of ["session", "reload"])
    test(`${composer ? "composer" : "native"}: ${transition} cancels a waiting Send and retains its capture without touching the current draft`, async (t) => {
      const host = await openNativeHost(t, {
        noTools: "all",
        extension: preclearProbe(),
        extensionPaths: composer
          ? [
              new URL("../../pi-composer/src/index.ts", import.meta.url)
                .pathname,
            ]
          : [],
      })
      const source = join(host.directory, "previous.txt")
      await writeFile(source, "Previous session bytes")
      const oldSession = host.session.sessionManager.getSessionId()
      const held = holdFileRead(t, source)
      const original = "Previous [file](previous.txt)"
      host.ui.setEditorText(original)
      await held.started()
      await host.key("\r")
      assert.equal(host.ui.getEditorText(), original)
      if (transition === "session") await host.runtime.newSession()
      else await host.reload()
      host.ui.setEditorText("Current draft")
      await host.key("\x1b[D")
      held.release()
      const recovery = await t.waitFor(async () =>
        retainedRequest({ agentDir: host.directory }, `Session: ${oldSession}`),
      )
      const reference = fileReferences(
        recovery.text,
        host.directory,
        join(host.directory, "retained"),
      ).find(({ path }) => path.includes("/snapshot-"))
      assert.ok(reference)
      assert.ok(recovery.text.includes(original))
      assert.ok(recovery.text.includes(`Session: ${oldSession}`))
      await t.waitFor(async () =>
        assert.equal(
          await readFile(reference.path, "utf8"),
          "Previous session bytes",
        ),
      )
      assert.equal(host.requests.length, 0)
      assert.equal(host.ui.getEditorText(), "Current draft")
      await host.type("!")
      assert.equal(host.ui.getEditorText(), "Current draf!t")
      await host.key("\r")
      await host.settled()
      assert.equal(host.requests.length, 1)
      assert.equal(userText(host.requests[0]), "Current draf!t")
      host.ui.setEditorText("")
      await host.key("\x1b[A")
      assert.equal(host.ui.getEditorText(), "Current draf!t")
      await host.key("\x1b[A")
      assert.equal(host.ui.getEditorText(), "Current draf!t")
      await host.close()
      assert.equal(
        await readFile(reference.path, "utf8"),
        "Previous session bytes",
      )
      assert.equal(await readFile(recovery.path, "utf8"), recovery.text)
    })

for (const composer of [false, true])
  test(`${composer ? "composer" : "native"}: prompt-history return preserves a captured draft identity after undo`, async (t) => {
    const host = await openNativeHost(t, {
      noTools: "all",
      extension: preclearProbe(),
      keybindings: {
        "tui.editor.historyPrevious": "alt+up",
        "tui.editor.historyNext": "alt+down",
      },
      extensionPaths: composer
        ? [new URL("../../pi-composer/src/index.ts", import.meta.url).pathname]
        : [],
    })
    host.ui.setEditorText("Earlier request")
    await host.key("\r")
    await host.settled()
    const source = join(host.directory, "source.txt")
    await writeFile(source, "First snapshot")
    const original = "Current [file](source.txt)"
    host.ui.setEditorText(original)
    await t.waitFor(() => assert.match(host.ui.getEditorText(), /snapshot-/))
    const captured = host.ui.getEditorText()
    await host.key(composer ? "\x1b[122;9u" : "\x1b[45;5u")
    assert.equal(host.ui.getEditorText(), original)
    await writeFile(source, "Changed source")
    await host.key("\x1b[1;3A")
    assert.equal(host.ui.getEditorText(), "Earlier request")
    await host.key("\x1b[1;3B")
    assert.equal(host.ui.getEditorText(), original)
    await host.key("\r")
    await t.waitFor(() => assert.equal(host.requests.length, 2))
    await host.settled()
    assert.equal(userText(host.requests.at(-1)), captured)
    const [reference] = fileReferences(captured, host.directory)
    assert.equal(await readFile(reference.path, "utf8"), "First snapshot")
  })

for (const composer of [false, true])
  test(`${composer ? "composer" : "native"}: a typed /reload is not trapped behind a waiting model Send`, async (t) => {
    let starts = 0
    const host = await openNativeHost(t, {
      noTools: "all",
      extension: (pi) => {
        preclearProbe()(pi)
        pi.on("session_start", () => {
          starts++
        })
      },
      extensionPaths: composer
        ? [new URL("../../pi-composer/src/index.ts", import.meta.url).pathname]
        : [],
    })
    const source = join(host.directory, "source.txt")
    await writeFile(source, "Retain during reload")
    const held = holdFileRead(t, source)
    try {
      host.ui.setEditorText("Waiting [file](source.txt)")
      await held.started()
      await host.key("\r")
      host.ui.setEditorText("/reload")
      await host.key("\r")
      await t.waitFor(() => assert.equal(starts, 2))
      host.ui.setEditorText("New lifetime")
      held.release()
      await t.waitFor(async () =>
        retainedRequest(
          { agentDir: host.directory },
          "Waiting [file](source.txt)",
        ),
      )
      assert.equal(host.requests.length, 0)
      assert.equal(host.ui.getEditorText(), "New lifetime")
    } finally {
      held.release()
    }
  })

for (const composer of [false, true])
  for (const text of ["/reload later", "/not-a-command", "/skill:missing"])
    test(`${composer ? "composer" : "native"}: ${text} stays behind an earlier prepared model request`, async (t) => {
      const inputs = []
      const host = await openNativeHost(t, {
        noTools: "all",
        holdResponses: true,
        extension: preclearProbe(),
        extensionFactories: [
          (pi) =>
            pi.on("input", (event) => {
              inputs.push(event.text)
            }),
        ],
        extensionPaths: composer
          ? [
              new URL("../../pi-composer/src/index.ts", import.meta.url)
                .pathname,
            ]
          : [],
      })
      const source = join(host.directory, "source.txt")
      await writeFile(source, "Earlier capture")
      const held = holdFileRead(t, source)
      host.ui.setEditorText("First [file](source.txt)")
      await held.started()
      await host.key("\r")
      host.ui.setEditorText(text)
      await host.key("\r")
      assert.deepEqual(inputs, [])
      held.release()
      await t.waitFor(() => assert.equal(host.requests.length, 1))
      assert.match(userText(host.requests[0]), /^First \[file\]\(<.*snapshot-/)
      host.reply()
      await t.waitFor(() => assert.equal(host.requests.length, 2))
      assert.equal(userText(host.requests[1]), text)
      host.reply()
      await host.settled()
    })

for (const composer of [false, true])
  test(`${composer ? "composer" : "native"}: streaming follow-up treats /reload as ordered message text`, async (t) => {
    const inputs = []
    const host = await openNativeHost(t, {
      noTools: "all",
      holdResponses: true,
      extension: preclearProbe(),
      extensionFactories: [
        (pi) =>
          pi.on("input", (event) => {
            inputs.push(event.text)
          }),
      ],
      extensionPaths: composer
        ? [new URL("../../pi-composer/src/index.ts", import.meta.url).pathname]
        : [],
    })
    host.ui.setEditorText("Original run")
    await host.key("\r")
    await t.waitFor(() => assert.equal(host.requests.length, 1))
    const source = join(host.directory, "source.txt")
    await writeFile(source, "Earlier capture")
    const held = holdFileRead(t, source)
    host.ui.setEditorText("First [file](source.txt)")
    await held.started()
    await host.key("\x1b\r")
    host.ui.setEditorText("/reload")
    await host.key("\x1b\r")
    assert.deepEqual(inputs, ["Original run"])
    held.release()
    await t.waitFor(() => assert.equal(inputs.length, 3))
    assert.equal(inputs[2], "/reload")
    host.reply()
    await t.waitFor(() => assert.equal(host.requests.length, 2))
    host.reply()
    await t.waitFor(() => assert.equal(host.requests.length, 3))
    assert.equal(userText(host.requests[2]), "/reload")
    host.reply()
    await host.settled()
  })

for (const composer of [false, true])
  test(`${composer ? "composer" : "native"}: follow-up /reload stays message text after its run ends and earlier preparation fails`, async (t) => {
    let starts = 0
    const inputs = []
    const host = await openNativeHost(t, {
      noTools: "all",
      holdResponses: true,
      extension: preclearProbe(),
      extensionFactories: [
        (pi) => {
          pi.on("session_start", () => {
            starts++
          })
          pi.on("input", (event) => {
            inputs.push(event.text)
          })
        },
      ],
      extensionPaths: composer
        ? [new URL("../../pi-composer/src/index.ts", import.meta.url).pathname]
        : [],
    })
    host.ui.setEditorText("Original run")
    await host.key("\r")
    await t.waitFor(() => assert.equal(host.requests.length, 1))
    await writeFile(
      join(host.directory, "broken.png"),
      Buffer.from(PNG, "base64").subarray(0, 33),
    )
    host.ui.setEditorText("Failed [image](broken.png)")
    await t.waitFor(() => assert.match(host.ui.getEditorText(), /snapshot-/))
    const failed = host.ui.getEditorText()
    const [reference] = fileReferences(failed, host.directory)
    const held = holdFileRead(t, reference.path)
    await host.key("\x1b\r")
    await held.started()
    host.ui.setEditorText("/reload")
    await host.key("\x1b\r")
    host.ui.setEditorText("Later untouched draft")
    host.reply()
    await host.settled()
    assert.deepEqual(inputs, ["Original run"])
    held.release()
    await t.waitFor(() => assert.ok(starts > 1 || host.requests.length === 2))
    assert.equal(
      starts,
      1,
      "The original follow-up is message text, not a native reload command",
    )
    assert.equal(userText(host.requests[1]), "/reload")
    assert.deepEqual(inputs, ["Original run", "/reload"])
    assert.equal(host.ui.getEditorText(), "Later untouched draft")
    const recovery = await retainedRequest({ agentDir: host.directory }, failed)
    assert.ok(recovery.text.includes(failed))
    host.reply()
    await host.settled()
  })
