import assert from "node:assert/strict";
import test from "node:test";
import {
  readActivity,
  readActivityUpdate,
  type ActivityUpdate,
} from "../src/tool-adapters/activity-contract.ts";
import { activityDetails } from "../../../fixtures/activity.ts";

const update: ActivityUpdate = {
  version: 1,
  id: "operation-source",
  callId: "arbitrary-call",
  sessionId: "session",
  revision: 2,
  operations: [
    {
      id: "command",
      order: 0,
      revision: 2,
      kind: "command",
      commands: ["printf hello"],
      status: "completed",
      output: "hello",
    },
  ],
};

test("activity binds semantic facts to processed content without binding image bytes", () => {
  const content = [
    { type: "text" as const, text: "transport result" },
    { type: "image" as const, data: "original", mimeType: "image/png" },
  ];
  const details = activityDetails(update, content, ["command"]);
  assert.deepEqual(readActivity({ content, details })?.update, update);
  assert.ok(
    readActivity({
      content: [
        content[0]!,
        {
          ...content[1]!,
          type: "image",
          data: "converted",
          mimeType: "image/jpeg",
        },
        {
          type: "text",
          text: "[Image converted from image/png to image/jpeg.]",
        },
      ],
      details,
    }),
  );
  assert.equal(readActivity({ content: [{ type: "text", text: "redacted" }], details }), undefined);
  const changed = structuredClone(details);
  changed.activity.update.operations[0]!.output = "forged body";
  assert.equal(readActivity({ content, details: changed }), undefined);
});

test("explicit empty activity is valid while missing, unsupported and malformed facts are absent", () => {
  const content = [{ type: "text" as const, text: "collected" }];
  const empty = { ...update, operations: [] };
  assert.deepEqual(
    readActivity({ content, details: activityDetails(empty, content) })?.update.operations,
    [],
  );
  assert.equal(readActivity({ content }), undefined);
  for (const invalid of [
    { ...update, version: 2 },
    { ...update, revision: -1 },
    { ...update, operations: [update.operations[0], update.operations[0]] },
    {
      ...update,
      operations: [{ ...update.operations[0], kind: "private-tool" }],
    },
    {
      ...update,
      operations: [{ ...update.operations[0], commands: undefined }],
    },
    { ...update, operations: [{ ...update.operations[0], revision: 3 }] },
    ...[[], [""], ["bash", 1]].map((shell) =>
      Object.assign({}, update, {
        operations: [{ ...update.operations[0], shell }],
      }),
    ),
  ])
    assert.equal(readActivityUpdate(invalid), undefined);
  assert.equal(readActivityUpdate(update), update);
});
