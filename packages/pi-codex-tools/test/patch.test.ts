/* eslint-disable no-await-in-loop -- Each case owns a real host and must finish before the next one. */
import assert from "node:assert/strict";
import { lstat, mkdir, readFile, readlink, stat, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import {
  createEditToolDefinition,
  createWriteToolDefinition,
  withFileMutationQueue,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { openNativeHost } from "../../../fixtures/native-host.ts";
import {
  call,
  completed,
  extension,
  functionCall,
  output,
  providerApi,
} from "./fixtures/model-loop.ts";

test("a raw patch creates a file and returns its result in the next request", async (t) => {
  let changes: unknown;
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
    extension(pi) {
      pi.on("tool_result", (event) => {
        if (event.toolName === "apply_patch")
          changes = (event.details as { patchChanges?: unknown }).patchChanges;
        return undefined;
      });
    },
  });
  const patch = "*** Begin Patch\n*** Add File: nested/new.txt\n+alpha\n+beta\n*** End Patch";
  host.queueResponse(
    ...call(
      `text(ALL_TOOLS.find(({name}) => name === "apply_patch").description); text(await tools.apply_patch(${JSON.stringify(patch)}));`,
    ),
  );
  host.queueResponse(completed);
  await host.session.prompt("Create the requested file");
  assert.equal(await readFile(join(host.directory, "nested/new.txt"), "utf8"), "alpha\nbeta\n");
  assert.match(output(host), /\n\{\}$/);
  assert(
    output(host).includes(
      "The `apply_patch` tool can be used to edit files. This is a FREEFORM tool, so do not wrap the patch in JSON.",
    ),
  );
  const request = host.requests[0] as unknown as {
    tools: { name: string; tools?: { description: string }[] }[];
  };
  const declared = request.tools.find((tool) => tool.name === "functions")!.tools![0]!.description;
  assert(
    declared.includes("declare const tools: { apply_patch(input: string): Promise<unknown>; };"),
  );
  assert.equal(
    request.tools.some((tool) => ["apply_patch", "edit", "write"].includes(tool.name)),
    false,
  );
  assert.deepEqual(changes, [
    {
      id: "0",
      action: "Added",
      path: join(host.directory, "nested/new.txt"),
      status: "completed",
      added: 2,
      removed: 0,
      output: "+alpha\n+beta\n",
    },
  ]);
});

test("patches update, move over an existing file, and delete with the observed file modes", async (t) => {
  const changes: unknown[] = [];
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
    extension(pi) {
      pi.on("tool_result", (event) => {
        if (event.toolName === "apply_patch")
          changes.push((event.details as { patchChanges?: unknown }).patchChanges);
        return undefined;
      });
    },
  });
  const source = join(host.directory, "original.txt");
  const destination = join(host.directory, "destination.txt");
  const removed = join(host.directory, "removed.txt");
  await writeFile(source, "alpha\nbeta\ngamma\n", { mode: 0o755 });
  await writeFile(destination, "old destination\n", { mode: 0o600 });
  await writeFile(removed, "remove this\n");
  const patches = [
    "*** Begin Patch\n*** Update File: original.txt\n@@\n alpha\n-beta\n+BETA\n gamma\n*** End Patch",
    "*** Begin Patch\n*** Update File: original.txt\n*** Move to: destination.txt\n@@\n-gamma\n+GAMMA\n*** End Patch",
    `*** Begin Patch\n*** Delete File: ${removed}\n*** End Patch`,
  ];
  host.queueResponse(
    ...call(
      patches.map((patch) => `text(await tools.apply_patch(${JSON.stringify(patch)}));`).join("\n"),
    ),
  );
  host.queueResponse(completed);
  await host.session.prompt("Apply the requested file changes");
  assert.match(output(host), /\n\{\}\n\{\}\n\{\}$/);
  assert.equal(await readFile(destination, "utf8"), "alpha\nBETA\nGAMMA\n");
  assert.equal((await stat(destination)).mode & 0o777, 0o600);
  await assert.rejects(readFile(source), { code: "ENOENT" });
  await assert.rejects(readFile(removed), { code: "ENOENT" });
  assert.deepEqual(
    (
      changes as {
        action: string;
        status: string;
        path: string;
        added?: number;
        removed?: number;
      }[][]
    ).map((patch) =>
      patch.map(({ action, status, path, added, removed: removedCount }) => ({
        action,
        status,
        path,
        added,
        removed: removedCount,
      })),
    ),
    [
      [
        {
          action: "Updated",
          status: "completed",
          path: source,
          added: 1,
          removed: 1,
        },
      ],
      [
        {
          action: "Moved",
          status: "completed",
          path: source,
          added: 1,
          removed: 1,
        },
        {
          action: "Updated",
          status: "completed",
          path: destination,
          added: 3,
          removed: 1,
        },
      ],
      [
        {
          action: "Deleted",
          status: "completed",
          path: removed,
          added: 0,
          removed: 1,
        },
      ],
    ],
  );
});

