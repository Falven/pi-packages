# 12: Verify working label parity

**What to build:** Verify the working-label correction together with the existing activity display, and record the delivered behavior and actual limits in the ADRs, specification, and tickets.

**Blocked by:** 11: Working labels from current activity.

**Status:** in progress on `codex/generic-tool-activity`.

- [ ] Existing chat and combined-workflow suites pass against both established Pi host versions.
- [ ] The reference's reasoning-line extraction, current-operation priority, fallback, and confirmed-final suppression match observable native indicator text.
- [ ] Typecheck, lint, formatting, and diff checks pass; operator wording and package independence remain intact.
- [ ] Standards and specification reviews resolve actionable findings and identify any unavailable independent review or physical app check.
- [ ] Documents and tickets record the implementation revision, exact checks, reference pin, and verification limits; task-owned temporary checkouts are removed.

**Reference:** [Working label source record](../../../docs/plans/working-label-parity.md). This verifies the current delta from `bf30b7a`; it does not reopen earlier activity acceptance or claim all desktop features are implemented.
