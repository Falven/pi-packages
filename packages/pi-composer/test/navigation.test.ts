/* eslint-disable no-await-in-loop -- Keep each terminal gesture and its resulting edit in order. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { openHost } from "../fixtures/host.ts";

for (const sourceView of [false, true]) {
  const view = sourceView ? "source" : "formatted";
  test(`Command Up and Down reach the draft boundaries in ${view} view`, async (t) => {
    const host = await openHost(t, { columns: 12 });
    host.ui.setEditorText("Earlier prompt");
    await host.key("\r");
    await host.settled();
    if (sourceView) await host.key("\x1b[109;10u");
    const original = "**first**\n**abcdefghijklmno**\n**last**";
    for (const [input, expected] of [
      ["\x1b[1;9A", "X**first**\n**abcdefghijklmno**\n**last**"],
      ["\x1b[1;9B", "**first**\n**abcdefghijklmno**\n**last**X"],
    ] as const) {
      host.ui.setEditorText(original);
      await host.output();
      await host.key("\x1b[A");
      await host.key(input);
      await host.key(input);
      assert.equal(host.ui.getEditorText(), original);
      await host.type("X");
      assert.equal(host.ui.getEditorText(), expected);
    }
  });

  test(`line actions reach a wrapped logical line's boundaries in ${view} view`, async (t) => {
    const host = await openHost(t, { columns: 12 });
    if (sourceView) await host.key("\x1b[109;10u");
    for (const [name, input, end] of [
      ["Ctrl+A", "\x01", false],
      ["Cmd+Left", "\x1b[1;9D", false],
      ["Ctrl+E", "\x05", true],
      ["Cmd+Right", "\x1b[1;9C", true],
    ] as const) {
      host.ui.setEditorText("first\n**abcdefghijklmno**\nlast");
      await host.output();
      await host.key("\x1b[A");
      await host.key(input);
      await host.type("X");
      const line = end ? "**abcdefghijklmno**X" : "X**abcdefghijklmno**";
      assert.equal(host.ui.getEditorText(), `first\n${line}\nlast`, name);
    }
  });

  test(`shifted Command line aliases keep the selection anchor in ${view} view`, async (t) => {
    const host = await openHost(t, { columns: 12 });
    if (sourceView) await host.key("\x1b[109;10u");
    host.ui.setEditorText("first\nabcdefghijklmno\nlast");
    await host.output();
    await host.key("\x1b[A");
    await host.key("\x01");
    for (let i = 0; i < 4; i++) await host.key("\x1b[C");
    await host.key("\x1b[1;10D");
    await host.key("\x1b[1;10C");
    await host.type("X");
    assert.equal(host.ui.getEditorText(), "first\nabcdX\nlast");
    await host.key("\x1b[122;9u");
    await host.key("\x1b[1;10D");
    await host.type("Y");
    assert.equal(host.ui.getEditorText(), "first\nYefghijklmno\nlast");
  });

  test(`shifted Command draft shortcuts keep the selection anchor and undo history in ${view} view`, async (t) => {
    const host = await openHost(t, { columns: 12 });
    host.ui.setEditorText("Earlier prompt");
    await host.key("\r");
    await host.settled();
    if (sourceView) await host.key("\x1b[109;10u");
    const original = "**first**\nabcdefghijklmno\n**last**";
    host.ui.setEditorText(original);
    await host.output();
    await host.key("\x1b[A");
    await host.key("\x01");
    for (let i = 0; i < 4; i++) await host.key("\x1b[C");
    await host.key("\x1b[1;10A");
    await host.key("\x1b[1;10A");
    await host.key("\x1b[1;10B");
    await host.key("\x1b[1;10B");
    await host.type("X");
    assert.equal(host.ui.getEditorText(), "**first**\nabcdX");
    await host.key("\x1b[122;9u");
    assert.equal(host.ui.getEditorText(), original);
    await host.key("\x1b[1;10A");
    await host.type("Y");
    assert.equal(host.ui.getEditorText(), "Yefghijklmno\n**last**");
    await host.key("\x1b[122;9u");
    assert.equal(host.ui.getEditorText(), original);
    await host.key("\x1b[122;10u");
    assert.equal(host.ui.getEditorText(), "Yefghijklmno\n**last**");
  });
}

for (const sourceView of [false, true]) {
  const view = sourceView ? "source" : "formatted";
  test(`outer vertical arrows reach row boundaries in ${view} view`, async (t) => {
    const host = await openHost(t);
    if (sourceView) await host.key("\x1b[109;10u");
    host.ui.setEditorText("abcde\nfghij");
    await host.key("\x1b[97;9u");
    await host.key("\x1b[D");
    await host.key("\x1b[C");
    await host.key("\x1b[C");
    await host.key("\x1b[A");
    await host.type("X");
    assert.equal(host.ui.getEditorText(), "Xabcde\nfghij");

    await host.key("\x1b[97;9u");
    await host.key("\x1b[C");
    await host.key("\x01");
    await host.key("\x1b[C");
    await host.key("\x1b[C");
    await host.key("\x1b[B");
    await host.type("Y");
    assert.equal(host.ui.getEditorText(), "Xabcde\nfghijY");
  });
}

test("Up reaches the draft's beginning before entering native prompt history", async (t) => {
  const host = await openHost(t);
  for (const prompt of ["Earlier one", "Earlier two"]) {
    host.ui.setEditorText(prompt);
    await host.key("\r");
    await host.settled();
  }
  host.ui.setEditorText("Fresh draft\ntail");
  await host.key("\x1b[97;9u");
  await host.key("\x1b[D");
  for (let i = 0; i < 3; i++) await host.key("\x1b[C");
  await host.key("\x1b[A");
  assert.equal(host.ui.getEditorText(), "Fresh draft\ntail");
  await host.key("\x1b[A");
  assert.equal(host.ui.getEditorText(), "Earlier two");
  await host.key("\x1b[C");
  await host.key("\x1b[C");
  await host.key("\x1b[A");
  assert.equal(host.ui.getEditorText(), "Earlier one");
  await host.key("\x1b[B");
  assert.equal(host.ui.getEditorText(), "Earlier two");
  await host.key("\x1b[B");
  assert.equal(host.ui.getEditorText(), "Fresh draft\ntail");
  await host.type("X");
  assert.equal(host.ui.getEditorText(), "XFresh draft\ntail");

  host.ui.setEditorText("");
  await host.key("\x1b[A");
  assert.equal(host.ui.getEditorText(), "Earlier two");
  await host.key("\x1b[B");
  assert.equal(host.ui.getEditorText(), "");
});

for (const sourceView of [false, true]) {
  const view = sourceView ? "source" : "formatted";
  test(`vertical movement retains the preferred cell through Unicode and short rows in ${view} view`, async (t) => {
    const host = await openHost(t);
    if (sourceView) await host.key("\x1b[109;10u");
    const original = "**0123456789**\nx\n**a\te\u0301👩‍💻界z**\n**0123456789**";
    for (const up of [1, 3]) {
      host.ui.setEditorText(original);
      await host.key("\x01");
      for (let i = 0; i < 9; i++) await host.key("\x1b[C");
      for (let i = 0; i < up; i++) await host.key("\x1b[A");
      await host.type("X");
      const expected =
        up === 1
          ? original.replace(sourceView ? "👩‍💻" : "界", sourceView ? "X👩‍💻" : "X界")
          : original.replace("**0123456789**", sourceView ? "**0123456X789**" : "**012345678X9**");
      assert.equal(host.ui.getEditorText(), expected);
    }
  });
}

test("shifted vertical movement keeps its anchor and stays in the draft at outer rows", async (t) => {
  const host = await openHost(t);
  host.ui.setEditorText("Earlier prompt");
  await host.key("\r");
  await host.settled();
  host.ui.setEditorText("**alpha**\n**bravo**");
  await host.key("\x01");
  for (let i = 0; i < 3; i++) await host.key("\x1b[C");
  for (let i = 0; i < 3; i++) await host.key("\x1b[1;2A");
  assert.equal(host.ui.getEditorText(), "**alpha**\n**bravo**");
  await host.key("\x1b[1;2B");
  await host.type("X");
  assert.equal(host.ui.getEditorText(), "**alpha**\n**Xvo**");
  await host.key("\x1b[122;9u");
  await host.key("\x1b[C");
  await host.key("\x1b[1;2B");
  await host.key("\x1b[1;2B");
  await host.type("Y");
  assert.equal(host.ui.getEditorText(), "**alpha**\n**braY**");
});

test("configured line and vertical actions own navigation and suppress Command line aliases", async (t) => {
  const host = await openHost(t, {
    keybindings: {
      "tui.editor.cursorUp": "ctrl+alt+p",
      "tui.editor.cursorDown": "ctrl+alt+n",
      "tui.editor.cursorLineStart": "ctrl+shift+a",
      "tui.editor.cursorLineEnd": "ctrl+shift+e",
    },
  });
  host.ui.setEditorText("first\nmiddle\nlast");
  await host.key("\x1b[112;7u");
  await host.key("\x1b[97;6u");
  await host.type("X");
  assert.equal(host.ui.getEditorText(), "first\nXmiddle\nlast");
  await host.key("\x1b[101;6u");
  await host.type("Y");
  assert.equal(host.ui.getEditorText(), "first\nXmiddleY\nlast");
  await host.key("\x1b[110;7u");
  await host.type("Z");
  await host.key("\x1b[1;9D");
  await host.type("W");
  assert.equal(host.ui.getEditorText(), "first\nXmiddleY\nlastZW");
  await host.key("\x1b[D");
  await host.key("\x1b[D");
  await host.key("\x1b[1;9C");
  await host.key("\x1b[1;3B");
  await host.type("Q");
  assert.equal(host.ui.getEditorText(), "first\nXmiddleY\nlastQZW");
});