test("patch matching follows the measured priority and preserves unrelated bytes", async (t) => {
  const cases = [
    {
      name: "exact before trimmed",
      before: " one \none\n",
      hunk: "@@\n-one\n+changed",
      after: " one \nchanged\n",
    },
    {
      name: "trailing trim before full trim",
      before: " one \none \n",
      hunk: "@@\n-one\n+changed",
      after: " one \nchanged\n",
    },
    {
      name: "full trim",
      before: "  one  \n",
      hunk: "@@\n-one\n+changed",
      after: "changed\n",
    },
    {
      name: "unicode normalization",
      before: "“one”—two\u00a0three\n",
      hunk: '@@\n-"one"-two three\n+NORMALIZED',
      after: "NORMALIZED\n",
    },
    {
      name: "first duplicate",
      before: "same\nmiddle\nsame\n",
      hunk: "@@\n-same\n+changed",
      after: "changed\nmiddle\nsame\n",
    },
    {
      name: "CRLF",
      before: "first\r\nsecond\r\n",
      hunk: "@@\n-second\n+SECOND",
      after: "first\r\nSECOND\r\n",
    },
    {
      name: "first CRLF among mixed endings",
      before: "first\r\nsecond\nthird\nfourth\n",
      hunk: "@@\n-second\n+SECOND",
      after: "first\r\nSECOND\r\nthird\nfourth\n",
    },
    {
      name: "first LF among mixed endings",
      before: "first\nsecond\r\nthird\r\nfourth\r\n",
      hunk: "@@\n-second\n+SECOND",
      after: "first\nSECOND\nthird\r\nfourth\r\n",
    },
    {
      name: "matched context and missing final ending",
      before: "  first\r\nsecond\n  third\nfourth",
      hunk: "@@\n first\n-second\n+SECOND\n third",
      after: "  first\r\nSECOND\r\n  third\nfourth\r\n",
    },
    {
      name: "unrelated BOM",
      before: "\ufefffirst\nsecond\n",
      hunk: "@@\n-second\n+SECOND",
      after: "\ufefffirst\nSECOND\n",
    },
    {
      name: "disjoint hunks",
      before: "start\none\nmiddle\ntwo\nend\n",
      hunk: "@@\n start\n-one\n+ONE\n middle\n@@\n-two\n+TWO\n end",
      after: "start\nONE\nmiddle\nTWO\nend\n",
    },
    {
      name: "anchor and end marker",
      before: "start\nCHANGED\nmid\nsame\nend\n",
      hunk: "@@ mid\n-same\n+LAST\n end\n*** End of File",
      after: "start\nCHANGED\nmid\nLAST\nend\n",
    },
    {
      name: "insertion-only hunk appends",
      before: "first\nsecond\n",
      hunk: "@@\n+TAIL",
      after: "first\nsecond\nTAIL\n",
    },
    {
      name: "first hunk without marker",
      before: "first\nsecond\n",
      hunk: "-first\n+FIRST",
      after: "FIRST\nsecond\n",
    },
    {
      name: "insertion after missing final newline",
      before: "first",
      hunk: "@@\n+TAIL",
      after: "first\nTAIL\n",
    },
    {
      name: "context insertion after missing final newline",
      before: "first",
      hunk: "@@\n first\n+TAIL",
      after: "first\nTAIL\n",
    },
    {
      name: "removing all lines leaves an empty file",
      before: "first\n",
      hunk: "@@\n-first",
      after: "",
    },
    {
      name: "large unchanged prefix",
      before: "keep\n".repeat(200000) + "old\n",
      hunk: "@@\n-old\n+new",
      after: "keep\n".repeat(200000) + "new\n",
    },
  ];
  for (const sample of cases) {
    await t.test(sample.name, async (caseContext) => {
      const host = await openNativeHost(caseContext, {
        extensionPaths: [extension],
        providerApi,
      });
      const path = join(host.directory, "file.txt");
      await writeFile(path, sample.before, { mode: 0o755 });
      const patch = `*** Begin Patch\n*** Update File: file.txt\n${sample.hunk}\n*** End Patch`;
      host.queueResponse(...call(`text(await tools.apply_patch(${JSON.stringify(patch)}));`));
      host.queueResponse(completed);
      await host.session.prompt("Apply the focused file edit");
      assert.match(output(host), /\n\{\}$/);
      assert.deepEqual(await readFile(path), Buffer.from(sample.after));
      assert.equal((await stat(path)).mode & 0o777, 0o755);
    });
  }
});

