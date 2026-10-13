# 01: Make the native-host fixture independent of companion extensions

**What to build:** Exercise real Pi sessions with explicitly selected extensions, controlled provider and tool activity, and fresh terminal frames, while existing package tests retain their current behavior.

**Blocked by:** None (can start immediately).

**Status:** done

- [x] Reuse the real InteractiveMode and AgentSessionRuntime fixture; the neutral host loads no companion extension implicitly.
- [x] Preserve existing composer-fixture callers with their established defaults and behavior.
- [x] Allow explicit extension paths/factories and native tool selection; retain real provider parsing and tool execution.
- [x] Provide fresh complete frames and raw terminal output so visibility checks do not inspect cumulative old output.
- [x] Support staged provider activity and lifecycle settings only as needed by the native-host scenarios; add no product service or published fixture package.
- [x] Verify a native session with no companion extension, an explicitly loaded extension, and affected existing fixture callers through the agreed host seam.
