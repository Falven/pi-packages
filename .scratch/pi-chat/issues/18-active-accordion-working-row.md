# 18: Thinking row as the active accordion header

**What to build:** Show one thinking row during live work: as the current render group's header while that header is displayed, otherwise below the conversation. Keep its existing operation label, complete thought heading, or `Thinking` fallback. Move render-group and activity-item chevrons immediately after their labels, keeping the loading indicator on the left.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] Render the existing collapsed and expanded chevrons immediately after group and activity-item labels. Keep the native spinner on the left of the live header; preserve the enclosing agent-activity header's existing presentation.
- [ ] While native working status is visible, show exactly one working presentation: in the current displayed group header, otherwise below existing conversation content without a chevron. No duplicate working row remains in the composer or conversation tail.
- [ ] In either destination, preserve label priority: current operation, otherwise the latest complete activity heading, otherwise `Thinking`. A heading can supply the active header after a command completes while its group remains current. Preserve completed-exploration label retention and late updates.
- [ ] Retain the latest complete heading while thought body prose or an incomplete next heading streams and after thinking/message completion. Body prose never supplies the label. Preserve Hide thinking behavior and the existing label lifetime.
- [ ] Follow existing current-activity and visible group boundaries independently of label selection. Tool completion alone does not close a group; a retained completed-read label cannot keep an earlier group current. Hidden or empty thoughts, spacers, and viewport scrolling do not create new group boundaries.
- [ ] Support standalone-to-header, header-to-standalone, and next-group handoffs. Restore earlier retained headers to their aggregate summaries. Preserve singleton omission; when a header is hidden or omitted, use the standalone row without recreating a disclosure.
- [ ] Preserve whole-header keyboard and pointer input, focus styling, reading position, and independent group, item, and native-output choices. Find, copy, and replay retain their existing behavior.
- [ ] Fit the row to one line at its destination, including padding, spinner, and trailing chevron where present. Keep the chevron visible when truncating and recover the full selected label when widened.
- [ ] Keep Pi's native spinner animating through handoffs and editor replacement without a second placement or disposal merely to move it. Restore native placement only while still owned when fullscreen chat releases it. Preserve retry and compaction presentation, final/cancellation/request/session cleanup, and the rule that retained history cannot create live work.
- [ ] Reconcile affected assertions in the existing activity, thought, disclosure, singleton, final-phase, lifecycle, search, and combined-presentation cases. Observe fresh frames, real input, and unchanged provider/session content; add no test cases, test files, fixtures, or seams.
- [ ] Run the affected chat and combined-presentation suites on the installed Pi, typecheck, scoped lint/format, and whitespace checks without changing dependencies. Check spinner handoff in a live terminal separately. Record exact revisions, runtime versions, commands, results, and unavailable acceptance before marking the implementation resolved; earlier verification does not validate this delta.

**Slice:** Keep this as one complete, independently verifiable change to header presentation, including its existing regression checks. The existing grouping, label selector, native host adapter, and recording-terminal seam are sufficient; no prefactor or separate verification ticket is required.

**Completed foundations:** [Chat 15: Current-operation headers](15-current-operation-group-headers.md), [Activity 13: Thought titles](../../tool-activity/issues/13-thought-titles.md), [Chat 16: Enclosing disclosure eligibility](16-enclosing-disclosure-eligibility.md), and [Chat 17: Singleton omission](17-unwrap-eligible-singletons.md) are complete, so they introduce no blocking edges. Preserve their resolved scope and verification evidence.

**Contract:** The existing [chat specification](../../../docs/specs/pi-chat.md) is the canonical spec, including its user stories, implementation decisions, testing decisions, and scope. The [implementation plan](../../../docs/plans/active-accordion-working-row.md) records the inspected code seams. [ADR 0013](../../../docs/adr/0013-transcript-activity-order-and-inline-thoughts.md) and [ADR 0020](../../../docs/adr/0020-render-group-lifecycle-and-singleton-preservation.md) record the corresponding placement amendments without changing grouping or singleton eligibility.

**Scope:** Exactly the two presentation changes above. Preserve group boundaries, singleton eligibility, summaries, label selection, thought-body display, native output, the enclosing activity accordion, execution, and source/history. Add no guides, checkmarks, status dots, labels, settings, dependencies, or persisted state.

**Testing seam:** Retain the existing real Pi runtime and normal extension loading with controlled provider stages, a recording terminal, real input/resize/lifecycle operations, and unchanged provider/session content. Distinguish a duplicated live working row from operation wording legitimately repeated in an expanded item. The plan identifies the affected existing cases and validation commands.

**Publication:** Synthesized from the conversation using to-spec and refined in place with to-tickets on 2026-10-17. Retains the existing ticket identity, single-slice scope, and `ready-for-agent` status. Completed tickets remain closed.

**Verification status:** Specification only. Runtime implementation and verification are pending. The main integration risk is borrowing native status placement across editor replacement and cleanup without duplicating or disposing the spinner. Recording-terminal checks do not establish physical-terminal pixels or input.
