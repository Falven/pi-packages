# Scope terminal integration to Pi's terminal ownership

Terminal shortcut integration is separate from draft editing and may activate only when it can identify Pi's terminal, follow ownership across suspension and external-editor handoffs, and remove only its own changes through reloads and termination. This preserves other panes, user bindings, other integrations, and ordinary terminal behavior without requiring a custom launcher. Activation requires verified runtime capabilities and lifecycle behavior; installed configuration and a running Pi process alone do not establish that guarantee.
