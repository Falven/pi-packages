/* eslint-disable no-control-regex, no-await-in-loop -- Inspect ANSI output and preserve terminal input order. */
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { stripVTControlCharacters } from "node:util";
import { visibleWidth } from "@earendil-works/pi-tui";

const previousColor = process.env["FORCE_COLOR"];
process.env["FORCE_COLOR"] = "3";
const { openHost } = await import("../fixtures/host.ts");
if (previousColor === undefined) delete process.env["FORCE_COLOR"];
else process.env["FORCE_COLOR"] = previousColor;

test("quoted prose displays native borders and retains its source through editing and undo", async (t) => {
  const host = await openHost(t);
  const source = "> **quoted**\n> *old*";
  host.terminal.output = "";
  host.ui.setEditorText(source);
  const output = await host.output();
  assert.match(output, /│ quoted/);
  assert.match(output, /│ old/);
  assert.doesNotMatch(output, /> \*\*quoted\*\*|\*old\*/);
  assert.match(host.terminal.output, /\x1b\[1m(?:\x1b\[[\d;]+m)*q/);
  assert.equal(host.ui.getEditorText(), source);
  for (let i = 0; i < 3; i++) await host.key("\x1b[1;2D");
  host.ui.pasteToEditor("new");
  assert.equal(host.ui.getEditorText(), "> **quoted**\n> *new*");
  await host.key("\x1b[109;10u");
  host.terminal.output = "";
  await host.key("\x1b[122;9u");
  assert.match(await host.output(), /> \*old\*/);
  assert.equal(host.ui.getEditorText(), source);
  await host.key("\x1b[122;10u");
  assert.equal(host.ui.getEditorText(), "> **quoted**\n> *new*");
});

test("nested lists and tasks format their prose without changing markers or link targets", async (t) => {
  const host = await openHost(t);
  host.terminal.rows = 60;
  const source = [
    "> - **parent**",
    ">   3) *child*",
    ">   4) ~~next~~",
    "",
    "- [ ] **todo**",
    "+ [x] [done](https://pi.dev)",
  ].join("\n");
  host.terminal.output = "";
  host.ui.setEditorText(source);
  const output = await host.output();
  assert.match(output, /│ - parent/);
  assert.match(output, /│   3\) child/);
  assert.match(output, /│   4\) next/);
  assert.match(output, /- \[ \] todo/);
  assert.match(output, /\+ \[x\] done/);
  assert.doesNotMatch(output, /\*\*parent\*\*|\*child\*|~~next~~|https:\/\/pi.dev/);
  assert.equal(host.ui.getEditorText(), source);
  await host.key("\x1b[1;4D");
  await host.type("ready");
  assert.equal(host.ui.getEditorText(), source.replace("[done]", "[ready]"));
  await host.key("\x1b[122;9u");
  assert.equal(host.ui.getEditorText(), source);
});

test("horizontal rules fill their row and remain replaceable Markdown in the shared history", async (t) => {
  const host = await openHost(t, { columns: 24 });
  host.terminal.rows = 60;
  const source = "Start\n\n---\n\nEnd";
  host.terminal.output = "";
  host.ui.setEditorText(source);
  assert.match(await host.output(), /Start─{23}End/);
  assert.equal(host.ui.getEditorText(), source);
  await host.key("\x1b[97;9u");
  await host.key("\x1b[D");
  await host.key("\x1b[B");
  await host.key("\x1b[B");
  await host.key("\x1b[1;2C");
  host.ui.pasteToEditor("divider");
  assert.equal(host.ui.getEditorText(), "Start\n\ndivider\n\nEnd");
  await host.key("\x1b[122;9u");
  assert.equal(host.ui.getEditorText(), source);
  host.terminal.output = "";
  await host.key("\x1b[109;10u");
  assert.match(await host.output(), /---/);
  await host.key("\x1b[122;10u");
  assert.equal(host.ui.getEditorText(), "Start\n\ndivider\n\nEnd");
  await host.key("\x1b[109;10u");
  host.terminal.output = "";
  host.ui.setEditorText("> ***");
  assert.match(await host.output(), /│ ─{21}/);
  assert.equal(host.ui.getEditorText(), "> ***");
  host.terminal.output = "";
  host.ui.setEditorText("Start\n\n_ _ _  \n\nEnd");
  assert.match(await host.output(), /Start─{23}End/);
  assert.equal(host.ui.getEditorText(), "Start\n\n_ _ _  \n\nEnd");
});

