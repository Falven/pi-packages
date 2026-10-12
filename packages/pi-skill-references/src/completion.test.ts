/* eslint-disable no-await-in-loop -- These scenarios complete one native draft at a time. */
import assert from "node:assert/strict"
import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { test } from "node:test"
import { setImmediate } from "node:timers/promises"
import { fileURLToPath } from "node:url"
import { stripVTControlCharacters } from "node:util"
import { createHost } from "../fixtures/host.ts"

test(
  "composer opens dollar and inline slash skill completion automatically through the native provider contract",
  { timeout: 15000 },
  async (t) => {
    const host = await createHost(t, undefined, false, {
      additionalExtensionPaths: [
        fileURLToPath(
          new URL("../../pi-composer/src/index.ts", import.meta.url),
        ),
      ],
    })
    for (const trigger of ["$", "/"]) {
      host.ui.setEditorText("Use ")
      host.terminal.output = ""
      host.terminal.input(trigger)
      await t.waitFor(() =>
        assert.match(
          stripVTControlCharacters(host.terminal.output),
          /skill:review/,
        ),
      )
      assert.equal(host.ui.getEditorText(), `Use ${trigger}`)
      host.terminal.input("\t")
      host.terminal.input("here.")
      assert.equal(host.ui.getEditorText(), "Use /skill:review here.")
      const submitted = await host.submit()
      assert(submitted.includes("Review the actual behavior."), submitted)
      assert(submitted.includes("Use /skill:review here."), submitted)
    }
  },
)

test(
  "native dollar completion inserts portable skill text and submits its instructions",
  { timeout: 15000 },
  async (t) => {
    const host = await createHost(t)
    host.ui.setEditorText("Please apply ")
    host.terminal.output = ""
    host.terminal.input("$")
    await t.waitFor(() =>
      assert.match(
        stripVTControlCharacters(host.terminal.output),
        /skill:review/,
      ),
    )
    assert.equal(host.ui.getEditorText(), "Please apply $")
    host.terminal.input("\t")
    host.terminal.input("here.")
    assert.equal(host.ui.getEditorText(), "Please apply /skill:review here.")
    const submitted = await host.submit()
    assert(submitted.includes("Review the actual behavior."), submitted)
    assert(submitted.includes("Please apply /skill:review here."), submitted)
  },
)

test(
  "a supplied provider keeps its completion for native skill arguments",
  { timeout: 15000 },
  async (t) => {
    const host = await createHost(t, (pi) => {
      pi.on("session_start", (_event, ctx) => {
        ctx.ui.addAutocompleteProvider((current) => ({
          async getSuggestions(lines, cursorLine, cursorCol, options) {
            if (lines[cursorLine]?.slice(0, cursorCol) === "/skill:review $") {
              return {
                prefix: "$",
                items: [
                  { value: "custom argument", label: "Native skill argument" },
                ],
              }
            }
            return current.getSuggestions(lines, cursorLine, cursorCol, options)
          },
          applyCompletion: (...args) => current.applyCompletion(...args),
          shouldTriggerFileCompletion: (...args) =>
            current.shouldTriggerFileCompletion?.(...args) ?? true,
        }))
      })
    })
    host.ui.setEditorText("/skill:review ")
    host.terminal.output = ""
    host.terminal.input("$")
    await t.waitFor(() =>
      assert.match(
        stripVTControlCharacters(host.terminal.output),
        /Native skill argument/,
      ),
    )
    host.terminal.input("\t")
    assert.equal(host.ui.getEditorText(), "/skill:review custom argument")
    const submitted = await host.submit()
    assert(submitted.includes("Review the actual behavior."), submitted)
    assert(submitted.includes("/skill:review custom argument"), submitted)
  },
)

test(
  "a leading selected skill still allows another skill in its prose arguments",
  { timeout: 15000 },
  async (t) => {
    const host = await createHost(t, async (pi, directory) => {
      const skillDir = join(directory, "refactor")
      await mkdir(skillDir)
      await writeFile(
        join(skillDir, "SKILL.md"),
        "---\nname: refactor\ndescription: Refactor behavior\n---\nRefactor carefully.\n",
      )
      pi.on("resources_discover", () => ({ skillPaths: [skillDir] }))
    })
    host.ui.setEditorText("$rvw")
    host.terminal.input("\t")
    await t.waitFor(() =>
      assert.equal(host.ui.getEditorText(), "/skill:review "),
    )
    host.terminal.output = ""
    host.terminal.input("$refactor")
    await t.waitFor(() =>
      assert.match(
        stripVTControlCharacters(host.terminal.output),
        /skill:refactor/,
      ),
    )
    host.terminal.input("\t")
    assert.equal(host.ui.getEditorText(), "/skill:review /skill:refactor ")
    const submitted = await host.submit()
    assert(submitted.includes("Review the actual behavior."), submitted)
    assert(submitted.includes("Refactor carefully."), submitted)
  },
)

