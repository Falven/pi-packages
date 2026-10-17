import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { zstdDecompressSync } from "node:zlib";
import { stripVTControlCharacters } from "node:util";
import { setTimeout } from "node:timers/promises";
import type { TestContext } from "node:test";
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
  type ProviderConfig,
} from "@earendil-works/pi-coding-agent";

// Pi owns host routes; fixtures substitute the terminal, model server, and optional public OS boundary.
class RecordingTerminal {
  columns = 60;
  rows = 24;
  kittyProtocolActive = true;
  output = "";
  input: ((data: string) => void) | undefined;
  onResize: (() => void) | undefined;

  start(onInput: (data: string) => void, onResize: () => void) {
    this.input = onInput;
    this.onResize = onResize;
  }
  stop() {
    this.input = undefined;
    this.onResize = undefined;
  }
  resize(columns: number, rows: number) {
    this.columns = columns;
    this.rows = rows;
    this.onResize?.();
  }
  async drainInput() {}
  write(data: string) {
    this.output += data;
  }
  moveBy() {}
  hideCursor() {}
  showCursor() {}
  clearLine() {}
  clearFromCursor() {}
  clearScreen() {}
  setTitle() {}
  setProgress() {}
  setProgramStatus() {}
}

export type NativeHostOptions = {
  providerApi?: ProviderConfig["api"];
  providerProtocol?: "completions" | "responses";
  tuiMode?: "regular" | "fullscreen";
  onMount?: (host: InteractiveMode) => void;
  columns?: number;
  rows?: number;
  keybindings?: Record<string, string | string[] | undefined>;
  extension?: ExtensionFactory;
  extensionFactories?: ExtensionFactory[];
  extensionPaths?: string[];
  expectedExtensionErrors?: { path: string; error: string }[];
  skillPaths?: string[];
  noTools?: "all" | "builtin";
  tools?: string[];
  excludeTools?: string[];
  settings?: Parameters<typeof SettingsManager.inMemory>[0];
  holdResponses?: boolean;
  responseStatus?: number;
  noAuth?: boolean;
  persistSession?: boolean;
  directory?: string;
  cwd?: string;
  sessionFile?: string;
  headless?: boolean;
};

type ResponseStep =
  | { event: unknown }
  | { pause: true }
  | { end: true }
  | { disconnect: true }
  | { status: number };

