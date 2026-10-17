/* eslint-disable no-await-in-loop -- Preserve terminal input order. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { openHost } from "../fixtures/host.ts";

test("formatted Backspace deletes hidden source syntax and immediately renders repaired Markdown", async (t) => {
  const host = await openHost(t);
  host.ui.setEditorText("**bold**");
  host.terminal.output = "";
  await host.key("\x7f");
  assert.equal(host.ui.getEditorText(), "**bold*");
  assert.match(await host.output(), /\*bold/);
  host.terminal.output = "";
  await host.type("*");
  assert.equal(host.ui.getEditorText(), "**bold**");
  assert.match(await host.output(), /bold/);
  assert.doesNotMatch(await host.output(), /\*bold/);
  await host.key("\x1b[122;9u");
  assert.equal(host.ui.getEditorText(), "**bold*");
  await host.key("\x1b[122;9u");
  assert.equal(host.ui.getEditorText(), "**bold**");
});

test("deletion and repair reparse links, nested formatting, and inline code without changing surrounding Markdown", async (t) => {
  const host = await openHost(t, { columns: 120 });
  for (const { before, after, display, repaired, repair } of [
    {
      before: "# Heading **bold**",
      after: "# Heading **bold*",
      display: "Heading *bold",
      repaired: "Heading bold",
      repair: "*",
    },
    {
      before: "> **quoted**",
      after: "> **quoted*",
      display: "│ *quoted",
      repaired: "│ quoted",
      repair: "*",
    },
    {
      before: "- [ ] **task**",
      after: "- [ ] **task*",
      display: "- [ ] *task",
      repaired: "- [ ] task",
      repair: "*",
    },
    {
      before: "See [Pi](https://pi.dev)",
      after: "See [Pi](https://pi.dev",
      display: "See [Pi](https://pi.dev",
      repaired: "See Pi",
      repair: ")",
    },
    {
      before: "Keep `echo`",
      after: "Keep `echo",
      display: "Keep `echo",
      repaired: "Keep echo",
      repair: "`",
    },
  ]) {
    host.ui.setEditorText(before);
    host.terminal.output = "";
    await host.key("\x7f");
    assert.equal(host.ui.getEditorText(), after);
    assert((await host.output()).includes(display), after);
    host.terminal.output = "";
    await host.type(repair);
    assert.equal(host.ui.getEditorText(), before);
    assert((await host.output()).includes(repaired), before);
    assert(!(await host.output()).includes(display), before);
  }
});

for (const view of ["formatted", "source"]) {
  test(`word deletion follows native punctuation groups in ${view} Markdown and yank restores source`, async (t) => {
    const host = await openHost(t);
    if (view === "source") await host.key("\x1b[109;10u");
    host.ui.setEditorText("**one two**");
    await host.key("\x17");
    assert.equal(host.ui.getEditorText(), "**one two");
    await host.key("\x17");
    assert.equal(host.ui.getEditorText(), "**one ");
    await host.key("\x19");
    assert.equal(host.ui.getEditorText(), "**one two**");
    await host.key("\x1b[122;9u");
    assert.equal(host.ui.getEditorText(), "**one ");
    await host.key("\x1b[122;10u");
    assert.equal(host.ui.getEditorText(), "**one two**");
  });

  test(`forward deletion edits Markdown syntax and preserves source graphemes in ${view} view`, async (t) => {
    const host = await openHost(t);
    if (view === "source") await host.key("\x1b[109;10u");
    for (const [before, character, word] of [
      ["**bold**", "*bold**", "bold**"],
      ["~~gone~~", "~gone~~", "gone~~"],
      ["[Pi](https://pi.dev)", "Pi](https://pi.dev)", "Pi](https://pi.dev)"],
      ["# Heading", " Heading", " Heading"],
      ["`code`", "code`", "code`"],
      ["```ts\ncode\n```", "``ts\ncode\n```", "ts\ncode\n```"],
      ["e\u0301 **bold**", " **bold**", " **bold**"],
      ["👩‍💻\t**bold**", "\t**bold**", "\t**bold**"],
    ]) {
      host.ui.setEditorText(before!);
      await host.key("\x1b[1;9A");
      await host.key("\x04");
      assert.equal(host.ui.getEditorText(), character, before);
      await host.key("\x1b[122;9u");
      await host.key("\x1bd");
      assert.equal(host.ui.getEditorText(), word, before);
      await host.key("\x19");
      assert.equal(host.ui.getEditorText(), before);
    }
  });

  test(`line and document movement reach source boundaries before deletion in ${view} view`, async (t) => {
    const host = await openHost(t);
    if (view === "source") await host.key("\x1b[109;10u");
    for (const end of ["\x05", "\x1b[1;9B", "\x1b[B"]) {
      host.ui.setEditorText("# Heading\n**bold**");
      await host.key("\x1b[D");
      await host.key(end);
      await host.key("\x7f");
      assert.equal(host.ui.getEditorText(), "# Heading\n**bold*", end);
    }
    for (const start of ["\x01", "\x1b[1;9A", "\x1b[A"]) {
      host.ui.setEditorText("**bold**");
      await host.key(start);
      await host.key("\x04");
      assert.equal(host.ui.getEditorText(), "*bold**", start);
    }
    for (const keys of [["\x15"], ["\x01", "\x0b"]]) {
      host.ui.setEditorText("# Heading\n**bold**");
      for (const key of keys) await host.key(key);
      assert.equal(host.ui.getEditorText(), "# Heading\n");
      await host.key("\x15");
      assert.equal(host.ui.getEditorText(), "# Heading");
      await host.key("\x19");
      assert.equal(host.ui.getEditorText(), "# Heading\n**bold**");
    }
  });
}
