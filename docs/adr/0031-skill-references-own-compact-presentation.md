---
status: accepted
---

# Skill references own compact invocation presentation

`pi-skill-references` owns skill interpretation, reference-only user-message presentation, and temporary reveal of recorded instructions for a selected Find match, independently of `pi-chat`. Pi's public Markdown hook runs after native leading-skill detection and cannot remove the separate purple skill row, so permit a narrow, reversible, instance-scoped native rendering adapter inside the skill package. This scoped exception to [ADR 0001](0001-preserve-pi-extension-contracts.md) avoids changing Pi's installation, rewriting stored or model-facing content, or making skill behavior depend on a chat extension.

## Consequences

- Keep eager invocation, recorded messages, provider requests, HTML exports, and machine-readable outputs unchanged. Project compact terminal presentation from retained content for both new and historical messages; reconstruct canonical references when original command text is unavailable. Find reveals only the selected skill occurrence's saved instructions and restores compact presentation when inspection leaves that occurrence.
- Keep skill-specific rules and the adapter inside the skill package. An active transcript may supply generic source-selection and presentation coordination through the existing optional in-process pattern, following [ADR 0029](0029-copy-as-an-independent-extension.md). Neither extension imports or requires the other, and chat retains layout, selection, and search ownership. Do not add a shared runtime framework, second transcript, or persistent presentation data.
- Prefer public services, check necessary native capabilities, keep hooks scoped to the owning host, and restore only hooks still owned by the adapter. Leave no persistent global patches or active callbacks after disposal. If integration cannot attach safely, release partial hooks, report the limitation, and preserve native presentation and invocation.

This accepts the adapter's scope and ownership, not the compatibility of a particular private method. Prove normal delivery, early history reconstruction, reload, optional-extension load orders, source Find, and cleanup through the approved real Pi editor/session seam before claiming implementation support. Private host behavior remains a compatibility risk across Pi releases.