test("validation failures return measured string errors before any file is changed", async (t) => {
  const cases = [
    { name: "empty", body: "", error: "patch rejected: empty patch" },
    {
      name: "empty update without marker",
      body: "*** Update File: {file}",
      error:
        "apply_patch verification failed: invalid hunk at line 4, Update file hunk for path '{file}' is empty",
    },
    {
      name: "empty update hunk",
      body: "*** Update File: {file}\n@@",
      error:
        "apply_patch verification failed: invalid hunk at line 6, Update hunk does not contain any lines",
    },
    {
      name: "end marker requires the final lines",
      body: "*** Update File: {file}\n@@\n-first\n+FIRST\n*** End of File",
      error: "apply_patch verification failed: Failed to find expected lines in {file}:\nfirst",
    },
    {
      name: "later invalid header",
      body: "*** Invalid File: invalid.txt",
      error:
        "apply_patch verification failed: invalid hunk at line 4, '*** Invalid File: invalid.txt' is not a valid hunk header. Valid hunk headers: '*** Add File: {path}', '*** Delete File: {path}', '*** Update File: {path}'",
    },
    {
      name: "missing update",
      body: "*** Update File: {missing}\n@@\n-old\n+new",
      error:
        "apply_patch verification failed: Failed to read file to update {missing}: No such file or directory (os error 2)",
    },
    {
      name: "missing delete",
      body: "*** Delete File: {missing}",
      error:
        "apply_patch verification failed: Failed to read {missing}: No such file or directory (os error 2)",
    },
    {
      name: "nonmatching",
      body: "*** Update File: {file}\n@@\n-not present\n+new",
      error:
        "apply_patch verification failed: Failed to find expected lines in {file}:\nnot present",
    },
    {
      name: "BOM is significant",
      before: "\ufefffirst\nsecond\n",
      body: "*** Update File: {file}\n@@\n-first\n+FIRST",
      error: "apply_patch verification failed: Failed to find expected lines in {file}:\nfirst",
    },
    {
      name: "later hunk cannot match inserted text",
      body: "*** Update File: {file}\n@@\n-first\n+FIRST\n@@\n-FIRST\n+changed",
      error: "apply_patch verification failed: Failed to find expected lines in {file}:\nFIRST",
    },
    {
      name: "repeated update",
      body: "*** Update File: {file}\n@@\n-first\n+FIRST\n*** Update File: {file}\n@@\n-second\n+SECOND",
      error: "apply_patch verification failed: invalid patch: multiple operations target {file}",
    },
    {
      name: "add then update",
      body: "*** Add File: {file}\n+new\n*** Update File: {file}\n@@\n-new\n+changed",
      error: "apply_patch verification failed: invalid patch: multiple operations target {file}",
    },
    {
      name: "invalid UTF8 update",
      before: Buffer.from([102, 105, 114, 115, 116, 10, 255, 10]),
      body: "*** Update File: {file}\n@@\n-first\n+FIRST",
      error:
        "apply_patch verification failed: Failed to read file to update {file}: invalid utf-8 sequence of 1 bytes from index 6",
    },
    {
      name: "invalid UTF8 delete",
      before: Buffer.from([102, 105, 114, 115, 116, 10, 255, 10]),
      body: "*** Delete File: {file}",
      error:
        "apply_patch verification failed: Failed to read {file}: invalid utf-8 sequence of 1 bytes from index 6",
    },
  ];
  for (const sample of cases) {
    await t.test(sample.name, async (caseContext) => {
      const host = await openNativeHost(caseContext, {
        extensionPaths: [extension],
        providerApi,
      });
      const path = join(host.directory, "file.txt");
      const missing = join(host.directory, "missing.txt");
      const witness = join(host.directory, "must-not-exist.txt");
      const before = Buffer.from(sample.before ?? "first\nsecond\n");
      await writeFile(path, before);
      const replace = (text: string) =>
        text.replaceAll("{file}", path).replaceAll("{missing}", missing);
      const patch = sample.body
        ? `*** Begin Patch\n*** Add File: ${witness}\n+witness\n${replace(sample.body)}\n*** End Patch`
        : "*** Begin Patch\n*** End Patch\n";
      host.queueResponse(
        ...call(
          `try { await tools.apply_patch(${JSON.stringify(patch)}); text("unexpected success"); } catch (error) { text({type: typeof error, error}); }`,
        ),
      );
      host.queueResponse(completed);
      await host.session.prompt("Report the rejected patch");
      const text = output(host);
      assert.deepEqual(JSON.parse(text.slice(text.indexOf("{"))), {
        type: "string",
        error: replace(sample.error),
      });
      assert.deepEqual(await readFile(path), before);
      await assert.rejects(readFile(witness), { code: "ENOENT" });
    });
  }
});

test("a later write failure keeps completed changes and reports the measured failure", async (t) => {
  let changes: unknown;
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
    extension(pi) {
      pi.on("tool_result", (event) => {
        if (event.toolName === "apply_patch")
          changes = (event.details as { patchChanges?: unknown }).patchChanges;
        return undefined;
      });
    },
  });
  const first = join(host.directory, "file-as-parent");
  const failed = join(first, "child.txt");
  const later = join(host.directory, "later.txt");
  const patch = `*** Begin Patch\n*** Add File: ${first}\n+created\n*** Add File: ${failed}\n+child\n*** Add File: ${later}\n+later\n*** End Patch`;
  host.queueResponse(
    ...call(
      `try { await tools.apply_patch(${JSON.stringify(patch)}); } catch (error) { text({type: typeof error, error}); }`,
    ),
  );
  host.queueResponse(completed);
  await host.session.prompt("Report actual changes after the failed patch");
  const text = output(host);
  assert.deepEqual(JSON.parse(text.slice(text.indexOf("{"))), {
    type: "string",
    error: `Exit code: 1\nWall time: 0 seconds\nOutput:\nFailed to write file ${failed}\n`,
  });
  assert.equal(await readFile(first, "utf8"), "created\n");
  await assert.rejects(readFile(failed), { code: "ENOTDIR" });
  await assert.rejects(readFile(later), { code: "ENOENT" });
  assert.deepEqual(
    (changes as { id: string; status: string; added?: number }[]).map(({ id, status, added }) => ({
      id,
      status,
      added,
    })),
    [
      { id: "0", status: "completed", added: 1 },
      { id: "1", status: "failed", added: undefined },
      { id: "2", status: "unattempted", added: undefined },
    ],
  );
});

