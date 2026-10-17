import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { openHost } from "../fixtures/host.ts";
import { assertAttachments, snapshotPath } from "../../pi-attachments/fixtures/native-pi.mjs";

const attachments = fileURLToPath(new URL("../../pi-attachments/src/index.ts", import.meta.url));
const imageData =
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAADUlEQVR4nGP4zwAE/wEHAAH/4iOeWQAAAABJRU5ErkJggg==";

for (const view of ["formatted", "source"]) {
  test(`native deletion restores ${view} selection and attachment membership with one undo`, async (t) => {
    const host = await openHost(t, { extensionPaths: [attachments] });
    const source = join(host.directory, "context.txt");
    const contents = "Captured context\r\n\tKeep original bytes\r\n";
    await writeFile(source, contents);
    await host.attachFile(source);
    const reference = host.ui.getEditorText().trim();
    const snapshot = snapshotPath(reference);
    const before = `Keep\n${reference}\nTail`;
    host.ui.setEditorText(before);
    if (view === "source") await host.key("\x1b[109;10u");
    await host.key("\x01");
    await host.key("\x1b[D");
    await host.key("\x05");
    await host.key("\x1b[1;2H");
    host.terminal.output = "";
    await host.key("\x17");
    assert.equal(host.ui.getEditorText(), "Keep\n\nTail");
    assert.doesNotMatch(await host.output(), /Manage attachments/);
    host.terminal.output = "";
    await host.key("\x1b[122;9u");
    assert.equal(host.ui.getEditorText(), before);
    assertAttachments(host.ui.getEditorText(), await host.output(), ["context.txt"]);
    await host.key("\x1b[122;10u");
    assert.equal(host.ui.getEditorText(), "Keep\n\nTail");
    await host.key("\x1b[122;9u");
    await host.key("\x0b");
    assert.equal(host.ui.getEditorText(), "Keep\n\nTail");
    assert.equal(await readFile(snapshot, "utf8"), contents);
  });

  test(`deleting and repairing image reference syntax updates ${view} attachment membership without changing its snapshot`, async (t) => {
    const host = await openHost(t, { extensionPaths: [attachments] });
    const source = join(host.directory, "image.png");
    await writeFile(source, Buffer.from(imageData, "base64"));
    await host.attachFile(source);
    const reference = host.ui.getEditorText().trim();
    const snapshot = snapshotPath(reference);
    assert(reference.endsWith(">)"));
    host.ui.setEditorText(reference);
    if (view === "source") await host.key("\x1b[109;10u");
    assertAttachments(host.ui.getEditorText(), await host.output(), ["image.png"]);
    host.terminal.output = "";
    await host.key("\x7f");
    assert.equal(host.ui.getEditorText(), reference.slice(0, -1));
    assert.doesNotMatch(await host.output(), /Manage attachments/);
    host.terminal.output = "";
    await host.key("\x1b[122;9u");
    assert.equal(host.ui.getEditorText(), reference);
    assertAttachments(host.ui.getEditorText(), await host.output(), ["image.png"]);
    host.terminal.output = "";
    await host.key("\x1b[122;10u");
    assert.equal(host.ui.getEditorText(), reference.slice(0, -1));
    assert.doesNotMatch(await host.output(), /Manage attachments/);
    host.terminal.output = "";
    await host.type(")");
    assert.equal(host.ui.getEditorText(), reference);
    assertAttachments(host.ui.getEditorText(), await host.output(), ["image.png"]);
    assert.equal((await readFile(snapshot)).toString("base64"), imageData);
    await host.key("\x1b[13;9u");
    await host.settled();
    const submitted = host.requests[0].messages.find((message) => message.role === "user");
    assert.deepEqual(submitted.content, [
      { type: "text", text: reference },
      {
        type: "image_url",
        image_url: { url: `data:image/png;base64,${imageData}` },
      },
    ]);
  });
}
