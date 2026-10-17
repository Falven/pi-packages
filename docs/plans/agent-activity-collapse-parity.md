# Enclosing agent activity collapse parity

The ordinary local conversation policy, existing real-Pi native-host seam, and one combined implementation ticket are approved. The user's follow-up limits verification to installed Pi **1.1.0**. This record fixes the reference and implementation scope; approval is not implementation or verification evidence.

## Baseline and protected work

Starting local main: `cbf6ffac013f10b6b2a227804d076a4556bd248d`. Preserve the separate spacing identities introduced by `40dcdd1` and checked by `3b08a9a`. The existing untracked comparison report is excluded from task commits and formatting; its starting SHA-256 is `5e309230c0dda894020498e75ddd9aa03765b4ca44d2d15e10a916045a3148ed`.

Other copy, singleton, and working-label worktrees are concurrent work, not task-owned cleanup targets. Recheck main, worktrees, and the local ticket numbers before publication and landing. Never rewrite shared main or push without a separate request.

## Pinned source evidence

Inspected application: `/Applications/ChatGPT.app`, bundle `com.openai.codex`, version **26.1013.31256**, build **20586**. The installed archive and supplied reference manifest match. No live desktop interaction established these facts.

| Asset                                       | Original SHA-256                                                   |
| ------------------------------------------- | ------------------------------------------------------------------ |
| `sites-end-resource-1b9f3ba94deb.js`        | `a3955c507c2bba1d3c1957b24abd9e55388f733ff6e3cd613afa3cbe4a441b4c` |
| `local-conversation-turn-e5216ce34062.js`   | `e72d61f0567d235ca93e62d8f9fea347e1f303778747be61ca3ca7ae8d0d74c7` |
| `app-initial-3ccf4886957f.js`               | `d6278b4127345cf6012fe969eea9f5a2d55a13225d1fcadc23db81ef5bab78fe` |
| `local-conversation-thread-5ec41ebdd09b.js` | `e203868a18600a77a62ec38aa908de2fe7f4719f6b5c3c2c356eceda04b95479` |
| `mcp-tool-item-content-179ee16f038b.js`     | `bfa31cfcb00798df084c1b8bdc9ba2082b621f131a4560b72d81595174bd97d7` |

The formatted files and manifest were available under `/tmp/pi-chat-codex-ux-20261016`. They are temporary evidence, not runtime dependencies. Useful locations:

- Collapse decision: `sites-end-resource`, lines 22588–22599. Eligibility precedes forced expansion, preference, and automatic default. Ordinary eligibility requires final-start evidence, no cancellation, and renderable activity.
- Header availability: the same asset, lines 22724–22790 and 22905–22909. Ineligibility removes the toggle and leaves activity visible; it does not merely draw an expanded but closable header.
- Mode inputs: `local-conversation-turn`, lines 5070–5091. Activity-only mode can allow collapse before a final; full-transcript, embedded/voice, and specialized Work views have other force/disable inputs. Those modes are outside this target.
- Final predicate: `app-initial`, lines 183669–183686. Final phase, non-async delivery, no asynchronous user-input marker, and nonblank content **or completion or structured output** establish final start. The stricter completed-answer predicate is a different decision.
- Completion-only path: `app-initial`, lines 131939–131994, 186446–186464, and 152275–152330. The app tracks item completion separately from text; a completed blank final can qualify without nonblank displayed prose.
- Preference retention: `sites-end-resource`, lines 22636–22659; `local-conversation-thread`, lines 16595–16601 and 16988–17041. The same turn retains its preference through temporary ineligibility. No disk-persistence or restart guarantee is inferred.
- Inspection: `app-initial`, lines 417595–417616; `sites-end-resource`, lines 9677–9679; `mcp-tool-item-content`, lines 2658–2672. Explicit tool inspection prevents the automatic default, below an eligible manual enclosing choice. Ordinary scrolling, selection, and header focus are separate.
- Find: `local-conversation-thread`, lines 19476–19490 and 19111–19131. Reveal explicitly opens the containing turn. It is not a permanent forced-open mode.

## Approved Pi mapping

Use exact provider-item/normalized-content association. Nonblank final text qualifies immediately; a blank final qualifies only with explicitly observed item status `completed`. Raw Responses completion status is Pi's analogous fact, not the reference app-server protocol. A done event name, response completion, or message error is insufficient. Pi has no separate app-level structured-output or asynchronous user-input message objects; do not invent them. Ordinary JSON text is already text.

