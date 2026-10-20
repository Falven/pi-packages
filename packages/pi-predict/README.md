<h1 align="center">pi-predict</h1>

<p align="center">Predict your next message inside the composer. Press Tab to make it a draft.</p>

<p align="center">
  <a href="#install">Install</a> ·
  <a href="#use-a-prediction">Use a prediction</a> ·
  <a href="#settings">Settings</a> ·
  <a href="#context-and-prompt">Context and prompt</a>
</p>

**Preview: the exact Codex prompt is still missing.** Generation reports this missing prerequisite without calling a model. The composer adapter and request path have been exercised with a controlled provider and a synthetic instruction. Capture the verified reference in [src/prompt.ts](src/prompt.ts) before using or releasing this package.

![Faint suggested text inside Pi's empty composer](screenshots/suggestion.png)

## Install

Requires Node.js 24+ and Pi/TUI 1.1.0+ (1.x). From the repository root:

```bash
pi install ./packages/pi-predict
```

Run `/reload` in an open Pi session.

Works with vanilla Pi and [pi-composer](../pi-composer) in regular and fullscreen modes. Install in either order; suggestions follow later composer replacements automatically. No other package from this repository is required. Compatibility is verified against Pi/TUI 1.1.0; later Pi releases may require an extension update.

## Use a prediction

After a successful response, one suggested next message can appear as faint text in the empty composer.

| Action             | Result                                                                                   |
| ------------------ | ---------------------------------------------------------------------------------------- |
| **Tab**            | Insert the visible suggestion as an ordinary, editable draft.                            |
| **Escape**         | Dismiss it for that response.                                                            |
| Start typing       | Hide it while keeping your own text. Clearing the draft reveals the retained suggestion. |
| **Undo** after Tab | Remove the insertion through the active composer's normal undo action.                   |

Acceptance never submits the message. Press your usual Send key when the draft is ready. Suggestions stay out of draft recovery and conversation history until accepted and submitted. Completion menus and dialogs keep their normal keyboard behavior.

Long suggestions show a shortened, single-line preview; Tab inserts the whole message, including line breaks. No prediction is generated after an aborted or failed response. Failed predictions report an error and are not retried automatically.

Other composers can work through the same adapter when they follow Pi's focused-editor, cursor-marker, and insertion conventions. A composer that cannot be decorated stays selected and receives a compatibility notice.

## Settings

Run `/predict` to open Pi's native settings controls.

![Prediction model selected in Pi's native settings controls](screenshots/settings.png)

- **Suggested follow-ups:** turn background predictions on or off.
- **Prediction model:** inherit the current Pi model, or search available models by provider, ID, or display name. Selecting one leaves the conversation's model unchanged.

Providers and credentials come from Pi. Configure them through Pi's normal model configuration and `/login`. Predictions send the conversation to the selected provider and use that provider's normal quota and pricing.

Preferences live in `pi-predict.json` in Pi's active agent directory, normally `~/.pi/agent/`. Defaults are:

```json
{
  "enabled": true,
  "model": null
}
```

For a separate model, set `model` to `{"provider": "your-provider", "id": "your-model"}`. Manual file edits take effect after `/reload`. A failed save leaves the previous setting active. There is no entry in Pi's central `/settings` menu.

## Context and prompt

Predictions use the complete effective Pi conversation, including instructions, tool declarations, tool results, and images permitted by Pi. The prediction request cannot execute tools. It does not retrieve extra files or app content, shorten history to fit a smaller model, or substitute a different model on failure.

The Codex reference prompt belongs in [src/prompt.ts](src/prompt.ts), together with its version, capture date, hash, and configured reasoning effort. The installed Codex app fetches this prompt from an authenticated service; its source and published documentation do not include the text. No replacement prompt is bundled. Once the verified prompt is captured, running this extension requires only Pi and the chosen provider.

The images above show actual Pi rendering with a controlled provider response. See the [specification](../../docs/specs/pi-predict.md) for context capture, compatibility, and verification limits.
