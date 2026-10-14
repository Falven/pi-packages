# Deliver goals through the extension ecosystem

`pi-goal` preserves goal authorization, lifecycle, persistence, budgets, accounting, and Stop entirely through the extension ecosystem, without modifying Pi's source or installed files. Pi owns tool validation, result delivery, and error handling; conversions must preserve goal values rather than emulate a different parser or transport. This follows [ADR 0001](0001-preserve-pi-extension-contracts.md); a missing public capability remains explicit and does not authorize a host patch or private adapter.