test(
  "another extension's native picker inserts a canonical reference through the ordinary text API",
  { timeout: 15000 },
  async (t) => {
    const host = await createHost(t, (pi) => {
      pi.registerCommand("choose-skill", {
        handler: async (_args, ctx) => {
          const selected = await ctx.ui.select("Choose a skill", ["Review"])
          if (selected) ctx.ui.pasteToEditor("/skill:review")
        },
      })
    })
    host.ui.setEditorText("Use ")
    host.terminal.output = ""
    const picking = host.session.prompt("/choose-skill")
    await t.waitFor(() =>
      assert.match(
        stripVTControlCharacters(host.terminal.output),
        /Choose a skill/,
      ),
    )
    host.terminal.input("\r")
    await picking
    assert.equal(host.ui.getEditorText(), "Use /skill:review")
    const submitted = await host.submit()
    assert(submitted.includes("Review the actual behavior."), submitted)
    assert(submitted.includes("Use /skill:review"), submitted)
  },
)

test(
  "cancelled shorthand stays literal and accepted references remain editable and portable",
  { timeout: 15000 },
  async (t) => {
    const host = await createHost(t)
    host.ui.setEditorText("Use $revie")
    host.terminal.output = ""
    host.terminal.input("w")
    await t.waitFor(() =>
      assert.match(
        stripVTControlCharacters(host.terminal.output),
        /skill:review/,
      ),
    )
    host.terminal.input("\x1b")
    assert.equal(host.ui.getEditorText(), "Use $review")
    assert.equal(await host.submit(), "Use $review")

    host.ui.setEditorText("Use $rvw")
    host.terminal.input("\t")
    await t.waitFor(() =>
      assert.equal(host.ui.getEditorText(), "Use /skill:review "),
    )
    const copied = host.ui.getEditorText()
    host.terminal.input("\x7f")
    host.terminal.input("\x7f")
    assert.equal(host.ui.getEditorText(), "Use /skill:revie")
    assert.equal(await host.submit(), "Use /skill:revie")
    host.ui.pasteToEditor(copied)
    assert((await host.submit()).includes("Review the actual behavior."))
  },
)

test(
  "late skill results honor native cancellation and later provider updates",
  { timeout: 15000 },
  async (t) => {
    const requested = Promise.withResolvers<AbortSignal>()
    const release = Promise.withResolvers<void>()
    const returned = Promise.withResolvers<void>()
    let wait = true
    const host = await createHost(t, (pi) => {
      pi.on("session_start", (_event, ctx) => {
        ctx.ui.addAutocompleteProvider((current) => ({
          async getSuggestions(...args) {
            const delayed = wait && args[0][args[1]] === "/rvw"
            if (delayed) {
              wait = false
              requested.resolve(args[3].signal)
              await release.promise
            }
            const suggestions = await current.getSuggestions(...args)
            if (delayed) returned.resolve()
            return suggestions
          },
          applyCompletion: (...args) => current.applyCompletion(...args),
          shouldTriggerFileCompletion: (...args) =>
            current.shouldTriggerFileCompletion?.(...args) ?? true,
        }))
      })
    })
    host.ui.setEditorText("Use $rvw")
    host.terminal.input("\t")
    const signal = await requested.promise
    host.terminal.input("x")
    assert.equal(host.ui.getEditorText(), "Use $rvwx")
    assert(signal.aborted)
    host.ui.setEditorText("Keep this later draft")
    host.ui.addAutocompleteProvider((current) => ({
      ...current,
      applyCompletion(...args) {
        const result = current.applyCompletion(...args)
        result.lines[result.cursorLine] += "Updated "
        result.cursorCol += "Updated ".length
        return result
      },
    }))
    release.resolve()
    await returned.promise
    await setImmediate()
    assert.equal(host.ui.getEditorText(), "Keep this later draft")

    host.ui.setEditorText("Use $rvw")
    host.terminal.input("\t")
    await t.waitFor(() =>
      assert.equal(host.ui.getEditorText(), "Use /skill:review Updated "),
    )
    host.terminal.input("here")
    assert((await host.submit()).includes("Use /skill:review Updated here"))
  },
)

