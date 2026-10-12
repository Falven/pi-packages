import assert from "node:assert/strict"
import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { test } from "node:test"
import { stripVTControlCharacters } from "node:util"
import { getSelectListTheme } from "@earendil-works/pi-coding-agent"
import {
  SelectList,
  type AutocompleteSuggestions,
} from "@earendil-works/pi-tui"
import { openHost } from "../fixtures/host.ts"

test("native file completion quotes a reference and accepts it before submission in one undoable edit", async (t) => {
  const host = await openHost(t, {
    extension: (pi) => {
      pi.on("session_start", async (_event, ctx) => {
        await writeFile(join(ctx.cwd, "hello world.md"), "Reference source")
      })
    },
  })
  await host.type("Read @hel")
  await t.waitFor(async () =>
    assert.match(await host.output(), /hello world\.md/),
  )
  await host.key("\r")
  assert.equal(host.ui.getEditorText(), 'Read @"hello world.md" ')
  assert.equal(host.requests.length, 0)
  await host.type("next")
  assert.equal(host.ui.getEditorText(), 'Read @"hello world.md" next')
  await host.key("\x1b[122;9u")
  assert.equal(host.ui.getEditorText(), 'Read @"hello world.md" ')
  await host.key("\x1b[122;9u")
  assert.equal(host.ui.getEditorText(), "Read @hel")
  await host.key("\x1b[122;10u")
  assert.equal(host.ui.getEditorText(), 'Read @"hello world.md" ')
})

