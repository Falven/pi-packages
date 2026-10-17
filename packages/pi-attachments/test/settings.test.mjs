import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { chmod, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { waitFor } from "../fixtures/native-pi.mjs";
import { settingsPi } from "../fixtures/settings-pi.mjs";

async function openSettings(host) {
  const pending = host.runtime.session.prompt("/test-attachment-settings");
  await waitFor(() => assert.match(host.render(), /Attachment thumbnail size/));
  return { pending };
}

async function closeSettings(host, dialog) {
  host.input("\x1b");
  await dialog.pending;
}

test("native attachment settings offer all three sizes and preserve draft focus and caret", async (t) => {
  const host = await settingsPi(t);
  host.ui.setEditorText("Keep this draft");
  host.input("\x1b[D");
  host.input("\x1b[D");
  const dialog = await openSettings(host);
  assert.match(host.render(), /Medium/);
  host.input("\x1b[A");
  host.input("\x1b[B");
  host.input("\r");
  assert.match(host.render(), /Large/);
  host.input(" ");
  assert.match(host.render(), /Small/);
  await closeSettings(host, dialog);
  assert.equal(host.ui.getEditorText(), "Keep this draft");
  host.input("!");
  assert.equal(host.ui.getEditorText(), "Keep this dra!ft");
  assert.equal(host.requests.length, 0);
});

test("attachment thumbnail settings persist across restart and reread manual edits on reload", async (t) => {
  const host = await settingsPi(t);
  let dialog = await openSettings(host);
  host.input("\r");
  await closeSettings(host, dialog);
  await host.runtime.session.reload();
  dialog = await openSettings(host);
  assert.match(host.render(), /Large/);
  await closeSettings(host, dialog);

  await writeFile(
    join(host.agentDir, "pi-attachments.json"),
    `\uFEFF${JSON.stringify({ thumbnailSize: "small" })}`,
  );
  dialog = await openSettings(host);
  assert.match(host.render(), /Large/);
  await closeSettings(host, dialog);
  await host.runtime.session.reload();
  dialog = await openSettings(host);
  assert.match(host.render(), /Small/);
  await closeSettings(host, dialog);
  assert.equal(host.ui.getEditorText(), "");
  await host.close();
  await promisify(execFile)(
    process.execPath,
    [
      fileURLToPath(new URL("../fixtures/restart-settings.mjs", import.meta.url)),
      JSON.stringify({ directory: host.directory, thumbnailSize: "Small" }),
    ],
    { timeout: 30_000 },
  );
});

test("thumbnail migration preserves the prior user preference and unrelated Pi settings", async (t) => {
  const host = await settingsPi(t);
  const legacyPath = join(host.agentDir, "settings.json");
  const original = `\uFEFF${JSON.stringify({
    editorPaddingX: 3,
    extensionSettings: {
      "pi-attachments.thumbnailSize": "large",
      "another.preference": "unchanged",
    },
  })}`;
  await writeFile(legacyPath, original);
  await host.runtime.session.reload();
  let dialog = await openSettings(host);
  assert.match(host.render(), /Large/);
  await closeSettings(host, dialog);
  assert.equal(await readFile(legacyPath, "utf8"), original);
  assert.deepEqual(JSON.parse(await readFile(join(host.agentDir, "pi-attachments.json"), "utf8")), {
    thumbnailSize: "large",
  });

  await writeFile(
    legacyPath,
    JSON.stringify({
      extensionSettings: { "pi-attachments.thumbnailSize": "small" },
    }),
  );
  await host.runtime.session.reload();
  dialog = await openSettings(host);
  assert.match(host.render(), /Large/);
  await closeSettings(host, dialog);
});

test("a failed thumbnail save reports the error and retains the saved choice", async (t) => {
  const host = await settingsPi(t);
  let dialog = await openSettings(host);
  host.input("\r");
  await closeSettings(host, dialog);
  await chmod(host.agentDir, 0o500);
  try {
    dialog = await openSettings(host);
    host.input("\r");
    assert.match(host.render(), /Large/);
    await closeSettings(host, dialog);
    assert.match(host.render(), /Could not save attachment settings/);
  } finally {
    await chmod(host.agentDir, 0o700);
  }
  await host.runtime.session.reload();
  dialog = await openSettings(host);
  assert.match(host.render(), /Large/);
  await closeSettings(host, dialog);
});

for (const [saved, error] of [
  ["{", /Could not read attachment settings/],
  ["null", /Expected a settings object/],
  [JSON.stringify({ thumbnailSize: "huge" }), /Invalid thumbnail size/],
]) {
  test(`invalid attachment settings fail explicitly: ${saved}`, async (t) => {
    const host = await settingsPi(t);
    await host.close();
    await writeFile(join(host.agentDir, "pi-attachments.json"), saved);
    await assert.rejects(settingsPi(t, { directory: host.directory }), error);
    assert.equal(await readFile(join(host.agentDir, "pi-attachments.json"), "utf8"), saved);
  });
}

test("invalid legacy thumbnail settings remain intact when migration fails", async (t) => {
  const host = await settingsPi(t);
  await host.close();
  const legacyPath = join(host.agentDir, "settings.json");
  const saved = JSON.stringify({
    extensionSettings: { "pi-attachments.thumbnailSize": false },
  });
  await writeFile(legacyPath, saved);
  await assert.rejects(settingsPi(t, { directory: host.directory }), /Invalid thumbnail size/);
  assert.equal(await readFile(legacyPath, "utf8"), saved);
  await assert.rejects(readFile(join(host.agentDir, "pi-attachments.json")), {
    code: "ENOENT",
  });
});
