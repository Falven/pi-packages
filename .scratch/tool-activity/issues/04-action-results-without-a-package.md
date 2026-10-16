# 04: Action results without a separate package

**What to build:** Keep the generic activity interface in the two existing extensions. Show command results with their commands, retain raw script results for Find, and present failures once. Returning or forwarding text does not create an Output activity. See the [specification](../../../docs/specs/tool-activity.md).

**Blocked by:** None. This corrects the completed 01–03 baseline.

**Status:** ready-for-agent

- [ ] The separate contract package and its dependency/release entries are removed; the existing extensions independently implement the documented format.
- [ ] Whole results, extracted strings, combined results, literal script text, and old valid output metadata add no routine Output activities.
- [ ] Failed work has one activity; additional call failure context remains inspectable without changing successful child outcomes or inferring ownership from text equality.
- [ ] Text-only and mixed calls retain searchable processed source, with temporary native disclosure and no re-execution, extra model requests, or altered results.
- [ ] Live progress, reload, fork identity, redaction fallback, bounded history, and native image ownership remain covered through the existing real-Pi host.

Earlier tickets retain evidence for their recorded implementation. Their separate-package and nonempty-script-output decisions are superseded by this correction.
