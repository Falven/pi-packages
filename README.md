# pi-packages

A collection of extensions for the [pi coding agent](https://pi.dev).

## Packages

| Package                                               | Downloads                                                                                   | Description                                                          |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| [`pi-composer`](packages/pi-composer)                 | ![npm downloads: unpublished](https://img.shields.io/badge/downloads-unpublished-lightgrey) | Edit Markdown with selection, undo/redo, and saved session drafts.   |
| [`pi-attachments`](packages/pi-attachments)           | ![npm downloads: unpublished](https://img.shields.io/badge/downloads-unpublished-lightgrey) | Paste text, files, and images with attachment previews and recovery. |
| [`pi-skill-references`](packages/pi-skill-references) | ![npm downloads: unpublished](https://img.shields.io/badge/downloads-unpublished-lightgrey) | Complete and expand inline skill references.                         |

`pi-attachments` and `pi-skill-references` also work with Pi's native editor.

[`pi-activity`](packages/pi-activity) is the optional data contract for operation progress and output. Tool providers and chat consumers use it independently; it is not installed as a Pi extension.

## Install

Use Node.js 24 or later and Pi and `@earendil-works/pi-tui` 1.x at version 1.0.2 or later. These packages are not published to npm yet. Install them from the repository root, loading `pi-composer` before editor decorators such as `pi-attachments`:

```bash
pi install ./packages/pi-composer
pi install ./packages/pi-attachments
pi install ./packages/pi-skill-references
```

If `pi-paste` is already installed, remove that package entry with `pi remove ./packages/pi-paste` before reloading Pi. `pi-attachments` includes paste handling and keeps existing attachment snapshots and paste recovery files usable.

## Development

See the [specifications](docs/specs/), [architecture decisions](docs/adr/), and [glossary](GLOSSARY.md) for package behavior and design. Each package keeps `node:test` behavior tests in `test/` and supporting hosts and fixtures in `fixtures/`. The root typecheck covers source, TypeScript tests, and TypeScript fixtures across all packages.

```bash
pnpm install --frozen-lockfile --ignore-scripts
pnpm run format:check
pnpm run lint
pnpm run typecheck
pnpm test
```
