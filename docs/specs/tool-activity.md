# Tool activity

**Status:** ready-for-agent — command recognition, operator configuration, pending-call presentation, and verbatim core tool guidance; integration base `a6280f9` on `codex/generic-tool-activity`.

**Tracker:** [06: Configurable Codex command recognition](../../.scratch/tool-activity/issues/06-configurable-command-recognition.md), [07: Pending calls without premature activities](../../.scratch/tool-activity/issues/07-pending-call-activities.md), and [08: Verbatim core tool guidance](../../.scratch/tool-activity/issues/08-verbatim-core-tool-guidance.md) → [09: Verify the activity alignment](../../.scratch/tool-activity/issues/09-verify-activity-alignment.md). Tickets 01–05 retain their completed revision evidence.

## Problem Statement

Routine Output activities have been removed, but common file reads still appear as long shell commands, and an unfinished call can briefly appear as `Called exec (status unknown)`. The existing recognizer covers only a small subset of Codex's command behavior. Recognition and wording are scattered, making operator changes difficult. The toolset also adds local explanatory text to its captured tool guidance, despite the required word-for-word tool interface.

## Solution

Show operations in the activity list and their results inside their bodies. Returning or forwarding text does not create another activity. Keep raw execution results discoverable through source Find. Present a failed operation once, with any additional call failure context in its body; a script failure without a failed operation gets its own failure item. Registered skill-file reads use a `Read <name> skill` label through any supported read path.

The two existing extensions implement the same documented data format over Pi's existing events, result details, and retained custom entries. Neither imports the other, recognizes the other's package identity, or requires a separate contract package. The supplied screenshots define the correction's visible cases. Earlier installed-app source inspection supports continuing command identity and multiple action labels; it does not establish full visual parity for every error or image case.

Match the complete pinned Codex command-recognition behavior, including its general-command fallbacks. Recognized reads, searches, and listings receive clear action labels; actual scripts and tests retain `Running`/`Ran`. Put operator-adjustable recognition and activity wording in one module in the existing chat package. Keep pending calls out of operation activity until execution begins, and preserve failures and unknown historical outcomes. Core tool guidance is verbatim from the scoped frozen reference, with no additional read-style or batching advice.

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
11. As a user, I want a failure before any child operation to remain visible even without an error message, so that a broken script is diagnosable.
12. As a user, I want successful children to stay successful after their script fails, so that status describes actual work.
13. As a user, I want a registered skill read labeled `Read <name> skill`, so that I can identify the loaded instructions.
14. As a user, I want skill labels through native reads and declared command operations, so that the tool implementation does not determine the label.
15. As a user, I want a header followed by a literal file read recognized, so that formatting commands do not obscure skill use.
16. As a user, I want several reads and other commands to retain their actions, so that one skill label does not conceal mixed work.
17. As a user, I want uncertain shell syntax and unknown skill paths described conservatively, so that the chat does not invent actions.
18. As a user, I want labels and reliable late outcomes to survive reload and forks, so that history remains useful.
19. As a user, I want invalid metadata to preserve authoritative processed output, so that result hooks and older providers remain supported.
20. As a provider author, I want to publish generic activity without installing a display or contract package, so that my extension remains independent.
21. As a chat maintainer, I want to accept an unrelated provider's valid facts without tool-name rules, so that the interface remains generic.
22. As a user, I want native output controls and single-owner images preserved, so that the correction does not replace Pi's presentation controls.
23. As a user, I want every command form covered by the pinned Codex parser recognized the same way, so that parity includes fallback and edge cases as well as common reads.
24. As a user, I want line-range reads and read pipelines labeled by file, so that shell formatting does not obscure the work.
25. As a user, I want search labels to retain the query and available location, so that I can understand their scope.
26. As a user, I want shortened display names to retain their real file identity, so that skill recognition and source inspection remain correct after directory changes.
27. As an operator, I want command recognition and all activity wording in one readable configuration module, so that I can make presentation changes without searching the rendering implementation.
28. As an operator, I want reference defaults and explicit customizations, so that changing a label or command alias does not change execution or model guidance.
29. As a user, I want pending calls distinguished from unknown outcomes, so that a still-arriving call does not look completed or broken.
30. As a user, I want errors, cancellation, and unobserved historical calls retained, so that removing a transient placeholder cannot conceal a real outcome.
31. As a user, I want the exact scoped core tool guidance, so that local prompt additions do not change how the model uses the toolset.
32. As a maintainer, I want the pinned reference's complete command cases and actual model-facing declarations checked, so that later edits cannot silently narrow coverage or change wording.

## Implementation Decisions

