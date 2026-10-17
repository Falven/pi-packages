import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import fs, { readFile, stat, writeFile } from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { join } from "node:path";
import { beforeEach, test } from "node:test";
import { fileURLToPath } from "node:url";
import { CustomEditor } from "@earendil-works/pi-coding-agent";
import { getNativeClipboard, StdinBuffer } from "@earendil-works/pi-tui";
import {
  assertAttachments,
  nativePi,
  retainedRequest,
  snapshotPath,
  waitFor,
} from "../../pi-attachments/fixtures/native-pi.mjs";

const composerPath = fileURLToPath(new URL("../src/index.ts", import.meta.url));
const attachmentsPath = fileURLToPath(
  new URL("../../pi-attachments/src/index.ts", import.meta.url),
);

beforeEach((t) => {
  const clipboard = getNativeClipboard();
  assert.ok(clipboard?.getFilePaths);
  t.mock.method(clipboard, "getFilePaths", async () => null);
  t.mock.method(clipboard, "getImage", async () => null);
  t.mock.method(clipboard, "getText", async () => null);
});

function holdSnapshotWrite(t, host) {
  const write = fs.writeFile;
  const gate = Promise.withResolvers();
  let path;
  const mocked = t.mock.method(fs, "writeFile", async (...args) => {
    if (
      !path &&
      String(args[0]).startsWith(join(host.agentDir, "pi-attachments")) &&
      String(args[0]).endsWith("/paste.txt")
    ) {
      path = args[0];
      const failure = await gate.promise;
      if (failure) throw failure;
    }
    return write(...args);
  });
  syncBuiltinESMExports();
  t.after(() => {
    gate.resolve();
    mocked.mock.restore();
    syncBuiltinESMExports();
  });
  return {
    started: () =>
      waitFor(() => {
        assert.ok(path, "the attachment snapshot write must start");
        return path;
      }),
    release: gate.resolve,
  };
}

