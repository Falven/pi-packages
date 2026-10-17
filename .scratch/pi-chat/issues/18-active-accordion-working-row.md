# 18: Thinking row as the active accordion header

**What to build:** Show one thinking row during live work: as the current render group's header while that header is displayed, otherwise below the conversation. Keep its existing operation label, complete thought heading, or `Thinking` fallback. Move render-group and activity-item chevrons immediately after their labels, keeping the loading indicator on the left.

**Blocked by:** None (can start immediately).

**Status:** resolved

- [x] Render the existing collapsed and expanded chevrons immediately after group and activity-item labels. Keep the native spinner on the left of the live header; preserve the enclosing agent-activity header's existing presentation.
- [x] While native working status is visible, show exactly one working presentation: in the current displayed group header, otherwise below existing conversation content without a chevron. No duplicate working row remains in the composer or conversation tail.
- [x] In either destination, preserve label priority: current operation, otherwise the latest complete activity heading, otherwise `Thinking`. A heading can supply the active header after a command completes while its group remains current. Preserve completed-exploration label retention and late updates.
- [x] Retain the latest complete heading while thought body prose or an incomplete next heading streams and after thinking/message completion. Body prose never supplies the label. Preserve Hide thinking behavior and the existing label lifetime.
- [x] Follow existing current-activity and visible group boundaries independently of label selection. Tool completion alone does not close a group; a retained completed-read label cannot keep an earlier group current. Hidden or empty thoughts, spacers, and viewport scrolling do not create new group boundaries.
- [x] Support standalone-to-header, header-to-standalone, and next-group handoffs. Restore earlier retained headers to their aggregate summaries. Preserve singleton omission; when a header is hidden or omitted, use the standalone row without recreating a disclosure.
- [x] Preserve whole-header keyboard and pointer input, focus styling, reading position, and independent group, item, and native-output choices. Find, copy, and replay retain their existing behavior.
- [x] Fit the row to one line at its destination, including padding, spinner, and trailing chevron where present. Keep the chevron visible when truncating and recover the full selected label when widened.
- [x] Keep Pi's native spinner animating through handoffs and editor replacement without a second placement or disposal merely to move it. Restore native placement only while still owned when fullscreen chat releases it. Preserve retry and compaction presentation, final/cancellation/request/session cleanup, and the rule that retained history cannot create live work.
- [x] Reconcile affected assertions in the existing activity, thought, disclosure, singleton, final-phase, lifecycle, search, and combined-presentation cases. Observe fresh frames, real input, and unchanged provider/session content; add no test cases, test files, fixtures, or seams.
- [x] Run the affected chat and combined-presentation suites on the installed Pi, typecheck, scoped lint/format, and whitespace checks without changing dependencies. Check spinner handoff in a live terminal separately. Record exact revisions, runtime versions, commands, results, and unavailable acceptance before marking the implementation resolved; earlier verification does not validate this delta.

**Slice:** Keep this as one complete, independently verifiable change to header presentation, including its existing regression checks. The existing grouping, label selector, native host adapter, and recording-terminal seam are sufficient; no prefactor or separate verification ticket is required.

**Completed foundations:** [Chat 15: Current-operation headers](15-current-operation-group-headers.md), [Activity 13: Thought titles](../../tool-activity/issues/13-thought-titles.md), [Chat 16: Enclosing disclosure eligibility](16-enclosing-disclosure-eligibility.md), and [Chat 17: Singleton omission](17-unwrap-eligible-singletons.md) are complete, so they introduce no blocking edges. Preserve their resolved scope and verification evidence.

**Contract:** The existing [chat specification](../../../docs/specs/pi-chat.md) is the canonical spec, including its user stories, implementation decisions, testing decisions, and scope. The [implementation plan](../../../docs/plans/active-accordion-working-row.md) records the inspected code seams. [ADR 0013](../../../docs/adr/0013-transcript-activity-order-and-inline-thoughts.md) and [ADR 0020](../../../docs/adr/0020-render-group-lifecycle-and-singleton-preservation.md) record the corresponding placement amendments without changing grouping or singleton eligibility.

**Scope:** Exactly the two presentation changes above. Preserve group boundaries, singleton eligibility, summaries, label selection, thought-body display, native output, the enclosing activity accordion, execution, and source/history. Add no guides, checkmarks, status dots, labels, settings, dependencies, or persisted state.

**Testing seam:** Retain the existing real Pi runtime and normal extension loading with controlled provider stages, a recording terminal, real input/resize/lifecycle operations, and unchanged provider/session content. Distinguish a duplicated live working row from operation wording legitimately repeated in an expanded item. The plan identifies the affected existing cases and validation commands.

**Publication:** Synthesized from the conversation using to-spec and refined in place with to-tickets on 2026-10-17. Retained the existing ticket identity and single-slice scope; `ready-for-agent` was its publication status. Completed tickets remain closed.