test("Enter continues a list and leaves an empty item in either view with shared undo and redo", async (t) => {
  const host = await openHost(t);
  for (const sourceView of [false, true]) {
    if (sourceView) await host.key("\x1b[109;10u");
    host.ui.setEditorText("- first");
    await host.key("\r");
    assert.equal(host.ui.getEditorText(), "- first\n- ");
    assert.equal(host.requests.length, 0);
    await host.type("second");
    await host.key("\r");
    assert.equal(host.ui.getEditorText(), "- first\n- second\n- ");
    await host.key("\r");
    assert.equal(host.ui.getEditorText(), "- first\n- second\n");
    assert.equal(host.requests.length, 0);
    assert.match(await host.output(), /- second/);
    await host.key("\x1b[122;9u");
    assert.equal(host.ui.getEditorText(), "- first\n- second\n- ");
    await host.key("\x1b[122;9u");
    assert.equal(host.ui.getEditorText(), "- first\n- second");
    await host.key("\x1b[122;10u");
    assert.equal(host.ui.getEditorText(), "- first\n- second\n- ");
    await host.key("\x1b[122;10u");
    assert.equal(host.ui.getEditorText(), "- first\n- second\n");
  }
});

test("list Enter follows nested source structure, numbering, tasks, and continuation lines in both views", async (t) => {
  const host = await openHost(t);
  const cases = [
    ["+ [x] finished", "+ [x] finished\n+ [ ] "],
    ["- parent\n  9) child", "- parent\n  9) child\n  10) "],
    ["> 2. parent\n>    - [X] child", "> 2. parent\n>    - [X] child\n>    - [ ] "],
    ["> - first\n>   continuation", "> - first\n>   continuation\n> - "],
    ["> - [x] done\n> - [ ] ", "> - [x] done\n> "],
    ["- parent\n  - ", "- parent\n  "],
  ];
  for (const sourceView of [false, true]) {
    if (sourceView) await host.key("\x1b[109;10u");
    for (const [source, continued] of cases) {
      host.ui.setEditorText(source!);
      await host.key("\r");
      assert.equal(host.ui.getEditorText(), continued);
      assert.equal(host.requests.length, 0);
      await host.key("\x1b[122;9u");
      assert.equal(host.ui.getEditorText(), source);
    }
  }
});

test("wrapped quoted lists retain borders, indentation, and Unicode caret and selection columns", async (t) => {
  const host = await openHost(t, { columns: 16 });
  const source = "> - **ab界c👩‍💻de\u0301fghijk**\n> - tail";
  host.terminal.output = "";
  host.ui.setEditorText(source);
  assert.match(await host.output(), /│ - ab界c👩‍💻défg│   hijk│ - tail/);
  await host.key("\x1b[A");
  await host.key("\x1b[A");
  await host.type("!");
  const edited = "> - **ab界!c👩‍💻de\u0301fghijk**\n> - tail";
  assert.equal(host.ui.getEditorText(), edited);
  await host.key("\x1b[1;2B");
  await host.type("X");
  assert.equal(host.ui.getEditorText(), "> - **ab界!X**\n> - tail");
  await host.key("\x1b[109;10u");
  await host.key("\x1b[122;9u");
  assert.equal(host.ui.getEditorText(), edited);
  await host.key("\x1b[122;9u");
  assert.equal(host.ui.getEditorText(), source);
  await host.key("\x1b[109;10u");
  await host.key("\x1b[122;10u");
  await host.key("\x1b[122;10u");
  assert.equal(host.ui.getEditorText(), "> - **ab界!X**\n> - tail");
});