test("an empty Add creates a zero-byte file and overwriting retains its existing mode", async (t) => {
  let changes: unknown;
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
    extension(pi) {
      pi.on("tool_result", (event) => {
        if (event.toolName === "apply_patch")
          changes = (event.details as { patchChanges?: unknown }).patchChanges;
        return undefined;
      });
    },
  });
  const path = join(host.directory, "file.txt");
  await writeFile(path, "previous\n", { mode: 0o600 });
  const patch = "*** Begin Patch\n*** Add File: file.txt\n*** End Patch";
  host.queueResponse(...call(`text(await tools.apply_patch(${JSON.stringify(patch)}));`));
  host.queueResponse(completed);
  await host.session.prompt("Apply the empty file addition");
  assert.match(output(host), /\n\{\}$/);
  assert.equal((await readFile(path)).length, 0);
  assert.equal((await stat(path)).mode & 0o777, 0o600);
  assert.deepEqual(
    (changes as { action: string; added: number; removed: number }[]).map(
      ({ action, added, removed }) => ({ action, added, removed }),
    ),
    [{ action: "Updated", added: 0, removed: 1 }],
  );
});

test("patch writes honor the file's operating-system permissions", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
  });
  const path = join(host.directory, "readonly.txt");
  await writeFile(path, "original\n", { mode: 0o444 });
  const patch =
    "*** Begin Patch\n*** Update File: readonly.txt\n@@\n-original\n+changed\n*** End Patch";
  host.queueResponse(
    ...call(
      `try { await tools.apply_patch(${JSON.stringify(patch)}); } catch (error) { text(error); }`,
    ),
  );
  host.queueResponse(completed);
  await host.session.prompt("Attempt the requested protected-file update");
  assert(output(host).endsWith(`Failed to write file ${path}\n`));
  assert.equal(await readFile(path, "utf8"), "original\n");
  assert.equal((await stat(path)).mode & 0o777, 0o444);
});

test("moving a file onto itself retains the measured write-then-delete effect", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
  });
  const path = join(host.directory, "file.txt");
  await writeFile(path, "first\n");
  const patch =
    "*** Begin Patch\n*** Update File: file.txt\n*** Move to: file.txt\n@@\n-first\n+FIRST\n*** End Patch";
  host.queueResponse(...call(`text(await tools.apply_patch(${JSON.stringify(patch)}));`));
  host.queueResponse(completed);
  await host.session.prompt("Apply the explicit self move");
  assert.match(output(host), /\n\{\}$/);
  await assert.rejects(readFile(path), { code: "ENOENT" });
});

test("native patch hooks can replace raw input, block affected paths, and redact results", async (t) => {
  const events: { type: string; name: string; parent: string | undefined }[] = [];
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
    extension(pi) {
      pi.on("tool_call", (event) => {
        if (event.toolName !== "apply_patch") return undefined;
        if (event.input["input"] === "replace this invalid patch")
          event.input["input"] =
            "*** Begin Patch\n*** Add File: allowed.txt\n+written after hook\n*** End Patch";
        const affected = [
          ...String(event.input["input"]).matchAll(
            /^\*\*\* (?:Add File|Update File|Delete File|Move to): (.+)$/gm,
          ),
        ].map((match) => match[1]);
        if (affected.includes("blocked.txt"))
          return { block: true, reason: "Patch path denied by the test policy" };
        return undefined;
      });
      pi.on("tool_result", (event) =>
        event.toolName === "apply_patch" && !event.isError
          ? { content: [{ type: "text", text: "processed-patch" }] }
          : undefined,
      );
      pi.on("tool_execution_start", (event) => {
        events.push({
          type: event.type,
          name: event.toolName,
          parent: event.parentToolCallId,
        });
      });
      pi.on("tool_execution_end", (event) => {
        events.push({
          type: event.type,
          name: event.toolName,
          parent: event.parentToolCallId,
        });
      });
    },
  });
  const blocked = "*** Begin Patch\n*** Add File: blocked.txt\n+blocked content\n*** End Patch";
  host.queueResponse(
    ...call(`text(await tools.apply_patch("replace this invalid patch"));
try { await tools.apply_patch(${JSON.stringify(blocked)}); } catch (error) { text(error); }`),
  );
  host.queueResponse(completed);
  await host.session.prompt("Apply native patch policy");
  assert(output(host).endsWith("processed-patch\nPatch path denied by the test policy"));
  assert.doesNotMatch(output(host), /\{\}|blocked content/);
  assert.equal(await readFile(join(host.directory, "allowed.txt"), "utf8"), "written after hook\n");
  await assert.rejects(readFile(join(host.directory, "blocked.txt")), {
    code: "ENOENT",
  });
  for (const type of ["tool_execution_start", "tool_execution_end"])
    assert(
      events.some(
        (event) =>
          event.type === type &&
          event.name === "apply_patch" &&
          event.parent?.startsWith("call_one"),
      ),
    );
});

