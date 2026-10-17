import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { createServer, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TestContext } from "node:test";
import { fileURLToPath } from "node:url";
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
} from "@earendil-works/pi-coding-agent";
import type { Terminal } from "@earendil-works/pi-tui";

class TestTerminal implements Terminal {
  columns = 120;
  rows = 40;
  kittyProtocolActive = false;
  output = "";
  input!: (data: string) => void;

  start(onInput: (data: string) => void): void {
    this.input = onInput;
  }
  write(data: string): void {
    this.output += data;
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
  response.writeHead(200, { "content-type": "text/event-stream" });
  response.end(
    'data: {"choices":[{"index":0,"delta":{"role":"assistant","content":"Done."},"finish_reason":null}]}\n\n' +
      'data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n' +
      "data: [DONE]\n\n",
  );
}

export async function createHost(
  t: TestContext,
  setupExtension?: (pi: ExtensionAPI, directory: string) => void | Promise<void>,
  holdResponses = false,
  resourceOverrides: Pick<
    NonNullable<CreateAgentSessionServicesOptions["resourceLoaderOptions"]>,
    "skillsOverride" | "extensionsOverride" | "additionalExtensionPaths"
  > = {},
  interactive = true,
) {
  const { additionalExtensionPaths = [], ...overrides } = resourceOverrides;
  const root = await mkdtemp(join(tmpdir(), "pi-inline-skills-"));
  const agentDir = join(root, "agent");
  const skillDir = join(root, "skills", "review");
  const skillPath = join(skillDir, "SKILL.md");
  await mkdir(agentDir, { recursive: true });
  await mkdir(skillDir, { recursive: true });
  await writeFile(
    skillPath,
    "---\nname: review\ndescription: Review behavior\n---\nReview the actual behavior.\n",
  );

  const originalAgentDir = process.env["PI_CODING_AGENT_DIR"];
  const originalOffline = process.env["PI_OFFLINE"];
  let stopHost: (() => Promise<void>) | undefined;
  process.env["PI_CODING_AGENT_DIR"] = agentDir;
  process.env["PI_OFFLINE"] = "1";
  t.after(async () => {
    await stopHost?.();
    if (originalAgentDir === undefined) delete process.env["PI_CODING_AGENT_DIR"];
    else process.env["PI_CODING_AGENT_DIR"] = originalAgentDir;
    if (originalOffline === undefined) delete process.env["PI_OFFLINE"];
    else process.env["PI_OFFLINE"] = originalOffline;
    await rm(root, { recursive: true, force: true });
  });

  const pendingResponses: ServerResponse[] = [];
  const server = createServer((request, response) => {
    request.resume();
    if (holdResponses) pendingResponses.push(response);
    else finishResponse(response);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  const address = server.address();
  assert(address && typeof address !== "string");
  const modelRuntime = await ModelRuntime.create({
    authPath: join(agentDir, "auth.json"),
    modelsPath: null,
    modelsStorePath: join(agentDir, "models-cache.json"),
    refreshOnCreate: false,
  });
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
  });
  const model = modelRuntime.getModel("inline-skill-test", "test");
  assert(model);
  let ui: ExtensionUIContext | undefined;
  const inputs: { text: string; draft: string }[] = [];
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
            fileURLToPath(new URL("../src/index.ts", import.meta.url)),
            ...additionalExtensionPaths,
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
                ui = ctx.ui;
              });
              pi.on("input", (event, ctx) => {
                inputs.push({ text: event.text, draft: ctx.ui.getEditorText() });
              });
              await setupExtension?.(pi, root);
            },
          ],
          ...overrides,
        },
      });
      const result = await createAgentSessionFromServices({
        services,
        sessionManager,
        model,
        tools: [],
      });
      assert.deepEqual(result.extensionsResult.errors, []);
      return { ...result, services, diagnostics: services.diagnostics };
    },
    { cwd: root, agentDir, sessionManager: SessionManager.inMemory(root) },
  );
  const terminal = new TestTerminal();
  const mode = new InteractiveMode(runtime, { terminal, tuiMode: "fullscreen" });
  stopHost = async () => {
    if (interactive) mode.stop();
    await runtime.dispose();
  };
  if (interactive) {
    await mode.init();
    void mode.run();
  } else {
    await runtime.session.bindExtensions({ mode: "print" });
  }
  assert(ui);

  return {
    ui,
    inputs,
    terminal,
    skillDir,
    skillPath,
    session: runtime.session,
    pendingResponses,
    reply() {
      const response = pendingResponses.shift();
      assert(response, "The controlled model must have a pending request");
      finishResponse(response);
    },
    async submit() {
      const ended = new Promise<void>((resolve) => {
        const unsubscribe = runtime.session.subscribe((event) => {
          if (event.type === "agent_end") {
            unsubscribe();
            resolve();
          }
        });
      });
      terminal.input("\r");
      await ended;
      await runtime.session.waitForIdle();
      const answer = runtime.session.messages.findLast((item) => item.role === "assistant");
      assert(answer?.role === "assistant");
      assert.equal(answer.stopReason, "stop", answer.errorMessage);
      assert.equal(answer.content.find((item) => item.type === "text")?.text, "Done.");
      const message = runtime.session.messages.findLast((item) => item.role === "user");
      assert(message?.role === "user");
      assert(Array.isArray(message.content));
      return message.content
        .filter((item) => item.type === "text")
        .map((item) => item.text)
        .join("\n");
    },
  };
}