Ineligible enclosing activity is revealed and has no header or enclosing control. Retain its memory-only choice for requalification. While eligible, explicit preference wins over the default and the existing child-inspection hold. Find records an open choice even while the header is unavailable; later eligible closure still works. Global actions affect eligible parents and descendants, without creating or overwriting an unavailable parent's preference. Preserve descendant choices when a parent disappears.

Keep the existing no-phase settlement fallback. Valid partial finals survive non-cancellation failures; actual cancellation removes eligibility. An abort after agent-end but before settlement can establish cancellation; an idle abort after successful settlement does not retroactively change that outcome. Unknown history remains visible in source order.

The existing settled final references can retain completed blank selections. Phase-only history without enough qualification evidence stays visible. No relationship schema or persistent preference change is planned. This supersedes the independent-manual-closure policy in ADR 0015 and Chat 07's `9f57ab9` revision; their earlier completion evidence remains historical.

## Implementation scope and ownership

One implementer owns runtime and corresponding regression coverage in its worktree. The coordinator owns ADR/spec/ticket documentation; a merger agent integrates the implementer. Standards and specification reviews run independently against the pinned base.

| Boundary                 | Files and responsibilities                                                                                                                                                                    |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Activity policy          | `packages/pi-chat/src/agent-activity.ts`: qualification, cancellation, expansion precedence, retained preference, settlement/replay                                                           |
| Provider evidence        | `packages/pi-chat/src/provider-phase.ts`: exact completion evidence using existing slot and native-signature association                                                                      |
| Composition and controls | `packages/pi-chat/src/native-host.ts`: remove revoked-header path, preserve an exact zero-row final boundary/native notices, Find choice, shared control eligibility, existing focus recovery |
| Existing storage         | `packages/pi-chat/src/relationships.ts`: inspect and preserve the schema and memory-only preference rule                                                                                      |
| Behavioral seam          | `fixtures/native-host.ts`, existing phase-final, agent-activity, and source-search cases; reuse the host and avoid tests of private state                                                     |

Do not merely remove composition's final-row guard: it also prevents collapse across an unidentified native notice or missing historical member relationship. A completed blank final needs its exact source boundary even though Pi renders no text child. Keep native error/truncation notices and source order. Preserve `beforeSpacing`, `afterSpacing`, and `beforeFinalSpacing` identities and the collapsed-boundary regression.

No singleton-group change, label, preview, bounded-scrolling change, thought-presentation change, message menu, setting, dependency, Pi-source edit, or new primary test seam belongs to this delta. Existing glossary terms and ADR 0017 suffice.

## Verification and landing

The baseline focused suite passed 38/38 on installed Pi 1.1.0 before runtime changes. An earlier 38/38 run used repository dependencies at 1.0.2; it is baseline context only, not delta compatibility evidence. Installed native package links in task worktrees resolve to one physical 1.1.0 installation. Repository dependency declarations remain unchanged.

Use red-before-green host assertions for cancellation and revocation first, then one behavioral slice at a time. The agreed commands are:

```sh
node --test packages/pi-chat/test/phase-final.test.ts packages/pi-chat/test/agent-activity.test.ts
node --test --test-concurrency=2 packages/pi-chat/test/*.test.ts packages/pi-codex-tools/test/workflow-presentation.test.ts
./node_modules/.bin/tsc --noEmit -p tsconfig.json
./node_modules/.bin/oxlint .
git ls-files -z | xargs -0 ./node_modules/.bin/oxfmt --check
git diff --check
```

Check changed/new files before staging as well. Preserve the unrelated untracked comparison report. No secondary compatibility run is required. Assert fresh terminal frames, effective input, original provider requests, and canonical session content. This seam proves emitted output and native-host behavior, not physical-terminal or desktop pixel parity.

After reviews, reconcile any main advances in the isolated integration worktree, verify the resulting delta, then fast-forward local main. Record actual code SHA, commands/results, review outcomes, and limits when closing the ticket. Archive every task-owned managed worktree and remove task branches only after verifying integration; preserve all other work and do not push.

## Completion record

Local main received code `f53480f9b4d1ad3b4a0b7bc924a597b9a44e20d5` by fast-forward from `df856004eb9677d070498329ecdb5acd9da51793`. The initial main remains `cbf6ffac013f10b6b2a227804d076a4556bd248d`. Concurrent current-operation, copy-action, image-crop test, and copy-verification changes were preserved. The later copy-closure documentation at `3741f50` was also preserved. No push was made.