export async function openNativeHost(t: TestContext, options: NativeHostOptions = {}) {
  const directory = options.directory ?? (await mkdtemp(join(tmpdir(), "pi-native-host-test-")));
  const initialCwd = options.cwd ?? directory;
  const previousAgentDir = process.env["PI_CODING_AGENT_DIR"];
  const previousOffline = process.env["PI_OFFLINE"];
  process.env["PI_CODING_AGENT_DIR"] = directory;
  process.env["PI_OFFLINE"] = "1";
  let activeRuntime: AgentSessionRuntime | undefined;
  let activeMode: InteractiveMode | undefined;
  const close = async () => {
    await activeRuntime?.dispose();
    activeRuntime = undefined;
    activeMode?.stop();
    activeMode = undefined;
  };

  const requests: { messages: { role: string; content: unknown }[] }[] = [];
  const requestBodies: string[] = [];
  const pendingResponses: ServerResponse[] = [];
  const scriptedResponses: ResponseStep[][] = [];
  let pausedResponse: { response: ServerResponse; remaining: ResponseStep[] } | undefined;
  const finishResponse = (response: ServerResponse, status = options.responseStatus) => {
    if (status && status >= 400) {
      response.writeHead(status, {
        "content-type": "application/json",
      });
      response.end(JSON.stringify({ error: { message: "Controlled model failure" } }));
      return;
    }
    response.writeHead(200, { "content-type": "text/event-stream" });
    if (options.providerProtocol === "responses") {
      const answer = {
        type: "message",
        id: "native-answer",
        role: "assistant",
        content: [{ type: "output_text", text: "Received." }],
      };
      const events = [
        { type: "response.created", response: { id: "native-response" } },
        {
          type: "response.output_item.added",
          output_index: 0,
          item: { ...answer, content: [] },
        },
        {
          type: "response.output_text.delta",
          output_index: 0,
          content_index: 0,
          delta: "Received.",
        },
        { type: "response.output_item.done", output_index: 0, item: answer },
        {
          type: "response.completed",
          response: { id: "native-response", status: "completed" },
        },
      ];
      response.end(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""));
      return;
    }
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
    );
  };
  const playResponse = (response: ServerResponse, steps: ResponseStep[]) => {
    for (const [index, step] of steps.entries()) {
      if ("pause" in step) {
        pausedResponse = { response, remaining: steps.slice(index + 1) };
        return;
      }
      if ("status" in step) {
        finishResponse(response, step.status);
        return;
      }
      if ("disconnect" in step) {
        response.destroy();
        return;
      }
      if ("end" in step) {
        response.end();
        return;
      }
      if (!response.headersSent) response.writeHead(200, { "content-type": "text/event-stream" });
      response.write(
        `data: ${typeof step.event === "string" ? step.event : JSON.stringify(step.event)}\n\n`,
      );
    }
    response.end();
  };
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const payload = Buffer.concat(chunks);
    const body =
      request.headers["content-encoding"] === "zstd"
        ? zstdDecompressSync(payload).toString()
        : payload.toString();
    requestBodies.push(body);
    requests.push(JSON.parse(body));
    const script = scriptedResponses.shift();
    if (script) playResponse(response, script);
    else if (options.holdResponses) pendingResponses.push(response);
    else finishResponse(response);
  });
  t.after(async () => {
    try {
      await close();
    } finally {
      server.closeAllConnections();
      server.close();
      if (previousAgentDir === undefined) delete process.env["PI_CODING_AGENT_DIR"];
      else process.env["PI_CODING_AGENT_DIR"] = previousAgentDir;
      if (previousOffline === undefined) delete process.env["PI_OFFLINE"];
      else process.env["PI_OFFLINE"] = previousOffline;
      if (!options.directory) await rm(directory, { recursive: true, force: true });
    }
  });
  if (options.keybindings) {
    await writeFile(join(directory, "keybindings.json"), JSON.stringify(options.keybindings));
  }
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert(address && typeof address === "object");
  let context: ExtensionContext | undefined;
  const initialSessionManager = options.sessionFile
    ? SessionManager.open(options.sessionFile)
    : options.persistSession
      ? SessionManager.create(initialCwd)
      : SessionManager.inMemory(initialCwd);
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
          ...options.settings,
        }),
        resourceLoaderOptions: {
          additionalExtensionPaths: options.extensionPaths ?? [],
          noExtensions: true,
          additionalSkillPaths: options.skillPaths ?? [],
          noSkills: true,
          noPromptTemplates: true,
          noThemes: true,
          noContextFiles: true,
          extensionFactories: [
            ...(options.extensionFactories ?? []),
            (pi) => {
              pi.registerProvider("composer-test", {
                baseUrl: `http://127.0.0.1:${address.port}/v1`,
                api:
                  options.providerApi ??
                  (options.providerProtocol === "responses"
                    ? "openai-responses"
                    : "openai-completions"),
                ...(options.noAuth
                  ? {}
                  : {
                      apiKey: `test.${Buffer.from(JSON.stringify({ "https://api.openai.com/auth": { chatgpt_account_id: "fixture" } })).toString("base64url")}.test`,
                    }),
                models: [
                  {
                    id: "draft-test",
                    name: "Draft test",
                    reasoning: false,
                    input: ["text", "image"],
                    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
                    contextWindow: 128000,
                    maxTokens: 100,
                  },
                ],
              });
              pi.on("session_start", (_event, ctx) => {
                context = ctx;
              });
            },
            ...(options.extension ? [options.extension] : []),
          ],
        },
      });
      assert.deepEqual(
        services.resourceLoader.getExtensions().errors,
        options.expectedExtensionErrors ?? [],
      );
      assert.deepEqual(services.diagnostics, []);
      const model = services.modelRuntime.getModel("composer-test", "draft-test");
      assert(model);
      return {
        ...(await createAgentSessionFromServices({
          services,
          sessionManager,
          ...(sessionStartEvent ? { sessionStartEvent } : {}),
          model,
          ...(options.noTools ? { noTools: options.noTools } : {}),
          ...(options.tools ? { tools: options.tools } : {}),
          ...(options.excludeTools ? { excludeTools: options.excludeTools } : {}),
        })),
        services,
        diagnostics: [],
      };
    },
    {
      cwd: initialSessionManager.getCwd(),
      agentDir: directory,
      sessionManager: initialSessionManager,
    },
  );
  activeRuntime = runtime;
  const terminal = new RecordingTerminal();
  terminal.columns = options.columns ?? 60;
  terminal.rows = options.rows ?? 24;
  const interactive = options.headless
    ? undefined
    : new InteractiveMode(runtime, {
        terminal,
        tuiMode: options.tuiMode ?? "fullscreen",
      });
  if (interactive && options.onMount) {
    const mode = interactive as unknown as {
      mountInteractiveTui(...args: unknown[]): unknown;
    };
    const original = mode.mountInteractiveTui;
    let firstMount = true;
    mode.mountInteractiveTui = (...args) => {
      const result = original.apply(interactive, args);
      if (firstMount) {
        firstMount = false;
        options.onMount?.(interactive);
      }
      return result;
    };
  }
  activeMode = interactive;
  if (interactive) {
    await interactive.init();
    void interactive.run();
  } else {
    const bind = async () => runtime.session.bindExtensions({ mode: "print" });
    runtime.setRebindSession(bind);
    await bind();
  }
  assert(context, "The host must emit session_start with its live context");
  await setTimeout(0);

  return {
    get ui() {
      return context!.ui;
    },
    get session() {
      return runtime.session;
    },
    runtime,
    directory,
    close,
    requests,
    requestBodies,
    terminal,
    screenLines() {
      assert(interactive, "A headless session has no terminal screen");
      return (
        interactive as unknown as { renderer: { getScreenLines(): string[] } }
      ).renderer.getScreenLines();
    },
    switchMode(mode: "regular" | "fullscreen") {
      assert(interactive, "A headless session has no terminal mode");
      return (
        interactive as unknown as {
          switchTuiMode(mode: "regular" | "fullscreen"): boolean;
        }
      ).switchTuiMode(mode);
    },
    async reload() {
      assert(interactive, "Use the session reload method in headless mode");
      await (
        interactive as unknown as { handleReloadCommand(): Promise<void> }
      ).handleReloadCommand();
    },
    queueResponse(...steps: ResponseStep[]) {
      scriptedResponses.push(steps);
    },
    resumeResponse() {
      assert(pausedResponse, "The controlled model must have a paused response");
      const { response, remaining } = pausedResponse;
      pausedResponse = undefined;
      playResponse(response, remaining);
    },
    reply(status?: number) {
      const response = pendingResponses.shift();
      assert(response, "The controlled model must have a pending request");
      finishResponse(response, status);
    },
    async key(data: string) {
      assert(terminal.input, "Pi must have started the terminal");
      terminal.input(data);
      await setTimeout(0);
    },
    async type(text: string) {
      for (const character of text) {
        assert(terminal.input);
        terminal.input(character);
      }
      await setTimeout(0);
    },
    async output() {
      await setTimeout(30);
      return stripVTControlCharacters(terminal.output);
    },
    async frame() {
      assert(interactive, "A headless session has no terminal frame");
      terminal.output = "";
      (
        interactive as unknown as {
          ui: { requestRender(force: boolean): void };
        }
      ).ui.requestRender(true);
      await setTimeout(30);
      return stripVTControlCharacters(terminal.output);
    },
    async settled() {
      await t.waitFor(() => {
        assert(requests.length > 0 && !runtime.session.isStreaming);
      });
    },
    async attachFile(path: string) {
      const pending = runtime.session.prompt("/attach");
      await t.waitFor(async () => assert.match(await this.frame(), /File path…/));
      await this.key("\r");
      await t.waitFor(async () => assert.match(await this.frame(), /Attach file/));
      await this.key(`\x1b[200~${path}\x1b[201~`);
      await this.key("\r");
      await pending;
    },
    async attachText(contents: string) {
      const pending = runtime.session.prompt("/attach");
      await t.waitFor(async () => assert.match(await this.frame(), /File path…/));
      await this.key("\x1b[B");
      await this.key("\r");
      await t.waitFor(async () => assert.match(await this.frame(), /Attach text/));
      await this.key(`\x1b[200~${contents}\x1b[201~`);
      await this.key("\r");
      await pending;
    },
  };
}
