import assert from "node:assert/strict";
import { test } from "node:test";
import { waitFor } from "./native-pi.mjs";
import { settingsPi } from "./settings-pi.mjs";

const expected = JSON.parse(process.argv[2]);

test("restarted native Pi retains the thumbnail preference", async (t) => {
  const host = await settingsPi(t, { directory: expected.directory });
  const pending = host.runtime.session.prompt("/test-attachment-settings");
  await waitFor(() => assert.match(host.render(), /Attachment thumbnail size/));
  assert.ok(host.render().includes(expected.thumbnailSize));
  host.input("\x1b");
  await pending;
  assert.equal(host.ui.getEditorText(), "");
});