test("native directory completion keeps filtering and places the caret inside quotes for navigation", async (t) => {
  const host = await openHost(t, {
    extension: (pi) => {
      pi.on("session_start", async (_event, ctx) => {
        await mkdir(join(ctx.cwd, "docs set"))
        await Promise.all([
          mkdir(join(ctx.cwd, ".git")),
          writeFile(join(ctx.cwd, ".gitignore"), "ignored.md\n"),
          writeFile(join(ctx.cwd, "docs set", "alpha.md"), "Alpha"),
          writeFile(join(ctx.cwd, "docs set", "beta.md"), "Beta"),
          writeFile(join(ctx.cwd, "docs set", "ignored.md"), "Ignored"),
        ])
      })
    },
  })
  await host.type("Read @docs")
  await t.waitFor(async () => assert.match(await host.output(), /docs set\//))
  assert.doesNotMatch(await host.output(), /ignored\.md/)
  await host.key("\t")
  assert.equal(host.ui.getEditorText(), 'Read @"docs set/"')
  host.terminal.output = ""
  await host.type("b")
  assert.equal(host.ui.getEditorText(), 'Read @"docs set/b"')
  await t.waitFor(async () => assert.match(await host.output(), /beta\.md/))
  await host.key("\r")
  assert.equal(host.ui.getEditorText(), 'Read @"docs set/beta.md" ')
  assert.equal(host.requests.length, 0)
  await host.key("\x1b[122;9u")
  assert.equal(host.ui.getEditorText(), 'Read @"docs set/b"')
})

test("Tab completes a unique native path without opening a second picker", async (t) => {
  const host = await openHost(t, {
    extension: (pi) => {
      pi.on("session_start", async (_event, ctx) => {
        await writeFile(join(ctx.cwd, "manual.md"), "Manual")
      })
    },
  })
  host.ui.setEditorText("Read ./man")
  await host.key("\t")
  await t.waitFor(() =>
    assert.equal(host.ui.getEditorText(), "Read ./manual.md"),
  )
  await host.type(" next")
  assert.equal(host.ui.getEditorText(), "Read ./manual.md next")
  await host.key("\x1b[122;9u")
  await host.key("\x1b[122;9u")
  assert.equal(host.ui.getEditorText(), "Read ./man")
})

test("leading command completion dispatches through Pi while argument acceptance keeps editing", async (t) => {
  const host = await openHost(t, {
    extension: (pi) => {
      pi.registerCommand("completion-action", {
        description: "Completion action",
        getArgumentCompletions: (prefix) =>
          ["alpha", "beta"]
            .filter((value) => value.startsWith(prefix))
            .map((value) => ({ value, label: `${value} argument` })),
        handler: async (args, ctx) =>
          ctx.ui.setEditorText(`Command args: ${args || "(none)"}`),
      })
    },
  })
  await host.type("/completion-")
  await t.waitFor(async () =>
    assert.match(await host.output(), /Completion action/),
  )
  await host.key("\r")
  await t.waitFor(() =>
    assert.equal(host.ui.getEditorText(), "Command args: (none)"),
  )
  host.ui.setEditorText("/completion-action ")
  await host.type("b")
  await t.waitFor(async () =>
    assert.match(await host.output(), /beta argument/),
  )
  await host.key("\r")
  assert.equal(host.ui.getEditorText(), "/completion-action beta")
  assert.equal(host.requests.length, 0)
  await host.key("\r")
  await t.waitFor(() =>
    assert.equal(host.ui.getEditorText(), "Command args: beta"),
  )
  assert.equal(host.requests.length, 0)
})

test("effective wrappers installed before and after composer activation preserve order and completion cursor edits", async (t) => {
  const host = await openHost(t)
  const composer = host.ui.getEditorComponent()
  assert(composer)
  host.ui.setEditorComponent(undefined)
  host.ui.addAutocompleteProvider((base) => ({
    triggerCharacters: ["$"],
    async getSuggestions(lines, line, col, options) {
      const prefix = lines[line]!.slice(0, col).match(/\$[a-z]*$/)?.[0]
      if (!prefix) return base.getSuggestions(lines, line, col, options)
      return {
        prefix,
        items: ["alpha", "beta"]
          .filter((name) => name.startsWith(prefix.slice(1)))
          .map((name) => ({ value: `/skill:${name}`, label: `early ${name}` })),
      }
    },
    applyCompletion(...args) {
      const result = base.applyCompletion(...args)
      return {
        ...result,
        lines: ["Early:", ...result.lines],
        cursorLine: result.cursorLine + 1,
      }
    },
    shouldTriggerFileCompletion: (...args) =>
      base.shouldTriggerFileCompletion?.(...args) ?? true,
  }))
  host.ui.setEditorComponent(composer)
  await host.type("Use $al")
  await t.waitFor(async () => assert.match(await host.output(), /early alpha/))
  await host.key("\r")
  assert.equal(host.ui.getEditorText(), "Early:\nUse /skill:alpha")
  await host.key("\x1b[122;9u")
  assert.equal(host.ui.getEditorText(), "Use $al")

  host.ui.addAutocompleteProvider((base) => ({
    triggerCharacters: ["^"],
    async getSuggestions(...args) {
      const result = await base.getSuggestions(...args)
      if (!result) return null
      for (const item of result.items) item.label = `late(${item.label})`
      return result
    },
    applyCompletion(...args) {
      const result = base.applyCompletion(...args)
      return {
        ...result,
        lines: ["Late:", ...result.lines],
        cursorLine: result.cursorLine + 1,
      }
    },
    shouldTriggerFileCompletion: (...args) =>
      base.shouldTriggerFileCompletion?.(...args) ?? true,
  }))
  host.ui.setEditorText("Use $a tail")
  await host.key("\x1b[D")
  await host.key("\x1b[D")
  await host.key("\x1b[D")
  await host.key("\x1b[D")
  await host.key("\x1b[D")
  host.terminal.output = ""
  await host.type("l")
  await t.waitFor(async () =>
    assert.match(await host.output(), /late\(early alpha\)/),
  )
  await host.key("\r")
  assert.equal(host.ui.getEditorText(), "Late:\nEarly:\nUse /skill:alpha tail")
  await host.type("!")
  assert.equal(host.ui.getEditorText(), "Late:\nEarly:\nUse /skill:alpha! tail")
  await host.key("\x1b[122;9u")
  await host.key("\x1b[122;9u")
  assert.equal(host.ui.getEditorText(), "Use $al tail")
  assert.equal(host.requests.length, 0)
})

test("provider updates cancel outstanding requests and discard late suggestions", async (t) => {
  const host = await openHost(t)
  const pending = Promise.withResolvers<AutocompleteSuggestions | null>()
  let signal: AbortSignal | undefined
  host.ui.addAutocompleteProvider((base) => ({
    triggerCharacters: ["$"],
    getSuggestions(lines, line, col, options) {
      if (!lines[line]!.slice(0, col).endsWith("$old")) {
        return base.getSuggestions(lines, line, col, options)
      }
      signal = options.signal
      return pending.promise
    },
    applyCompletion: (...args) => base.applyCompletion(...args),
  }))
  await host.type("Use $old")
  await t.waitFor(() => assert(signal))
  host.ui.addAutocompleteProvider((base) => ({
    triggerCharacters: ["%"],
    async getSuggestions(lines, line, col, options) {
      if (!lines[line]!.slice(0, col).endsWith("%new")) {
        return base.getSuggestions(lines, line, col, options)
      }
      return {
        prefix: "%new",
        items: [{ value: "/skill:new", label: "Current reference" }],
      }
    },
    applyCompletion: (...args) => base.applyCompletion(...args),
  }))
  assert.equal(signal?.aborted, true)
  host.ui.setEditorText("Fresh")
  host.terminal.output = ""
  await host.type(" %new")
  await t.waitFor(async () =>
    assert.match(await host.output(), /Current reference/),
  )
  pending.resolve({
    prefix: "$old",
    items: [{ value: "stale", label: "Stale reference" }],
  })
  assert.doesNotMatch(await host.output(), /Stale reference/)
  assert.equal(host.ui.getEditorText(), "Fresh %new")
  await host.key("\r")
  assert.equal(host.ui.getEditorText(), "Fresh /skill:new")
  assert.equal(host.requests.length, 0)
})

test("an extension picker inserts editable reference text through Pi and replaces selection in one undo", async (t) => {
  const host = await openHost(t, {
    extension: (pi) => {
      pi.registerShortcut("ctrl+shift+p", {
        handler: async (ctx) => {
          const reference = await ctx.ui.custom<string | undefined>(
            (_tui, _theme, _keys, done) => {
              const picker = new SelectList(
                [
                  { value: "@first.md", label: "First reference" },
                  { value: "@second.md", label: "Second reference" },
                ],
                5,
                getSelectListTheme(),
              )
              picker.onSelect = (item) => done(item.value)
              picker.onCancel = () => done(undefined)
              return picker
            },
            { overlay: true },
          )
          if (reference !== undefined) ctx.ui.pasteToEditor(reference)
        },
      })
    },
  })
  host.ui.setEditorText("Keep old tail")
  await host.key("\x1b[1;3D")
  await host.key("\x1b[D")
  await host.key("\x1b[1;4D")
  await host.key("\x1b[112;6u")
  await t.waitFor(async () =>
    assert.match(await host.output(), /First reference/),
  )
  await host.key("\x1b[B")
  await host.key("\r")
  await t.waitFor(() =>
    assert.equal(host.ui.getEditorText(), "Keep @second.md tail"),
  )
  assert.equal(host.requests.length, 0)
  await host.type("!")
  assert.equal(host.ui.getEditorText(), "Keep @second.md! tail")
  await host.key("\x1b[122;9u")
  await host.key("\x1b[122;9u")
  assert.equal(host.ui.getEditorText(), "Keep old tail")
  await host.key("\x1b[122;10u")
  assert.equal(host.ui.getEditorText(), "Keep @second.md tail")
})

test("native completion replaces selected source and undo restores that selection", async (t) => {
  const host = await openHost(t, {
    extension: (pi) => {
      pi.on("session_start", async (_event, ctx) => {
        await writeFile(join(ctx.cwd, "manual.md"), "Manual")
      })
    },
  })
  host.ui.setEditorText("Keep @manOLD")
  await host.key("\x1b[1;2D")
  await host.key("\x1b[1;2D")
  await host.key("\x1b[1;2D")
  await host.key("\t")
  await t.waitFor(() =>
    assert.equal(host.ui.getEditorText(), "Keep @manual.md "),
  )
  await host.key("\x1b[122;9u")
  assert.equal(host.ui.getEditorText(), "Keep @manOLD")
  await host.type("ual")
  assert.equal(host.ui.getEditorText(), "Keep @manual")
})

test("Command Enter accepts an open completion before explicit submission", async (t) => {
  const host = await openHost(t, {
    extension: (pi) => {
      pi.on("session_start", async (_event, ctx) => {
        await writeFile(join(ctx.cwd, "manual.md"), "Manual")
      })
    },
  })
  await host.type("Read @man")
  await t.waitFor(async () => assert.match(await host.output(), /manual\.md/))
  await host.key("\x1b[13;9u")
  assert.equal(host.ui.getEditorText(), "Read @manual.md ")
  assert.equal(host.requests.length, 0)
  await host.key("\x1b[13;9u")
  await host.settled()
  assert.equal(host.requests.length, 1)
  assert.deepEqual(
    host.requests[0]?.messages.filter((message) => message.role === "user"),
    [{ role: "user", content: [{ type: "text", text: "Read @manual.md" }] }],
  )
})

test("typing in a forced native path picker refreshes its filtered suggestions", async (t) => {
  const host = await openHost(t, {
    extension: (pi) => {
      pi.on("session_start", async (_event, ctx) => {
        await Promise.all([
          writeFile(join(ctx.cwd, "manual-a.md"), "Alpha"),
          writeFile(join(ctx.cwd, "manual-b.md"), "Beta"),
        ])
      })
    },
  })
  host.ui.setEditorText("Read ./man")
  await host.key("\t")
  await t.waitFor(async () => assert.match(await host.output(), /manual-a\.md/))
  host.terminal.output = ""
  await host.type("ual-b")
  await t.waitFor(async () => assert.match(await host.output(), /manual-b\.md/))
  await host.key("\r")
  assert.equal(host.ui.getEditorText(), "Read ./manual-b.md")
  assert.equal(host.requests.length, 0)
})

test("the native picker highlights the best matching value before keyboard navigation", async (t) => {
  const host = await openHost(t)
  host.ui.addAutocompleteProvider((base) => ({
    async getSuggestions() {
      return {
        prefix: "@beta",
        items: [
          { value: "@alphabet", label: "Alphabet reference" },
          { value: "@beta", label: "Beta reference" },
          { value: "@betamax", label: "Betamax reference" },
        ],
      }
    },
    applyCompletion: (...args) => base.applyCompletion(...args),
  }))
  await host.type("Use @beta")
  await t.waitFor(async () =>
    assert.match(await host.output(), /Betamax reference/),
  )
  await host.key("\x1b[B")
  await host.key("\r")
  assert.equal(host.ui.getEditorText(), "Use @betamax ")
  assert.equal(host.requests.length, 0)
  await host.key("\x1b[122;9u")
  assert.equal(host.ui.getEditorText(), "Use @beta")
})

test("effective picker keys retain terminal listener, extension shortcut, and application action priority", async (t) => {
  const host = await openHost(t, {
    keybindings: { "tui.select.down": "alt+j", "app.clear": "super+enter" },
    extension: (pi) => {
      pi.registerShortcut("super+a", {
        handler: (ctx) => ctx.ui.setEditorText("Extension action"),
      })
      pi.on("session_start", async (_event, ctx) => {
        ctx.ui.onTerminalInput((data) => {
          if (data !== "\x1b[120;6u") return
          ctx.ui.setEditorText("Terminal action")
          return { consume: true }
        })
        await Promise.all([
          writeFile(join(ctx.cwd, "manual-a.md"), "Alpha"),
          writeFile(join(ctx.cwd, "manual-b.md"), "Beta"),
        ])
      })
    },
  })
  const openPicker = async () => {
    host.ui.setEditorText("Read ")
    host.terminal.output = ""
    await host.type("@man")
    await t.waitFor(async () =>
      assert.match(await host.output(), /manual-a\.md/),
    )
  }
  await openPicker()
  await host.key("\x1bj")
  await host.key("\r")
  assert.equal(host.ui.getEditorText(), "Read @manual-b.md ")
  await openPicker()
  await host.key("\x1b[97;9u")
  assert.equal(host.ui.getEditorText(), "Extension action")
  await openPicker()
  await host.key("\x1b[13;9u")
  assert.equal(host.ui.getEditorText(), "")
  await openPicker()
  await host.key("\x1b[120;6u")
  assert.equal(host.ui.getEditorText(), "Terminal action")
  assert.equal(host.requests.length, 0)
})

test("Escape cancels a pending provider without losing the draft", async (t) => {
  const host = await openHost(t)
  const pending = Promise.withResolvers<AutocompleteSuggestions | null>()
  let signal: AbortSignal | undefined
  host.ui.addAutocompleteProvider((base) => ({
    triggerCharacters: ["$"],
    getSuggestions(_lines, _line, _col, options) {
      signal = options.signal
      return pending.promise
    },
    applyCompletion: (...args) => base.applyCompletion(...args),
  }))
  await host.type("Use $wait")
  await t.waitFor(() => assert(signal))
  await host.key("\x1b")
  assert.equal(signal?.aborted, true)
  pending.resolve({
    prefix: "$wait",
    items: [{ value: "late", label: "Late result" }],
  })
  assert.doesNotMatch(await host.output(), /Late result/)
  assert.equal(host.ui.getEditorText(), "Use $wait")
  assert.equal(host.requests.length, 0)
})

test("selecting the draft cancels outstanding suggestions and preserves selection editing", async (t) => {
  const host = await openHost(t)
  const pending = Promise.withResolvers<AutocompleteSuggestions | null>()
  let signal: AbortSignal | undefined
  host.ui.addAutocompleteProvider((base) => ({
    triggerCharacters: ["$"],
    getSuggestions(_lines, _line, _col, options) {
      signal = options.signal
      return pending.promise
    },
    applyCompletion: (...args) => base.applyCompletion(...args),
  }))
  await host.type("Use $wait")
  await t.waitFor(() => assert(signal))
  await host.key("\x1b[97;9u")
  assert.equal(signal?.aborted, true)
  pending.resolve(null)
  await host.type("New draft")
  assert.equal(host.ui.getEditorText(), "New draft")
})

test("an open picker keeps Enter from submitting while refreshed suggestions are pending", async (t) => {
  const host = await openHost(t)
  const pending = Promise.withResolvers<AutocompleteSuggestions | null>()
  let refreshing = false
  host.ui.addAutocompleteProvider((base) => ({
    triggerCharacters: ["$"],
    async getSuggestions(lines, line, col) {
      const prefix = lines[line]!.slice(0, col).match(/\$\w*$/)?.[0]
      if (prefix === "$older") {
        refreshing = true
        return pending.promise
      }
      return {
        prefix: "$old",
        items: [{ value: "/skill:old", label: "Initial reference" }],
      }
    },
    applyCompletion: (...args) => base.applyCompletion(...args),
  }))
  await host.type("Use $old")
  await t.waitFor(async () =>
    assert.match(await host.output(), /Initial reference/),
  )
  await host.type("er")
  await t.waitFor(() => assert(refreshing))
  await host.key("\r")
  assert.equal(host.ui.getEditorText(), "Use $older")
  assert.equal(host.requests.length, 0)
  pending.resolve({
    prefix: "$older",
    items: [{ value: "/skill:updated", label: "Updated reference" }],
  })
  await t.waitFor(async () =>
    assert.match(await host.output(), /Updated reference/),
  )
  await host.key("\r")
  assert.equal(host.ui.getEditorText(), "Use /skill:updated")
  assert.equal(host.requests.length, 0)
})

test("Pi routes terminal mouse selection to the completion picker as one edit", async (t) => {
  const host = await openHost(t)
  host.ui.addAutocompleteProvider((base) => ({
    async getSuggestions() {
      return {
        prefix: "@pick",
        items: [
          { value: "@first.md", label: "First mouse reference" },
          { value: "@second.md", label: "Second mouse reference" },
        ],
      }
    },
    applyCompletion: (...args) => base.applyCompletion(...args),
  }))
  await host.type("Use @pick")
  await t.waitFor(async () =>
    assert.match(await host.output(), /Second mouse reference/),
  )
  const row = [
    ...host.terminal.output.matchAll(
      // oxlint-disable-next-line no-control-regex -- Fullscreen row addresses contain ESC.
      /\x1b\[(\d+);1H\x1b\[2K(.*?)(?=\x1b\[\d+;\d+H|$)/gs,
    ),
  ].findLast((match) =>
    stripVTControlCharacters(match[2]!).includes("Second mouse reference"),
  )?.[1]
  assert(row, "The terminal must render a row for the second reference")
  await host.key(`\x1b[<0;3;${row}M`)
  await host.key(`\x1b[<0;3;${row}m`)
  assert.equal(host.ui.getEditorText(), "Use @second.md ")
  assert.equal(host.requests.length, 0)
  await host.key("\x1b[122;9u")
  assert.equal(host.ui.getEditorText(), "Use @pick")
})

test("native references complete after CJK punctuation boundaries", async (t) => {
  const host = await openHost(t, {
    extension: (pi) => {
      pi.on("session_start", async (_event, ctx) => {
        await writeFile(join(ctx.cwd, "设计.md"), "Design")
      })
    },
  })
  await host.type("查看，@设")
  await t.waitFor(async () => assert.match(await host.output(), /设计\.md/))
  await host.key("\r")
  assert.equal(host.ui.getEditorText(), "查看，@设计.md ")
  assert.equal(host.requests.length, 0)
})

test("effective providers can decline forced file completion", async (t) => {
  const host = await openHost(t)
  host.ui.addAutocompleteProvider((base) => ({
    async getSuggestions() {
      return {
        prefix: "path",
        items: [{ value: "unwanted", label: "Unwanted completion" }],
      }
    },
    applyCompletion: (...args) => base.applyCompletion(...args),
    shouldTriggerFileCompletion: () => false,
  }))
  host.ui.setEditorText("Read path")
  await host.key("\t")
  assert.equal(host.ui.getEditorText(), "Read path")
  assert.doesNotMatch(await host.output(), /Unwanted completion/)
})

test("a failed provider reports its error and keeps the draft editable", async (t) => {
  const host = await openHost(t)
  host.ui.addAutocompleteProvider((base) => ({
    triggerCharacters: ["$"],
    async getSuggestions() {
      throw new Error("Provider unavailable")
    },
    applyCompletion: (...args) => base.applyCompletion(...args),
  }))
  await host.type("Use $reference")
  await t.waitFor(async () =>
    assert.match(
      await host.output(),
      /Autocomplete failed: Provider unavailable/,
    ),
  )
  assert.equal(host.ui.getEditorText(), "Use $reference")
  await host.key("\x1b[97;9u")
  await host.type("Recoverable draft")
  assert.equal(host.ui.getEditorText(), "Recoverable draft")
})

test("an open picker leaves bracketed paste chunks in one draft edit", async (t) => {
  const host = await openHost(t, {
    extension: (pi) => {
      pi.on("session_start", async (_event, ctx) => {
        await writeFile(join(ctx.cwd, "manual.md"), "Manual")
      })
    },
  })
  await host.type("Read @man")
  await t.waitFor(async () => assert.match(await host.output(), /manual\.md/))
  await host.key("\x1b[200~pasted")
  await host.key("\r")
  await host.key(" suffix\x1b[201~")
  assert.equal(host.ui.getEditorText(), "Read @manpasted\n suffix")
  assert.equal(host.requests.length, 0)
  await host.key("\x1b[122;9u")
  assert.equal(host.ui.getEditorText(), "Read @man")
})

test("failed completion application reports an error without submitting or replacing the draft", async (t) => {
  const host = await openHost(t)
  host.ui.addAutocompleteProvider(() => ({
    async getSuggestions() {
      return {
        prefix: "/broken",
        items: [{ value: "unused", label: "Broken command" }],
      }
    },
    applyCompletion() {
      throw new Error("Cannot complete")
    },
  }))
  await host.type("/broken")
  await t.waitFor(async () =>
    assert.match(await host.output(), /Broken command/),
  )
  await host.key("\r")
  assert.match(await host.output(), /Autocomplete failed: Cannot complete/)
  assert.equal(host.ui.getEditorText(), "/broken")
  assert.equal(host.requests.length, 0)
})
