/* eslint-disable no-await-in-loop -- These scenarios edit and submit one native draft at a time. */
import assert from "node:assert/strict"
import { mkdir, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { test } from "node:test"
import { setTimeout as delay } from "node:timers/promises"
import { stripVTControlCharacters } from "node:util"
import type { InputEvent } from "@earendil-works/pi-coding-agent"
import { createHost } from "../fixtures/host.ts"

const image = {
  type: "image",
  data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==",
  mimeType: "image/png",
} as const

test(
  "native typed canonical prose invokes the effective skill without rewriting draft history",
  { timeout: 15000 },
  async (t) => {
    const host = await createHost(t)
    const draft = "Please apply /skill:review to this change."
    for (const character of draft) host.terminal.input(character)
    assert.equal(host.ui.getEditorText(), draft)

    const submitted = await host.submit()
    assert(submitted.includes("Review the actual behavior."), submitted)
    assert(
      submitted.includes(`<skill name="review" location="${host.skillPath}">`),
      submitted,
    )
    assert(
      submitted.includes(`References are relative to ${host.skillDir}.`),
      submitted,
    )
    assert(submitted.includes(draft), submitted)
    assert(!submitted.includes("description: Review behavior"), submitted)

    host.terminal.input("\x1b[A")
    assert.equal(host.ui.getEditorText(), draft)
  },
)

test(
  "Markdown examples and destinations remain literal at native submission",
  { timeout: 15000 },
  async (t) => {
    const host = await createHost(t)
    const draft = [
      "Literal examples:",
      "` /skill:review ` and `` /skill:review ` example ``",
      "",
      "```text",
      "/skill:review",
      "```",
      "",
      "~~~",
      "/skill:review",
      "~~~",
      "",
      "    /skill:review",
      "\t/skill:review",
      "",
      "- ` /skill:review `",
      "> ```",
      "> /skill:review",
      "> ```",
      "",
      "\\/skill:review [link](/skill:review) [reference][example]",
      "",
      "[example]: /skill:review",
      "",
      "https://example.com/skill:review <https://example.com/skill:review>",
      "/skill:review/scripts /skill:review.md ./skill:review ~/skill:review dir/skill:review",
      "$review /review /skill:reviewing /skill:review-extra",
    ].join("\n")
    host.ui.pasteToEditor(draft)
    const nativeDraft = host.ui.getEditorText()
    assert.equal(await host.submit(), nativeDraft)
  },
)

test(
  "canonical references at prose punctuation boundaries invoke the complete skill",
  { timeout: 15000 },
  async (t) => {
    const host = await createHost(t)
    for (const draft of [
      "Apply (/skill:review).",
      "Apply /skill:review, please.",
      "Apply **/skill:review**.",
      "Apply [the /skill:review skill](https://example.com).",
    ]) {
      host.ui.setEditorText(draft)
      const submitted = await host.submit()
      assert(submitted.includes("Review the actual behavior."), submitted)
      assert(submitted.includes(draft), submitted)
    }
  },
)

test(
  "leading native prompt commands keep their argument handling",
  { timeout: 15000 },
  async (t) => {
    const host = await createHost(t, async (pi, directory) => {
      const promptPath = join(directory, "reply.md")
      await writeFile(promptPath, "Native template receives $ARGUMENTS.\n")
      pi.on("resources_discover", () => ({ promptPaths: [promptPath] }))
    })
    host.ui.setEditorText("/reply /skill:review")
    assert.equal(
      await host.submit(),
      "Native template receives /skill:review.\n",
    )
  },
)

test(
  "escaped name suffixes and path separators do not turn prefixes into references",
  { timeout: 15000 },
  async (t) => {
    const host = await createHost(t)
    const draft = String.raw`Keep /skill:review\-extra, /skill:review\_notes, and \\/skill:review literal.`
    host.ui.setEditorText(draft)
    assert.equal(await host.submit(), draft)
  },
)

test(
  "native first-line trimming invokes the reference and preserves native history",
  { timeout: 15000 },
  async (t) => {
    const host = await createHost(t)
    const draft = "    /skill:review"
    host.ui.setEditorText(draft)
    assert.equal(host.ui.getEditorText(), draft)
    const submitted = await host.submit()
    assert.deepEqual(host.inputs, [{ text: "/skill:review", draft: "" }])
    assert.equal(
      submitted,
      `<skill name="review" location="${host.skillPath}">\nReferences are relative to ${host.skillDir}.\n\nReview the actual behavior.\n</skill>\n\n/skill:review`,
    )

    host.terminal.input("\x1b[A")
    assert.equal(host.ui.getEditorText(), "/skill:review")
  },
)

test(
  "a fenced leading reference remains literal in native submission and history",
  { timeout: 15000 },
  async (t) => {
    const host = await createHost(t)
    const draft = "```text\n/skill:review\n```"
    host.ui.setEditorText(draft)
    assert.equal(await host.submit(), draft)
    assert.deepEqual(host.inputs, [{ text: draft, draft: "" }])

    host.terminal.input("\x1b[A")
    assert.equal(host.ui.getEditorText(), draft)
  },
)

for (const route of ["steer", "followUp"] as const) {
  test(
    `native ${route} retains trimming and fenced leading examples through delivery`,
    { timeout: 15000 },
    async (t) => {
      const deliveries: InputEvent[] = []
      const host = await createHost(
        t,
        (pi) => {
          pi.on("input", (event) => {
            deliveries.push(event)
          })
        },
        true,
      )
      const expanded = `<skill name="review" location="${host.skillPath}">\nReferences are relative to ${host.skillDir}.\n\nReview the actual behavior.\n</skill>\n\n/skill:review`
      const fenced = "```text\n/skill:review\n```"
      for (const [draft, nativeDraft, expected] of [
        ["    /skill:review", "/skill:review", expanded],
        [fenced, fenced, fenced],
      ] as const) {
        host.ui.setEditorText("First request")
        host.terminal.input("\r")
        await t.waitFor(() => assert.equal(host.pendingResponses.length, 1))
        assert(host.session.isStreaming)

        host.ui.setEditorText(draft)
        assert.equal(host.ui.getEditorText(), draft)
        host.terminal.input(route === "steer" ? "\r" : "\x1b\r")
        await t.waitFor(() =>
          assert.deepEqual(
            route === "steer"
              ? host.session.getSteeringMessages()
              : host.session.getFollowUpMessages(),
            [expected],
          ),
        )
        assert.equal(deliveries.at(-1)?.streamingBehavior, route)
        assert.equal(deliveries.at(-1)?.source, "interactive")
        assert.deepEqual(host.inputs.at(-1), { text: nativeDraft, draft: "" })
        assert.equal(host.ui.getEditorText(), "")

        host.reply()
        await t.waitFor(() => assert.equal(host.pendingResponses.length, 1))
        host.reply()
        await host.session.waitForIdle()
        const message = host.session.messages.findLast(
          (item) => item.role === "user",
        )
        assert.deepEqual(message?.content, [{ type: "text", text: expected }])
        const answer = host.session.messages.findLast(
          (item) => item.role === "assistant",
        )
        assert(answer?.role === "assistant")
        assert.equal(answer.stopReason, "stop", answer.errorMessage)

        host.terminal.input("\x1b[A")
        assert.equal(host.ui.getEditorText(), nativeDraft)
      }
    },
  )
}

test(
  "native paste and another extension's insertion remain character-editable references",
  { timeout: 15000 },
  async (t) => {
    const draft = "Please apply /skill:review"
    const host = await createHost(t, (pi) => {
      pi.registerCommand("insert-reference", {
        handler: async (_args, ctx) => ctx.ui.pasteToEditor(draft),
      })
    })
    for (const insert of [
      () => host.terminal.input(`\x1b[200~${draft}\x1b[201~`),
      () => host.ui.pasteToEditor(draft),
      () => host.session.prompt("/insert-reference"),
    ]) {
      await insert()
      assert.equal(host.ui.getEditorText(), draft)
      host.terminal.input("\x7f")
      assert.equal(host.ui.getEditorText(), "Please apply /skill:revie")
      assert.equal(await host.submit(), "Please apply /skill:revie")
      host.terminal.input("\x1b[A")
      host.terminal.input("\x05")
      host.terminal.input("w")
      assert.equal(host.ui.getEditorText(), draft)
      assert((await host.submit()).includes("Review the actual behavior."))
    }
  },
)

test(
  "unreadable skills surface the read failure and leave a recoverable reference",
  { timeout: 15000 },
  async (t) => {
    const host = await createHost(t)
    const draft = "Please apply /skill:review to this change."
    await rm(host.skillPath)
    host.ui.setEditorText(draft)
    assert.equal(await host.submit(), draft)
    await delay(30)
    assert.match(stripVTControlCharacters(host.terminal.output), /ENOENT/)

    host.terminal.input("\x1b[A")
    assert.equal(host.ui.getEditorText(), draft)
    await writeFile(host.skillPath, "Recovered skill instructions.\n")
    const retry = await host.submit()
    assert(retry.includes("Recovered skill instructions."), retry)
    assert(retry.includes(draft), retry)
  },
)

test(
  "a leading canonical reference survives the host's subsequent skill step without a second expansion",
  { timeout: 15000 },
  async (t) => {
    const host = await createHost(t)
    const draft = "/skill:review Explain this change."
    host.ui.setEditorText(draft)
    const submitted = await host.submit()
    assert.equal([...submitted.matchAll(/<skill name="review"/g)].length, 1)
    assert(submitted.includes("Review the actual behavior."), submitted)
    assert(submitted.includes(draft), submitted)
  },
)

test(
  "native leading and inline references expand each resource once in first-reference order",
  { timeout: 15000 },
  async (t) => {
    let planDir = ""
    const host = await createHost(t, async (pi, directory) => {
      planDir = join(directory, "skills", "plan")
      await mkdir(planDir, { recursive: true })
      await writeFile(
        join(planDir, "SKILL.md"),
        "---\nname: plan\ndescription: Plan changes\n---\nPlan the smallest change.\n",
      )
      pi.on("resources_discover", () => ({ skillPaths: [planDir] }))
    })
    const draft =
      "/skill:plan Then /skill:review, /skill:plan and /skill:review."
    host.ui.setEditorText(draft)
    assert.equal(
      await host.submit(),
      `<skill name="plan" location="${join(planDir, "SKILL.md")}">\nReferences are relative to ${planDir}.\n\nPlan the smallest change.\n</skill>\n\n` +
        `<skill name="review" location="${host.skillPath}">\nReferences are relative to ${host.skillDir}.\n\nReview the actual behavior.\n</skill>\n\n${draft}`,
    )

    host.terminal.input("\x1b[A")
    assert.equal(host.ui.getEditorText(), draft)
  },
)

test(
  "unknown and unreadable references survive alongside successfully expanded skills",
  { timeout: 15000 },
  async (t) => {
    let planDir = ""
    const host = await createHost(t, async (pi, directory) => {
      planDir = join(directory, "skills", "plan")
      await mkdir(planDir, { recursive: true })
      await writeFile(
        join(planDir, "SKILL.md"),
        "---\nname: plan\ndescription: Plan changes\n---\nPlan the smallest change.\n",
      )
      pi.on("resources_discover", () => ({ skillPaths: [planDir] }))
    })
    await rm(host.skillPath)
    const draft =
      "/skill:review Also /skill:missing, /skill:plan and /skill:review."
    host.ui.setEditorText(draft)
    assert.equal(
      await host.submit(),
      `<skill name="plan" location="${join(planDir, "SKILL.md")}">\nReferences are relative to ${planDir}.\n\nPlan the smallest change.\n</skill>\n\n${draft}`,
    )
    await t.waitFor(() =>
      assert.match(stripVTControlCharacters(host.terminal.output), /ENOENT/),
    )

    host.terminal.input("\x1b[A")
    assert.equal(host.ui.getEditorText(), draft)
  },
)

test(
  "headless native submission reports unreadable skills while retaining successful expansion",
  { timeout: 15000 },
  async (t) => {
    let planPath = ""
    const host = await createHost(
      t,
      async (pi, directory) => {
        const planDir = join(directory, "skills", "plan")
        planPath = join(planDir, "SKILL.md")
        await mkdir(planDir, { recursive: true })
        await writeFile(
          planPath,
          "---\nname: plan\ndescription: Plan changes\n---\nPlan the smallest change.\n",
        )
        pi.on("resources_discover", () => ({ skillPaths: [planDir] }))
      },
      false,
      {},
      false,
    )
    await rm(planPath)
    const errors = t.mock.method(console, "error", () => {})
    const prompt = "/skill:plan Then /skill:review and /skill:plan."
    await host.session.prompt(prompt)
    const message = host.session.messages.findLast(
      (item) => item.role === "user",
    )
    assert.deepEqual(message?.content, [
      {
        type: "text",
        text: `<skill name="review" location="${host.skillPath}">\nReferences are relative to ${host.skillDir}.\n\nReview the actual behavior.\n</skill>\n\n${prompt}`,
      },
    ])
    assert.match(
      errors.mock.calls.map((call) => call.arguments.join(" ")).join("\n"),
      /ENOENT/,
    )
  },
)

test(
  "native catalog aliases deduplicate by resource with the first reference's context",
  { timeout: 15000 },
  async (t) => {
    const host = await createHost(t, undefined, false, {
      skillsOverride: (result) => {
        const review = result.skills.find((skill) => skill.name === "review")
        assert(review)
        return {
          ...result,
          skills: [...result.skills, { ...review, name: "review-alias" }],
        }
      },
    })
    for (const [draft, name] of [
      ["/skill:review-alias Then /skill:review.", "review-alias"],
      ["Apply /skill:review, then /skill:review-alias.", "review"],
    ] as const) {
      host.ui.setEditorText(draft)
      assert.equal(
        await host.submit(),
        `<skill name="${name}" location="${host.skillPath}">\nReferences are relative to ${host.skillDir}.\n\nReview the actual behavior.\n</skill>\n\n${draft}`,
      )
    }
  },
)

test(
  "skill bodies retain canonical references without recursively invoking them",
  { timeout: 15000 },
  async (t) => {
    const host = await createHost(t, async (pi, directory) => {
      const planDir = join(directory, "skills", "plan")
      await mkdir(planDir, { recursive: true })
      await writeFile(
        join(planDir, "SKILL.md"),
        "---\nname: plan\ndescription: Plan changes\n---\nPlan the smallest change.\n",
      )
      pi.on("resources_discover", () => ({ skillPaths: [planDir] }))
    })
    await writeFile(
      host.skillPath,
      "Review without invoking /skill:plan or /skill:review.\n",
    )
    const draft = "Please apply /skill:review and /skill:review."
    host.ui.setEditorText(draft)
    assert.equal(
      await host.submit(),
      `<skill name="review" location="${host.skillPath}">\nReferences are relative to ${host.skillDir}.\n\nReview without invoking /skill:plan or /skill:review.\n</skill>\n\n${draft}`,
    )
  },
)

test(
  "native extension and built-in commands receive their original arguments",
  { timeout: 15000 },
  async (t) => {
    const command = Promise.withResolvers<string>()
    const host = await createHost(t, (pi) => {
      pi.registerCommand("review", {
        handler: async (args, ctx) => {
          ctx.ui.setEditorText(`Command received ${args}`)
          command.resolve(args)
        },
      })
    })
    host.ui.setEditorText("/review /skill:review")
    host.terminal.input("\r")
    assert.equal(await command.promise, "/skill:review")
    assert.equal(host.ui.getEditorText(), "Command received /skill:review")

    host.ui.setEditorText("/name Keep /skill:review")
    host.terminal.input("\r")
    assert.equal(
      host.session.sessionManager.getSessionName(),
      "Keep /skill:review",
    )
    assert.deepEqual(host.inputs, [])
    assert.deepEqual(host.session.messages, [])
  },
)

test(
  "native resource discovery, precedence, and reload determine the effective skill",
  { timeout: 15000 },
  async (t) => {
    let discoveredPath = ""
    const host = await createHost(t, async (pi, directory) => {
      const discoveredDir = join(directory, "discovered", "review")
      discoveredPath = join(discoveredDir, "SKILL.md")
      await mkdir(discoveredDir, { recursive: true })
      await writeFile(
        discoveredPath,
        "---\nname: review\ndescription: Later candidate\n---\nLater candidate instructions.\n",
      )
      pi.on("resources_discover", () => ({ skillPaths: [discoveredDir] }))
    })
    host.ui.setEditorText("Apply /skill:review here.")
    const initial = await host.submit()
    assert(initial.includes("Review the actual behavior."), initial)
    assert(!initial.includes("Later candidate instructions."), initial)

    await writeFile(
      host.skillPath,
      "---\nname: renamed\ndescription: Renamed skill\n---\nReloaded instructions.\n",
    )
    await host.session.reload()
    host.ui.setEditorText("Apply /skill:review here.")
    const discovered = await host.submit()
    assert(discovered.includes("Later candidate instructions."), discovered)
    assert(discovered.includes(`location="${discoveredPath}"`), discovered)

    host.ui.setEditorText("Apply /skill:renamed here.")
    assert((await host.submit()).includes("Reloaded instructions."))
  },
)

test(
  "indented code stays literal when the public session receives its indentation",
  { timeout: 15000 },
  async (t) => {
    const host = await createHost(t)
    const draft = "    /skill:review"
    await host.session.prompt(draft)
    const message = host.session.messages.findLast(
      (item) => item.role === "user",
    )
    assert.deepEqual(message?.content, [{ type: "text", text: draft }])
    assert.deepEqual(host.inputs, [{ text: draft, draft: "" }])
  },
)

for (const route of ["normal", "steer", "followUp"] as const) {
  for (const placement of ["before", "after"] as const) {
    test(
      `native ${route} preserves images and transforms ${placement} skill expansion`,
      { timeout: 15000 },
      async (t) => {
        const deliveries: InputEvent[] = []
        const host = await createHost(
          t,
          (pi) => {
            pi.on("input", (event) => {
              deliveries.push(event)
              if (event.text === "First request") return
              return {
                action: "transform",
                text: `${event.text}\nOther input transformation.`,
                images: [...(event.images ?? []), image],
              }
            })
          },
          route !== "normal",
          placement === "after"
            ? { extensionsOverride: (result) => result }
            : {},
        )
        const draft = "/skill:review Check /skill:review again."
        const expanded = `<skill name="review" location="${host.skillPath}">\nReferences are relative to ${host.skillDir}.\n\nReview the actual behavior.\n</skill>\n\n${draft}`
        const expected = `${expanded}\nOther input transformation.`
        if (route !== "normal") {
          host.ui.setEditorText("First request")
          host.terminal.input("\r")
          await t.waitFor(() => assert.equal(host.pendingResponses.length, 1))
        }

        host.ui.setEditorText(draft)
        if (route === "normal") {
          assert.equal(await host.submit(), expected)
        } else {
          host.terminal.input(route === "steer" ? "\r" : "\x1b\r")
          await t.waitFor(() =>
            assert.deepEqual(
              route === "steer"
                ? host.session.getSteeringMessages()
                : host.session.getFollowUpMessages(),
              [expected],
            ),
          )
          host.reply()
          await t.waitFor(() => assert.equal(host.pendingResponses.length, 1))
          host.reply()
          await host.session.waitForIdle()
        }

        assert.equal(
          deliveries.at(-1)?.text,
          placement === "before" ? draft : expanded,
        )
        assert.equal(deliveries.at(-1)?.source, "interactive")
        assert.equal(
          deliveries.at(-1)?.streamingBehavior,
          route === "normal" ? undefined : route,
        )
        const message = host.session.messages.findLast(
          (item) => item.role === "user",
        )
        assert.deepEqual(message?.content, [
          { type: "text", text: expected },
          image,
        ])
        host.terminal.input("\x1b[A")
        assert.equal(host.ui.getEditorText(), draft)
      },
    )
  }
}

test(
  "public session submissions retain input source, incoming images, and the active draft",
  { timeout: 15000 },
  async (t) => {
    const deliveries: InputEvent[] = []
    const host = await createHost(
      t,
      (pi) => {
        pi.on("input", (event) => {
          deliveries.push(event)
        })
      },
      false,
      { extensionsOverride: (result) => result },
    )
    const activeDraft = "Keep this unsent draft /skill:review."
    const prompt = "/skill:review Apply /skill:review again."
    const expected = `<skill name="review" location="${host.skillPath}">\nReferences are relative to ${host.skillDir}.\n\nReview the actual behavior.\n</skill>\n\n${prompt}`
    host.ui.setEditorText(activeDraft)
    for (const source of ["rpc", "extension"] as const) {
      if (source === "rpc") {
        await host.session.prompt(prompt, { source, images: [image] })
      } else {
        await host.session.sendUserMessage([
          { type: "text", text: prompt },
          image,
        ])
      }
      await host.session.waitForIdle()
      assert.equal(deliveries.at(-1)?.text, expected)
      assert.equal(deliveries.at(-1)?.source, source)
      assert.deepEqual(deliveries.at(-1)?.images, [image])
      const message = host.session.messages.findLast(
        (item) => item.role === "user",
      )
      assert.deepEqual(message?.content, [
        { type: "text", text: expected },
        image,
      ])
      assert.equal(host.ui.getEditorText(), activeDraft)
    }
  },
)