**Implemented behavior:** One native working presentation is borrowed into the current displayed group header or placed below the conversation. The existing label selector still chooses the current operation, latest complete thought heading, then `Thinking`. Visible prose moves the row below; hidden or rendered-empty thought bodies do not. Earlier retained headers recover their summaries. A local formatter places group/item chevrons after their labels and keeps them visible at narrow widths. Pi retains spinner creation, animation, and disposal; native placement is restored on mode changes and adapter disposal only while still owned.

**Revisions:** Started from `0408ade17ffc4e04e399bd6c47b888ed00fe9246`. The accepted specification was committed as `30561f4fffc6f7cb2c2ed4996e88addff5bae7ac`; implementation is `1155abd8b5b51cc6dac7c2a66f04156f7db7e910`; the final tested and reviewed code is `5724ea65ac064252173577f7b9fcb0af0919dbf3`. Both implementation commits fast-forwarded into `codex/pi-chat-working-row-integration` without conflicts, with matching implementation/integration trees. Closure edits only update documentation; the code and tests remain identical to the tested revision.

**Verification:** On installed Pi 1.1.0, Pi TUI 1.1.0, Node v26.8.1, and TypeScript 7.0.2, the final combined run passed **147/147**, with zero failures, cancellations, or skips, in 50.290 seconds. The existing staged activity case first reproduced the heading-only handoff defect (0/1), then passed after the fix (1/1). Existing cases now observe exactly one spinner row, operation/heading/fallback labels, incomplete headings and streamed body prose, hidden/visible and heading-only handoffs, next groups, narrow widths, editor replacement, and cancellation cleanup. The combined suite retains disclosure, singleton, input, reading-position, Find/copy, replay, final-phase, and both extension-load-order checks. Provider/session content assertions remain intact.

The final behavior checks ran in the implementation worktree:

```sh
node --test --test-name-pattern='an unrelated provider presents semantic operations and late updates without tool-name mappings' packages/pi-chat/test/activity.test.ts
node --test --test-concurrency=2 packages/pi-chat/test/*.test.ts packages/pi-codex-tools/test/workflow-presentation.test.ts
node_modules/.bin/tsc --noEmit -p tsconfig.json
node_modules/.bin/oxlint packages/pi-chat/src/native-host.ts packages/pi-chat/test/activity.test.ts
node_modules/.bin/oxfmt --check packages/pi-chat/src/native-host.ts packages/pi-chat/test/activity.test.ts
git diff --check
```

All final checks passed. Before the two-file review fix, scoped lint and formatting also passed across all 11 changed TypeScript files. The integration worktree passed formatting for all 10 specification documents and whitespace checks for the full task range. The five closure documents passed formatting and whitespace checks; all 76 local Markdown links resolve. Identical merged code did not require another behavioral run.

**Scope verification:** Runtime changes are confined to `native-host.ts` and a read-only current-activity accessor in `agent-activity.ts`. All test declarations in the nine affected test files and the fixture tree are unchanged. No test case, test file, fixture, seam, setting, dependency, lockfile, or persisted state was added. Working-label selection, heading extraction, event subscriptions, and the singleton eligibility map remain unchanged. Local ignored dependency links used the existing coherent Pi 1.1.0 installation; cached native-package/status files match the globally installed version. No dependency installation or version matrix was introduced. Completed tickets retain their prior evidence.

**Reviews:** The initial Standards review found no hard violations and one duplication judgment call, resolved by the local shared chevron formatter. The initial Spec review found the heading-only thought edge case, reproduced and fixed without changing singleton decisions. Final independent reviews of `5724ea6` report **0 Standards findings** and **0 Spec findings**.

**Evidence:** `/var/folders/z8/66twpw0n05z3dy2dtkn_z8v40000gn/T/pi-chat-working-row-vdax9bqb/` contains the implementation and review-fix reports, focused red/green logs, final combined log (`review-combined-final.log`), both review rounds, merge/tree evidence, installed-runtime hash comparison, and the physical-terminal rejection record. This ticket retains the durable revision, command, and result summary if temporary logs expire.

**Cleanup:** Managed archival completed for `/Users/fran/.codex/worktrees/pi-chat-working-row-implementation/pi-packages`; the app lists it as an archived worktree, and both Git and the filesystem confirm the checkout is gone. Its clean, fully merged `codex/pi-chat-working-row` branch was deleted with `git branch -d`. The integration branch/worktree and external evidence remain available. The original checkout and unrelated comparison report remain untouched.

**Limits:** The computer-use tool denied access to `com.mitchellh.ghostty` for safety reasons, so physical-terminal spinner animation, handoff, and input were not verified. Recording-terminal checks establish emitted frames and native-host behavior, not physical-terminal acceptance. Other Pi versions, the full repository behavioral suite, OS clipboard transport, and live Codex interaction were not checked for this delta. Native status placement remains sensitive to Pi's private host APIs; required methods fail explicitly when absent.
