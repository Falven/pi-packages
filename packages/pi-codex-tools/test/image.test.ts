/* eslint-disable no-await-in-loop -- Native host cases share process environment and must close in order. */
import assert from "node:assert/strict";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { createReadToolDefinition } from "@earendil-works/pi-coding-agent";
import { openNativeHost } from "../../../fixtures/native-host.ts";
import {
  call,
  completed,
  extension,
  functionCall,
  output,
  providerApi,
} from "./fixtures/model-loop.ts";

// A 2-by-1 PNG from the independently observed local image cases.
const tiny =
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAADUlEQVR4nGNQqLgERAAIiQLVbsGVSQAAAABJRU5ErkJggg==";

function images(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.flatMap(images);
  if (!value || typeof value !== "object") return [];
  const item = value as Record<string, unknown>;
  return item["type"] === "input_image" ? [item] : Object.values(item).flatMap(images);
}

test("a local image resolves in the owning directory and reaches the next model request", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
    settings: { terminal: { showImages: false } },
  });
  await writeFile(join(host.directory, "sample.png"), Buffer.from(tiny, "base64"));
  host.queueResponse(
    ...call(
      'const result = await tools.view_image({path: "sample.png", detail: null, extra: true}); text(result); image(result);',
    ),
  );
  host.queueResponse(completed);
  await host.session.prompt("Inspect the local image");
  assert.equal(host.requests.length, 2);
  assert.match(output(host), /"detail":"high"/);
  assert(output(host).includes(`"image_url":"data:application/octet-stream;base64,${tiny}"`));
  const emitted = images(host.requests[1]);
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0]!["detail"], "auto");
  const url = String(emitted[0]!["image_url"]);
  assert.match(url, /^data:image\/png;base64,/);
  const bytes = Buffer.from(url.split(",")[1]!, "base64");
  assert.equal(bytes.readUInt32BE(16), 2);
  assert.equal(bytes.readUInt32BE(20), 1);
  assert.equal(host.session.settingsManager.getShowImages(), false);
});

test("the image helper accepts ordinary forms and validates explicit detail before embedded detail", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
  });
  const url = `data:image/png;base64,${tiny}`;
  host.queueResponse(
    ...call(`const url = ${JSON.stringify(url)};
text(typeof image(url));
image({image_url: url, detail: "invalid"}, "original");
for (const detail of ["invalid", 1, null]) {
  try { image({image_url: url, detail: "invalid"}, detail); }
  catch (error) { text({type: typeof error, error}); }
}`),
  );
  host.queueResponse(completed);
  await host.session.prompt("Emit ordinary image values with detail validation");
  assert.equal(images(host.requests[1]).length, 2);
  assert.match(output(host), /undefined/);
  assert.match(
    output(host),
    /"type":"string","error":"image detail must be one of: auto, low, high, original"/,
  );
  assert.match(
    output(host),
    /"type":"string","error":"image detail must be a string when provided"/,
  );
  assert.deepEqual(
    images(host.requests[1]).map((item) => item["detail"]),
    ["auto", "auto"],
  );
});

test("the image helper rejects inputs outside its ordinary data URL surface", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
  });
  host.queueResponse(
    ...call(
      'for (const value of ["not-a-data-url", "", null, 1, {}, {image_url: 1}, {type: "image", data: "AA==", mimeType: "image/png"}]) { try { image(value); } catch (error) { text({type: typeof error, error}); } }',
    ),
  );
  host.queueResponse(completed);
  await host.session.prompt("Report an invalid image input");
  assert.equal(images(host.requests[1]).length, 0);
  assert.match(
    output(host),
    /"type":"string","error":"Tool call failed: invalid image output\. Pass a base64 data URI instead"/,
  );
  assert.equal(
    (
      output(host).match(
        /image expects a non-empty image URL string or an object with image_url and optional detail/g,
      ) ?? []
    ).length,
    6,
  );
});