test("snapshot failure preserves the selected draft and captured bytes for one undoable retry", async (t) => {
  const host = await nativePi(t, [composerPath]);
  const capture = holdSnapshotWrite(t, host);
  await host.attachText("Existing context");
  const originalReference = host.ui.getEditorText().trim();
  const originalPath = snapshotPath(originalReference);
  const before = `Keep\n${originalReference}\nselected`;
  const sessionId = host.runtime.session.sessionManager.getSessionId();
  host.ui.setEditorText(before);
  host.input("\x1b[1;10D");
  const text = `\n\t${"captured context\r\n".repeat(350)}`;
  host.ui.pasteToEditor(text);
  const failedPath = await capture.started();
  capture.release(new Error("Controlled snapshot write failure"));
  await waitFor(() => assert.match(host.render(), /Could not attach/));
  assert.equal(host.ui.getEditorText(), before);
  await assert.rejects(stat(failedPath), { code: "ENOENT" });
  assert.equal(await readFile(originalPath, "utf8"), "Existing context");
  const request = await retainedRequest(host, before);
  assert.match(request.text, /^# Attachment request\n/);
  assert.ok(request.text.includes(sessionId));
  assert.ok(request.text.includes(failedPath));

  host.input("\r");
  const reference = await waitFor(() => {
    const draft = host.ui.getEditorText();
    assert.notEqual(draft, before);
    return draft.slice(`Keep\n${originalReference}\n`.length).trim();
  });
  const path = snapshotPath(reference);
  const after = `Keep\n${originalReference}\n\n${reference}\n`;
  assert.equal(host.ui.getEditorText(), after);
  assert.equal(await readFile(path, "utf8"), text);
  assertAttachments(host.ui.getEditorText(), host.render(), ["text.txt", "paste.txt"]);
  host.input("\x1b[122;9u");
  assert.equal(host.ui.getEditorText(), before);
  assertAttachments(host.ui.getEditorText(), host.render(), ["text.txt"]);
  host.input("\x1b[122;10u");
  assert.equal(host.ui.getEditorText(), after);
  assert.equal(await readFile(path, "utf8"), text);
});

for (const [route, extensions] of [
  ["extension", [composerPath]],
  ["terminal", [composerPath, attachmentsPath]],
  ["Command+V", [composerPath]],
]) {
  for (const view of ["source", "formatted"]) {
    test(`${route} attachment paste replaces ${view} text and membership in one captured edit`, async (t) => {
      const text = `\t${"😀".repeat(2499)}\r\n`;
      if (route === "Command+V") {
        const clipboard = getNativeClipboard();
        assert.ok(clipboard);
        t.mock.method(clipboard, "getText", async () => text);
      }
      const host = await nativePi(t, extensions);
      const capture = holdSnapshotWrite(t, host);
      const edits = [];
      const previous = host.ui.getEditorComponent();
      host.ui.setEditorComponent((...args) => {
        const editor = previous(...args);
        return new Proxy(editor, {
          set(target, property, value) {
            if (property === "onChange") {
              target.onChange = (draft) => {
                edits.push({
                  text: draft,
                  contents: [...draft.matchAll(/\[Attachment: [^\]]+\]\(<([^>]+)>\)/g)].map(
                    (match) => readFileSync(match[1], "utf8"),
                  ),
                });
                value?.(draft);
              };
              return true;
            }
            return Reflect.set(target, property, value);
          },
        });
      });
      const source = join(host.directory, "original.txt");
      await writeFile(source, "Original attachment contents\n");
      await host.attachFile(source);
      const originalReference = host.ui.getEditorText().trim();
      const originalPath = snapshotPath(originalReference);
      const before = `Keep /skill:review @"source file.md"\n${originalReference} **old**\nTail`;
      host.ui.setEditorText(before);
      if (view === "source") host.input("\x1b[109;10u");
      host.input("\x1b[1;9D");
      host.input("\x1b[D");
      host.input("\x1b[1;10D");
      edits.length = 0;

      if (route === "extension") host.ui.pasteToEditor(text);
      else if (route === "Command+V") host.input("\x1b[118;9u");
      else {
        const stdin = new StdinBuffer();
        t.after(() => stdin.destroy());
        stdin.on("data", host.input);
        stdin.on("paste", (payload) => host.input(`\x1b[200~${payload}\x1b[201~`));
        stdin.process("\x1b[2");
        stdin.process("00~" + text.slice(0, 2000));
        stdin.process(text.slice(2000) + "\x1b[20");
        assert.equal(host.ui.getEditorText(), before);
        assert.deepEqual(edits, []);
        stdin.process("1~");
      }
      const pendingPath = await capture.started();
      assert.equal(host.ui.getEditorText(), before);
      assert.deepEqual(edits, []);
      assertAttachments(host.ui.getEditorText(), host.render(), ["original.txt"]);
      await assert.rejects(stat(pendingPath), { code: "ENOENT" });

      capture.release();
      const path = await waitFor(() => {
        const candidate = snapshotPath(host.ui.getEditorText());
        assert.notEqual(candidate, originalPath);
        return candidate;
      });
      const reference = `[Attachment: paste.txt](<${path}>)`;
      const after = `Keep /skill:review @"source file.md"\n\n${reference}\n\nTail`;
      assert.deepEqual(
        edits.map((edit) => edit.text),
        [after],
      );
      assert.deepEqual(edits[0].contents, [text]);
      assert.equal(await readFile(path, "utf8"), text);
      assert.equal(await readFile(originalPath, "utf8"), "Original attachment contents\n");
      assertAttachments(host.ui.getEditorText(), host.render(), ["paste.txt"]);
      assert.equal(host.requests.length, 0);

      host.input("\x1b[109;10u");
      host.input("\x1b[122;9u");
      assert.equal(host.ui.getEditorText(), before);
      assertAttachments(host.ui.getEditorText(), host.render(), ["original.txt"]);
      assert.equal(await readFile(path, "utf8"), text);
      host.input("\x1b[122;10u");
      assert.equal(host.ui.getEditorText(), after);
      assertAttachments(host.ui.getEditorText(), host.render(), ["paste.txt"]);
      assert.equal(await readFile(path, "utf8"), text);
    });
  }
}

