# Tool activity

**Status:** ready-for-agent — correction from `4ad78cc` on `codex/generic-tool-activity`.

**Tracker:** [04: Action results without a separate package](../../.scratch/tool-activity/issues/04-action-results-without-a-package.md) → [05: Skill reads across tools](../../.scratch/tool-activity/issues/05-skill-reads-across-tools.md). Earlier tickets 01–03 retain their original evidence.

## Problem Statement

The chat still inserts unexplained Output activities between actual commands. A command returns text, the script forwards that text, and the display treats the script's result as more work. Reading a skill through a shell command also shows a raw command and Output instead of a readable skill label. The previous change introduced a separate package even though the user requested only a generic interface between independently usable extensions.

## Solution

Show operations in the activity list and their results inside their bodies. Returning or forwarding text does not create another activity. Keep raw execution results discoverable through source Find. Present a failed operation once, with any additional call failure context in its body; a script failure without a failed operation gets its own failure item. Registered skill-file reads use a Read <name> skill label through any supported read path.

The two existing extensions implement the same documented data format over Pi's existing events, result details, and retained custom entries. Neither imports the other, recognizes the other's package identity, or requires a separate contract package. The supplied screenshots define the correction's visible cases. Earlier installed-app source inspection supports continuing command identity and multiple action labels; it does not establish full visual parity for every error or image case.

## User Stories

1. As a user, I want the activity list to identify work, so that returned text does not look like another action.
2. As a user, I want command output inside its command activity, so that I can understand what produced it.
3. As a user, I want forwarding a whole result or its text to produce the same activity, so that model coding style does not change the display.
4. As a user, I want combined command results to add no Output activity, so that parallel work stays readable.
5. As a user, I want literal script text retained without a routine activity row, so that inspection remains possible without clutter.
6. As a user, I want Find to reveal raw processed results for both text-only and mixed calls, so that omitting a result row does not discard information.
7. As a user, I want leaving a source hit to remove only its temporary reveal, so that operation disclosure choices remain intact.
8. As a user, I want source inspection to avoid execution and model requests, so that navigating history has no tool effects.
9. As a user, I want each failed operation represented once, so that the parent error does not look like another failed action.
10. As a user, I want additional execution errors retained as call context, so that a distinct failure is not discarded or falsely attributed to a child.
11. As a user, I want a failure before any child operation to remain visible, so that a broken script is diagnosable.
12. As a user, I want successful children to stay successful after their script fails, so that status describes actual work.
13. As a user, I want a registered skill read labeled Read <name> skill, so that I can identify the loaded instructions.
14. As a user, I want skill labels through native reads and declared command operations, so that the tool implementation does not determine the label.
15. As a user, I want a header followed by a literal file read recognized, so that formatting commands do not obscure skill use.
16. As a user, I want several reads and other commands to retain their actions, so that one skill label does not conceal mixed work.
17. As a user, I want uncertain shell syntax and unknown skill paths described conservatively, so that the chat does not invent actions.
18. As a user, I want labels and reliable late outcomes to survive reload and forks, so that history remains useful.
19. As a user, I want invalid metadata to preserve authoritative processed output, so that result hooks and older providers remain supported.
20. As a provider author, I want to publish generic activity without installing a display or contract package, so that my extension remains independent.
21. As a chat maintainer, I want to accept an unrelated provider's valid facts without tool-name rules, so that the interface remains generic.
22. As a user, I want native output controls and single-owner images preserved, so that the correction does not replace Pi's presentation controls.

## Implementation Decisions

- **Package ownership.** Remove the separate activity package, imports, dependencies, and release entry. Keep provider construction and consumer validation local. A small overlap in types, protocol identifiers, and binding rules is the explicit cost of independent implementations. Do not replace the package with a repository-root runtime import, generated shared module, or bundling system.
- **Data format.** Preserve version 1, source ID, originating call/session identity, revisions, ordered operation facts, result binding, and native image ownership. The protocol remains documented below. Neither side uses the other extension's implementation or private records.
- **Operations and results.** Normal script text is retained in execution results, not published as new work. The consumer also suppresses ordinary text-only output facts in older valid records. This rule does not depend on string matching, object identity, parsing script source, or how the model forwards results.
- **Failures.** Failed operation facts remain independent. When a call also has execution error facts, their text appears as explicitly identified call context in an existing failed activity body. With no failed operation, keep a separate failure item. This groups presentation without changing source ownership, removing distinct errors, or changing successful child status.
- **Images.** Image bytes remain in the actual processed collecting result and appear once through native handling. An image with no operation owner gets an image activity, not a generic Output receipt.
- **Skill identity.** Use the effective public skill registry and resolved file path. Share recognition across native reads and classified command reads, including retained source. Do not infer skill use from returned Markdown, a filename alone, or the name of the calling tool.
- **Command classification.** Recognize bounded literal command sequences and quoted file paths. Preserve other actions, ordering, full command source, and the shared process outcome/output. A formatting-only header can be omitted when introducing recognized reads. Conditional execution, substitutions, redirection, pipelines, and uncertain shell grammar retain the full command summary; do not add a general shell interpreter.
- **Source Find.** Keep original arguments and all processed result text searchable even when operation bodies also exist. Selected raw source can temporarily use the existing native generic presenter. Remove that reveal when selection leaves or Find closes, without disturbing normal operation choices or adding execution. Images remain with their normal activity owner during text inspection.
- **Result authority and history.** Keep content/activity bindings, active-branch revision reconciliation, original session identity after forks, unknown stale-running status, omission markers, and generic fallback. Missing or invalid processed metadata cannot restore old live or journal bodies. Preserve compact retained updates and native model collection.
- **Scope.** Keep existing execution, errors returned to scripts, declarations, permissions, cancellation, and model-facing result content. Do not alter JavaScript values to recover lost string provenance or change skill invocation itself.