test("list Enter replaces the active selection as one edit and undo restores that selection", async (t) => {
  const host = await openHost(t);
  for (const sourceView of [false, true]) {
    if (sourceView) await host.key("\x1b[109;10u");
    host.ui.setEditorText("- beforeOLDafter");
    for (let i = 0; i < 5; i++) await host.key("\x1b[D");
    for (let i = 0; i < 3; i++) await host.key("\x1b[1;2D");
    await host.key("\r");
    assert.equal(host.ui.getEditorText(), "- before\n- after");
    assert.equal(host.requests.length, 0);
    await host.key("\x1b[122;9u");
    assert.equal(host.ui.getEditorText(), "- beforeOLDafter");
    await host.type("X");
    assert.equal(host.ui.getEditorText(), "- beforeXafter");
  }
});

test("Shift Enter inserts a plain newline and Command Enter submits list Markdown through Pi", async (t) => {
  const host = await openHost(t);
  for (const sourceView of [false, true]) {
    if (sourceView) await host.key("\x1b[109;10u");
    host.ui.setEditorText("- **first**");
    await host.key("\x1b[13;2u");
    assert.equal(host.ui.getEditorText(), "- **first**\n");
    assert.equal(host.requests.length, 0);
    await host.key("\x1b[122;9u");
    assert.equal(host.ui.getEditorText(), "- **first**");
  }
  await host.key("\x1b[13;9u");
  await host.settled();
  assert.equal(host.requests.length, 1);
  assert.deepEqual(
    host.requests[0]?.messages.filter((message) => message.role === "user"),
    [{ role: "user", content: [{ type: "text", text: "- **first**" }] }],
  );
});

test("native completion acceptance precedes list Enter and explicit submission in either view", async (t) => {
  const host = await openHost(t, {
    extension: (pi) => {
      pi.on("session_start", async (_event, ctx) => {
        await writeFile(join(ctx.cwd, "manual.md"), "Manual");
      });
    },
  });
  for (const sourceView of [false, true]) {
    if (sourceView) await host.key("\x1b[109;10u");
    for (const accept of ["\r", "\x1b[13;9u"]) {
      host.ui.setEditorText("> - Read ");
      host.terminal.output = "";
      await host.type("@man");
      await t.waitFor(async () => assert.match(await host.output(), /manual\.md/));
      await host.key(accept);
      assert.equal(host.ui.getEditorText(), "> - Read @manual.md ");
      assert.equal(host.requests.length, 0);
      await host.key("\r");
      assert.equal(host.ui.getEditorText(), "> - Read @manual.md \n> - ");
      assert.equal(host.requests.length, 0);
      await host.key("\x1b[122;9u");
      await host.key("\x1b[122;9u");
      assert.equal(host.ui.getEditorText(), "> - Read @man");
    }
  }
});

test("explicit native Enter bindings retain newline, submit, and application priority in lists", async (t) => {
  const host = await openHost(t, {
    keybindings: {
      "tui.input.newLine": "enter",
      "tui.input.submit": "shift+enter",
      "app.clear": "super+enter",
    },
  });
  host.ui.setEditorText("- first");
  await host.key("\r");
  assert.equal(host.ui.getEditorText(), "- first\n");
  await host.key("\x1b[13;9u");
  assert.equal(host.ui.getEditorText(), "");
  assert.equal(host.requests.length, 0);
  await host.key("\x1b[122;9u");
  await host.key("\x1b[109;10u");
  await host.key("\x1b[13;2u");
  await host.settled();
  assert.equal(host.requests.length, 1);
  assert.deepEqual(
    host.requests[0]?.messages.filter((message) => message.role === "user"),
    [{ role: "user", content: [{ type: "text", text: "- first" }] }],
  );
});