test(
  "completion follows effective provider filtering, native availability, resource precedence, and reloads",
  { timeout: 15000 },
  async (t) => {
    let includeReview = true
    const host = await createHost(t, async (pi, directory) => {
      const discovered = join(directory, "discovered")
      await mkdir(discovered, { recursive: true })
      await writeFile(
        join(discovered, "SKILL.md"),
        "---\nname: review\ndescription: Later review\n---\nLater review instructions.\n",
      )
      pi.on("resources_discover", () => ({ skillPaths: [discovered] }))
      pi.on("session_start", (_event, ctx) => {
        ctx.ui.addAutocompleteProvider((current) => ({
          getSuggestions: async (...args) => {
            const suggestions = await current.getSuggestions(...args)
            return (
              suggestions && {
                ...suggestions,
                items: suggestions.items.filter(
                  (item) => includeReview || item.value !== "skill:review",
                ),
              }
            )
          },
          applyCompletion: (...args) => current.applyCompletion(...args),
          shouldTriggerFileCompletion: (...args) =>
            current.shouldTriggerFileCompletion?.(...args) ?? true,
        }))
      })
    })
    const reload = async () => {
      host.ui.setEditorText("/reload")
      host.terminal.output = ""
      host.terminal.input("\r")
      await t.waitFor(() =>
        assert.match(
          stripVTControlCharacters(host.terminal.output),
          /Reloaded keybindings, extensions/,
        ),
      )
    }
    host.ui.setEditorText("Use $rvw")
    host.terminal.input("\t")
    await t.waitFor(() =>
      assert.equal(host.ui.getEditorText(), "Use /skill:review "),
    )
    const original = await host.submit()
    assert(original.includes("Review the actual behavior."), original)
    assert(!original.includes("Later review instructions."), original)

    includeReview = false
    host.ui.setEditorText("Use $rvw")
    host.terminal.input("\t")
    await setImmediate()
    assert.equal(host.ui.getEditorText(), "Use $rvw")
    assert.equal(await host.submit(), "Use $rvw")

    includeReview = true
    host.session.settingsManager.setEnableSkillCommands(false)
    await reload()
    host.ui.setEditorText("Use $rvw")
    host.terminal.input("\t")
    await setImmediate()
    assert.equal(host.ui.getEditorText(), "Use $rvw")
    assert.equal(await host.submit(), "Use $rvw")

    host.session.settingsManager.setEnableSkillCommands(true)
    await writeFile(
      host.skillPath,
      "---\nname: renamed\ndescription: Renamed skill\n---\nReloaded instructions.\n",
    )
    await reload()
    host.ui.setEditorText("Use $ren")
    host.terminal.input("\t")
    await t.waitFor(() =>
      assert.equal(host.ui.getEditorText(), "Use /skill:renamed "),
    )
    assert((await host.submit()).includes("Reloaded instructions."))
    host.ui.setEditorText("Use $rvw")
    host.terminal.input("\t")
    await t.waitFor(() =>
      assert.equal(host.ui.getEditorText(), "Use /skill:review "),
    )
    assert((await host.submit()).includes("Later review instructions."))
  },
)

test(
  "native completion keeps dollar text literal inside a quoted file prefix",
  { timeout: 15000 },
  async (t) => {
    const host = await createHost(t, async (_pi, directory) => {
      await mkdir(join(directory, "notes"))
      await writeFile(join(directory, "notes", "review $rvw.md"), "Report.\n")
    })
    host.ui.setEditorText('Inspect @"notes/review $rvw')
    host.terminal.input("\t")
    await setImmediate()
    assert.equal(host.ui.getEditorText(), 'Inspect @"notes/review $rvw')
    assert.equal(await host.submit(), 'Inspect @"notes/review $rvw')
  },
)