test("a paste over a complete formatted attachment replaces its reference without nesting links", async (t) => {
  const host = await nativePi(t, [composerPath, attachmentsPath]);
  await host.attachText("Original context");
  const originalReference = host.ui.getEditorText().trim();
  const originalPath = snapshotPath(originalReference);
  const before = `Keep\n${originalReference}\nTail`;
  host.ui.setEditorText(before);
  host.input("\x1b[1;9D");
  host.input("\x1b[D");
  host.input("\x1b[1;10D");
  const text = "New context\n".repeat(500);
  host.ui.pasteToEditor(text);
  const path = await waitFor(() => {
    const candidate = snapshotPath(host.ui.getEditorText());
    assert.notEqual(candidate, originalPath);
    return candidate;
  });
  const after = `Keep\n\n[Attachment: paste.txt](<${path}>)\n\nTail`;
  assert.equal(host.ui.getEditorText(), after);
  assertAttachments(host.ui.getEditorText(), host.render(), ["paste.txt"]);
  host.input("\x1b[122;9u");
  assert.equal(host.ui.getEditorText(), before);
  host.input("\x1b[122;10u");
  assert.equal(host.ui.getEditorText(), after);
  assert.equal(await readFile(path, "utf8"), text);
  assert.equal(await readFile(originalPath, "utf8"), "Original context");
});

for (const change of ["later edit", "cursor move", "selection change", "reverted edit"]) {
  test(`a snapshot finishing after a ${change} preserves the target and requested text`, async (t) => {
    const host = await nativePi(t, [composerPath, attachmentsPath]);
    const capture = holdSnapshotWrite(t, host);
    await host.attachText("Existing context");
    const originalReference = host.ui.getEditorText().trim();
    const originalPath = snapshotPath(originalReference);
    const before = `Keep\n${originalReference}\nselected`;
    const sessionId = host.runtime.session.sessionManager.getSessionId();
    host.ui.setEditorText(before);
    host.input("\x1b[1;10D");
    const text = `\t${"captured context\r\n".repeat(350)}`;
    host.ui.pasteToEditor(text);
    const path = await capture.started();
    assert.equal(host.ui.getEditorText(), before);
    if (change === "later edit") host.input("later");
    else if (change === "cursor move") host.input("\x1b[D");
    else if (change === "selection change") host.input("\x1b[97;9u");
    else {
      host.ui.setEditorText("Intervening edit");
      host.ui.setEditorText(before);
    }
    const after = change === "later edit" ? `Keep\n${originalReference}\nlater` : before;
    assert.equal(host.ui.getEditorText(), after);
    capture.release();
    await waitFor(() => assert.match(host.render(), /Snapshot retained/));
    assert.equal(host.ui.getEditorText(), after);
    const recovery = await retainedRequest(host, before);
    assert.ok(recovery.text.includes(sessionId));
    assert.ok(recovery.text.includes(path));
    assert.equal(await readFile(path, "utf8"), text);
    assert.equal(await readFile(originalPath, "utf8"), "Existing context");
    assertAttachments(host.ui.getEditorText(), host.render(), ["text.txt"]);
    let edited = after;
    if (change !== "later edit") {
      host.input("placed");
      edited =
        change === "cursor move"
          ? `Keep\n${originalReference}\nplacedselected`
          : change === "selection change"
            ? "placed"
            : `${before}placed`;
      assert.equal(host.ui.getEditorText(), edited);
    }
    host.input("\x1b[122;9u");
    assert.equal(host.ui.getEditorText(), before);
    host.input("\x1b[122;10u");
    assert.equal(host.ui.getEditorText(), edited);
  });
}