test("overlapping multi-file patches retain both edits without lock-order deadlocks", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
  });
  await Promise.all(
    ["one.txt", "two.txt"].map((path) => writeFile(join(host.directory, path), "left\nright\n")),
  );
  const first =
    "*** Begin Patch\n*** Update File: one.txt\n@@\n-left\n+LEFT\n*** Update File: two.txt\n@@\n-left\n+LEFT\n*** End Patch";
  const second =
    "*** Begin Patch\n*** Update File: two.txt\n@@\n-right\n+RIGHT\n*** Update File: one.txt\n@@\n-right\n+RIGHT\n*** End Patch";
  host.queueResponse(
    ...call(
      `text(await Promise.all([tools.apply_patch(${JSON.stringify(first)}), tools.apply_patch(${JSON.stringify(second)})]));`,
    ),
  );
  host.queueResponse(completed);
  await host.session.prompt("Coordinate overlapping file changes");
  assert.match(output(host), /\n\[\{\},\{\}\]$/);
  assert.equal(await readFile(join(host.directory, "one.txt"), "utf8"), "LEFT\nRIGHT\n");
  assert.equal(await readFile(join(host.directory, "two.txt"), "utf8"), "LEFT\nRIGHT\n");
});

test("updates through a symlink alias preserve both same-patch edits and actual facts", async (t) => {
  let changes: unknown;
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
    extension(pi) {
      pi.on("tool_result", (event) => {
        if (event.toolName === "apply_patch")
          changes = (event.details as { patchChanges?: unknown }).patchChanges;
        return undefined;
      });
    },
  });
  const path = join(host.directory, "real.txt");
  await writeFile(path, "left\nright\n");
  await symlink(path, join(host.directory, "alias.txt"));
  const patch =
    "*** Begin Patch\n*** Update File: real.txt\n@@\n-left\n+LEFT\n*** Update File: alias.txt\n@@\n-right\n+RIGHT\n*** End Patch";
  host.queueResponse(...call(`text(await tools.apply_patch(${JSON.stringify(patch)}));`));
  host.queueResponse(completed);
  await host.session.prompt("Apply both edits through the alias");
  assert.match(output(host), /\n\{\}$/);
  assert.equal(await readFile(path, "utf8"), "LEFT\nRIGHT\n");
  assert.deepEqual(
    (
      changes as {
        status: string;
        added?: number;
        removed?: number;
        output?: string;
      }[]
    ).map(({ status, added, removed, output: detail }) => ({
      status,
      added,
      removed,
      output: detail,
    })),
    [
      { status: "completed", added: 1, removed: 1, output: "-left\n+LEFT\n" },
      { status: "completed", added: 1, removed: 1, output: "-right\n+RIGHT\n" },
    ],
  );
});

test("an update after a move edits moved contents and records the current source", async (t) => {
  let changes: unknown;
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
    extension(pi) {
      pi.on("tool_result", (event) => {
        if (event.toolName === "apply_patch")
          changes = (event.details as { patchChanges?: unknown }).patchChanges;
        return undefined;
      });
    },
  });
  const source = join(host.directory, "source.txt");
  const destination = join(host.directory, "destination.txt");
  await writeFile(source, "from-a\ncommon\n");
  await writeFile(destination, "from-b\ncommon\n");
  const patch =
    "*** Begin Patch\n*** Update File: source.txt\n*** Move to: destination.txt\n@@\n-from-a\n+A\n*** Update File: destination.txt\n@@\n-common\n+B\n*** End Patch";
  host.queueResponse(...call(`text(await tools.apply_patch(${JSON.stringify(patch)}));`));
  host.queueResponse(completed);
  await host.session.prompt("Move and then edit the destination");
  assert.match(output(host), /\n\{\}$/);
  assert.equal(await readFile(destination, "utf8"), "A\nB\n");
  await assert.rejects(readFile(source), { code: "ENOENT" });
  assert.deepEqual(
    (
      changes as {
        id: string;
        action: string;
        added?: number;
        removed?: number;
        output?: string;
      }[]
    ).map(({ id, action, added, removed, output: detail }) => ({
      id,
      action,
      added,
      removed,
      output: detail,
    })),
    [
      {
        id: "0",
        action: "Moved",
        added: 1,
        removed: 1,
        output: "-from-a\n+A\n",
      },
      {
        id: "0:destination",
        action: "Updated",
        added: 1,
        removed: 1,
        output: "-from-b\n+A\n",
      },
      {
        id: "1",
        action: "Updated",
        added: 1,
        removed: 1,
        output: "-common\n+B\n",
      },
    ],
  );
});

