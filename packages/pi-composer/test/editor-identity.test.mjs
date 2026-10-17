import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { test } from "node:test";
import { setImmediate } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { openAttachmentEditor } from "../fixtures/attachment-editor.ts";

test("composer identity follows undo and redo across identical captures", async (t) => {
  const host = await openAttachmentEditor(t);
  host.ui.setEditorText("[note](source.txt)");
  const original = host.access.snapshot().identity;
  await host.key("\x1b[D");
  assert.strictEqual(host.access.snapshot().identity, original);

  assert.equal(host.access.captureEdit(7, 17).replace("retained.txt"), true);
  const first = host.access.snapshot().identity;
  assert.notStrictEqual(first, original);
  assert.equal(host.access.captureEdit(7, 19).replace("retained.txt"), true);
  const second = host.access.snapshot().identity;
  assert.notStrictEqual(second, first);

  await host.key("\x1b[122;9u");
  assert.strictEqual(host.access.snapshot().identity, first);
  await host.key("\x1b[122;9u");
  assert.strictEqual(host.access.snapshot().identity, original);
  await host.key("\x1b[122;10u");
  assert.strictEqual(host.access.snapshot().identity, first);
  await host.key("\x1b[122;10u");
  assert.strictEqual(host.access.snapshot().identity, second);

  host.ui.setEditorText("another draft");
  assert.notStrictEqual(host.access.snapshot().identity, second);
});

test("same-text composer replacement changes identity without adding an undo step", async (t) => {
  const host = await openAttachmentEditor(t);
  host.ui.setEditorText("draft");
  await host.key("\x1b[D");
  const before = host.access.snapshot().identity;

  host.ui.setEditorText("draft");
  const after = host.access.snapshot().identity;
  assert.notStrictEqual(after, before);
  assert.equal(host.ui.getEditorText(), "draft");

  await host.key("!");
  assert.equal(host.ui.getEditorText(), "draf!t");

  await host.key("\x1b[122;9u");
  assert.strictEqual(host.access.snapshot().identity, after);
  assert.equal(host.ui.getEditorText(), "draft");
  await host.key("\x1b[122;9u");
  assert.equal(host.ui.getEditorText(), "");
});

test("native draft identities stay with native undo and history owners", async (t) => {
  const gc = globalThis.gc;
  if (!gc) {
    const environment = { ...process.env };
    delete environment.NODE_TEST_CONTEXT;
    await promisify(execFile)(
      process.execPath,
      [
        "--expose-gc",
        "--test",
        "--test-name-pattern=native draft identities stay with native undo and history owners",
        fileURLToPath(import.meta.url),
      ],
      { env: environment },
    );
    return;
  }
  const collect = async (reference) => {
    for (let attempt = 0; attempt < 10; attempt++) {
      // eslint-disable-next-line no-await-in-loop -- A new turn releases WeakRef's current-job keepalive.
      await setImmediate();
      gc();
      if (reference.deref() === undefined) return;
    }
    assert.equal(reference.deref(), undefined);
  };
  const host = await openAttachmentEditor(t, {
    composer: false,
    keybindings: {
      "tui.editor.historyPrevious": "alt+up",
      "tui.editor.historyNext": "alt+down",
    },
  });
  await host.type("a");
  const transient = new WeakRef(host.access.snapshot().identity);
  await host.type("b");
  await collect(transient);
  assert.equal(host.ui.getEditorText(), "ab");

  host.ui.setEditorText("History entry");
  await host.key("\r");
  await host.settled();
  host.ui.setEditorText("Current draft");
  const original = new WeakRef(host.access.snapshot().identity);
  await host.type("!");
  await setImmediate();
  gc();
  assert.ok(original.deref());
  await host.key("\x1b[45;5u");
  assert.strictEqual(host.access.snapshot().identity, original.deref());
  assert.equal(host.ui.getEditorText(), "Current draft");

  await host.key("\x1b[1;3A");
  const recalled = new WeakRef(host.access.snapshot().identity);
  assert.equal(host.ui.getEditorText(), "History entry");
  await setImmediate();
  gc();
  assert.ok(original.deref());
  await host.key("\x1b[1;3B");
  assert.strictEqual(host.access.snapshot().identity, original.deref());
  assert.equal(host.ui.getEditorText(), "Current draft");
  await collect(recalled);

  await host.runtime.session.reload();
  await collect(original);
  assert.equal(host.ui.getEditorText(), "Current draft");
});