for (const replacement of ["recreated", "reused", "replaced"]) {
  test(`a snapshot prepared for a ${replacement} editor retains its original target`, async (t) => {
    const host = await nativePi(t, [composerPath]);
    const capture = holdSnapshotWrite(t, host);
    const previous = host.ui.getEditorComponent();
    let editor;
    const factory = (...args) => {
      editor = previous(...args);
      return editor;
    };
    host.ui.setEditorComponent(factory);
    const before = "Keep **selected**";
    host.ui.setEditorText(before);
    host.input("\x1b[1;10D");
    const text = "Prepared for the original editor\n".repeat(180);
    host.ui.pasteToEditor(text);
    const path = await capture.started();
    const originalEditor = editor;
    if (replacement === "recreated") host.ui.setEditorComponent(factory);
    else if (replacement === "reused") host.ui.setEditorComponent(() => editor);
    else host.ui.setEditorComponent((...args) => new CustomEditor(...args));
    assert.equal(host.ui.getEditorText(), before);
    capture.release();
    await waitFor(() => assert.match(host.render(), /Snapshot retained/));
    assert.equal(host.ui.getEditorText(), before);
    assert.equal(originalEditor.getText(), before);
    const recovery = await retainedRequest(host, before);
    assert.ok(recovery.text.includes(path));
    assert.equal(await readFile(path, "utf8"), text);
    assert.doesNotMatch(host.render(), /Manage attachments/);
  });
}

test("a capture finishing across a native session switch preserves both drafts and the requesting snapshot", async (t) => {
  const host = await nativePi(t, [composerPath, attachmentsPath]);
  const capture = holdSnapshotWrite(t, host);
  host.submit("Persist this session");
  await waitFor(() => {
    assert.equal(host.requests.length, 1);
    assert.equal(host.runtime.session.isStreaming, false);
  });
  await host.attachText("Original session context");
  const originalReference = host.ui.getEditorText().trim();
  const originalPath = snapshotPath(originalReference);
  const before = `Keep\n${originalReference}\nselected`;
  host.ui.setEditorText(before);
  host.input("\x1b[1;10D");
  const manager = host.runtime.session.sessionManager;
  const sessionId = manager.getSessionId();
  const sessionFile = manager.getSessionFile();
  const text = `\t${"Original session capture\r\n".repeat(210)}`;
  host.ui.pasteToEditor(text);
  const path = await capture.started();
  assert.deepEqual(await host.runtime.newSession(), { cancelled: false });
  assert.notEqual(host.runtime.session.sessionManager.getSessionId(), sessionId);
  host.ui.setEditorText("Other session draft");
  capture.release();
  await waitFor(async () => assert.equal(await readFile(path, "utf8"), text));
  assert.equal(host.ui.getEditorText(), "Other session draft");
  assert.doesNotMatch(host.render(), /Manage attachments/);
  const recovery = await retainedRequest(host, before);
  assert.ok(recovery.text.includes(sessionId));
  assert.ok(recovery.text.includes(path));
  assert.equal(await readFile(originalPath, "utf8"), "Original session context");

  assert.deepEqual(await host.runtime.switchSession(sessionFile), {
    cancelled: false,
  });
  assert.equal(host.ui.getEditorText(), before);
  assertAttachments(host.ui.getEditorText(), host.render(), ["text.txt"]);
  assert.equal(await readFile(path, "utf8"), text);
});