test("a later match failure retains completed edits and identifies unattempted files", async (t) => {
  let changes: unknown;
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
    extension(pi) {
      pi.on("tool_result", (event) => {
        if (event.toolName === "apply_patch")
          changes = (event.details as { patchChanges?: unknown }).patchChanges;
        return undefined;
      });
    },
  });
  const path = join(host.directory, "real.txt");
  const alias = join(host.directory, "alias.txt");
  const later = join(host.directory, "later.txt");
  await writeFile(path, "left\nright\n");
  await symlink(path, alias);
  const patch =
    "*** Begin Patch\n*** Update File: real.txt\n@@\n-left\n+LEFT\n*** Update File: alias.txt\n@@\n-left\n+changed\n*** Add File: later.txt\n+later\n*** End Patch";
  host.queueResponse(
    ...call(
      `try { await tools.apply_patch(${JSON.stringify(patch)}); } catch (error) { text({type: typeof error, error}); }`,
    ),
  );
  host.queueResponse(completed);
  await host.session.prompt("Apply the conflicting alias patch");
  const text = output(host);
  assert.deepEqual(JSON.parse(text.slice(text.indexOf("{"))), {
    type: "string",
    error: `Exit code: 1\nWall time: 0 seconds\nOutput:\nFailed to find expected lines in ${alias}:\nleft\n`,
  });
  assert.equal(await readFile(path, "utf8"), "LEFT\nright\n");
  await assert.rejects(readFile(later), { code: "ENOENT" });
  assert.deepEqual(
    (
      changes as {
        status: string;
        added?: number;
        removed?: number;
        output?: string;
      }[]
    ).map(({ status, added, removed, output: detail }) => ({
      status,
      added,
      removed,
      output: detail,
    })),
    [
      { status: "completed", added: 1, removed: 1, output: "-left\n+LEFT\n" },
      {
        status: "failed",
        added: undefined,
        removed: undefined,
        output: `Failed to find expected lines in ${alias}:\nleft`,
      },
      {
        status: "unattempted",
        added: undefined,
        removed: undefined,
        output: undefined,
      },
    ],
  );
});

test("a later read failure reports the completed deletion and leaves later files unattempted", async (t) => {
  let changes: unknown;
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
    extension(pi) {
      pi.on("tool_result", (event) => {
        if (event.toolName === "apply_patch")
          changes = (event.details as { patchChanges?: unknown }).patchChanges;
        return undefined;
      });
    },
  });
  const path = join(host.directory, "real.txt");
  const alias = join(host.directory, "alias.txt");
  const later = join(host.directory, "later.txt");
  await writeFile(path, "left\nright\n");
  await symlink(path, alias);
  const patch =
    "*** Begin Patch\n*** Delete File: real.txt\n*** Update File: alias.txt\n@@\n-left\n+LEFT\n*** Add File: later.txt\n+later\n*** End Patch";
  host.queueResponse(
    ...call(
      `try { await tools.apply_patch(${JSON.stringify(patch)}); } catch (error) { text({type: typeof error, error}); }`,
    ),
  );
  host.queueResponse(completed);
  await host.session.prompt("Delete the source before its alias update");
  const text = output(host);
  assert.deepEqual(JSON.parse(text.slice(text.indexOf("{"))), {
    type: "string",
    error: `Exit code: 1\nWall time: 0 seconds\nOutput:\nFailed to read file to update ${alias}: No such file or directory (os error 2)\n`,
  });
  await assert.rejects(readFile(path), { code: "ENOENT" });
  await assert.rejects(readFile(later), { code: "ENOENT" });
  assert.deepEqual(
    (changes as { status: string; added?: number; removed?: number }[]).map(
      ({ status, added, removed }) => ({ status, added, removed }),
    ),
    [
      { status: "completed", added: 0, removed: 2 },
      { status: "failed", added: undefined, removed: undefined },
      { status: "unattempted", added: undefined, removed: undefined },
    ],
  );
});

test("delete facts describe contents after an earlier alias update", async (t) => {
  let changes: unknown;
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
    extension(pi) {
      pi.on("tool_result", (event) => {
        if (event.toolName === "apply_patch")
          changes = (event.details as { patchChanges?: unknown }).patchChanges;
        return undefined;
      });
    },
  });
  const path = join(host.directory, "real.txt");
  await writeFile(path, "left\nright\n");
  await symlink(path, join(host.directory, "alias.txt"));
  const patch =
    "*** Begin Patch\n*** Update File: alias.txt\n@@\n-left\n+LEFT\n*** Delete File: real.txt\n*** End Patch";
  host.queueResponse(...call(`text(await tools.apply_patch(${JSON.stringify(patch)}));`));
  host.queueResponse(completed);
  await host.session.prompt("Update through an alias and delete the real file");
  assert.match(output(host), /\n\{\}$/);
  await assert.rejects(readFile(path), { code: "ENOENT" });
  assert.deepEqual(
    (
      changes as {
        action: string;
        status: string;
        added?: number;
        removed?: number;
        output?: string;
      }[]
    ).map(({ action, status, added, removed, output: detail }) => ({
      action,
      status,
      added,
      removed,
      output: detail,
    })),
    [
      {
        action: "Updated",
        status: "completed",
        added: 1,
        removed: 1,
        output: "-left\n+LEFT\n",
      },
      {
        action: "Deleted",
        status: "completed",
        added: 0,
        removed: 2,
        output: "-LEFT\n-right\n",
      },
    ],
  );
});

