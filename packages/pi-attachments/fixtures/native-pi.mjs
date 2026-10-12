import assert from "node:assert/strict"
import { realpathSync } from "node:fs"
import fs, {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises"
import { createServer } from "node:http"
import { syncBuiltinESMExports } from "node:module"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import { fileURLToPath } from "node:url"
import { stripVTControlCharacters } from "node:util"
import {
  createAgentSessionFromServices,
  createAgentSessionRuntime,
  createAgentSessionServices,
  InteractiveMode,
  SessionManager,
  SettingsManager,
  VERSION,
} from "@earendil-works/pi-coding-agent"

export async function waitFor(check) {
  /* eslint-disable no-await-in-loop -- Observe the native UI after each asynchronous step. */
  for (let attempt = 0; ; attempt++) {
    try {
      return await check()
    } catch (error) {
      if (attempt === 200) throw error
      await delay(10)
    }
  }
  /* eslint-enable no-await-in-loop */
}

export async function nativePi(t, extensionPaths = [], state = {}) {
  const directory =
    state.directory ?? (await mkdtemp(join(tmpdir(), "pi-attachments-test-")))
  const agentDir = join(directory, "agent")
  await mkdir(agentDir, { recursive: true })
  if (state.keybindings) {
    await writeFile(
      join(agentDir, "keybindings.json"),
      JSON.stringify(state.keybindings),
    )
  }
  const previousAgentDir = process.env.PI_CODING_AGENT_DIR
  const previousOffline = process.env.PI_OFFLINE
  process.env.PI_CODING_AGENT_DIR = agentDir
  process.env.PI_OFFLINE = "1"
  let close
  t.after(async () => {
    await close?.()
    if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR
    else process.env.PI_CODING_AGENT_DIR = previousAgentDir
    if (previousOffline === undefined) delete process.env.PI_OFFLINE
    else process.env.PI_OFFLINE = previousOffline
    if (!state.directory) await rm(directory, { recursive: true, force: true })
  })

  const requests = []
  const replies = []
  const server = createServer(async (request, response) => {
    const chunks = []
    for await (const chunk of request) chunks.push(chunk)
    requests.push(JSON.parse(Buffer.concat(chunks).toString()))
    const reply = await replies.shift()
    if (reply instanceof Error) {
      response.writeHead(500, { "content-type": "application/json" })
      response.end(JSON.stringify({ error: { message: reply.message } }))
      return
    }
    response.writeHead(200, { "content-type": "text/event-stream" })
    response.end(
      `data: ${JSON.stringify({
        id: "attachment-response",
        object: "chat.completion.chunk",
        created: 1,
        model: "snapshot-model",
        choices: [
          reply ?? {
            index: 0,
            delta: { role: "assistant", content: "Received." },
            finish_reason: "stop",
          },
        ],
      })}\n\ndata: [DONE]\n\n`,
    )
  })
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
  t.after(() => new Promise((resolve) => server.close(resolve)))
  await writeFile(
    join(agentDir, "models.json"),
    JSON.stringify({
      providers: {
        "attachment-test": {
          baseUrl: `http://127.0.0.1:${server.address().port}/v1`,
          api: "openai-completions",
          apiKey: "local-test-only",
          models: [
            {
              id: "snapshot-model",
              input: ["text", "image"],
              contextWindow: 100000,
              maxTokens: 100,
            },
          ],
        },
      },
    }),
  )

  let ui
  let tui
  const inputs = []
  const users = []
  const observer = (pi) => {
    pi.on("input", (event) => {
      inputs.push(event)
    })
    pi.on("message_end", (event) => {
      if (event.message.role === "user") users.push(event.message)
    })
    pi.on("session_start", (_event, ctx) => {
      ui = ctx.ui
      ctx.ui.setWidget("test-other-widget", (nativeTui) => {
        tui = nativeTui
        return { render: () => ["Other extension widget"], invalidate() {} }
      })
    })
    pi.registerCommand("other-action", {
      description: "Exercise a separate native command",
      handler: async (_args, ctx) =>
        ctx.ui.setEditorText("Other action worked"),
    })
  }
  const createRuntime = async (options) => {
    const services = await createAgentSessionServices({
      cwd: options.cwd,
      agentDir,
      settingsManager: SettingsManager.inMemory({
        quietStartup: true,
        theme: "dark",
        lastChangelogVersion: VERSION,
        compaction: { enabled: false },
        retry: { enabled: false },
      }),
      resourceLoaderOptions: {
        noExtensions: true,
        noSkills: true,
        noPromptTemplates: true,
        noThemes: true,
        noContextFiles: true,
        additionalSkillPaths: state.skillPaths ?? [],
        additionalExtensionPaths: [
          ...extensionPaths,
          fileURLToPath(new URL("../src/index.ts", import.meta.url)),
        ],
        extensionFactories: [observer, ...(state.extensionFactories ?? [])],
      },
    })
    assert.deepEqual(services.resourceLoader.getExtensions().errors, [])
    const model = services.modelRuntime.getModel(
      "attachment-test",
      "snapshot-model",
    )
    assert.ok(model, "controlled model is available")
    const result = await createAgentSessionFromServices({
      services,
      sessionManager: options.sessionManager,
      sessionStartEvent: options.sessionStartEvent,
      model,
      tools: ["read"],
    })
    return { ...result, services, diagnostics: services.diagnostics }
  }
  const runtime = await createAgentSessionRuntime(createRuntime, {
    cwd: directory,
    agentDir,
    sessionManager: state.sessionFile
      ? SessionManager.open(state.sessionFile, undefined, directory)
      : SessionManager.create(directory, join(agentDir, "sessions")),
  })
  let input
  let output = ""
  const terminal = {
    columns: 100,
    rows: 30,
    kittyProtocolActive: true,
    start(onInput) {
      input = onInput
    },
    stop() {},
    async drainInput() {},
    write(data) {
      output += data
    },
    moveBy() {},
    hideCursor() {},
    showCursor() {},
    clearLine() {},
    clearFromCursor() {},
    clearScreen() {},
    setTitle() {},
    setProgress() {},
    setProgramStatus() {},
  }
  const mode = new InteractiveMode(runtime, { terminal, tuiMode: "fullscreen" })
  let closed = false
  close = async () => {
    if (closed) return
    closed = true
    mode.stop()
    await runtime.dispose()
  }
  await mode.init()
  void mode.run()
  await delay(0)
  return {
    directory,
    agentDir,
    runtime,
    close,
    requests,
    replies,
    inputs,
    users,
    get ui() {
      return ui
    },
    get output() {
      return output
    },
    input: (data) => input(data),
    submit(text) {
      if (text !== undefined) ui.setEditorText(text)
      input("\r")
    },
    render() {
      output = ""
      tui.requestRender(true)
      tui.renderNow()
      return stripVTControlCharacters(output)
    },
  }
}

export function snapshotPath(text) {
  const match = /\[Attachment: [^\]]+\]\(<([^>]+)>\)/.exec(text)
  assert.ok(
    match,
    `expected a readable attachment reference, received ${JSON.stringify(text)}`,
  )
  return match[1]
}

