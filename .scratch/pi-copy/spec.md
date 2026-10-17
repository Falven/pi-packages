# pi-copy

**Status:** resolved. Independent plugins are implemented and verified at `eabaf49`, integrated into local main at `faef6a6`, and explicitly installed as editable Pi packages. [Ticket 04](issues/04-native-pi-decoration.md) records the checks, reviews, installation, cleanup, and verification limits.

**Earlier extraction:** tickets 01 and 02 were verified at `a83094c` and integrated into local `main`. Their three checkouts and branches were removed. [Ticket 02](issues/02-separate-response-copy-footer.md) retains that verification, review limits, and the stale app attachment.

The canonical [pi-copy specification](../../docs/specs/pi-copy.md) contains the accepted problem, solution, user stories, implementation decisions, testing decisions, and scope. This local tracker entry publishes that contract without duplicating it.

## Tickets

1. [Extract chat copy behavior](issues/01-extract-chat-copy-behavior.md) — resolved.
2. [Separate the response copy footer](issues/02-separate-response-copy-footer.md) — resolved after 01.
3. [Install chat and copy independently](issues/03-independent-chat-integration.md) — resolved.
4. [Copy from native Pi without chat](issues/04-native-pi-decoration.md) — resolved after 03.

## Comments

Published on 2026-10-17 from the accepted discussion. The user authorized the documentation, extraction, implementation, integration into main, and cleanup. Preserve completed chat tickets as historical records.

The user subsequently required independent plugins and confirmed that copying must remain available after final responses without losing current functionality. [ADR 0029](../../docs/adr/0029-copy-as-an-independent-extension.md) supersedes the dependent-library decision; tickets 03 and 04 implement that correction.