test("submission waits for the pending snapshot and preserves the next draft", async (t) => {
  const host = await nativePi(t, [composerPath]);
  const capture = holdSnapshotWrite(t, host);
  await host.attachText("Submitted context");
  const originalReference = host.ui.getEditorText().trim();
  const originalPath = snapshotPath(originalReference);
  const before = `Keep\n${originalReference}\nselected`;
  host.ui.setEditorText(before);
  host.input("\x1b[1;10D");
  const text = "Captured before submission\n".repeat(220);
  host.ui.pasteToEditor(text);
  const path = await capture.started();
  host.submit();
  assert.equal(host.requests.length, 0);
  assert.equal(host.ui.getEditorText(), before);
  host.ui.setEditorText("Next draft");
  capture.release();
  await waitFor(() => {
    assert.equal(host.requests.length, 1);
    assert.equal(host.runtime.session.isStreaming, false);
  });
  const reference = `[Attachment: paste.txt](<${path}>)`;
  assert.deepEqual(host.users[0].content, [
    { type: "text", text: `Keep\n${originalReference}\n\n${reference}` },
  ]);
  assert.equal(host.ui.getEditorText(), "Next draft");
  const recovery = await retainedRequest(host, before);
  assert.ok(recovery.text.includes(path));
  assert.equal(await readFile(path, "utf8"), text);
  assert.equal(await readFile(originalPath, "utf8"), "Submitted context");
  assert.equal(host.requests.length, 1);
  host.input("\x1b[122;9u");
  assert.equal(host.ui.getEditorText(), before);
  host.input("\x1b[122;10u");
  assert.equal(host.ui.getEditorText(), "Next draft");
});

test("Attach Text replaces a formatted attachment selection with short captured text in one edit", async (t) => {
  const host = await nativePi(t, [composerPath]);
  await host.attachText("Original context");
  const originalReference = host.ui.getEditorText().trim();
  const originalPath = snapshotPath(originalReference);
  const before = `Keep\n${originalReference}\nTail`;
  host.ui.setEditorText(before);
  host.input("\x1b[1;9D");
  host.input("\x1b[D");
  host.input("\x1b[1;10D");
  await host.attachText("\nShort context\n");
  const path = await waitFor(() => {
    const candidate = snapshotPath(host.ui.getEditorText());
    assert.notEqual(candidate, originalPath);
    return candidate;
  });
  const after = `Keep\n\n[Attachment: text.txt](<${path}>)\n\nTail`;
  assert.equal(host.ui.getEditorText(), after);
  assert.equal(await readFile(path, "utf8"), "\nShort context\n");
  assertAttachments(host.ui.getEditorText(), host.render(), ["text.txt"]);
  host.input("\x1b[122;9u");
  assert.equal(host.ui.getEditorText(), before);
  host.input("\x1b[122;10u");
  assert.equal(host.ui.getEditorText(), after);
  assert.equal(await readFile(originalPath, "utf8"), "Original context");
});

test("an attachment paste commits during native settlement as one undoable selection edit", async (t) => {
  const gate = Promise.withResolvers();
  let settling = false;
  t.after(() => gate.resolve());
  const host = await nativePi(t, [composerPath, attachmentsPath], {
    extensionFactories: [
      (pi) => {
        pi.on("agent_settled", async () => {
          settling = true;
          await gate.promise;
        });
      },
    ],
  });
  await host.attachText("Existing context");
  const originalReference = host.ui.getEditorText().trim();
  const originalPath = snapshotPath(originalReference);
  host.submit("Initial request");
  await waitFor(() => assert.ok(settling));
  const before = `Keep\n${originalReference}\nselected`;
  host.ui.setEditorText(before);
  host.input("\x1b[1;10D");
  const text = "Captured during settlement\n".repeat(240);
  host.ui.pasteToEditor(text);
  const path = await waitFor(() => {
    const draft = host.ui.getEditorText();
    assert.notEqual(draft, before);
    return snapshotPath(draft.slice(`Keep\n${originalReference}\n`.length));
  });
  const after = `Keep\n${originalReference}\n\n[Attachment: paste.txt](<${path}>)\n`;
  assert.equal(host.ui.getEditorText(), after);
  assert.equal(await readFile(path, "utf8"), text);
  assert.equal(await readFile(originalPath, "utf8"), "Existing context");
  assertAttachments(host.ui.getEditorText(), host.render(), ["text.txt", "paste.txt"]);
  assert.equal(host.requests.length, 1);
  host.input("later");
  assert.equal(host.ui.getEditorText(), `${after}later`);
  host.input("\x1b[122;9u");
  assert.equal(host.ui.getEditorText(), after);
  host.input("\x1b[122;9u");
  assert.equal(host.ui.getEditorText(), before);
  gate.resolve();
  await host.runtime.session.waitForIdle();
  assert.equal(host.ui.getEditorText(), before);
  host.input("\x1b[122;10u");
  assert.equal(host.ui.getEditorText(), after);
  assert.equal(await readFile(path, "utf8"), text);
});

