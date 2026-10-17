# Singleton eligibility reference facts

Inspected 2026-10-16 for the singleton-unwrapping task. This is source verification, not live interaction verification.

## Pin and provenance

- Installed archive: `/Applications/ChatGPT.app/Contents/Resources/app.asar`.
- Installed Info.plist: bundle identifier `com.openai.codex`, short version `26.1013.31256`, build `20586`.
- These exactly match `/tmp/pi-chat-codex-ux-20261016/manifest.json`. No parity-target change is necessary.
- The manifest records repository revision `c25614c` for the earlier comparison; the implementing task baseline is independently `cbf6ffac013f10b6b2a227804d076a4556bd248d`. Do not confuse the comparison revision with an implementation base.
- Both relevant formatted extracts match the manifest SHA-256 values. Their original archive payloads were independently read from the installed ASAR and also match the manifest original hashes.

| Asset                                      | Original archive SHA-256                                           | Formatted extract SHA-256                                          |
| ------------------------------------------ | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `sites-end-resource-1b9f3ba94deb.js`       | `a3955c507c2bba1d3c1957b24abd9e55388f733ff6e3cd613afa3cbe4a441b4c` | `04fce56bf10f81e0acff4e297b878a2a76ff8e4f191e17a87a0a518116c948c8` |
| `inline-followup-markdown-abadf756a078.js` | `6cbfc3f82e694c38066e248cea3c31ee85ae2b1e54c601edfb4d0ad78a6438ac` | `34e92a2532367c76c3b1a7c63d98b7a54583aada0b053749d370c456d8d58d1c` |

## Complete eligibility

Every row below must pass. Caller guards are part of the rule, not merely optional considerations.

| Guard                        | Required fact                                                                          | Evidence                                                 |
| ---------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Presentation unit            | A group; existing standalone units bypass conversion unchanged                         | Caller lines 20796–20799                                 |
| Preservation override        | `preserveSingleItemGroups` is false or omitted                                         | Caller lines 20707, 20741, 20798                         |
| Completed-status header      | Not simultaneously the latest projected unit and supplied a non-null `completedHeader` | Caller lines 20706, 20797–20799                          |
| Header state                 | `summary`                                                                              | Singleton helper lines 1051–1054                         |
| Cardinality                  | Exactly one activity item in the logical group                                         | Singleton helper lines 1052–1054                         |
| Lifecycle                    | Item-specific in-progress predicate is false                                           | Singleton helper line 1055 and predicate lines 1095–1128 |
| Original patch file count    | A patch has exactly one own changes key                                                | Singleton helper lines 1056–1057                         |
| Patch visualization activity | A patch has no visualization activities, with missing/null treated as zero             | Singleton helper lines 1056–1058                         |

Caller: [projection and bypass guards](/tmp/pi-chat-codex-ux-20261016/sites-end-resource-1b9f3ba94deb.js:20793).
Helper: [singleton predicate](/tmp/pi-chat-codex-ux-20261016/inline-followup-markdown-abadf756a078.js:1051).

The caller first optionally transforms/combines units, then computes `isLatestVisibleUnit` using the last index of that projected sequence (`m`). This has no relationship to a terminal or browser viewport. The result keeps the original group key and the same activity item object:

```js
{ kind: `standalone`, key: e.key, item: n }
```

The caller bypass expression is:

```js
e.kind === `standalone` || z || (n && a != null);
```

Here `z` is the preservation override, `n` is whether this is the last projected unit, and `a` is the supplied completed header. A helper-only port omits the latter two exceptions.

## Header lifecycle

[Effective progress selection](/tmp/pi-chat-codex-ux-20261016/sites-end-resource-1b9f3ba94deb.js:20741) uses the supplied header-progress flag when present; otherwise it uses turn progress:

```js
B = m === void 0 ? p : m;
```

The caller supplies that effective value as the state helper's `isTurnInProgress` argument. [Summary selection](/tmp/pi-chat-codex-ux-20261016/inline-followup-markdown-abadf756a078.js:1062) is exactly:

```js
if (!(isLatestVisibleUnit && effectiveHeaderInProgress && !isActivitySliceClosed))
  return { kind: `summary` };
```

The latest open group remains active or thinking while effective header progress remains true, even after its sole operation finishes. An older group can already use summary state while later work continues. Closing the activity slice allows summary state without waiting for the whole turn to finish. An older group whose item is still running still fails the separate item lifecycle guard.

When the summary guard does not pass, the helper may select an exploration item, select the last running item, or return `thinking`. Automatic approval review in progress selects `thinking`. Those details change which non-summary state exists; they do not allow unwrapping.

## Item-specific progress semantics

The singleton predicate invokes [Q](/tmp/pi-chat-codex-ux-20261016/inline-followup-markdown-abadf756a078.js:1095), not just the generic [K predicate](/tmp/pi-chat-codex-ux-20261016/inline-followup-markdown-abadf756a078.js:623). Q has an execution interruption exception absent from K.

