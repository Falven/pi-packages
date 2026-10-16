import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { activityConfig } from "../src/config.ts"
import { GroupSummaries } from "../src/group-summaries.ts"
import { itemSummary } from "../src/item-summary.ts"
import { describeCommands, parseCommand } from "../src/tool-adapters/command.ts"
import type { ActivityItem } from "../src/tool-adapters/types.ts"

const reference = JSON.parse(
  readFileSync(
    new URL("./fixtures/codex-command-cases.json", import.meta.url),
    "utf8",
  ),
) as { cases: { input: string[]; expected: unknown; sources: string[] }[] }

test("command recognition matches the pinned Codex reference", () => {
  for (const { input, expected, sources } of reference.cases)
    assert.deepEqual(
      parseCommand(input),
      expected,
      `${sources.join(", ")}: ${JSON.stringify(input)}`,
    )
})

test("one configuration controls recognition and activity wording", (t) => {
  const defaults = structuredClone(activityConfig)
  t.after(() => Object.assign(activityConfig, defaults))
  assert.equal(describeCommands("inspect docs/guide.md")[0]?.kind, "command")
  activityConfig.commands.names["inspect"] = "cat"
  activityConfig.labels.read.completed = "Inspected"
  activityConfig.groups.read.completed = {
    singular: "inspected a file",
    plural: "inspected files",
  }
  const item: ActivityItem = {
    ...describeCommands("inspect docs/guide.md")[0]!,
    id: "configured",
    status: "completed",
    body: {
      name: "bash",
      args: { command: "inspect docs/guide.md" },
      cwd: "/workspace",
      result: undefined,
    },
  }
  assert.equal(item.targetKey, "docs/guide.md")
  assert.equal(itemSummary(item, false), "Inspected guide.md")
  assert.equal(
    new GroupSummaries().summary({ items: [{ activityItem: item }] }),
    "Inspected a file",
  )
  delete activityConfig.commands.names["cat"]
  assert.equal(describeCommands("cat docs/guide.md")[0]?.kind, "command")
  activityConfig.commands.omitPathComponents.push("generated")
  assert.equal(describeCommands("ls project/generated")[0]?.target, "project")
  activityConfig.commands.formatting.push("banner")
  assert.equal(
    describeCommands("banner heading; inspect docs/guide.md").length,
    1,
  )
})
