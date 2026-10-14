# 03: Yield and resume execution cells

**What to build:** Let JavaScript execution yield output while it continues, then use `functions.wait` to collect new output, completion, or termination. Keep explicit stored values available across executions in the same extension session.

**Specification:** [Core toolset](../spec.md).

**Blocked by:** 01 — Execute a command through the complete model loop.

**Status:** ready-for-agent

- [ ] First prove through public APIs that an execution cell can continue after the initial result and that subsequent nested calls retain context, hook processing, cancellation, native events, and attribution. Report a demonstrated API blocker without private integration or Pi source changes.
- [ ] Expose the captured `functions.wait` declaration, schema, defaults, and string cell identifier in the actual provider request. Preserve the distinction from numeric command-process identifiers.
- [ ] Implement the execution pragma's yield behavior, explicit `yield_control`, incremental waiting, final completion, and explicit termination against the fixed baseline.
- [ ] Deliver only newly accumulated output after each yield, preserve output order and limits, retain the identifier while the cell is running, and close it on completion.
- [ ] Complete the selected helper behavior: text, notifications, successful early exit, timers, and serializable store/load. A missing stored key returns `undefined`; timers alone do not keep an execution alive.
- [ ] Keep fresh JavaScript globals for each execution, with no direct Node, filesystem, network, or console APIs. Do not misrepresent this as operating-system isolation.
- [ ] Restrict callable tools and their metadata listing to the selected operations actually available under Pi's active policy. Preserve public dispatch even when scripts coordinate independent calls.
- [ ] Verify immediate notifications and work that emits before and after the initial yield, including a later nested command and a hook-modified result. Never resurrect discarded backend content.
- [ ] Verify failed scripts, invalid/stale cells, repeated waiting, and termination while work is pending. Distinguish declared behavior from cases still requiring baseline measurement.
- [ ] Preserve live cells and stored values across ordinary prompts, and clear them with the agreed native session lifecycle while keeping file effects and retained history.
- [ ] Demonstrate the complete behavior through the existing host seam using short commands and controlled asynchronous scripts, without requiring the interactive-process slice.
