import assert from "node:assert/strict"
import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import test from "node:test"
import { setTimeout } from "node:timers/promises"
import { stripVTControlCharacters } from "node:util"
import { openNativeHost } from "../../../fixtures/native-host.ts"
import {
  call,
  completed,
  extension,
  output,
  providerApi,
} from "./fixtures/model-loop.ts"

test("patch cards show actual created, updated, moved, and deleted files", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
    rows: 100,
    columns: 200,
  })
  await writeFile(join(host.directory, "old.txt"), "old\n")
  await writeFile(join(host.directory, "gone.txt"), "gone\n")
  const patches = [
    "*** Begin Patch\n*** Add File: created.txt\n+created\n*** Update File: old.txt\n@@\n-old\n+updated\n*** End Patch",
    "*** Begin Patch\n*** Update File: old.txt\n*** Move to: moved.txt\n@@\n-updated\n+moved\n*** Delete File: gone.txt\n*** End Patch",
  ]
  host.queueResponse(
    ...call(
      patches
        .map(
          (patch) => `text(await tools.apply_patch(${JSON.stringify(patch)}));`,
        )
        .join("\n"),
    ),
  )
  host.queueResponse(completed)
  await host.session.prompt("Apply file changes")
  await host.key("\x0f")
  await setTimeout(60)
  const screen = stripVTControlCharacters(host.screenLines().join("\n"))
  assert.match(screen, /Added: .*created\.txt/)
  assert.match(screen, /Updated: .*old\.txt/)
  assert.match(screen, /Moved: .*old\.txt → .*moved\.txt/)
  assert.match(screen, /Deleted: .*gone\.txt/)
  assert.doesNotMatch(screen, /apply_patch|text\(|\{\}|Wall time/)
  assert.equal(
    await readFile(join(host.directory, "created.txt"), "utf8"),
    "created\n",
  )
  assert.equal(
    await readFile(join(host.directory, "moved.txt"), "utf8"),
    "moved\n",
  )
  await assert.rejects(readFile(join(host.directory, "old.txt")), {
    code: "ENOENT",
  })
  await assert.rejects(readFile(join(host.directory, "gone.txt")), {
    code: "ENOENT",
  })
  assert.match(output(host), /\n\{\}\n\{\}$/)
})

test("failed patch cards retain completed changes without claiming unexecuted changes", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
    rows: 100,
    columns: 200,
  })
  const patch =
    "*** Begin Patch\n*** Add File: parent-file\n+first\n*** Add File: parent-file/child.txt\n+second\n*** Add File: never.txt\n+never\n*** End Patch"
  host.queueResponse(
    ...call(
      `try { await tools.apply_patch(${JSON.stringify(patch)}); } catch (error) { text(error); }`,
    ),
  )
  host.queueResponse(completed)
  await host.session.prompt("Apply a partially failing patch")
  await host.key("\x0f")
  await setTimeout(60)
  const screen = stripVTControlCharacters(host.screenLines().join("\n"))
  assert.match(screen, /Patch · failed/)
  assert.match(screen, /Added: .*parent-file/)
  assert.match(screen, /Failed to write file .*parent-file\/child\.txt/)
  assert.doesNotMatch(screen, /Added: .*child|never\.txt|Wall time|Exit code:/)
  assert.equal(
    await readFile(join(host.directory, "parent-file"), "utf8"),
    "first\n",
  )
  await assert.rejects(readFile(join(host.directory, "never.txt")), {
    code: "ENOENT",
  })
  assert.match(
    output(host),
    /Exit code: 1\nWall time: 0 seconds\nOutput:\nFailed to write file/,
  )
})

test("patch cards honor effective arguments, blocking, validation, and result redaction", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
    rows: 100,
    columns: 200,
    extension(pi) {
      pi.on("tool_call", (event) => {
        if (event.toolName !== "apply_patch") return undefined
        if (event.input["input"] === "replace-invalid")
          event.input["input"] =
            "*** Begin Patch\n*** Add File: effective.txt\n+effective\n*** End Patch"
        if (String(event.input["input"]).includes("denied.txt"))
          return { block: true, reason: "Patch denied by policy" }
        return undefined
      })
      pi.on("tool_result", (event) => {
        if (
          event.toolName === "apply_patch" &&
          !event.isError &&
          String(event.input["input"]).includes("secret.txt")
        )
          return { content: [{ type: "text", text: "redacted patch result" }] }
        return undefined
      })
    },
  })
  const denied =
    "*** Begin Patch\n*** Add File: denied.txt\n+denied\n*** End Patch"
  const secret =
    "*** Begin Patch\n*** Add File: secret.txt\n+secret\n*** End Patch"
  host.queueResponse(
    ...call(
      `text(await tools.apply_patch("replace-invalid")); try { await tools.apply_patch(${JSON.stringify(denied)}); } catch(error) { text(error); } try { await tools.apply_patch("not-a-patch"); } catch(error) { text(error); } text(await tools.apply_patch(${JSON.stringify(secret)}));`,
    ),
  )
  host.queueResponse(completed)
  await host.session.prompt("Apply file policy")
  await host.key("\x0f")
  await setTimeout(60)
  const screen = stripVTControlCharacters(host.screenLines().join("\n"))
  assert.match(screen, /Added: .*effective\.txt/)
  assert.match(screen, /Patch denied by policy/)
  assert.match(screen, /verification failed: invalid patch/)
  assert.match(screen, /redacted patch result/)
  assert.doesNotMatch(
    screen,
    /replace-invalid|denied\.txt|secret\.txt|not-a-patch|apply_patch ·/,
  )
  assert.equal(
    await readFile(join(host.directory, "effective.txt"), "utf8"),
    "effective\n",
  )
  assert.equal(
    await readFile(join(host.directory, "secret.txt"), "utf8"),
    "secret\n",
  )
  await assert.rejects(readFile(join(host.directory, "denied.txt")), {
    code: "ENOENT",
  })
  assert.match(output(host), /redacted patch result/)
  assert.doesNotMatch(output(host), /secret\.txt|secret content/)
})

