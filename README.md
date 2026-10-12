# pi-packages

A collection of extensions for the [pi coding agent](https://pi.dev).

## Packages

These packages are under development. Each has a loadable extension entry point, a specification, and tests through Pi's public host boundary. Real Ghostty/macOS acceptance remains pending.

| Package                                                       | Responsibility                                                             |
| ------------------------------------------------------------- | -------------------------------------------------------------------------- |
| [pi-composer](packages/pi-composer/README.md)                 | Markdown editing, selection, undo/redo, and session drafts.                |
| [pi-paste](packages/pi-paste/README.md)                       | Paste classification, inline/attachment decisions, and explicit overrides. |
| [pi-attachments](packages/pi-attachments/README.md)           | Attachment snapshots, previews, restoration, retention, and delivery.      |
| [pi-skill-references](packages/pi-skill-references/README.md) | Inline skill completion and canonical skill expansion.                     |

Paste, attachment, and skill-reference functionality is designed for Pi's native editor as well as `pi-composer`. See the [shared architecture](docs/architecture.md), [specifications](docs/specs/), [ADRs](docs/adr/), and [glossary](GLOSSARY.md).

## Load local packages

Use Node.js 24 or later. The four-package setup requires Pi and `pi-tui` 1.x at version 1.0.2 or later. Load `pi-composer` before editor decorators; paste and attachment extensions support either order. From the repository root:

```bash
pi install ./packages/pi-composer
pi install ./packages/pi-paste
pi install ./packages/pi-attachments
pi install ./packages/pi-skill-references
```

Each package README links to its specification and ADRs.

## Development

```bash
pnpm install --frozen-lockfile --ignore-scripts
pnpm run format:check
pnpm run lint
pnpm run typecheck
pnpm exec tsc --noEmit -p packages/pi-composer/tsconfig.json
pnpm test
```
