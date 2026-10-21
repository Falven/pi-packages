import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  clampThinkingLevel,
  getSupportedThinkingLevels,
  type ModelThinkingLevel,
} from "@earendil-works/pi-ai";
import {
  getAgentDir,
  getSelectListTheme,
  getSettingsListTheme,
  type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import {
  Input,
  SelectList,
  SettingsList,
  fuzzyFilter,
  getKeybindings,
  truncateToWidth,
} from "@earendil-works/pi-tui";
import { codexPrompt } from "./prompt.ts";

const reasoningLevels = ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const;

function reasoningPreference(value: unknown): ModelThinkingLevel | null {
  if (value === null) return null;
  const level = reasoningLevels.find((candidate) => candidate === value);
  if (!level) throw new Error(`reasoning must be null or one of: ${reasoningLevels.join(", ")}`);
  return level;
}

export type PredictionSettings = {
  enabled: boolean;
  model: { provider: string; id: string } | null;
  reasoning: ModelThinkingLevel | null;
};

export function predictionSettings() {
  const directory = getAgentDir();
  const path = join(directory, "pi-predict.json");
  let current: PredictionSettings = { enabled: true, model: null, reasoning: null };
  try {
    const saved: unknown = JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, ""));
    if (!saved || typeof saved !== "object" || Array.isArray(saved))
      throw new Error("Expected a settings object");
    if ("enabled" in saved) {
      if (typeof saved.enabled !== "boolean") throw new Error("enabled must be true or false");
      current.enabled = saved.enabled;
    }
    if ("model" in saved && saved.model !== null) {
      const model = saved.model;
      if (
        !model ||
        typeof model !== "object" ||
        !("provider" in model) ||
        !("id" in model) ||
        typeof model.provider !== "string" ||
        !model.provider.trim() ||
        typeof model.id !== "string" ||
        !model.id.trim()
      )
        throw new Error("model must be null or an object with a provider and id");
      current.model = { provider: model.provider, id: model.id };
    }
    if ("reasoning" in saved) current.reasoning = reasoningPreference(saved.reasoning);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT")
      throw new Error(`Could not read ${path}: ${String(error)}`, { cause: error });
  }

  function save(value: PredictionSettings) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const temporary = join(directory, `.pi-predict-${randomUUID()}.tmp`);
    try {
      writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, {
        flag: "wx",
        mode: 0o600,
        flush: true,
      });
      renameSync(temporary, path);
      current = value;
    } finally {
      rmSync(temporary, { force: true });
    }
  }
  const modelLabel = () =>
    current.model ? `${current.model.provider}/${current.model.id}` : "Current Pi model";
  return {
    get value() {
      return current;
    },
    show(ctx: ExtensionContext, signal: AbortSignal, changed: () => void): Promise<void> {
      return ctx.ui.custom<void>(
        (tui, theme, _keys, done) => {
          const close = () => done();
          signal.addEventListener("abort", close, { once: true });
          let search: Input | undefined;
          let focused = false;
          const models = ctx.modelRegistry.getAvailable();
          const selectedModel = () =>
            current.model
              ? ctx.modelRegistry.find(current.model.provider, current.model.id)
              : ctx.model;
          const reasoningLevel = (preference = current.reasoning) => {
            const requested = preference ?? codexPrompt.reasoning ?? ctx.thinkingLevel ?? "off";
            const model = selectedModel();
            return model ? clampThinkingLevel(model, requested) : requested;
          };
          const reasoningLabel = () =>
            current.reasoning === null ? `Default (${reasoningLevel()})` : reasoningLevel();
          const choices = [
            {
              value: "Current Pi model",
              label: "Current Pi model",
              description: "Follow the conversation's model",
            },
            ...models.map((model) => ({
              value: `${model.provider}/${model.id}`,
              label: `${model.provider}/${model.id}`,
              description: model.name,
            })),
          ];
          const list = new SettingsList(
            [
              {
                id: "enabled",
                label: "Suggested follow-ups",
                description:
                  "Make one background prediction after a completed response. Uses the selected provider's normal quota and pricing.",
                currentValue: current.enabled ? "On" : "Off",
                values: ["On", "Off"],
              },
              {
                id: "model",
                label: "Prediction model",
                currentValue: modelLabel(),
                description:
                  "Uses Pi's configured providers and credentials. The conversation's model stays unchanged.",
                submenu: (selected, finish) => {
                  const input = new Input({ placeholder: "Search models…" });
                  search = input;
                  input.focused = focused;
                  const filtered = (query: string) => {
                    const result = new SelectList(
                      fuzzyFilter(choices, query, (item) => `${item.label} ${item.description}`),
                      10,
                      getSelectListTheme(),
                    );
                    result.onSelect = (item) => finish(item.value);
                    result.onCancel = () => finish();
                    return result;
                  };
                  let select = filtered("");
                  select.setSelectedIndex(
                    Math.max(
                      0,
                      choices.findIndex((item) => item.value === selected),
                    ),
                  );
                  return {
                    render(width) {
                      return [...input.render(width), "", ...select.render(width)];
                    },
                    invalidate() {
                      input.invalidate();
                      select.invalidate();
                    },
                    handleInput(data) {
                      const keys = getKeybindings();
                      if (
                        (
                          [
                            "tui.select.up",
                            "tui.select.down",
                            "tui.select.confirm",
                            "tui.select.cancel",
                          ] as const
                        ).some((key) => keys.matches(data, key))
                      )
                        select.handleInput(data);
                      else {
                        const previous = input.getValue();
                        input.handleInput(data);
                        if (input.getValue() !== previous) select = filtered(input.getValue());
                      }
                    },
                    handleMouse(event) {
                      if (event.y === 0) return input.handleMouse(event);
                      return event.y < 2
                        ? undefined
                        : select.handleMouse({ ...event, y: event.y - 2 });
                    },
                  };
                },
              },
              {
                id: "reasoning",
                label: "Reasoning effort",
                description:
                  "Defaults to the Codex reference. Pi adjusts the effort to the prediction model's supported levels.",
                currentValue: reasoningLabel(),
                submenu: (_selected, finish) => {
                  const model = selectedModel();
                  const levels = [
                    { value: "default", label: `Default (${reasoningLevel(null)})` },
                    ...(model ? getSupportedThinkingLevels(model) : []).map((level) => ({
                      value: level,
                      label: level,
                    })),
                  ];
                  const select = new SelectList(levels, 8, getSelectListTheme());
                  const selected = current.reasoning === null ? "default" : reasoningLevel();
                  select.setSelectedIndex(
                    Math.max(
                      0,
                      levels.findIndex((item) => item.value === selected),
                    ),
                  );
                  select.onSelect = (item) => finish(item.value);
                  select.onCancel = () => finish();
                  return select;
                },
              },
            ],
            3,
            getSettingsListTheme(),
            (id, value) => {
              try {
                if (id === "enabled") save({ ...current, enabled: value === "On" });
                else if (id === "model") {
                  const model = models.find((item) => `${item.provider}/${item.id}` === value);
                  if (!model && value !== "Current Pi model")
                    throw new Error("The selected model is unavailable");
                  save({
                    ...current,
                    model: model ? { provider: model.provider, id: model.id } : null,
                  });
                } else if (id === "reasoning")
                  save({
                    ...current,
                    reasoning: reasoningPreference(value === "default" ? null : value),
                  });
                changed();
              } catch (error) {
                ctx.ui.notify(`Could not save follow-up settings: ${String(error)}`, "error");
              }
              list.updateValue("enabled", current.enabled ? "On" : "Off");
              list.updateValue("model", modelLabel());
              list.updateValue("reasoning", reasoningLabel());
            },
            close,
          );
          return {
            get focused() {
              return focused;
            },
            set focused(value: boolean) {
              focused = value;
              if (search) search.focused = value;
            },
            render(width) {
              return [
                truncateToWidth(theme.fg("accent", "Follow-up settings"), width),
                ...list.render(width),
              ];
            },
            handleInput(data) {
              list.handleInput(data);
              tui.requestRender();
            },
            handleMouse(event) {
              return list.handleMouse({ ...event, y: event.y - 1 });
            },
            invalidate() {
              list.invalidate();
            },
            dispose() {
              signal.removeEventListener("abort", close);
            },
          };
        },
        { overlay: true },
      );
    },
  };
}
