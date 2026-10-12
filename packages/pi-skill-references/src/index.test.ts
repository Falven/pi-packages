/* eslint-disable no-await-in-loop -- These scenarios edit and submit one native draft at a time. */
import assert from "node:assert/strict"
import { once } from "node:events"
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import { createServer, type ServerResponse } from "node:http"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test, type TestContext } from "node:test"
import { setTimeout as delay } from "node:timers/promises"
import { fileURLToPath } from "node:url"
import { stripVTControlCharacters } from "node:util"
import {
  createAgentSessionFromServices,
  createAgentSessionRuntime,
  createAgentSessionServices,
  InteractiveMode,
  ModelRuntime,
  SessionManager,
  SettingsManager,
  VERSION,
  type CreateAgentSessionServicesOptions,
  type ExtensionAPI,
  type ExtensionUIContext,
  type InputEvent,
} from "@earendil-works/pi-coding-agent"
import type { Terminal } from "@earendil-works/pi-tui"

const image = {
  type: "image",
  data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==",
  mimeType: "image/png",
} as const

class TestTerminal implements Terminal {
  columns = 120
  rows = 40
  kittyProtocolActive = false
  output = ""
  input!: (data: string) => void

  start(onInput: (data: string) => void): void {
    this.input = onInput
  }
  write(data: string): void {
    this.output += data
  }
  stop(): void {}
  async drainInput(): Promise<void> {}
  moveBy(): void {}
  hideCursor(): void {}
  showCursor(): void {}
  clearLine(): void {}
  clearFromCursor(): void {}
  clearScreen(): void {}
  setTitle(): void {}
  setProgress(): void {}
  setProgramStatus(): void {}
}

function finishResponse(response: ServerResponse) {
  response.writeHead(200, { "content-type": "text/event-stream" })
  response.end(
    'data: {"choices":[{"index":0,"delta":{"role":"assistant","content":"Done."},"finish_reason":null}]}\n\n' +
      'data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n' +
      "data: [DONE]\n\n",
  )
}

