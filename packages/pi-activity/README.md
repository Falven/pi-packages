# pi-activity

Optional operation facts for Pi tool providers and consumers. This is a data library, not a Pi extension. It has no UI or dependency on a particular provider or chat.

A **tool call** is a model request. An **operation** is the work it starts. A call may start several operations or only collect existing output. Consumers can therefore display zero or several activity items for one call.

## Contract

`ActivityUpdate` has version `1`, a producer-issued stable `id`, originating `callId` and `sessionId`, a nonnegative `revision`, and ordered `operations`. The update ID distinguishes separate invocations even if a provider reuses a call ID. All updates for that ID must keep the same call/session ownership.

An operation has a stable ID, order, revision, and status (`running`, `completed`, `failed`, `unknown`, or `unattempted`). Its semantic kind supplies these facts:

| Kind      | Facts                                                                                                                                   |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `command` | Ordered `commands`: the initial command followed by meaningful terminal submissions. Progress and output belong to the same operation.  |
| `edit`    | Optional target `path` or ordered `files`, each with its own ID, path, outcome, output, and optional verified addition/deletion counts. |
| `image`   | Optional source `path`. Image bytes stay in the collecting native result.                                                               |
| `tool`    | Effective `name` and optional `args`, for work without more specific semantics.                                                         |
| `output`  | Independently owned output or error. Empty content need not create a visible item.                                                      |

All kinds can include `cwd`, applicable `args`, bounded `output`, and `outputOmitted`. Omission removes detail, not an operation's identity or known outcome. File records follow the same rule. An operation's revision cannot exceed the containing update's revision.

## Publish and consume

Use Pi's existing transports. Publish live incremental updates on `activityType`; retain equivalent updates in a custom entry's `data.activity`. Register that entry type with an invisible renderer. Each update contains complete replacement facts for its changed operations, not the entire growing execution. Consumers reconcile each operation by revision, scoped to the update ID and originating call/session. Submitted actions and file IDs remain stable; append actions instead of renumbering them.

Bind a complete snapshot to a returned result with `activityDetails(update, content, imageOwners?)`. Spread the returned object into the tool's `details`. Each `imageOwners` element names an operation in that snapshot or is `null` for an image belonging only to the collecting result. The array matches native image-part order and defaults to `null` for every image. Do not put image bytes in metadata.

```ts
import { activityDetails, activityType, type ActivityUpdate } from "pi-activity"

const update: ActivityUpdate = {
  version: 1,
  id: "unique-work-id",
  callId,
  sessionId: ctx.sessionManager.getSessionId(),
  revision: 1,
  operations: [
    {
      id: "command-1",
      order: 0,
      revision: 1,
      kind: "command",
      commands: ["printf hello"],
      status: "completed",
      output: "hello",
    },
  ],
}
pi.events.emit(activityType, update)
pi.appendEntry(activityType, { activity: update })
return { content, details: activityDetails(update, content) }
```

Consumers use `readActivityUpdate` for events/entries and `readActivity` for processed results. Result validation binds both content shape/text and activity facts. These hashes detect inconsistent transformations; they are not authentication. Image bytes and Pi's known conversion/resize hints may change during native processing, so the processed result remains the only image source. Invalid or removed metadata must not revive old bodies from events or history.

A valid snapshot with `operations: []` explicitly means no new operation, such as a successful poll. Absent, unsupported, or invalid metadata means ordinary generic tool presentation. An unowned native image still belongs to its collecting result. Old running records without a live observation should be shown as unknown; replay must never restart work.

Forked history keeps the originating session identity in its result metadata. Match updates against that identity, not the new session's ID. A complete result snapshot supersedes older updates; later operation revisions can still extend work after the call returns.

See the [specification](../../docs/specs/pi-activity.md) and [architecture decision](../../docs/adr/0019-tool-renderers-own-tool-presentation.md).