test("redacting a partial patch failure suppresses its earlier file metadata", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
    rows: 80,
    columns: 200,
    extension(pi) {
      pi.on("tool_result", (event) =>
        event.toolName === "apply_patch"
          ? { content: [{ type: "text", text: "policy-hidden failure" }] }
          : undefined,
      )
    },
  })
  const patch =
    "*** Begin Patch\n*** Add File: private-parent\n+first\n*** Add File: private-parent/child\n+second\n*** End Patch"
  host.queueResponse(
    ...call(
      `try { await tools.apply_patch(${JSON.stringify(patch)}); } catch(error) { text(error); }`,
    ),
  )
  host.queueResponse(completed)
  await host.session.prompt("Apply a redacted failing patch")
  await host.key("\x0f")
  await setTimeout(60)
  const screen = stripVTControlCharacters(host.screenLines().join("\n"))
  assert.match(screen, /Patch · failed/)
  assert.match(screen, /policy-hidden failure/)
  assert.doesNotMatch(screen, /private-parent|Added:|Failed to write/)
  assert.equal(
    await readFile(join(host.directory, "private-parent"), "utf8"),
    "first\n",
  )
  assert.match(output(host), /policy-hidden failure/)
  assert.doesNotMatch(output(host), /private-parent|Failed to write/)
})

test("clearing returned patch details keeps partial file changes out of the card and reload", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
    rows: 100,
    columns: 200,
    extension(pi) {
      pi.on("tool_result", (event) =>
        event.toolName === "apply_patch" ? { details: {} } : undefined,
      )
    },
  })
  const patch =
    "*** Begin Patch\n*** Add File: created-first\n+first\n*** Add File: created-first/child\n+second\n*** End Patch"
  host.queueResponse(
    ...call(
      `try { await tools.apply_patch(${JSON.stringify(patch)}); } catch(error) { text(error); }`,
    ),
  )
  host.queueResponse(completed)
  await host.session.prompt("Keep only the returned error")
  await host.key("\x0f")
  await setTimeout(60)
  const assertReturned = () => {
    const screen = stripVTControlCharacters(host.screenLines().join("\n"))
    assert.match(screen, /Patch · failed/)
    assert.match(screen, /Failed to write file .*created-first\/child/)
    assert.doesNotMatch(screen, /Added:|Updated:|Moved:|Deleted:/)
  }
  assertReturned()
  assert.match(output(host), /Failed to write file .*created-first\/child/)
  assert.equal(
    await readFile(join(host.directory, "created-first"), "utf8"),
    "first\n",
  )
  await host.reload()
  await setTimeout(70)
  assertReturned()
})

test("a self move reports its actual write and deletion rather than an existing destination", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
    rows: 60,
    columns: 200,
  })
  await writeFile(join(host.directory, "same.txt"), "before\n")
  const patch =
    "*** Begin Patch\n*** Update File: same.txt\n*** Move to: same.txt\n@@\n-before\n+after\n*** End Patch"
  host.queueResponse(
    ...call(`text(await tools.apply_patch(${JSON.stringify(patch)}));`),
  )
  host.queueResponse(completed)
  await host.session.prompt("Apply a self move")
  await host.key("\x0f")
  await setTimeout(60)
  const screen = stripVTControlCharacters(host.screenLines().join("\n"))
  assert.match(screen, /Updated: .*same\.txt/)
  assert.match(screen, /Deleted: .*same\.txt/)
  assert.doesNotMatch(screen, /Moved:/)
  await assert.rejects(readFile(join(host.directory, "same.txt")), {
    code: "ENOENT",
  })
  assert.match(output(host), /\n\{\}$/)
})

test("large patches retain bounded file previews with an explicit omission", async (t) => {
  const host = await openNativeHost(t, {
    extensionPaths: [extension],
    providerApi,
    rows: 100,
    columns: 200,
  })
  const patch = `*** Begin Patch\n${Array.from({ length: 18 }, (_, index) => `*** Add File: file-${index}.txt\n+${index}`).join("\n")}\n*** End Patch`
  host.queueResponse(
    ...call(`text(await tools.apply_patch(${JSON.stringify(patch)}));`),
  )
  host.queueResponse(completed)
  await host.session.prompt("Apply many changes")
  await host.key("\x0f")
  await setTimeout(60)
  const screen = stripVTControlCharacters(host.screenLines().join("\n"))
  assert.match(screen, /earlier file changes omitted/)
  assert.match(screen, /Added: .*file-17\.txt/)
  assert.doesNotMatch(screen, /Added: .*file-0\.txt/)
  assert.equal(
    await readFile(join(host.directory, "file-0.txt"), "utf8"),
    "0\n",
  )
  assert.equal(
    await readFile(join(host.directory, "file-17.txt"), "utf8"),
    "17\n",
  )
  assert.match(output(host), /\n\{\}$/)
})
