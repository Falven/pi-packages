import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { stripVTControlCharacters } from "node:util";
import { InteractiveMode, runPrintMode, type InputEvent } from "@earendil-works/pi-coding-agent";
import { getNativeClipboard, Text, type NativeClipboard } from "@earendil-works/pi-tui";
import { openNativeHost } from "../../../fixtures/native-host.ts";

const skillsExtension = new URL("../src/index.ts", import.meta.url).pathname;
const chatExtension = new URL("../../pi-chat/src/index.ts", import.meta.url).pathname;
const composerExtension = new URL("../../pi-composer/src/index.ts", import.meta.url).pathname;
const quoteExtension = new URL("../../pi-quote/src/index.ts", import.meta.url).pathname;
const image = {
  type: "image",
  data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==",
  mimeType: "image/png",
} as const;

async function skillFixture(t: TestContext) {
  const directory = await mkdtemp(join(tmpdir(), "pi-skill-presentation-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const review = join(directory, "review", "SKILL.md");
  await mkdir(join(directory, "review"));
  await writeFile(
    review,
    "---\nname: review\ndescription: Review behavior\n---\nReview the actual behavior.\n",
  );
  const plan = join(directory, "plan", "SKILL.md");
  await mkdir(join(directory, "plan"));
  await writeFile(
    plan,
    "---\nname: plan\ndescription: Plan changes\n---\nPlan the smallest change, without loading /skill:review.\n",
  );
  return { directory, review, plan };
}

async function screen(host: Awaited<ReturnType<typeof openNativeHost>>) {
  await host.frame();
  return host.screenLines().map(stripVTControlCharacters).join("\n");
}

function assertWritableClipboard(
  clipboard: NativeClipboard | undefined,
): asserts clipboard is NativeClipboard & Required<Pick<NativeClipboard, "setText">> {
  assert(clipboard?.setText);
}

test("standalone native chat shows the request, not its loaded skill, without changing source", async (t) => {
  const fixture = await skillFixture(t);
  const host = await openNativeHost(t, {
    extensionPaths: [skillsExtension],
    skillPaths: [fixture.directory],
    rows: 32,
  });
  const draft = "Please apply /skill:review to this change.";
  const expanded = `<skill name="review" location="${fixture.review}">\nReferences are relative to ${join(fixture.directory, "review")}.\n\nReview the actual behavior.\n</skill>\n\n${draft}`;
  await host.type(draft);
  await host.key("\r");
  await host.settled();
  const source = host.session.sessionManager.getBranch();
  const user = source.find((entry) => entry.type === "message" && entry.message.role === "user");
  assert(user?.type === "message" && user.message.role === "user");
  assert.deepEqual(user.message.content, [{ type: "text", text: expanded }]);
  assert.deepEqual(host.requests[0]?.messages.find((message) => message.role === "user")?.content, [
    { type: "text", text: expanded },
  ]);
  const before = JSON.stringify(source);
  const frame = await screen(host);
  assert.match(frame, /Please apply \/skill:review to this change\./);
  assert.doesNotMatch(frame, /\[skill\]|Review the actual behavior|References are relative|<skill/);
  assert.equal(frame.match(/Please apply/g)?.length, 1);
  const rows = frame.split("\n");
  assert.equal(
    rows.findIndex((line) => line.includes("Received.")) -
      rows.findIndex((line) => line.includes(draft)),
    3,
  );
  await host.key("\x0f");
  assert.doesNotMatch(await screen(host), /\[skill\]|Review the actual behavior/);
  assert.equal(JSON.stringify(host.session.sessionManager.getBranch()), before);
  await host.key("\x1b[A");
  assert.equal(host.ui.getEditorText(), draft);
});

test("multiple leading and repeated references keep one formatted user message, including skill-only requests", async (t) => {
  const fixture = await skillFixture(t);
  const host = await openNativeHost(t, {
    extensionPaths: [skillsExtension],
    skillPaths: [fixture.directory],
    columns: 100,
    rows: 40,
  });
  const draft =
    "/skill:plan Then **/skill:review**, and /skill:plan again.\n\n- Keep `literal code` here.";
  host.ui.setEditorText(draft);
  await host.key("\r");
  await host.settled();
  const expanded = `<skill name="plan" location="${fixture.plan}">\nReferences are relative to ${join(fixture.directory, "plan")}.\n\nPlan the smallest change, without loading /skill:review.\n</skill>\n\n<skill name="review" location="${fixture.review}">\nReferences are relative to ${join(fixture.directory, "review")}.\n\nReview the actual behavior.\n</skill>\n\n${draft}`;
  assert.deepEqual(host.requests[0]?.messages.find((message) => message.role === "user")?.content, [
    { type: "text", text: expanded },
  ]);
  const frame = await screen(host);
  assert.match(frame, /\/skill:plan Then \/skill:review, and \/skill:plan again\./);
  assert.match(frame, /Keep literal code here\./);
  assert.doesNotMatch(
    frame,
    /\[skill\]|References are relative|Review the actual behavior|Plan the smallest|<skill/,
  );
  assert.equal(frame.match(/\/skill:plan Then/g)?.length, 1);
  assert.doesNotMatch(frame, /\*\*\/skill:review\*\*|`literal code`/);
  host.ui.setEditorText("/skill:review");
  await host.key("\r");
  await t.waitFor(() => assert.equal(host.requests.length, 2));
  await host.settled();
  const only = await screen(host);
  assert(
    only.split("\n").some((line) => line.trim() === "/skill:review"),
    only,
  );
  assert.doesNotMatch(only, /\[skill\]|Review the actual behavior/);
});

test("reload and resumed native history reconstruct references from recorded metadata without changing native editor history", async (t) => {
  const fixture = await skillFixture(t);
  const extensions: string[] = [];
  const host = await openNativeHost(t, {
    extensionPaths: extensions,
    skillPaths: [fixture.directory],
    persistSession: true,
    rows: 40,
  });
  await host.type("/skill:review Saved native request.");
  await host.key("\r");
  await host.settled();
  const expanded = `<skill name="review" location="${fixture.review}">\nReferences are relative to ${join(fixture.directory, "review")}.\n\nReview the actual behavior.\n</skill>\n\nSaved native request.`;
  const before = JSON.stringify(host.session.sessionManager.getBranch());
  assert.match(await screen(host), /\[skill\] review/);
  assert.deepEqual(host.requests[0]?.messages.find((message) => message.role === "user")?.content, [
    { type: "text", text: expanded },
  ]);
  await host.reload();
  await host.key("\x1b[A");
  assert.equal(host.ui.getEditorText(), "/skill:review Saved native request.");
  host.ui.setEditorText("");
  await rm(fixture.review);
  extensions.push(skillsExtension);
  await host.reload();
  const frame = await screen(host);
  assert.match(frame, /\/skill:review/);
  assert.match(frame, /Saved native request\./);
  assert.doesNotMatch(frame, /\[skill\]|Review the actual behavior|ENOENT/);
  assert.equal(JSON.stringify(host.session.sessionManager.getBranch()), before);
  await host.key("\x1b[A");
  assert.equal(host.ui.getEditorText(), "/skill:review Saved native request.");
  host.ui.setEditorText("");
  const file = host.session.sessionFile!;
  await host.runtime.newSession();
  assert.doesNotMatch(await screen(host), /Saved native request|\/skill:review/);
  await host.runtime.switchSession(file);
  const resumed = await screen(host);
  assert.match(resumed, /\/skill:review/);
  assert.match(resumed, /Saved native request\./);
  assert.doesNotMatch(resumed, /\[skill\]|Review the actual behavior|ENOENT/);
  assert.equal(JSON.stringify(host.session.sessionManager.getBranch()), before);
  assert.equal(host.requests.length, 1);
});

test("retained-source Find reveals only the selected recorded skill occurrence and restores compact requests", async (t) => {
  const fixture = await skillFixture(t);
  await writeFile(
    fixture.review,
    "---\nname: review\ndescription: Review\n---\nReview needle first.\n\nReview needle second.\n",
  );
  await writeFile(fixture.plan, "---\nname: plan\ndescription: Plan\n---\nPlan needle only.\n");
  const host = await openNativeHost(t, {
    extensionPaths: [skillsExtension, chatExtension],
    skillPaths: [fixture.directory],
    columns: 100,
    rows: 45,
    keybindings: { "tui.altScreen.search": "ctrl+f", "tui.altScreen.searchPrevious": "ctrl+p" },
  });
  const draft = "Use /skill:review and /skill:plan; request needle.";
  await host.type(draft);
  await host.key("\r");
  await host.settled();
  await host.type(draft);
  await host.key("\r");
  await t.waitFor(() => assert.equal(host.requests.length, 2));
  await host.settled();
  const source = JSON.stringify(host.session.sessionManager.getBranch());
  const requests = [...host.requestBodies];
  await rm(fixture.review);
  await writeFile(fixture.plan, "Changed skill must never appear.\n");
  assert.doesNotMatch(await screen(host), /Review needle|Plan needle|\[skill\]/);
  await host.key("\x06");
  await host.type("needle");
  const first = await screen(host);
  assert.match(first, /1\/8/);
  assert.match(first, /Review needle first\./);
  assert.match(first, /Review needle second\./);
  assert.equal(first.match(/Review needle first/g)?.length, 1);
  assert.doesNotMatch(first, /Plan needle|\[skill\]|Changed skill|ENOENT/);
  const selected = host
    .screenLines()
    .find((line) => stripVTControlCharacters(line).includes("Review needle first."));
  assert(selected?.includes(host.ui.theme.getBgAnsi("searchMatchBg")), JSON.stringify(selected));
  await host.key("\r");
  assert.match(await screen(host), /2\/8/);
  await host.key("\r");
  const other = await screen(host);
  assert.match(other, /3\/8/);
  assert.match(other, /Plan needle only\./);
  assert.doesNotMatch(other, /Review needle|\[skill\]/);
  await host.key("\r");
  const prose = await screen(host);
  assert.match(prose, /4\/8/);
  assert.doesNotMatch(prose, /Review needle|Plan needle|\[skill\]/);
  await host.key("\r");
  const duplicate = await screen(host);
  assert.match(duplicate, /5\/8/);
  assert.equal(duplicate.match(/Review needle first/g)?.length, 1);
  assert(duplicate.indexOf("Received.") < duplicate.indexOf("Review needle first."), duplicate);
  await host.type("-absent");
  const absent = await screen(host);
  assert.match(absent, /No matches/);
  assert.doesNotMatch(absent, /Review needle|Plan needle/);
  await host.key("\x1b");
  await host.key("\x06");
  await host.type("needle");
  assert.match(await screen(host), /Review needle first/);
  await host.key("\x1b");
  assert.doesNotMatch(await screen(host), /Review needle|Plan needle|\[skill\]/);
  assert.equal(JSON.stringify(host.session.sessionManager.getBranch()), source);
  assert.deepEqual(host.requestBodies, requests);
});

test("skill-block-shaped code and unrecognized envelopes remain visible literal user content", async (t) => {
  const fixture = await skillFixture(t);
  const host = await openNativeHost(t, {
    extensionPaths: [skillsExtension, chatExtension],
    skillPaths: [fixture.directory],
    columns: 120,
    rows: 45,
  });
  const example =
    '```xml\n<skill name="example" location="/examples/SKILL.md">\nReferences are relative to /examples.\n\nFenced authored example /skill:review\n</skill>\n```';
  host.ui.setEditorText(example);
  await host.key("\r");
  await host.settled();
  assert.match(await screen(host), /Fenced authored example \/skill:review/);
  const literal =
    '<skill name="unrecognized" location="/examples/SKILL.md">\nUnrecognized authored instructions.\n</skill>\n\nKeep this literal.';
  host.ui.setEditorText(literal);
  await host.key("\r");
  await t.waitFor(() => assert.equal(host.requests.length, 2));
  await host.settled();
  const frame = await screen(host);
  assert.match(frame, /Unrecognized authored instructions\./);
  assert.match(frame, /<skill name="unrecognized"/);
  assert.doesNotMatch(frame, /\[skill\]/);
  assert.deepEqual(
    host.session.messages
      .filter((message) => message.role === "user")
      .map((message) => message.content),
    [[{ type: "text", text: example }], [{ type: "text", text: literal }]],
  );
});

test("chat-first installation reveals native skill-only pre-compaction history and clears reveals across reload and branch replacement", async (t) => {
  const fixture = await skillFixture(t);
  await writeFile(
    fixture.review,
    "---\nname: review-alias\ndescription: Review alias\n---\nRecorded archival instruction.\n",
  );
  const extensions = [chatExtension];
  let target = "";
  const host = await openNativeHost(t, {
    extensionPaths: extensions,
    skillPaths: [fixture.directory],
    persistSession: true,
    rows: 42,
    keybindings: { "tui.altScreen.search": "ctrl+f" },
    extensionFactories: [
      (pi) =>
        pi.registerCommand("test-tree", {
          handler: async (_args, ctx) => {
            await ctx.navigateTree(target);
          },
        }),
    ],
  });
  await host.type("/skill:review-alias");
  await host.key("\r");
  await host.settled();
  const user = host.session.sessionManager
    .getBranch()
    .find((entry) => entry.type === "message" && entry.message.role === "user");
  assert(user?.parentId);
  target = user.parentId;
  const original = JSON.stringify(user);
  const file = host.session.sessionFile!;
  host.session.sessionManager.appendCompaction("Compressed context", null, 100);
  const source = JSON.stringify(host.session.sessionManager.getBranch());
  await rm(fixture.review);
  extensions.push(skillsExtension);
  await host.runtime.newSession();
  await host.runtime.switchSession(file);
  assert.doesNotMatch(await screen(host), /Recorded archival|\/skill:review-alias/);
  await host.key("\x06");
  await host.type("archival");
  const revealed = await screen(host);
  assert.match(revealed, /1\/1/);
  assert.match(revealed, /Recorded archival instruction\./);
  assert.match(revealed, /\/skill:review-alias/);
  assert.doesNotMatch(revealed, /\[skill\]|ENOENT/);
  assert(revealed.indexOf("Recorded archival") < revealed.indexOf("Compacted from"), revealed);
  await host.key("\x1b");
  const compact = await screen(host);
  assert.match(compact, /\/skill:review-alias/);
  assert.doesNotMatch(compact, /Recorded archival|\[skill\]/);
  await host.key("\x06");
  await host.type("/skill:review-alias");
  const reference = await screen(host);
  assert.match(reference, /1\/1/);
  assert.doesNotMatch(reference, /Recorded archival|\[skill\]/);
  await host.key("\x1b");
  await host.key("\x06");
  await host.type("References are relative");
  assert.match(await screen(host), /1\/1/);
  assert.match(await screen(host), /Recorded archival/);
  await host.key("\x1b");
  await host.key("\x06");
  await host.type("archival");
  assert.match(await screen(host), /Recorded archival/);
  await host.reload();
  assert.doesNotMatch(await screen(host), /Recorded archival|\[skill\]/);
  assert.equal(JSON.stringify(host.session.sessionManager.getBranch()), source);
  assert.equal(JSON.stringify(host.session.sessionManager.getEntry(user.id)), original);
  await host.key("\x06");
  await host.type("archival");
  assert.match(await screen(host), /Recorded archival/);
  await host.session.prompt("/test-tree");
  assert.doesNotMatch(await screen(host), /Recorded archival|\/skill:review-alias/);
  await host.key("\x06");
  await host.type("archival");
  assert.match(await screen(host), /No matches/);
  assert.equal(host.requests.length, 1);
});

test("generated instruction examples are not recursively peeled and ambiguous envelopes stay literal", async (t) => {
  const fixture = await skillFixture(t);
  const instructions =
    'Review before the example.\n\n```xml\n<skill name="example" location="/example/SKILL.md">\nReferences are relative to /example.\n\nExample instruction /skill:plan.\n</skill>\n\n```\n\nReview after the example.';
  await writeFile(fixture.review, `---\nname: review\ndescription: Review\n---\n${instructions}\n`);
  const host = await openNativeHost(t, {
    extensionPaths: [skillsExtension],
    skillPaths: [fixture.directory],
    rows: 45,
    columns: 120,
  });
  const draft = "Apply /skill:review to this request.";
  await host.type(draft);
  await host.key("\r");
  await host.settled();
  const compact = await screen(host);
  assert.match(compact, /Apply \/skill:review to this request\./);
  assert.doesNotMatch(compact, /Review before|Review after|Example instruction|<skill|\[skill\]/);
  const expanded = `<skill name="review" location="${fixture.review}">\nReferences are relative to ${join(fixture.directory, "review")}.\n\n${instructions}\n</skill>\n\n${draft}`;
  assert.deepEqual(host.requests[0]?.messages.find((message) => message.role === "user")?.content, [
    { type: "text", text: expanded },
  ]);
  const ambiguous =
    '<skill name="authored" location="/example/SKILL.md">\nReferences are relative to /example.\n\nAuthored ambiguous instruction.\n</skill>\n\n<skill broken="unfinished">\nKeep malformed text.';
  host.ui.setEditorText(ambiguous);
  await host.key("\r");
  await t.waitFor(() => assert.equal(host.requests.length, 2));
  await host.settled();
  const literal = await screen(host);
  assert.match(literal, /Authored ambiguous instruction\./);
  assert.match(literal, /<skill name="authored"/);
  assert.match(literal, /Keep malformed text\./);
  assert.doesNotMatch(literal, /\[skill\]/);
});

for (const [name, extensions] of [
  ["standalone native", [skillsExtension]],
  ["skills before chat", [skillsExtension, chatExtension]],
  ["composer first", [composerExtension, skillsExtension]],
  ["skills before composer", [skillsExtension, composerExtension]],
  ["chat first", [chatExtension, skillsExtension]],
  ["skills before chat and composer", [skillsExtension, chatExtension, composerExtension]],
  ["composer and chat first", [composerExtension, chatExtension, skillsExtension]],
] as const) {
  test(`compact presentation preserves native rendering and Find with ${name}`, async (t) => {
    const fixture = await skillFixture(t);
    const host = await openNativeHost(t, {
      extensionPaths: [...extensions],
      skillPaths: [fixture.directory],
      rows: 38,
      columns: 80,
      keybindings: { "tui.altScreen.search": "ctrl+f" },
      extensionFactories: [
        (pi) =>
          pi.registerMarkdownTransformer((markdown, context) =>
            context.messageType === "user"
              ? markdown.replaceAll("source-label", "shown-label")
              : markdown,
          ),
      ],
    });
    const draft = "/skill:review Keep **source-label** and /skill:review.";
    await host.type(draft);
    await host.key("\r");
    await host.settled();
    const source = JSON.stringify(host.session.sessionManager.getBranch());
    const requests = [...host.requestBodies];
    const compact = await screen(host);
    assert.match(compact, /\/skill:review Keep shown-label and \/skill:review\./);
    assert.doesNotMatch(compact, /\[skill\]|Review the actual behavior|source-label/);
    if (extensions.includes(chatExtension)) {
      await host.key("\x06");
      await host.type("actual behavior");
      const revealed = await screen(host);
      assert.match(revealed, /Review the actual behavior/);
      assert.equal(revealed.match(/Keep shown-label/g)?.length, 1, revealed);
      assert.doesNotMatch(revealed, /\[skill\]/);
      await host.key("\x1b");
    }
    await host.reload();
    assert.doesNotMatch(await screen(host), /\[skill\]|Review the actual behavior|cannot attach/);
    assert.equal(host.ui.setTheme("light").success, true);
    await screen(host);
    const user = host.screenLines().find((line) => line.includes("shown-label"));
    assert(user?.includes(host.ui.theme.getBgAnsi("userMessageBg")), JSON.stringify(user));
    host.terminal.resize(44, 38);
    assert.match(await screen(host), /\/skill:review/);
    host.terminal.resize(120, 38);
    assert.match(await screen(host), /\/skill:review Keep shown-label and \/skill:review\./);
    await host.type("/settings");
    await host.key("\r");
    await host.type("Output padding");
    await host.key("\r");
    await host.key("\x1b");
    assert.doesNotMatch(await screen(host), /\[skill\]|Review the actual behavior/);
    assert.equal(host.switchMode("regular"), true);
    const regular = await host.frame();
    assert.match(regular, /\/skill:review Keep shown-label and \/skill:review\./);
    assert.doesNotMatch(regular, /\[skill\]|Review the actual behavior/);
    assert.equal(host.switchMode("fullscreen"), true);
    assert.match(await screen(host), /\/skill:review Keep shown-label and \/skill:review\./);
    assert.equal(JSON.stringify(host.session.sessionManager.getBranch()), source);
    assert.deepEqual(host.requestBodies, requests);
  });
}

for (const extensions of [
  [skillsExtension, chatExtension],
  [chatExtension, skillsExtension],
]) {
  test(`bootstrap observers are released after startup, reload, and shutdown (${extensions[0] === skillsExtension ? "skills first" : "chat first"})`, async (t) => {
    const before = Object.getOwnPropertyDescriptor(
      InteractiveMode.prototype,
      "renderSessionEntries",
    );
    const fixture = await skillFixture(t);
    const host = await openNativeHost(t, {
      extensionPaths: extensions,
      skillPaths: [fixture.directory],
    });
    await host.type("Apply /skill:review.");
    await host.key("\r");
    await host.settled();
    assert.doesNotMatch(await screen(host), /\[skill\]|Review the actual behavior/);
    assert.deepEqual(
      Object.getOwnPropertyDescriptor(InteractiveMode.prototype, "renderSessionEntries"),
      before,
    );
    await host.reload();
    assert.doesNotMatch(await screen(host), /\[skill\]|Review the actual behavior/);
    assert.deepEqual(
      Object.getOwnPropertyDescriptor(InteractiveMode.prototype, "renderSessionEntries"),
      before,
    );
    await host.close();
    assert.deepEqual(
      Object.getOwnPropertyDescriptor(InteractiveMode.prototype, "renderSessionEntries"),
      before,
    );
  });
}

test("disabling compact presentation restores native rows and preserves a later rendering owner", async (t) => {
  const fixture = await skillFixture(t);
  const extensions = [skillsExtension];
  let native:
    | {
        addMessageToChat(...args: unknown[]): void;
        chatContainer: { addChild(component: Text): void };
      }
    | undefined;
  const host = await openNativeHost(t, {
    extensionPaths: extensions,
    skillPaths: [fixture.directory],
    rows: 40,
    onMount: (mode) => {
      native = mode as unknown as NonNullable<typeof native>;
    },
  });
  await host.type("Apply /skill:review.");
  await host.key("\r");
  await host.settled();
  assert.doesNotMatch(await screen(host), /\[skill\]/);
  const source = JSON.stringify(host.session.sessionManager.getBranch());
  assert(native);
  const original = native.addMessageToChat;
  const later = function (this: NonNullable<typeof native>, ...args: unknown[]) {
    original.apply(this, args);
    this.chatContainer.addChild(new Text("Later renderer marker", 0, 0));
  };
  native.addMessageToChat = later;
  extensions.length = 0;
  await host.reload();
  const restored = await screen(host);
  assert.match(restored, /\[skill\] review/);
  assert.match(restored, /Later renderer marker/);
  assert.equal(native.addMessageToChat, later);
  await host.key("\x0f");
  assert.match(await screen(host), /Review the actual behavior/);
  extensions.push(skillsExtension);
  await host.reload();
  assert.doesNotMatch(await screen(host), /\[skill\]|Review the actual behavior/);
  assert.equal(JSON.stringify(host.session.sessionManager.getBranch()), source);
  assert.equal(host.requests.length, 1);
});

test("normal, steering, and follow-up delivery preserve exact instructions, transformations, images, and queue order", async (t) => {
  const fixture = await skillFixture(t);
  const deliveries: InputEvent[] = [];
  const host = await openNativeHost(t, {
    extensionPaths: [composerExtension, skillsExtension, chatExtension],
    skillPaths: [fixture.directory],
    holdResponses: true,
    rows: 48,
    columns: 100,
    extensionFactories: [
      (pi) => {
        pi.on("input", (event) => {
          deliveries.push(event);
          return {
            action: "transform",
            text: `${event.text}\nInput transformation retained.`,
            images: [...(event.images ?? []), image],
          };
        });
      },
    ],
  });
  const attachment = join(host.directory, "notes.txt");
  await writeFile(attachment, "Opaque attachment mentions /skill:plan.\n");
  const normal = `Use /skill:review with [attachment](${attachment}).`;
  const steer = "/skill:review";
  const followUp = "Follow /skill:plan then /skill:review.";
  const review = `<skill name="review" location="${fixture.review}">\nReferences are relative to ${join(fixture.directory, "review")}.\n\nReview the actual behavior.\n</skill>`;
  const plan = `<skill name="plan" location="${fixture.plan}">\nReferences are relative to ${join(fixture.directory, "plan")}.\n\nPlan the smallest change, without loading /skill:review.\n</skill>`;
  const expected = [
    `${review}\n\n${normal}\nInput transformation retained.`,
    `${review}\n\n${steer}\nInput transformation retained.`,
    `${plan}\n\n${review}\n\n${followUp}\nInput transformation retained.`,
  ];
  host.ui.setEditorText(normal);
  await host.key("\r");
  await t.waitFor(() => assert.equal(host.requests.length, 1));
  host.ui.setEditorText("    /skill:review");
  await host.key("\r");
  await t.waitFor(() => assert.deepEqual(host.session.getSteeringMessages(), [expected[1]]));
  host.ui.setEditorText(followUp);
  await host.key("\x1b\r");
  await t.waitFor(() => assert.deepEqual(host.session.getFollowUpMessages(), [expected[2]]));
  assert.deepEqual(
    deliveries.map((event) => event.streamingBehavior),
    [undefined, "steer", "followUp"],
  );
  assert(deliveries.every((event) => event.source === "interactive"));
  host.reply();
  await t.waitFor(() => assert.equal(host.requests.length, 2));
  host.reply();
  await t.waitFor(() => assert.equal(host.requests.length, 3));
  host.reply();
  await host.settled();
  const users = host.session.messages.filter((message) => message.role === "user");
  assert.deepEqual(
    users.map((message) => message.content),
    expected.map((text) => [{ type: "text", text }, image]),
  );
  const providerUsers = host.requests.at(-1)!.messages.filter((message) => message.role === "user");
  assert.deepEqual(
    providerUsers.map((message) => message.content),
    expected.map((text) => [
      { type: "text", text },
      { type: "image_url", image_url: { url: `data:image/png;base64,${image.data}` } },
    ]),
  );
  const source = JSON.stringify(host.session.sessionManager.getBranch());
  const frame = await screen(host);
  assert.match(frame, /Use \/skill:review with attachment/);
  assert.match(frame, /Follow \/skill:plan then \/skill:review\./);
  assert.equal(frame.match(/Input transformation retained/g)?.length, 3);
  assert.doesNotMatch(
    frame,
    /\[skill\]|Review the actual behavior|Plan the smallest change|Opaque attachment/,
  );
  await host.key("\x0f");
  await host.reload();
  assert.doesNotMatch(
    await screen(host),
    /\[skill\]|Review the actual behavior|Plan the smallest change/,
  );
  assert.equal(JSON.stringify(host.session.sessionManager.getBranch()), source);
});

for (const missing of ["getMarkdownTransformers", "locked addMessageToChat"]) {
  test(`unavailable presentation capability (${missing}) reports a limitation without breaking invocation`, async (t) => {
    const fixture = await skillFixture(t);
    let restore: (() => void) | undefined;
    const host = await openNativeHost(t, {
      extensionPaths: [skillsExtension],
      skillPaths: [fixture.directory],
      rows: 38,
      columns: 120,
      onMount: (mode) => {
        const native = mode as unknown as Record<string, unknown>;
        const name = missing === "locked addMessageToChat" ? "addMessageToChat" : missing;
        const original = native[name];
        const descriptor = Object.getOwnPropertyDescriptor(native, name);
        Object.defineProperty(native, name, {
          configurable: missing !== "locked addMessageToChat",
          writable: false,
          value: missing === "locked addMessageToChat" ? original : undefined,
        });
        if (missing !== "locked addMessageToChat")
          restore = () => {
            if (descriptor) Object.defineProperty(native, name, descriptor);
            else delete native[name];
          };
      },
    });
    restore?.();
    assert.match(
      await screen(host),
      /getMarkdownTransformers|Cannot redefine property: addMessageToChat/,
    );
    const draft = "Use /skill:review despite the presentation limitation.";
    await host.type(draft);
    await host.key("\r");
    await host.settled();
    assert.match(await screen(host), /\[skill\] review/);
    const expanded = `<skill name="review" location="${fixture.review}">\nReferences are relative to ${join(fixture.directory, "review")}.\n\nReview the actual behavior.\n</skill>\n\n${draft}`;
    assert.deepEqual(
      host.requests[0]?.messages.find((message) => message.role === "user")?.content,
      [{ type: "text", text: expanded }],
    );
    await rm(fixture.review);
    await host.type("Keep /skill:review readable after a read failure.");
    await host.key("\r");
    await t.waitFor(() => assert.equal(host.requests.length, 2));
    await host.settled();
    assert.match(await screen(host), /ENOENT/);
    assert.deepEqual(
      host.session.messages.findLast((message) => message.role === "user")?.content,
      [{ type: "text", text: "Keep /skill:review readable after a read failure." }],
    );
  });
}

for (const [name, extensions] of [
  ["native chat", [skillsExtension, quoteExtension]],
  [
    "optional chat and composer",
    [composerExtension, quoteExtension, chatExtension, skillsExtension],
  ],
] as const) {
  test(`selection copy and Quote use only displayed request text with ${name}`, async (t) => {
    const fixture = await skillFixture(t);
    const clipboard = getNativeClipboard();
    assertWritableClipboard(clipboard);
    let copied = "";
    t.mock.method(clipboard, "setText", async (text: string) => {
      copied = text;
    });
    const host = await openNativeHost(t, {
      extensionPaths: [...extensions],
      skillPaths: [fixture.directory],
      rows: 38,
      columns: 100,
      settings: { fullscreenCopyOnSelect: false },
    });
    await host.type("Please use /skill:review and **keep prose**.");
    await host.key("\r");
    await host.settled();
    const source = JSON.stringify(host.session.sessionManager.getBranch());
    const displayed = "Please use /skill:review and keep prose.";
    const lines = (await screen(host)).split("\n");
    const row = lines.findIndex((line) => line.includes(displayed));
    assert(row >= 0);
    const column = lines[row]!.indexOf(displayed);
    await host.key(`\x1b[<0;${column + 1};${row + 1}M`);
    await host.key(`\x1b[<32;${column + displayed.length};${row + 1}M`);
    await host.key(`\x1b[<0;${column + displayed.length};${row + 1}m`);
    await host.key("\x18");
    await t.waitFor(() => assert.equal(copied, displayed));
    assert.match(await screen(host), /\[Quote\]/);
    await host.key("\x1b[113;4u");
    assert.equal(host.ui.getEditorText().trim(), `> ${displayed}`);
    assert.equal(JSON.stringify(host.session.sessionManager.getBranch()), source);
    assert.equal(host.requests.length, 1);
  });
}

test("terminal projection leaves native HTML and branch exports byte-for-byte unchanged", async (t) => {
  const fixture = await skillFixture(t);
  const extensions = [skillsExtension];
  const host = await openNativeHost(t, {
    extensionPaths: extensions,
    skillPaths: [fixture.directory],
    persistSession: true,
  });
  await host.type("Use /skill:review and /skill:plan.");
  await host.key("\r");
  await host.settled();
  const source = JSON.stringify(host.session.sessionManager.getBranch());
  const html = await readFile(
    await host.session.exportToHtml(join(host.directory, "compact.html")),
    "utf8",
  );
  assert.match(html, /Review the actual behavior/);
  assert.match(html, /Plan the smallest change/);
  assert.match(html, /References are relative/);
  const branch = host.session.exportToJsonl(join(host.directory, "compact.jsonl"));
  const jsonl = await readFile(branch, "utf8");
  extensions.length = 0;
  await host.reload();
  assert.match(await screen(host), /\[skill\]/);
  const nativeHtml = await readFile(
    await host.session.exportToHtml(join(host.directory, "native.html")),
    "utf8",
  );
  assert.equal(html, nativeHtml);
  const nativeBranch = host.session.exportToJsonl(join(host.directory, "native.jsonl"));
  assert.equal(await readFile(nativeBranch, "utf8"), jsonl);
  assert.equal(JSON.stringify(host.session.sessionManager.getBranch()), source);
  assert.equal(host.requests.length, 1);
});

test("headless native JSON output retains expanded content and image payloads without rendering hooks", async (t) => {
  const fixture = await skillFixture(t);
  const prototype = Object.getOwnPropertyDescriptor(
    InteractiveMode.prototype,
    "renderSessionEntries",
  );
  const host = await openNativeHost(t, {
    extensionPaths: [skillsExtension],
    skillPaths: [fixture.directory],
    headless: true,
  });
  assert.deepEqual(
    Object.getOwnPropertyDescriptor(InteractiveMode.prototype, "renderSessionEntries"),
    prototype,
  );
  const draft = "Use /skill:review in JSON output.";
  const expanded = `<skill name="review" location="${fixture.review}">\nReferences are relative to ${join(fixture.directory, "review")}.\n\nReview the actual behavior.\n</skill>\n\n${draft}`;
  const chunks: string[] = [];
  const stdout = t.mock.method(
    process.stdout,
    "write",
    (
      chunk: string | Uint8Array,
      encodingOrCallback?: BufferEncoding | ((error?: Error | null) => void),
      callback?: (error?: Error | null) => void,
    ) => {
      chunks.push(String(chunk));
      if (typeof encodingOrCallback === "function") encodingOrCallback();
      else callback?.();
      return true;
    },
  );
  let result: number;
  try {
    result = await runPrintMode(host.runtime, {
      mode: "json",
      initialMessage: draft,
      initialImages: [image],
    });
  } finally {
    stdout.mock.restore();
  }
  assert.equal(result, 0);
  const events = chunks
    .join("")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  const user = events.find(
    (event) => event.type === "message_end" && event.message?.role === "user",
  );
  assert.deepEqual(user?.message.content, [{ type: "text", text: expanded }, image]);
  assert(events.some((event) => event.type === "agent_settled"));
  assert.deepEqual(host.requests[0]?.messages.find((message) => message.role === "user")?.content, [
    { type: "text", text: expanded },
    { type: "image_url", image_url: { url: `data:image/png;base64,${image.data}` } },
  ]);
  assert.deepEqual(
    Object.getOwnPropertyDescriptor(InteractiveMode.prototype, "renderSessionEntries"),
    prototype,
  );
});
