import assert from "node:assert/strict"
import { once } from "node:events"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { createServer, type ServerResponse } from "node:http"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { stripVTControlCharacters } from "node:util"
import { setTimeout } from "node:timers/promises"
import type { TestContext } from "node:test"
import {
  createAgentSessionFromServices,
  createAgentSessionRuntime,
  createAgentSessionServices,
  InteractiveMode,
  SessionManager,
  SettingsManager,
  type AgentSessionRuntime,
  type ExtensionContext,
  type ExtensionFactory,
} from "@earendil-works/pi-coding-agent"

// Only the terminal and model server are substitutes; Pi owns all host routes.
class RecordingTerminal {
  columns = 60
  rows = 24
  kittyProtocolActive = true
  output = ""
  input: ((data: string) => void) | undefined

  start(onInput: (data: string) => void) {
    this.input = onInput
  }
  stop() {
    this.input = undefined
  }
  async drainInput() {}
  write(data: string) {
    this.output += data
  }
  moveBy() {}
  hideCursor() {}
  showCursor() {}
  clearLine() {}
  clearFromCursor() {}
  clearScreen() {}
  setTitle() {}
  setProgress() {}
}

type HostOptions = {
  columns?: number
  keybindings?: Record<string, string>
  extension?: ExtensionFactory
  holdResponses?: boolean
  responseStatus?: number
  persistSession?: boolean
  directory?: string
  sessionFile?: string
}

export async function openHost(t: TestContext, options: HostOptions = {}) {
  const directory =
    options.directory ?? (await mkdtemp(join(tmpdir(), "pi-composer-test-")))
  const previousAgentDir = process.env["PI_CODING_AGENT_DIR"]
  const previousOffline = process.env["PI_OFFLINE"]
  process.env["PI_CODING_AGENT_DIR"] = directory
  process.env["PI_OFFLINE"] = "1"
  let activeRuntime: AgentSessionRuntime | undefined
  let activeMode: InteractiveMode | undefined
  const close = async () => {
    await activeRuntime?.dispose()
    activeRuntime = undefined
    activeMode?.stop()
    activeMode = undefined
  }

  const requests: { messages: { role: string; content: unknown }[] }[] = []
  const pendingResponses: ServerResponse[] = []
  const finishResponse = (response: ServerResponse) => {
    if (options.responseStatus) {
      response.writeHead(options.responseStatus, {
        "content-type": "application/json",
      })
      response.end(
        JSON.stringify({ error: { message: "Controlled model failure" } }),
      )
      return
    }
    response.writeHead(200, { "content-type": "text/event-stream" })
    response.end(
      `data: ${JSON.stringify({
        id: "composer-test",
        object: "chat.completion.chunk",
        model: "draft-test",
        choices: [
          {
            index: 0,
            delta: { role: "assistant", content: "Received." },
            finish_reason: null,
          },
        ],
      })}\n\ndata: ${JSON.stringify({
        id: "composer-test",
        object: "chat.completion.chunk",
        choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
      })}\n\ndata: [DONE]\n\n`,
    )
  }
  const server = createServer(async (request, response) => {
    let body = ""
    for await (const chunk of request) body += chunk
    requests.push(JSON.parse(body))
    if (options.holdResponses) pendingResponses.push(response)
    else finishResponse(response)
  })
  t.after(async () => {
    try {
      await close()
    } finally {
      server.closeAllConnections()
      server.close()
      if (previousAgentDir === undefined)
        delete process.env["PI_CODING_AGENT_DIR"]
      else process.env["PI_CODING_AGENT_DIR"] = previousAgentDir
      if (previousOffline === undefined) delete process.env["PI_OFFLINE"]
      else process.env["PI_OFFLINE"] = previousOffline
      if (!options.directory)
        await rm(directory, { recursive: true, force: true })
    }
  })
  if (options.keybindings) {
    await writeFile(
      join(directory, "keybindings.json"),
      JSON.stringify(options.keybindings),
    )
  }
  server.listen(0, "127.0.0.1")
  await once(server, "listening")
  const address = server.address()
  assert(address && typeof address === "object")
  let context: ExtensionContext | undefined
  const runtime = await createAgentSessionRuntime(
    async ({ cwd, agentDir, sessionManager, sessionStartEvent }) => {
      const services = await createAgentSessionServices({
        cwd,
        agentDir,
        settingsManager: SettingsManager.inMemory({
          quietStartup: true,
          theme: "dark",
          editorPaddingX: 0,
          compaction: { enabled: false },
          retry: { enabled: false },
        }),
        resourceLoaderOptions: {
          additionalExtensionPaths: [
            new URL("../src/index.ts", import.meta.url).pathname,
          ],
          noSkills: true,
          noPromptTemplates: true,
          noThemes: true,
          noContextFiles: true,
          extensionFactories: [
            (pi) => {
              pi.registerProvider("composer-test", {
                baseUrl: `http://127.0.0.1:${address.port}/v1`,
                api: "openai-completions",
                apiKey: "test-only",
                models: [
                  {
                    id: "draft-test",
                    name: "Draft test",
                    reasoning: false,
                    input: ["text"],
                    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
                    contextWindow: 128000,
                    maxTokens: 100,
                  },
                ],
              })
              pi.on("session_start", (_event, ctx) => {
                context = ctx
              })
            },
            ...(options.extension ? [options.extension] : []),
          ],
        },
      })
      assert.deepEqual(services.resourceLoader.getExtensions().errors, [])
      assert.deepEqual(services.diagnostics, [])
      const model = services.modelRuntime.getModel(
        "composer-test",
        "draft-test",
      )
      assert(model)
      return {
        ...(await createAgentSessionFromServices({
          services,
          sessionManager,
          ...(sessionStartEvent ? { sessionStartEvent } : {}),
          model,
          noTools: "all",
        })),
        services,
        diagnostics: [],
      }
    },
    {
      cwd: directory,
      agentDir: directory,
      sessionManager: options.sessionFile
        ? SessionManager.open(options.sessionFile)
        : options.persistSession
          ? SessionManager.create(directory)
          : SessionManager.inMemory(directory),
    },
  )
  activeRuntime = runtime
  const terminal = new RecordingTerminal()
  terminal.columns = options.columns ?? 60
  const interactive = new InteractiveMode(runtime, {
    terminal,
    tuiMode: "fullscreen",
  })
  activeMode = interactive
  await interactive.init()
  assert(context, "Pi must emit session_start with its live UI context")
  void interactive.run()
  await setTimeout(0)

  return {
    get ui() {
      return context!.ui
    },
    get session() {
      return runtime.session
    },
    runtime,
    directory,
    close,
    requests,
    terminal,
    reply() {
      const response = pendingResponses.shift()
      assert(response, "The controlled model must have a pending request")
      finishResponse(response)
    },
    async key(data: string) {
      assert(terminal.input, "Pi must have started the terminal")
      terminal.input(data)
      await setTimeout(0)
    },
    async type(text: string) {
      for (const character of text) {
        assert(terminal.input)
        terminal.input(character)
      }
      await setTimeout(0)
    },
    async output() {
      await setTimeout(30)
      return stripVTControlCharacters(terminal.output)
    },
    async settled() {
      await t.waitFor(() => {
        assert(requests.length > 0 && !runtime.session.isStreaming)
      })
    },
  }
}
