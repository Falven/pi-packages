# 04: Action results without a separate package

**What to build:** Keep the generic activity interface in the two existing extensions. Show command results with their commands, retain raw script results for Find, and present failures once. Returning or forwarding text does not create an Output activity. See the [specification](../../../docs/specs/tool-activity.md).

**Blocked by:** None. This corrects the completed 01–03 baseline.

**Status:** done — correction implemented on `codex/generic-tool-activity`; final combined compatibility and review evidence is recorded with ticket 05.

- [x] The separate contract package and its dependency/release entries are removed; the existing extensions independently implement the documented format.
- [x] Whole results, extracted strings, combined results, literal script text, and old valid output metadata add no routine Output activities.
- [x] Failed work has one activity; additional call failure context remains inspectable without changing successful child outcomes or inferring ownership from text equality.
- [x] Text-only and mixed calls retain searchable processed source, with temporary native disclosure and no re-execution, extra model requests, or altered results.
- [x] Live progress, reload, fork identity, redaction fallback, bounded history, and native image ownership remain covered through the existing real-Pi host.

Earlier tickets retain evidence for their recorded implementation. Their separate-package and nonempty-script-output decisions are superseded by this correction.

**Verification:** 13/13 focused real-Pi cases pass on 1.0.2, covering independent publishers, old output metadata, raw-source Find, redaction, failure context, terminal submissions, both companion load orders, native images, and continuing activity. The earlier focused source-search/standalone run passed 69/69 cases. Typechecking passes. `/tmp/pi-action-ticket04.log`, `/tmp/pi-action-integration.log`, and `/tmp/pi-action-types-final04.log` record these checks. A separate disclosure assertion confirms that Find leaves one command closed and another open. No physical-app acceptance was performed.