## Testing Decisions

Use the established real-Pi native-host and combined-workflow seam. It observes activity rows and native bodies alongside retained entries, original calls, and subsequent model requests. Add a failing case for forwarded strings/combined results, implement that slice, then cover raw source Find and failure grouping. Add the skill-read case through the same seam, including a formatting header, several reads, an unrelated command, registered and unregistered paths, and conservative syntax fallback. Reuse continuation, hooks, image settings, load-order, reload, compaction, and fork coverage.

An unrelated test provider constructs the documented data independently; it must not import the consumer's builder or a shared package. Existing standalone provider checks verify useful facts without chat loaded. Run the affected package suites and repository static checks, plus the established Pi 1.1.0 compatibility suite. Record actual revision/counts and distinguish deterministic recording-terminal evidence from physical app acceptance. Review standards and the spec separately. No new test harness or broad live-model trial is needed for unchanged execution contracts.

## Out of Scope

A separate package, new tools, public execution-contract changes, a shell interpreter, display settings, new output viewers, display-driven polling, extra model calls, automatic notifications, old-history migration, producer-specific chat rules, and claims of complete app visual parity.

## Further Notes

The wire agreement remains `pi.activity`. Live events carry incremental updates; retained custom entries carry the same updates in `data.activity`. Returned `details.activity` carries a complete snapshot, image ownership, and bindings. Each incremental operation is a complete replacement of that operation's facts; a full result snapshot supersedes older observations, while later revisions can continue it.

An update has version 1, a stable source ID, originating call ID and session ID, a nonnegative safe revision, and ordered operations. An operation has stable ID, order, revision, status, applicable inputs, bounded output, and optional omission state. Kinds describe a command and its submitted actions, file edits with individual outcomes/counts, an image path, an otherwise generic tool, or execution error/output facts retained from earlier history. An operation revision cannot exceed its update revision. Unknown kinds or versions fall back to generic presentation.

Result bindings use SHA-256 over the existing JSON representations of content and the update/image-owner pair. They detect inconsistent transformations, not authenticity. Image ownership is an ordered array of operation IDs or null, matching the native image parts. Image bytes and Pi's recognized conversion/resize hints may change during native processing; actual processed content is the only image source. No image bytes belong in metadata. A valid empty operation snapshot deliberately creates no normal activity; missing or invalid metadata does not.

This corrects the separate-package and nonempty-script-result decisions in the previous revision. Its 335 Pi 1.0.2 and 126 Pi 1.1.0 passing checks did not establish the newly supplied screenshot cases. [ADR 0019](../adr/0019-tool-renderers-own-tool-presentation.md), [ADR 0024](../adr/0024-core-tools-use-native-extension-lifecycle.md), and [ADR 0016](../adr/0016-search-retained-transcript-content.md) govern the revised ownership, display, and source navigation. The [reference plan](../plans/core-tool-activity-alignment.md), [chat specification](pi-chat.md), and [toolset specification](../../.scratch/core-tools/spec.md) retain the broader context.

The following TypeScript describes the wire data, not an importable package:

```ts
type Status = "running" | "completed" | "failed" | "unknown" | "unattempted"
type Body = {
  args?: Record<string, unknown>
  output?: string
  outputOmitted?: boolean
}
type File = Body & {
  id: string
  path: string
  status: Status
  changes?: { added: number; removed: number }
}
type Operation = Body & {
  id: string
  order: number
  revision: number
  status: Status
  cwd?: string
} & (
    | { kind: "command"; commands: string[] }
    | { kind: "edit"; path?: string; files?: File[] }
    | { kind: "image"; path?: string }
    | { kind: "tool"; name: string }
    | { kind: "output" } // Version 1 retains this kind for execution errors and old results.
  )
type Update = {
  version: 1
  id: string
  callId: string
  sessionId: string
  revision: number
  operations: Operation[]
}
type Details = {
  activity: {
    update: Update
    imageOwners: (string | null)[]
    contentHash: string
    activityHash: string
  }
}
```

IDs, file paths, and generic tool names are nonempty strings. Operation IDs are unique within an update; file IDs are unique within their operation. Orders, revisions, and change counts are nonnegative safe integers; a command has at least one command string. Every non-null image owner identifies an operation in the snapshot. `outputOmitted` describes retained body limits without deleting the operation or changing its outcome. For version 1, `kind: "output"` with failed status carries execution error facts; other text-only output facts have no normal row.

Compute `activityHash` as SHA-256 of UTF-8 `JSON.stringify({ update, imageOwners })`, keeping that property order and the supplied facts' JSON property order. Compute `contentHash` the same way over the content array after replacing every image part with `{ type: "image" }`, leaving text parts unchanged. The consumer also accepts Pi's appended image-conversion and resize hints immediately after an image: `[Image converted from <mime> to <mime>.]` and `[Image: original <width>x<height>, displayed at <width>x<height>. Multiply coordinates by <decimal> to map to original image.]`, separately or together as one text part. Other text is never excluded. These bindings detect inconsistent transformations; they do not authenticate a provider. A result hook that removes or changes the facts or content must supply consistent new bindings or accept the generic fallback.