test("lazy quote and list continuation lines display their enclosing structure without adding source markers", async (t) => {
  const host = await openHost(t);
  const source = "> - **one**\ncontinuation";
  host.terminal.output = "";
  host.ui.setEditorText(source);
  assert.match(await host.output(), /│ - one│   continuation/);
  assert.equal(host.ui.getEditorText(), source);
  await host.key("\x1b[1;9D");
  await host.type("next ");
  assert.equal(host.ui.getEditorText(), "> - **one**\nnext continuation");
  await host.key("\x1b[122;9u");
  assert.equal(host.ui.getEditorText(), source);
  await host.key("\x1b[1;9B");
  await host.key("\r");
  assert.equal(host.ui.getEditorText(), "> - **one**\ncontinuation\n> - ");
  assert.equal(host.requests.length, 0);
});

test("list Enter keeps inline formatting intact at visible boundaries and when splitting an item", async (t) => {
  const host = await openHost(t);
  for (const sourceView of [false, true]) {
    if (sourceView) await host.key("\x1b[109;10u");
    host.ui.setEditorText("> - ***bold***");
    await host.key("\x1b[1;9C");
    await host.key("\r");
    assert.equal(host.ui.getEditorText(), "> - ***bold***\n> - ");
    host.ui.setEditorText("> - **leftRIGHT**");
    await host.key("\x1b[1;9C");
    for (let i = 0; i < (sourceView ? 7 : 5); i++) await host.key("\x1b[D");
    await host.key("\r");
    assert.equal(host.ui.getEditorText(), "> - **left**\n> - **RIGHT**");
    assert.equal(host.requests.length, 0);
    await host.key("\x1b[122;9u");
    assert.equal(host.ui.getEditorText(), "> - **leftRIGHT**");
    await host.type("!");
    assert.equal(host.ui.getEditorText(), "> - **left!RIGHT**");
  }
});

test("nested tab indentation and Unicode remain exact through formatted selection and list continuation", async (t) => {
  const host = await openHost(t);
  const source = "> - **e\u0301👩‍💻界**\n> \t- **a\tb**";
  host.terminal.output = "";
  host.ui.setEditorText(source);
  const output = await host.output();
  assert.match(output, /│ - é👩‍💻界/);
  assert.match(output, /│     - a    b/);
  assert.doesNotMatch(output, /\*\*/);
  assert.equal(host.ui.getEditorText(), source);
  await host.key("\x1b[1;2D");
  await host.key("\x1b[1;2D");
  await host.type("!");
  assert.equal(host.ui.getEditorText(), "> - **e\u0301👩‍💻界**\n> \t- **a!**");
  await host.key("\x1b[122;9u");
  await host.key("\x1b[97;9u");
  await host.key("\x1b[D");
  await host.key("\x1b[1;9C");
  for (let i = 0; i < 3; i++) await host.key("\x1b[1;2D");
  await host.type("x");
  assert.equal(host.ui.getEditorText(), "> - **x**\n> \t- **a\tb**");
  await host.key("\x1b[122;9u");
  await host.key("\x1b[97;9u");
  await host.key("\x1b[C");
  await host.key("\x05");
  await host.key("\r");
  assert.equal(host.ui.getEditorText(), `${source}\n> \t- `);
  assert.equal(host.requests.length, 0);
});

