# pi-copy

Copy controls for `pi-chat`: Copy command, Copy output, Copy diff, and Copy response. Chat includes this library as a dependency; no separate Pi extension or installation step is required.

Controls copy the owning command, edit, or final response from its current retained source. They preserve original Markdown, whitespace, native panel placement, configured keyboard navigation, and pointer behavior. Empty payloads do not replace the clipboard. Successful writes show Copied briefly; failures and partial retained output use Pi's status display. Disposing controls prevents late writes from updating a replaced view.

Chat supplies current source data, theme and padding, render/status callbacks, and input integration. It retains final-response recognition, activity classification, source identity, layout, focus, selection, Find, and extension lifecycle. Copy reuses Pi's native clipboard transport and TUI; it does not attach to stock Pi independently.

See the [specification](../../docs/specs/pi-copy.md), [package ownership decision](../../docs/adr/0026-copy-actions-in-a-dependent-package.md), and [source fidelity decision](../../docs/adr/0027-copy-retained-source-and-separate-presentation.md). Behavior is exercised through the existing real-Pi chat and combined-workflow tests.
