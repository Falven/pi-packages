# 17: pi-skill-references: expand each skill once

**What to build:** Combine several skills in one request without duplicate leading/inline expansion or lost input content.

**Blocked by:** 03: pi-skill-references: invoke canonical inline skills.

**Status:** complete

- [x] Resolve multiple canonical references and add each distinct native skill's instructions once in first-reference order.
- [x] Deduplicate leading and inline references against the real host expansion order, including repeated references to the same resolved resource.
- [x] Preserve surrounding prose and native resource context; do not recursively expand references inside inserted instruction bodies.
- [x] Keep saved draft text unchanged and preserve images, input source, other input transformations, commands, and normal/steer/follow-up delivery.
- [x] Unknown or unreadable references retain native failure behavior alongside successfully resolved skills.
- [x] Assert final submitted instruction blocks and images through the actual public Pi editor/session boundary, not just the extension handler in isolation.

Automated acceptance: integration `a22accf`; formatting, lint, type checks, and 143 public-boundary tests pass. Project terminal acceptance is tracked by [ticket 22](22-compose-and-resume-mixed-requests.md).

Final verification: [shared results](../verification.md).