test("source marker edits and native structural replacement preserve raw constructs and exported Markdown", async (t) => {
  const host = await openHost(t);
  host.terminal.rows = 120;
  const tail = [
    "",
    "",
    "| A | B |",
    "| - | - |",
    "| **raw** | [ref] |",
    "",
    "<div>",
    "- not a list",
    "</div>",
    "",
    "![alt](/image.png)",
    "",
    "[ref]: /target",
  ].join("\n");
  const source = `> **keep**\n\n- [ ] old${tail}`;
  host.terminal.output = "";
  host.ui.setEditorText(source);
  const output = await host.output();
  assert.match(output, /│ keep/);
  assert.match(output, /\| \*\*raw\*\* \| \[ref\] \|/);
  assert.match(output, /<div>- not a list<\/div>/);
  assert.match(output, /!\[alt\]\(\/image.png\)/);
  assert.match(output, /\[ref\]: \/target/);

  await host.key("\x1b[109;10u");
  await host.key("\x1b[97;9u");
  await host.key("\x1b[D");
  await host.key("\x1b[B");
  await host.key("\x1b[B");
  await host.key("\x1b[1;2C");
  host.ui.pasteToEditor("3.");
  assert.equal(host.ui.getEditorText(), `> **keep**\n\n3. [ ] old${tail}`);
  await host.key("\x1b[C");
  await host.key("\x1b[C");
  await host.key("\x1b[1;2C");
  await host.type("x");
  const checked = `> **keep**\n\n3. [x] old${tail}`;
  assert.equal(host.ui.getEditorText(), checked);
  await host.key("\x1b[109;10u");
  await host.key("\x1b[1;9D");
  await host.key("\x1b[1;10C");
  host.terminal.output = "";
  host.ui.pasteToEditor("- [ ] **first**\n- [x] second");
  const replaced = `> **keep**\n\n- [ ] **first**\n- [x] second${tail}`;
  assert.equal(host.ui.getEditorText(), replaced);
  assert.match(await host.output(), /- \[ \] first- \[x\] second/);
  await host.key("\x1b[122;9u");
  assert.equal(host.ui.getEditorText(), checked);
  await host.key("\x1b[109;10u");
  await host.key("\x1b[122;9u");
  await host.key("\x1b[122;9u");
  assert.equal(host.ui.getEditorText(), source);
  await host.key("\x1b[122;10u");
  await host.key("\x1b[122;10u");
  await host.key("\x1b[122;10u");
  assert.equal(host.ui.getEditorText(), replaced);
  await host.key("\x1b[13;9u");
  await host.settled();
  assert.deepEqual(
    host.requests[0]?.messages.filter((message) => message.role === "user"),
    [{ role: "user", content: [{ type: "text", text: replaced }] }],
  );
});

test("narrow structured rows fit Pi's terminal without splitting wide graphemes", async (t) => {
  const host = await openHost(t, { columns: 6 });
  const source = "> - 界👩‍💻\te\u0301";
  host.terminal.output = "";
  host.ui.setEditorText(source);
  const output = await host.output();
  assert.match(output, /界/);
  assert.match(output, /👩‍💻/);
  const rows = [
    ...host.terminal.output.matchAll(/\x1b\[(\d+);1H\x1b\[2K(.*?)(?=\x1b\[\d+;\d+H|$)/gs),
  ];
  assert(
    rows.some((row) => row[2]!.includes("👩‍💻")),
    JSON.stringify(host.terminal.output),
  );
  assert(rows.some((row) => stripVTControlCharacters(row[2]!).trimEnd() === "│  界"));
  for (const row of rows) {
    assert(visibleWidth(stripVTControlCharacters(row[2]!)) <= 6);
  }
  assert.equal(host.ui.getEditorText(), source);
  await host.key("\x1b[1;2D");
  await host.type("X");
  assert.equal(host.ui.getEditorText(), "> - 界👩‍💻\tX");
  await host.key("\x1b[122;9u");
  assert.equal(host.ui.getEditorText(), source);
});

test("a selection inside rule source remains exact after switching to formatted view", async (t) => {
  const host = await openHost(t);
  host.ui.setEditorText("---");
  await host.key("\x1b[109;10u");
  await host.key("\x1b[1;9A");
  await host.key("\x1b[C");
  await host.key("\x1b[1;2C");
  await host.key("\x1b[109;10u");
  await host.type("X");
  assert.equal(host.ui.getEditorText(), "-X-");
  await host.key("\x1b[122;9u");
  assert.equal(host.ui.getEditorText(), "---");
  await host.key("\x1b[109;10u");
  await host.type("Y");
  assert.equal(host.ui.getEditorText(), "-Y-");
});

test("Enter on a raw HTML list marker retains native prose submission", async (t) => {
  const host = await openHost(t);
  const source = "- first\n\n<div>\n- literal\n</div>";
  host.ui.setEditorText(source);
  await host.output();
  await host.key("\x1b[A");
  await host.key("\r");
  await host.settled();
  assert.equal(host.requests.length, 1);
  assert.deepEqual(
    host.requests[0]?.messages.filter((message) => message.role === "user"),
    [{ role: "user", content: [{ type: "text", text: source }] }],
  );
});
