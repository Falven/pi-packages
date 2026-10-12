# pi-skill-references

Complete and invoke configured [Pi](https://pi.dev) skills with ordinary `/skill:name` references in prose.

Use `$` or `/` completion within prose to choose a skill from Pi's effective picker and insert its canonical reference. Inline `/` opens with Tab in the native editor and automatically in `pi-composer`. Native commands, file completion, provider updates, and custom pickers retain their existing contracts. A custom picker can insert canonical reference text through Pi's native text interfaces.

Type, paste, or insert a canonical reference through Pi's native text APIs:

```text
Please apply /skill:review to this change.
```

Submission includes each resolved skill's instructions once, in first-reference order, with its native resource directory. Repeated references and catalog aliases pointing to the same skill file share that instruction block. References remain editable text in the editor and its history. Resolution follows Pi's effective catalog, including resource discovery, precedence, and reloads.

Markdown code, escaped references, link destinations, URLs, paths, and shorthand stay literal. Unknown references keep their text. Read failures use Pi's error reporting and preserve the request for recovery. Leading native commands retain their dispatch and argument handling.

Pi's native editor trims leading whitespace before the input event. Use fenced code for examples at the start of a prompt; first-line indentation alone does not survive that boundary.

See the [specification](../../docs/specs/pi-skill-references.md), its [architecture decisions](../../docs/specs/pi-skill-references.md#architecture-decisions), and the [package overview](../../README.md#packages).

## Install

From the repository root:

```bash
pi install ./packages/pi-skill-references
```
