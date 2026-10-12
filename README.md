# pi-packages

A collection of extensions for the [pi coding agent](https://pi.dev).

## Packages

Each package has a loadable extension entry point, a specification, and tests through Pi's public host boundary. The [composition acceptance ticket](.scratch/prompt-composition/issues/22-compose-and-resume-mixed-requests.md) and [terminal acceptance ticket](.scratch/composer-keybinds/issues/03-verify-keybindings-in-ghostty.md) record automated checks, user-reported keyboard results, and remaining physical checks.

| Package                                                       | Responsibility                                                        |
| ------------------------------------------------------------- | --------------------------------------------------------------------- |
| [pi-composer](packages/pi-composer/README.md)                 | Markdown editing, selection, undo/redo, and session drafts.           |
| [pi-attachments](packages/pi-attachments/README.md)           | Paste policy, attachment snapshots, previews, recovery, and delivery. |
| [pi-skill-references](packages/pi-skill-references/README.md) | Inline skill completion and canonical skill expansion.                |

Paste, attachment, and skill-reference functionality works with Pi's native editor as well as `pi-composer`. The [specifications](docs/specs/) define package behavior, the root [ADR sequence](docs/adr/) records shared decisions, and the [glossary](GLOSSARY.md) defines domain terms. Work and acceptance status live in individual [composition](.scratch/prompt-composition/issues/), [native editing](.scratch/composer-keyboard/issues/), [terminal setup](.scratch/composer-keybinds/issues/), [attachment capture](.scratch/attachment-paste/issues/), and [native clipboard](.scratch/clipboard-paste/issues/) tickets.

## Load local packages

Use Node.js 24 or later. The three-package setup requires Pi and `pi-tui` 1.x at version 1.0.2 or later. Load `pi-composer` before editor decorators such as `pi-attachments`. From the repository root:

```bash
pi install ./packages/pi-composer
pi install ./packages/pi-attachments
pi install ./packages/pi-skill-references
```

If `pi-paste` is already installed, remove that package entry with `pi remove ./packages/pi-paste` before reloading Pi. `pi-attachments` includes paste handling and keeps existing attachment snapshots and paste recovery files usable.

Each package README links to its specification and ADRs.

## Development

Each package keeps behavior tests in `test/` and supporting hosts and fixtures in `fixtures/`. Tests use `node:test` and Pi's public editor/session APIs. The root typecheck covers source, TypeScript tests, and TypeScript fixtures across all packages.

```bash
pnpm install --frozen-lockfile --ignore-scripts
pnpm run format:check
pnpm run lint
pnpm run typecheck
pnpm test
```