- **Package ownership.** Remove the separate activity package, imports, dependencies, and release entry. Keep provider construction and consumer validation local. A small overlap in types, protocol identifiers, and binding rules is the explicit cost of independent implementations. Do not replace the package with a repository-root runtime import, generated shared module, or bundling system.
- **Data format.** Preserve version 1, source ID, originating call/session identity, revisions, ordered operation facts, result binding, and native image ownership. The protocol remains documented below. Neither side uses the other extension's implementation or private records.
- **Operations and results.** Normal script text is retained in execution results, not published as new work. The consumer also suppresses ordinary text-only output facts in older valid records. This rule does not depend on string matching, object identity, parsing script source, or how the model forwards results.
- **Failures.** Failed operation facts remain independent. When a call also has execution error facts, their text appears as explicitly identified call context in an existing failed activity body. With no failed operation, keep a separate failure item even if the error message is empty. This groups presentation without changing source ownership, removing distinct errors, or changing successful child status.
- **Images.** Image bytes remain in the actual processed collecting result and appear once through native handling. An image with no operation owner gets an image activity, not a generic Output receipt.
- **Skill identity.** Use the effective public skill registry and resolved file path. Share recognition across native reads and classified command reads, including retained source. Do not infer skill use from returned Markdown, a filename alone, or the name of the calling tool.
- **Native provenance.** Persist observed built-in identity and working directory through private, non-model custom entries tied to the original assistant entry/content index, call identity, and argument binding. Restore only matching facts on the active branch. This preserves native skill labels after reload without guessing from the currently installed tool registry or copying results. Unobserved history keeps generic fallback.
- **Command recognition.** Port the full behavior of the referenced Codex parser at commit `2c6995ca4dfc23b93db311b59c1b4ead464658b1`, using the same Bash grammar and accepted syntax. Preserve action ordering, deduplication, shell-wrapper handling, formatting-helper rules, option handling, path handling, and exact fallback semantics. Recognition must never evaluate the shell. Preserve full raw commands in source and bodies. Defaults also retain reference limitations, including general-command fallback for a multi-file `cat`; independent read commands can produce separate actions. No claim is made about uninspected later Codex revisions.
- **Operator configuration.** One source module in the existing chat package exports all activity presentation options: command recognizer mappings, formatting-helper names, display-path shortening, item wording, group wording/order, and operation-body headings. Provide readable names and brief editing instructions. Parser syntax/lifecycle algorithms and data validation remain implementation. Changes take effect on reload; do not add persistent preference files, menus, runtime override layers, new packages, or a repository-wide settings system. Pi remains the source for its native settings.
- **Pending calls.** Track whether a live call has begun execution separately from its operation outcome. While arguments arrive, no generic fallback row or group count is produced. Execution, result delivery, or interruption resolves the pending state. Unrecognized dispatched tools retain normal generic presentation; cancelled or failed calls and unknown historical outcomes remain visible. The rule is generic and cannot name `exec` or its provider.
- **Core guidance.** The complete selected tool declaration and retained helper wording match the frozen scoped reference exactly. Remove local lifecycle/image/notification prose and the rewritten notification description. When native selection excludes a tool, remove only that tool's section and directly dependent helper text. Preserve the already approved scope, input forms, permissions, runtime behavior, and unrelated extensions. Do not change system prompts or add instructions encouraging simpler reads or scripts.
- **Source Find.** Keep original arguments and all processed result text searchable even when operation bodies also exist. Selected raw source can temporarily use the existing native generic presenter. Remove that reveal when selection leaves or Find closes, without disturbing normal operation choices or adding execution. Images remain with their normal activity owner during text inspection.
- **Result authority and history.** Keep content/activity bindings, active-branch revision reconciliation, original session identity after forks, unknown stale-running status, omission markers, and generic fallback. Missing or invalid processed metadata cannot restore old live or journal bodies. Preserve compact retained updates and native model collection.
- **Scope.** Keep existing execution, errors returned to scripts, declaration schemas, permissions, cancellation, and model-facing result content. Only the specified tool-guidance correction changes the agent interface. Do not alter JavaScript values to recover lost string provenance or change skill invocation itself.

## Testing Decisions

Use the established real-Pi native-host and combined-workflow seam. It observes activity rows and native bodies alongside retained entries, original calls, and subsequent model requests. Add a failing case for forwarded strings/combined results, implement that slice, then cover raw source Find and failure grouping. Add the skill-read case through the same seam, including a formatting header, several reads, an unrelated command, registered and unregistered paths, and conservative syntax fallback. Reuse continuation, hooks, image settings, load-order, reload, compaction, and fork coverage.

For this delta, retain the existing host seam and add independently sourced input/output cases at the command-recognition boundary. Capture every command case exercised by the unmodified reference tests; record source revision, hashes, dependency versions, and case count. Compare complete parsed actions, not only display labels. Verify operator changes through the same recognition/presentation path. Pause the controlled provider while tool arguments are arriving, then observe dispatch, completion, interruption, and replay. At the existing model-request seam, compare complete selected core declarations byte-for-byte in their description fields. These are the scoped validation seams for the explicitly requested exact coverage; no new live-model prompt experiment is needed.

An unrelated test provider constructs the documented data independently; it must not import the consumer's builder or a shared package. Existing standalone provider checks verify useful facts without chat loaded. Run the affected package suites and repository static checks, plus the established Pi 1.1.0 compatibility suite. Record actual revision/counts and distinguish deterministic recording-terminal evidence from physical app acceptance. Review standards and the spec separately. No new test harness or broad live-model trial is needed for unchanged execution contracts.

## Out of Scope

A separate package, new tools, changes to execution behavior or declaration schemas, a shell interpreter, settings UI or persistence, a repository-wide configuration framework, new output viewers, display-driven polling, extra model calls, automatic notifications, old-history migration, producer-specific chat rules, ChatGPT.app/Codex system and other prompts, additional model guidance, and claims of complete app visual parity.

## Further Notes

The command reference is the parser linked in the user's annotation: [Codex at the pinned revision](https://github.com/openai/codex/blob/2c6995ca4dfc23b93db311b59c1b4ead464658b1/codex-rs/core/src/parse_command.rs), with its Bash helper and grammar. It is distinct from the frozen tool-interface capture and the installed-app presentation evidence. Apache-2.0 attribution accompanies the port. The integration base and existing host/contract seams are already established; the user's explicit direction to implement the agreed delta authorizes the three independent slices and their integration verification.

The correction passes all 343 affected-package checks on Pi 1.0.2 and all 134 chat/combined-workflow checks on Pi 1.1.0 at `789b142`. Typechecking passes on both versions. [Ticket 05](../../.scratch/tool-activity/issues/05-skill-reads-across-tools.md) records commands, logs, direct standards/spec review, repaired failures, and unperformed physical-app and live-model checks. The final documentation commit does not change runtime code or tests.

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
