# 01: Extract chat copy behavior

**What to build:** Chat installs and uses the new pi-copy dependency for every existing command, output, diff, and response copy control. Users retain identical payloads, placement, navigation, feedback, and cleanup while copy behavior has one package owner.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] All four existing copy controls use the new package, including payload formatting, native output normalization, clipboard writes, feedback, and disposal.
- [ ] Copy has no dependency on chat or its full native host. Chat retains semantic classification, source identity, final recognition, layout, focus, selection, Find, and lifecycle integration through a small interface.
- [ ] Preserve command/output/diff placement, backgrounds, padding, narrow layouts, exact retained payloads, final-part selection, historical identity, and disabled/partial behavior.
- [ ] Preserve pending/success/error handling, status ownership, pointer capture, keyboard navigation, selection exclusion, reading anchors, and disposal during clipboard work.
- [ ] Chat resolves the package through its dependency and exported interface in the workspace and packed artifacts, without a separate extension installation or changed external dependency versions.
- [ ] Reuse existing real-Pi host and combined-workflow checks as the behavior baseline and verify the extraction; complete relevant typecheck, lint, formatting, distribution, and whitespace checks.
- [ ] Record exact commits, checks, results, and limits. Response spacing remains for ticket 02; no extra behavior is introduced here.

**Contract:** [pi-copy specification](../../../docs/specs/pi-copy.md). The current chat and combined-presentation tests are the accepted testing seam. Keep the extraction as one complete slice; splitting classes from their call sites would leave an unusable intermediate state.

## Comments

Published as `ready-for-agent` on 2026-10-17. Existing resolved chat copy tickets establish prior behavior but do not verify this extraction.