The implementer committed `860230919ae84e329043648a08517ee9bf52f834`; the merger integrated it and reconciled the shared specification, ADR 0022, and phase-revocation assertions. New stories use 148–154, preserving concurrent stories 121–147. The final implementation range comparison adds only concurrent Copy response absence assertions. Runtime changes stayed in the three planned modules; no fixture, relationship schema, glossary, dependency, installed Pi source, or scrolling identity change was needed.

Executed and independently reviewed integration: `d5c4f15d0cfb7ef5522a93096c9ff5c60287d334`. It passed the 147/147 chat and combined-workflow suite, typecheck, repository lint, formatting of all 423 tracked files, and full task whitespace checks on installed Pi 1.1.0 with Node `v26.8.1`. Earlier focused implementation checks passed 44/44 lifecycle and 27/27 Find cases. The final rebase changed only copy-verification documentation; an exact diff confirmed identical runtime, tests, fixtures, and configuration at landed `f53480f`. Formatting and whitespace checks covered the reconciled documents. Evidence-only closure changes require formatting/whitespace checks, not another runtime suite.

Independent Standards review found zero actionable findings and no smell warranting a change. Independent Spec review found zero actionable findings or apparent scope creep. Both compared against the original pinned base and the task-only delta after identifying concurrent changes. Reviewers were read-only; the coordinator ran the integrated checks. No physical-terminal, live desktop, secondary Pi-version, or full repository test run is claimed.

### Task ownership and cleanup

| Branch                                  | Managed checkout                                                           | Preserved head                             | Result                                                  |
| --------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------- |
| `codex/pi-chat-collapse-parity`         | `/Users/fran/.codex/worktrees/pi-chat-collapse-parity/pi-packages`         | `f53480f9b4d1ad3b4a0b7bc924a597b9a44e20d5` | Integrated, checkout and branch removed.                |
| `codex/pi-chat-collapse-implementation` | `/Users/fran/.codex/worktrees/pi-chat-collapse-implementation/pi-packages` | `860230919ae84e329043648a08517ee9bf52f834` | Patch integration checked, checkout and branch removed. |

No compatibility or review checkout was created. Both checkouts were clean except disposable ignored dependency links. Tests, reports, and logs were already outside them. The managed archive tool returned `queued` for each checkout (including an implementation retry), but subsequent artifact and Git inventory checks still showed both present. A verified complete-history Git bundle at `/tmp/pi-chat-collapse-worktrees.bundle` preserves both branch heads; its SHA-256 is `e30d1376c2edc3143205eb7de0bde263b6c408340ff9924180abda82c01d4451`. After confirming main ancestry and the original-to-integrated patch mapping, Git removed only these two clean worktrees and branches. Their otherwise-empty wrapper directories and zero-byte name markers were removed. Final inventory confirms no task-owned branch or checkout remains. This records a Git-bundle fallback, not a successful managed app archive.

All other worktrees and branches were left to their owners. In particular, this task did not remove the pre-existing copy worktrees; their owner's concurrent cleanup is recorded in Chat 12. The untracked comparison report remains excluded from commits/formatting with its original SHA-256.

### Local evidence

- `/tmp/pi-chat-collapse-red-eligibility.log`: two expected cancellation/revocation failures before runtime changes.
- `/tmp/pi-chat-collapse-red-blank-final.log`, `/tmp/pi-chat-collapse-red-find.log`, and `/tmp/pi-chat-collapse-blank-boundary.log`: subsequent behavioral failures fixed before final checks.
- `/tmp/pi-chat-collapse-implementation-focused.log`, `/tmp/pi-chat-collapse-implementation-find.log`: 44/44 and 27/27 passing implementation checks.
- `/tmp/pi-chat-collapse-integrated-tests.log`: 147/147 passing integrated cases, zero failures/cancellations/skips.
- `/tmp/pi-chat-collapse-integrated-typecheck.log`, `/tmp/pi-chat-collapse-integrated-lint.log`, `/tmp/pi-chat-collapse-integrated-format.log`: integrated static results.
- `/tmp/pi-chat-collapse-parity-installed-pi-dependencies.json`, `/tmp/pi-chat-collapse-installed-resolution.log`: coherent installed Pi 1.1.0 resolution.
- `/tmp/pi-chat-collapse-review-report.md`, `/tmp/pi-chat-collapse-final-range-diff.log`: separate review axes and rebased patch comparison.
- `/tmp/pi-chat-collapse-task.json`: baseline, approvals, task ownership, revisions, checks, and cleanup ledger.

These temporary evidence files may expire; the commands, results, revision boundaries, policy, and cleanup outcome are retained in the specification, ticket, and this record.
