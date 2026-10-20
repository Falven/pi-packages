# pi-packages

A collection of extensions for the [pi coding agent](https://pi.dev).

## Packages

| Package                                               | Downloads                                                                                   | Description                                                                      |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| [`pi-composer`](packages/pi-composer)                 | ![npm downloads: unpublished](https://img.shields.io/badge/downloads-unpublished-lightgrey) | Edit Markdown with selection, undo/redo, and saved session drafts.               |
| [`pi-predict`](packages/pi-predict)                   | ![npm downloads: unpublished](https://img.shields.io/badge/downloads-unpublished-lightgrey) | Predict the next message inside the composer. Preview; reference prompt pending. |
| [`pi-attachments`](packages/pi-attachments)           | ![npm downloads: unpublished](https://img.shields.io/badge/downloads-unpublished-lightgrey) | Paste text, files, and images with attachment previews and recovery.             |
| [`pi-quote`](packages/pi-quote)                       | ![npm downloads: unpublished](https://img.shields.io/badge/downloads-unpublished-lightgrey) | Quote highlighted conversation text into the current draft.                      |
| [`pi-skill-references`](packages/pi-skill-references) | ![npm downloads: unpublished](https://img.shields.io/badge/downloads-unpublished-lightgrey) | Complete and expand inline skill references.                                     |
| [`pi-chat`](packages/pi-chat)                         | ![npm downloads: unpublished](https://img.shields.io/badge/downloads-unpublished-lightgrey) | Group native chat activity and search retained source.                           |
| [`pi-copy`](packages/pi-copy)                         | ![npm downloads: unpublished](https://img.shields.io/badge/downloads-unpublished-lightgrey) | Copy commands, retained output, diffs, and final responses.                      |

`pi-attachments` and `pi-skill-references` also work with Pi's native editor.

`pi-predict` supports native Pi and `pi-composer` in either order, follows later composer replacements, and has no dependency on another package here. Its exact Codex reference prompt remains a release prerequisite; see its README for the current preview status.

`pi-copy` adds controls to native Pi boxes and after final responses. `pi-chat` and `pi-copy` are independently installed plugins. Install both for chat presentation with the same copy controls; either load order works.

Tool providers and chat consumers can independently implement the [generic activity format](docs/specs/tool-activity.md) using Pi events and result details.

## Install

Use Node.js 24 or later and Pi and `@earendil-works/pi-tui` 1.x at version 1.1.0 or later. These packages are not published to npm yet. Install them from the repository root, loading `pi-composer` before `pi-attachments`:

```bash
pi install ./packages/pi-composer
pi install ./packages/pi-predict
pi install ./packages/pi-attachments
pi install ./packages/pi-quote
pi install ./packages/pi-skill-references
pi install ./packages/pi-chat
pi install ./packages/pi-copy
```

Local package paths load the source directly, so these installations remain editable. Installing chat does not install copy, and installing copy does not install chat. Use `/reload` in a running Pi session after changing installed extensions.

If `pi-paste` is already installed, remove that package entry with `pi remove ./packages/pi-paste` before reloading Pi. `pi-attachments` includes paste handling and keeps existing attachment snapshots and paste recovery files usable.

## Development

See the [specifications](docs/specs/), [architecture decisions](docs/adr/), and [glossary](GLOSSARY.md) for package behavior and design. Package `node:test` behavior tests live in `test/`, with supporting hosts and fixtures in `fixtures/`. The root typecheck covers source, TypeScript tests, and TypeScript fixtures across all packages.

```bash
pnpm install --frozen-lockfile --ignore-scripts
pnpm run prepare
pnpm run format:check
pnpm run lint
pnpm run typecheck
pnpm test
```

`pnpm run prepare` installs Lefthook's Git hooks after the install above skips lifecycle scripts. Installs that enable lifecycle scripts run it automatically. Before a commit, Oxlint fixes staged JavaScript and TypeScript files, then Oxfmt formats supported staged files; both stage their fixes. Before a push, the hooks check lint and formatting on changed files without modifying them. Lint warnings fail these checks and `pnpm run lint`.
