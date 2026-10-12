import assert from "node:assert/strict"
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { describe, test } from "node:test"
import {
  getAgentDir,
  type ExtensionUIContext,
} from "@earendil-works/pi-coding-agent"
import {
  getNativeClipboard,
  type NativeClipboard,
} from "@earendil-works/pi-tui"
import { openHost } from "../fixtures/host.ts"

function assertWritableClipboard(
  clipboard: NativeClipboard | undefined,
): asserts clipboard is Required<NativeClipboard> {
  assert(
    clipboard?.setText,
    "The macOS target must provide Pi's native clipboard",
  )
}

describe(
  "clipboard at the native macOS host boundary",
  { skip: process.platform !== "darwin" },
  () => {
    test("Command C exports the selected source Markdown and leaves its selection editable", async (t) => {
      const clipboard = getNativeClipboard()
      assertWritableClipboard(clipboard)
      let copied = "Previous clipboard"
      t.mock.method(clipboard, "setText", async (text: string) => {
        copied = text
      })
      const host = await openHost(t)
      host.ui.setEditorText('Keep\n**/skill:review** @"docs/a b.md" 👩‍💻')
      await host.key("\x1b[109;10u")
      await host.key("\x1b[1;10D")
      await host.key("\x1b[99;9u")
      assert.equal(copied, '**/skill:review** @"docs/a b.md" 👩‍💻')
      assert.equal(
        host.ui.getEditorText(),
        'Keep\n**/skill:review** @"docs/a b.md" 👩‍💻',
      )
      await host.type("Replacement")
      assert.equal(host.ui.getEditorText(), "Keep\nReplacement")
    })

    test("formatted clipboard edits use the selected source range and share history across views", async (t) => {
      const clipboard = getNativeClipboard()
      assertWritableClipboard(clipboard)
      let copied = ""
      t.mock.method(clipboard, "setText", async (text: string) => {
        copied = text
      })
      t.mock.method(clipboard, "getText", async () => "/skill:review")
      const host = await openHost(t)
      host.ui.setEditorText("**abc def**")
      await host.key("\x1b[1;9A")
      await host.key("\x1b[1;4C")
      await host.key("\x1b[99;9u")
      assert.equal(copied, "abc")
      assert.equal(host.ui.getEditorText(), "**abc def**")

      await host.key("\x1b[120;9u")
      assert.equal(copied, "abc")
      assert.equal(host.ui.getEditorText(), "** def**")
      await host.key("\x1b[122;9u")
      assert.equal(host.ui.getEditorText(), "**abc def**")
      await host.key("\x1b[118;9u")
      assert.equal(host.ui.getEditorText(), "**/skill:review def**")
      await host.key("\x1b[109;10u")
      await host.key("\x1b[122;9u")
      assert.equal(host.ui.getEditorText(), "**abc def**")
      await host.key("\x1b[122;10u")
      assert.equal(host.ui.getEditorText(), "**/skill:review def**")
      await host.key("\x1b[109;10u")
      await host.key("\x1b[97;9u")
      await host.key("\x1b[99;9u")
      assert.equal(copied, "**/skill:review def**")
    })

    test("Command X copies before deleting and cuts the selection in one undoable edit", async (t) => {
      const clipboard = getNativeClipboard()
      assertWritableClipboard(clipboard)
      const write = Promise.withResolvers<void>()
      let copied = "Previous clipboard"
      t.mock.method(clipboard, "setText", async (text: string) => {
        await write.promise
        copied = text
      })
      const host = await openHost(t)
      host.ui.setEditorText("Keep 👩‍💻界")
      await host.key("\x1b[1;2D")
      await host.key("\x1b[1;2D")
      await host.key("\x1b[120;9u")
      assert.equal(host.ui.getEditorText(), "Keep 👩‍💻界")
      assert.equal(copied, "Previous clipboard")
      write.resolve()
      await t.waitFor(() => assert.equal(host.ui.getEditorText(), "Keep "))
      assert.equal(copied, "👩‍💻界")
      await host.key("\x1b[122;9u")
      assert.equal(host.ui.getEditorText(), "Keep 👩‍💻界")
      await host.key("\x1b[122;10u")
      assert.equal(host.ui.getEditorText(), "Keep ")
      await host.key("\x1b[122;9u")
      await host.type("Restored selection")
      assert.equal(host.ui.getEditorText(), "Keep Restored selection")
    })

    test("a delayed cut leaves a changed selection intact", async (t) => {
      const clipboard = getNativeClipboard()
      assertWritableClipboard(clipboard)
      const write = Promise.withResolvers<void>()
      let copied = ""
      t.mock.method(clipboard, "setText", async (text: string) => {
        await write.promise
        copied = text
      })
      const host = await openHost(t)
      host.ui.setEditorText("Keep original")
      await host.key("\x1b[1;4D")
      await host.key("\x1b[120;9u")
      await host.key("\x1b[97;9u")
      write.resolve()
      await t.waitFor(() => assert.equal(copied, "original"))
      await host.output()
      assert.equal(host.ui.getEditorText(), "Keep original")
      await host.type("Changed selection")
      assert.equal(host.ui.getEditorText(), "Changed selection")
    })

    test("Command V preserves native paste decoration and history across editor and session replacement", async (t) => {
      const clipboard = getNativeClipboard()
      assert(clipboard)
      t.mock.method(clipboard, "getText", async () => "/skill:review\nsource")
      const host = await openHost(t, {
        extension: (pi) => {
          pi.on("session_start", (_event, ctx) => {
            const previous = ctx.ui.getEditorComponent()
            assert(previous)
            ctx.ui.setEditorComponent((...args) => {
              const editor = previous(...args)
              return new Proxy(editor, {
                get(target, property) {
                  if (property === "handleInput") {
                    return (data: string) => {
                      if (data.startsWith("\x1b[200~")) {
                        data = `\x1b[200~Policy: ${data.slice(6)}`
                      }
                      target.handleInput?.(data)
                    }
                  }
                  const value = Reflect.get(target, property)
                  return typeof value === "function"
                    ? value.bind(target)
                    : value
                },
              })
            })
          })
        },
      })
      host.ui.setEditorText("Keep old")
      await host.key("\x1b[1;4D")
      await host.key("\x1b[118;9u")
      assert.equal(
        host.ui.getEditorText(),
        "Keep Policy: /skill:review\nsource",
      )
      await host.key("\x1b[122;9u")
      assert.equal(host.ui.getEditorText(), "Keep old")
      await host.key("\x1b[122;10u")
      assert.equal(
        host.ui.getEditorText(),
        "Keep Policy: /skill:review\nsource",
      )
      await host.key("\x1b[118;9u")
      assert.equal(
        host.ui.getEditorText(),
        "Keep Policy: /skill:review\nsourcePolicy: /skill:review\nsource",
      )
      await host.session.reload()
      assert.equal(
        host.ui.getEditorText(),
        "Keep Policy: /skill:review\nsourcePolicy: /skill:review\nsource",
      )
      await host.key("\x1b[122;9u")
      assert.equal(
        host.ui.getEditorText(),
        "Keep Policy: /skill:review\nsource",
      )
      const factory = host.ui.getEditorComponent()
      assert(factory)
      host.ui.setEditorComponent(factory)
      await host.key("\x1b[122;9u")
      assert.equal(host.ui.getEditorText(), "Keep old")
      await host.key("\x1b[118;9u")
      assert.equal(
        host.ui.getEditorText(),
        "Keep Policy: /skill:review\nsource",
      )
      await host.runtime.newSession()
      host.ui.setEditorText("Fresh old")
      await host.key("\x1b[1;4D")
      await host.key("\x1b[118;9u")
      assert.equal(
        host.ui.getEditorText(),
        "Fresh Policy: /skill:review\nsource",
      )
      await host.key("\x1b[122;9u")
      assert.equal(host.ui.getEditorText(), "Fresh old")
    })

    test("a delayed clipboard read preserves later work and retains its original draft and range", async (t) => {
      const clipboard = getNativeClipboard()
      assert(clipboard)
      const read = Promise.withResolvers<string>()
      t.mock.method(clipboard, "getText", () => read.promise)
      const host = await openHost(t, { columns: 240 })
      host.ui.setEditorText("Keep original")
      await host.key("\x1b[1;4D")
      await host.key("\x1b[118;9u")
      await host.key("\x1b[C")
      await host.type(" and later work")
      read.resolve("Delayed /skill:review\n\tclipboard")
      await t.waitFor(() =>
        assert(host.terminal.output.includes("Clipboard paste saved to ")),
      )
      assert.equal(host.ui.getEditorText(), "Keep original and later work")
      const output = await host.output()
      const path = output.match(/Clipboard paste saved to (.+?\.json)/)?.[1]
      assert(path, "Pi must report the retained clipboard file")
      assert.equal((await stat(path)).mode & 0o777, 0o600)
      const { revision, ...saved } = JSON.parse(await readFile(path, "utf8"))
      assert(Number.isSafeInteger(revision))
      assert.deepEqual(saved, {
        sessionId: host.session.sessionManager.getSessionId(),
        cwd: host.directory,
        draft: { text: "Keep original", anchor: 13, head: 5 },
        clipboard: "Delayed /skill:review\n\tclipboard",
      })
      await host.key("\x1b[122;9u")
      assert.equal(host.ui.getEditorText(), "Keep original")
      await host.key("\x1b[122;10u")
      assert.equal(host.ui.getEditorText(), "Keep original and later work")
    })

    test("a failing native paste decorator preserves the selection and a recovery copy", async (t) => {
      const clipboard = getNativeClipboard()
      assert(clipboard)
      t.mock.method(
        clipboard,
        "getText",
        async () => "Recover this /skill:review",
      )
      const host = await openHost(t, {
        columns: 240,
        extension: (pi) => {
          pi.on("session_start", (_event, ctx) => {
            const previous = ctx.ui.getEditorComponent()
            assert(previous)
            ctx.ui.setEditorComponent((...args) => {
              const editor = previous(...args)
              return new Proxy(editor, {
                get(target, property) {
                  if (property === "handleInput") {
                    return (data: string) => {
                      if (data.startsWith("\x1b[200~")) {
                        throw new Error("Paste policy failed")
                      }
                      target.handleInput?.(data)
                    }
                  }
                  const value = Reflect.get(target, property)
                  return typeof value === "function"
                    ? value.bind(target)
                    : value
                },
              })
            })
          })
        },
      })
      host.ui.setEditorText("Keep original")
      await host.key("\x1b[1;4D")
      await host.key("\x1b[118;9u")
      await t.waitFor(() =>
        assert(host.terminal.output.includes("Clipboard paste saved to ")),
      )
      const output = await host.output()
      assert.match(output, /Paste policy failed/)
      const path = output.match(/Clipboard paste saved to (.+?\.json)/)?.[1]
      assert(path)
      assert.equal(
        JSON.parse(await readFile(path, "utf8")).clipboard,
        "Recover this /skill:review",
      )
      assert.equal(host.ui.getEditorText(), "Keep original")
      await host.type("Replacement")
      assert.equal(host.ui.getEditorText(), "Keep Replacement")
    })

    test("a clipboard read finishing after a native session switch stays with its requesting session", async (t) => {
      const clipboard = getNativeClipboard()
      assert(clipboard)
      const read = Promise.withResolvers<string>()
      t.mock.method(clipboard, "getText", () => read.promise)
      let currentUI: ExtensionUIContext | undefined
      const sessions: string[] = []
      const host = await openHost(t, {
        extension: (pi) => {
          pi.on("session_start", (_event, ctx) => {
            currentUI = ctx.ui
            sessions.push(ctx.sessionManager.getSessionId())
          })
          pi.registerCommand("clipboard-new-session", {
            description: "Start a new session for the clipboard scenario",
            handler: async (_args, ctx) => {
              await ctx.newSession({
                withSession: async (fresh) =>
                  fresh.ui.setEditorText("New session work"),
              })
            },
          })
        },
      })
      const directory = join(
        getAgentDir(),
        "pi-composer",
        "clipboard-recovery",
        sessions[0]!,
      )
      host.ui.setEditorText("Original session draft")
      await host.key("\x1b[97;9u")
      await host.key("\x1b[118;9u")
      await host.session.prompt("/clipboard-new-session")
      assert.equal(sessions.length, 2)
      assert.notEqual(sessions[0], sessions[1])
      assert(currentUI)
      assert.equal(currentUI.getEditorText(), "New session work")
      await host.type(" + later typing")
      read.resolve("Old session clipboard")
      let paths: string[] = []
      await t.waitFor(async () => {
        paths = await readdir(directory)
        assert.equal(paths.length, 1)
        assert.equal(
          JSON.parse(await readFile(join(directory, paths[0]!), "utf8"))
            .clipboard,
          "Old session clipboard",
        )
      })
      assert.equal(currentUI.getEditorText(), "New session work + later typing")
      const { revision, ...saved } = JSON.parse(
        await readFile(join(directory, paths[0]!), "utf8"),
      )
      assert(Number.isSafeInteger(revision))
      assert.deepEqual(saved, {
        sessionId: sessions[0],
        cwd: host.directory,
        draft: { text: "Original session draft", anchor: 0, head: 22 },
        clipboard: "Old session clipboard",
      })
    })

    test("a failed clipboard write reports the error and leaves the cut selection editable", async (t) => {
      const clipboard = getNativeClipboard()
      assertWritableClipboard(clipboard)
      t.mock.method(clipboard, "setText", async () => {
        throw new Error("Controlled clipboard failure")
      })
      const host = await openHost(t)
      const commands = join(getAgentDir(), "clipboard-commands")
      await mkdir(commands)
      await writeFile(join(commands, "pbcopy"), "#!/bin/sh\nexit 1\n", {
        mode: 0o700,
      })
      const environment = [
        "PATH",
        "SSH_CONNECTION",
        "SSH_CLIENT",
        "MOSH_CONNECTION",
      ]
      const saved = environment.map((name) => process.env[name])
      t.after(() => {
        environment.forEach((name, index) => {
          if (saved[index] === undefined) delete process.env[name]
          else process.env[name] = saved[index]
        })
      })
      // Pi's native writer and command fallback both fail without changing the desktop clipboard.
      process.env["PATH"] = `${commands}:${process.env["PATH"]}`
      for (const name of environment.slice(1)) delete process.env[name]
      host.ui.setEditorText("Keep original")
      await host.key("\x1b[1;4D")
      await host.key("\x1b[120;9u")
      await t.waitFor(() =>
        assert(host.terminal.output.includes("Copy failed:")),
      )
      assert.equal(host.ui.getEditorText(), "Keep original")
      await host.type("Replacement")
      assert.equal(host.ui.getEditorText(), "Keep Replacement")
    })

    test("failed and empty clipboard reads preserve the selection and later work", async (t) => {
      const clipboard = getNativeClipboard()
      assert(clipboard)
      const read = Promise.withResolvers<string>()
      t.mock.method(clipboard, "getText", () => read.promise)
      const host = await openHost(t)
      host.ui.setEditorText("Keep original")
      await host.key("\x1b[1;4D")
      await host.key("\x1b[118;9u")
      await host.type("Later work")
      read.reject(new Error("Clipboard permission denied"))
      await t.waitFor(() =>
        assert(host.terminal.output.includes("Clipboard permission denied")),
      )
      assert.equal(host.ui.getEditorText(), "Keep Later work")
      await host.key("\x1b[122;9u")
      assert.equal(host.ui.getEditorText(), "Keep original")
      t.mock.method(clipboard, "getText", async () => null)
      await host.key("\x1b[118;9u")
      t.mock.method(clipboard, "getText", async () => "")
      await host.key("\x1b[118;9u")
      assert.equal(host.ui.getEditorText(), "Keep original")
      await host.type("Still selected")
      assert.equal(host.ui.getEditorText(), "Keep Still selected")
    })

    test("overlapping clipboard reads keep the later paste and retain the earlier result", async (t) => {
      const clipboard = getNativeClipboard()
      assert(clipboard)
      const first = Promise.withResolvers<string>()
      const second = Promise.withResolvers<string>()
      const reads = [first.promise, second.promise]
      t.mock.method(clipboard, "getText", () => reads.shift()!)
      const host = await openHost(t, { columns: 240 })
      host.ui.setEditorText("Keep original")
      await host.key("\x1b[1;4D")
      await host.key("\x1b[118;9u")
      await host.key("\x1b[118;9u")
      second.resolve("newer paste")
      await t.waitFor(() =>
        assert.equal(host.ui.getEditorText(), "Keep newer paste"),
      )
      await host.type(" and later typing")
      first.resolve("earlier paste")
      await t.waitFor(() =>
        assert(host.terminal.output.includes("Clipboard paste saved to ")),
      )
      assert.equal(host.ui.getEditorText(), "Keep newer paste and later typing")
      const path = (await host.output()).match(
        /Clipboard paste saved to (.+?\.json)/,
      )?.[1]
      assert(path)
      assert.equal(
        JSON.parse(await readFile(path, "utf8")).clipboard,
        "earlier paste",
      )
      await host.key("\x1b[122;9u")
      assert.equal(host.ui.getEditorText(), "Keep newer paste")
      await host.key("\x1b[122;9u")
      assert.equal(host.ui.getEditorText(), "Keep original")
    })

    test("undoing later typing does not revive a pending cut", async (t) => {
      const clipboard = getNativeClipboard()
      assertWritableClipboard(clipboard)
      const write = Promise.withResolvers<void>()
      let copied = ""
      t.mock.method(clipboard, "setText", async (text: string) => {
        await write.promise
        copied = text
      })
      const host = await openHost(t)
      host.ui.setEditorText("Keep original")
      await host.key("\x1b[1;4D")
      await host.key("\x1b[120;9u")
      await host.type("Temporary replacement")
      await host.key("\x1b[122;9u")
      write.resolve()
      await t.waitFor(() => assert.equal(copied, "original"))
      await host.output()
      assert.equal(host.ui.getEditorText(), "Keep original")
      await host.type("Selection survived")
      assert.equal(host.ui.getEditorText(), "Keep Selection survived")
    })

    test("native terminal listeners, extension shortcuts, and app bindings precede clipboard keys", async (t) => {
      const clipboard = getNativeClipboard()
      assertWritableClipboard(clipboard)
      let copied = "Existing clipboard"
      t.mock.method(clipboard, "setText", async (text: string) => {
        copied = text
      })
      t.mock.method(clipboard, "getImage", async () => null)
      t.mock.method(clipboard, "getText", async () => "Clipboard text")
      const host = await openHost(t, {
        keybindings: {
          "app.clear": "super+v",
          "app.clipboard.pasteImage": "super+c",
        },
        extension: (pi) => {
          pi.registerShortcut("super+c", {
            handler: (ctx) => ctx.ui.setEditorText("Extension owns copy"),
          })
          pi.on("session_start", (_event, ctx) => {
            ctx.ui.onTerminalInput((data) =>
              data === "\x1b[120;9u" ? { consume: true } : undefined,
            )
          })
        },
      })
      host.ui.setEditorText("Original selection")
      await host.key("\x1b[97;9u")
      await host.key("\x1b[120;9u")
      assert.equal(host.ui.getEditorText(), "Original selection")
      assert.equal(copied, "Existing clipboard")
      await host.key("\x1b[99;9u")
      assert.equal(host.ui.getEditorText(), "Extension owns copy")
      assert.equal(copied, "Existing clipboard")
      await host.key("\x1b[118;9u")
      assert.equal(host.ui.getEditorText(), "")
      assert.equal(host.requests.length, 0)
    })

    test("a failed clipboard recovery write remains retrievable after reload from an unrelated draft", async (t) => {
      const clipboard = getNativeClipboard()
      assert(clipboard)
      const read = Promise.withResolvers<string>()
      t.mock.method(clipboard, "getText", () => read.promise)
      const host = await openHost(t, { columns: 240 })
      const directory = join(getAgentDir(), "pi-composer")
      await mkdir(directory, { recursive: true })
      await writeFile(
        join(directory, "clipboard-recovery"),
        "Unavailable storage",
      )
      host.ui.setEditorText("Keep original")
      const sessionId = host.session.sessionManager.getSessionId()
      await host.key("\x1b[1;4D")
      await host.key("\x1b[118;9u")
      await host.type("Later work")
      read.resolve("Recover /skill:review")
      await t.waitFor(() =>
        assert(
          host.terminal.output.includes(
            "Clipboard recovery could not be saved:",
          ),
        ),
      )
      const output = await host.output()
      assert.match(output, /"text": "Keep original"/)
      assert.match(output, /"clipboard": "Recover \/skill:review"/)
      assert.equal(host.ui.getEditorText(), "Keep Later work")

      await host.session.reload()
      await host.runtime.newSession()
      host.ui.setEditorText("Unrelated current draft")
      await rm(join(directory, "clipboard-recovery"))
      await host.session.sendUserMessage("/composer-recover", {
        expandPromptTemplates: true,
      })
      const path = (await host.output()).match(
        /Clipboard paste saved to (.+?\.json)/,
      )?.[1]
      assert(path, "The recovery action must retry the retained clipboard")
      const saved = JSON.parse(await readFile(path, "utf8"))
      assert.equal(saved.sessionId, sessionId)
      assert.deepEqual(saved.draft, {
        text: "Keep original",
        anchor: 13,
        head: 5,
      })
      assert.equal(saved.clipboard, "Recover /skill:review")
      assert.equal(host.ui.getEditorText(), "Unrelated current draft")
    })

    test("empty selections leave the clipboard untouched and unavailable reads leave selection intact", async (t) => {
      const clipboard = getNativeClipboard()
      assertWritableClipboard(clipboard)
      let copied = "Existing clipboard"
      t.mock.method(clipboard, "setText", async (text: string) => {
        copied = text
      })
      t.mock.method(clipboard, "getText", async () => undefined)
      const host = await openHost(t)
      host.ui.setEditorText("Original")
      await host.key("\x1b[99;9u")
      await host.key("\x1b[120;9u")
      assert.equal(copied, "Existing clipboard")
      assert.equal(host.ui.getEditorText(), "Original")
      await host.key("\x1b[97;9u")
      await host.key("\x1b[118;9u")
      await t.waitFor(() =>
        assert(host.terminal.output.includes("Text clipboard unavailable")),
      )
      assert.equal(host.ui.getEditorText(), "Original")
      await host.type("Selection survived")
      assert.equal(host.ui.getEditorText(), "Selection survived")
    })
  },
)