test("local image failures report observed file and decoding errors without returning bytes", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
  });
  await writeFile(join(host.directory, "text.png"), "not an image");
  await writeFile(join(host.directory, "broken.png"), Buffer.from(tiny, "base64").subarray(0, 33));
  await mkdir(join(host.directory, "image-directory"));
  await writeFile(join(host.directory, "unreadable.png"), Buffer.from(tiny, "base64"));
  await chmod(join(host.directory, "unreadable.png"), 0);
  host.queueResponse(
    ...call(`for (const args of [null, 17, {}, {path: 17}, {path: []}, {path: 1e100}, {path: "missing-image", detail: true}, {path: "missing.png", detail: "low"}]) {
  try { text(await tools.view_image(args)); }
  catch (error) { text({type: typeof error, error}); }
}
for (const path of ["text.png", "broken.png", "missing.png", "image-directory", "unreadable.png"]) {
  try { text(await tools.view_image({path})); }
  catch (error) { text({path, error}); }
}`),
  );
  host.queueResponse(completed);
  await host.session.prompt("Report local image failures");
  const result = output(host);
  assert.match(
    result,
    /failed to parse function arguments: missing field `path` at line 1 column 2/,
  );
  assert.match(
    result,
    /failed to parse function arguments: invalid type: integer `17`, expected a string at line 1 column 10/,
  );
  for (const error of [
    "tool `view_image` expects a JSON object for arguments",
    "failed to parse function arguments: invalid type: sequence, expected a string at line 1 column 8",
    "failed to parse function arguments: invalid type: number, expected a string at line 1 column 14",
    "failed to parse function arguments: invalid type: boolean `true`, expected a string at line 1 column 37",
  ])
    assert(result.includes(JSON.stringify({ type: "string", error })));
  assert.match(result, /view_image.detail only supports `high` or `original`/);
  assert.equal(
    (result.match(/unable to process image: invalid or unsupported image data/g) ?? []).length,
    2,
  );
  assert(
    result.includes(
      `unable to locate image at \`${join(host.directory, "missing.png")}\`: No such file or directory (os error 2)`,
    ),
  );
  assert(
    result.includes(`image path \`${join(host.directory, "image-directory")}\` is not a file`),
  );
  assert(
    result.includes(
      `unable to read image at \`${join(host.directory, "unreadable.png")}\`: Permission denied (os error 13)`,
    ),
  );
  assert.doesNotMatch(result, /image_url|data:.*base64/);
  assert.equal(images(host.requests[1]).length, 0);
});

test("effective image blocking prevents local reads and text serialization independently of terminal visibility", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
    settings: {
      images: { blockImages: false },
      terminal: { showImages: true },
    },
  });
  await writeFile(join(host.directory, "blocked.png"), Buffer.from(tiny, "base64"));
  host.session.settingsManager.setBlockImages(true);
  host.queueResponse(
    ...call(`for (const path of ["blocked.png", "missing.png"]) {
  try { text(await tools.view_image({path})); }
  catch (error) { text({error}); }
}
image(${JSON.stringify(`data:image/png;base64,${tiny}`)});`),
  );
  host.queueResponse(completed);
  await host.session.prompt("Honor the effective image setting");
  assert.equal((output(host).match(/Image reading is disabled\./g) ?? []).length, 3);
  assert.doesNotMatch(output(host), /image_url|data:|unable to locate/);
  assert.equal(images(host.requests[1]).length, 0);
  assert.equal(host.session.settingsManager.getShowImages(), true);
});

test("image blocking changed by a result hook takes effect before bytes return to the script", async (t) => {
  let blockImages: (() => void) | undefined;
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
    extension(pi) {
      pi.on("tool_result", (event) => {
        if (event.toolName !== "view_image") return;
        assert(blockImages);
        blockImages();
      });
    },
  });
  blockImages = () => host.session.settingsManager.setBlockImages(true);
  await writeFile(join(host.directory, "blocked.png"), Buffer.from(tiny, "base64"));
  host.queueResponse(
    ...call(
      'try { text(await tools.view_image({path: "blocked.png"})); } catch (error) { text({error}); }',
    ),
  );
  host.queueResponse(completed);
  await host.session.prompt("Apply a newly changed image policy");
  assert.match(output(host), /Image reading is disabled\./);
  assert.doesNotMatch(output(host), /image_url|data:/);
  assert.equal(images(host.requests[1]).length, 0);
});

