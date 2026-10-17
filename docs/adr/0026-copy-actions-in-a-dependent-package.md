# Copy actions belong to a dependent package

**Status:** superseded by [ADR 0028](0028-copy-as-an-independent-extension.md). The original extraction below records its historical scope; the user subsequently required independent plugins without an installation dependency.

`pi-copy` owns the existing command, output, diff, and final-response copy behavior, and `pi-chat` depends on it. Chat supplies authoritative activity and final-response context and mounts the controls through a small interface; copy does not import chat or receive its complete native host. This separates copy maintenance while preserving one owner of chat layout, source identity, navigation, selection, and lifecycle.

## Consequences

Existing chat installations retain copying through the package dependency. `pi-copy` is a library consumed by chat, with no separately loaded extension, second host adapter, or installation-order requirement. Independent use with stock Pi would require another rendering integration and is outside this extraction. This refines [ADR 0018](0018-one-transcript-extension-lifecycle.md) without dividing chat's extension lifecycle.