export function holdFileRead(t, source) {
  const read = fs.readFile
  const open = fs.open
  const canonicalSource = realpathSync(source)
  const gate = Promise.withResolvers()
  let started = false
  const hold = async (contents) => {
    started = true
    await gate.promise
    return contents
  }
  const mocked = t.mock.method(fs, "readFile", async (...args) => {
    const contents = await read(...args)
    if (args[0] === source || args[0] === canonicalSource) {
      return hold(contents)
    }
    return contents
  })
  const opened = t.mock.method(fs, "open", async (...args) => {
    const file = await open(...args)
    if (args[0] === source || args[0] === canonicalSource) {
      const readHandle = file.readFile.bind(file)
      t.mock.method(file, "readFile", async (...options) =>
        hold(await readHandle(...options)),
      )
    }
    return file
  })
  syncBuiltinESMExports()
  t.after(() => {
    gate.resolve()
    mocked.mock.restore()
    opened.mock.restore()
    syncBuiltinESMExports()
  })
  return {
    started: () =>
      waitFor(() => assert.ok(started, "native action started the file read")),
    release: () => gate.resolve(),
  }
}

export async function retainedRequest(
  host,
  contains = "",
  kind = "Attachment",
) {
  const entries = await readdir(host.agentDir, {
    recursive: true,
    withFileTypes: true,
  })
  const files = await Promise.all(
    entries
      .filter((entry) => entry.isFile())
      .map(async (entry) => {
        const path = join(entry.parentPath, entry.name)
        return { path, text: await readFile(path, "utf8") }
      }),
  )
  const request = files.find(
    ({ text }) =>
      text.startsWith(`# ${kind} request\n`) && text.includes(contains),
  )
  assert.ok(request, "No readable attachment request was retained")
  return request
}
