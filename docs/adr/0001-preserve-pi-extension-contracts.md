# Preserve Pi extension contracts

Every package consumes Pi's current public services and effective overrides, preserving native dispatch, provider composition, and the single active replacement editor. Pi owns terminal input decoding, keyboard protocol negotiation, keybinding configuration, hardware-cursor visibility, and hyperlink capability detection; Pi or the terminal activates links through the system's default handler, and the terminal owns cursor appearance. Packages honor these supplied services and settings so independently replaceable extensions preserve the user's native preferences.

## Consequences

Configurable attachment shortcuts depend on public Pi support for named actions and standard-menu configuration. The Attachment thumbnail size preference also belongs in Pi's standard settings menu and requires public upstream settings support. Its Small, Medium, and Large choices use bounds of 12 columns by two rows, 24 columns by four rows, and 48 columns by eight rows. Medium preserves the current default. Aspect ratio is preserved, with Pi's general image width and available terminal space acting as ceilings. Local settings fixes can ship independently while that support is added upstream; the attachment extension will not introduce a separate keybinding configuration system.

Deferred image preparation must follow the effective delivery-time image policy and reject only the affected submission, preserving unrelated active and queued work, retained history, and recovery. It remains a separate milestone until Pi provides a public delivery boundary that supports this isolation; aborting the active run or silently dropping a failed image does not satisfy that contract.

The isolated runtime adapter in [ADR 0022](0022-native-rows-in-an-owned-transcript.md) is a scoped exception for `pi-chat` to acquire native rows and own chat composition, selection, and search. It checks required capabilities rather than Pi's version string. It preserves Pi's source files and the input, terminal, and editor ownership above; it does not authorize private integration in other packages.