test("deleting a now-dangling alias fails and leaves later files unattempted", async (t) => {
  let changes: unknown;
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
    extension(pi) {
      pi.on("tool_result", (event) => {
        if (event.toolName === "apply_patch")
          changes = (event.details as { patchChanges?: unknown }).patchChanges;
        return undefined;
      });
    },
  });
  const path = join(host.directory, "real.txt");
  const alias = join(host.directory, "alias.txt");
  const later = join(host.directory, "later.txt");
  await writeFile(path, "left\nright\n");
  await symlink(path, alias);
  const aliasMode = (await lstat(alias)).mode;
  const patch =
    "*** Begin Patch\n*** Delete File: real.txt\n*** Delete File: alias.txt\n*** Add File: later.txt\n+later\n*** End Patch";
  host.queueResponse(
    ...call(
      `try { text(await tools.apply_patch(${JSON.stringify(patch)})); } catch (error) { text({type: typeof error, error}); }`,
    ),
  );
  host.queueResponse(completed);
  await host.session.prompt("Delete the source and its alias");
  const text = output(host);
  assert.deepEqual(JSON.parse(text.slice(text.indexOf("{"))), {
    type: "string",
    error: `Exit code: 1\nWall time: 0 seconds\nOutput:\nFailed to delete file ${alias}\n`,
  });
  await assert.rejects(lstat(path), { code: "ENOENT" });
  assert((await lstat(alias)).isSymbolicLink());
  assert.equal((await lstat(alias)).mode, aliasMode);
  assert.equal(await readlink(alias), path);
  await assert.rejects(readFile(alias), { code: "ENOENT" });
  await assert.rejects(lstat(later), { code: "ENOENT" });
  assert.deepEqual(changes, [
    {
      id: "0",
      action: "Deleted",
      path,
      status: "completed",
      added: 0,
      removed: 2,
      output: "-left\n-right\n",
    },
    {
      id: "1",
      action: "Deleted",
      path: alias,
      status: "failed",
      output: `Failed to delete file ${alias}`,
    },
    {
      id: "2",
      action: "Added",
      path: later,
      status: "unattempted",
    },
  ]);
});

test("a patch through an existing symlink waits for a native file mutation", async (t) => {
  const writing = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  let patchStarted = false;
  let patchEnded = false;
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
    extension(pi) {
      pi.registerTool({
        ...createWriteToolDefinition(process.cwd(), {
          operations: {
            async mkdir(path) {
              await mkdir(path, { recursive: true });
            },
            async writeFile(path, content) {
              writing.resolve();
              await release.promise;
              await writeFile(path, content);
            },
          },
        }),
        name: "queued_write",
        exposure: "codemode",
      });
      pi.registerTool({
        name: "coordinate_files",
        label: "Coordinate files",
        description: "Exercise native file coordination",
        parameters: Type.Object({}),
        async execute(_id, _args, _signal, _onUpdate, ctx) {
          const native = ctx.executeTool("queued_write", {
            path: "file.txt",
            content: "native\n",
          });
          await writing.promise;
          const patch = ctx.executeTool("apply_patch", {
            input:
              "*** Begin Patch\n*** Update File: alias.txt\n@@\n-native\n+patched\n*** End Patch",
          });
          const [written, patched] = await Promise.all([native, patch]);
          assert.equal(written.isError, false);
          return { ...patched.result, isError: patched.isError };
        },
      });
      pi.on("tool_execution_start", (event) => {
        if (event.toolName === "apply_patch") patchStarted = true;
      });
      pi.on("tool_execution_end", (event) => {
        if (event.toolName === "apply_patch") patchEnded = true;
      });
    },
  });
  const path = join(host.directory, "file.txt");
  await writeFile(path, "initial\n");
  await symlink(path, join(host.directory, "alias.txt"));
  host.queueResponse(...functionCall("coordinate_files", {}));
  host.queueResponse(completed);
  const running = host.session.prompt("Coordinate the native write and patch");
  try {
    await t.waitFor(() => assert(patchStarted));
    assert.equal(patchEnded, false);
    assert.equal(await readFile(path, "utf8"), "initial\n");
  } finally {
    release.resolve();
  }
  await running;
  assert.equal(await readFile(path, "utf8"), "patched\n");
  const request = host.requests.at(-1) as unknown as {
    input: Record<string, unknown>[];
  };
  const result = request.input.find(
    (item) => item["type"] === "function_call_output" && item["call_id"] === "call_native",
  );
  assert.equal(result?.["output"], "{}");
});

