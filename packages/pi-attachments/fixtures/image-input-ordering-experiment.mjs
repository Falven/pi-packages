// Opt-in observations of current input ordering, not accepted submission guarantees.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { nativePi, holdFileRead, waitFor } from "./native-pi.mjs";
import { registerImages } from "../src/images.ts";

const PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAADUlEQVR4nGP4zwAE/wEHAAH/4iOeWQAAAABJRU5ErkJggg==";
for (const route of ["normal", "steer", "followUp"]) {
  test(`${route} input ordering through a delayed image read`, async (t) => {
    const response = Promise.withResolvers();
    t.after(() => response.resolve());
    const host = await nativePi(t, [], {
      attachments: false,
      settings: { images: { autoResize: false } },
      extensionFactories: [
        (pi) => {
          const lifetime = new AbortController();
          pi.on("session_shutdown", () => lifetime.abort());
          registerImages(
            pi,
            join(getAgentDir(), "pi-attachments"),
            lifetime.signal,
            () => [],
            () => "medium",
          );
        },
      ],
    });
    if (route !== "normal") {
      host.replies.push(response.promise);
      host.submit("Active request");
      await waitFor(() => assert.equal(host.requests.length, 1));
    }
    const storage = join(host.agentDir, "pi-attachments", "snapshot-test");
    await mkdir(storage, { recursive: true });
    const path = join(storage, "slow.png");
    await writeFile(path, Buffer.from(PNG, "base64"));
    const first = `[Attachment: slow.png](<${path}>)`;
    const held = holdFileRead(t, path);
    host.ui.setEditorText(first);
    host.input(route === "followUp" ? "\x1b\r" : "\r");
    await held.started();
    host.ui.setEditorText("Later text request");
    host.input(route === "followUp" ? "\x1b\r" : "\r");
    if (route !== "normal") {
      await waitFor(() => assert.equal(host.runtime.session.pendingMessageCount, 1));
      const queued =
        route === "steer"
          ? host.runtime.session.getSteeringMessages()
          : host.runtime.session.getFollowUpMessages();
      assert.deepEqual(queued, ["Later text request"]);
      held.release();
      await waitFor(() => assert.equal(host.runtime.session.pendingMessageCount, 2));
      const finalQueue =
        route === "steer"
          ? host.runtime.session.getSteeringMessages()
          : host.runtime.session.getFollowUpMessages();
      assert.deepEqual(finalQueue, ["Later text request", first]);
      t.diagnostic(`${route}: later text enters queue first; slow image enters second`);
      response.resolve();
    } else {
      assert.equal(host.requests.length, 0);
      held.release();
      await waitFor(() => assert.equal(host.requests.length, 2));
      assert.ok(
        host.requests[0].messages.some(
          (message) => message.role === "user" && message.content[0]?.text === first,
        ),
      );
      assert.equal(
        host.requests[1].messages.findLast((message) => message.role === "user").content[0].text,
        "Later text request",
      );
      t.diagnostic("normal: native input loop preserves original order");
    }
    await waitFor(() => assert.equal(host.runtime.session.isStreaming, false));
  });
}
for (const route of ["steer", "followUp"]) {
  test(`${route} native asynchronous input control without attachments`, async (t) => {
    const response = Promise.withResolvers();
    const delayed = Promise.withResolvers();
    const started = Promise.withResolvers();
    t.after(() => {
      response.resolve();
      delayed.resolve();
    });
    const host = await nativePi(t, [], {
      attachments: false,
      extensionFactories: [
        (pi) => {
          pi.on("input", async (event) => {
            if (event.text !== "Earlier text request") return;
            started.resolve();
            await delayed.promise;
          });
        },
      ],
    });
    host.replies.push(response.promise);
    host.submit("Active request");
    await waitFor(() => assert.equal(host.requests.length, 1));
    host.ui.setEditorText("Earlier text request");
    host.input(route === "followUp" ? "\x1b\r" : "\r");
    await started.promise;
    host.ui.setEditorText("Later text request");
    host.input(route === "followUp" ? "\x1b\r" : "\r");
    await waitFor(() => assert.equal(host.runtime.session.pendingMessageCount, 1));
    delayed.resolve();
    await waitFor(() => assert.equal(host.runtime.session.pendingMessageCount, 2));
    const queue =
      route === "steer"
        ? host.runtime.session.getSteeringMessages()
        : host.runtime.session.getFollowUpMessages();
    assert.deepEqual(queue, ["Later text request", "Earlier text request"]);
    t.diagnostic(
      `${route}: native asynchronous input handlers also permit overtaking without attachments`,
    );
    response.resolve();
    await waitFor(() => assert.equal(host.runtime.session.isStreaming, false));
  });
}
