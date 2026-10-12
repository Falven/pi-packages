# pi-packages

A collection of extensions for the [pi coding agent](https://pi.dev).

## Packages

These packages are unpublished scaffolds. Each has a loadable extension entry point and a specification; feature behavior is not implemented yet.

| Package                                                       | Responsibility                                                             |
| ------------------------------------------------------------- | -------------------------------------------------------------------------- |
| [pi-composer](packages/pi-composer/README.md)                 | Markdown editing, selection, undo/redo, and session drafts.                |
| [pi-paste](packages/pi-paste/README.md)                       | Paste classification, inline/attachment decisions, and explicit overrides. |
| [pi-attachments](packages/pi-attachments/README.md)           | Attachment snapshots, previews, restoration, retention, and delivery.      |
| [pi-skill-references](packages/pi-skill-references/README.md) | Inline skill completion and canonical skill expansion.                     |

Paste, attachment, and skill-reference functionality is designed for Pi's native editor as well as `pi-composer`. See the [shared architecture](docs/architecture.md), [specifications](docs/specs/), [ADRs](docs/adr/), and [glossary](GLOSSARY.md).

## Load local scaffolds

From the repository root, install the packages you want to work on:

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
pnpm test
```
