import assert from "node:assert/strict";
import fs from "node:fs";
import { writeFile } from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { CustomEditor, VERSION, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { openNativeHost } from "../../../fixtures/native-host.ts";

const goalPath = fileURLToPath(new URL("../src/index.ts", import.meta.url));
const companionPaths = ["pi-composer", "pi-attachments", "pi-chat", "pi-skill-references"].map(
  (name) => fileURLToPath(new URL(`../../${name}/src/index.ts`, import.meta.url)),
);

async function assertPausedAfterReopen(
  t: TestContext,
  host: Awaited<ReturnType<typeof openNativeHost>>,
) {
  const sessionFile = host.session.sessionManager.getSessionFile();
  assert(sessionFile);
  await host.close();
  const reopened = await openNativeHost(t, {
    directory: host.directory,
    sessionFile,
    extensionPaths: [goalPath],
    noTools: "all",
    holdResponses: true,
  });
  await reopened.session.prompt("/goal inspect");
  assert.match(await reopened.frame(), /paused: Finish the authorized work/);
  assert.equal(reopened.requests.length, 0);
}

for (const order of ["native", "first", "last"] as const) {
  for (const remapped of [false, true]) {
    test(`native Stop persists pause: ${order}, ${remapped ? "remapped" : "default"}`, async (t) => {
      let settlements = 0;
      const host = await openNativeHost(t, {
        extensionPaths:
          order === "native"
            ? [goalPath]
            : order === "first"
              ? [goalPath, ...companionPaths]
              : [...companionPaths, goalPath],
        extension(pi) {
          pi.on("agent_settled", () => {
            settlements++;
          });
        },
        keybindings: remapped ? { "app.interrupt": "ctrl+shift+k" } : {},
        noTools: "all",
        persistSession: true,
        holdResponses: true,
      });
      t.diagnostic(`Runtime ${VERSION}; public package paths; ${order}`);
      await writeFile(join(host.directory, "probe-note.md"), "Goal note");
      await host.session.prompt("/goal create Finish the authorized work");
      const run = host.session.prompt("Work on the explicitly authorized goal.");
      await t.waitFor(() => assert.equal(host.requests.length, 1));
      assert.match(await host.frame(), /Goal: active/);

      if (order !== "native") {
        await host.type("A draft kept by the composer");
        await host.key("\x1b[122;9u");
        assert.equal(host.ui.getEditorText(), "");
        await host.key("\x1b[122;10u");
        assert.equal(host.ui.getEditorText(), "A draft kept by the composer");
        host.ui.setEditorText("");
      }

      await host.type("@probe-");
      await t.waitFor(async () => assert.match(await host.frame(), /probe-note\.md/));
      await host.key("\x1b");
      assert.doesNotMatch(await host.frame(), /probe-note\.md/);
      assert.match(await host.frame(), /Goal: active/);
      assert.equal(host.session.isStreaming, true);
      host.ui.setEditorText("");

      const stopKey = remapped ? "\x1b[107;6u" : "\x1b";
      const overlay = host.ui.custom<void>(
        (_tui, _theme, keys, done) => ({
          render: () => ["Goal controls overlay"],
          invalidate() {},
          handleInput(data: string) {
            if (keys.matches(data, "app.interrupt")) done();
          },
        }),
        { overlay: true },
      );
      assert.match(await host.frame(), /Goal controls overlay/);
      await host.key(stopKey);
      await overlay;
      assert.match(await host.frame(), /Goal: active/);
      assert.equal(host.session.isStreaming, true);
      if (remapped) {
        await host.key("\x1b");
        assert.match(await host.frame(), /Goal: active/);
        assert.equal(host.session.isStreaming, true);
      }
      await host.key(stopKey);
      await t.waitFor(() => assert.equal(settlements, 1));
      await run;
      assert.equal(host.session.isStreaming, false);
      await host.session.prompt("/goal inspect");
      assert.match(await host.frame(), /paused: Finish the authorized work/);
      assert.equal(host.requests.length, 1);
      await assertPausedAfterReopen(t, host);
    });
  }
}

for (const replacement of ["factory", "callback"] as const) {
  test(`goal teardown preserves a later editor ${replacement} owner`, async (t) => {
    type EditorFactory = NonNullable<ReturnType<ExtensionContext["ui"]["getEditorComponent"]>>;
    let editor: CustomEditor | undefined;
    let shutdownFactory: EditorFactory | undefined;
    let shutdownCallback: (() => void) | undefined;
    const factory: EditorFactory = (tui, theme, keys) => {
      editor = new CustomEditor(tui, theme, keys);
      return editor;
    };
    const callback = () => assert.fail(`Teardown must not invoke later ${replacement} Stop`);
    const host = await openNativeHost(t, {
      extensionPaths: [...companionPaths, goalPath],
      extension(pi) {
        pi.on("session_shutdown", (_event, ctx) => {
          shutdownFactory = ctx.ui.getEditorComponent();
          shutdownCallback = editor?.onEscape;
        });
      },
      noTools: "all",
      persistSession: true,
      holdResponses: true,
    });
    await host.session.prompt("/goal create Finish the authorized work");
    const run = host.session.prompt("Work on the explicitly authorized goal.");
    await t.waitFor(() => assert.equal(host.requests.length, 1));
    host.ui.setEditorComponent(factory);
    if (replacement === "callback") {
      await host.session.prompt("/goal edit Finish the updated authorized work");
      assert(editor);
      editor.onEscape = callback;
    }
    const currentFactory = host.ui.getEditorComponent();
    const sessionFile = host.session.sessionManager.getSessionFile();
    assert(sessionFile);
    await host.close();
    await run;
    assert.equal(shutdownFactory, currentFactory);
    if (replacement === "callback") assert.equal(shutdownCallback, callback);
    assert.equal(host.requests.length, 1);
    const reopened = await openNativeHost(t, {
      directory: host.directory,
      sessionFile,
      extensionPaths: [goalPath],
      noTools: "all",
      holdResponses: true,
    });
    await reopened.session.prompt("/goal inspect");
    assert.match(await reopened.frame(), /active: Finish the/);
    await reopened.session.prompt("/goal pause");
    await reopened.session.abort();
  });
}

test("native interruption survives a real pause storage failure", async (t) => {
  let settlements = 0;
  const host = await openNativeHost(t, {
    extensionPaths: [...companionPaths, goalPath],
    extension(pi) {
      pi.on("agent_settled", () => {
        settlements++;
      });
    },
    noTools: "all",
    persistSession: true,
    holdResponses: true,
  });
  await host.session.prompt("/goal create Finish the authorized work");
  const run = host.session.prompt("Work on the explicitly authorized goal.");
  await t.waitFor(() => assert.equal(host.requests.length, 1));
  const sessionFile = host.session.sessionManager.getSessionFile();
  assert(sessionFile);
  const originalAppend = fs.appendFileSync;
  let failed = false;
  const failPause: typeof fs.appendFileSync = (file, data, options) => {
    if (
      file === sessionFile &&
      typeof data === "string" &&
      JSON.parse(data).data?.status === "paused"
    ) {
      failed = true;
      throw new Error("Pause storage unavailable");
    }
    return originalAppend(file, data, options);
  };
  const append = t.mock.method(fs, "appendFileSync", failPause);
  syncBuiltinESMExports();
  try {
    await host.key("\x1b");
    await t.waitFor(() => assert.equal(settlements, 1));
    await run;
  } finally {
    append.mock.restore();
    syncBuiltinESMExports();
  }
  assert.equal(failed, true);
  assert.equal(host.session.isStreaming, false);
  assert.equal(host.requests.length, 1);
  assert.match(await host.frame(), /Could not pause the goal/);
  assert.match(await host.frame(), /Pause storage\s+unavailable/);
  assert.match(await host.frame(), /Reopen the saved session/);
  await host.session.prompt("/goal pause");
  assert.match(await host.frame(), /Goal\s+storage is unavailable/);
  await host.close();
  const reopened = await openNativeHost(t, {
    directory: host.directory,
    sessionFile,
    extensionPaths: [goalPath],
    noTools: "all",
    holdResponses: true,
  });
  await reopened.session.prompt("/goal inspect");
  assert.match(await reopened.frame(), /active: Finish the authorized work/);
  await reopened.session.prompt("/goal pause");
  await reopened.session.abort();
  await reopened.session.prompt("/goal inspect");
  assert.match(await reopened.frame(), /paused: Finish the authorized work/);
});

for (const remapped of [false, true]) {
  test(`native Stop pauses during retry: ${remapped ? "remapped" : "default"}`, async (t) => {
    let settlements = 0;
    let retryError: string | undefined;
    const host = await openNativeHost(t, {
      extensionPaths: [goalPath, ...companionPaths],
      extension(pi) {
        pi.on("agent_settled", () => {
          settlements++;
        });
      },
      keybindings: remapped ? { "app.interrupt": "ctrl+shift+k" } : {},
      noTools: "all",
      persistSession: true,
      responseStatus: 503,
      settings: {
        retry: {
          enabled: true,
          maxRetries: 1,
          baseDelayMs: 30_000,
          maxAgentDelayMs: 30_000,
          provider: { maxRetries: 0 },
        },
      },
    });
    host.session.subscribe((event) => {
      if (event.type === "auto_retry_end") retryError = event.finalError;
    });
    await host.session.prompt("/goal create Finish the authorized work");
    const run = host.session.prompt("Work on the explicitly authorized goal.");
    await t.waitFor(() => assert.equal(host.session.isRetrying, true));
    await host.key(remapped ? "\x1b[107;6u" : "\x1b");
    await t.waitFor(() => assert.equal(settlements, 1));
    await run;
    assert.equal(retryError, "Retry cancelled");
    await host.session.prompt("/goal inspect");
    assert.match(await host.frame(), /paused: Finish the authorized work/);
    assert.equal(host.requests.length, 1);
    await assertPausedAfterReopen(t, host);
  });

  test(`native Stop pauses during compaction: ${remapped ? "remapped" : "default"}`, async (t) => {
    let settlements = 0;
    const host = await openNativeHost(t, {
      extensionPaths: [...companionPaths, goalPath],
      extension(pi) {
        pi.on("agent_settled", () => {
          settlements++;
        });
      },
      keybindings: remapped ? { "app.interrupt": "ctrl+shift+k" } : {},
      noTools: "all",
      persistSession: true,
      holdResponses: true,
      settings: { compaction: { enabled: false, keepRecentTokens: 1 } },
    });
    /* eslint-disable no-await-in-loop -- Complete each real turn before requesting native compaction. */
    for (let turn = 1; turn <= 2; turn++) {
      await host.type(`Working turn ${turn}`);
      await host.key("\r");
      await t.waitFor(() => assert.equal(host.requests.length, turn));
      host.reply();
      await t.waitFor(() => assert.equal(settlements, turn));
    }
    /* eslint-enable no-await-in-loop */
    let compactionAborted = false;
    host.session.subscribe((event) => {
      if (event.type === "compaction_end") compactionAborted = event.aborted;
    });
    const compaction = assert.rejects(host.session.compact(), /cancel|abort/i);
    await t.waitFor(() => assert.equal(host.requests.length, 3));
    await host.session.prompt("/goal create Finish the authorized work");
    assert.match(await host.frame(), /Goal: active/);
    await host.key(remapped ? "\x1b[107;6u" : "\x1b");
    await compaction;
    assert.equal(compactionAborted, true);
    assert.equal(host.session.isCompacting, false);
    await host.session.prompt("/goal inspect");
    assert.match(await host.frame(), /paused: Finish the authorized work/);
    assert.equal(host.requests.length, 3);
    await assertPausedAfterReopen(t, host);
  });
}