| Reference item                                                                                                                                                                                                                         | In progress when                                                                   |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Execution                                                                                                                                                                                                                              | Execution status is not `interrupted` **and** parsed command `isFinished` is false |
| Patch                                                                                                                                                                                                                                  | `success == null` (null or undefined)                                              |
| Dynamic tool call                                                                                                                                                                                                                      | Completion flag is false/missing                                                   |
| MCP tool call                                                                                                                                                                                                                          | Completion flag is false/missing                                                   |
| Web search                                                                                                                                                                                                                             | Completion flag is false/missing                                                   |
| Automatic approval review                                                                                                                                                                                                              | Status is `inProgress`                                                             |
| Context compaction, multi-agent action (delegated)                                                                                                                                                                                     | Status is `inProgress`                                                             |
| DIL reasoning, assistant message (delegated)                                                                                                                                                                                           | Completion flag is false/missing                                                   |
| MCP server elicitation, user-input response (delegated)                                                                                                                                                                                | Completion flag is false/missing                                                   |
| Auto-review interruption warning, external event, generated image, image view, realtime transcript, stream error, strict review notice, subagent activity, system error, user message, worked-for, worktree initialization (delegated) | Never in progress                                                                  |

The delegated generic helper covers additional types outside Q's supported singleton switch; that does not expand the singleton helper's accepted types.

Consequences:

- A failed patch (`success: false`) is finished. Success is not required.
- An interrupted execution is inactive even if its parsed-command finished flag remains false.
- An error or failure label alone does not establish the underlying completion fact for every type.
- A group containing zero or multiple activity items stays grouped.
- The patch test examines the original patch object's changes keys. A displayed per-file row is not evidence of a one-file patch.
- Group manual expansion state never appears in the caller or helper eligibility expression. There is no manual-expansion exception.

## Completed header context

[The turn caller](/tmp/pi-chat-codex-ux-20261016/local-conversation-turn-e5216ce34062.js:5050) conditionally supplies a completed header for the terminal activity presentation when it has the worked-for item. [Group rendering](/tmp/pi-chat-codex-ux-20261016/sites-end-resource-1b9f3ba94deb.js:20855) supplies it only to the last group. [Header rendering](/tmp/pi-chat-codex-ux-20261016/sites-end-resource-1b9f3ba94deb.js:21342) uses it instead of the generic summary label in summary state.

This is a supplied render-group header slot. It does not establish that Pi's separate enclosing AgentActivityHeader is the same concept merely because that header can say “Worked for”.

## Pi applicability notes for the implementing agent

Read against the task's integration worktree at `cbf6ffa`:

- Pi's ActivityItem currently stores status, kind, target/body facts, but no original patch file count. The activity adapter receives the original ActivityOperation and then emits file rows. Preserve original operation provenance when carrying any minimal new eligibility facts.
- The activity contract permits `running`, `completed`, `failed`, `unknown`, and `unattempted`. Treating everything except `running` as proven completion would be broader than the source rule.
- The shared activity contract exposes edit operations with optional path/files. Its supported schema has no visualization activity field.
- No Pi consumer of `preserveSingleItemGroups`, `completedHeader`, or `visualizationActivities` exists in the inspected chat source. Do not add settings or visualization support solely to recreate absent reference inputs. Document the applicability boundary and only claim parity for concepts represented by supported Pi adapters.
- The feature intentionally preserves Pi's independent activity-item and native-output controls. The reference eligibility source verifies which group wrapper may disappear; it does not itself establish preservation of Pi-specific nested disclosure state.

## Checks and limits

Ran read-only Info.plist checks, source inspection of caller/helper/lifecycle/header code, SHA-256 checks for both formatted extracts, and direct ASAR-payload hash checks for both assets. Read Pi's activity types, shared operation schema, relevant source references, and patch adapter locations. No repository files changed and no product tests ran.

Not verified: live Codex interaction, actual runtime feature-flag selection, physical-terminal behavior, or a full Pi lifecycle/projection audit. These notes pin source behavior; they are not evidence that this change has been implemented or verified in Pi.

## Approved Pi mapping and verification scope

The user approved the transition behavior, the existing real-Pi InteractiveMode / AgentSessionRuntime seam, and the single implementation ticket on 2026-10-16. Runtime checks for this delta are limited to the currently installed Pi 1.1.0; the repository dependency files remain unchanged. No physical-terminal or live Codex verification was requested.

Original edit operation status and file-record cardinality must survive per-file projection. Omitted file records, conflated interrupted/unknown outcomes, and historical ownership without summary-state evidence remain conservative exclusions. Empty declared file lists retain their existing zero-item representation. Original Pi file records are not Codex’s path-keyed patch map; do not deduplicate them by rendered paths.

Implementation navigation at baseline cbf6ffa: group projection and focus/anchors in packages/pi-chat/src/native-host.ts (813, 949, 969); item state and native controls (354); state retention (1139); Find ancestor opening (1904); settings reconstruction (3020); global expansion (3083). Existing lifecycle ownership/final evidence is in agent-activity.ts; call outcomes in activity-items.ts; patch flattening in tool-adapters/activity.ts (214). Existing host cases in native-chat.test.ts (468, 559, 696, 849), activity.test.ts, phase-final.test.ts, source-search.test.ts, and bounded-render-groups.test.ts cover the approved behavior without a new test seam. These pointers describe the recorded baseline and are research notes, not a public implementation interface.