test(
  "native file and directory completion retains its insertion and cursor behavior",
  { timeout: 15000 },
  async (t) => {
    const host = await createHost(t, async (_pi, directory) => {
      await mkdir(join(directory, "notes"))
      await writeFile(join(directory, "notes", "report.md"), "Report.\n")
    })
    host.ui.setEditorText("Inspect @not")
    host.terminal.output = ""
    host.terminal.input("\t")
    await t.waitFor(() =>
      assert.match(stripVTControlCharacters(host.terminal.output), /notes\//),
    )
    if (host.ui.getEditorText() === "Inspect @not") host.terminal.input("\t")
    assert.equal(host.ui.getEditorText(), "Inspect @notes/")
    host.terminal.input("rep")
    host.terminal.input("\t")
    await t.waitFor(() =>
      assert.equal(host.ui.getEditorText(), "Inspect @notes/report.md "),
    )
    host.terminal.input("here")
    assert.equal(await host.submit(), "Inspect @notes/report.md here")
  },
)

test(
  "native Tab completes a slash at the start of a later prose line",
  { timeout: 15000 },
  async (t) => {
    const host = await createHost(t)
    host.ui.setEditorText("First paragraph.\n\n/rvw")
    host.terminal.input("\t")
    await t.waitFor(() =>
      assert.equal(
        host.ui.getEditorText(),
        "First paragraph.\n\n/skill:review ",
      ),
    )
    assert((await host.submit()).includes("Review the actual behavior."))
  },
)

test(
  "a skill sharing a command name stays qualified while native command and argument completion retain dispatch",
  { timeout: 15000 },
  async (t) => {
    const received = Promise.withResolvers<string>()
    const host = await createHost(t, (pi) => {
      pi.registerCommand("review", {
        description: "Native review command",
        getArgumentCompletions: () => [
          { value: "/skill:review", label: "Native review argument" },
        ],
        handler: async (args) => received.resolve(args),
      })
    })
    host.ui.setEditorText("Use $rvw")
    host.terminal.input("\t")
    await t.waitFor(() =>
      assert.equal(host.ui.getEditorText(), "Use /skill:review "),
    )
    assert((await host.submit()).includes("Review the actual behavior."))

    host.ui.setEditorText("/rev")
    host.terminal.output = ""
    host.terminal.input("\t")
    await t.waitFor(() =>
      assert.match(
        stripVTControlCharacters(host.terminal.output),
        /Native review command/,
      ),
    )
    host.terminal.input("\t")
    assert.equal(host.ui.getEditorText(), "/review ")
    host.terminal.output = ""
    host.terminal.input("$")
    await t.waitFor(() =>
      assert.match(
        stripVTControlCharacters(host.terminal.output),
        /Native review argument/,
      ),
    )
    host.terminal.input("\t")
    assert.equal(host.ui.getEditorText(), "/review /skill:review")
    host.terminal.input("\r")
    assert.equal(await received.promise, "/skill:review")
    assert.equal(host.inputs.length, 1)
  },
)

test(
  "native completion inserts skills at the start and at quoted, parenthesized, and blockquote prose positions",
  { timeout: 15000 },
  async (t) => {
    const host = await createHost(t)
    for (const [draft, suffix, expected] of [
      ["$rvw", "", "/skill:review "],
      ["Apply ($rvw).", ").", "Apply (/skill:review )."],
      ['Apply "$rvw".', '".', 'Apply "/skill:review ".'],
      ["First paragraph.\n> $rvw", "", "First paragraph.\n> /skill:review "],
      ["- Apply $rvw", "", "- Apply /skill:review "],
    ] as const) {
      host.ui.setEditorText(draft)
      for (let index = 0; index < suffix.length; index += 1) {
        host.terminal.input("\x1b[D")
      }
      host.terminal.input("\t")
      await t.waitFor(() => assert.equal(host.ui.getEditorText(), expected))
      assert((await host.submit()).includes("Review the actual behavior."))
    }
  },
)

test(
  "skill completion leaves Markdown code and link destinations literal",
  { timeout: 15000 },
  async (t) => {
    const host = await createHost(t)
    for (const [draft, suffix] of [
      ["Example `$rvw`.", "`."],
      ["```text\n$rvw\n```", "\n```"],
      ["Example\n\n    $rvw", ""],
      ["[guide]($rvw)", ")"],
      ["- ` $rvw `", " `"],
      ["> - ` $rvw `", " `"],
      ["- [guide]($rvw)", ")"],
    ] as const) {
      host.ui.setEditorText(draft)
      for (let index = 0; index < suffix.length; index += 1) {
        host.terminal.input("\x1b[D")
      }
      host.terminal.input("\t")
      await setImmediate()
      assert.equal(host.ui.getEditorText(), draft)
    }
  },
)

test(
  "Enter accepts an inline slash skill without dispatching the draft as a command",
  { timeout: 15000 },
  async (t) => {
    const host = await createHost(t, async (pi, directory) => {
      const skillDir = join(directory, "refactor")
      await mkdir(skillDir)
      await writeFile(
        join(skillDir, "SKILL.md"),
        "---\nname: refactor\ndescription: Refactor behavior\n---\nRefactor carefully.\n",
      )
      pi.on("resources_discover", () => ({ skillPaths: [skillDir] }))
    })
    host.ui.setEditorText("Use /")
    host.terminal.output = ""
    host.terminal.input("\t")
    await t.waitFor(() =>
      assert.match(
        stripVTControlCharacters(host.terminal.output),
        /skill:review/,
      ),
    )
    host.terminal.input("\r")
    assert.equal(host.ui.getEditorText(), "Use /skill:review ")
    assert.deepEqual(host.inputs, [])
    host.terminal.input("here")
    assert((await host.submit()).includes("Use /skill:review here"))
  },
)

test(
  "native provider wrappers before and after skills retain their edits and cursor results",
  { timeout: 15000 },
  async (t) => {
    const host = await createHost(t, (pi) => {
      pi.on("session_start", (_event, ctx) => {
        ctx.ui.addAutocompleteProvider((current) => ({
          ...current,
          async getSuggestions(...args) {
            const suggestions = await current.getSuggestions(...args)
            return (
              suggestions && {
                ...suggestions,
                items: suggestions.items.map((item) =>
                  Object.assign({}, item, { label: `Before ${item.label}` }),
                ),
              }
            )
          },
          applyCompletion(...args) {
            const result = current.applyCompletion(...args)
            if (args[3].value === "skill:review") {
              result.lines.splice(
                result.cursorLine + 1,
                0,
                "Before insertion: ",
              )
              result.cursorLine += 1
              result.cursorCol = "Before insertion: ".length
            }
            return result
          },
        }))
      })
    })
    host.ui.addAutocompleteProvider((current) => ({
      ...current,
      async getSuggestions(...args) {
        const suggestions = await current.getSuggestions(...args)
        return (
          suggestions && {
            ...suggestions,
            items: suggestions.items.map(({ value, label, description }) =>
              Object.assign(
                { value, label: `${label} after` },
                description ? { description } : {},
              ),
            ),
          }
        )
      },
      applyCompletion(...args) {
        const result = current.applyCompletion(...args)
        result.lines[result.cursorLine] += "After insertion: "
        result.cursorCol += "After insertion: ".length
        return result
      },
    }))
    host.ui.setEditorText("Use ")
    host.terminal.output = ""
    host.terminal.input("$")
    await t.waitFor(() =>
      assert.match(
        stripVTControlCharacters(host.terminal.output),
        /Before skill:review after/,
      ),
    )
    host.terminal.input("\t")
    host.terminal.input("here")
    assert.equal(
      host.ui.getEditorText(),
      "Use /skill:review \nBefore insertion: After insertion: here",
    )
    const submitted = await host.submit()
    assert(submitted.includes("Review the actual behavior."), submitted)
    assert(
      submitted.includes("Before insertion: After insertion: here"),
      submitted,
    )
  },
)

test(
  "native Tab completes an inline slash at its range and keeps the caret before the suffix",
  { timeout: 15000 },
  async (t) => {
    const host = await createHost(t)
    host.ui.setEditorText("First paragraph.\nUse /rvw here.")
    for (let index = 0; index < " here.".length; index += 1) {
      host.terminal.input("\x1b[D")
    }
    host.terminal.input("\t")
    await t.waitFor(() =>
      assert.equal(
        host.ui.getEditorText(),
        "First paragraph.\nUse /skill:review  here.",
      ),
    )
    host.terminal.input("now")
    assert.equal(
      host.ui.getEditorText(),
      "First paragraph.\nUse /skill:review now here.",
    )
    const submitted = await host.submit()
    assert(submitted.includes("Review the actual behavior."), submitted)
    assert(submitted.includes("Use /skill:review now here."), submitted)
  },
)