test("nested image calls retain native blocking, argument edits, result redaction, and activity", async (t) => {
  const activity: { type: string; name: string; parent: string | undefined }[] = [];
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
    extension(pi) {
      pi.on("tool_call", (event) => {
        if (event.toolName !== "view_image") return undefined;
        if (event.input["path"] === "original") event.input["path"] = "private.png";
        else return { block: true, reason: "Image denied by the test policy" };
        return undefined;
      });
      pi.on("tool_result", (event) => {
        if (event.toolName === "view_image" && !event.isError)
          return { content: [{ type: "text", text: "image-redacted" }] };
        return undefined;
      });
      pi.on("tool_execution_end", (event) => {
        activity.push({
          type: event.type,
          name: event.toolName,
          parent: event.parentToolCallId,
        });
      });
    },
  });
  await writeFile(join(host.directory, "private.png"), Buffer.from(tiny, "base64"));
  host.queueResponse(
    ...call(`text(await tools.view_image({path: "original"}));
try { text(await tools.view_image({path: "blocked"})); }
catch (error) { text(error); }`),
  );
  host.queueResponse(completed);
  await host.session.prompt("Apply the native image policy");
  assert.match(output(host), /image-redacted/);
  assert.match(output(host), /Image denied by the test policy/);
  assert.doesNotMatch(output(host), /image_url|data:/);
  assert.equal(images(host.requests[1]).length, 0);
  assert(
    activity.some((event) => event.name === "view_image" && event.parent?.startsWith("call_one")),
  );
});

test("outer result hooks can replace an emitted image before the next request", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
    extension(pi) {
      pi.on("tool_result", (event) => {
        if (event.toolName === "exec")
          return { content: [{ type: "text", text: "outer-image-redacted" }] };
        return undefined;
      });
    },
  });
  await writeFile(join(host.directory, "private.png"), Buffer.from(tiny, "base64"));
  host.queueResponse(
    ...call(
      'const result = await tools.view_image({path: "private.png"}); text(result); image(result);',
    ),
  );
  host.queueResponse(completed);
  await host.session.prompt("Redact the emitted image");
  assert.equal(output(host), "outer-image-redacted");
  assert.equal(images(host.requests[1]).length, 0);
});

test("large original-detail images use the routed limits once and honor effective auto-resize changes", async (t) => {
  const selectedWidths: (number | undefined)[] = [];
  const nestedImageCounts: number[] = [];
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
    extension(pi) {
      pi.on("tool_result", (event, ctx) => {
        if (event.toolName !== "view_image") return;
        selectedWidths.push(ctx.model?.inputLimits?.images?.resize?.maxWidth);
        nestedImageCounts.push(event.content.filter((part) => part.type === "image").length);
      });
    },
  });
  // Captured 2400-by-1600 PNG; both detail requests returned its original 14,792 bytes.
  await writeFile(
    join(host.directory, "large.png"),
    await readFile(new URL("./fixtures/local-large.png", import.meta.url)),
  );
  const physical = host.session.model;
  assert(physical);
  const models = host.runtime.services.modelRuntime;
  models.registerProvider(physical.provider, {
    api: physical.api,
    baseUrl: physical.baseUrl,
    models: [
      {
        ...physical,
        inputLimits: { images: { resize: { maxWidth: 12, maxHeight: 8 } } },
      },
    ],
  });
  models.registerVirtualModel({
    provider: physical.provider,
    id: "image-route",
    name: "Image route",
    route: () => ({ model: physical, thinkingLevel: "off" }),
  });
  const selected = models.getModel(physical.provider, "image-route");
  assert(selected);
  await host.session.setModel({
    ...selected,
    input: ["text"],
    inputLimits: { images: { resize: { maxWidth: 1, maxHeight: 1 } } },
  });
  const source =
    'const result = await tools.view_image({path: "large.png", detail: "original"}); text({detail: result.detail, encodedLength: result.image_url.split(",")[1].length}); image(result);';
  host.queueResponse(...call(source));
  host.queueResponse(completed);
  await host.session.prompt("Inspect the image using the routed model");
  assert.match(output(host), /"detail":"original","encodedLength":19724/);
  assert.deepEqual(selectedWidths, [1]);
  assert.deepEqual(nestedImageCounts, [0]);
  assert.equal(
    (output(host).match(/Image converted from application\/octet-stream to image\/png/g) ?? [])
      .length,
    1,
  );
  const resized = images(host.requests[1]);
  assert.equal(resized.length, 1);
  assert.equal(resized[0]!["detail"], "auto");
  assert.match(String(resized[0]!["image_url"]), /^data:image\/png;base64,/);
  const resizedBytes = Buffer.from(String(resized[0]!["image_url"]).split(",")[1]!, "base64");
  assert.equal(resizedBytes.readUInt32BE(16), 12);
  assert.equal(resizedBytes.readUInt32BE(20), 8);

  host.session.settingsManager.setImageAutoResize(false);
  host.queueResponse(...call(source, "unresized"));
  host.queueResponse(completed);
  await host.session.prompt("Keep the image dimensions with resizing disabled");
  assert.match(output(host, "unresized"), /"detail":"original","encodedLength":19724/);
  const unresized = images(host.requests.at(-1)).at(-1);
  assert(unresized);
  assert.equal(unresized["detail"], "auto");
  const unresizedBytes = Buffer.from(String(unresized["image_url"]).split(",")[1]!, "base64");
  assert.equal(unresizedBytes.readUInt32BE(16), 2400);
  assert.equal(unresizedBytes.readUInt32BE(20), 1600);
});