test("cancelling a queued patch leaves the file intact and releases it for the next prompt", async (t) => {
  let started = false;
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
    extension(pi) {
      pi.on("tool_execution_start", (event) => {
        if (event.toolName === "apply_patch") started = true;
      });
    },
  });
  const path = join(host.directory, "file.txt");
  await writeFile(path, "initial\n");
  const holding = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const occupied = withFileMutationQueue(path, async () => {
    holding.resolve();
    await release.promise;
  });
  await holding.promise;
  const patch = "*** Begin Patch\n*** Update File: file.txt\n@@\n-initial\n+changed\n*** End Patch";
  host.queueResponse(...call(`text(await tools.apply_patch(${JSON.stringify(patch)}));`));
  const running = host.session.prompt("Start a queued patch");
  let stopping: Promise<void> | undefined;
  try {
    await t.waitFor(() => assert(started));
    stopping = host.session.abort();
    assert.equal(await readFile(path, "utf8"), "initial\n");
  } finally {
    release.resolve();
  }
  await Promise.all([occupied, running, stopping]);
  assert.equal(await readFile(path, "utf8"), "initial\n");
  const parent = host.session.messages.find(
    (message) => message.role === "toolResult" && message.toolName === "exec",
  );
  assert(parent?.role === "toolResult");
  assert.equal(parent.nestedCalls?.complete, true);
  assert.equal(parent.nestedCalls.calls.length, 1);
  assert.notEqual(parent.nestedCalls.calls[0]!.status, "unfinished");
  host.queueResponse(...call(`text(await tools.apply_patch(${JSON.stringify(patch)}));`, "next"));
  host.queueResponse(completed);
  await host.session.prompt("Apply the patch after cancellation");
  assert.match(output(host, "next"), /\n\{\}$/);
  assert.equal(await readFile(path, "utf8"), "changed\n");
});

test("patch selection preserves exclusions, partial native scopes, and extension-owned mutations", async (t) => {
  const cases = [
    { name: "explicit patch", tools: ["exec", "apply_patch"], available: true },
    {
      name: "explicit native pair remains native",
      tools: ["exec", "edit", "write"],
      available: false,
    },
    { name: "execution only", tools: ["exec"], available: false },
    { name: "write only", tools: ["exec", "write"], available: false },
    { name: "edit only", tools: ["exec", "edit"], available: false },
    { name: "excluded edit", excludeTools: ["edit"], available: false },
    { name: "excluded write", excludeTools: ["write"], available: false },
    { name: "excluded patch", excludeTools: ["apply_patch"], available: false },
    { name: "owned edit", override: "edit", available: false },
    { name: "owned write", override: "write", available: false },
  ];
  for (const sample of cases) {
    await t.test(sample.name, async (caseContext) => {
      const host = await openNativeHost(caseContext, {
        extensionPaths: [extension],
        providerApi,
        ...(sample.tools ? { tools: sample.tools } : {}),
        ...(sample.excludeTools ? { excludeTools: sample.excludeTools } : {}),
        extension(pi) {
          if (sample.override === "edit")
            pi.registerTool({
              ...createEditToolDefinition(process.cwd()),
              description: "Preserved owned edit",
            });
          if (sample.override === "write")
            pi.registerTool({
              ...createWriteToolDefinition(process.cwd()),
              description: "Preserved owned write",
            });
        },
      });
      const patch = "*** Begin Patch\n*** Add File: selected.txt\n+selected\n*** End Patch";
      host.queueResponse(
        ...call(
          sample.available
            ? `text(await tools.apply_patch(${JSON.stringify(patch)}));`
            : "text(typeof tools.apply_patch); text(ALL_TOOLS.map(({name}) => name));",
        ),
      );
      host.queueResponse(completed);
      await host.session.prompt("Respect the selected file tool scope");
      const request = host.requests[0] as unknown as {
        tools: {
          name: string;
          description?: string;
          tools?: { description: string }[];
        }[];
      };
      const description = request.tools.find((tool) => tool.name === "functions")!.tools![0]!
        .description;
      assert.equal(description.includes("### `apply_patch`"), sample.available);
      if (sample.available) {
        assert.match(output(host), /\n\{\}$/);
        assert.equal(await readFile(join(host.directory, "selected.txt"), "utf8"), "selected\n");
        assert.equal(
          request.tools.some((tool) => ["edit", "write", "apply_patch"].includes(tool.name)),
          false,
        );
      } else {
        assert.match(output(host), /undefined/);
        assert.doesNotMatch(output(host), /apply_patch/);
        await assert.rejects(readFile(join(host.directory, "selected.txt")), {
          code: "ENOENT",
        });
        for (const name of ["edit", "write"])
          assert.equal(
            request.tools.some((tool) => tool.name === name),
            sample.tools ? sample.tools.includes(name) : !sample.excludeTools?.includes(name),
          );
        if (sample.override)
          assert.equal(
            request.tools.find((tool) => tool.name === sample.override)?.description,
            `Preserved owned ${sample.override}`,
          );
      }
    });
  }
});
