# Preserve Pi extension contracts

Every package consumes Pi's current public services and effective overrides, preserving native dispatch, provider composition, and the single active replacement editor. Pi owns terminal input decoding, keyboard protocol negotiation, keybinding configuration, hardware-cursor visibility, and hyperlink capability detection; Pi or the terminal activates links through the system's default handler, and the terminal owns cursor appearance. Packages honor these supplied services and settings so independently replaceable extensions preserve the user's native preferences.

## Consequences

The version-specific runtime adapter in [ADR 0022](0022-native-rows-in-an-owned-transcript.md) is a scoped exception for `pi-chat` to acquire native rows and own chat composition, selection, and search. It preserves Pi's source files and the input, terminal, and editor ownership above; it does not authorize private integration in other packages.
