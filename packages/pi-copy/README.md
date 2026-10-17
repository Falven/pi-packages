# pi-copy

Copy command, Copy output, Copy diff, and Copy response for Pi. This is an independently installed plugin. It decorates native command/edit boxes and adds a control after the completed final assistant response. It also supplies the existing copy controls when `pi-chat` presents the conversation.

One blank display row separates the final response from Copy response. Existing separation is reused, and copied text keeps its original whitespace.

From the repository root:

```bash
pi install ./packages/pi-copy
```

To also use chat presentation, install it separately:

```bash
pi install ./packages/pi-chat
```

Neither plugin depends on or installs the other. Both load orders work. Local paths are editable installations; `/reload` applies changes in a running Pi session.

Controls copy the owning command, edit, or final response from its current retained source. They preserve original Markdown, whitespace, native panel placement, configured keyboard navigation, and pointer behavior. Empty payloads do not replace the clipboard. Successful writes show Copied briefly; failures and partial retained output use Pi's status display. Disposing controls prevents late writes from updating a replaced view.

Click a control to copy its owning source. `Alt+G` focuses a nearby control in native Pi; configured selector keys move between enabled controls, confirm copying, or return to the editor. With chat installed, controls participate in chat's existing disclosure navigation. Native selection and message copying remain available, and controls stay out of selected text and Find results.

Native mode uses Pi's existing assistant and built-in bash/edit/write components. Chat supplies its authoritative activity items and selected final-response parts through an optional Pi event agreement, preserving operation-level copying, final recognition, grouping, and source Find. Copy owns panel decoration, payloads, clipboard work, feedback, and cleanup. It restores its native component hooks on reload, session replacement, or shutdown.

See the [specification](../../docs/specs/pi-copy.md), [independent extension decision](../../docs/adr/0028-copy-as-an-independent-extension.md), and [source fidelity decision](../../docs/adr/0027-copy-retained-source-and-separate-presentation.md). Behavior is verified against Pi/TUI 1.1.0 through the existing real-Pi chat and combined-workflow checks and native-only probes.
