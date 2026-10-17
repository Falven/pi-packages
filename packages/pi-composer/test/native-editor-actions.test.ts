import assert from "node:assert/strict";
import { test } from "node:test";
import { getNativeClipboard } from "@earendil-works/pi-tui";
import { openHost } from "../fixtures/host.ts";

test("Pi's external-editor action replaces the inline draft and shares its undo history", async (t) => {
  const previousVisual = process.env["VISUAL"];
  t.after(() => {
    if (previousVisual === undefined) delete process.env["VISUAL"];
    else process.env["VISUAL"] = previousVisual;
  });
  process.env["VISUAL"] =
    `${process.execPath} ${new URL("../fixtures/external-editor.ts", import.meta.url).pathname}`;
  const host = await openHost(t, {
    keybindings: { "app.editor.external": "ctrl+shift+e" },
  });
  const original = "Original\t@manual.md";
  host.ui.setEditorText(original);
  await host.key("\x1b[101;6u");
  const edited = `${original}\n${"x".repeat(5100)}\n**External edit**`;
  await t.waitFor(() => {
    assert.equal(host.ui.getEditorText(), edited);
    assert(host.terminal.input, "Pi must resume terminal input after editing");
  });
  await host.key("\x1b[122;9u");
  assert.equal(host.ui.getEditorText(), original);
  await host.key("\x1b[122;10u");
  assert.equal(host.ui.getEditorText(), edited);
  await host.type(" next");
  assert.equal(host.ui.getEditorText(), `${edited} next`);
  assert.equal(host.requests.length, 0);
});

test("Pi's clipboard application action inserts into the same draft and selection history", async (t) => {
  const clipboard = getNativeClipboard();
  assert(clipboard?.getFilePaths, "The native clipboard boundary must be available");
  t.mock.method(
    clipboard as { getFilePaths: NonNullable<typeof clipboard.getFilePaths> },
    "getFilePaths",
    async () => null,
  );
  t.mock.method(clipboard, "getImage", async () => null);
  t.mock.method(clipboard, "getText", async () => "new\nreference");
  const host = await openHost(t, {
    keybindings: { "app.clipboard.pasteImage": "ctrl+shift+v" },
  });
  host.ui.setEditorText("Keep old");
  await host.key("\x1b[1;4D");
  await host.key("\x1b[118;6u");
  await t.waitFor(() => assert.equal(host.ui.getEditorText(), "Keep new\nreference"));
  await host.key("\x1b[122;9u");
  assert.equal(host.ui.getEditorText(), "Keep old");
  await host.key("\x1b[122;10u");
  assert.equal(host.ui.getEditorText(), "Keep new\nreference");
});

test("an empty public paste keeps the selected text and undo history", async (t) => {
  const host = await openHost(t);
  host.ui.setEditorText("Before");
  host.ui.setEditorText("Keep old");
  await host.key("\x1b[1;2D");
  await host.key("\x1b[1;2D");
  await host.key("\x1b[1;2D");
  host.ui.pasteToEditor("");
  assert.equal(host.ui.getEditorText(), "Keep old");
  await host.type("new");
  assert.equal(host.ui.getEditorText(), "Keep new");
  await host.key("\x1b[122;9u");
  assert.equal(host.ui.getEditorText(), "Keep old");
  await host.key("\x1b[122;9u");
  assert.equal(host.ui.getEditorText(), "Before");
});

test("a failed external editor leaves the draft and undo history intact", async (t) => {
  const previousVisual = process.env["VISUAL"];
  t.after(() => {
    if (previousVisual === undefined) delete process.env["VISUAL"];
    else process.env["VISUAL"] = previousVisual;
  });
  process.env["VISUAL"] = "/usr/bin/false";
  const host = await openHost(t, {
    keybindings: { "app.editor.external": "ctrl+shift+e" },
  });
  host.ui.setEditorText("Before");
  host.ui.setEditorText("Keep this draft");
  await host.key("\x1b[101;6u");
  await t.waitFor(() => assert(host.terminal.input));
  assert.equal(host.ui.getEditorText(), "Keep this draft");
  await host.key("\x1b[122;9u");
  assert.equal(host.ui.getEditorText(), "Before");
});