test("effective completion providers keep their edits and caret across attachment decorators", async (t) => {
  const host = await nativePi(t, [composerPath, attachmentsPath]);
  host.ui.addAutocompleteProvider((current) => ({
    getSuggestions(...args) {
      if (args[0][args[1]] === "probe")
        return {
          prefix: "probe",
          items: [
            { value: "chosen", label: "Earlier completion" },
            { value: "other", label: "Other completion" },
          ],
        };
      return current.getSuggestions(...args);
    },
    applyCompletion(...args) {
      if (args[3].value === "chosen")
        return { lines: ["Keep selected tail"], cursorLine: 0, cursorCol: 5 };
      return current.applyCompletion(...args);
    },
  }));
  const previous = host.ui.getEditorComponent();
  host.ui.setEditorComponent((...args) => previous(...args));
  host.ui.addAutocompleteProvider((current) => ({
    async getSuggestions(...args) {
      const result = await current.getSuggestions(...args);
      return (
        result && {
          ...result,
          items: result.items.map((item) =>
            Object.assign({}, item, {
              label: `Later: ${item.label}`,
            }),
          ),
        }
      );
    },
    applyCompletion: (...args) => current.applyCompletion(...args),
  }));
  host.ui.setEditorText("probe");
  host.input("\t");
  await waitFor(() => assert.match(host.render(), /Later: Earlier completion/));
  host.input("\r");
  assert.equal(host.ui.getEditorText(), "Keep selected tail");
  host.input("\x1b[1;4C");
  const text = "Completion context\n".repeat(300);
  host.ui.pasteToEditor(text);
  const path = await waitFor(() => snapshotPath(host.ui.getEditorText()));
  const after = `Keep \n[Attachment: paste.txt](<${path}>)\n tail`;
  assert.equal(host.ui.getEditorText(), after);
  assert.equal(await readFile(path, "utf8"), text);
  host.input("\x1b[122;9u");
  assert.equal(host.ui.getEditorText(), "Keep selected tail");
  host.input("\x1b[122;9u");
  assert.equal(host.ui.getEditorText(), "probe");
  host.input("\x1b[122;10u");
  host.input("\x1b[122;10u");
  assert.equal(host.ui.getEditorText(), after);
});

test("native listeners retain consumption and transformation order before a selected attachment paste", async (t) => {
  const host = await nativePi(t, [composerPath]);
  const captured = "Earlier listener context\n".repeat(230);
  const text = `${captured}Later listener context\n`;
  host.ui.onTerminalInput((data) => {
    if (data === "\x1b[200~blocked\x1b[201~") return { consume: true };
    if (data === "\x1b[200~raw\x1b[201~") return { data: `\x1b[200~${captured}\x1b[201~` };
  });
  const previous = host.ui.getEditorComponent();
  host.ui.setEditorComponent((...args) => previous(...args));
  host.ui.onTerminalInput((data) =>
    data === `\x1b[200~${captured}\x1b[201~` ? { data: `\x1b[200~${text}\x1b[201~` } : undefined,
  );
  host.ui.setEditorText("Keep selected");
  host.input("\x1b[1;4D");
  host.input("\x1b[200~blocked\x1b[201~");
  assert.equal(host.ui.getEditorText(), "Keep selected");
  host.input("\x1b[200~raw\x1b[201~");
  const path = await waitFor(() => snapshotPath(host.ui.getEditorText()));
  const after = `Keep \n[Attachment: paste.txt](<${path}>)\n`;
  assert.equal(host.ui.getEditorText(), after);
  assert.equal(await readFile(path, "utf8"), text);
  host.input("\x1b[122;9u");
  assert.equal(host.ui.getEditorText(), "Keep selected");
  host.input("\x1b[122;10u");
  assert.equal(host.ui.getEditorText(), after);
});