test("file type comes from bytes and emitted GIF data follows native format conversion", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
  });
  const gif = "R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";
  await writeFile(join(host.directory, "image.bin"), Buffer.from(gif, "base64"));
  host.queueResponse(
    ...call(
      'const result = await tools.view_image({path: "image.bin", detail: "original"}); text(result); image(result);',
    ),
  );
  host.queueResponse(completed);
  await host.session.prompt("Inspect the image independently of its extension");
  assert(output(host).includes(`"image_url":"data:application/octet-stream;base64,${gif}"`));
  assert.match(output(host), /"detail":"original"/);
  const emitted = images(host.requests[1]);
  assert.equal(emitted.length, 1);
  assert.match(String(emitted[0]!["image_url"]), /^data:image\/png;base64,/);
  const bytes = Buffer.from(String(emitted[0]!["image_url"]).split(",")[1]!, "base64");
  assert.equal(bytes.readUInt32BE(16), 1);
  assert.equal(bytes.readUInt32BE(20), 1);
});

test("unprocessable helper image data remains subject to native result handling", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
  });
  const malformed = "data:image/png;base64,dGV4dA==";
  host.queueResponse(...call(`image(${JSON.stringify(malformed)}); text("script-continued");`));
  host.queueResponse(completed);
  await host.session.prompt("Observe the host handling of invalid image bytes");
  assert.match(output(host), /script-continued/);
  assert.deepEqual(images(host.requests[1]), [
    { type: "input_image", detail: "auto", image_url: malformed },
  ]);
});

test("an excluded or extension-owned read tool does not enable local image reading", async (t) => {
  for (const mode of ["excluded", "overridden"] as const) {
    await t.test(mode, async (caseContext) => {
      const host = await openNativeHost(caseContext, {
        extensionPaths: [extension],
        providerApi,
        ...(mode === "excluded" ? { excludeTools: ["read"] } : {}),
        extension(pi) {
          if (mode === "overridden")
            pi.registerTool({
              ...createReadToolDefinition(process.cwd()),
              description: "Extension-owned read",
            });
        },
      });
      host.queueResponse(
        ...call(
          'text(ALL_TOOLS.filter(({name}) => name === "view_image")); text(typeof tools.view_image);',
        ),
      );
      host.queueResponse(completed);
      await host.session.prompt("Keep the selected image-reading scope");
      assert.match(output(host), /\[\]\nundefined$/);
      const request = host.requests[0] as unknown as {
        tools: { name: string; tools?: { description: string }[] }[];
      };
      assert.equal(
        request.tools.some((tool) => tool.name === "read"),
        mode === "overridden",
      );
      assert.doesNotMatch(
        request.tools.find((tool) => tool.name === "functions")!.tools![0]!.description,
        /### `view_image`/,
      );
      await host.close();
    });
  }
});

