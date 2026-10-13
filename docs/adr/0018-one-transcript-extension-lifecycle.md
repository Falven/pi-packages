# One extension owns chat presentation

`pi-chat`, planned at `packages/pi-chat`, keeps occurrence indexing, grouping, folds, inline thoughts, search, and reveal coordination in internal modules under one extension lifecycle because they need consistent source identity and presentation state. It owns the main chat surface alongside the composer; a transcript is a separate history-reading overlay. Message actions remain a separate package, while terminal capabilities, themes, clipboard access, and rendering reuse [Pi's native contracts](0012-transcript-preserves-native-content.md).

## Consequences

Scope is visual presentation. Model verbosity, reasoning effort, model selection, and other model controls remain outside this package. Planning and todo workflows, subagent workflows, and pending-question/answer workflows also remain outside it; their existing native integrations must remain usable.
