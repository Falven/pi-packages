import assert from "node:assert/strict";
import { rm, stat } from "node:fs/promises";
import { test } from "node:test";
import { setupHost } from "../fixtures/ghostty-setup.ts";

for (const fails of [true, false]) {
  test(`Ghostty fixture restores process context after ${fails ? "failed" : "successful"} initialization`, async (t) => {
    const platform = Object.getOwnPropertyDescriptor(process, "platform")!;
    const environment = Object.fromEntries(
      ["HOME", "XDG_CONFIG_HOME", "CFFIXED_USER_HOME"].map((name) => [name, process.env[name]]),
    );
    let directory: string | undefined;
    let shutdown = false;
    t.after(async () => {
      Object.defineProperty(process, "platform", platform);
      for (const [name, value] of Object.entries(environment)) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
      if (directory) await rm(directory, { recursive: true, force: true });
    });

    await t.test("host lifecycle", async (child) => {
      const setup = setupHost(child, "font-size = 14\n", "config", [
        (pi) => {
          directory = process.env["HOME"];
          if (fails) throw new Error("Controlled initialization failure");
          pi.on("session_shutdown", async () => {
            assert(directory);
            assert((await stat(directory)).isDirectory());
            shutdown = true;
          });
        },
      ]);
      if (fails) await assert.rejects(setup, /Controlled initialization failure/);
      else await setup;
    });

    assert.deepEqual(Object.getOwnPropertyDescriptor(process, "platform"), platform);
    for (const [name, value] of Object.entries(environment))
      assert.equal(process.env[name], value, `${name} must be restored`);
    assert(directory);
    await assert.rejects(stat(directory), { code: "ENOENT" });
    assert.equal(shutdown, !fails);
  });
}