test("explicit image selection works and read-only selection retains the native declaration", async (t) => {
  for (const selected of ["view_image", "read"]) {
    await t.test(selected, async (caseContext) => {
      const host = await openNativeHost(caseContext, {
        extensionPaths: [extension],
        providerApi,
        tools: ["exec", selected],
      });
      await writeFile(join(host.directory, "image.png"), Buffer.from(tiny, "base64"));
      host.queueResponse(
        ...call(
          selected === "view_image"
            ? 'image(await tools.view_image({path: "image.png"}));'
            : "text(typeof tools.view_image);",
        ),
      );
      host.queueResponse(completed);
      await host.session.prompt("Use the selected image capability");
      assert.equal(images(host.requests[1]).length, selected === "view_image" ? 1 : 0);
      if (selected === "read") assert.match(output(host), /undefined$/);
      const request = host.requests[0] as unknown as {
        tools: { name: string }[];
      };
      assert.deepEqual(
        request.tools.map((tool) => tool.name).toSorted(),
        selected === "read" ? ["functions", "read"] : ["functions"],
      );
      await host.close();
    });
  }
});

test("text truncation preserves image order between retained text ranges", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
  });
  host.queueResponse(
    ...call(`// @exec: {"max_output_tokens": 5}
const url = ${JSON.stringify(`data:image/png;base64,${tiny}`)};
image(url);
text("prefix-" + "x".repeat(100));
image(url);
text("x".repeat(100) + "-suffix");`),
  );
  host.queueResponse(completed);
  await host.session.prompt("Keep images when text is truncated");
  assert.match(output(host), /truncated output/);
  assert.equal(images(host.requests[1]).length, 2);
  const request = host.requests[1] as unknown as {
    input: {
      call_id?: string;
      type: string;
      output?: { type: string; text?: string }[];
    }[];
  };
  const parts = request.input.find(
    (item) => item.type === "custom_tool_call_output" && item.call_id === "call_one",
  )!.output!;
  const middle = parts.findLastIndex((part) => part.type === "input_image");
  assert.match(
    parts
      .slice(0, middle)
      .map((part) => part.text ?? "")
      .join(""),
    /prefix-/,
  );
  assert.doesNotMatch(
    parts
      .slice(0, middle)
      .map((part) => part.text ?? "")
      .join(""),
    /-suffix/,
  );
  assert.match(
    parts
      .slice(middle + 1)
      .map((part) => part.text ?? "")
      .join(""),
    /-suffix/,
  );
});

test("wait results preserve duplicate image positions and later context redaction", async (t) => {
  for (const mode of ["unchanged", "changed", "removed"] as const) {
    await t.test(mode, async (caseContext) => {
      const host = await openNativeHost(caseContext, {
        extensionPaths: [extension],
        providerApi,
        extension(pi) {
          if (mode !== "unchanged")
            pi.on("context", (event) => ({
              messages: event.messages.map((message) =>
                message.role === "toolResult" && message.toolName === "wait"
                  ? {
                      ...message,
                      content:
                        mode === "changed"
                          ? [
                              { type: "text", text: "PUBLIC" },
                              ...message.content
                                .filter((part) => part.type === "image")
                                .slice(0, 1),
                            ]
                          : [],
                    }
                  : message,
              ),
            }));
        },
      });
      host.queueResponse(
        ...call(
          `await yield_control(); text("BEFORE"); image(${JSON.stringify(`data:image/png;base64,${tiny}`)}); text("AFTER"); image(${JSON.stringify(`data:image/png;base64,${tiny}`)});`,
          "one",
          null,
        ),
      );
      host.queueResponse(completed);
      await host.session.prompt("Emit mixed output after yielding");
      const id = output(host).match(/Script running with cell ID (\S+)/)?.[1];
      assert(id);
      host.queueResponse(...functionCall("wait", { cell_id: id }, "collected"));
      host.queueResponse(completed);
      await host.session.prompt("Collect only the allowed mixed output");
      const request = host.requests.at(-1) as unknown as {
        input: { type: string; call_id?: string; output?: unknown }[];
      };
      const result = request.input.find(
        (item) => item.type === "function_call_output" && item.call_id === "call_collected",
      )!;
      assert.equal(images(result).length, mode === "unchanged" ? 2 : mode === "changed" ? 1 : 0);
      if (mode === "unchanged") {
        const parts = result.output as { type: string; text?: string }[];
        assert.deepEqual(
          parts.map((part) => part.type),
          ["input_text", "input_text", "input_image", "input_text", "input_image"],
        );
        assert.equal(parts[1]!.text, "BEFORE");
        assert.equal(parts[3]!.text, "AFTER");
      } else {
        assert.doesNotMatch(output(host, "collected"), /BEFORE|AFTER/);
        if (mode === "changed") assert.match(output(host, "collected"), /^PUBLIC/);
      }
    });
  }
});