async function createHost(
  t: TestContext,
  setupExtension?: (
    pi: ExtensionAPI,
    directory: string,
  ) => void | Promise<void>,
  holdResponses = false,
  resourceOverrides: Pick<
    NonNullable<CreateAgentSessionServicesOptions["resourceLoaderOptions"]>,
    "skillsOverride" | "extensionsOverride"
  > = {},
  interactive = true,
) {
  const root = await mkdtemp(join(tmpdir(), "pi-inline-skills-"))
  const agentDir = join(root, "agent")
  const skillDir = join(root, "skills", "review")
  const skillPath = join(skillDir, "SKILL.md")
  await mkdir(agentDir, { recursive: true })
  await mkdir(skillDir, { recursive: true })
  await writeFile(
    skillPath,
    "---\nname: review\ndescription: Review behavior\n---\nReview the actual behavior.\n",
  )

  const originalAgentDir = process.env["PI_CODING_AGENT_DIR"]
  const originalOffline = process.env["PI_OFFLINE"]
  let stopHost: (() => Promise<void>) | undefined
  process.env["PI_CODING_AGENT_DIR"] = agentDir
  process.env["PI_OFFLINE"] = "1"
  t.after(async () => {
    await stopHost?.()
    if (originalAgentDir === undefined)
      delete process.env["PI_CODING_AGENT_DIR"]
    else process.env["PI_CODING_AGENT_DIR"] = originalAgentDir
    if (originalOffline === undefined) delete process.env["PI_OFFLINE"]
    else process.env["PI_OFFLINE"] = originalOffline
    await rm(root, { recursive: true, force: true })
  })

  const pendingResponses: ServerResponse[] = []
  const server = createServer((request, response) => {
    request.resume()
    if (holdResponses) pendingResponses.push(response)
    else finishResponse(response)
  })
  server.listen(0, "127.0.0.1")
  await once(server, "listening")
  t.after(() => {
    server.closeAllConnections()
    server.close()
  })
  const address = server.address()
  assert(address && typeof address !== "string")
  const modelRuntime = await ModelRuntime.create({
    authPath: join(agentDir, "auth.json"),
    modelsPath: null,
    modelsStorePath: join(agentDir, "models-cache.json"),
    refreshOnCreate: false,
  })
  modelRuntime.registerProvider("inline-skill-test", {
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
    api: "openai-completions",
    apiKey: "test-only",
    models: [
      {
        id: "test",
        name: "Test",
        reasoning: false,
        input: ["text", "image"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 32000,
        maxTokens: 100,
      },
    ],
  })
  const model = modelRuntime.getModel("inline-skill-test", "test")
  assert(model)
  let ui: ExtensionUIContext | undefined
  const inputs: { text: string; draft: string }[] = []
  const runtime = await createAgentSessionRuntime(
    async ({ cwd, agentDir: runtimeAgentDir, sessionManager }) => {
      const services = await createAgentSessionServices({
        cwd,
        agentDir: runtimeAgentDir,
        modelRuntime,
        settingsManager: SettingsManager.inMemory({
          quietStartup: true,
          lastChangelogVersion: VERSION,
          theme: "dark",
          compaction: { enabled: false },
          retry: { enabled: false },
        }),
        resourceLoaderOptions: {
          noExtensions: true,
          noSkills: true,
          noPromptTemplates: true,
          noThemes: true,
          noContextFiles: true,
          additionalExtensionPaths: [
            fileURLToPath(new URL("./index.ts", import.meta.url)),
          ],
          additionalSkillPaths: [skillDir],
          extensionsOverride: (result) => ({
            ...result,
            // Observe the public input before the package transforms it.
            extensions: result.extensions.toReversed(),
          }),
          extensionFactories: [
            async (pi) => {
              pi.on("session_start", (_event, ctx) => {
                ui = ctx.ui
              })
              pi.on("input", (event, ctx) => {
                inputs.push({ text: event.text, draft: ctx.ui.getEditorText() })
              })
              await setupExtension?.(pi, root)
            },
          ],
          ...resourceOverrides,
        },
      })
      const result = await createAgentSessionFromServices({
        services,
        sessionManager,
        model,
        tools: [],
      })
      assert.deepEqual(result.extensionsResult.errors, [])
      return { ...result, services, diagnostics: services.diagnostics }
    },
    { cwd: root, agentDir, sessionManager: SessionManager.inMemory(root) },
  )
  const terminal = new TestTerminal()
  const mode = new InteractiveMode(runtime, { terminal, tuiMode: "fullscreen" })
  stopHost = async () => {
    if (interactive) mode.stop()
    await runtime.dispose()
  }
  if (interactive) {
    await mode.init()
    void mode.run()
  } else {
    await runtime.session.bindExtensions({ mode: "print" })
  }
  assert(ui)

  return {
    ui,
    inputs,
    terminal,
    skillDir,
    skillPath,
    session: runtime.session,
    pendingResponses,
    reply() {
      const response = pendingResponses.shift()
      assert(response, "The controlled model must have a pending request")
      finishResponse(response)
    },
    async submit() {
      const ended = new Promise<void>((resolve) => {
        const unsubscribe = runtime.session.subscribe((event) => {
          if (event.type === "agent_end") {
            unsubscribe()
            resolve()
          }
        })
      })
      terminal.input("\r")
      await ended
      await runtime.session.waitForIdle()
      const answer = runtime.session.messages.findLast(
        (item) => item.role === "assistant",
      )
      assert(answer?.role === "assistant")
      assert.equal(answer.stopReason, "stop", answer.errorMessage)
      assert.equal(
        answer.content.find((item) => item.type === "text")?.text,
        "Done.",
      )
      const message = runtime.session.messages.findLast(
        (item) => item.role === "user",
      )
      assert(message?.role === "user")
      assert(Array.isArray(message.content))
      return message.content
        .filter((item) => item.type === "text")
        .map((item) => item.text)
        .join("\n")
    },
  }
}

test(
  "native typed canonical prose invokes the effective skill without rewriting draft history",
  { timeout: 15000 },
  async (t) => {
    const host = await createHost(t)
    const draft = "Please apply /skill:review to this change."
    for (const character of draft) host.terminal.input(character)
    assert.equal(host.ui.getEditorText(), draft)

    const submitted = await host.submit()
    assert(submitted.includes("Review the actual behavior."), submitted)
    assert(
      submitted.includes(`<skill name="review" location="${host.skillPath}">`),
      submitted,
    )
    assert(
      submitted.includes(`References are relative to ${host.skillDir}.`),
      submitted,
    )
    assert(submitted.includes(draft), submitted)
    assert(!submitted.includes("description: Review behavior"), submitted)

    host.terminal.input("\x1b[A")
    assert.equal(host.ui.getEditorText(), draft)
  },
)

test(
  "Markdown examples and destinations remain literal at native submission",
  { timeout: 15000 },
  async (t) => {
    const host = await createHost(t)
    const draft = [
      "Literal examples:",
      "` /skill:review ` and `` /skill:review ` example ``",
      "",
      "```text",
      "/skill:review",
      "```",
      "",
      "~~~",
      "/skill:review",
      "~~~",
      "",
      "    /skill:review",
      "\t/skill:review",
      "",
      "- ` /skill:review `",
      "> ```",
      "> /skill:review",
      "> ```",
      "",
      "\\/skill:review [link](/skill:review) [reference][example]",
      "",
      "[example]: /skill:review",
      "",
      "https://example.com/skill:review <https://example.com/skill:review>",
      "/skill:review/scripts /skill:review.md ./skill:review ~/skill:review dir/skill:review",
      "$review /review /skill:reviewing /skill:review-extra",
    ].join("\n")
    host.ui.pasteToEditor(draft)
    const nativeDraft = host.ui.getEditorText()
    assert.equal(await host.submit(), nativeDraft)
  },
)

test(
  "canonical references at prose punctuation boundaries invoke the complete skill",
  { timeout: 15000 },
  async (t) => {
    const host = await createHost(t)
    for (const draft of [
      "Apply (/skill:review).",
      "Apply /skill:review, please.",
      "Apply **/skill:review**.",
      "Apply [the /skill:review skill](https://example.com).",
    ]) {
      host.ui.setEditorText(draft)
      const submitted = await host.submit()
      assert(submitted.includes("Review the actual behavior."), submitted)
      assert(submitted.includes(draft), submitted)
    }
  },
)

test(
  "leading native prompt commands keep their argument handling",
  { timeout: 15000 },
  async (t) => {
    const host = await createHost(t, async (pi, directory) => {
      const promptPath = join(directory, "reply.md")
      await writeFile(promptPath, "Native template receives $ARGUMENTS.\n")
      pi.on("resources_discover", () => ({ promptPaths: [promptPath] }))
    })
    host.ui.setEditorText("/reply /skill:review")
    assert.equal(
      await host.submit(),
      "Native template receives /skill:review.\n",
    )
  },
)

test(
  "escaped name suffixes and path separators do not turn prefixes into references",
  { timeout: 15000 },
  async (t) => {
    const host = await createHost(t)
    const draft = String.raw`Keep /skill:review\-extra, /skill:review\_notes, and \\/skill:review literal.`
    host.ui.setEditorText(draft)
    assert.equal(await host.submit(), draft)
  },
)

test(
  "native first-line trimming invokes the reference and preserves native history",
  { timeout: 15000 },
  async (t) => {
    const host = await createHost(t)
    const draft = "    /skill:review"
    host.ui.setEditorText(draft)
    assert.equal(host.ui.getEditorText(), draft)
    const submitted = await host.submit()
    assert.deepEqual(host.inputs, [{ text: "/skill:review", draft: "" }])
    assert.equal(
      submitted,
      `<skill name="review" location="${host.skillPath}">\nReferences are relative to ${host.skillDir}.\n\nReview the actual behavior.\n</skill>\n\n/skill:review`,
    )

    host.terminal.input("\x1b[A")
    assert.equal(host.ui.getEditorText(), "/skill:review")
  },
)

test(
  "a fenced leading reference remains literal in native submission and history",
  { timeout: 15000 },
  async (t) => {
    const host = await createHost(t)
    const draft = "```text\n/skill:review\n```"
    host.ui.setEditorText(draft)
    assert.equal(await host.submit(), draft)
    assert.deepEqual(host.inputs, [{ text: draft, draft: "" }])

    host.terminal.input("\x1b[A")
    assert.equal(host.ui.getEditorText(), draft)
  },
)

for (const route of ["steer", "followUp"] as const) {
  test(
    `native ${route} retains trimming and fenced leading examples through delivery`,
    { timeout: 15000 },
    async (t) => {
      const deliveries: InputEvent[] = []
      const host = await createHost(
        t,
        (pi) => {
          pi.on("input", (event) => {
            deliveries.push(event)
          })
        },
        true,
      )
      const expanded = `<skill name="review" location="${host.skillPath}">\nReferences are relative to ${host.skillDir}.\n\nReview the actual behavior.\n</skill>\n\n/skill:review`
      const fenced = "```text\n/skill:review\n```"
      for (const [draft, nativeDraft, expected] of [
        ["    /skill:review", "/skill:review", expanded],
        [fenced, fenced, fenced],
      ] as const) {
        host.ui.setEditorText("First request")
        host.terminal.input("\r")
        await t.waitFor(() => assert.equal(host.pendingResponses.length, 1))
        assert(host.session.isStreaming)

        host.ui.setEditorText(draft)
        assert.equal(host.ui.getEditorText(), draft)
        host.terminal.input(route === "steer" ? "\r" : "\x1b\r")
        await t.waitFor(() =>
          assert.deepEqual(
            route === "steer"
              ? host.session.getSteeringMessages()
              : host.session.getFollowUpMessages(),
            [expected],
          ),
        )
        assert.equal(deliveries.at(-1)?.streamingBehavior, route)
        assert.equal(deliveries.at(-1)?.source, "interactive")
        assert.deepEqual(host.inputs.at(-1), { text: nativeDraft, draft: "" })
        assert.equal(host.ui.getEditorText(), "")

        host.reply()
        await t.waitFor(() => assert.equal(host.pendingResponses.length, 1))
        host.reply()
        await host.session.waitForIdle()
        const message = host.session.messages.findLast(
          (item) => item.role === "user",
        )
        assert.deepEqual(message?.content, [{ type: "text", text: expected }])
        const answer = host.session.messages.findLast(
          (item) => item.role === "assistant",
        )
        assert(answer?.role === "assistant")
        assert.equal(answer.stopReason, "stop", answer.errorMessage)

        host.terminal.input("\x1b[A")
        assert.equal(host.ui.getEditorText(), nativeDraft)
      }
    },
  )
}

test(
  "native paste and another extension's insertion remain character-editable references",
  { timeout: 15000 },
  async (t) => {
    const draft = "Please apply /skill:review"
    const host = await createHost(t, (pi) => {
      pi.registerCommand("insert-reference", {
        handler: async (_args, ctx) => ctx.ui.pasteToEditor(draft),
      })
    })
    for (const insert of [
      () => host.terminal.input(`\x1b[200~${draft}\x1b[201~`),
      () => host.ui.pasteToEditor(draft),
      () => host.session.prompt("/insert-reference"),
    ]) {
      await insert()
      assert.equal(host.ui.getEditorText(), draft)
      host.terminal.input("\x7f")
      assert.equal(host.ui.getEditorText(), "Please apply /skill:revie")
      assert.equal(await host.submit(), "Please apply /skill:revie")
      host.terminal.input("\x1b[A")
      host.terminal.input("\x05")
      host.terminal.input("w")
      assert.equal(host.ui.getEditorText(), draft)
      assert((await host.submit()).includes("Review the actual behavior."))
    }
  },
)

test(
  "unreadable skills surface the read failure and leave a recoverable reference",
  { timeout: 15000 },
  async (t) => {
    const host = await createHost(t)
    const draft = "Please apply /skill:review to this change."
    await rm(host.skillPath)
    host.ui.setEditorText(draft)
    assert.equal(await host.submit(), draft)
    await delay(30)
    assert.match(stripVTControlCharacters(host.terminal.output), /ENOENT/)

    host.terminal.input("\x1b[A")
    assert.equal(host.ui.getEditorText(), draft)
    await writeFile(host.skillPath, "Recovered skill instructions.\n")
    const retry = await host.submit()
    assert(retry.includes("Recovered skill instructions."), retry)
    assert(retry.includes(draft), retry)
  },
)

test(
  "a leading canonical reference survives the host's subsequent skill step without a second expansion",
  { timeout: 15000 },
  async (t) => {
    const host = await createHost(t)
    const draft = "/skill:review Explain this change."
    host.ui.setEditorText(draft)
    const submitted = await host.submit()
    assert.equal([...submitted.matchAll(/<skill name="review"/g)].length, 1)
    assert(submitted.includes("Review the actual behavior."), submitted)
    assert(submitted.includes(draft), submitted)
  },
)

test(
  "native leading and inline references expand each resource once in first-reference order",
  { timeout: 15000 },
  async (t) => {
    let planDir = ""
    const host = await createHost(t, async (pi, directory) => {
      planDir = join(directory, "skills", "plan")
      await mkdir(planDir, { recursive: true })
      await writeFile(
        join(planDir, "SKILL.md"),
        "---\nname: plan\ndescription: Plan changes\n---\nPlan the smallest change.\n",
      )
      pi.on("resources_discover", () => ({ skillPaths: [planDir] }))
    })
    const draft =
      "/skill:plan Then /skill:review, /skill:plan and /skill:review."
    host.ui.setEditorText(draft)
    assert.equal(
      await host.submit(),
      `<skill name="plan" location="${join(planDir, "SKILL.md")}">\nReferences are relative to ${planDir}.\n\nPlan the smallest change.\n</skill>\n\n` +
        `<skill name="review" location="${host.skillPath}">\nReferences are relative to ${host.skillDir}.\n\nReview the actual behavior.\n</skill>\n\n${draft}`,
    )

    host.terminal.input("\x1b[A")
    assert.equal(host.ui.getEditorText(), draft)
  },
)

test(
  "unknown and unreadable references survive alongside successfully expanded skills",
  { timeout: 15000 },
  async (t) => {
    let planDir = ""
    const host = await createHost(t, async (pi, directory) => {
      planDir = join(directory, "skills", "plan")
      await mkdir(planDir, { recursive: true })
      await writeFile(
        join(planDir, "SKILL.md"),
        "---\nname: plan\ndescription: Plan changes\n---\nPlan the smallest change.\n",
      )
      pi.on("resources_discover", () => ({ skillPaths: [planDir] }))
    })
    await rm(host.skillPath)
    const draft =
      "/skill:review Also /skill:missing, /skill:plan and /skill:review."
    host.ui.setEditorText(draft)
    assert.equal(
      await host.submit(),
      `<skill name="plan" location="${join(planDir, "SKILL.md")}">\nReferences are relative to ${planDir}.\n\nPlan the smallest change.\n</skill>\n\n${draft}`,
    )
    await t.waitFor(() =>
      assert.match(stripVTControlCharacters(host.terminal.output), /ENOENT/),
    )

    host.terminal.input("\x1b[A")
    assert.equal(host.ui.getEditorText(), draft)
  },
)

test(
  "headless native submission reports unreadable skills while retaining successful expansion",
  { timeout: 15000 },
  async (t) => {
    let planPath = ""
    const host = await createHost(
      t,
      async (pi, directory) => {
        const planDir = join(directory, "skills", "plan")
        planPath = join(planDir, "SKILL.md")
        await mkdir(planDir, { recursive: true })
        await writeFile(
          planPath,
          "---\nname: plan\ndescription: Plan changes\n---\nPlan the smallest change.\n",
        )
        pi.on("resources_discover", () => ({ skillPaths: [planDir] }))
      },
      false,
      {},
      false,
    )
    await rm(planPath)
    const errors = t.mock.method(console, "error", () => {})
    const prompt = "/skill:plan Then /skill:review and /skill:plan."
    await host.session.prompt(prompt)
    const message = host.session.messages.findLast(
      (item) => item.role === "user",
    )
    assert.deepEqual(message?.content, [
      {
        type: "text",
        text: `<skill name="review" location="${host.skillPath}">\nReferences are relative to ${host.skillDir}.\n\nReview the actual behavior.\n</skill>\n\n${prompt}`,
      },
    ])
    assert.match(
      errors.mock.calls.map((call) => call.arguments.join(" ")).join("\n"),
      /ENOENT/,
    )
  },
)

test(
  "native catalog aliases deduplicate by resource with the first reference's context",
  { timeout: 15000 },
  async (t) => {
    const host = await createHost(t, undefined, false, {
      skillsOverride: (result) => {
        const review = result.skills.find((skill) => skill.name === "review")
        assert(review)
        return {
          ...result,
          skills: [...result.skills, { ...review, name: "review-alias" }],
        }
      },
    })
    for (const [draft, name] of [
      ["/skill:review-alias Then /skill:review.", "review-alias"],
      ["Apply /skill:review, then /skill:review-alias.", "review"],
    ] as const) {
      host.ui.setEditorText(draft)
      assert.equal(
        await host.submit(),
        `<skill name="${name}" location="${host.skillPath}">\nReferences are relative to ${host.skillDir}.\n\nReview the actual behavior.\n</skill>\n\n${draft}`,
      )
    }
  },
)

test(
  "skill bodies retain canonical references without recursively invoking them",
  { timeout: 15000 },
  async (t) => {
    const host = await createHost(t, async (pi, directory) => {
      const planDir = join(directory, "skills", "plan")
      await mkdir(planDir, { recursive: true })
      await writeFile(
        join(planDir, "SKILL.md"),
        "---\nname: plan\ndescription: Plan changes\n---\nPlan the smallest change.\n",
      )
      pi.on("resources_discover", () => ({ skillPaths: [planDir] }))
    })
    await writeFile(
      host.skillPath,
      "Review without invoking /skill:plan or /skill:review.\n",
    )
    const draft = "Please apply /skill:review and /skill:review."
    host.ui.setEditorText(draft)
    assert.equal(
      await host.submit(),
      `<skill name="review" location="${host.skillPath}">\nReferences are relative to ${host.skillDir}.\n\nReview without invoking /skill:plan or /skill:review.\n</skill>\n\n${draft}`,
    )
  },
)

test(
  "native extension and built-in commands receive their original arguments",
  { timeout: 15000 },
  async (t) => {
    const command = Promise.withResolvers<string>()
    const host = await createHost(t, (pi) => {
      pi.registerCommand("review", {
        handler: async (args, ctx) => {
          ctx.ui.setEditorText(`Command received ${args}`)
          command.resolve(args)
        },
      })
    })
    host.ui.setEditorText("/review /skill:review")
    host.terminal.input("\r")
    assert.equal(await command.promise, "/skill:review")
    assert.equal(host.ui.getEditorText(), "Command received /skill:review")

    host.ui.setEditorText("/name Keep /skill:review")
    host.terminal.input("\r")
    assert.equal(
      host.session.sessionManager.getSessionName(),
      "Keep /skill:review",
    )
    assert.deepEqual(host.inputs, [])
    assert.deepEqual(host.session.messages, [])
  },
)

test(
  "native resource discovery, precedence, and reload determine the effective skill",
  { timeout: 15000 },
  async (t) => {
    let discoveredPath = ""
    const host = await createHost(t, async (pi, directory) => {
      const discoveredDir = join(directory, "discovered", "review")
      discoveredPath = join(discoveredDir, "SKILL.md")
      await mkdir(discoveredDir, { recursive: true })
      await writeFile(
        discoveredPath,
        "---\nname: review\ndescription: Later candidate\n---\nLater candidate instructions.\n",
      )
      pi.on("resources_discover", () => ({ skillPaths: [discoveredDir] }))
    })
    host.ui.setEditorText("Apply /skill:review here.")
    const initial = await host.submit()
    assert(initial.includes("Review the actual behavior."), initial)
    assert(!initial.includes("Later candidate instructions."), initial)

    await writeFile(
      host.skillPath,
      "---\nname: renamed\ndescription: Renamed skill\n---\nReloaded instructions.\n",
    )
    await host.session.reload()
    host.ui.setEditorText("Apply /skill:review here.")
    const discovered = await host.submit()
    assert(discovered.includes("Later candidate instructions."), discovered)
    assert(discovered.includes(`location="${discoveredPath}"`), discovered)

    host.ui.setEditorText("Apply /skill:renamed here.")
    assert((await host.submit()).includes("Reloaded instructions."))
  },
)

test(
  "indented code stays literal when the public session receives its indentation",
  { timeout: 15000 },
  async (t) => {
    const host = await createHost(t)
    const draft = "    /skill:review"
    await host.session.prompt(draft)
    const message = host.session.messages.findLast(
      (item) => item.role === "user",
    )
    assert.deepEqual(message?.content, [{ type: "text", text: draft }])
    assert.deepEqual(host.inputs, [{ text: draft, draft: "" }])
  },
)

for (const route of ["normal", "steer", "followUp"] as const) {
  for (const placement of ["before", "after"] as const) {
    test(
      `native ${route} preserves images and transforms ${placement} skill expansion`,
      { timeout: 15000 },
      async (t) => {
        const deliveries: InputEvent[] = []
        const host = await createHost(
          t,
          (pi) => {
            pi.on("input", (event) => {
              deliveries.push(event)
              if (event.text === "First request") return
              return {
                action: "transform",
                text: `${event.text}\nOther input transformation.`,
                images: [...(event.images ?? []), image],
              }
            })
          },
          route !== "normal",
          placement === "after"
            ? { extensionsOverride: (result) => result }
            : {},
        )
        const draft = "/skill:review Check /skill:review again."
        const expanded = `<skill name="review" location="${host.skillPath}">\nReferences are relative to ${host.skillDir}.\n\nReview the actual behavior.\n</skill>\n\n${draft}`
        const expected = `${expanded}\nOther input transformation.`
        if (route !== "normal") {
          host.ui.setEditorText("First request")
          host.terminal.input("\r")
          await t.waitFor(() => assert.equal(host.pendingResponses.length, 1))
        }

        host.ui.setEditorText(draft)
        if (route === "normal") {
          assert.equal(await host.submit(), expected)
        } else {
          host.terminal.input(route === "steer" ? "\r" : "\x1b\r")
          await t.waitFor(() =>
            assert.deepEqual(
              route === "steer"
                ? host.session.getSteeringMessages()
                : host.session.getFollowUpMessages(),
              [expected],
            ),
          )
          host.reply()
          await t.waitFor(() => assert.equal(host.pendingResponses.length, 1))
          host.reply()
          await host.session.waitForIdle()
        }

        assert.equal(
          deliveries.at(-1)?.text,
          placement === "before" ? draft : expanded,
        )
        assert.equal(deliveries.at(-1)?.source, "interactive")
        assert.equal(
          deliveries.at(-1)?.streamingBehavior,
          route === "normal" ? undefined : route,
        )
        const message = host.session.messages.findLast(
          (item) => item.role === "user",
        )
        assert.deepEqual(message?.content, [
          { type: "text", text: expected },
          image,
        ])
        host.terminal.input("\x1b[A")
        assert.equal(host.ui.getEditorText(), draft)
      },
    )
  }
}

test(
  "public session submissions retain input source, incoming images, and the active draft",
  { timeout: 15000 },
  async (t) => {
    const deliveries: InputEvent[] = []
    const host = await createHost(
      t,
      (pi) => {
        pi.on("input", (event) => {
          deliveries.push(event)
        })
      },
      false,
      { extensionsOverride: (result) => result },
    )
    const activeDraft = "Keep this unsent draft /skill:review."
    const prompt = "/skill:review Apply /skill:review again."
    const expected = `<skill name="review" location="${host.skillPath}">\nReferences are relative to ${host.skillDir}.\n\nReview the actual behavior.\n</skill>\n\n${prompt}`
    host.ui.setEditorText(activeDraft)
    for (const source of ["rpc", "extension"] as const) {
      if (source === "rpc") {
        await host.session.prompt(prompt, { source, images: [image] })
      } else {
        await host.session.sendUserMessage([
          { type: "text", text: prompt },
          image,
        ])
      }
      await host.session.waitForIdle()
      assert.equal(deliveries.at(-1)?.text, expected)
      assert.equal(deliveries.at(-1)?.source, source)
      assert.deepEqual(deliveries.at(-1)?.images, [image])
      const message = host.session.messages.findLast(
        (item) => item.role === "user",
      )
      assert.deepEqual(message?.content, [
        { type: "text", text: expected },
        image,
      ])
      assert.equal(host.ui.getEditorText(), activeDraft)
    }
  },
)
