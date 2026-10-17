import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { test } from "node:test";
import { openNativeHost } from "../../../fixtures/native-host.ts";

// Run explicitly: this compatibility experiment retains its failing requirements.
// It uses the normal editor/session boundary, with only terminal and provider substitutes.
const draft = "[note](source.txt)";

function findEditor(component) {
  if (typeof component.getText === "function" && typeof component.insertTextAtCursor === "function")
    return component;
  for (const child of component.children ?? []) {
    const editor = findEditor(child);
    if (editor) return editor;
  }
  return undefined;
}

for (const composer of [false, true]) {
  for (const route of ["normal", "steering", "follow-up"]) {
    test(`${composer ? "composer" : "native"} ${route} input retains its submitting draft after an earlier handler consumes an identical draft`, async (t) => {
      const scope = new AsyncLocalStorage();
      const blocked = Promise.withResolvers();
      t.after(() => blocked.resolve());
      let tui;
      let attempts = 0;
      const submissions = [];
      const inputs = [];
      const host = await openNativeHost(t, {
        noTools: "all",
        holdResponses: route !== "normal",
        extensionPaths: composer
          ? [new URL("../../pi-composer/src/index.ts", import.meta.url).pathname]
          : [],
        extensionFactories: [
          (pi) => {
            pi.on("input", async (event) => {
              if (event.text !== draft) return undefined;
              if (++attempts === 1) {
                await blocked.promise;
                return { action: "handled" };
              }
              return undefined;
            });
          },
        ],
        extension: (pi) => {
          pi.on("session_start", (_event, ctx) => {
            ctx.ui.setWidget("submission-experiment", (value) => {
              tui = value;
              return { render: () => [], invalidate() {} };
            });
          });
          pi.on("input", (event) => {
            if (event.text === draft)
              inputs.push({
                text: event.text,
                source: event.source,
                streamingBehavior: event.streamingBehavior,
                draft: scope.getStore(),
              });
          });
        },
      });
      if (route !== "normal") {
        host.ui.setEditorText("Keep a response active");
        await host.key("\r");
        await t.waitFor(() => {
          assert.equal(host.requests.length, 1);
          assert.equal(host.session.isStreaming, true);
        });
      }

      const editor = findEditor(tui);
      assert(editor, "The installed editor is visible through the public TUI tree");
      assert.equal(editor.constructor.name, composer ? "SourceEditor" : "CustomEditor");
      const handleInput = editor.handleInput;
      const onSubmit = editor.onSubmit;
      const descriptors = {
        handleInput: Object.getOwnPropertyDescriptor(editor, "handleInput"),
        onSubmit: Object.getOwnPropertyDescriptor(editor, "onSubmit"),
      };
      t.after(() => {
        for (const [name, descriptor] of Object.entries(descriptors)) {
          if (descriptor) Object.defineProperty(editor, name, descriptor);
          else Reflect.deleteProperty(editor, name);
        }
      });
      let identity = 0;
      editor.handleInput = function (data) {
        const submittingDraft = `draft-${++identity}`;
        submissions.push({
          text: this.getExpandedText(),
          draft: submittingDraft,
        });
        return scope.run(submittingDraft, () => handleInput.call(this, data));
      };
      editor.onSubmit = function (text) {
        assert.equal(scope.getStore(), submissions.at(-1).draft);
        return onSubmit.call(this, text);
      };

      host.ui.setEditorText(draft);
      await host.key(route === "follow-up" ? "\x1b\r" : "\r");
      host.ui.setEditorText(draft);
      await host.key(route === "follow-up" ? "\x1b\r" : "\r");
      assert.deepEqual(submissions, [
        { text: draft, draft: "draft-1" },
        { text: draft, draft: "draft-2" },
      ]);
      blocked.resolve();
      await t.waitFor(() => assert.equal(inputs.length, 1));
      if (route === "normal") await host.settled();
      else {
        host.reply();
        await t.waitFor(() => assert.equal(host.requests.length, 2));
        host.reply();
        await host.settled();
      }
      assert.equal(attempts, 2);
      assert.equal(host.requests.length, route === "normal" ? 1 : 2);
      assert.equal(inputs[0].text, submissions[0].text);
      t.diagnostic(JSON.stringify({ submissions, inputs }));
      assert.equal(
        inputs[0].draft,
        "draft-2",
        "The accepted input must retain the second draft; FIFO would select the consumed first draft",
      );
    });
  }
}
